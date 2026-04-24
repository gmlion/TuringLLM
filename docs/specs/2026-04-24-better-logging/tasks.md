# Tasks: better-logging

> **For executors:** use `kiro-flow:spec-execute` (it wraps
> `superpowers:subagent-driven-development` or `superpowers:executing-plans`).
> Each task below is TDD-shaped — write the failing test first, then minimal
> code, then verify, then commit. Commit messages must reference the task's
> `(satisfies: R#)` tag.
>
> The kiro-state for this spec lives at
> `docs/specs/2026-04-24-better-logging/.kiro-state.json`.
> Design at `docs/specs/2026-04-24-better-logging/design.md` (B-architecture).

## Task index

| #   | Summary                                                              | Satisfies     |
| --- | -------------------------------------------------------------------- | ------------- |
| T1  | events.ts skeleton: init, emit, envelope, seq, cycle context          | R1, R2, R3, R4, R5, R29, R30 |
| T2  | events.ts typed emitters for structural events                        | R6, R7, R8, R9, R10, R13, R14, R15, R16, R17 |
| T3  | events.ts LLM emitters                                                | R11, R12 |
| T4  | events.ts tool emitters with payload externalization + error path     | R18, R19, R20, R21, R28 |
| T5  | providers/shared.ts: extend CycleResult with events; export ProviderEvent | (enabler for T6) |
| T6  | All providers populate ProviderEvent buffer (no events.ts import)      | R11, R12, R15, R18, R19 |
| T7  | main.ts: initEvents + setCycleContext + structural emits              | R5, R6, R7, R8, R9, R10, R13, R14, R16, R17 |
| T8  | main.ts: drain CycleResult.events into events.ts                       | R11, R12, R15, R18, R19 |
| T9  | logger.ts trim: drop run-<ts>.log mirror, preserve stdout             | R22, R23 |
| T10 | visualizer.html: events panel scoped by selection, chronological order | R24, R25, R28 |
| T11 | visualizer.html: event-type toggle                                    | R26 |
| T12 | visualizer.html: tool payload fetch + detail view                     | R27 |
| T13 | Wipe `instances/`, run all four Group-1 demos, write notes            | R31, R32 |

## Task 1: events.ts skeleton — init, emit, envelope, seq, cycle context (satisfies: R1, R2, R3, R4, R5, R29, R30)

**Files:**
- Create: `src/events.ts`
- Test:   `src/test/events.test.ts`

- [ ] **Step 1: Write the failing test**

    ```ts
    import { test, describe, beforeEach, afterEach } from "node:test";
    import { strict as assert } from "node:assert";
    import { mkdtempSync, readFileSync, rmSync, existsSync, writeFileSync, statSync } from "node:fs";
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
        // Pre-existing state from a prior run
        require("fs").mkdirSync(resolve(dir, "logs"), { recursive: true });
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
        // No await/setTimeout — read immediately
        const content = readFileSync(resolve(dir, "logs", "events.jsonl"), "utf-8");
        assert.match(content, /flush_test/);
        // .events-seq is also flushed before emit returns
        assert.equal(readFileSync(resolve(dir, "logs", ".events-seq"), "utf-8").trim(), "2");
      });
    });
    ```

- [ ] **Step 2: Run test to verify it fails**

    Run: `npm test 2>&1 | grep -E "events.ts|Cannot find module|fail"`
    Expected: FAIL with "Cannot find module '../events.js'"

- [ ] **Step 3: Write minimal implementation**

    ```ts
    // src/events.ts
    import { mkdirSync, appendFileSync, writeFileSync, readFileSync, existsSync } from "fs";
    import { resolve } from "path";

    let logsDir: string | null = null;
    let eventsPath: string | null = null;
    let seqPath: string | null = null;
    let nextSeq = 1;
    let ctxCycle = 0;
    let ctxFrame: string | null = null;

    export function initEvents(baseDir: string): void {
      logsDir = resolve(baseDir, "logs");
      mkdirSync(logsDir, { recursive: true });
      eventsPath = resolve(logsDir, "events.jsonl");
      seqPath = resolve(logsDir, ".events-seq");
      if (!existsSync(eventsPath)) writeFileSync(eventsPath, "", "utf-8");
      if (existsSync(seqPath)) {
        const v = parseInt(readFileSync(seqPath, "utf-8").trim(), 10);
        nextSeq = Number.isFinite(v) && v > 0 ? v : 1;
      } else {
        nextSeq = 1;
        writeFileSync(seqPath, "1", "utf-8");
      }
    }

    export function setCycleContext(cycle: number, frame: string | null): void {
      ctxCycle = cycle;
      ctxFrame = frame;
    }

    export function clearCycleContext(): void {
      ctxCycle = 0;
      ctxFrame = null;
    }

    function emit(type: string, fields: Record<string, unknown>): void {
      if (!eventsPath || !seqPath) throw new Error("events.ts: initEvents not called");
      const envelope = {
        seq: nextSeq,
        ts: new Date().toISOString(),
        cycle: ctxCycle,
        frame: ctxFrame,
        type,
        ...fields,
      };
      appendFileSync(eventsPath, JSON.stringify(envelope) + "\n", "utf-8");
      nextSeq += 1;
      writeFileSync(seqPath, String(nextSeq), "utf-8");
    }

    // Test-only export so events.test.ts can exercise the private emit path
    // before any typed helpers exist. Production callers must use the typed
    // helpers added in T2/T3/T4.
    export const _emitForTest = emit;
    ```

- [ ] **Step 4: Run test to verify it passes**

    Run: `npm test 2>&1 | tail -10`
    Expected: PASS — `# pass` count increases by 6, `# fail 0`

- [ ] **Step 5: Commit**

    ```bash
    git add src/events.ts src/test/events.test.ts
    git commit -m "feat(events): add events.ts skeleton with init, emit, envelope, seq, cycle context (satisfies: R1, R2, R3, R4, R5, R29, R30)"
    ```

## Task 2: events.ts typed emitters for structural events (satisfies: R6, R7, R8, R9, R10, R13, R14, R15, R16, R17)

**Files:**
- Modify: `src/events.ts`
- Test:   `src/test/events.test.ts` (add a new `describe`)

- [ ] **Step 1: Write the failing test**

    Append to `src/test/events.test.ts`:

    ```ts
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
    ```

- [ ] **Step 2: Run test to verify it fails**

    Run: `npm test 2>&1 | grep -E "structural emitters|fail" | head -5`
    Expected: FAIL — `not ok` for the structural-emitter subtests; missing exports.

