# Tasks: instance-graph-visualization

> **For executors:** use `kiro-flow:spec-execute` (it wraps
> `superpowers:subagent-driven-development` or `superpowers:executing-plans`).
> Each task below is TDD-shaped — write the failing test first, then minimal
> code, then verify, then commit. Commit messages must reference the task's
> `(satisfies: R#)` tag.
>
> Visualizer-HTML tasks (T8–T13) cannot be unit-tested under `node:test`
> because they touch DOM + Cytoscape. For those, the "test" step is a
> manual browser smoke check with explicit before/after expectations
> against a real instance (`instances/demo4b` is the canonical fixture —
> 63 cycles, 15 child frames, mix of dialogue + evaluate).

## Task index

| #   | Summary                                                            | Satisfies                  |
| --- | ------------------------------------------------------------------ | -------------------------- |
| T1  | Create graph-builder module + `parseSlug` + types                  | R5, R6                     |
| T2  | `computeSlugRowOrder` — strategy first, then first-appearance      | R7                         |
| T3  | `buildPerFrameGraph` — nodes, labels, active frame, empty case     | R5, R10, R20, R21          |
| T4  | `buildPerFrameGraph` — push + pop edges                            | R8                         |
| T5  | `buildPerCycleGraph` — nodes + labels                              | R6, R10                    |
| T6  | `buildPerCycleGraph` — push + pop + continuity edges               | R9                         |
| T7  | `url-router` module — parse + format graph/cycle URLs              | R1, R4, R12, R13, R18, R19 |
| T8  | visualizer.html: Cytoscape CDN + graph/cycle DOM + mode toggle      | R2, R3, R14, R15           |
| T9  | visualizer.html: bootstrap routing + view switching + hide timeline | R1, R4, R16                |
| T10 | visualizer.html: render graph (Cytoscape preset, swimlane, no colour)| R7, R11                    |
| T11 | visualizer.html: node click handler → drill-down navigation         | R12, R13                   |
| T12 | visualizer.html: cycle view URL handling + "← Graph" back link      | R18, R19                   |
| T13 | visualizer.html: auto-refresh integration + empty placeholder       | R17, R20                   |

## Task 1: Create graph-builder module + `parseSlug` + types   (satisfies: R5, R6)

**Files:**
- Create: `src/visualizer/graph-builder.ts`
- Test:   `src/test/visualizer-graph-builder.test.ts`

- [ ] **Step 1: Write the failing test**

    ```ts
    // src/test/visualizer-graph-builder.test.ts
    import { test, describe } from "node:test";
    import { strict as assert } from "node:assert";
    import { parseSlug } from "../visualizer/graph-builder.js";

    describe("parseSlug", () => {
      test("strips frames/ prefix and f<NNN>- counter, returning the slug", () => {
        assert.equal(parseSlug("frames/f000-strategy"), "strategy");
        assert.equal(parseSlug("frames/f001-dialogue"), "dialogue");
        assert.equal(parseSlug("frames/f042-evaluate"), "evaluate");
      });

      test("handles slugs containing hyphens", () => {
        assert.equal(parseSlug("frames/f003-answer-independently"), "answer-independently");
      });
    });
    ```

- [ ] **Step 2: Run test to verify it fails**

    Run: `npm test 2>&1 | grep -E "graph-builder|Cannot find module"`
    Expected: FAIL with `Cannot find module '../visualizer/graph-builder.js'` (or equivalent).

- [ ] **Step 3: Write minimal implementation**

    ```ts
    // src/visualizer/graph-builder.ts

    /** A single event-log envelope as written by src/events.ts. */
    export interface EventRecord {
      seq: number;
      ts: string;
      cycle: number;
      frame: string | null;       // relative frameDir, e.g. "frames/f001-dialogue"
      type: string;
      [key: string]: unknown;     // type-specific fields (target, frameDir, depth, etc.)
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
      cycle: number;        // for click-through routing
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
    ```

- [ ] **Step 4: Run test to verify it passes**

    Run: `npm test 2>&1 | grep -E "parseSlug|# tests|# pass|# fail"`
    Expected: PASS — both `parseSlug` subtests OK; total `# fail 0`.

- [ ] **Step 5: Commit**

    ```bash
    git add src/visualizer/graph-builder.ts src/test/visualizer-graph-builder.test.ts
    git commit -m "feat(visualizer): graph-builder skeleton + parseSlug (satisfies: R5, R6)"
    ```

## Task 2: `computeSlugRowOrder` — strategy first, then first-appearance   (satisfies: R7)

**Files:**
- Modify: `src/visualizer/graph-builder.ts`
- Modify: `src/test/visualizer-graph-builder.test.ts`

- [ ] **Step 1: Write the failing test**

    Append to `src/test/visualizer-graph-builder.test.ts`:

    ```ts
    import { computeSlugRowOrder } from "../visualizer/graph-builder.js";

    describe("computeSlugRowOrder", () => {
      test("strategy is first, then slugs ordered by first cycle of appearance", () => {
        const events = [
          { seq: 1, ts: "", cycle: 1, frame: "frames/f000-strategy", type: "cycle_start" },
          { seq: 2, ts: "", cycle: 2, frame: "frames/f001-dialogue", type: "cycle_start" },
          { seq: 3, ts: "", cycle: 5, frame: "frames/f002-evaluate", type: "cycle_start" },
          { seq: 4, ts: "", cycle: 6, frame: "frames/f001-dialogue", type: "cycle_start" },
        ];
        assert.deepEqual(computeSlugRowOrder(events), ["strategy", "dialogue", "evaluate"]);
      });

      test("returns empty array for empty events", () => {
        assert.deepEqual(computeSlugRowOrder([]), []);
      });

      test("strategy rises to first even when it appears later in event order", () => {
        const events = [
          { seq: 1, ts: "", cycle: 5, frame: "frames/f001-dialogue", type: "cycle_start" },
          { seq: 2, ts: "", cycle: 6, frame: "frames/f000-strategy", type: "cycle_start" },
        ];
        assert.deepEqual(computeSlugRowOrder(events), ["strategy", "dialogue"]);
      });
    });
    ```

