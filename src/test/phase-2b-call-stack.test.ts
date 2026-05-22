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

  test("throws when file absent", () => {
    assert.throws(() => loadCallStack(resolve(tmp, ".call-stack.json")), /cannot read/);
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

  test("malformed JSON throws", () => {
    const path = resolve(tmp, ".call-stack.json");
    writeFileSync(path, "not json", "utf-8");
    assert.throws(() => loadCallStack(path), /not valid JSON/);
  });

  test("pre-Phase-2b bare-array shape throws (no compat)", () => {
    // R18 explicitly dropped — bare arrays are no longer loaded as stacks.
    const path = resolve(tmp, ".call-stack.json");
    writeFileSync(path, JSON.stringify([
      { returnState: "foo", instructions: "bar" },
    ]), "utf-8");
    assert.throws(() => loadCallStack(path), /invalid shape/);
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
