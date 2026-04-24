# Better-logging — Implementation notes

Captured at the end of the agent-workflows-better-logging spec (2026-04-24). Findings from the four live demo instances (`bl-{a,b,c,d}`) that future phases can use.

## Stream shape and per-instance file growth

| instance | interpreter | cycles | events | event lines / cycle | payload files |
| -------- | ----------- | ------ | ------ | ------------------- | ------------- |
| `bl-a` | a-self-refine | 8 | 47 | 5.9 | 0 |
| `bl-b` | b-evaluator-optimizer | 4 | 24 | 6.0 | 0 |
| `bl-c` | c-reflexion (palindrome) | 5 | 29 | 5.8 | 0 |
| `bl-d` | d-cove (knights/knaves) | 25 | 150 | 6.0 | 0 |

The "events per cycle" baseline (5.6–6.0) maps cleanly: `cycle_start`, `llm_request`, `llm_response`, `machine_git_commit`, `cycle_end` per cycle, plus 1 push/pop/splice triple where the strategy delegates. Push/pop/splice events are emitted in the boundary cycles and not the bulk ones, which is why the per-cycle averages cluster tightly even across very different stack depths.

**Payload count is 0 across all four instances** because every demo runs under the `claude-code` provider, where tool calls are subprocess-internal and never visible at the provider layer (per design, `claude-code.ts` emits only `llm_request` + `llm_response` per attempt). For non-CC providers (api/openai/ollama/local), `tool_call`/`tool_result` events with `payloads/` files would appear and the file count would scale roughly with cycles. Worth flagging as a Phase 5 consideration: the externalization path is fully tested in `events.test.ts` but never exercised by a live demo; an api-provider demo run would close that gap.

## Stream layout (R1–R5, R29, R30)

`events.jsonl` is one JSON object per line, sorted by monotonic `seq`. Verified directly:

```
$ head -2 instances/bl-d/logs/events.jsonl
{"seq":1,"ts":"2026-04-24T09:23:05.488Z","cycle":1,"frame":"frames/f000-strategy","type":"cycle_start"}
{"seq":2,"ts":"2026-04-24T09:23:31.197Z","cycle":1,"frame":"frames/f000-strategy","type":"llm_request","provider":"claude-code","model":"haiku","prompt":"…"}
```

The seq-strictly-increases test (`better-logging-demo.test.ts`) passes for all four instances — no gaps, no out-of-order writes. The single-line-per-emit + `appendFileSync` + `.events-seq` persistence pattern proved robust under interleaved cycles (bl-a, bl-b, bl-c, bl-d all ran concurrently for parts of their lifetimes; each instance's file stayed self-consistent because each provider has its own `events.ts` module state — they're separate Node processes).

## Depth-2 invariant (R32, bl-d)

bl-d hit `depth: 2` on push event seq=27 (cycle 5):

```json
{"seq":27,"ts":"2026-04-24T09:26:03.696Z","cycle":5,"frame":"frames/f001-verify","type":"push","target":"dynamics/answer-independently.md","frameDir":"frames/f002-answer-independently","depth":2}
```

7 such depth-2 pushes appeared in total (V1–V7 verifications); the 8th verification was synthesized from accumulated context without a new push, which is consistent with the `verify.md` dynamic's state-machine short-circuit. The events.jsonl makes that decision visible in a way the prior text logs never did — the depth-2 push count is now a one-line `grep`.

## Provider event ordering (B-architecture)

The B-architecture (providers buffer `ProviderEvent[]` into `CycleResult.events`; main.ts drains via typed emitters) preserves the expected per-cycle ordering: `cycle_start → llm_request → llm_response → machine_git_commit → cycle_end`. Verified by the order test in `provider-events-drain.test.ts` and confirmed in every demo. No `instructions_changed` events appeared in any of the four runs (instructions never grew/shrunk during a cycle in the iterative-refinement interpreters — they only mutate via push/pop frame creation, not via `update_instructions`).

**Side observation:** the `claude-code` provider's tool-call loop is opaque to events.ts (CC manages its own internal turns). For deeper observability of CC runs, the only signal is `llm_response.duration_ms` and the parsed result text. This is an inherent limitation of the subprocess model, not a logger gap.

## Visualizer integration

The visualizer (T10–T12) reads `events.jsonl` per `loadInstance`, sorts by `seq`, and:
- scopes events to the selected cycle (or all events for "live")
- scopes events to the selected frame node (or all for "any frame")
- exposes per-type checkboxes (R26)
- fetches payload files on click (R27 — exercised manually with mock payloads since live demos didn't produce any)

The "click frame in stack graph → events panel re-scopes" interaction works smoothly. The cycle timeline + stack graph combo, layered with the events panel, gives a three-axis navigation: time × frame × event-type. With 150 events in bl-d, the type filter is essential for cutting noise (e.g., hide `llm_request`/`llm_response` to focus on push/pop/splice flow).

**One UX finding worth flagging for Phase 5:** the events panel's `max-height: 600px` (inherited from `.panel-body`) feels tight when looking at all 25 cycles of bl-d unfiltered. A larger explicit override or virtual scrolling would help long runs.

## Cross-cutting

Total better-logging implementation: 13 tasks (T1–T13), 227 tests passing, no regressions in pre-existing test suites.

The B-architecture decision (providers stay events-agnostic, main.ts drains buffered events) paid off during T6 — the only architectural-quality issue surfaced by the code reviewer was a pre-existing local.ts retry bug that became visible because the new event stream made it observable. No provider-specific knowledge of events.ts was needed.

**Breaking change (R31):** the Phase-2b layout (`frames/f<NNN>-<slug>/`) is required, AND now `events.jsonl` becomes the visualizer's source of truth. Pre-better-logging instances under `instances/` lack the file; the visualizer surfaces a clear empty-state message rather than crashing. As with R44 in Phase 2b, the active-cleanup step (`rm -rf instances/*` + recreate) is the migration path.

**Candidate Phase 5 work** suggested by these demos:
- An api/openai-provider demo run to exercise the `tool_call`/`tool_result` payload externalization end-to-end (currently only unit-tested).
- Visualizer max-height override for the events panel on dense runs (~150+ events).
- Optional event-type grouping in the filter UI (cycle_start/cycle_end together, llm_request/llm_response together, etc.) instead of alphabetical order.
- A small CLI helper (`bin/events <instance> <filter>`) that reads `events.jsonl` and prints filtered events for shell-friendly post-mortem use, since the user explicitly chose "no native grep" for the JSONL.
