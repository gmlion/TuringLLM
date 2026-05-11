# Requirements: phase-8-adas-lite-meta-interpreter

## Context

Phase 7 (aflow-lite) shipped a meta-framework that searches over compositions of pre-existing operators. Phase 8 takes the next step: a meta-interpreter that *generates new operators*. ADAS (Hu et al. 2024, arXiv:2408.08435) provides the model — sequential iteration with a growing archive of agent code, where each iteration's proposer reads the archive (successes and failures) and writes a new agent. ADAS-lite ports this to the turing repo's per-frame / push-pop / lib-script architecture: the "agent code" is an operator file (markdown + bash), the test loop reuses Phase 7's simulation pipeline (push the candidate, capture `## Answer`, score against fixture), and the archive lives in a frame's scoped heap.

Phase 7's pre-condition ("running cleanly on at least one benchmark") is met — aflow5 reached 1.0 reward on a 3-item GSM8K sample with workflow `refine,cove` in 42 minutes. ADAS-lite is the philosophically-closest match to the Turing-machine premise: the machine writes its own program, tests it, archives the strong ones.

## User stories

- **US1**: As a researcher exploring agentic patterns, I want a meta-interpreter that proposes brand-new operators by iterating with an archive, so I can discover reasoning patterns specific to my benchmark without writing them by hand.
- **US2**: As a developer, I want ADAS-lite to reuse Phase 7's push/pop semantics and lib-script architecture, so I don't pay architectural overhead and so its results are directly comparable to aflow-lite's on the same benchmark.
- **US3**: As a user inspecting an ADAS-lite run, I want the final `OUTPUT.md` to surface the best operator found and a summary of the archive (not just one number), so I can understand what the search discovered and why.
- **US4**: As an operator-author, I want generated candidates to satisfy the same operator contract (`{{task}}` + `{{prior_answer}}` push-args, `## Return: answer:` block) as the existing library, so successful candidates can later be promoted into `interpreters/mas-papers/7-meta-framework/a-aflow-lite/`'s library by hand.

## Acceptance criteria (EARS)

### Directory layout and bootstrap

- **R1**: THE SYSTEM SHALL provide a new interpreter at `interpreters/mas-papers/7-meta-framework/b-adas-lite/` containing `INSTRUCTIONS.md` (a one-line marker pointing at the root operator), an `operators/` directory holding `adas-lite.md` (root) and `propose-operator.md`, and a `lib/` directory of bookkeeping scripts.
- **R2**: WHEN ADAS-lite is initialized, THE SYSTEM SHALL load the same GSM8K fixture (`workspace/gsm8k.jsonl`) and produce the same deterministic 3-item sample (1st, middle, last) as aflow-lite.
- **R3**: WHEN ADAS-lite is initialized, THE SYSTEM SHALL pre-populate an archive with the 5 base operators (`refine`, `reflexion`, `cove`, `plan-execute`, `debate`) and test each one on the 3-item sample to obtain a baseline score per entry.
- **R4**: THE SYSTEM SHALL persist the archive under `./scoped/archive/` (one file per entry) with each entry recording: source filename or `proposed-NN.md` for generated, full operator content, mean reward (0.0-1.0), per-item scores, and a short failure note if reward < 1.0.

### Search loop

- **R5**: THE archive SHALL be append-only — entries are never removed during a run.
- **R6**: WHEN ADAS-lite begins each search iteration, THE SYSTEM SHALL push `operators/propose-operator.md` with the full archive (all entries with content + scores + notes) and the 3-item benchmark sample as push-args.
- **R7**: WHEN `propose-operator.md` returns, ITS `## Return` block SHALL contain key `operator_content` carrying the full text of the proposed operator file.
- **R8**: WHEN a new candidate is received, THE SYSTEM SHALL write the candidate to `./scoped/proposed-NN.md` (where NN is a zero-padded iteration counter), test it on the 3 benchmark items, and append a new archive entry on completion.
- **R9**: WHILE testing a candidate operator, THE SYSTEM SHALL push the candidate's file once per benchmark item with push-args `task` (the item's question text) and `prior_answer` (empty), and capture each push's returned `## Answer`.
- **R10**: WHEN all 3 items have been tested for a candidate, THE SYSTEM SHALL compute mean reward via the per-program `./scoped/scorer.sh` (same contract as Phase 7 — stdin = answer text, `$1` = expected, stdout = `1` or `0`).
- **R11**: IF a candidate's mean reward is less than 1.0, THEN THE SYSTEM SHALL invoke a post-mortem step that produces a short natural-language failure note for the archive entry (1-3 sentences citing per-item failures or structural issues).

### Operator contract

- **R12**: THE generated operator file SHALL be pushable with `task` and `prior_answer` push-args and SHALL produce `## State done` plus a `## Return` block whose `answer` key carries the operator's final answer text.
- **R13**: THE proposer SHALL be free-form regarding the candidate's internal structure: a candidate may have a multi-state state machine and MAY push existing library operators (`refine`, `cove`, etc.) as sub-operators within its own state machine.
- **R14**: WHERE a candidate uses sub-pushes, ITS push-arg names and value formats SHALL conform to the existing library operators' contracts (`task: |` and `prior_answer: |` for the simulation-style operators; `attempt: |` + `criterion: |` for `evaluate.md`; etc.).

