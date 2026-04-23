import { test, describe, beforeEach, afterEach } from "node:test";
import { strict as assert } from "node:assert";
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from "fs";
import { resolve } from "path";
import { tmpdir } from "os";
import { loadCallStack, saveCallStack, type CallStack } from "../call-stack.js";

describe("CallStack persistence (Phase 2b shape)", () => {
  let tmp: string;
  beforeEach(() => { tmp = mkdtempSync(resolve(tmpdir(), "turing-cs-")); });
  afterEach(() => { rmSync(tmp, { recursive: true, force: true }); });

  test("loads fresh when file absent", () => {
    const cs = loadCallStack(resolve(tmp, ".call-stack.json"));
    assert.equal(cs.nextCounter, 1);
    assert.deepEqual(cs.stack, [
      { returnState: "<root>", frameDir: "frames/f000-strategy" },
    ]);
  });

  test("loads the new object shape round-trip", () => {
    const path = resolve(tmp, ".call-stack.json");
    const cs: CallStack = {
      nextCounter: 3,
      stack: [
        { returnState: "<root>", frameDir: "frames/f000-strategy" },
        { returnState: "drafted", frameDir: "frames/f001-verify" },
      ],
    };
    saveCallStack(path, cs);
    const loaded = loadCallStack(path);
    assert.deepEqual(loaded, cs);
  });

  test("malformed JSON returns fresh shape", () => {
    const path = resolve(tmp, ".call-stack.json");
    writeFileSync(path, "not json", "utf-8");
    const cs = loadCallStack(path);
    assert.equal(cs.nextCounter, 1);
    assert.equal(cs.stack.length, 1);
    assert.equal(cs.stack[0].frameDir, "frames/f000-strategy");
  });

  test("pre-Phase-2b bare-array shape returns fresh (no compat)", () => {
    // R18 explicitly dropped — bare arrays are no longer loaded as stacks.
    const path = resolve(tmp, ".call-stack.json");
    writeFileSync(path, JSON.stringify([
      { returnState: "foo", instructions: "bar" },
    ]), "utf-8");
    const cs = loadCallStack(path);
    assert.equal(cs.nextCounter, 1);
    assert.deepEqual(cs.stack, [
      { returnState: "<root>", frameDir: "frames/f000-strategy" },
    ]);
  });

  test("saveCallStack writes valid JSON matching the shape", () => {
    const path = resolve(tmp, ".call-stack.json");
    saveCallStack(path, {
      nextCounter: 2,
      stack: [
        { returnState: "<root>", frameDir: "frames/f000-strategy" },
      ],
    });
    const raw = readFileSync(path, "utf-8");
    const parsed = JSON.parse(raw);
    assert.equal(parsed.nextCounter, 2);
    assert.ok(Array.isArray(parsed.stack));
    assert.equal(parsed.stack[0].frameDir, "frames/f000-strategy");
  });
});
