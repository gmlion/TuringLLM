# Design: phase-8-adas-lite-meta-interpreter

## Overview

ADAS-lite is a meta-interpreter that searches over operator code (markdown + bash + push/pop) rather than over operator compositions (aflow-lite's job). Each iteration: an LLM proposer reads an archive of past candidates (with scores and failure notes) and produces a brand-new operator file; the shell tests it on a 3-item GSM8K sample by pushing it once per item; the result is appended to the archive. The archive is pre-seeded with 5 hand-written base operators so the proposer has concrete scaffolds to imitate, mutate, and hybridise.

The design follows aflow-lite's post-refactor split (commit `338e3d1`): all bookkeeping is in `lib/*.sh`; LLM judgement is confined to two activities — writing the per-program scorer (once at init) and proposing/post-mortem-ing operators.

## File and directory layout

```
interpreters/mas-papers/7-meta-framework/b-adas-lite/
├── INSTRUCTIONS.md                # one-line marker: operators/adas-lite.md
├── PROGRAM.md                     # GSM8K-3 program (shared shape with a-aflow-lite)
├── README.md                      # human-facing notes
├── lib/
│   ├── common.sh                  # shared bash helpers (indent2, archive_append, etc.)
│   ├── initialize.sh              # bootstrap: PROGRAM copy, fixture sampling, constants
│   ├── seed_stage.sh              # pick next seed (or transition to propose phase)
│   ├── propose_push.sh            # stage propose-operator.md push with archive serialization
│   ├── propose_absorb.sh          # capture operator_content; validate; stage as candidate
│   ├── test_push.sh               # push candidate for the next item
│   ├── test_absorb.sh             # capture ## Answer; advance; score when items exhausted
│   ├── record_invalid.sh          # malformed candidate: append archive entry with score 0
│   ├── finalize_entry.sh          # append archive entry; advance iter_count; halt check
│   └── finalize_run.sh            # emit OUTPUT.md with best entry + per-entry summary
├── operators/
│   ├── adas-lite.md               # root operator (state machine driving the search)
│   ├── propose-operator.md        # LLM proposer (reads archive, writes new operator)
│   ├── refine.md                  # base op (byte-equal to a-aflow-lite/operators/refine.md)
│   ├── reflexion.md               # base op
│   ├── cove.md                    # base op
│   ├── plan-execute.md            # base op
│   ├── debate.md                  # base op
│   ├── answer-independently.md    # support op (pushed by cove)
│   ├── evaluate.md                # support op (pushed by reflexion)
│   ├── opine.md                   # support op (pushed by debate)
│   ├── plan.md                    # support op (pushed by plan-execute)
│   ├── reflect.md                 # support op (pushed by reflexion)
│   ├── tackle.md                  # support op (pushed by plan-execute)
│   └── verify.md                  # support op (pushed by cove)
└── workspace/
    └── gsm8k.jsonl                # fixture (byte-equal to a-aflow-lite's)
```

The 13 operator-library files are byte-equal copies from `a-aflow-lite/operators/`; we can `cp` them at interpreter-creation time. They live in the interpreter's source tree so `new-instance.sh` copies them into each instance's `operators/` (giving generated candidates the freedom to push them as sub-operators per R13/R14).

## Per-frame instance layout (post-bootstrap)

```
instances/<name>/
├── PROGRAM.md
├── .root-operator                 # → operators/adas-lite.md
├── .call-stack.json
├── operators/                     # 13 files (5 base + propose + 7 support + adas-lite)
├── workspace/
│   └── gsm8k.jsonl
├── frames/
│   └── f000-adas-lite/
│       ├── INSTRUCTIONS.md        # operators/adas-lite.md content with {{program}} substituted
│       ├── MEMORY.md
│       └── scoped/                # see scoped layout below
└── OUTPUT.md                      # written on halt
```

Pushed frames (during seed-test, proposer, candidate-test, sub-pushes initiated by candidates) appear and disappear under `frames/` as the run proceeds. Each `frames/fNNN-<slug>/scoped/` is the pushed frame's own heap and is not touched by the root frame's lib scripts.

## Scoped layout (root frame `f000-adas-lite/scoped/`)

| File | Lifetime | Content |
|------|----------|---------|
| `task.md` | run | byte-equal copy of `../../PROGRAM.md` |
| `benchmark_items.md` | run | 3 fixture rows as JSON lines (1st, middle, last) |
| `scorer.sh` | run | LLM-written per-program scorer (same contract as aflow-lite) |
| `max_iterations.md` | run | `10` (cycle budget for proposer iterations) |
| `per_item_cycle_budget.md` | run | `50` (R20 default; user may edit before launch) |
| `iter_count.md` | run | proposer-iteration counter; bumped after each archive entry from the propose phase |
| `seed_queue.md` | run | one base-op name per line, consumed by `seed_stage.sh` |
| `seed_idx.md` | run | integer pointer into `seed_queue.md` |
| `phase.md` | run | `seed` or `propose` |
| `candidate_path.md` | run | path to the operator file currently being tested (e.g. `./scoped/proposed-03.md` or `./operators/refine.md`) |
| `candidate_label.md` | run | display label for archive entry (e.g. `seed-refine`, `proposed-03`) |
| `archive/NN-<slug>.md` | run | one archive entry; see "Archive entry format" below |
| `recent_scores.md` | run | `<label>: <score>` lines, capped at last 20 |
| `proposed-NN.md` | run | per-iteration generated operator file (NN matches archive entry counter for the propose phase) |
| `sim/current_item.md` | per-candidate | `0`/`1`/`2` (which benchmark item is being tested) |
| `sim/scores.md` | per-candidate | one `1` or `0` per item, appended as items complete |
| `sim/answers.md` | per-candidate | one JSON line per item, `{"item":N,"answer":"..."}`, appended for post-mortem |
| `sim/note.md` | per-candidate | LLM-written failure note (1-3 sentences; only created when reward < 1.0) |
| `sim/cycles_used.md` | per-candidate | per-item cycle counter (R20); reset at each item start |

`./scoped/sim/` is wiped after each archive entry is finalized.

## Archive entry format (`./scoped/archive/NN-<slug>.md`)

YAML front-matter for fast parsing by `finalize_run.sh`, then the operator content verbatim:

```
---
entry: 03
label: proposed-03
phase: propose
score: 0.6667
items_passed: 2
items_total: 3
per_item_scores: 1,1,0
malformed: false
---
## Failure note

Got item 3 wrong because the candidate's verification step pushed cove
without forwarding the prior_answer, so verify.md operated on an empty draft.

## Operator content

<full operator markdown, including its own `## Instruction:` blocks and any push-args contracts>
```

Entries are append-only (R5). NN is a global counter across both seed and propose phases so the archive's natural ordering reflects exploration order.

## Push-args serialization for the proposer

`lib/propose_push.sh` builds the proposer's push-args in two YAML keys to keep the prompt structured and simple to parse:

```
## Push
operators/propose-operator.md
## Push-Args
archive: |
  --- entry 01 (seed-refine, score 1.0000) ---
  Per-item: 1,1,1
  No failure note.
  Operator content:
  <verbatim content of refine.md, two-space indented as YAML block scalar>

  --- entry 02 (seed-reflexion, score 0.6667) ---
  Per-item: 1,1,0
  Failure note: Got item 3 wrong because reflexion's evaluate.md returned pass after one attempt without verifying the integer extraction.
  Operator content:
  <verbatim content of reflexion.md>

  ... (one block per archive entry, in order)
benchmark_sample: |
  Item 1: <question text from benchmark_items.md, one block per item, indented>
  Item 2: ...
  Item 3: ...
task: |
  <PROGRAM.md content, indented>
```

Three push-arg keys: `archive` (the full archive serialized as plain text — entries are read top-to-bottom), `benchmark_sample` (the 3 fixture questions, no answers — the proposer should not see ground truth), `task` (PROGRAM.md for domain context).

This format is the simplest faithful approximation of ADAS's "discovered agent archive" prompt: each entry self-contained, in chronological order, scores visible, failure notes visible, full operator text inlined. The proposer LLM does the hybridization work implicitly.

## Operator state machines

### `operators/adas-lite.md` (root)

Strategy section (verbatim across update_instructions calls):

> ADAS-lite searches over operator code by iterating: read an archive of past
> candidates, propose a new operator, test it on 3 GSM8K items, score it,
> append it to the archive. The archive is pre-seeded with 5 hand-written base
> operators (refine, reflexion, cove, plan-execute, debate). Halts on first
> mean-reward 1.0 or after `max_iterations` proposer iterations.

State machine:

| State | Instruction | Mechanism |
|---|---|---|
| `empty` | Initialize | `bash ../../lib/initialize.sh` |
| `init_scorer_pending` | Init-write-scorer | LLM writes `./scoped/scorer.sh` (verbatim copy of aflow-lite's instruction; same scorer contract) |
| `seeding_or_proposing` | Stage-next | `bash ../../lib/seed_stage.sh` — if seeds remain, stage next seed and transition to `test_pending`; else transition to `propose_pending` |
| `propose_pending` | Propose-push | `bash ../../lib/propose_push.sh` emits `## Push operators/propose-operator.md` with archive/sample/task push-args; returnState = `propose_pending` |
| `propose_pending_completed` | Propose-absorb | `bash ../../lib/propose_absorb.sh` extracts `operator_content` from spliced `## Operator_content`, writes to `./scoped/proposed-NN.md`, validates structure, transitions to `test_pending` (valid) or `record_invalid` (malformed) |
| `test_pending` | Test-push | `bash ../../lib/test_push.sh` emits `## Push <candidate_path>` with `task` and `prior_answer: ""` push-args for the current item |
| `test_pending_completed` | Test-absorb | `bash ../../lib/test_absorb.sh` captures spliced `## Answer`, appends to `sim/answers.md`, advances item; on item==3, scores via `scorer.sh`, transitions to `post_mortem_pending` (reward < 1.0) or `finalize_entry` (reward == 1.0) |
| `post_mortem_pending` | Post-mortem-write | LLM reads `./scoped/sim/answers.md`, the candidate's content at `./scoped/candidate_path.md`, and `./scoped/sim/scores.md`; writes a 1-3 sentence note to `./scoped/sim/note.md` (surgical write — overwrite of single file is fine since it's per-candidate); then transitions to `finalize_entry` via wholesale MEMORY rewrite |
| `record_invalid` | Record-invalid | `bash ../../lib/record_invalid.sh` — append archive entry with score 0 + structural-issue note; transition to `seeding_or_proposing` |
| `finalize_entry` | Finalize-entry | `bash ../../lib/finalize_entry.sh` — read sim/scores.md + sim/note.md, append archive entry, append recent_scores, wipe sim/, advance iter_count if phase==propose, halt check (R15: reward 1.0 OR iter_count==max → `finalizing`; else `seeding_or_proposing`) |
| `finalizing` | Finalize-run | `bash ../../lib/finalize_run.sh` — scan archive, pick best entry, write `## Return answer` block referencing best operator + 1-line summary per archive entry; transition to `done` |
| `done` | (shell intercepts) | root frame halts; OUTPUT.md splices `## Return` |

