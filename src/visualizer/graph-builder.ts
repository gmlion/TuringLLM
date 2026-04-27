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
      // Fallback: if no later cycle_start (e.g. trace ends mid-pop), use
      // the earliest matching push to identify the caller. R8 mandates
      // one pop edge per pop event regardless of trace truncation.
      if (child && !caller) {
        for (const p of events) {
          if (p.type === "push" && p.frameDir === child && p.frame) {
            caller = p.frame as string;
            break;
          }
        }
      }
      if (child && caller) edges.push({ source: child, target: caller, type: "pop" });
    }
  }
  return { nodes, edges, slugRowOrder };
}
