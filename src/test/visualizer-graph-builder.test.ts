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