- [ ] **Step 3: Write minimal implementation**

    Append to `src/events.ts`:

    ```ts
    export function emitCycleStart(): void {
      emit("cycle_start", {});
    }
    export function emitCycleEnd(state: string, durationMs: number): void {
      emit("cycle_end", { state, duration_ms: durationMs });
    }
    export function emitPush(target: string, frameDir: string, depth: number): void {
      emit("push", { target, frameDir, depth });
    }
    export function emitPop(frameDir: string, returnState: string, depth: number): void {
      emit("pop", { frameDir, returnState, depth });
    }
    export function emitSplice(targetFrame: string, splicedKeys: string[]): void {
      emit("splice", { targetFrame, splicedKeys });
    }
    export function emitMachineGitCommit(hash: string, subject: string): void {
      emit("machine_git_commit", { hash, subject });
    }
    export function emitInstructionsChanged(bytesBefore: number, bytesAfter: number): void {
      emit("instructions_changed", { bytes_before: bytesBefore, bytes_after: bytesAfter });
    }
    export function emitRetry(attempt: number, reason: string): void {
      emit("retry", { attempt, reason });
    }
    export function emitError(err: Error): void {
      emit("error", { message: err.message, stack: err.stack ?? "" });
    }
    export function emitHalt(reason: string): void {
      emit("halt", { reason });
    }
    ```

- [ ] **Step 4: Run test to verify it passes**

    Run: `npm test 2>&1 | tail -10`
    Expected: PASS — all 10 new subtests pass; `# fail 0`.

- [ ] **Step 5: Commit**

    ```bash
    git add src/events.ts src/test/events.test.ts
    git commit -m "feat(events): typed emitters for cycle/stack/git/error/halt events (satisfies: R6, R7, R8, R9, R10, R13, R14, R15, R16, R17)"
    ```

## Task 3: events.ts LLM emitters (satisfies: R11, R12)

**Files:**
- Modify: `src/events.ts`
- Test:   `src/test/events.test.ts` (extend)

- [ ] **Step 1: Write the failing test**

    Append a new `describe` block to `src/test/events.test.ts`:

    ```ts
    import { emitLlmRequest, emitLlmResponse } from "../events.js";

    describe("events.ts LLM emitters", () => {
      let dir: string;
      let eventsFile: string;
      beforeEach(() => {
        dir = mkdtempSync(resolve(tmpdir(), "turing-events-llm-"));
        initEvents(dir);
        eventsFile = resolve(dir, "logs", "events.jsonl");
      });
      afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

      test("emitLlmRequest carries provider/model/full prompt inline (R11)", () => {
        setCycleContext(1, "frames/f000-strategy");
        const prompt = "## State\nempty\n\n[long prompt body]";
        emitLlmRequest("api", "claude-haiku-4-5-20251001", prompt);
        const ev = JSON.parse(readFileSync(eventsFile, "utf-8").trim());
        assert.equal(ev.type, "llm_request");
        assert.equal(ev.provider, "api");
        assert.equal(ev.model, "claude-haiku-4-5-20251001");
        assert.equal(ev.prompt, prompt);
      });

      test("emitLlmResponse carries output, duration_ms, optional usage (R12)", () => {
        setCycleContext(1, "frames/f000-strategy");
        emitLlmResponse("OK", 1500, { input_tokens: 200, output_tokens: 50 });
        const ev = JSON.parse(readFileSync(eventsFile, "utf-8").trim());
        assert.equal(ev.type, "llm_response");
        assert.equal(ev.output, "OK");
        assert.equal(ev.duration_ms, 1500);
        assert.deepEqual(ev.usage, { input_tokens: 200, output_tokens: 50 });
      });

      test("emitLlmResponse without usage omits the field", () => {
        setCycleContext(1, "frames/f000-strategy");
        emitLlmResponse("OK", 1500);
        const ev = JSON.parse(readFileSync(eventsFile, "utf-8").trim());
        assert.equal("usage" in ev, false);
      });
    });
    ```

- [ ] **Step 2: Run test to verify it fails**

    Run: `npm test 2>&1 | grep -E "LLM emitters|fail" | head -5`
    Expected: FAIL — missing exports `emitLlmRequest`/`emitLlmResponse`.

- [ ] **Step 3: Write minimal implementation**

    Append to `src/events.ts`:

    ```ts
    export function emitLlmRequest(provider: string, model: string, prompt: string): void {
      emit("llm_request", { provider, model, prompt });
    }
    export function emitLlmResponse(output: string, durationMs: number, usage?: object): void {
      const fields: Record<string, unknown> = { output, duration_ms: durationMs };
      if (usage !== undefined) fields.usage = usage;
      emit("llm_response", fields);
    }
    ```

- [ ] **Step 4: Run test to verify it passes**

    Run: `npm test 2>&1 | tail -10`
    Expected: PASS — 3 new subtests pass.

- [ ] **Step 5: Commit**

    ```bash
    git add src/events.ts src/test/events.test.ts
    git commit -m "feat(events): emitLlmRequest + emitLlmResponse (satisfies: R11, R12)"
    ```

## Task 4: events.ts tool emitters with payload externalization + error path (satisfies: R18, R19, R20, R21, R28)

**Files:**
- Modify: `src/events.ts`
- Test:   `src/test/events.test.ts` (extend)

