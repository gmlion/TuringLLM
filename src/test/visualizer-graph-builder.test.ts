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
