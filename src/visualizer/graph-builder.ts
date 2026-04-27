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