- [ ] **Step 2: Run test to verify it fails**

    Run: `npm test 2>&1 | grep -E "computeSlugRowOrder|fail"`
    Expected: FAIL with `Cannot find name 'computeSlugRowOrder'` or `is not a function`.

- [ ] **Step 3: Write minimal implementation**

    Append to `src/visualizer/graph-builder.ts`:

    ```ts
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
    ```

- [ ] **Step 4: Run test to verify it passes**

    Run: `npm test 2>&1 | grep -E "computeSlugRowOrder|# pass|# fail"`
    Expected: PASS — three subtests OK; `# fail 0`.

- [ ] **Step 5: Commit**

    ```bash
    git add src/visualizer/graph-builder.ts src/test/visualizer-graph-builder.test.ts
    git commit -m "feat(visualizer): computeSlugRowOrder for swimlane layout (satisfies: R7)"
    ```

## Task 3: `buildPerFrameGraph` — nodes, labels, active frame, empty case   (satisfies: R5, R10, R20, R21)

**Files:**
- Modify: `src/visualizer/graph-builder.ts`
- Modify: `src/test/visualizer-graph-builder.test.ts`

- [ ] **Step 1: Write the failing test**

    Append:

    ```ts
    import { buildPerFrameGraph } from "../visualizer/graph-builder.js";

    describe("buildPerFrameGraph", () => {
      test("returns empty graph for empty events (R20)", () => {
        assert.deepEqual(
          buildPerFrameGraph([], null),
          { nodes: [], edges: [], slugRowOrder: [] },
        );
      });

      test("one node per frame; label is `slug (first–last)`", () => {
        const events = [
          { seq: 1, ts: "", cycle: 1, frame: "frames/f000-strategy", type: "cycle_start" },
          { seq: 2, ts: "", cycle: 2, frame: "frames/f001-dialogue", type: "cycle_start" },
          { seq: 3, ts: "", cycle: 3, frame: "frames/f001-dialogue", type: "cycle_start" },
          { seq: 4, ts: "", cycle: 4, frame: "frames/f000-strategy", type: "cycle_start" },
        ];
        const g = buildPerFrameGraph(events, null);
        assert.equal(g.nodes.length, 2);
        const strategy = g.nodes.find((n) => n.frameDir === "frames/f000-strategy")!;
        const dialogue = g.nodes.find((n) => n.frameDir === "frames/f001-dialogue")!;
        assert.equal(strategy.label, "strategy (1–4)");
        assert.equal(dialogue.label, "dialogue (2–3)");
        assert.equal(strategy.cycle, 1); // first cycle for click-through routing
        assert.equal(dialogue.cycle, 2);
      });

      test("active frame's lastCycle is the latest event cycle (R21)", () => {
        const events = [
          { seq: 1, ts: "", cycle: 1, frame: "frames/f000-strategy", type: "cycle_start" },
          { seq: 2, ts: "", cycle: 2, frame: "frames/f001-dialogue", type: "cycle_start" },
          { seq: 3, ts: "", cycle: 3, frame: "frames/f001-dialogue", type: "cycle_start" },
        ];
        // f001 still on the live stack
        const liveStack = {
          nextCounter: 2,
          stack: [
            { returnState: "<root>", frameDir: "frames/f000-strategy" },
            { returnState: "active", frameDir: "frames/f001-dialogue" },
          ],
        };
        const g = buildPerFrameGraph(events, liveStack);
        const dialogue = g.nodes.find((n) => n.frameDir === "frames/f001-dialogue")!;
        // active dialogue's lastCycle is max(events.cycle) = 3 (also its actual last cycle_start)
        assert.equal(dialogue.label, "dialogue (2–3)");
      });
    });
    ```

- [ ] **Step 2: Run test to verify it fails**

    Run: `npm test 2>&1 | grep -E "buildPerFrameGraph|# fail"`
    Expected: FAIL — `buildPerFrameGraph is not a function` or import error.

- [ ] **Step 3: Write minimal implementation**

    Append:

    ```ts
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
      return { nodes, edges: [], slugRowOrder };
    }
    ```

- [ ] **Step 4: Run test to verify it passes**

    Run: `npm test 2>&1 | grep -E "buildPerFrameGraph|# pass|# fail"`
    Expected: PASS — three subtests OK; `# fail 0`.

- [ ] **Step 5: Commit**

    ```bash
    git add src/visualizer/graph-builder.ts src/test/visualizer-graph-builder.test.ts
    git commit -m "feat(visualizer): buildPerFrameGraph nodes/labels + active-frame handling (satisfies: R5, R10, R20, R21)"
    ```

## Task 4: `buildPerFrameGraph` — push + pop edges   (satisfies: R8)

**Files:**
- Modify: `src/visualizer/graph-builder.ts`
- Modify: `src/test/visualizer-graph-builder.test.ts`

