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
