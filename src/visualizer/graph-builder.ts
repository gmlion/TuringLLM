/** A single event-log envelope as written by src/events.ts. */
export interface EventRecord {
  seq: number;
  ts: string;
  cycle: number;
  frame: string | null;
  type: string;
  [key: string]: unknown;
}

/** A live call stack as written by src/call-stack.ts. */
export interface CallStack {
  nextCounter: number;
  stack: Array<{ returnState: string; frameDir: string }>;
}

/** A frame's lifespan derived from events. Satisfies R5, R21. */
export interface Frame {
  frameDir: string;
  slug: string;
  firstCycle: number;
  lastCycle: number;
  isActive: boolean;
}

/** A graph node ready for Cytoscape. Satisfies R5, R6, R10. */
export interface GraphNode {
  id: string;
  label: string;
  slug: string;
  cycle: number;
  frameDir: string;
}

/** A graph edge. Satisfies R8, R9. */
export interface GraphEdge {
  source: string;
  target: string;
  type: "push" | "pop" | "continuity";
}

export interface Graph {
  nodes: GraphNode[];
  edges: GraphEdge[];
  slugRowOrder: string[];
}

/** Strip "frames/" + "f<digits>-" → bare slug. */
export function parseSlug(frameDir: string): string {
  return frameDir.replace(/^frames\//, "").replace(/^f\d+-/, "");
}

/** Row order for swimlane layout: strategy first, then by first appearance. */
export function computeSlugRowOrder(events: EventRecord[]): string[] {
  const firstSeen = new Map<string, number>();
  for (const e of events) {
    if (e.type !== "cycle_start" || !e.frame) continue;
    const slug = parseSlug(e.frame);
    if (!firstSeen.has(slug)) firstSeen.set(slug, e.cycle);
  }
  const slugs = Array.from(firstSeen.entries())
    .sort((a, b) => a[1] - b[1])
    .map(([slug]) => slug);
  // Strategy always first if present.
  const strategyIdx = slugs.indexOf("strategy");
  if (strategyIdx > 0) {
    slugs.splice(strategyIdx, 1);
    slugs.unshift("strategy");
  }
  return slugs;
}

/** Compute per-frame lifespans from events + live stack. R5 + R21. */
function collectFrames(events: EventRecord[], liveStack: CallStack | null): Frame[] {
  const map = new Map<string, Frame>();
  let latestCycle = 0;
  for (const e of events) {
    if (e.type !== "cycle_start" || !e.frame) continue;
    latestCycle = Math.max(latestCycle, e.cycle);
    const existing = map.get(e.frame);
    if (existing) {
      existing.lastCycle = Math.max(existing.lastCycle, e.cycle);
    } else {
      map.set(e.frame, {
        frameDir: e.frame,
        slug: parseSlug(e.frame),
        firstCycle: e.cycle,
        lastCycle: e.cycle,
        isActive: false,
      });
    }
  }
  const activeDirs = new Set(
    liveStack ? liveStack.stack.map((s) => s.frameDir) : [],
  );
  for (const f of map.values()) {
    if (activeDirs.has(f.frameDir)) {
      f.isActive = true;
      // R21: extend lastCycle to the latest cycle observed.
      f.lastCycle = Math.max(f.lastCycle, latestCycle);
    }
  }
  return Array.from(map.values());
}

/** Build the per-frame (sparse) graph. R5, R10, R20, R21 (edges added in T4). */
export function buildPerFrameGraph(
  events: EventRecord[],
  liveStack: CallStack | null,
): Graph {
  const slugRowOrder = computeSlugRowOrder(events);
  if (events.length === 0) return { nodes: [], edges: [], slugRowOrder };
  const frames = collectFrames(events, liveStack);
  const nodes: GraphNode[] = frames.map((f) => ({
    id: f.frameDir,
    label: `${f.slug} (${f.firstCycle}–${f.lastCycle})`,
    slug: f.slug,
    cycle: f.firstCycle,
    frameDir: f.frameDir,
  }));
  const edges: GraphEdge[] = [];
  for (const e of events) {
    if (e.type === "push") {
      const caller = e.frame as string;
      const child = e.frameDir as string;
      if (caller && child) edges.push({ source: caller, target: child, type: "push" });
    } else if (e.type === "pop") {
      const child = e.frameDir as string;
      const idx = events.indexOf(e);
      let caller: string | null = null;
      for (let i = idx + 1; i < events.length; i++) {
        if (events[i].type === "cycle_start" && events[i].frame) {
          caller = events[i].frame as string;
          break;
        }
      }
      if (child && caller) edges.push({ source: child, target: caller, type: "pop" });
    }
  }
  return { nodes, edges, slugRowOrder };
}

/** Build the per-cycle (dense) graph. R6, R10, R20. Edges added in T6. */
export function buildPerCycleGraph(
  events: EventRecord[],
  _liveStack: CallStack | null,
): Graph {
  const slugRowOrder = computeSlugRowOrder(events);
  if (events.length === 0) return { nodes: [], edges: [], slugRowOrder };
  const nodes: GraphNode[] = [];
  for (const e of events) {
    if (e.type !== "cycle_start" || !e.frame) continue;
    const slug = parseSlug(e.frame);
    nodes.push({
      id: `${e.frame}@${e.cycle}`,
      label: `${slug} #${e.cycle}`,
      slug,
      cycle: e.cycle,
      frameDir: e.frame,
    });
  }
  const edges: GraphEdge[] = [];
  // Continuity: consecutive cycles of the same frame.
  const lastByFrame = new Map<string, number>();
  for (const e of events) {
    if (e.type !== "cycle_start" || !e.frame) continue;
    const prev = lastByFrame.get(e.frame);
    if (prev !== undefined) {
      edges.push({
        source: `${e.frame}@${prev}`,
        target: `${e.frame}@${e.cycle}`,
        type: "continuity",
      });
    }
    lastByFrame.set(e.frame, e.cycle);
  }
  // Push/pop edges connect the LAST cycle_start of the source frame BEFORE the
  // event to the FIRST cycle_start of the target frame AFTER the event.
  // (The event itself fires between two cycle_start emissions; the event's own
  // cycle number does not necessarily map to a node, because cycle_start for
  // that cycle is emitted with the post-stack-op active frame, not the
  // pre-stack-op one.)
  const findLastCycleStartBefore = (beforeIdx: number, ofFrame: string): number | null => {
    for (let i = beforeIdx - 1; i >= 0; i--) {
      if (events[i].type === "cycle_start" && events[i].frame === ofFrame) {
        return events[i].cycle;
      }
    }
    return null;
  };
  const findNextCycleStart = (afterIdx: number, ofFrame?: string): { cycle: number; frame: string } | null => {
    for (let i = afterIdx + 1; i < events.length; i++) {
      const ev = events[i];
      if (ev.type !== "cycle_start" || !ev.frame) continue;
      if (ofFrame !== undefined && ev.frame !== ofFrame) continue;
      return { cycle: ev.cycle, frame: ev.frame };
    }
    return null;
  };
  events.forEach((e, idx) => {
    if (e.type === "push") {
      const caller = e.frame as string;
      const child = e.frameDir as string;
      if (!caller || !child) return;
      const callerLast = findLastCycleStartBefore(idx, caller);
      const childFirst = findNextCycleStart(idx, child);
      if (callerLast !== null && childFirst !== null) {
        edges.push({
          source: `${caller}@${callerLast}`,
          target: `${child}@${childFirst.cycle}`,
          type: "push",
        });
      }
    } else if (e.type === "pop") {
      const child = e.frameDir as string;
      if (!child) return;
      const childLast = findLastCycleStartBefore(idx, child);
      const callerNext = findNextCycleStart(idx);
      if (childLast !== null && callerNext !== null) {
        edges.push({
          source: `${child}@${childLast}`,
          target: `${callerNext.frame}@${callerNext.cycle}`,
          type: "pop",
        });
      }
    }
  });
  return { nodes, edges, slugRowOrder };
}
