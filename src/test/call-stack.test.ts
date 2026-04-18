import { test, describe, beforeEach, afterEach } from "node:test";
import { strict as assert } from "node:assert";
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { tmpdir } from "node:os";
import { loadCallStack, saveCallStack, applyPop, applyPush, type StackEntry } from "../call-stack.js";

let dir: string;
let path: string;

beforeEach(() => {
  dir = mkdtempSync(resolve(tmpdir(), "turing-stack-"));
  path = resolve(dir, ".call-stack.json");
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("loadCallStack", () => {
  test("returns [] when file does not exist", () => {
    assert.deepEqual(loadCallStack(path), []);
  });

  test("returns [] when file is empty", () => {
    writeFileSync(path, "", "utf-8");
    assert.deepEqual(loadCallStack(path), []);
  });

  test("returns [] when file has malformed JSON", () => {
    writeFileSync(path, "{not json", "utf-8");
    assert.deepEqual(loadCallStack(path), []);
  });

  test("returns [] when JSON is not an array", () => {
    writeFileSync(path, '{"x":1}', "utf-8");
    assert.deepEqual(loadCallStack(path), []);
  });

  test("loads a previously-saved stack", () => {
    const stack: StackEntry[] = [
      { returnState: "planning", instructions: "# Strategy\n..." },
      { returnState: "needs_x", instructions: "# Dynamic\n..." },
    ];
    writeFileSync(path, JSON.stringify(stack), "utf-8");
    assert.deepEqual(loadCallStack(path), stack);
  });
});

describe("saveCallStack", () => {
  test("writes JSON round-trippable via loadCallStack", () => {
    const stack: StackEntry[] = [
      { returnState: "a", instructions: "one" },
      { returnState: "b", instructions: "two" },
    ];
    saveCallStack(path, stack);
    assert.deepEqual(loadCallStack(path), stack);
  });

  test("writes empty array as []", () => {
    saveCallStack(path, []);
    assert.equal(readFileSync(path, "utf-8").trim(), "[]");
  });
});

describe("applyPop", () => {
  test("no-op when state is not done", () => {
    const stack: StackEntry[] = [{ returnState: "x", instructions: "old" }];
    const r = applyPop(stack, "## State\nrunning", "current");
    assert.deepEqual(r.stack, stack);
    assert.equal(r.memory, "## State\nrunning");
    assert.equal(r.instructions, "current");
    assert.deepEqual(r.events, []);
  });

  test("no-op when state is done but stack is empty", () => {
    const r = applyPop([], "## State\ndone", "current");
    assert.deepEqual(r.stack, []);
    assert.equal(r.memory, "## State\ndone");
    assert.equal(r.instructions, "current");
    assert.deepEqual(r.events, []);
  });

  test("single pop restores caller instructions and sets state to {returnState}_completed", () => {
    const stack: StackEntry[] = [{ returnState: "planning", instructions: "# Strategy" }];
    const r = applyPop(stack, "## State\ndone\n## Last Action\nx", "# Dynamic");
    assert.deepEqual(r.stack, []);
    assert.match(r.memory, /^## State\nplanning_completed/);
    assert.match(r.memory, /## Last Action\nx/);
    assert.equal(r.instructions, "# Strategy");
    assert.deepEqual(r.events, [{ returnState: "planning", depthAfter: 0 }]);
  });

  test("does not mutate input stack", () => {
    const stack: StackEntry[] = [{ returnState: "x", instructions: "a" }];
    applyPop(stack, "## State\ndone", "b");
    assert.equal(stack.length, 1);
  });

  test("single pop only — state becomes {returnState}_completed, not 'done', so loop exits", () => {
    const stack: StackEntry[] = [
      { returnState: "outer", instructions: "# Outer" },
      { returnState: "inner", instructions: "# Inner" },
    ];
    const r = applyPop(stack, "## State\ndone", "# Current");
    assert.equal(r.stack.length, 1);
    assert.equal(r.instructions, "# Inner");
    assert.match(r.memory, /^## State\ninner_completed/);
    assert.deepEqual(r.events, [{ returnState: "inner", depthAfter: 1 }]);
  });
});

describe("applyPush", () => {
  test("reason 'no-push' when ## Push section is absent", () => {
    const r = applyPush([], "## State\nfoo", "current", () => "target");
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.reason, "no-push");
  });

  test("reason 'missing-target' and ## Push stripped when target reads as null", () => {
    const memory = "## State\nfoo\n## Push\nbad/path.md";
    const r = applyPush([], memory, "current", () => null);
    assert.equal(r.ok, false);
    if (!r.ok && r.reason === "missing-target") {
      assert.equal(r.target, "bad/path.md");
      assert.doesNotMatch(r.memory, /## Push/);
      assert.match(r.memory, /## State\nfoo/);
    }
  });

  test("successful push: saves caller, swaps instructions, sets state to empty, removes ## Push", () => {
    const memory = "## State\nplanning\n## Push\ndynamics/consult.md";
    const r = applyPush([], memory, "# Strategy", (p) => {
      assert.equal(p, "dynamics/consult.md");
      return "# Dynamic";
    });

    assert.equal(r.ok, true);
    if (r.ok) {
      assert.equal(r.target, "dynamics/consult.md");
      assert.equal(r.stack.length, 1);
      assert.deepEqual(r.stack[0], { returnState: "planning", instructions: "# Strategy" });
      assert.equal(r.instructions, "# Dynamic");
      assert.match(r.memory, /^## State\nempty/);
      assert.doesNotMatch(r.memory, /## Push/);
    }
  });

  test("nested push: frame appended, prior frames preserved", () => {
    const existing: StackEntry[] = [{ returnState: "outer", instructions: "# Outer" }];
    const memory = "## State\ninner_task\n## Push\ndynamics/sub.md";
    const r = applyPush(existing, memory, "# Inner", () => "# Sub");

    assert.equal(r.ok, true);
    if (r.ok) {
      assert.equal(r.stack.length, 2);
      assert.deepEqual(r.stack[0], { returnState: "outer", instructions: "# Outer" });
      assert.deepEqual(r.stack[1], { returnState: "inner_task", instructions: "# Inner" });
    }
  });

  test("does not mutate input stack on success", () => {
    const stack: StackEntry[] = [{ returnState: "x", instructions: "a" }];
    applyPush(stack, "## State\nfoo\n## Push\ntgt.md", "b", () => "c");
    assert.equal(stack.length, 1);
  });
});
