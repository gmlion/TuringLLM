# Design: better-logging

## Overview

Replace the run-scoped text log file with a per-instance append-only event stream (`logs/events.jsonl`) backed by a tiny `src/events.ts` emitter. **`src/main.ts` is the SOLE importer of `events.ts`** — providers stay observability-agnostic. Per-cycle LLM and tool events are buffered into `CycleResult.events: ProviderEvent[]` by each provider as its tool loop runs; after `runCycle()` returns, `main.ts` iterates the buffer and emits each via the typed helpers. Stdout output is unchanged: existing `log()` calls continue to print to console; events.ts adds the structured channel beside them. Tool inputs/outputs are externalized to `logs/payloads/<seq>-<tool>-{input,output}.txt` regardless of size; LLM I/O stays inline. The visualizer reuses its existing cycle-timeline + stack-graph selection to scope an events panel and fetches payload files on demand. **Trade-off vs. R29 (note in Open questions):** buffering in `CycleResult` means a crash inside a provider loses that cycle's buffered events, not just one event. For post-mortem inspection of completed runs this is acceptable; if R29 must be tightened, providers would have to import events.ts directly.

## Requirement coverage

| R# | Summary | Addressed in |
| -- | ------- | ------------ |
| R1 | One JSON event per line in `logs/events.jsonl` | §Architecture, §Interfaces (`emit`) |
| R2 | Persist across `run.sh` restarts | §Architecture (append-open), §Interfaces (`initEvents`) |
| R3 | Stamp `ts`, `cycle`, `frame`, `type` | §Data model (`EventEnvelope`) |
| R4 | Monotonic `seq` field | §Data model (`EventEnvelope`), §Interfaces (`nextSeq`) |
| R5 | `cycle: 0`, `frame: null` for pre-cycle events | §Interfaces (`emit` defaults), §Architecture (lifecycle) |
| R6 | `cycle_start` event | §Interfaces (`emitCycleStart`), §Architecture (main loop) |
| R7 | `cycle_end` with state, duration_ms, frame | §Interfaces (`emitCycleEnd`) |
| R8 | `push` event | §Interfaces (`emitPush`), §Architecture (push call site) |
| R9 | `pop` event | §Interfaces (`emitPop`) |
| R10 | `splice` event with key names | §Interfaces (`emitSplice`) |
| R11 | `llm_request` with full prompt inline | §Interfaces (`emitLlmRequest`), §Architecture (provider integration) |
| R12 | `llm_response` with output + usage inline | §Interfaces (`emitLlmResponse`) |
| R13 | `machine_git_commit` event | §Interfaces (`emitMachineGitCommit`) |
| R14 | `instructions_changed` with bytes_before/after | §Interfaces (`emitInstructionsChanged`), §Architecture (post-cycle diff) |
| R15 | `retry` event | §Interfaces (`emitRetry`) |
| R16 | `error` event with stack | §Interfaces (`emitError`), §Error handling |
| R17 | `halt` event | §Interfaces (`emitHalt`) |
| R18 | `tool_call` externalized to `payloads/` | §Interfaces (`emitToolCall`), §Data model (payload naming) |
| R19 | `tool_result` externalized | §Interfaces (`emitToolResult`) |
| R20 | Uniform externalization rule | §Architecture (no inline tool payloads) |
| R21 | Payload write failure → `payload_ref: null` + error field | §Error handling |
| R22 | Stdout byte-identical to today | §Architecture (parallel write paths) |
| R23 | Stop writing legacy `run-<ts>.log` | §Architecture (logger.ts surgery) |
| R24 | Existing selection scopes events panel | §Visualizer integration |
| R25 | Selection change updates panel | §Visualizer integration |
| R26 | Event-type toggle | §Visualizer integration |
| R27 | Click tool event → fetch payload | §Visualizer integration |
| R28 | Chronological order + forward-compatible unknown types | §Visualizer integration |
| R29 | Synchronous flush per event | §Architecture (`appendFileSync`), §Error handling — **softened to "at most one cycle's events lost on crash"**; see §Open questions |
| R30 | Append on restart, never rewrite | §Interfaces (`initEvents` opens append-mode) |
| R31 | Breaking change — wipe `instances/` | §Migration |
| R32 | Live demo: a/b/c/d instances | §Test strategy (live demos) |

## Architecture