### Halt and output

- **R15**: THE SYSTEM SHALL halt after `max_iterations` iterations (default 10) of the search loop OR when a candidate operator achieves mean reward == 1.0, whichever comes first.
- **R16**: WHEN ADAS-lite halts, THE SYSTEM SHALL emit `OUTPUT.md` (via the standard root-operator `## Return` mechanism) containing the best-scoring archive entry's full operator content, its score, and a 1-line summary per archive entry (filename → score, with failure-note glimpse).
- **R17**: WHILE the search runs, THE SYSTEM SHALL maintain `./scoped/recent_scores.md` with one line per completed iteration (`<entry-name>: <reward>`), capped at the most-recent 20 lines (matching aflow-lite's convention).

### Architectural alignment

- **R18**: THE SYSTEM SHALL house all deterministic bookkeeping (archive append, iteration counter, simulation tracking, halt detection, summary emission) in checked-in `lib/*.sh` scripts; LLM-judgement steps (proposing operators, generating failure notes, writing the per-program scorer) SHALL remain in operator prose. This mirrors aflow-lite's post-refactor architecture (commit `338e3d1`).
- **R19**: THE SYSTEM SHALL invoke each lib script via a single `bash ../../lib/<name>.sh` tool call from the active frame, with no inline bash heredocs in cycle prompts (other than at scorer-write and post-mortem time, where LLM-generated content goes into a scoped file).

### Failure handling

- **R20**: IF a candidate operator's push does not produce a `## Answer` for an item within a per-item cycle budget (default 50 cycles), THEN THE SYSTEM SHALL force-pop the candidate's frame, record that item's score as 0, and continue with the next item.
- **R21**: IF a generated operator file is structurally malformed (no `## Return` block, contains an unresolved `{{placeholder}}`, missing required state machine entry for state `empty`, etc.), THEN THE SYSTEM SHALL record the candidate's mean reward as 0 and write a failure note citing the structural issue without attempting to test the candidate.
- **R22**: IF the proposer returns no `operator_content` (empty `## Return`), THEN THE SYSTEM SHALL record an iteration-skipped entry in the archive (no operator content) with an explanatory note and continue to the next iteration.

### Isolation

- **R23**: THE SYSTEM SHALL not write outside the instance directory (`instances/<name>/`) at any point during a run; all generated operator files live in `./scoped/proposed-NN.md`, never in the interpreter's source `operators/` directory.

## Out of scope

- **MCTS / tree-based search.** ADAS-lite uses sequential iteration with a flat archive (faithful to the ADAS paper). Tree search was considered and rejected because it imposes parent-child mutation semantics that are awkward for LLM-generated operators (cross-archive hybridization is the primary value source, and a tree obstructs it).
- **Generation of whole interpreters or shell-level changes.** Each candidate is a single operator file. Generating multi-operator interpreters with their own state machines and lib scripts is a v2+ concern.
- **Cross-archive automated hybridization plumbing.** The proposer LLM does this implicitly by reading the full archive; we don't build explicit "combine #3 and #11" machinery.
- **Multi-benchmark support.** Same fixed 3-item GSM8K sample as aflow-lite. Other benchmarks require code-space generalisations of `scorer.sh` and `benchmark_items.md` that are out of scope for v1.
- **Parallel candidate evaluation.** Sequential only. Parallelism would require shell-level concurrency primitives that don't exist today.
- **Persistence of archive across runs.** Each ADAS-lite instance starts with an empty archive (then seeds with the 5 base ops). Carrying archives between instances is v2+.
- **Promotion of discovered operators into the canonical library.** A successful candidate stays in `instances/<name>/scoped/proposed-NN.md`. Promoting it into `interpreters/.../operators/` is a manual git operation by the user.
- **Code-space search.** Operators are markdown + bash, not Python. ADAS-paper's Python-code search is not v1.
- **MoA in any form.** Same exclusion as aflow-lite (blocked on per-prompt model selection in the harness).

## Open questions

- **Cycle budget per candidate per item (R20).** Default 50 cycles is a guess. Plan-execute can take 30-40 cycles on its own; a free-form generated operator that pushes 2-3 sub-operators could exceed that. Should it be configurable via `./scoped/per_item_cycle_budget.md`? Resolved: yes, `./scoped/per_item_cycle_budget.md` with default 50, editable by the user before run-start.
- **Post-mortem mechanism (R11).** Two options: (a) inline post-mortem step in `adas-lite.md`'s state machine — the LLM reads the candidate and per-item answers, writes a 1-3 sentence note; (b) separate `operators/post-mortem.md`. Tentative: inline (a) — fewer cycles, the prompt is small.
- **Scorer reuse from aflow-lite.** ADAS-lite needs the same per-program scorer concept. Should `lib/initialize.sh` write the scorer the same way aflow-lite does (LLM step at `init_scorer_pending`), or copy the scorer from a sibling aflow instance? Tentative: same LLM-write pattern. Each ADAS-lite instance is self-contained.
- **Halt-on-1.0 vs. continue exploring.** R15 halts on first 1.0. ADAS itself doesn't — it keeps exploring to find diverse high-scorers. Tentative: halt on first 1.0 for v1 to keep cost predictable; later iterations may prefer "halt only at max_iterations to allow archive-level diversity analysis."