- [ ] **Step 1: Write the failing test**

    Append a new `describe` block to `src/test/events.test.ts`:

    ```ts
    import { emitToolCall, emitToolResult } from "../events.js";
    import { chmodSync, readdirSync } from "node:fs";

    describe("events.ts tool emitters with payload externalization", () => {
      let dir: string;
      let eventsFile: string;
      let payloadsDir: string;
      beforeEach(() => {
        dir = mkdtempSync(resolve(tmpdir(), "turing-events-tool-"));
        initEvents(dir);
        eventsFile = resolve(dir, "logs", "events.jsonl");
        payloadsDir = resolve(dir, "logs", "payloads");
        setCycleContext(4, "frames/f000-strategy");
      });
      afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

      test("emitToolCall externalizes input to payloads/<seq>-<tool>-input.txt (R18, R20)", () => {
        const ref = emitToolCall("bash", "ls -la");
        const ev = JSON.parse(readFileSync(eventsFile, "utf-8").trim());
        assert.equal(ev.type, "tool_call");
        assert.equal(ev.tool, "bash");
        assert.equal(ev.payload_ref, ref);
        assert.equal(ev.payload_ref, `payloads/${ev.seq}-bash-input.txt`);
        const payloadFile = resolve(dir, "logs", ev.payload_ref);
        assert.equal(readFileSync(payloadFile, "utf-8"), "ls -la");
      });

      test("emitToolResult externalizes output and carries error flag (R19, R20)", () => {
        const ref = emitToolResult("bash", "exit code 1\nstderr: boom", true);
        const ev = JSON.parse(readFileSync(eventsFile, "utf-8").trim());
        assert.equal(ev.type, "tool_result");
        assert.equal(ev.tool, "bash");
        assert.equal(ev.error, true);
        assert.equal(ev.payload_ref, ref);
        assert.equal(ev.payload_ref, `payloads/${ev.seq}-bash-output.txt`);
        const payloadFile = resolve(dir, "logs", ev.payload_ref);
        assert.equal(readFileSync(payloadFile, "utf-8"), "exit code 1\nstderr: boom");
      });

      test("payload write failure → event still emitted with payload_ref:null + payload_error (R21)", () => {
        // Pre-create payloads/ as a regular file so the mkdir-recursive succeeds
        // but the file write fails (writing to a path that's actually a directory
        // would not work; instead we create a directory at the target file path).
        const targetTool = "writefile";
        // Force the next call to fail by creating a directory at the expected
        // payload-file path. We need the seq up front; the file is named
        // payloads/<seq>-<tool>-input.txt and seq is currently 1 (first emit).
        require("fs").mkdirSync(resolve(payloadsDir), { recursive: true });
        require("fs").mkdirSync(resolve(payloadsDir, "1-writefile-input.txt"));
        const ref = emitToolCall(targetTool, "x");
        const ev = JSON.parse(readFileSync(eventsFile, "utf-8").trim());
        assert.equal(ev.type, "tool_call");
        assert.equal(ev.tool, targetTool);
        assert.equal(ev.payload_ref, null);
        assert.match(ev.payload_error, /EISDIR|directory|illegal/i);
        assert.equal(ref, null);
      });

      test("unknown event type round-trips verbatim (R28)", () => {
        // Forward-compat: events.ts does not whitelist types
        // (this is implicitly tested by _emitForTest in T1, just re-assert here)
        _emitForTest("future_event_type", { custom_field: 42 });
        const lines = readFileSync(eventsFile, "utf-8").trim().split("\n");
        const last = JSON.parse(lines[lines.length - 1]);
        assert.equal(last.type, "future_event_type");
        assert.equal(last.custom_field, 42);
      });
    });
    ```

- [ ] **Step 2: Run test to verify it fails**

    Run: `npm test 2>&1 | grep -E "tool emitters|fail" | head -5`
    Expected: FAIL — missing exports `emitToolCall`/`emitToolResult`.

- [ ] **Step 3: Write minimal implementation**

    Append to `src/events.ts`:

    ```ts
    function sanitizeTool(name: string): string {
      return name.replace(/[^a-z0-9_]/gi, "_").toLowerCase();
    }

    function writePayload(seq: number, tool: string, kind: "input" | "output", body: string): { ref: string | null; err?: string } {
      if (!logsDir) throw new Error("events.ts: initEvents not called");
      const safeName = sanitizeTool(tool);
      const refRel = `payloads/${seq}-${safeName}-${kind}.txt`;
      const abs = resolve(logsDir, refRel);
      try {
        mkdirSync(resolve(logsDir, "payloads"), { recursive: true });
        writeFileSync(abs, body, "utf-8");
        return { ref: refRel };
      } catch (e) {
        return { ref: null, err: e instanceof Error ? e.message : String(e) };
      }
    }

    export function emitToolCall(tool: string, input: string): string | null {
      // Reserve the seq before the payload write so the file name matches the envelope.
      const seq = nextSeq;
      const w = writePayload(seq, tool, "input", input);
      const fields: Record<string, unknown> = { tool, payload_ref: w.ref };
      if (w.err) fields.payload_error = w.err;
      emit("tool_call", fields);
      return w.ref;
    }

    export function emitToolResult(tool: string, output: string, isError: boolean): string | null {
      const seq = nextSeq;
      const w = writePayload(seq, tool, "output", output);
      const fields: Record<string, unknown> = { tool, payload_ref: w.ref, error: isError };
      if (w.err) fields.payload_error = w.err;
      emit("tool_result", fields);
      return w.ref;
    }
    ```

- [ ] **Step 4: Run test to verify it passes**

    Run: `npm test 2>&1 | tail -10`
    Expected: PASS — 4 new subtests pass.

- [ ] **Step 5: Commit**

    ```bash
    git add src/events.ts src/test/events.test.ts
    git commit -m "feat(events): tool emitters externalize payloads to logs/payloads/ + R21 error path (satisfies: R18, R19, R20, R21, R28)"
    ```

## Task 5: providers/shared.ts — extend CycleResult with events; export ProviderEvent (enabler)

**Files:**
- Modify: `src/providers/shared.ts`
- Test:   `src/test/provider-events.test.ts` (new)

- [ ] **Step 1: Write the failing test**

    Create `src/test/provider-events.test.ts`:

    ```ts
    import { test, describe } from "node:test";
    import { strict as assert } from "node:assert";
    import type { CycleResult, ProviderEvent } from "../providers/shared.js";

    describe("providers/shared.ts CycleResult shape", () => {
      test("CycleResult.events is a ProviderEvent[]", () => {
        const result: CycleResult = {
          halt: false,
          events: [
            { type: "llm_request", provider: "api", model: "x", prompt: "p" },
            { type: "tool_call", tool: "bash", input: "ls" },
            { type: "tool_result", tool: "bash", output: "OK", isError: false },
            { type: "llm_response", output: "done", durationMs: 100 },
            { type: "retry", attempt: 1, reason: "no state change" },
          ],
        };
        assert.equal(result.events.length, 5);
      });

      test("ProviderEvent discriminates by type", () => {
        const ev: ProviderEvent = { type: "llm_request", provider: "p", model: "m", prompt: "x" };
        assert.equal(ev.type, "llm_request");
        if (ev.type === "llm_request") assert.equal(ev.provider, "p"); // type narrowing
      });
    });
    ```

- [ ] **Step 2: Run test to verify it fails**

    Run: `npm test 2>&1 | grep -E "provider-events|ProviderEvent|fail" | head -5`
    Expected: FAIL — `Property 'events' does not exist on type 'CycleResult'` (TS) or import error.

- [ ] **Step 3: Write minimal implementation**

    Edit `src/providers/shared.ts`:

    ```ts
    // Replace the existing CycleResult export and add ProviderEvent above it.

    export type ProviderEvent =
      | { type: "llm_request"; provider: string; model: string; prompt: string }
      | { type: "llm_response"; output: string; durationMs: number; usage?: object }
      | { type: "tool_call"; tool: string; input: string }
      | { type: "tool_result"; tool: string; output: string; isError: boolean }
      | { type: "retry"; attempt: number; reason: string };

    export type CycleResult = {
      halt: boolean;
      haltMessage?: string;
      noMatch?: boolean;
      summary?: string;
      events: ProviderEvent[];
    };
    ```