```
                                                              ┌─────────────────────┐
src/main.ts ──┬─→ log() ──────────→ stdout (unchanged) ──────→│  user's terminal    │
              │                                                └─────────────────────┘
              │
              │   ┌────────────────────────┐ runCycle returns
              ├──→│ providers/* (no event  │ {halt, ..., events: ProviderEvent[]}
              │   │  imports — buffer into │
              │   │  CycleResult.events)   │
              │   └────────────────────────┘
              │
              ├─→ events.emit{Cycle,Push,Pop,Splice,LlmReq,LlmRes,
              │                ToolCall,ToolResult,GitCommit,InstrChg,
              │                Retry,Error,Halt}
              ↓                                              ┌─────────────────────┐
                                                             │ logs/events.jsonl   │
                                                             │ (one line per event,│
                                                             │  append-forever)    │
                                                             └─────────────────────┘
                                                                        ↑
              for tool_call / tool_result events,                       │
              main.ts also writes the payload to                        │
                                                                        │
              ┌─────────────────────┐                                   │
              │ logs/payloads/      │                                   │
              │   <seq>-<tool>-     │                                   │
              │   {input,output}.txt│                                   │
              └─────────────────────┘                                   │
                       ↑                                                │
              visualizer.html fetches              visualizer.html parses
              on tool-call click                   one event per line, filters
                                                   by selected cycle/frame
```

**Module boundaries:**

