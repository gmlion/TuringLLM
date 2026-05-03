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

import { buildPerFrameGraph, type EventRecord } from "../visualizer/graph-builder.js";

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
    assert.equal(strategy.cycle, 1);
    assert.equal(dialogue.cycle, 2);
  });

  test("active frame's lastCycle is the latest event cycle (R21)", () => {
    const events = [
      { seq: 1, ts: "", cycle: 1, frame: "frames/f000-strategy", type: "cycle_start" },
      { seq: 2, ts: "", cycle: 2, frame: "frames/f001-dialogue", type: "cycle_start" },
      { seq: 3, ts: "", cycle: 3, frame: "frames/f001-dialogue", type: "cycle_start" },
    ];
    const liveStack = {
      nextCounter: 2,
      stack: [
        { returnState: "<root>", frameDir: "frames/f000-strategy" },
        { returnState: "active", frameDir: "frames/f001-dialogue" },
      ],
    };
    const g = buildPerFrameGraph(events, liveStack);
    const dialogue = g.nodes.find((n) => n.frameDir === "frames/f001-dialogue")!;
    assert.equal(dialogue.label, "dialogue (2–3)");
  });
});

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
    // Realistic shell ordering: every pop is followed by a cycle_start in the
    // resumed caller frame at the same cycle (see src/main.ts:511-535).
    const events: EventRecord[] = [
      { seq: 1, ts: "", cycle: 1, frame: "frames/f000-strategy", type: "cycle_start" },
      { seq: 2, ts: "", cycle: 1, frame: "frames/f000-strategy", type: "push", target: "operators/dialogue.md", frameDir: "frames/f001-dialogue", depth: 1 },
      { seq: 3, ts: "", cycle: 2, frame: "frames/f001-dialogue", type: "pop", frameDir: "frames/f001-dialogue", returnState: "x", depth: 0 },
      { seq: 4, ts: "", cycle: 2, frame: "frames/f000-strategy", type: "cycle_start" },
      { seq: 5, ts: "", cycle: 3, frame: "frames/f000-strategy", type: "push", target: "operators/dialogue.md", frameDir: "frames/f002-dialogue", depth: 1 },
      { seq: 6, ts: "", cycle: 4, frame: "frames/f002-dialogue", type: "pop", frameDir: "frames/f002-dialogue", returnState: "y", depth: 0 },
      { seq: 7, ts: "", cycle: 4, frame: "frames/f000-strategy", type: "cycle_start" },
    ];
    const g = buildPerFrameGraph(events, null);
    assert.equal(g.edges.filter((e) => e.type === "push").length, 2);
    assert.equal(g.edges.filter((e) => e.type === "pop").length, 2);
  });
});

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

  test("NO continuity edge when the frame's next cycle is non-adjacent (push/pop gap)", () => {
    // Strategy runs cycle 1, pushes plan; plan runs cycle 2, pops; strategy resumes at 3.
    // Strategy@1 and Strategy@3 are not adjacent — push+pop edges already bridge them.
    const events: EventRecord[] = [
      { seq: 1, ts: "", cycle: 1, frame: "frames/f000-strategy", type: "cycle_start" },
      { seq: 2, ts: "", cycle: 1, frame: "frames/f000-strategy", type: "push", target: "operators/plan.md", frameDir: "frames/f001-plan", depth: 1 },
      { seq: 3, ts: "", cycle: 2, frame: "frames/f001-plan", type: "cycle_start" },
      { seq: 4, ts: "", cycle: 2, frame: "frames/f001-plan", type: "pop", frameDir: "frames/f001-plan", returnState: "x", depth: 0 },
      { seq: 5, ts: "", cycle: 3, frame: "frames/f000-strategy", type: "cycle_start" },
    ];
    const g = buildPerCycleGraph(events, null);
    const cont = g.edges.filter((e) => e.type === "continuity");
    assert.equal(cont.length, 0, "no continuity edge across push/pop gap (strategy 1 → 3)");
  });

  test("push/pop edges resolve to existing cycle_start nodes (not the event's own cycle)", () => {
    // Realistic shell ordering (src/main.ts:511-535): per cycle N,
    // (1) setCycleContext with pre-stack-op top, (2) runStackBlock emits
    // push/pop with envelope.frame=pre-op top, (3) setCycleContext with
    // post-op top, (4) cycle_start emitted with frame=post-op top.
    // So a pop at cycle N has envelope.frame=child but cycle_start at cycle N
    // has frame=caller — the child has NO cycle_start at cycle N. The edge
    // logic must look up the LAST cycle_start of the child BEFORE the pop,
    // not the event's own cycle.
    const events: EventRecord[] = [
      { seq: 1, ts: "", cycle: 1, frame: "frames/f000-strategy", type: "cycle_start" },
      { seq: 2, ts: "", cycle: 2, frame: "frames/f000-strategy", type: "cycle_start" },
      { seq: 3, ts: "", cycle: 2, frame: "frames/f000-strategy", type: "push", target: "operators/dialogue.md", frameDir: "frames/f001-dialogue", depth: 1 },
      { seq: 4, ts: "", cycle: 3, frame: "frames/f001-dialogue", type: "cycle_start" },
      { seq: 5, ts: "", cycle: 4, frame: "frames/f001-dialogue", type: "cycle_start" },
      { seq: 6, ts: "", cycle: 5, frame: "frames/f001-dialogue", type: "pop", frameDir: "frames/f001-dialogue", returnState: "x", depth: 0 },
      { seq: 7, ts: "", cycle: 5, frame: "frames/f000-strategy", type: "cycle_start" },
    ];
    const g = buildPerCycleGraph(events, null);
    const pushE = g.edges.filter((e) => e.type === "push");
    const popE = g.edges.filter((e) => e.type === "pop");
    assert.equal(pushE.length, 1);
    // Push fires at cycle 2: caller's last cycle_start before is cycle 2 (seq 2),
    // child's first cycle_start after is cycle 3 (seq 4).
    assert.deepEqual(pushE[0], { source: "frames/f000-strategy@2", target: "frames/f001-dialogue@3", type: "push" });
    assert.equal(popE.length, 1);
    // Pop fires at cycle 5 but the child has NO cycle_start at cycle 5 — its
    // last cycle_start was at cycle 4 (seq 5). The next cycle_start after the
    // pop is at cycle 5 in the caller frame (seq 7).
    assert.deepEqual(popE[0], { source: "frames/f001-dialogue@4", target: "frames/f000-strategy@5", type: "pop" });
  });
});