- [ ] **Step 4: Run test to verify it passes**

    Run: `npm run build 2>&1 | tail -10 && npm test 2>&1 | tail -10`
    Expected: build clean (TypeScript may report errors in providers — those will be fixed in T6); test PASS for provider-events shape.

    NOTE: at this step the providers are not yet returning `events` so `npm run build` will report TS errors in `src/providers/{api,claude-code,openai,ollama,local}.ts`. That's expected — T6 fixes them. To make this task self-contained, mark `events` as optional in T5 with `events?: ProviderEvent[]`, then T6 makes it required after every provider is wired.

    Update T5's implementation accordingly:

    ```ts
    export type CycleResult = {
      halt: boolean;
      haltMessage?: string;
      noMatch?: boolean;
      summary?: string;
      events?: ProviderEvent[];   // optional in T5; T6 makes it required
    };
    ```

    Re-run: `npm run build 2>&1 | tail -3 && npm test 2>&1 | tail -10`
    Expected: build clean, all tests pass.

- [ ] **Step 5: Commit**

    ```bash
    git add src/providers/shared.ts src/test/provider-events.test.ts
    git commit -m "feat(providers): extend CycleResult with optional events: ProviderEvent[] (satisfies: T5 enabler)"
    ```

## Task 6: All providers populate ProviderEvent buffer (no events.ts import) (satisfies: R11, R12, R15, R18, R19)

**Files:**
- Modify: `src/providers/api.ts`, `src/providers/claude-code.ts`, `src/providers/openai.ts`, `src/providers/ollama.ts`, `src/providers/local.ts`, `src/providers/shared.ts` (make `events` required)
- Test:   `src/test/provider-events.test.ts` (extend)

- [ ] **Step 1: Write the failing test**

    Append to `src/test/provider-events.test.ts`:

    ```ts
    import { readFileSync, readdirSync } from "node:fs";
    import { resolve } from "node:path";

    describe("providers do not import events.ts", () => {
      const providerFiles = [
        "src/providers/api.ts",
        "src/providers/claude-code.ts",
        "src/providers/openai.ts",
        "src/providers/ollama.ts",
        "src/providers/local.ts",
      ];

      for (const f of providerFiles) {
        test(`${f} has no import from "../events"`, () => {
          const src = readFileSync(resolve(process.cwd(), f), "utf-8");
          assert.equal(/from\s+["']\.\.\/events(\.js)?["']/.test(src), false,
            `${f} must not import events.ts (B-architecture)`);
        });
      }
    });
    ```

- [ ] **Step 2: Run test to verify it fails**

    Run: `npm test 2>&1 | grep -E "no import from|fail" | head -10`
    Expected: PASS at this point (no provider has imported events.ts yet) — the test guards future regressions. Then proceed to step 3 to actually wire the events buffers; after step 3 the test still passes.

- [ ] **Step 3: Write minimal implementation**

    For EACH of `src/providers/{api,openai,local}.ts`, add at the top of `runCycle`:

    ```ts
    import type { ProviderEvent } from "./shared.js";   // (add to existing imports)

    // Inside runCycle, before the retry loop:
    const events: ProviderEvent[] = [];
    ```

    Then surround each LLM API call with:

    ```ts
    const t0Llm = Date.now();
    events.push({ type: "llm_request", provider: "api", model: MODEL, prompt: <full prompt string> });
    const response = await client.messages.create({ ... });   // existing
    events.push({
      type: "llm_response",
      output: <extracted final text>,
      durationMs: Date.now() - t0Llm,
      usage: response.usage,   // or equivalent
    });
    ```

    For the **api.ts** specifically (uses `userPrompt` + `systemPrompt` already), the prompt argument is `${systemPrompt}\n\n${userPrompt}` (concatenated for the event).

    At each tool-call site (where the existing code calls `executeTool`), add:

    ```ts
    events.push({ type: "tool_call", tool: toolUse.name, input: JSON.stringify(input) });
    const result = await executeTool(...);
    events.push({ type: "tool_result", tool: toolUse.name, output: result.output, isError: result.error });
    ```

    At each retry log site (`log(\`  [retry ${attempt + 1}] ${reason}\`)`), also push:

    ```ts
    events.push({ type: "retry", attempt: attempt + 1, reason: <reason> });
    ```

    At every `return { halt: ..., ... }`, change to `return { halt: ..., ..., events }`.

    For **claude-code.ts**: only emit one `llm_request` (with the prompt sent to `claude -p`) and one `llm_response` (with the parsed `result` text). No `tool_call`/`tool_result` events from CC — its tool calls are subprocess-internal.

    For **ollama.ts**: same shape as api.ts. In stateful mode, the `tool_call`/`tool_result` events do not apply — only `llm_request`/`llm_response`. The non-stateful tool loop uses the same pattern as api.ts.

    Finally, in `src/providers/shared.ts`, change `events?:` to `events:` (required) and update existing `return` statements anywhere in providers to include `events`.

- [ ] **Step 4: Run test to verify it passes**

    Run: `npm run build 2>&1 | tail -5 && npm test 2>&1 | tail -10`
    Expected: build clean, all tests pass (the no-import guard test passes; existing provider tests pass).

- [ ] **Step 5: Commit**

    ```bash
    git add src/providers/ src/test/provider-events.test.ts
    git commit -m "feat(providers): buffer LLM/tool/retry events into CycleResult.events (satisfies: R11, R12, R15, R18, R19)"
    ```

## Task 7: main.ts — initEvents + setCycleContext + structural emits (satisfies: R5, R6, R7, R8, R9, R10, R13, R14, R16, R17)

**Files:**
- Modify: `src/main.ts`, `src/git.ts` (return commit hash from `commitMachineGit` so main can emit it)
- Test:   `src/test/main-emits.test.ts` (new — minimal smoke; full coverage via T13 demos)

- [ ] **Step 1: Write the failing test**

    Create `src/test/main-emits.test.ts`:

    ```ts
    import { test, describe, beforeEach, afterEach } from "node:test";
    import { strict as assert } from "node:assert";
    import { mkdtempSync, readFileSync, rmSync, existsSync } from "node:fs";
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
    ```

- [ ] **Step 2: Run test to verify it fails**

    Run: `npm test 2>&1 | grep -E "main.ts event emit|fail" | head -5`
    Expected: PASS (this test exercises events.ts only — it guards the convention main.ts will follow). Then proceed to wire main.ts in step 3.

