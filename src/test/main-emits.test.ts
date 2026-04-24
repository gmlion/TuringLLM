import { test, describe, beforeEach, afterEach } from "node:test";
import { strict as assert } from "node:assert";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { resolve } from "node:path";
import { tmpdir } from "node:os";
import { initEvents, setCycleContext, emitCycleStart, emitCycleEnd, emitHalt, clearCycleContext } from "../events.js";

describe("main.ts event emit conventions", () => {
  let dir: string;
  beforeEach(() => { dir = mkdtempSync(resolve(tmpdir(), "turing-main-emits-")); });
  afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

  test("a cycle's events appear in order: cycle_start ... cycle_end", () => {
    initEvents(dir);
    setCycleContext(1, "frames/f000-strategy");
    emitCycleStart();
    emitCycleEnd("drafted", 1000);
    const lines = readFileSync(resolve(dir, "logs", "events.jsonl"), "utf-8").trim().split("\n");
    const types = lines.map(l => JSON.parse(l).type);
    assert.deepEqual(types, ["cycle_start", "cycle_end"]);
  });

  test("halt emitted with cleared context (cycle:0, frame:null)", () => {
    initEvents(dir);
    setCycleContext(5, "frames/f000-strategy");
    emitCycleEnd("done", 100);
    clearCycleContext();
    emitHalt("done");
    const lines = readFileSync(resolve(dir, "logs", "events.jsonl"), "utf-8").trim().split("\n");
    const halt = JSON.parse(lines[lines.length - 1]);
    assert.equal(halt.type, "halt");
    assert.equal(halt.cycle, 0);
    assert.equal(halt.frame, null);
  });
});
