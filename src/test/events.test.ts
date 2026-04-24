import { test, describe, beforeEach, afterEach } from "node:test";
import { strict as assert } from "node:assert";
import { mkdtempSync, readFileSync, rmSync, existsSync, writeFileSync, mkdirSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { tmpdir } from "node:os";
import {
  initEvents, setCycleContext, clearCycleContext, _emitForTest,
} from "../events.js";

describe("events.ts skeleton", () => {
  let dir: string;
  beforeEach(() => { dir = mkdtempSync(resolve(tmpdir(), "turing-events-")); });
  afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

  test("initEvents creates logs/events.jsonl and logs/.events-seq when missing (R2)", () => {
    initEvents(dir);
    assert.equal(existsSync(resolve(dir, "logs", "events.jsonl")), true);
    assert.equal(existsSync(resolve(dir, "logs", ".events-seq")), true);
    assert.equal(readFileSync(resolve(dir, "logs", ".events-seq"), "utf-8").trim(), "1");
  });

  test("initEvents preserves existing events.jsonl on restart (R30)", () => {
    const eventsPath = resolve(dir, "logs", "events.jsonl");
    const seqPath = resolve(dir, "logs", ".events-seq");
    mkdirSync(resolve(dir, "logs"), { recursive: true });
    writeFileSync(eventsPath, '{"seq":7,"type":"halt"}\n', "utf-8");
    writeFileSync(seqPath, "8", "utf-8");
    initEvents(dir);
    assert.equal(readFileSync(eventsPath, "utf-8"), '{"seq":7,"type":"halt"}\n');
    assert.equal(readFileSync(seqPath, "utf-8").trim(), "8");
  });

  test("emit stamps envelope (seq, ts, cycle, frame, type) and one line per call (R1, R3)", () => {
    initEvents(dir);
    setCycleContext(7, "frames/f001-verify");
    _emitForTest("custom_type", { foo: "bar" });
    const line = readFileSync(resolve(dir, "logs", "events.jsonl"), "utf-8").trim();
    const parsed = JSON.parse(line);
    assert.equal(parsed.seq, 1);
    assert.equal(parsed.cycle, 7);
    assert.equal(parsed.frame, "frames/f001-verify");
    assert.equal(parsed.type, "custom_type");
    assert.equal(parsed.foo, "bar");
    assert.match(parsed.ts, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  });

  test("seq is monotonic and persists to .events-seq (R4)", () => {
    initEvents(dir);
    setCycleContext(1, "frames/f000-strategy");
    _emitForTest("a", {});
    _emitForTest("b", {});
    _emitForTest("c", {});
    const lines = readFileSync(resolve(dir, "logs", "events.jsonl"), "utf-8")
      .trim().split("\n").map(l => JSON.parse(l));
    assert.deepEqual(lines.map(e => e.seq), [1, 2, 3]);
    assert.equal(readFileSync(resolve(dir, "logs", ".events-seq"), "utf-8").trim(), "4");
  });

  test("clearCycleContext writes cycle:0 frame:null (R5)", () => {
    initEvents(dir);
    clearCycleContext();
    _emitForTest("startup", {});
    const parsed = JSON.parse(readFileSync(resolve(dir, "logs", "events.jsonl"), "utf-8").trim());
    assert.equal(parsed.cycle, 0);
    assert.equal(parsed.frame, null);
  });

  test("emit flushes synchronously — file is readable immediately after emit returns (R29)", () => {
    initEvents(dir);
    setCycleContext(2, "frames/f000-strategy");
    _emitForTest("flush_test", {});
    const content = readFileSync(resolve(dir, "logs", "events.jsonl"), "utf-8");
    assert.match(content, /flush_test/);
    assert.equal(readFileSync(resolve(dir, "logs", ".events-seq"), "utf-8").trim(), "2");
  });
});
