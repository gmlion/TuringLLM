# Requirements: better-logging

## Context

The current logger (`src/logger.ts`, 39 lines) writes one timestamped text file per `run.sh` invocation under `logs/run-<ts>.log` and mirrors a summary to stdout. Two pain points emerged after Phase 2b: (1) navigation — finding "what happened in cycle 7 of frame f001-verify" requires scrolling a flat 5000-line file; (2) structure — the visualizer reads the latest log via `tail` and regex-parses prose, so it cannot cleanly render structured events (push, pop, splice, tool calls). Better-logging adds a single per-instance structured event stream (`logs/events.jsonl`) the visualizer treats as its source of truth, while leaving stdout output unchanged so live tailing still works.

## User stories

- **US1**: As a developer debugging a paused run, I want to filter logs by frame and cycle range so I can isolate the activity of a single dynamic without scrolling.
- **US2**: As the visualizer's primary consumer, I want a structured, append-only event stream so I can render push/pop/splice/tool-call timelines without parsing prose.
- **US3**: As an operator tailing `run.sh` in a terminal, I want the existing console output to stay exactly as it is so my live monitoring habits don't break.
- **US4**: As an investigator inspecting a tool call after the fact, I want the full input/output payload available on demand without bloating the line-oriented event stream.

## Acceptance criteria (EARS)

### Event stream layout

- **R1**: THE SYSTEM SHALL append one JSON event per line to `logs/events.jsonl` at the instance root.
- **R2**: THE SYSTEM SHALL persist `events.jsonl` across `run.sh` restarts (single file per instance, append-only).
- **R3**: THE SYSTEM SHALL stamp every event with the fields `ts` (ISO-8601 UTC), `cycle` (integer), `frame` (string, e.g. `frames/f001-verify`), and `type` (string event tag).
- **R4**: THE SYSTEM SHALL include a monotonically increasing `seq` field on every event so consumers can order events that share a `ts` value.
- **R5**: WHEN an event cannot be associated with a cycle (e.g. machine startup before cycle 1), THE SYSTEM SHALL write `cycle: 0` and `frame: null`.

### Inline event types

