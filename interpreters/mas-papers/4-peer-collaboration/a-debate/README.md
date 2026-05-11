# Multi-Agent Debate

Implements **Multi-Agent Debate** (Du et al., 2023; arXiv:2305.14325) — `patterns.md` Group 4, Peer Collaboration. N agents with distinct personas independently produce opinions in round 1; in subsequent rounds, each agent reads only the previous round's batch (never same-round siblings) and updates its position. After R rounds, the strategy synthesises a neutral final position from the full transcript.

## Mechanism

- **Round coordinator strategy** at `INSTRUCTIONS.md`. State machine: `empty` → `dispatch_stage` → `dispatch_push` → `dispatching_completed` → (`dispatch_stage` | `round_transition`) → … → `concluding` → `done`.
- **One dynamic** at `operators/opine.md`, depth 1. Receives one persona's worth of context plus the prior-rounds transcript; returns one opinion via `## Return opinion: |`.
- **Strict round isolation** is enforced by the strategy: at stage time, the `transcript` push-arg is built by concatenating only completed prior-round snapshot files (`scoped/round-1.md` … `scoped/round-{R-1}.md`). The in-progress current round is excluded.
- **No `reflect.md` reuse.** Inter-round nudging is deferred (`reflect.md`'s contract requires a `verdict` that debate has no analogue for). See `docs/specs/2026-04-28-agent-workflows-phase-5/`.
- **No aggregator dynamic.** Synthesis is the strategy's own inline cycle, not a pushed dynamic — keeps Phase 5 inside Group 4 and prevents drift toward Phase 5b's MoA aggregator.

## Demo PROGRAM.md

A "Postgres or SQLite for use case U?" question with three personas (DBA, App Dev, SRE). Default R=3 applies, so a complete run produces 9 opinions and one final position.

## Run

```
./new-instance.sh interpreters/mas-papers/4-peer-collaboration/a-debate debate-demo
instances/debate-demo/run.sh
```

Inspect `instances/debate-demo/frames/f000-strategy/scoped/transcript.md` for the full debate, and the final cycle's `MEMORY.md` for the synthesised `## Final Position`.

## Phase 5b (MoA) is deferred

Mixture of Agents — the second Group-4 pattern — is deferred pending per-prompt model selection in the harness. Phase 5b's `propose.md` dynamic is intentionally distinct from this `opine.md` (different access pattern: opine sees prior-round transcripts; propose sees nothing).

## References

- Du, Yilun et al. *Improving Factuality and Reasoning in Language Models through Multiagent Debate*. arXiv:2305.14325. 2023.
- `docs/agent-workflows/patterns.md` § Group 4 — Peer Collaboration.
- `docs/agent-workflows/requirements.md` § Phase 5.
- `docs/specs/2026-04-28-agent-workflows-phase-5/` — full spec (requirements, design, tasks).

## Layout note

`INSTRUCTIONS.md` is a single-line marker pointing at the canonical operator file `operators/debate.md`. The strategy body lives in the canonical operator. This pattern lets the same operator be invoked standalone (via `.root-operator` bootstrap) AND as a library operator inside meta-frameworks like `aflow-lite`.

For this interpreter the canonical operator is `operators/debate.md`.
