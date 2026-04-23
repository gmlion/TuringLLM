import { test, describe } from "node:test";
import { strict as assert } from "node:assert";
import { formatFrameDir, slugFromTarget } from "../call-stack.js";

describe("slugFromTarget", () => {
  test("basic dynamic path", () => {
    assert.equal(slugFromTarget("dynamics/verify.md"), "verify");
  });

  test("hyphens preserved, extension stripped", () => {
    assert.equal(slugFromTarget("dynamics/answer-independently.md"), "answer-independently");
  });

  test("non-alphanumeric characters replaced with _", () => {
    assert.equal(slugFromTarget("dynamics/foo.bar baz.md"), "foo_bar_baz");
  });

  test("path without leading directory", () => {
    assert.equal(slugFromTarget("inline.md"), "inline");
  });
});

describe("formatFrameDir", () => {
  test("counter zero-pads to 3 digits", () => {
    assert.equal(formatFrameDir(0, "strategy"), "frames/f000-strategy");
    assert.equal(formatFrameDir(7, "verify"), "frames/f007-verify");
    assert.equal(formatFrameDir(42, "answer-independently"), "frames/f042-answer-independently");
  });

  test("counter widens beyond 999 preserving lexical sort", () => {
    assert.equal(formatFrameDir(1000, "verify"), "frames/f1000-verify");
  });
});
