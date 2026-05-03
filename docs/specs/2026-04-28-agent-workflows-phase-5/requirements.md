# Requirements: agent-workflows-phase-5

## Context

Phase 5 of the agent-workflows roadmap (`docs/agent-workflows/requirements.md` § Phase 5) calls for a Multi-Agent Debate interpreter implementing the Du et al. 2023 protocol (`docs/agent-workflows/patterns.md` Group 4 — Peer Collaboration). The repo already ships interpreters for Group 1 (refinement), Group 2 (planning), and Group 5 (fixed-SOP teams); Debate is the first Group-4 entry.

The defining property of Multi-Agent Debate is **strict round isolation**: each round, every agent independently produces an opinion seeing only the *previous* round's batch — never same-round siblings. This is what distinguishes Debate from circular dialogue (already covered by `dialogue.md` in 4b/chatdev) and is what gives the next phase, Phase 5b (Mixture of Agents), its contrast point. Phase 5b is deferred — it requires per-prompt model selection in the harness, which the current shell does not provide — so its requirements (heterogeneous proposers, no cross-visibility within a layer, aggregator) are explicitly out of scope here. Phase 5's demo PROGRAM.md is intended to be reusable by Phase 5b when it ships, so the two interpreters can be compared on identical inputs.

## User stories

- **US1**: As a developer studying agent patterns, I want a working Multi-Agent Debate interpreter at `interpreters/4-peer-collaboration/a-debate/`, so that I can run the canonical Du et al. 2023 protocol against open-ended questions and inspect the resulting transcript.
- **US2**: As an author of the future Phase 5b (MoA) interpreter, I want Debate's demo PROGRAM.md to use a free-form question + named-persona structure that MoA can mirror, so that the two patterns can be compared on identical inputs.
- **US3**: As a researcher running this interpreter, I want to author a debate by writing PROGRAM.md in natural prose (the question, the named personas, an optional round count), so that I do not need to learn a structured config schema.
- **US4**: As a reader of a finished debate, I want a synthesised final position alongside the full transcript, so that ambiguous-answer questions yield an actual answer rather than only a record of the disagreement.

## Acceptance criteria (EARS)

### Initialization

- **R1**: WHEN the strategy enters its first cycle (state == `empty`), THE SYSTEM SHALL read `../../PROGRAM.md` and extract three pieces of information: the debate question, the round count R, and a list of named personas (each with a name and a multi-line description).
- **R2**: IF `PROGRAM.md` does not specify a round count, THEN THE SYSTEM SHALL default R to 3.
- **R3**: IF `PROGRAM.md` does not name at least two distinct personas, THEN THE SYSTEM SHALL append a `## Pending Questions` entry asking the user to provide personas, set state to `waiting_for_user`, and stop progressing until the user responds.
- **R4**: WHEN initialization succeeds, THE SYSTEM SHALL persist the parsed question, R, and persona list to scoped files such that subsequent cycles read them by path without re-parsing `PROGRAM.md`.

### Strict round isolation

- **R5**: WHEN dispatching the K-th opinion of round R (for any R ≥ 1, 1 ≤ K ≤ N), THE SYSTEM SHALL ensure the `transcript` push-arg passed to `opine.md` contains opinions only from rounds 1..R−1 — never opinions from siblings in round R.
- **R6**: WHEN dispatching any opinion in round 1, THE SYSTEM SHALL pass `opine.md` a transcript value indicating no prior opinions exist (e.g. the literal string `(none — round 1)`).
- **R7**: WHEN a round completes (all N opinions absorbed), THE SYSTEM SHALL have written that round's opinions to a per-round scoped snapshot file before any opinion of the next round is dispatched.

### Round/agent execution

- **R8**: WHEN the strategy enters the dispatch state with an unprocessed (round, agent) pair, THE SYSTEM SHALL push `operators/opine.md` exactly once with push-args `round`, `persona_name`, `persona_description`, `question`, and `transcript` for that pair.
- **R9**: WHEN `opine.md` returns control to the strategy (state suffix `_completed` with `## Opinion` present), THE SYSTEM SHALL surgically append the returned opinion — labelled with its round number and persona name — to a single growing transcript file.
- **R10**: THE SYSTEM SHALL execute exactly R rounds and exactly N opinions per round; it SHALL NOT terminate early on apparent consensus in v1.
- **R11**: WHEN the K-th opinion of round R has been absorbed and K equals N, THE SYSTEM SHALL execute a dedicated round-transition cycle that increments the round counter and resets the agent counter to zero before any further dispatch.

### Termination and synthesis

- **R12**: WHEN the round counter exceeds R after a round transition, THE SYSTEM SHALL execute exactly one inline concluding cycle (no further pushes) that reads the full transcript and writes a `## Final Position` MEMORY section in a neutral coordinator voice, summarising consensus and remaining disagreement.
- **R13**: WHEN the concluding cycle finishes, THE SYSTEM SHALL set state to `done` so the shell halts at stack depth 1.

### `opine.md` dynamic contract

- **R14**: THE `opine.md` dynamic SHALL declare push-args `round`, `persona_name`, `persona_description`, `question`, and `transcript`, and SHALL fail with `unresolved-placeholder` if any are missing at push time.
- **R15**: WHEN invoked, `opine.md` SHALL complete in a single cycle (state `empty` → `done`) and SHALL emit a `## Return` block with exactly one key, `opinion`, in the same MEMORY heredoc as the state change.
- **R16**: THE `opine.md` dynamic SHALL NOT push further dynamics; the strategy's effective stack depth SHALL remain 1.

### Demo PROGRAM.md

- **R17**: THE INTERPRETER SHALL ship `PROGRAM.md` containing the question "Postgres or SQLite for use case U?" with a use-case description and three named expert personas relevant to that question (e.g. database administrator, application developer, site reliability engineer). The demo SHALL NOT override the default round count, so R = 3 applies via R2.
- **R18**: WHEN run against the demo `PROGRAM.md` to completion, THE SYSTEM SHALL produce (a) a transcript file containing exactly nine opinions — three personas × three rounds — each labelled with its round and persona name, and (b) a `## Final Position` section in the final MEMORY snapshot.

### Negative requirements (design choices captured)

- **R19**: THE INTERPRETER SHALL NOT reuse `reflect.md` from `1c-reflexion` in v1; no inter-round nudging mechanism is provided.
- **R20**: THE INTERPRETER SHALL NOT introduce an aggregator dynamic, an MoA-style ensembling step, or any second pushed dynamic alongside `opine.md`. Synthesis, when it happens, is the strategy's own inline cycle.

## Out of scope

- Mixture of Agents (Phase 5b) — deferred pending per-prompt model selection in the harness.
- CAMEL (locked two-role conversation) — explicitly skipped per `docs/agent-workflows/requirements.md`; covered functionally by `dialogue.md` in 4b/chatdev.
- LLM-generated personas (Group 6 dynamic-team territory).
- Stuck-point detection or `reflect.md` integration to nudge agents off convergence plateaus.
- Early termination on apparent consensus.
- Parallel dispatch of multiple `opine.md` pushes within a single round (the shell is sequential; strict round isolation is enforced via per-round snapshot bookkeeping, not parallelism).
- Persona persistence across multiple debates — each instance is single-shot.
- Heterogeneous-model proposers (this is a Phase 5b property, not Phase 5).

## Open questions

(none — all questions surfaced during brainstorming were resolved)
