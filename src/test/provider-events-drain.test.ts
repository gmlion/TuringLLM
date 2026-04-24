import { test, describe, beforeEach, afterEach } from "node:test";
import { strict as assert } from "node:assert";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { resolve } from "node:path";
import { tmpdir } from "node:os";
import { initEvents, setCycleContext } from "../events.js";
import { drainProviderEvents } from "../main.js";
import type { ProviderEvent } from "../providers/shared.js";

describe("drainProviderEvents flushes a cycle's buffer to events.jsonl", () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(resolve(tmpdir(), "turing-drain-"));
    initEvents(dir);
    setCycleContext(3, "frames/f000-strategy");
  });
  afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

  test("drains all 5 ProviderEvent kinds in order (R11, R12, R15, R18, R19)", () => {
    const buf: ProviderEvent[] = [
      { type: "llm_request", provider: "api", model: "m", prompt: "p" },
      { type: "tool_call", tool: "bash", input: "ls" },
      { type: "tool_result", tool: "bash", output: "OK", isError: false },
      { type: "retry", attempt: 1, reason: "no state change" },
      { type: "llm_response", output: "done", durationMs: 200 },
    ];
    drainProviderEvents(buf);
    const lines = readFileSync(resolve(dir, "logs", "events.jsonl"), "utf-8").trim().split("\n");
    const types = lines.map(l => JSON.parse(l).type);
    assert.deepEqual(types, ["llm_request", "tool_call", "tool_result", "retry", "llm_response"]);
    // tool_call payload was externalized
    const tc = JSON.parse(lines[1]);
    assert.match(tc.payload_ref, /payloads\/\d+-bash-input\.txt/);
  });
});