- [ ] **Step 1: Write the failing test**

    Append:

    ```ts
    describe("buildPerFrameGraph edges (R8)", () => {
      test("one push edge and one pop edge per push/pop pair", () => {
        const events: EventRecord[] = [
          { seq: 1, ts: "", cycle: 1, frame: "frames/f000-strategy", type: "cycle_start" },
          { seq: 2, ts: "", cycle: 1, frame: "frames/f000-strategy", type: "push", target: "operators/dialogue.md", frameDir: "frames/f001-dialogue", depth: 1 },
          { seq: 3, ts: "", cycle: 2, frame: "frames/f001-dialogue", type: "cycle_start" },
          { seq: 4, ts: "", cycle: 2, frame: "frames/f001-dialogue", type: "pop", frameDir: "frames/f001-dialogue", returnState: "active_completed", depth: 0 },
          { seq: 5, ts: "", cycle: 3, frame: "frames/f000-strategy", type: "cycle_start" },
        ];
        const g = buildPerFrameGraph(events, null);
        const push = g.edges.filter((e) => e.type === "push");
        const pop = g.edges.filter((e) => e.type === "pop");
        assert.equal(push.length, 1);
        assert.equal(pop.length, 1);
        assert.deepEqual(push[0], { source: "frames/f000-strategy", target: "frames/f001-dialogue", type: "push" });
        assert.deepEqual(pop[0], { source: "frames/f001-dialogue", target: "frames/f000-strategy", type: "pop" });
      });

      test("multiple pushes from the same caller produce parallel edges", () => {
        const events: EventRecord[] = [
          { seq: 1, ts: "", cycle: 1, frame: "frames/f000-strategy", type: "cycle_start" },
          { seq: 2, ts: "", cycle: 1, frame: "frames/f000-strategy", type: "push", target: "operators/dialogue.md", frameDir: "frames/f001-dialogue", depth: 1 },
          { seq: 3, ts: "", cycle: 2, frame: "frames/f001-dialogue", type: "pop", frameDir: "frames/f001-dialogue", returnState: "x", depth: 0 },
          { seq: 4, ts: "", cycle: 3, frame: "frames/f000-strategy", type: "push", target: "operators/dialogue.md", frameDir: "frames/f002-dialogue", depth: 1 },
          { seq: 5, ts: "", cycle: 4, frame: "frames/f002-dialogue", type: "pop", frameDir: "frames/f002-dialogue", returnState: "y", depth: 0 },
        ];
        const g = buildPerFrameGraph(events, null);
        assert.equal(g.edges.filter((e) => e.type === "push").length, 2);
        assert.equal(g.edges.filter((e) => e.type === "pop").length, 2);
      });
    });
    ```

- [ ] **Step 2: Run test to verify it fails**

    Run: `npm test 2>&1 | grep -E "buildPerFrameGraph edges|# fail"`
    Expected: FAIL — `expected push.length to equal 1, got 0` (edges array is empty).

- [ ] **Step 3: Write minimal implementation**

    In `buildPerFrameGraph` (replace the line `return { nodes, edges: [], slugRowOrder };`):

    ```ts
      const edges: GraphEdge[] = [];
      for (const e of events) {
        if (e.type === "push") {
          const caller = e.frame as string;
          const child = e.frameDir as string;
          if (caller && child) edges.push({ source: caller, target: child, type: "push" });
        } else if (e.type === "pop") {
          const child = e.frameDir as string;
          // The pop event's envelope frame is the child frame; the caller is whatever frame
          // the next cycle_start event reports.
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
    ```

- [ ] **Step 4: Run test to verify it passes**

    Run: `npm test 2>&1 | grep -E "buildPerFrameGraph edges|# pass|# fail"`
    Expected: PASS — both edge subtests OK; `# fail 0`.

- [ ] **Step 5: Commit**

    ```bash
    git add src/visualizer/graph-builder.ts src/test/visualizer-graph-builder.test.ts
    git commit -m "feat(visualizer): per-frame push/pop edges (satisfies: R8)"
    ```

## Task 5: `buildPerCycleGraph` — nodes + labels   (satisfies: R6, R10)

**Files:**
- Modify: `src/visualizer/graph-builder.ts`
- Modify: `src/test/visualizer-graph-builder.test.ts`

- [ ] **Step 1: Write the failing test**

    Append:

    ```ts
    import { buildPerCycleGraph } from "../visualizer/graph-builder.js";

    describe("buildPerCycleGraph (R6, R10)", () => {
      test("one node per cycle_start; label is `slug #N`", () => {
        const events: EventRecord[] = [
          { seq: 1, ts: "", cycle: 1, frame: "frames/f000-strategy", type: "cycle_start" },
          { seq: 2, ts: "", cycle: 2, frame: "frames/f001-dialogue", type: "cycle_start" },
          { seq: 3, ts: "", cycle: 3, frame: "frames/f001-dialogue", type: "cycle_start" },
        ];
        const g = buildPerCycleGraph(events, null);
        assert.equal(g.nodes.length, 3);
        assert.equal(g.nodes[0].id, "frames/f000-strategy@1");
        assert.equal(g.nodes[0].label, "strategy #1");
        assert.equal(g.nodes[1].id, "frames/f001-dialogue@2");
        assert.equal(g.nodes[1].label, "dialogue #2");
        assert.equal(g.nodes[2].label, "dialogue #3");
      });

      test("returns empty graph for empty events (R20)", () => {
        assert.deepEqual(
          buildPerCycleGraph([], null),
          { nodes: [], edges: [], slugRowOrder: [] },
        );
      });
    });
    ```

- [ ] **Step 2: Run test to verify it fails**

    Run: `npm test 2>&1 | grep -E "buildPerCycleGraph|# fail"`
    Expected: FAIL — `Cannot find name 'buildPerCycleGraph'` / import error.

- [ ] **Step 3: Write minimal implementation**

    Append to `src/visualizer/graph-builder.ts`:

    ```ts
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
      return { nodes, edges: [], slugRowOrder };
    }
    ```

- [ ] **Step 4: Run test to verify it passes**

    Run: `npm test 2>&1 | grep -E "buildPerCycleGraph|# pass|# fail"`
    Expected: PASS — both subtests OK; `# fail 0`.

- [ ] **Step 5: Commit**

    ```bash
    git add src/visualizer/graph-builder.ts src/test/visualizer-graph-builder.test.ts
    git commit -m "feat(visualizer): buildPerCycleGraph nodes/labels (satisfies: R6, R10)"
    ```

## Task 6: `buildPerCycleGraph` — push + pop + continuity edges   (satisfies: R9)

**Files:**
- Modify: `src/visualizer/graph-builder.ts`
- Modify: `src/test/visualizer-graph-builder.test.ts`

