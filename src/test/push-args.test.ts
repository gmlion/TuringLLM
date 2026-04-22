import { test, describe } from "node:test";
import { strict as assert } from "node:assert";
import { substitutePlaceholders, applyPush } from "../call-stack.js";

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

describe("applyPush with ## Push-Args", () => {
  test("substitutes placeholders successfully and pushes one frame", () => {
    const memory = "## State\nfoo\n## Push\ndyn.md\n## Push-Args\nq: hello";
    const target = "Question: {{q}}";
    const result = applyPush([], memory, "# caller", () => target);
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.instructions, "Question: hello");
    assert.equal(result.stack.length, 1);
    assert.equal(result.stack[0].returnState, "foo");
    assert.equal(result.stack[0].instructions, "# caller");
    assert.match(result.memory, /^## State\nempty/m);
    assert.doesNotMatch(result.memory, /## Push\b/);
    assert.doesNotMatch(result.memory, /## Push-Args/);
  });

  test("fails on unresolved placeholder, strips both sections, leaves stack untouched", () => {
    const memory = "## State\nfoo\n## Push\ndyn.md\n## Push-Args\nq: hi";
    const target = "{{q}} and {{missing}}";
    const result = applyPush([], memory, "# caller", () => target);
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.reason, "unresolved-placeholder");
    if (result.reason !== "unresolved-placeholder") return;
    assert.deepEqual(result.placeholders, ["missing"]);
    assert.equal(result.target, "dyn.md");
    assert.doesNotMatch(result.memory, /## Push\b/);
    assert.doesNotMatch(result.memory, /## Push-Args/);
  });

  test("succeeds with no Push-Args + no placeholders (R5: today's behaviour)", () => {
    const memory = "## State\nfoo\n## Push\ndyn.md";
    const target = "no placeholders here";
    const result = applyPush([], memory, "# caller", () => target);
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.instructions, "no placeholders here");
  });

  test("fails when target has placeholders but no Push-Args supplied", () => {
    const memory = "## State\nfoo\n## Push\ndyn.md";
    const target = "needs {{x}}";
    const result = applyPush([], memory, "# caller", () => target);
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.reason, "unresolved-placeholder");
  });

  test("missing-target also strips ## Push-Args (defence-in-depth)", () => {
    const memory = "## State\nfoo\n## Push\ndyn.md\n## Push-Args\nq: hi";
    const result = applyPush([], memory, "# caller", () => null);
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.reason, "missing-target");
    assert.doesNotMatch(result.memory, /## Push-Args/);
  });
});
