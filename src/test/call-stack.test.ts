import { test, describe, beforeEach, afterEach } from "node:test";
import { strict as assert } from "node:assert";
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { tmpdir } from "node:os";
import { loadCallStack, saveCallStack, type StackEntry } from "../call-stack.js";

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