- [ ] **Step 1: Write the failing test**

    Append:

    ```ts
    describe("buildPerCycleGraph edges (R9)", () => {
      test("continuity edge between consecutive cycles of the same frame", () => {
        const events: EventRecord[] = [
          { seq: 1, ts: "", cycle: 1, frame: "frames/f000-strategy", type: "cycle_start" },
          { seq: 2, ts: "", cycle: 2, frame: "frames/f000-strategy", type: "cycle_start" },
          { seq: 3, ts: "", cycle: 3, frame: "frames/f000-strategy", type: "cycle_start" },
        ];
        const g = buildPerCycleGraph(events, null);
        const cont = g.edges.filter((e) => e.type === "continuity");
        assert.equal(cont.length, 2);
        assert.deepEqual(cont[0], { source: "frames/f000-strategy@1", target: "frames/f000-strategy@2", type: "continuity" });
        assert.deepEqual(cont[1], { source: "frames/f000-strategy@2", target: "frames/f000-strategy@3", type: "continuity" });
      });

      test("push edge connects caller@push_cycle to child@first_cycle_of_child", () => {
        const events: EventRecord[] = [
          { seq: 1, ts: "", cycle: 1, frame: "frames/f000-strategy", type: "cycle_start" },
          { seq: 2, ts: "", cycle: 1, frame: "frames/f000-strategy", type: "push", target: "operators/dialogue.md", frameDir: "frames/f001-dialogue", depth: 1 },
          { seq: 3, ts: "", cycle: 2, frame: "frames/f001-dialogue", type: "cycle_start" },
          { seq: 4, ts: "", cycle: 2, frame: "frames/f001-dialogue", type: "pop", frameDir: "frames/f001-dialogue", returnState: "x", depth: 0 },
          { seq: 5, ts: "", cycle: 3, frame: "frames/f000-strategy", type: "cycle_start" },
        ];
        const g = buildPerCycleGraph(events, null);
        const pushE = g.edges.filter((e) => e.type === "push");
        const popE = g.edges.filter((e) => e.type === "pop");
        assert.equal(pushE.length, 1);
        assert.deepEqual(pushE[0], { source: "frames/f000-strategy@1", target: "frames/f001-dialogue@2", type: "push" });
        assert.equal(popE.length, 1);
        assert.deepEqual(popE[0], { source: "frames/f001-dialogue@2", target: "frames/f000-strategy@3", type: "pop" });
      });
    });
    ```

- [ ] **Step 2: Run test to verify it fails**

    Run: `npm test 2>&1 | grep -E "buildPerCycleGraph edges|# fail"`
    Expected: FAIL — `expected cont.length to equal 2, got 0`.

- [ ] **Step 3: Write minimal implementation**

    Replace the per-cycle return inside `buildPerCycleGraph` (the line `return { nodes, edges: [], slugRowOrder };`):

    ```ts
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
      // Push/pop: connect the cycle the event fired in to the next cycle_start of
      // the relevant other frame.
      const findNextCycleStart = (afterIdx: number, ofFrame: string): number | null => {
        for (let i = afterIdx + 1; i < events.length; i++) {
          if (events[i].type === "cycle_start" && events[i].frame === ofFrame) {
            return events[i].cycle;
          }
        }
        return null;
      };
      events.forEach((e, idx) => {
        if (e.type === "push") {
          const caller = e.frame as string;
          const child = e.frameDir as string;
          if (!caller || !child) return;
          const childFirst = findNextCycleStart(idx, child);
          if (childFirst !== null) {
            edges.push({
              source: `${caller}@${e.cycle}`,
              target: `${child}@${childFirst}`,
              type: "push",
            });
          }
        } else if (e.type === "pop") {
          const child = e.frameDir as string;
          const childCycle = e.cycle;
          // Caller = next cycle_start frame after this pop.
          let caller: string | null = null;
          let callerCycle: number | null = null;
          for (let i = idx + 1; i < events.length; i++) {
            if (events[i].type === "cycle_start" && events[i].frame) {
              caller = events[i].frame as string;
              callerCycle = events[i].cycle;
              break;
            }
          }
          if (child && caller && callerCycle !== null) {
            edges.push({
              source: `${child}@${childCycle}`,
              target: `${caller}@${callerCycle}`,
              type: "pop",
            });
          }
        }
      });
      return { nodes, edges, slugRowOrder };
    ```

- [ ] **Step 4: Run test to verify it passes**

    Run: `npm test 2>&1 | grep -E "buildPerCycleGraph edges|# pass|# fail"`
    Expected: PASS — both subtests OK; `# fail 0`.

- [ ] **Step 5: Commit**

    ```bash
    git add src/visualizer/graph-builder.ts src/test/visualizer-graph-builder.test.ts
    git commit -m "feat(visualizer): per-cycle push/pop/continuity edges (satisfies: R9)"
    ```

## Task 7: `url-router` module — parse + format graph/cycle URLs   (satisfies: R1, R4, R12, R13, R18, R19)

**Files:**
- Create: `src/visualizer/url-router.ts`
- Create: `src/test/visualizer-url-router.test.ts`

