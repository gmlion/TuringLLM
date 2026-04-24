import { test, describe, beforeEach, afterEach } from "node:test";
import { strict as assert } from "node:assert";
import { mkdtempSync, readdirSync, rmSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { tmpdir } from "node:os";
import { initLog, log, logRaw, getLogPath } from "../logger.js";

describe("logger.ts (post-better-logging)", () => {
  let dir: string;
  const origStdoutWrite = process.stdout.write.bind(process.stdout);
  let captured = "";
  beforeEach(() => {
    dir = mkdtempSync(resolve(tmpdir(), "turing-logger-"));
    captured = "";
    // @ts-ignore — overriding for test capture
    process.stdout.write = (s: string | Uint8Array): boolean => {
      if (typeof s === "string") captured += s;
      return true;
    };
  });
  afterEach(() => {
    process.stdout.write = origStdoutWrite;
    rmSync(dir, { recursive: true, force: true });
  });

  test("initLog does NOT create a logs/run-<ts>.log file (R23)", () => {
    initLog(dir);
    const logsDir = resolve(dir, "logs");
    if (!existsSync(logsDir)) return; // R23 satisfied: no logs dir created
    const entries = readdirSync(logsDir, { withFileTypes: true }).filter(e => e.isFile());
    const runFiles = entries.filter(e => /^run-.*\.log$/.test(e.name));
    assert.equal(runFiles.length, 0);
  });

  test("getLogPath returns null after better-logging (R23)", () => {
    initLog(dir);
    assert.equal(getLogPath(), null);
  });

  test("log() still prints to stdout (R22)", () => {
    initLog(dir);
    log("hello world");
    assert.match(captured, /hello world/);
  });

  test("logRaw() is silent (payload now in events.jsonl, not stdout)", () => {
    initLog(dir);
    logRaw("large diagnostic detail");
    assert.equal(captured, "");
  });
});
