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

import {
  emitCycleStart, emitCycleEnd, emitPush, emitPop, emitSplice,
  emitMachineGitCommit, emitInstructionsChanged, emitRetry, emitError, emitHalt,
} from "../events.js";

describe("events.ts structural emitters", () => {
  let dir: string;
  let eventsFile: string;
  beforeEach(() => {
    dir = mkdtempSync(resolve(tmpdir(), "turing-events-struct-"));
    initEvents(dir);
    eventsFile = resolve(dir, "logs", "events.jsonl");
  });
  afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

  function lastEvent() {
    const lines = readFileSync(eventsFile, "utf-8").trim().split("\n");
    return JSON.parse(lines[lines.length - 1]);
  }

  test("emitCycleStart writes type=cycle_start (R6)", () => {
    setCycleContext(3, "frames/f000-strategy");
    emitCycleStart();
    assert.equal(lastEvent().type, "cycle_start");
  });

  test("emitCycleEnd carries state and duration_ms (R7)", () => {
    setCycleContext(3, "frames/f000-strategy");
    emitCycleEnd("drafted", 1234);
    const ev = lastEvent();
    assert.equal(ev.type, "cycle_end");
    assert.equal(ev.state, "drafted");
    assert.equal(ev.duration_ms, 1234);
  });

  test("emitPush carries target/frameDir/depth (R8)", () => {
    setCycleContext(2, "frames/f000-strategy");
    emitPush("dynamics/verify.md", "frames/f001-verify", 1);
    const ev = lastEvent();
    assert.equal(ev.type, "push");
    assert.equal(ev.target, "dynamics/verify.md");
    assert.equal(ev.frameDir, "frames/f001-verify");
    assert.equal(ev.depth, 1);
  });

  test("emitPop carries frameDir/returnState/depth (R9)", () => {
    setCycleContext(5, "frames/f000-strategy");
    emitPop("frames/f001-verify", "drafted", 0);
    const ev = lastEvent();
    assert.equal(ev.type, "pop");
    assert.equal(ev.frameDir, "frames/f001-verify");
    assert.equal(ev.returnState, "drafted");
    assert.equal(ev.depth, 0);
  });

  test("emitSplice carries splicedKeys + targetFrame (R10)", () => {
    setCycleContext(5, "frames/f000-strategy");
    emitSplice("frames/f000-strategy", ["revised", "verdict"]);
    const ev = lastEvent();
    assert.equal(ev.type, "splice");
    assert.deepEqual(ev.splicedKeys, ["revised", "verdict"]);
    assert.equal(ev.targetFrame, "frames/f000-strategy");
  });

  test("emitMachineGitCommit carries hash + subject (R13)", () => {
    setCycleContext(3, "frames/f000-strategy");
    emitMachineGitCommit("a3f1b2c", "cycle 3: drafted");
    const ev = lastEvent();
    assert.equal(ev.type, "machine_git_commit");
    assert.equal(ev.hash, "a3f1b2c");
    assert.equal(ev.subject, "cycle 3: drafted");
  });

  test("emitInstructionsChanged carries bytes_before/after (R14)", () => {
    setCycleContext(4, "frames/f000-strategy");
    emitInstructionsChanged(2400, 2700);
    const ev = lastEvent();
    assert.equal(ev.type, "instructions_changed");
    assert.equal(ev.bytes_before, 2400);
    assert.equal(ev.bytes_after, 2700);
  });

  test("emitRetry carries attempt + reason (R15)", () => {
    setCycleContext(6, "frames/f000-strategy");
    emitRetry(2, "no state change");
    const ev = lastEvent();
    assert.equal(ev.type, "retry");
    assert.equal(ev.attempt, 2);
    assert.equal(ev.reason, "no state change");
  });

  test("emitError carries message + stack (R16)", () => {
    setCycleContext(7, "frames/f000-strategy");
    const err = new Error("boom");
    emitError(err);
    const ev = lastEvent();
    assert.equal(ev.type, "error");
    assert.equal(ev.message, "boom");
    assert.match(ev.stack, /boom/);
  });

  test("emitHalt carries reason (R17)", () => {
    clearCycleContext();
    emitHalt("done");
    const ev = lastEvent();
    assert.equal(ev.type, "halt");
    assert.equal(ev.reason, "done");
  });
});
