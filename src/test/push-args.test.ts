import { test, describe } from "node:test";
import { strict as assert } from "node:assert";
import { substitutePlaceholders } from "../call-stack.js";

describe("substitutePlaceholders", () => {
  test("substitutes single known placeholder", () => {
    const r = substitutePlaceholders("Hello {{name}}!", { name: "World" });
    assert.equal(r.result, "Hello World!");
    assert.deepEqual(r.unresolved, []);
  });

  test("substitutes multiple occurrences of same key", () => {
    const r = substitutePlaceholders("{{x}} and {{x}} again", { x: "Y" });
    assert.equal(r.result, "Y and Y again");
  });

  test("substitutes multi-line values", () => {
    const r = substitutePlaceholders("Draft:\n{{draft}}\n", { draft: "line1\nline2" });
    assert.equal(r.result, "Draft:\nline1\nline2\n");
  });

  test("returns unresolved list when arg missing", () => {
    const r = substitutePlaceholders("Hi {{a}} and {{b}}", { a: "ok" });
    assert.equal(r.result, "Hi ok and {{b}}");
    assert.deepEqual(r.unresolved, ["b"]);
  });

  test("deduplicates unresolved list", () => {
    const r = substitutePlaceholders("{{a}} {{a}} {{b}} {{b}}", {});
    assert.deepEqual(r.unresolved, ["a", "b"]);
  });

  test("ignores placeholders that don't match identifier rule", () => {
    const r = substitutePlaceholders("{{1bad}} and {{ok}}", { ok: "Y" });
    assert.equal(r.result, "{{1bad}} and Y");
    assert.deepEqual(r.unresolved, []);
  });
});