- [ ] **Step 3: Write minimal implementation**

    In `src/git.ts`, change `commitAll` to return the short hash:

    ```ts
    export function commitAll(message: string, baseDir: string): string {
      // existing logic ...
      const hash = run(`git rev-parse --short HEAD`, baseDir).trim();
      log(`  [machine-git] ${hash} — ${message}`);
      return hash;
    }
    ```

    In `src/main.ts`:

    Add to the imports:
    ```ts
    import {
      initEvents, setCycleContext, clearCycleContext,
      emitCycleStart, emitCycleEnd, emitPush, emitPop, emitSplice,
      emitMachineGitCommit, emitInstructionsChanged, emitError, emitHalt, emitRetry,
    } from "./events.js";
    ```

    In `runMain()`, immediately after `initLog(BASE_DIR)`:
    ```ts
    initEvents(BASE_DIR);
    clearCycleContext();
    ```

    Inside `runStackBlock`, where each `applyPop` event is logged:
    ```ts
    for (const ev of popped.events) {
      rmSync(resolve(BASE_DIR, ev.frameDir), { recursive: true, force: true });
      log(`  [pop] → ${ev.returnState}_completed (depth ${ev.depthAfter})`);
      if (ev.splicedKeys && ev.splicedKeys.length > 0) {
        emitSplice(popped.callerFrameDir, ev.splicedKeys);
      }
      emitPop(ev.frameDir, ev.returnState, ev.depthAfter);
      // ... existing missingReturn / malformedLines logs ...
    }
    ```

    After the successful push:
    ```ts
    log(`  [push] ${pushed.target} → ${pushed.frameDir} (depth ${pushed.callStack.stack.length - 1})`);
    emitPush(pushed.target, pushed.frameDir, pushed.callStack.stack.length - 1);
    ```

    Inside the main loop, around the cycle:
    ```ts
    const fd2 = resolve(BASE_DIR, callStack.stack[callStack.stack.length - 1].frameDir);
    setCycleContext(cycle, callStack.stack[callStack.stack.length - 1].frameDir);
    emitCycleStart();
    log(`--- Cycle ${cycle} (frame: ${fd2}) ---`);
    const t0 = Date.now();

    // ... existing cycle body, including runCycle() ...

    // After runCycle returns and the cycle's MEMORY/INSTRUCTIONS are written:
    const newState = getMemoryState(activeFramePaths(callStack).memoryPath);
    const instructionsBytesAfter = readFileSync(activeFramePaths(callStack).instructionsPath, "utf-8").length;
    if (instructionsBytesAfter !== instructionsBytesBefore) {
      emitInstructionsChanged(instructionsBytesBefore, instructionsBytesAfter);
    }
    const hash = commitAll(`cycle ${cycle}: ${newState}`, BASE_DIR);
    emitMachineGitCommit(hash, `cycle ${cycle}: ${newState}`);
    emitCycleEnd(newState, Date.now() - t0);
    ```

    Add `emitError` to the top-level `runMain()` `try/catch`:
    ```ts
    runMain().catch((err: unknown) => {
      try { emitError(err instanceof Error ? err : new Error(String(err))); } catch { /* logs may be uninitialized */ }
      console.error("Fatal error:", err);
      process.exit(1);
    });
    ```

    Add `emitHalt` at every halt site:
    - `done`: in the main loop, when `runStackBlock` returns true:
      ```ts
      log(`\nMachine halted: done`);
      clearCycleContext();
      emitHalt("done");
      ```
    - `quota_exceeded`: in the catch path for `QuotaExceededError`:
      ```ts
      clearCycleContext();
      emitHalt("quota_exceeded");
      ```
    - SIGINT handler:
      ```ts
      process.on("SIGINT", () => {
        log("\nInterrupted — exiting.");
        try { clearCycleContext(); emitHalt("signal"); } catch {}
        process.exit(0);
      });
      ```

    Add `emitRetry` inside `withRetry` (the helper that wraps the cycle invocation):
    ```ts
    log(`  [${opts.label}] retrying in ${delay}s... (attempt ${attempt + 1}/${maxRetries})`);
    emitRetry(attempt + 1, opts.label);
    ```

- [ ] **Step 4: Run test to verify it passes**

    Run: `npm run build 2>&1 | tail -5 && npm test 2>&1 | tail -10`
    Expected: build clean; all tests pass; the convention smoke test from Step 1 passes.

- [ ] **Step 5: Commit**

    ```bash
    git add src/main.ts src/git.ts src/test/main-emits.test.ts
    git commit -m "feat(main): initEvents, setCycleContext per cycle, structural emits at push/pop/splice/git/error/halt sites (satisfies: R5, R6, R7, R8, R9, R10, R13, R14, R16, R17)"
    ```

## Task 8: main.ts — drain CycleResult.events into events.ts (satisfies: R11, R12, R15, R18, R19)

**Files:**
- Modify: `src/main.ts`
- Test:   `src/test/provider-events-drain.test.ts` (new)

- [ ] **Step 1: Write the failing test**

    Create `src/test/provider-events-drain.test.ts`:

    ```ts
    import { test, describe, beforeEach, afterEach } from "node:test";
    import { strict as assert } from "node:assert";
    import { mkdtempSync, readFileSync, rmSync } from "node:fs";
    import { resolve } from "node:path";
    import { tmpdir } from "node:os";
    import { initEvents, setCycleContext } from "../events.js";
    import { drainProviderEvents } from "../main.js";   // exported for testing
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
    ```

- [ ] **Step 2: Run test to verify it fails**

    Run: `npm test 2>&1 | grep -E "drainProviderEvents|drain|fail" | head -5`
    Expected: FAIL — `drainProviderEvents` not exported from `main.ts`.

- [ ] **Step 3: Write minimal implementation**

    In `src/main.ts`, add after the existing event imports:

    ```ts
    import { emitToolCall, emitToolResult, emitLlmRequest, emitLlmResponse } from "./events.js";
    import type { ProviderEvent } from "./providers/shared.js";

    export function drainProviderEvents(events: ProviderEvent[]): void {
      for (const ev of events) {
        switch (ev.type) {
          case "llm_request":
            emitLlmRequest(ev.provider, ev.model, ev.prompt);
            break;
          case "llm_response":
            emitLlmResponse(ev.output, ev.durationMs, ev.usage);
            break;
          case "tool_call":
            emitToolCall(ev.tool, ev.input);
            break;
          case "tool_result":
            emitToolResult(ev.tool, ev.output, ev.isError);
            break;
          case "retry":
            emitRetry(ev.attempt, ev.reason);
            break;
        }
      }
    }
    ```

    In the main loop, immediately after `runCycle` returns, before any other emits:

    ```ts
    const result = await withRetry(() => runCycle(ip2, mp2), { ... });
    drainProviderEvents(result.events);
    ```

- [ ] **Step 4: Run test to verify it passes**

    Run: `npm run build 2>&1 | tail -5 && npm test 2>&1 | tail -10`
    Expected: build clean; drain test passes.

- [ ] **Step 5: Commit**

    ```bash
    git add src/main.ts src/test/provider-events-drain.test.ts
    git commit -m "feat(main): drain CycleResult.events through events.ts emitters after each cycle (satisfies: R11, R12, R15, R18, R19)"
    ```