- [ ] **Step 1: Write the failing test**

    ```ts
    // src/test/visualizer-url-router.test.ts
    import { test, describe } from "node:test";
    import { strict as assert } from "node:assert";
    import { parseRoute, formatRoute, type Route } from "../visualizer/url-router.js";

    describe("url-router", () => {
      test("`?instance=X` → graph view, per-frame mode (R1, R4)", () => {
        const r = parseRoute("?instance=instances/demo4b");
        assert.deepEqual(r, { kind: "graph", instance: "instances/demo4b", mode: "frame" });
      });

      test("`?instance=X&mode=cycle` → graph view, per-cycle mode", () => {
        const r = parseRoute("?instance=instances/demo4b&mode=cycle");
        assert.deepEqual(r, { kind: "graph", instance: "instances/demo4b", mode: "cycle" });
      });

      test("`?instance=X&cycle=N` → cycle drill-down view (R13, R19)", () => {
        const r = parseRoute("?instance=instances/demo4b&cycle=42");
        assert.deepEqual(r, { kind: "cycle", instance: "instances/demo4b", cycle: 42, frame: null });
      });

      test("`?instance=X&cycle=N&frame=F` → cycle view with explicit frame (R12, R19)", () => {
        const r = parseRoute("?instance=instances/demo4b&cycle=12&frame=frames/f001-dialogue");
        assert.deepEqual(r, { kind: "cycle", instance: "instances/demo4b", cycle: 12, frame: "frames/f001-dialogue" });
      });

      test("`?` (no instance) → home", () => {
        const r = parseRoute("");
        assert.deepEqual(r, { kind: "home" });
      });

      test("formatRoute round-trips (R19)", () => {
        const cases: Route[] = [
          { kind: "home" },
          { kind: "graph", instance: "instances/demo4b", mode: "frame" },
          { kind: "graph", instance: "instances/demo4b", mode: "cycle" },
          { kind: "cycle", instance: "instances/demo4b", cycle: 7, frame: null },
          { kind: "cycle", instance: "instances/demo4b", cycle: 7, frame: "frames/f001-dialogue" },
        ];
        for (const r of cases) {
          assert.deepEqual(parseRoute(formatRoute(r)), r);
        }
      });

      test("backToGraph strips cycle/frame (R18)", () => {
        const cycleRoute: Route = { kind: "cycle", instance: "instances/demo4b", cycle: 7, frame: "frames/f001-dialogue" };
        const formatted = formatRoute({ kind: "graph", instance: cycleRoute.instance, mode: "frame" });
        assert.equal(formatted, "?instance=instances/demo4b");
      });
    });
    ```

- [ ] **Step 2: Run test to verify it fails**

    Run: `npm test 2>&1 | grep -E "url-router|# fail"`
    Expected: FAIL — `Cannot find module '../visualizer/url-router.js'`.

- [ ] **Step 3: Write minimal implementation**

    ```ts
    // src/visualizer/url-router.ts

    export type Route =
      | { kind: "home" }
      | { kind: "graph"; instance: string; mode: "frame" | "cycle" }
      | { kind: "cycle"; instance: string; cycle: number; frame: string | null };

    /** Parse a `window.location.search` string into a Route. */
    export function parseRoute(search: string): Route {
      const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
      const instance = params.get("instance");
      if (!instance) return { kind: "home" };
      const cycleStr = params.get("cycle");
      if (cycleStr !== null) {
        const cycle = parseInt(cycleStr, 10);
        const frame = params.get("frame");
        return { kind: "cycle", instance, cycle, frame: frame ?? null };
      }
      const mode = params.get("mode") === "cycle" ? "cycle" : "frame";
      return { kind: "graph", instance, mode };
    }

    /** Format a Route as the matching `window.location.search` string. */
    export function formatRoute(r: Route): string {
      if (r.kind === "home") return "";
      const p = new URLSearchParams();
      p.set("instance", r.instance);
      if (r.kind === "cycle") {
        p.set("cycle", String(r.cycle));
        if (r.frame) p.set("frame", r.frame);
      } else if (r.mode === "cycle") {
        p.set("mode", "cycle");
      }
      return "?" + p.toString();
    }
    ```

- [ ] **Step 4: Run test to verify it passes**

    Run: `npm test 2>&1 | grep -E "url-router|# pass|# fail"`
    Expected: PASS — all subtests OK; `# fail 0`.

- [ ] **Step 5: Commit**

    ```bash
    git add src/visualizer/url-router.ts src/test/visualizer-url-router.test.ts
    git commit -m "feat(visualizer): URL routing for graph + cycle views (satisfies: R1, R4, R12, R13, R18, R19)"
    ```

## Task 8: visualizer.html — Cytoscape CDN + graph/cycle DOM + mode toggle   (satisfies: R2, R3, R14, R15)

**Files:**
- Modify: `visualizer.html`

- [ ] **Step 1: Write the failing test (manual, before-state snapshot)**

    Run: `PORT=8765 node dist/server.js &` then `curl -s http://localhost:8765/visualizer.html | grep -E "cytoscape|cyGraph|graphView|cycleView|graphModeBtn"`
    Expected: FAIL — no matches (none of those identifiers exist yet).

- [ ] **Step 2: Implement — add CDN + DOM scaffolding**

    In `visualizer.html`:
    1. After the existing `<script src="https://cdn.jsdelivr.net/npm/mermaid@10/...">` line, add:

        ```html
        <script src="https://cdn.jsdelivr.net/npm/cytoscape@3/dist/cytoscape.min.js"></script>
        ```

    2. Inside `#instancePage`, wrap the existing `.grid-3col` in a `<div id="cycleView" hidden>` and add a sibling `<div id="graphView">` *above* it:

        ```html
        <div id="graphView">
          <div id="cyGraph" style="height: calc(100vh - 140px); background: #0d1117; border: 1px solid #30363d; border-radius: 8px;"></div>
          <div id="cyEmpty" hidden style="text-align:center; color:#8b949e; padding: 40px;">Instance has no cycles yet.</div>
        </div>
        <div id="cycleView" hidden>
          <!-- existing .grid-3col moves here unchanged -->
        </div>
        ```

    3. In the `.topbar` div, after the Auto-refresh select, before the existing `<div class="timeline">`, add the mode-toggle button:

        ```html
        <button id="graphModeBtn" onclick="toggleGraphMode()" style="background:#21262d;border:1px solid #30363d;color:#c9d1d9;padding:4px 10px;border-radius:6px;cursor:pointer;font-family:inherit;font-size:0.95em;">Mode: per-frame</button>
        ```

    4. Just before the closing `</body>`, add a `<script type="module">` block that imports the graph-builder + url-router and exposes via `window`:

        ```html
        <script type="module">
          import { parseSlug, computeSlugRowOrder, buildPerFrameGraph, buildPerCycleGraph } from './dist/visualizer/graph-builder.js';
          import { parseRoute, formatRoute } from './dist/visualizer/url-router.js';
          window.GraphBuilder = { parseSlug, computeSlugRowOrder, buildPerFrameGraph, buildPerCycleGraph };
          window.UrlRouter = { parseRoute, formatRoute };
          // Re-trigger bootstrap once the modules are available.
          if (typeof window.bootstrap === 'function') window.bootstrap();
        </script>
        ```