- `src/events.ts` (new) — sole writer to `events.jsonl`. Owns the seq counter and the open file descriptor in append mode. Exposes typed emitter functions. **Imported only by `src/main.ts`.**
- `src/logger.ts` (existing, trimmed) — drops the `logs/run-<ts>.log` mirror. `log()` becomes console-only; `logRaw()` survives as a console-silent diagnostic only if existing call sites still need it (Phase 3 implementation detail).
- `src/main.ts` — gains the typed `emit*()` calls at the existing structural events (cycle_start, push, pop, splice, machine_git_commit, halt, ...) AND iterates `result.events` after every `runCycle()` return to flush each buffered `ProviderEvent` via the typed emitters.
- `src/providers/shared.ts` — extends `CycleResult` with `events: ProviderEvent[]` and exports the `ProviderEvent` discriminated union. Adds a small `recordEvent(buf, type, fields)` helper providers use to push events with auto-stamped `tsRel` (relative to cycle start, since the cycle's absolute `ts`/`seq` are assigned later by main.ts).
- `src/providers/{api,claude-code,openai,ollama,local}.ts` — each provider initializes a local `events: ProviderEvent[]` array at the top of `runCycle`, calls `recordEvent` at the existing log sites (replacing or paralleling the existing `log()`/`logRaw()` calls; `log()` calls stay for stdout per R22), and includes the array in its `CycleResult`. **No import of `events.ts`.**
- `src/tools.ts` (`executeTool`) — unchanged. The provider that wraps it records the events.

**Event lifecycle:**

```
runMain()
  initEvents(BASE_DIR)                              // R2: append-open
  events.emitMachineStart()                         // cycle:0, frame:null (R5)
  while (!halted):
    events.emitCycleStart(cycle, frame)             // R6
    runStackBlock():                                // pop/push/splice
      for ev in popped.events:
        events.emitSplice(ev.frameDir, ev.splicedKeys)   // R10
        events.emitPop(ev.frameDir, ev.returnState, ...) // R9
      if pushed.ok: events.emitPush(target, frameDir, depth)  // R8
    result = await runCycle(ip, mp)                 // provider tool loop
                                                    // provider buffered LLM + tool events
                                                    // into result.events
    for pe in result.events:                        // main.ts flushes provider buffer
      switch pe.type:
        'llm_request':  events.emitLlmRequest(...)   // R11
        'llm_response': events.emitLlmResponse(...)  // R12
        'tool_call':    events.emitToolCall(...)     // R18, R20
        'tool_result':  events.emitToolResult(...)   // R19, R20
        'retry':        events.emitRetry(...)        // R15
    if instructionsBytesChanged: events.emitInstructionsChanged(before, after)  // R14
    events.emitMachineGitCommit(hash, subject)       // R13
    events.emitCycleEnd(state, duration_ms)          // R7
  events.emitHalt(reason)                            // R17
```

**Why providers don't import events.ts:**

1. Single import direction (`main → events`) keeps `events.ts` testable in isolation; provider tests don't mock the events module.
2. `executeTool`-style purity is preserved: providers stay pure functions of (instructions, memory) → CycleResult.
3. Adding a new provider requires no events knowledge — just push to `events: ProviderEvent[]` per the type.

## Data model

**`EventEnvelope`** (every event extends this):

```ts
type EventEnvelope = {
  seq: number;        // monotonic, starts at 1, persists across restarts (R4)
  ts: string;         // ISO-8601 UTC, e.g. "2026-04-24T07:42:13.123Z" (R3)
  cycle: number;      // 0 if pre-cycle (R5)
  frame: string | null;   // e.g. "frames/f001-verify"; null if pre-cycle (R5)
  type: string;       // event tag (R3, R28)
  // ...type-specific fields below
};
```

**Per-type extensions** (additional fields beyond the envelope):

| `type` | Fields | R# |
| ------ | ------ | -- |
| `cycle_start` | (none beyond envelope) | R6 |
| `cycle_end` | `state: string`, `duration_ms: number` | R7 |
| `push` | `target: string`, `frameDir: string`, `depth: number` | R8 |
| `pop` | `frameDir: string`, `returnState: string`, `depth: number` | R9 |
| `splice` | `splicedKeys: string[]`, `targetFrame: string` | R10 |
| `llm_request` | `provider: string`, `model: string`, `prompt: string` | R11 |
| `llm_response` | `output: string`, `duration_ms: number`, `usage?: object` | R12 |
| `tool_call` | `tool: string`, `payload_ref: string \| null`, `error?: string` | R18, R21 |
| `tool_result` | `tool: string`, `payload_ref: string \| null`, `error: boolean`, `payload_error?: string` | R19, R21 |
| `machine_git_commit` | `hash: string`, `subject: string` | R13 |
| `instructions_changed` | `bytes_before: number`, `bytes_after: number` | R14 |
| `retry` | `attempt: number`, `reason: string` | R15 |
| `error` | `message: string`, `stack: string` | R16 |
| `halt` | `reason: string` | R17 |

**Payload file naming:** `logs/payloads/<seq>-<tool>-input.txt` and `logs/payloads/<seq>-<tool>-output.txt`. `<seq>` is the same value in the event envelope. Two files per `tool_call`/`tool_result` pair (input belongs to the call, output to the result). `<tool>` is `bash`, `write_file`, `git`, `update_instructions`, etc. — sanitized to `[a-z_]+`. (R18, R19)

**Persisted state files** (created by `initEvents` if missing):

- `logs/events.jsonl` — append-only.
- `logs/.events-seq` — single-line file containing the next `seq` value to assign. Read at `initEvents`, incremented in-process per `emit`, written back synchronously alongside each event so a crash doesn't replay seqs. (R4, R30)

**`ProviderEvent`** (added to `src/providers/shared.ts`, the discriminated union providers buffer into `CycleResult.events`):

```ts
type ProviderEvent =
  | { type: 'llm_request'; provider: string; model: string; prompt: string }
  | { type: 'llm_response'; output: string; durationMs: number; usage?: object }
  | { type: 'tool_call'; tool: string; input: string }
  | { type: 'tool_result'; tool: string; output: string; isError: boolean }
  | { type: 'retry'; attempt: number; reason: string };
```

`ProviderEvent` carries *only* the type-specific fields — the envelope (seq, ts, cycle, frame) is stamped by `events.ts` when main.ts flushes the buffer. Providers do not assign seqs or import events.ts.

## Interfaces / API

**`src/events.ts` exports** (imported only by `src/main.ts`):

```ts
// Module init — call once from runMain() before anything else.
// Opens logs/events.jsonl in append mode, reads logs/.events-seq, returns void.
// Idempotent under restart (R2, R30).
export function initEvents(baseDir: string): void;       // satisfies: R2, R30

// Generic emitter — internal. All typed helpers below funnel through this.
// Stamps envelope (seq, ts, cycle, frame), serializes JSON, appendFileSync,
// writes new seq to logs/.events-seq. (R1, R3, R4, R29*)
function emit(type: string, fields: Record<string, unknown>): void;

// Setters for the implicit envelope context (cycle + frame). main.ts calls
// setCycleContext(cycle, frameDir) at cycle_start; emit() reads it. Pre-cycle
// emitters call clearCycleContext() so cycle:0 and frame:null are written. (R5)
export function setCycleContext(cycle: number, frame: string | null): void;
export function clearCycleContext(): void;

// Typed emitters — main.ts calls these directly.
export function emitCycleStart(): void;                                     // R6
export function emitCycleEnd(state: string, durationMs: number): void;       // R7
export function emitPush(target: string, frameDir: string, depth: number): void;  // R8
export function emitPop(frameDir: string, returnState: string, depth: number): void;  // R9
export function emitSplice(targetFrame: string, splicedKeys: string[]): void;  // R10
export function emitLlmRequest(provider: string, model: string, prompt: string): void;  // R11
export function emitLlmResponse(output: string, durationMs: number, usage?: object): void;  // R12
export function emitMachineGitCommit(hash: string, subject: string): void;   // R13
export function emitInstructionsChanged(bytesBefore: number, bytesAfter: number): void;  // R14
export function emitRetry(attempt: number, reason: string): void;            // R15
export function emitError(err: Error): void;                                 // R16
export function emitHalt(reason: string): void;                              // R17

// Tool helpers — main.ts calls these when iterating CycleResult.events.
// They write the payload file (logs/payloads/<seq>-<tool>-{input,output}.txt)
// as a side effect; the seq used in the filename matches the event envelope.
// Returns the payload_ref (or null on failure — the event is still written).
export function emitToolCall(tool: string, input: string): string | null;       // R18, R20, R21
export function emitToolResult(tool: string, output: string, isError: boolean): string | null;  // R19, R20, R21
```

**`src/providers/shared.ts` additions:**

```ts
export type ProviderEvent =
  | { type: 'llm_request'; provider: string; model: string; prompt: string }
  | { type: 'llm_response'; output: string; durationMs: number; usage?: object }
  | { type: 'tool_call'; tool: string; input: string }
  | { type: 'tool_result'; tool: string; output: string; isError: boolean }
  | { type: 'retry'; attempt: number; reason: string };

export type CycleResult = {
  halt: boolean;
  haltMessage?: string;
  noMatch?: boolean;
  summary?: string;
  events: ProviderEvent[];   // populated by the provider during runCycle (B-architecture)
};
```

**Per-provider integration pattern** (each of the five providers gains the same shape):

```ts
export async function runCycle(instructionsPath, memoryPath): Promise<CycleResult> {
  const events: ProviderEvent[] = [];
  const t0 = Date.now();
  events.push({ type: 'llm_request', provider, model, prompt: fullPrompt });
  // ... existing tool loop, calling executeTool ...
  //     for each tool call: events.push({ type: 'tool_call', tool, input })
  //                         events.push({ type: 'tool_result', tool, output, isError })
  //     for each retry:    events.push({ type: 'retry', attempt, reason })
  events.push({ type: 'llm_response', output: finalText, durationMs: Date.now() - t0, usage });
  return { halt, ..., events };
}
```

**Implementation notes:**

- `emit()` uses `appendFileSync` (same primitive as today's `logger.ts`) — a single syscall per event, flushed before return.
- R29 is satisfied PER EVENT at the events.ts layer. The B-architecture deferral happens one level up: provider events are buffered in memory until `runCycle` returns. A crash inside the provider loses the cycle's buffered events; once main.ts starts iterating `result.events`, every emit is flushed before the next.
- `seq` is incremented in process, then both the event line and the new `.events-seq` value are written before `emit` returns. The two writes are sequential; if a crash happens between them, on the next restart we re-read `.events-seq` (so we lose at most one seq number — events still strictly increase, no gap-detection logic needed). (R4)
- `setCycleContext`/`clearCycleContext` keep call sites terse (callers don't repeat cycle+frame on every emit) and match how the existing `log()` works.
- All `events.ts` emitters are synchronous. No buffering, no batching, no async — within events.ts.

## Error handling

**Unwanted triggers from requirements:**

- **R21 (payload write failure):** `emitToolCall`/`emitToolResult` wrap the payload write in `try/catch`. On failure, the event is still emitted with `payload_ref: null` and a new field `payload_error: <message>`. The function returns `null`; the caller's existing `log()` line still prints (so stdout shows the tool call as before). The event stream stays continuous — R29 still satisfied because `emit` itself doesn't depend on the payload write.
- **R16 (uncaught error escapes a cycle):** the existing `try/catch` in `runMain()` (`src/main.ts:543` — `console.error("Fatal error:", err); process.exit(1)`) gets a leading `emitError(err)` call. We emit BEFORE writing to console so even if console.error throws, the event lands.
- **R17 (halt):** the existing `Machine halted: done` log is paired with `emitHalt("done")`. The quota-exceeded path (`src/errors.ts`) gets `emitHalt("quota_exceeded")` before exit. SIGINT handler emits `emitHalt("signal")`.
- **R30 (mid-instance restart):** `initEvents` opens `events.jsonl` with `flag: 'a'` (append). It reads `.events-seq` if present, defaults to `1` if absent. Old seq values stay in the file untouched.
- **Disk full / events.jsonl write failure:** outside R-scope but worth noting — `appendFileSync` will throw, the error propagates up through whatever was emitting (e.g. `emitCycleStart`) and the existing main-loop `try/catch` catches it (then `emitError` ironically tries to log the same failure). This is acceptable: if we can't write logs, the run is unobservable anyway. We do NOT add silent swallowing — fail loud.

## Test strategy

**Unit tests** (`src/test/`):

- `events.test.ts` (new) — covers:
  - `initEvents` creates files when missing, opens append on existing files (R2, R30)
  - Envelope stamping: `seq` monotonic and persisted to `.events-seq`; `ts` ISO-8601; `cycle`/`frame` taken from context; `cycle: 0`/`frame: null` when context cleared (R3, R4, R5)
  - Each typed emitter writes the correct `type` and field set (R6–R17)
  - `emitToolCall` / `emitToolResult` write payload files at expected paths and return the ref (R18, R19, R20)
  - Payload write failure path: simulate by pointing `payloads/` at a read-only dir; assert event still emitted with `payload_ref: null` and `payload_error` set (R21)
  - Synchronous flush: assert file contents readable immediately after `emit` returns (R29 at the events.ts layer)

- `provider-events.test.ts` (new) — covers:
  - Each provider's `runCycle` returns a `CycleResult` with `events: ProviderEvent[]` populated in the expected order (`llm_request` first, alternating `tool_call`/`tool_result` if any, `llm_response` last) (B-architecture)
  - Provider does NOT import `events.ts` (assert via static check or by mocking the events module and verifying it's never called)
  - Buffer survives the cycle's tool loop without losing events

- Additions to `phase-2b-call-stack.test.ts` — assert the existing push/pop test fixtures, when wired through main.ts, trigger the corresponding `push`/`pop`/`splice` events with the right `splicedKeys`. Avoid duplicating logic; just check the event was emitted.

**Integration / end-to-end** (live demos — R32):

- Wipe `instances/` (R31). Recreate `bl-a` (a-self-refine), `bl-b` (b-evaluator-optimizer), `bl-c` (c-reflexion), `bl-d` (d-cove). Run each to halt.
- Per instance, assert:
  - `logs/events.jsonl` exists, every line parses, `seq` strictly monotonic
  - `logs/payloads/` contains exactly one file per `tool_call` and one per `tool_result` event
  - At least one `cycle_start`, one `cycle_end`, one `llm_request`, one `llm_response`, one `machine_git_commit`, one `halt` event
  - For `bl-d`: at least one `push` with `depth: 2` and one matching `pop` (the depth-2 invariant from Phase 2b)
- Open `visualizer.html` against each instance; verify the events panel renders, type filter toggles work, and clicking a `tool_call` fetches and renders the payload file (R24, R25, R26, R27).

**Visual / manual:**

- After all four demos, sample one of each event type in the visualizer to confirm rendering. Document any rendering gaps in `docs/agent-workflows/better-logging-notes.md` (Phase-4 task).

## Migration

**Active cleanup (R31):** the Phase-3 task list will include a destructive task: `rm -rf instances/*` (preserve `interpreters/`). This is the same pattern used in Phase 2b R44; the old `logs/run-*.log` files go with the instance dirs. The `new-instance.sh` script does not need to change for this feature — `events.jsonl` is created lazily by `initEvents` on first run.

**Visualizer:** the rewritten `visualizer.html` (currently uncommitted on this branch) becomes the only viewer. It will surface a clear empty state ("No events.jsonl found — this instance predates better-logging") for any `instances/` dir without `events.jsonl`, satisfying the spirit of R31 without crashing.

## Open questions

- **R29 wording (carried forward to a possible Phase-1 refine).** R29 currently reads "flush every event to disk before returning control from the function that emitted it... so a crash mid-run loses at most one event." Under the B-architecture, this guarantee holds at the `events.ts` layer but not at the provider layer: a crash inside a provider's tool loop loses the cycle's buffered `ProviderEvent`s. If you want R29 to formally reflect this, refine Phase 1 to amend it (suggested wording: "...so a crash loses at most the events buffered for the in-flight cycle"). If you want R29 unchanged, the design must move to A-architecture (providers import events.ts directly).
- `logRaw` may stay or be removed in Phase 3 once we count surviving call sites; this is an implementation detail not a design decision.