## Task 9: logger.ts trim — drop run-<ts>.log mirror, preserve stdout (satisfies: R22, R23)

**Files:**
- Modify: `src/logger.ts`, `src/main.ts` (remove the `Log:` startup line that pointed at the deleted file)
- Test:   `src/test/logger.test.ts` (new)

- [ ] **Step 1: Write the failing test**

    Create `src/test/logger.test.ts`:

    ```ts
    import { test, describe, beforeEach, afterEach } from "node:test";
    import { strict as assert } from "node:assert";
    import { mkdtempSync, readdirSync, rmSync } from "node:fs";
    import { resolve } from "node:path";
    import { tmpdir } from "node:os";
    import { initLog, log, getLogPath } from "../logger.js";

    describe("logger.ts (post-better-logging)", () => {
      let dir: string;
      const origStdout = process.stdout.write;
      let captured = "";
      beforeEach(() => {
        dir = mkdtempSync(resolve(tmpdir(), "turing-logger-"));
        captured = "";
        // @ts-ignore
        process.stdout.write = (s: string) => { captured += s; return true; };
      });
      afterEach(() => {
        // @ts-ignore
        process.stdout.write = origStdout;
        rmSync(dir, { recursive: true, force: true });
      });

      test("initLog does NOT create a logs/run-<ts>.log file (R23)", () => {
        initLog(dir);
        const logsDir = resolve(dir, "logs");
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
    });
    ```

- [ ] **Step 2: Run test to verify it fails**

    Run: `npm test 2>&1 | grep -E "logger.ts.*post-better|fail" | head -5`
    Expected: FAIL — current `initLog` creates `run-<ts>.log`; `getLogPath` returns a path string.

- [ ] **Step 3: Write minimal implementation**

    Replace `src/logger.ts` body:

    ```ts
    // src/logger.ts — stdout-only after better-logging.
    // The structured event stream lives in src/events.ts; this module no longer
    // mirrors stdout to a file (R23). Kept as a thin pass-through so the many
    // existing log() call sites need no change (R22).

    export function initLog(_baseDir: string): void {
      // No-op. Retained so call sites that called initLog() pre-better-logging
      // don't need to be edited. Future: remove call site and delete this fn.
    }

    export function log(message: string): void {
      console.log(message);
    }

    export function logRaw(_message: string): void {
      // Pre-better-logging this wrote diagnostic detail to the file mirror.
      // The file mirror is gone; structured detail lives in events.jsonl.
      // Kept as a no-op so existing call sites compile until they're audited.
    }

    export function getLogPath(): string | null {
      return null;
    }
    ```

    In `src/main.ts`, drop the line `log(\`  Log:          ${getLogPath()}\`);` from the startup banner (it now points at nothing).

- [ ] **Step 4: Run test to verify it passes**

    Run: `npm run build 2>&1 | tail -5 && npm test 2>&1 | tail -10`
    Expected: build clean; logger tests pass; existing tests still pass.

- [ ] **Step 5: Commit**

    ```bash
    git add src/logger.ts src/main.ts src/test/logger.test.ts
    git commit -m "feat(logger): drop run-<ts>.log mirror; stdout unchanged (satisfies: R22, R23)"
    ```

## Task 10: visualizer.html — events panel scoped by selection, chronological order (satisfies: R24, R25, R28)

**Files:**
- Modify: `visualizer.html`
- Test:   manual (server-rendered HTML; smoke via curl + node script as in the existing visualizer rewrite)

- [ ] **Step 1: Write the failing test**

    Create `src/test/visualizer-events-smoke.test.ts`:

    ```ts
    import { test, describe } from "node:test";
    import { strict as assert } from "node:assert";
    import { readFileSync } from "node:fs";
    import { resolve } from "node:path";

    describe("visualizer.html events panel scaffold", () => {
      const html = readFileSync(resolve(process.cwd(), "visualizer.html"), "utf-8");

      test("declares an events panel container (R24)", () => {
        assert.match(html, /id=["']eventsPanel["']/);
      });

      test("loads events.jsonl from the instance dir (R28)", () => {
        assert.match(html, /events\.jsonl/);
      });

      test("renders events filtered by selectedCycleNum + selectedFrameDir (R24, R25)", () => {
        // Selection-driven filter: the function that picks events must reference
        // both selection variables already in the file.
        assert.match(html, /selectedCycleNum/);
        assert.match(html, /selectedFrameDir/);
        assert.match(html, /renderEvents/);
      });
    });
    ```

- [ ] **Step 2: Run test to verify it fails**

    Run: `npm test 2>&1 | grep -E "visualizer-events-smoke|fail" | head -5`
    Expected: FAIL — `events.jsonl` and `renderEvents` not yet referenced in `visualizer.html`.