- [ ] **Step 3: Build and run smoke test**

    Run: `npm run build && curl -s http://localhost:8765/visualizer.html | grep -cE "cytoscape|cyGraph|graphView|cycleView|graphModeBtn"`
    Expected: PASS — at least 5 matches.

    Then in browser open `http://localhost:8765/?instance=instances/demo4b` — verify the page loads without JS console errors and the Mode button is visible. (Nothing renders yet inside `#cyGraph` — that's T10. Header remains intact: PROGRAM.md, Interpreter README, Auto-refresh, interval picker — verifying R14.)

- [ ] **Step 4: Commit**

    ```bash
    git add visualizer.html
    git commit -m "feat(visualizer): scaffold graph view DOM, Cytoscape CDN, mode toggle (satisfies: R2, R3, R14, R15)"
    ```

## Task 9: visualizer.html — bootstrap routing + view switching + hide timeline   (satisfies: R1, R4, R16)

**Files:**
- Modify: `visualizer.html`

- [ ] **Step 1: Define expected behavior**

    - `?instance=X` → `#graphView` shown, `#cycleView` hidden, timeline hidden.
    - `?instance=X&cycle=N` → `#cycleView` shown, `#graphView` hidden, timeline hidden in graph view (will appear in cycle view per existing layout).
    - Default mode on first load is per-frame; the toggle button label reads "Mode: per-frame".

- [ ] **Step 2: Verify before-state**

    Open `http://localhost:8765/?instance=instances/demo4b` in browser.
    Expected: FAIL — both `#graphView` and `#cycleView` either both visible or behave incorrectly; the existing timeline still shows even though we're nominally in graph mode.

- [ ] **Step 3: Implement bootstrap + view switching**

    Replace the existing `bootstrap()` function in the inline `<script>` block with:

    ```js
    let currentRoute = null;     // Route object from UrlRouter.parseRoute
    let currentGraphMode = 'frame';

    function bootstrap() {
      if (!window.UrlRouter) return; // module not yet loaded; the module's <script type="module"> will call again
      const route = UrlRouter.parseRoute(window.location.search);
      currentRoute = route;
      const home = document.getElementById('homePage');
      const inst = document.getElementById('instancePage');
      const graph = document.getElementById('graphView');
      const cycle = document.getElementById('cycleView');
      const timeline = document.getElementById('timeline');
      if (route.kind === 'home') {
        currentPage = 'home';
        home.hidden = false;
        inst.hidden = true;
        loadHomeInstances();
        return;
      }
      currentPage = 'instance';
      home.hidden = true;
      inst.hidden = false;
      instanceDir = route.instance;
      document.getElementById('topInstanceName').textContent = instanceDir.replace(/^instances\//, '');
      if (route.kind === 'graph') {
        currentGraphMode = route.mode;
        document.getElementById('graphModeBtn').textContent = 'Mode: per-' + currentGraphMode;
        graph.hidden = false;
        cycle.hidden = true;
        if (timeline) timeline.style.display = 'none'; // R16: hide cycle-dot timeline in graph view
        loadInstanceForGraph();   // T10 will define this; for now stub:
      } else {
        graph.hidden = true;
        cycle.hidden = false;
        if (timeline) timeline.style.display = '';  // restore in cycle view
        // Seed selected cycle/frame so the existing cycle-view code uses them
        selectedCycleNum = route.cycle;
        selectedFrameDir = route.frame;
        loadInstance();   // existing function, drives the 3-column view
      }
    }

    function loadInstanceForGraph() {
      // Stub for T8 commit; T10 implements rendering.
      console.log('[graph view] would render', currentGraphMode, 'graph for', instanceDir);
    }
    ```

- [ ] **Step 4: Build, smoke-test**

    Run: `npm run build`
    Open `http://localhost:8765/?instance=instances/demo4b` — graph view container visible, cycle view hidden, timeline hidden, toggle button shows "Mode: per-frame".
    Open `http://localhost:8765/?instance=instances/demo4b&cycle=10` — cycle view (3-col) visible, graph view hidden, timeline visible.

- [ ] **Step 5: Commit**

    ```bash
    git add visualizer.html
    git commit -m "feat(visualizer): bootstrap routing + graph/cycle view switching + hide timeline in graph (satisfies: R1, R4, R16)"
    ```

## Task 10: visualizer.html — render graph (Cytoscape preset, swimlane, no colour)   (satisfies: R7, R11)

**Files:**
- Modify: `visualizer.html`

- [ ] **Step 1: Define expected behavior**

    For `instances/demo4b` opened at `?instance=instances/demo4b`, the `#cyGraph` container shows a Cytoscape graph with:
    - 3 horizontal rows (slugs: strategy / dialogue / evaluate, top-to-bottom)
    - ~16 nodes laid left-to-right by first-cycle (per-frame mode)
    - All nodes the same neutral colour (R11)
    - Pan + zoom + hover work (R2 — Cytoscape default behaviour)

- [ ] **Step 2: Verify before-state**

    Open `http://localhost:8765/?instance=instances/demo4b` — `#cyGraph` is empty (just the dark background), no nodes drawn.

- [ ] **Step 3: Implement rendering**

    Add inside the inline `<script>`:

    ```js
    let cy = null;       // Cytoscape instance, lazily created

    async function loadInstanceForGraph() {
      const events = await loadEventsRaw();
      const liveStack = await readJson(`${instanceDir}/.call-stack.json`);
      const builder = currentGraphMode === 'frame'
        ? GraphBuilder.buildPerFrameGraph
        : GraphBuilder.buildPerCycleGraph;
      const graph = builder(events, liveStack);
      renderGraph(graph);
      // populate header indicators for graph view
      document.getElementById('topCycles').textContent = events.filter(e => e.type === 'cycle_start').length;
      document.getElementById('topDepth').textContent = liveStack ? liveStack.stack.length : '-';
      // top state = state of the currently-active frame's most recent cycle_end
      const lastCycleEnd = [...events].reverse().find(e => e.type === 'cycle_end');
      document.getElementById('topState').textContent = lastCycleEnd?.state ?? '-';
    }

    async function loadEventsRaw() {
      const text = await readFile(`${instanceDir}/logs/events.jsonl`);
      if (!text) return [];
      return text.trim().split('\n').map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(e => e !== null).sort((a, b) => a.seq - b.seq);
    }

    function renderGraph(graph) {
      const empty = document.getElementById('cyEmpty');
      const cyDiv = document.getElementById('cyGraph');
      if (!graph.nodes.length) {
        empty.hidden = false;
        cyDiv.style.display = 'none';
        return;
      }
      empty.hidden = true;
      cyDiv.style.display = '';
      const ROW_H = 90, COL_W = 60, PAD_X = 40, PAD_Y = 40;
      const rowOf = new Map(graph.slugRowOrder.map((slug, i) => [slug, i]));
      const elements = [
        ...graph.nodes.map(n => ({
          data: { id: n.id, label: n.label, frameDir: n.frameDir, cycle: n.cycle },
          position: { x: PAD_X + n.cycle * COL_W, y: PAD_Y + (rowOf.get(n.slug) ?? 0) * ROW_H },
        })),
        ...graph.edges.map((e, i) => ({ data: { id: `e${i}`, source: e.source, target: e.target, type: e.type } })),
      ];
      if (cy) cy.destroy();
      cy = cytoscape({
        container: document.getElementById('cyGraph'),
        elements,
        layout: { name: 'preset' },
        style: [
          { selector: 'node', style: {
              'background-color': '#21262d',
              'border-width': 1, 'border-color': '#58a6ff',
              'label': 'data(label)',
              'color': '#c9d1d9',
              'font-size': 11,
              'text-valign': 'center', 'text-halign': 'center',
              'shape': 'round-rectangle',
              'width': 'label', 'height': 28,
              'padding': '6px',
            } },
          { selector: 'edge', style: {
              'curve-style': 'bezier',
              'width': 1.5, 'line-color': '#30363d',
              'target-arrow-shape': 'triangle', 'target-arrow-color': '#30363d',
            } },
          { selector: 'edge[type = "pop"]', style: { 'line-style': 'dashed' } },
          { selector: 'edge[type = "continuity"]', style: { 'curve-style': 'straight' } },
        ],
      });
    }
    ```

- [ ] **Step 4: Build + smoke**

    Run: `npm run build`
    Open `http://localhost:8765/?instance=instances/demo4b` — see ~16 nodes in 3 rows (strategy top, dialogue middle, evaluate bottom), arranged left-to-right by cycle. All nodes are the same dark colour with blue border (no green/red/orange status colour — verifying R11). Pan + zoom + hover work via Cytoscape defaults.

- [ ] **Step 5: Commit**

    ```bash
    git add visualizer.html
    git commit -m "feat(visualizer): render graph via Cytoscape preset swimlane (satisfies: R7, R11)"
    ```

## Task 11: visualizer.html — node click handler → drill-down navigation   (satisfies: R12, R13)

**Files:**
- Modify: `visualizer.html`

- [ ] **Step 1: Define expected behavior**

    - In per-frame mode: clicking a node navigates to `?instance=X&cycle=<frame.firstCycle>&frame=<frameDir>`.
    - In per-cycle mode: clicking a node navigates to `?instance=X&cycle=<cycle>&frame=<frameDir>`.
    - Navigation is via `history.pushState` (no full page reload) followed by re-running `bootstrap()`.

- [ ] **Step 2: Verify before-state**

    With T10 in place, click any graph node — nothing happens.

- [ ] **Step 3: Implement click handler**

    At the end of `renderGraph(graph)` (after the `cy = cytoscape(...)` call), add:

    ```js
      cy.on('tap', 'node', (evt) => {
        const data = evt.target.data();
        const route = {
          kind: 'cycle',
          instance: instanceDir,
          cycle: data.cycle,
          frame: data.frameDir,
        };
        history.pushState(null, '', UrlRouter.formatRoute(route));
        bootstrap();
      });
    ```

    Also wire the popstate handler so back/forward buttons work — once, near the bottom of the inline script:

    ```js
      window.addEventListener('popstate', () => bootstrap());
    ```

- [ ] **Step 4: Build + smoke**

    Run: `npm run build`
    Open `http://localhost:8765/?instance=instances/demo4b` (graph view).
    - Click the leftmost dialogue node (its label should be `dialogue (2–6)` for a typical demo4b). URL becomes `?instance=instances/demo4b&cycle=2&frame=frames/f001-dialogue`. The 3-column cycle view opens at cycle 2 with f001-dialogue selected. (R12 verified.)
    - Use the browser's Back button — graph re-appears.
    - Toggle to per-cycle mode (after T15 wires the toggle; if not yet, manually navigate to `?instance=...&mode=cycle`). Click a per-cycle node — URL has the exact cycle in it, cycle view opens at that cycle. (R13 verified.)

- [ ] **Step 5: Commit**

    ```bash
    git add visualizer.html
    git commit -m "feat(visualizer): node click drills into per-cycle view (satisfies: R12, R13)"
    ```

## Task 12: visualizer.html — cycle view URL handling + "← Graph" back link   (satisfies: R18, R19)

**Files:**
- Modify: `visualizer.html`

- [ ] **Step 1: Define expected behavior**

    - When the cycle view is active (URL has `cycle=N`), the topbar shows a `← Graph` link to the left of the existing `← Home` link.
    - Clicking `← Graph` runs `history.pushState` with `?instance=<path>` (no cycle/frame) and re-bootstraps.
    - The cycle view honors the `cycle` and `frame` URL params on load (selects the right cycle dot + the right frame).

- [ ] **Step 2: Verify before-state**

    With T11 in place, open a cycle URL directly (e.g. `?instance=instances/demo4b&cycle=10&frame=frames/f001-dialogue`). The 3-column view opens but there is no `← Graph` link in the topbar; only `← Home` is present.

- [ ] **Step 3: Implement back link + URL seeding**

    1. In the topbar HTML, change:

        ```html
        <a href="?" style="color:#58a6ff;text-decoration:none;">← Home</a>
        ```

        to:

        ```html
        <a id="backToGraphLink" href="#" onclick="backToGraph(); return false;" hidden style="color:#58a6ff;text-decoration:none;">← Graph</a>
        <span id="backToGraphSep" hidden style="color:#30363d;">|</span>
        <a href="?" style="color:#58a6ff;text-decoration:none;">← Home</a>
        ```

    2. In `bootstrap()`, when `route.kind === 'cycle'`, show the back link:

        ```js
        document.getElementById('backToGraphLink').hidden = false;
        document.getElementById('backToGraphSep').hidden = false;
        ```

        And when `route.kind === 'graph'`, hide them:

        ```js
        document.getElementById('backToGraphLink').hidden = true;
        document.getElementById('backToGraphSep').hidden = true;
        ```

    3. Add the `backToGraph` function:

        ```js
        function backToGraph() {
          const route = { kind: 'graph', instance: instanceDir, mode: currentGraphMode };
          history.pushState(null, '', UrlRouter.formatRoute(route));
          bootstrap();
        }
        ```

    4. Confirm `loadInstance()` (existing function) honours `selectedCycleNum` / `selectedFrameDir` set by bootstrap before it runs. They were already used as defaults at line ~422; bootstrap-set values persist.

- [ ] **Step 4: Build + smoke**

    Run: `npm run build`
    Open `?instance=instances/demo4b&cycle=10&frame=frames/f001-dialogue` — see `← Graph | ← Home` in the topbar. Cycle 10 selected; f001-dialogue frame highlighted in the call-stack panel. Click `← Graph` — URL becomes `?instance=instances/demo4b`, graph view re-renders.

- [ ] **Step 5: Commit**

    ```bash
    git add visualizer.html
    git commit -m "feat(visualizer): ← Graph back link + cycle URL seeding (satisfies: R18, R19)"
    ```

## Task 13: visualizer.html — auto-refresh integration + empty placeholder + mode toggle wiring   (satisfies: R17, R20, R15)

**Files:**
- Modify: `visualizer.html`

- [ ] **Step 1: Define expected behavior**

    - When Auto-refresh is on and the user is in graph view, the graph re-fetches `events.jsonl` + `.call-stack.json` and re-renders at the chosen interval.
    - For an instance with no cycles yet (empty `events.jsonl`), graph view shows the "Instance has no cycles yet" placeholder text.
    - Clicking the `Mode: per-frame` button toggles to `Mode: per-cycle` (and vice versa), re-renders the graph, and updates the URL (`mode=cycle` ⇄ no mode param).

- [ ] **Step 2: Verify before-state**

    1. Open `?instance=instances/demo4b`. Toggle Auto-refresh on. The graph does NOT re-render at the interval (loadInstance is called but it's the cycle-view loader).
    2. Create an empty instance: `./new-instance.sh empty-test interpreters/mas-papers/2-planning-decomposition/a-plan-execute`. Open `?instance=instances/empty-test`. Empty `#cyGraph` shows but no placeholder text.
    3. Click the Mode button — nothing happens (function not defined yet).

- [ ] **Step 3: Implement**

    1. Wire `toggleGraphMode`:

        ```js
        function toggleGraphMode() {
          currentGraphMode = currentGraphMode === 'frame' ? 'cycle' : 'frame';
          document.getElementById('graphModeBtn').textContent = 'Mode: per-' + currentGraphMode;
          const route = { kind: 'graph', instance: instanceDir, mode: currentGraphMode };
          history.pushState(null, '', UrlRouter.formatRoute(route));
          loadInstanceForGraph();
        }
        ```

    2. Refactor the existing `refresh()` function so it dispatches by current view:

        ```js
        function refresh() {
          if (currentRoute?.kind === 'graph') loadInstanceForGraph();
          else if (currentRoute?.kind === 'cycle') loadInstance();
          else loadHomeInstances();
        }
        ```

    3. The empty-placeholder behaviour was already implemented in T10's `renderGraph` (the `if (!graph.nodes.length)` branch). Verify it still triggers for the empty-test instance.

- [ ] **Step 4: Build + smoke**

    Run: `npm run build`
    1. Open `?instance=instances/demo4b`, toggle Auto-refresh on (5s). Add a fake event manually (or wait for a fresh demo run). Graph re-renders.
    2. Open `?instance=instances/empty-test`. See "Instance has no cycles yet." placeholder.
    3. Click the Mode button on demo4b. Switches to per-cycle mode (~63 nodes), URL gets `&mode=cycle`. Click again — back to per-frame, URL drops `mode`.

- [ ] **Step 5: Commit + cleanup**

    ```bash
    git add visualizer.html
    git commit -m "feat(visualizer): auto-refresh graph, empty placeholder, mode toggle wiring (satisfies: R15, R17, R20)"
    rm -rf instances/empty-test   # discard the smoke-test instance
    ```

    Then run the full test suite to confirm no regressions:

    ```bash
    npm test 2>&1 | tail -8
    ```

    Expected: `# pass <N>; # fail 0` where N is at least 301 + the new graph-builder + url-router tests.