- **R6**: WHEN a cycle begins, THE SYSTEM SHALL emit a `cycle_start` event with the active frame and the cycle number.
- **R7**: WHEN a cycle ends, THE SYSTEM SHALL emit a `cycle_end` event with `state` (the new MEMORY state), `duration_ms`, and the active frame.
- **R8**: WHEN the shell pushes a frame, THE SYSTEM SHALL emit a `push` event with `target` (instruction file path), `frameDir` (e.g. `frames/f001-verify`), and the resulting `depth`.
- **R9**: WHEN the shell pops a frame, THE SYSTEM SHALL emit a `pop` event with `frameDir` (the popped frame), `returnState`, and the resulting `depth`.
- **R10**: WHEN the shell splices a `## Return` block into the caller's MEMORY, THE SYSTEM SHALL emit a `splice` event with the list of key names spliced and the target `frame`.
- **R11**: WHEN the shell calls the LLM provider, THE SYSTEM SHALL emit an `llm_request` event with the full prompt content inline (system + user prompt) and `provider`/`model`.
- **R12**: WHEN the LLM provider returns, THE SYSTEM SHALL emit an `llm_response` event with the full assistant output text inline, `duration_ms`, and any token-usage metadata the provider exposes.
- **R13**: WHEN the machine git auto-commits at end-of-cycle, THE SYSTEM SHALL emit a `machine_git_commit` event with the short hash and commit subject.
- **R14**: WHEN INSTRUCTIONS.md changes content during a cycle, THE SYSTEM SHALL emit an `instructions_changed` event with `bytes_before`, `bytes_after`, and the active frame.
- **R15**: WHEN a cycle retries (e.g. the LLM didn't advance state), THE SYSTEM SHALL emit a `retry` event with `attempt` (1-indexed) and `reason`.
- **R16**: WHEN any uncaught error escapes a cycle, THE SYSTEM SHALL emit an `error` event with `message` and `stack` inline.
- **R17**: WHEN the machine halts, THE SYSTEM SHALL emit a `halt` event with `reason` (e.g. `done`, `quota_exceeded`, `signal`).

### Externalized payloads

- **R18**: WHEN a tool is called, THE SYSTEM SHALL write the tool input to `logs/payloads/<seq>-<tool>-input.txt` and emit a `tool_call` event with `tool`, `payload_ref` (relative path), and the active frame.
- **R19**: WHEN a tool returns, THE SYSTEM SHALL write the tool output to `logs/payloads/<seq>-<tool>-output.txt` and emit a `tool_result` event with `tool`, `payload_ref`, `error` (boolean), and the active frame.
- **R20**: THE SYSTEM SHALL apply the externalization rule uniformly: any `tool_call` or `tool_result`, regardless of payload size, is referenced via `payload_ref` and never inlined.
- **R21**: IF a payload file cannot be written (disk full, permission denied) THEN THE SYSTEM SHALL still emit the event with `payload_ref: null` and an `error` field describing the write failure, so the event stream stays continuous.

### Console output (unchanged)

- **R22**: THE SYSTEM SHALL preserve the existing stdout output (cycle headers, `[claude-code]` summaries, `[push]/[pop]` lines, `[machine-git]` commits) byte-for-byte unchanged so live tailing of `run.sh` is unaffected.
- **R23**: THE SYSTEM SHALL stop writing the legacy `logs/run-<ts>.log` text file once the JSONL stream is in place.

### Visualizer integration

- **R24**: THE SYSTEM SHALL drive event navigation from the visualizer's existing selection — the cycle dot in the timeline scopes events to that cycle, and the selected frame node in the stack graph scopes events to that frame. No separate cycle-range or frame pickers are introduced.
- **R25**: WHEN the user changes the selected cycle or selected frame, THE SYSTEM SHALL update the events panel to show only events matching the new selection.
- **R26**: THE SYSTEM SHALL provide an event-type toggle in the events panel (e.g. checkboxes per type) so users can hide noisy event categories within the current cycle/frame scope.
- **R27**: WHEN a user clicks a `tool_call` or `tool_result` event in the visualizer, THE SYSTEM SHALL fetch the referenced payload file and render it in a detail view.
- **R28**: THE SYSTEM SHALL render `events.jsonl` in chronological (`seq`) order and surface unknown event `type` values verbatim (forward-compatible — visualizer doesn't crash on event types added after its release).

### Atomicity and durability

- **R29**: THE SYSTEM SHALL flush every event to disk before returning control from the function that emitted it (no in-memory buffering across cycles), so a crash mid-run loses at most one event.
- **R30**: IF the shell starts mid-instance and `events.jsonl` already exists, THE SYSTEM SHALL append to it without rewriting, so cycle history accumulates monotonically.

### Breaking change and demo

- **R31**: THE SYSTEM SHALL treat better-logging as a breaking change — pre-feature instances under `instances/` lack `events.jsonl`, so the rewritten visualizer will not display event timelines for them. Active cleanup of all existing instance directories is required as part of merging this feature; no migration path is offered.
- **R32**: WHEN the implementation reaches a runnable state, THE SYSTEM SHALL be exercised end-to-end by re-creating one demo instance per Group-1 interpreter — `a-self-refine`, `b-evaluator-optimizer`, `c-reflexion`, and `d-cove` — and running each to completion to populate its own `events.jsonl`. The visualizer's event panel, type filter, and payload-fetch behaviour SHALL be verified against each resulting file before the spec is marked done. `d-cove` is required because it is the only interpreter that exercises depth-2 push events; the other three confirm the per-frame slicing behaves correctly with single-frame runs and provide concrete reference instances for users to load post-merge.

## Out of scope

- Log rotation or archival of `events.jsonl` (deferred — current runs produce <1MB; revisit if instances grow).
- Structured tracing/OpenTelemetry export (the JSONL stream can be transformed externally if needed).
- Search/index server for the visualizer (filtering happens client-side).
- Per-cycle or per-frame log files as separate artifacts on disk (slicing is a visualizer feature; the on-disk source is one file).
- Migration of historical `logs/run-*.log` files into JSONL (pre-better-logging instances stay in their old format; no backward-compat needed since R44 wiped pre-Phase-2b instances anyway).
- Capturing `machine_git_commit` diffs (the commit hash is enough; full diffs are recoverable via `git show`).
- Token-usage rollup or cost dashboards (the raw `llm_response` token fields are emitted; aggregation is a downstream consumer concern).

## Open questions

- (none)