- [ ] **Step 3: Write minimal implementation**

    Edit `visualizer.html`:

    1. Add a new panel after the existing "Frame Files" panel:
       ```html
       <div class="panel">
         <div class="panel-header">
           <span>Events</span>
           <span id="eventsScopeLabel" style="color:#8b949e;font-weight:normal;text-transform:none;font-size:0.95em;"></span>
         </div>
         <div class="panel-body" id="eventsPanel"><span class="empty-hint">Load an instance to see events.</span></div>
       </div>
       ```

    2. In the JS, add an `events` array loaded from `events.jsonl`:
       ```js
       let allEvents = [];   // every event for this instance, in seq order

       async function loadEvents() {
         const text = await readFile(`${instanceDir}/logs/events.jsonl`);
         if (!text) { allEvents = []; return; }
         allEvents = text.trim().split("\n").map(l => {
           try { return JSON.parse(l); } catch { return null; }
         }).filter(e => e !== null);
         allEvents.sort((a, b) => a.seq - b.seq);   // R28: chronological by seq
       }
       ```

    3. Call `await loadEvents()` inside `loadInstance()` after `await loadLatestLog()`.

    4. Add `renderEvents()`:
       ```js
       function renderEvents() {
         const panel = document.getElementById('eventsPanel');
         const scopeLabel = document.getElementById('eventsScopeLabel');
         if (allEvents.length === 0) {
           panel.innerHTML = '<span class="empty-hint">No events.jsonl found — instance predates better-logging.</span>';
           scopeLabel.textContent = '';
           return;
         }

         const cycle = getSelectedCycle();
         const cycleNum = cycle ? cycle.num : null;

         // R24: scope by current selection. Live = show all events with cycle==latest.
         let filtered = allEvents;
         if (cycleNum !== null && cycleNum !== -1) {
           filtered = filtered.filter(e => e.cycle === cycleNum);
         }
         if (selectedFrameDir) {
           filtered = filtered.filter(e => e.frame === selectedFrameDir || e.frame === null);
         }

         scopeLabel.textContent = `— cycle ${cycleNum === -1 ? 'live' : cycleNum ?? '(all)'} / frame ${selectedFrameDir ?? '(any)'} — ${filtered.length} events`;

         if (filtered.length === 0) {
           panel.innerHTML = '<span class="empty-hint">No events match the current selection.</span>';
           return;
         }

         panel.innerHTML = filtered.map(e =>
           `<div style="margin-bottom:6px;padding:4px 8px;border-left:2px solid ${eventColor(e.type)};">
             <span style="color:#8b949e;font-size:0.78em;">#${e.seq} ${e.ts.slice(11,19)}</span>
             <span style="color:${eventColor(e.type)};font-weight:bold;">  ${e.type}</span>
             <span style="color:#c9d1d9;">  ${eventSummary(e)}</span>
           </div>`
         ).join("");
       }

       function eventColor(type) {
         const map = {
           cycle_start: '#79c0ff', cycle_end: '#79c0ff',
           push: '#3fb950', pop: '#d29922', splice: '#d2a8ff',
           tool_call: '#58a6ff', tool_result: '#58a6ff',
           llm_request: '#f0f6fc', llm_response: '#f0f6fc',
           machine_git_commit: '#8b949e', instructions_changed: '#8b949e',
           retry: '#d29922', error: '#f85149', halt: '#f85149',
         };
         return map[type] || '#c9d1d9';
       }

       function eventSummary(e) {
         switch (e.type) {
           case 'cycle_end': return `${e.state} (${e.duration_ms}ms)`;
           case 'push': return `${e.target} → ${e.frameDir} depth ${e.depth}`;
           case 'pop': return `${e.frameDir} → ${e.returnState} depth ${e.depth}`;
           case 'splice': return `[${(e.splicedKeys||[]).join(', ')}] → ${e.targetFrame}`;
           case 'tool_call': return `${e.tool} → ${e.payload_ref || '(no payload)'}`;
           case 'tool_result': return `${e.tool} ${e.error ? '✗' : '✓'} → ${e.payload_ref || '(no payload)'}`;
           case 'machine_git_commit': return `${e.hash} — ${e.subject}`;
           case 'llm_request': return `${e.provider}/${e.model} (${(e.prompt||'').length}B)`;
           case 'llm_response': return `(${(e.output||'').length}B, ${e.duration_ms}ms)`;
           case 'instructions_changed': return `${e.bytes_before}B → ${e.bytes_after}B`;
           case 'retry': return `attempt ${e.attempt} — ${e.reason}`;
           case 'error': return e.message;
           case 'halt': return e.reason;
           default: return JSON.stringify(e).slice(0, 100);
         }
       }
       ```

    5. Call `renderEvents()` inside `renderSelectedCycle()` (after `renderFilePanel()`).

- [ ] **Step 4: Run test to verify it passes**

    Run: `npm test 2>&1 | grep -E "visualizer-events|pass|fail" | tail -10`
    Expected: PASS — three subtests pass.

- [ ] **Step 5: Commit**

    ```bash
    git add visualizer.html src/test/visualizer-events-smoke.test.ts
    git commit -m "feat(visualizer): events panel scoped by cycle/frame selection in seq order (satisfies: R24, R25, R28)"
    ```

## Task 11: visualizer.html — event-type toggle (satisfies: R26)

**Files:**
- Modify: `visualizer.html`
- Test:   `src/test/visualizer-events-smoke.test.ts` (extend)

- [ ] **Step 1: Write the failing test**

    Append to `src/test/visualizer-events-smoke.test.ts`:

    ```ts
    test("event-type filter UI present (R26)", () => {
      const html = readFileSync(resolve(process.cwd(), "visualizer.html"), "utf-8");
      assert.match(html, /id=["']eventTypeFilters["']/);
      assert.match(html, /enabledEventTypes/);
    });
    ```

- [ ] **Step 2: Run test to verify it fails**

    Run: `npm test 2>&1 | grep -E "event-type filter|fail" | head -5`
    Expected: FAIL — `eventTypeFilters` not yet present.

- [ ] **Step 3: Write minimal implementation**

    In `visualizer.html`:

    1. Inside the events panel header, add:
       ```html
       <div id="eventTypeFilters" style="display:flex;gap:6px;flex-wrap:wrap;font-weight:normal;text-transform:none;letter-spacing:0;font-size:0.85em;"></div>
       ```

    2. Add JS state and a render function:
       ```js
       const ALL_EVENT_TYPES = [
         'cycle_start','cycle_end','push','pop','splice',
         'llm_request','llm_response','tool_call','tool_result',
         'machine_git_commit','instructions_changed','retry','error','halt',
       ];
       const enabledEventTypes = new Set(ALL_EVENT_TYPES);

       function renderEventTypeFilters() {
         const c = document.getElementById('eventTypeFilters');
         c.innerHTML = '';
         // Include any unknown types present in this run too (R28 forward-compat).
         const types = new Set(ALL_EVENT_TYPES);
         for (const e of allEvents) types.add(e.type);
         for (const t of [...types].sort()) {
           const id = `evt_${t}`;
           const cb = document.createElement('label');
           cb.style.color = enabledEventTypes.has(t) ? eventColor(t) : '#30363d';
           cb.style.cursor = 'pointer';
           cb.innerHTML = `<input type="checkbox" id="${id}" ${enabledEventTypes.has(t) ? 'checked' : ''} style="vertical-align:middle;"/> ${t}`;
           cb.querySelector('input').onchange = (e) => {
             if (e.target.checked) enabledEventTypes.add(t);
             else enabledEventTypes.delete(t);
             renderEventTypeFilters();
             renderEvents();
           };
           c.appendChild(cb);
         }
       }
       ```

    3. Inside `renderEvents()`, after the cycle/frame filter:
       ```js
       filtered = filtered.filter(e => enabledEventTypes.has(e.type));
       ```

    4. Call `renderEventTypeFilters()` once after `loadEvents()` completes (in `loadInstance()`).

- [ ] **Step 4: Run test to verify it passes**

    Run: `npm test 2>&1 | tail -5`
    Expected: PASS.

- [ ] **Step 5: Commit**

    ```bash
    git add visualizer.html src/test/visualizer-events-smoke.test.ts
    git commit -m "feat(visualizer): per-type event filter checkboxes (satisfies: R26)"
    ```

## Task 12: visualizer.html — tool payload fetch + detail view (satisfies: R27)

**Files:**
- Modify: `visualizer.html`
- Test:   `src/test/visualizer-events-smoke.test.ts` (extend)

- [ ] **Step 1: Write the failing test**

    Append to `src/test/visualizer-events-smoke.test.ts`:

    ```ts
    test("clicking a tool event fetches its payload_ref (R27)", () => {
      const html = readFileSync(resolve(process.cwd(), "visualizer.html"), "utf-8");
      assert.match(html, /openPayload|fetchPayload/);
      assert.match(html, /payload_ref/);
    });
    ```