The state-name suffix `_completed` is the canonical pop suffix (Phase 7 semantics): when the candidate's frame pops with `## Answer`, the caller's state goes `test_pending` → `test_pending_completed`.

### `operators/propose-operator.md`

Strategy:

> Propose a brand-new operator file by reading the archive (full text + scores
> + failure notes) and the benchmark sample. The operator must be pushable
> with `task` and `prior_answer` push-args and must end with `## State done`
> + `## Return` block whose `answer` key carries the operator's final answer
> text. The operator may push existing library operators as sub-operators.

Single instruction (`empty` state) writes:

```
## State
done
## Matched Instruction
Generate operator
## Last Action
Composed a new candidate operator from the archive context.
## Result
Operator drafted.
## Return
operator_content: |
  <full operator markdown, two-space indented as YAML block scalar>
```

Push-args received: `{{archive}}`, `{{benchmark_sample}}`, `{{task}}`. The strategy section spells out the operator contract requirements (the candidate's required `## Instruction:` blocks, the `## Return` block with `answer` key, the available library operators it may push).

## Lib script contracts

All scripts: CWD = active frame directory; bash `set -euo pipefail`; idempotent within a single cycle; read/write only `./MEMORY.md` and `./scoped/*`.

### `initialize.sh`

Inputs: `../../PROGRAM.md`, `../../workspace/gsm8k.jsonl`.
Outputs: `./scoped/{task.md,benchmark_items.md,max_iterations.md,per_item_cycle_budget.md,iter_count.md,seed_queue.md,seed_idx.md,phase.md,recent_scores.md,archive/}`. Sets phase=`seed`, seed_idx=0, iter_count=0, seed_queue lists `refine,reflexion,cove,plan-execute,debate` (one per line). Transitions MEMORY to `init_scorer_pending`.

Errors: missing fixture or fewer than 3 items → `waiting_for_user` with explanatory pending question (mirrors aflow-lite's pattern).

### `seed_stage.sh`

Reads `seed_idx.md`, `seed_queue.md`, `phase.md`. If `phase == seed` and `seed_idx < 5`: writes `candidate_path.md = ./operators/<seed-name>.md`, `candidate_label.md = seed-<seed-name>`, increments seed_idx, resets `sim/current_item.md` to 0, ensures `sim/{scores.md,answers.md}` exist (empty), transitions to `test_pending`. If `phase == seed` and `seed_idx == 5`: writes `phase.md = propose`, transitions to `propose_pending`. If `phase == propose`: transitions to `propose_pending`.

### `propose_push.sh`

Reads archive (sorted by entry NN), `benchmark_items.md`, `task.md`. Composes the three push-args (archive, benchmark_sample, task), each as YAML block scalar (uses `indent2` from `common.sh`). Writes `## Push operators/propose-operator.md` + `## Push-Args` to MEMORY. State stays `propose_pending` (will become `propose_pending_completed` after pop).

### `propose_absorb.sh`

Reads spliced `## Operator_content` block from MEMORY (the value of `operator_content` returned by the proposer). The proposer returns the key as `operator_content`, which the shell splices into a `## Operator_content` section per Phase-2b grammar.

Computes next NN as `(seeded entries: 5) + iter_count + 1` if phase==propose. Writes that content to `./scoped/proposed-NN.md`. Validates:

1. File contains a `## Return` line.
2. File contains a `## Instruction:` line.
3. File contains at least one occurrence of "MEMORY state is \"empty\"" (or near-equivalent regex `state\s+is\s+"empty"`).
4. File contains no unresolved `{{...}}` placeholders other than `{{task}}`/`{{prior_answer}}` (the contractually-supplied push-args).

If all pass: writes `candidate_path.md = ./scoped/proposed-NN.md`, `candidate_label.md = proposed-NN`, resets `sim/`, transitions to `test_pending`. If any fails: transitions to `record_invalid` with note text composed from the failed checks.

### `test_push.sh`

Reads `sim/current_item.md`, `benchmark_items.md`, `candidate_path.md`. Picks item N (0-indexed), extracts `question` via python3 json (mirrors aflow-lite's pattern). Writes `## Push <candidate_path>` + push-args `task` (the question) and `prior_answer: ""`.

R20 enforcement: increments `sim/cycles_used.md`. If counter exceeds `per_item_cycle_budget.md`, instead writes a force-pop directive — actually, force-pop requires shell-level support that doesn't exist today, so the lib script writes MEMORY with `## State waiting_for_user` and a pending question explaining the timeout, deferring force-pop until a real Phase-8.1 (out of scope per R20-as-stated). v1 implementation: log the budget warning to MEMORY's `## Last Action` but proceed; if the candidate genuinely never returns `## Answer` within the budget the user must intervene.

(Open question: this softens R20 from "force-pop and continue" to "warn and require user intervention." Will flag in the kiro-flow checkpoint as an R20 weakening unless the user wants Phase-8.1 force-pop primitives in scope.)

### `test_absorb.sh`

Reads spliced `## Answer` from MEMORY, appends to `./scoped/sim/answers.md` as `{"item":N,"answer":"<text>"}`. Increments item index. If items < 3: transitions back to `test_pending`. If items == 3: scores all 3 via `./scoped/scorer.sh` (reading expected from `benchmark_items.md`), writes per-item to `sim/scores.md`, computes mean. If mean == 1.0: transitions to `finalize_entry` (skipping post-mortem). Else: transitions to `post_mortem_pending`.

### `record_invalid.sh`

Computes archive entry NN, writes archive entry with score 0, malformed=true, failure note text (from `propose_absorb.sh`'s validation reasons, passed via `./scoped/sim/note.md` written by propose_absorb), advances iter_count if phase==propose, transitions to `seeding_or_proposing` (or `finalizing` on max-iter).

### `finalize_entry.sh`

Computes archive entry NN. Writes archive entry with score, per-item scores, failure note (from `sim/note.md` if present, else "No failure note."), full operator content (read from `candidate_path.md`). Appends to `recent_scores.md` (cap 20). Wipes `./scoped/sim/`. If `phase == propose`: advances `iter_count`. Halt check: if last computed mean == 1.0 OR (phase==propose AND iter_count >= max): transitions to `finalizing`. Else: transitions to `seeding_or_proposing`.

### `finalize_run.sh`

Scans `./scoped/archive/`. Parses each entry's front-matter, finds max score (ties broken by entry NN — first to reach the max wins). Writes MEMORY:

```
## State
done
## Matched Instruction
Finalize-run
## Last Action
Halted; emitting OUTPUT via ## Return.
## Result
Best entry: <label> (score <S>).
## Return
answer: |
  Best operator: <label> (mean reward <S> over 3 GSM8K items)

  Archive summary (<N> entries):
  <NN> <label>: <score> — <failure-note-first-line>
  <NN> <label>: <score> — <failure-note-first-line>
  ...

  Best operator content:
  <best entry's operator content, two-space indented>
```

Phase-7 root-pop will then write `OUTPUT.md` with section `## Answer` containing the above. (The full archive content stays in `./scoped/archive/` for inspection; OUTPUT only carries the summary + best operator.)

## Phase 7 alignment

- **Push/pop semantics:** Used at every test-push (candidate-as-sub-operator) and at the proposer step. No bypass of standard mechanism.
- **Per-frame directories:** Root frame `f000-adas-lite/`. Pushed candidates land at `f001-<slug>/`, `f002-<slug>/`, etc., with their own scoped heaps (untouched by ADAS-lite's lib scripts).
- **`## Return` splicing:** Proposer returns `operator_content`; candidate test-pushes return `answer`. Both become top-level MEMORY sections in the caller (`## Operator_content`, `## Answer`).
- **Surgical edits:** `lib/*.sh` always rewrites `MEMORY.md` wholesale (one MEMORY per cycle, fully owned by the script). Surgical updates apply to `recent_scores.md` (append + tail-20), `sim/answers.md` and `sim/scores.md` (append). `archive/NN-<slug>.md` files are write-once.
- **No inline heredocs in cycle prompts:** Init-write-scorer (heredoc writing scorer.sh) and Post-mortem-write (write to `sim/note.md`) are the two LLM-judgement steps that do file writes from prose. Same exception aflow-lite carved out at `Init-write-scorer`.

## Open questions resolved during design

1. **Cycle budget per item (R20).** Soft-warn implementation in v1: lib script logs a warning when `per_item_cycle_budget.md` is exceeded but does not force-pop (force-pop requires shell-level primitive that doesn't exist). User intervention required if a candidate genuinely never returns. **R20 amended:** "WARN in MEMORY when exceeded; force-pop is out of scope for v1." → flag in kiro-flow checkpoint.

2. **Post-mortem mechanism (R11).** Inline LLM step in `adas-lite.md`'s state machine (no separate operator). The prompt is small (read `sim/answers.md` + candidate file + scores; write 1-3 sentences). Saves one push.

3. **Scorer reuse (R10).** Same LLM-write pattern as aflow-lite (`init_scorer_pending` state). Each ADAS-lite instance is self-contained.

4. **Halt-on-1.0 (R15).** Honoured as written. v1 halts on first 1.0 to keep cost predictable. Continuation policy (explore for diversity past first 1.0) deferred to v2.

## Open questions remaining

- **Archive serialization size.** With 5 seeds + up to 10 proposed entries × full operator content, the proposer's prompt can run to many KB. If this becomes a context issue in practice, swap to "summary lines for old entries, full content only for last 5". v1 ships with full inlining for fidelity to ADAS.
- **Force-pop primitive (R20 weakening).** Above. May trigger a Phase-8.1 to add a shell-level force-pop on cycle-budget exhaustion.
- **Halt cascade when proposer returns empty `operator_content`.** R22 says record skipped, continue. `record_invalid.sh` covers this if `propose_absorb.sh` treats empty content as failed validation. Confirmed in script contract above.

## Smoke-test plan

After implementation, before kiro-flow Phase 4 close:

1. `./new-instance.sh adas1 interpreters/mas-papers/7-meta-framework/b-adas-lite`
2. `instances/adas1/run.sh` — expect to reach `seeding_or_proposing` after init+scorer-write.
3. Watch the 5 seed candidates run: archive entries 01-05 should appear at `./scoped/archive/`. Expect refine to score 1.0 (matches aflow5's empirical result) — that triggers an early halt at entry 01 if so. To observe the propose phase, edit `lib/finalize_entry.sh` mid-run to suppress halt-on-1.0 (or use a harder benchmark item set). Document workaround.
4. Verify `OUTPUT.md` contains best entry + per-entry summary lines.
5. Diff against aflow-lite's `OUTPUT.md` shape for consistency.