- [ ] **Step 2: Run test to verify it fails**

    Run: `npm test 2>&1 | grep -E "tool event fetches|fail" | head -5`
    Expected: FAIL — `openPayload` not yet defined.

- [ ] **Step 3: Write minimal implementation**

    In `visualizer.html`:

    1. Add a payload modal/inline detail under the events panel:
       ```html
       <div class="panel" id="payloadPanel" style="display:none;">
         <div class="panel-header">
           <span>Payload</span>
           <span id="payloadLabel" style="color:#8b949e;font-weight:normal;text-transform:none;font-size:0.95em;"></span>
           <button onclick="closePayload()" style="margin-left:auto;background:#21262d;border:1px solid #30363d;color:#c9d1d9;padding:2px 10px;border-radius:4px;cursor:pointer;font-family:inherit;font-size:0.8em;">Close</button>
         </div>
         <div class="panel-body" id="payloadBody"></div>
       </div>
       ```

    2. JS:
       ```js
       async function openPayload(ref) {
         if (!ref) return;
         const text = await readFile(`${instanceDir}/logs/${ref}`);
         document.getElementById('payloadLabel').textContent = ref;
         document.getElementById('payloadBody').textContent = text || '(payload file empty or missing)';
         document.getElementById('payloadPanel').style.display = '';
         document.getElementById('payloadPanel').scrollIntoView({ behavior: 'smooth' });
       }

       function closePayload() {
         document.getElementById('payloadPanel').style.display = 'none';
       }
       ```

    3. In `renderEvents()`, wrap tool_call/tool_result rows with an onclick:
       ```js
       const clickHandler = (e.type === 'tool_call' || e.type === 'tool_result') && e.payload_ref
         ? `onclick="openPayload('${e.payload_ref}')" style="cursor:pointer;"`
         : '';
       // and apply clickHandler to the surrounding div
       ```

       (Update the existing `renderEvents` template literal: add `${clickHandler}` to the wrapping `<div>`.)

- [ ] **Step 4: Run test to verify it passes**

    Run: `npm test 2>&1 | tail -5`
    Expected: PASS.

- [ ] **Step 5: Commit**

    ```bash
    git add visualizer.html src/test/visualizer-events-smoke.test.ts
    git commit -m "feat(visualizer): click tool event to fetch and render its payload (satisfies: R27)"
    ```

## Task 13: Wipe `instances/`, run all four Group-1 demos, write notes (satisfies: R31, R32)

**Files:**
- Delete: `instances/*` (all existing instance directories)
- Create: `instances/bl-a/`, `instances/bl-b/`, `instances/bl-c/`, `instances/bl-d/` via `new-instance.sh`
- Create: `docs/agent-workflows/better-logging-notes.md`

- [ ] **Step 1: Write the failing test**

    Create `src/test/better-logging-demo.test.ts`:

    ```ts
    import { test, describe } from "node:test";
    import { strict as assert } from "node:assert";
    import { existsSync, readFileSync } from "node:fs";
    import { resolve } from "node:path";

    describe("better-logging live demos (R32)", () => {
      const instances = ["bl-a", "bl-b", "bl-c", "bl-d"];

      for (const name of instances) {
        test(`${name}/logs/events.jsonl exists and is valid JSONL`, () => {
          const path = resolve(process.cwd(), "instances", name, "logs", "events.jsonl");
          assert.equal(existsSync(path), true, `${path} must exist after running the demo`);
          const lines = readFileSync(path, "utf-8").trim().split("\n");
          assert.ok(lines.length > 0, `${path} must contain at least one event`);
          for (const l of lines) JSON.parse(l);   // throws if any line is malformed
        });

        test(`${name}/logs/events.jsonl seqs strictly increase`, () => {
          const path = resolve(process.cwd(), "instances", name, "logs", "events.jsonl");
          const lines = readFileSync(path, "utf-8").trim().split("\n").map(l => JSON.parse(l));
          for (let i = 1; i < lines.length; i++) {
            assert.equal(lines[i].seq, lines[i - 1].seq + 1, `seq gap at line ${i}`);
          }
        });
      }

      test("bl-d reaches depth 2 (push event with depth: 2 present)", () => {
        const path = resolve(process.cwd(), "instances", "bl-d", "logs", "events.jsonl");
        const lines = readFileSync(path, "utf-8").trim().split("\n").map(l => JSON.parse(l));
        const depth2Push = lines.find(e => e.type === "push" && e.depth === 2);
        assert.ok(depth2Push, "bl-d must reach depth 2 (R32: only d-cove exercises depth-2)");
      });
    });
    ```

- [ ] **Step 2: Run test to verify it fails**

    Run: `npm test 2>&1 | grep -E "better-logging live demos|fail" | head -5`
    Expected: FAIL — `instances/bl-*` directories don't exist yet.

- [ ] **Step 3: Wipe + recreate + run + write notes**

    ```bash
    # 1. Wipe pre-existing instances (R31).
    ls instances/    # confirm what you're about to delete
    rm -rf instances/*

    # 2. Recreate the four demo instances.
    ./new-instance.sh bl-a interpreters/1-iterative-refinement/a-self-refine
    ./new-instance.sh bl-b interpreters/1-iterative-refinement/b-evaluator-optimizer
    ./new-instance.sh bl-c interpreters/1-iterative-refinement/c-reflexion
    ./new-instance.sh bl-d interpreters/1-iterative-refinement/d-cove
    ```

    Then copy the same demo PROGRAM.md files used in p2b-{a,b,c,d} (or write fresh ones — the existing ones are documented in `docs/agent-workflows/phase-2b-notes.md`).

    Run each instance to halt:
    ```bash
    instances/bl-a/run.sh
    instances/bl-b/run.sh
    instances/bl-c/run.sh
    instances/bl-d/run.sh
    ```

    After each run, verify `logs/events.jsonl` exists and contains the expected event types.

    Write `docs/agent-workflows/better-logging-notes.md` with one section per instance covering: cycle count, halt reason, surprise findings (e.g. event-type frequency, payload size distribution, anything the visualizer surfaced that wasn't visible in stdout). Mirror the structure of `docs/agent-workflows/phase-2b-notes.md`.

- [ ] **Step 4: Run test to verify it passes**

    Run: `npm test 2>&1 | tail -10`
    Expected: PASS — all `better-logging live demos` subtests pass, including the bl-d depth-2 invariant.

- [ ] **Step 5: Commit**

    ```bash
    git add instances/ docs/agent-workflows/better-logging-notes.md src/test/better-logging-demo.test.ts
    git commit -m "demo(better-logging): wipe pre-feature instances, run bl-{a,b,c,d}, capture notes (satisfies: R31, R32)"
    ```
