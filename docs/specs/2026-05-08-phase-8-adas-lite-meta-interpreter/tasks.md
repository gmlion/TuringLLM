# Tasks: phase-8-adas-lite-meta-interpreter

Implementation broken into ordered, testable units. Each task ends in a verifiable state. Tasks 1–4 set up the skeleton; tasks 5–11 implement lib scripts and operators in dependency order; tasks 12–14 cover end-to-end smoke testing and docs.

The work is additive — no existing files are modified. Total estimated touch surface: 2 new directories, ~20 new files, 0 changes to `src/`.

---

## T1. Scaffold the interpreter directory

**Goal:** create `interpreters/mas-papers/7-meta-framework/b-adas-lite/` with empty placeholders so subsequent tasks have a stable layout to fill in.

**Steps:**
1. `mkdir -p interpreters/mas-papers/7-meta-framework/b-adas-lite/{lib,operators,workspace}`
2. Create `INSTRUCTIONS.md` with content `operators/adas-lite.md` (single line, no trailing newline matters — match a-aflow-lite's exact format).
3. Create empty placeholder files: `lib/common.sh`, `lib/initialize.sh`, `lib/seed_stage.sh`, `lib/propose_push.sh`, `lib/propose_absorb.sh`, `lib/test_push.sh`, `lib/test_absorb.sh`, `lib/record_invalid.sh`, `lib/finalize_entry.sh`, `lib/finalize_run.sh`, `operators/adas-lite.md`, `operators/propose-operator.md`. (Each just contains a one-line stub comment so git tracks them.)
4. Copy `interpreters/mas-papers/7-meta-framework/a-aflow-lite/workspace/gsm8k.jsonl` → `interpreters/mas-papers/7-meta-framework/b-adas-lite/workspace/gsm8k.jsonl` (byte-equal).
5. Copy `interpreters/mas-papers/7-meta-framework/a-aflow-lite/PROGRAM.md` → `interpreters/mas-papers/7-meta-framework/b-adas-lite/PROGRAM.md`.

**Verification:** `ls interpreters/mas-papers/7-meta-framework/b-adas-lite/` shows the layout from design.md §"File and directory layout" (minus README.md, deferred to T14).

**Requirements covered:** R1, R2 (workspace fixture present).

---

## T2. Copy base + support operators from a-aflow-lite

**Goal:** populate `b-adas-lite/operators/` with the 12 byte-equal operator copies from a-aflow-lite, so `new-instance.sh` will copy them into instances and the proposer's `task`/`prior_answer` push-arg contracts work uniformly.

**Steps:**
1. For each of `refine.md`, `reflexion.md`, `cove.md`, `plan-execute.md`, `debate.md`, `answer-independently.md`, `evaluate.md`, `opine.md`, `plan.md`, `reflect.md`, `tackle.md`, `verify.md`: `cp interpreters/mas-papers/7-meta-framework/a-aflow-lite/operators/<name>.md interpreters/mas-papers/7-meta-framework/b-adas-lite/operators/<name>.md`.
2. Verify byte-equality: `diff -r interpreters/mas-papers/7-meta-framework/a-aflow-lite/operators/ interpreters/mas-papers/7-meta-framework/b-adas-lite/operators/` should show only `aflow-lite.md` (a-side) vs. `adas-lite.md` + `propose-operator.md` (b-side) and `expand-workflow.md` (a-side, no b-side equivalent).

**Verification:** `diff` output confirms 12 files match exactly.

**Requirements covered:** R13, R14 (sub-push contracts available because library files match aflow-lite's byte-for-byte).

---

## T3. Write `lib/common.sh`

**Goal:** shared bash helpers used by every other lib script.

**Contents:**
- `set -euo pipefail` boilerplate.
- `BASE_LIBRARY="refine reflexion cove plan-execute debate"` (newline- or space-separated; consumers split as needed).
- `indent2()` — pipe stdin through `sed 's/^/  /'`. Identical to aflow-lite's.
- `archive_count()` — outputs the number of files in `./scoped/archive/`. Used to compute next NN.
- `next_archive_nn()` — outputs zero-padded NN for the next archive entry (e.g. `06`).
- `archive_write()` — function taking entry NN, label, phase, score, items_passed, per_item_scores, malformed flag, note text, candidate-file path; writes the archive entry per design.md's format.
- `recent_scores_append()` — append `<label>: <score>` and tail to last 20.
- `extract_answer()` — awk one-liner extracting the spliced `## Answer` block from `./MEMORY.md` (mirrors aflow-lite's pattern).
- `extract_operator_content()` — awk one-liner extracting the spliced `## Operator_content` block from `./MEMORY.md`.

**Verification:** sourceable; running `bash -n lib/common.sh` returns no errors. Manually invoke `archive_count` in an empty `./scoped/archive/` test dir, expect `0`.

**Requirements covered:** none directly; foundation for R3, R4, R8, R10, R16, R17.

---

## T4. Write `lib/initialize.sh`

**Goal:** bootstrap a run — copy PROGRAM, sample 3 fixture items deterministically (1st, middle, last), set constants, transition to `init_scorer_pending`.

**Pattern source:** aflow-lite's `lib/initialize.sh`, adapted: no tree.md (no MCTS); add `seed_queue.md`, `seed_idx.md`, `phase.md`, `per_item_cycle_budget.md`; create `archive/` dir; create empty `recent_scores.md`.

**Error paths preserved:** missing fixture and fixture-too-small both transition to `waiting_for_user` with explanatory pending question (mirrors aflow-lite's error handling exactly).

**Verification:** Manual test in a scratch frame dir:
- Create `../../PROGRAM.md` and `../../workspace/gsm8k.jsonl` (5 lines).
- Run `bash lib/initialize.sh`.
- Confirm `./scoped/{task.md,benchmark_items.md,max_iterations.md,per_item_cycle_budget.md,iter_count.md,seed_queue.md,seed_idx.md,phase.md,recent_scores.md}` all exist and contain expected values; `./scoped/archive/` exists and is empty; `./MEMORY.md` shows state `init_scorer_pending`.

**Requirements covered:** R1, R2, partial R4 (archive dir created).

---

## T5. Write `lib/seed_stage.sh`

**Goal:** state-machine glue between the propose phase and the seeding phase. On entry, decides whether the next archive entry comes from a base operator (seed phase) or the proposer (propose phase).

**Logic:**
- If `phase == seed` AND `seed_idx < 5`: read `seed_queue.md[seed_idx]`, set `candidate_path.md = ./operators/<name>.md`, `candidate_label.md = seed-<name>`, increment `seed_idx`, reset `sim/{current_item.md=0,scores.md=,answers.md=,note.md=}` (note kept absent until post-mortem), transition to `test_pending`.
- Else if `phase == seed` AND `seed_idx == 5`: write `phase.md = propose`, transition to `propose_pending`.
- Else (`phase == propose`): transition to `propose_pending`.

**Verification:** unit-style — set up `./scoped/{phase.md,seed_idx.md,seed_queue.md}` with three combinations and verify the script's transitions in `./MEMORY.md`.

**Requirements covered:** R3 (seed phase setup), drives R6 once seeds done.

---

## T6. Write `lib/test_push.sh` and `lib/test_absorb.sh`

**Goal:** the 3-item simulation loop for any candidate (seed or proposed). Pushes the candidate once per item, captures `## Answer`, scores when items exhausted.

**`test_push.sh`:**
- Read `sim/current_item.md`, `benchmark_items.md`, `candidate_path.md`.
- Extract `question` from item N via `python3 -c 'import sys,json; print(json.loads(sys.stdin.read())["question"])'` (mirrors aflow-lite's pattern).
- Compose push-args: `task: |\n<indent2 question>` and `prior_answer: |\n` (empty).
- Increment `sim/cycles_used.md` (a per-item budget counter; reset on item advance).
- If counter > `per_item_cycle_budget.md`: write a warning into MEMORY's `## Last Action` (no force-pop in v1 per design.md note); proceed normally.
- Write MEMORY with `## Push <candidate_path>` + `## Push-Args`. State stays `test_pending` (post-pop becomes `test_pending_completed`).

**`test_absorb.sh`:**
- Extract `## Answer` via `extract_answer` from common.sh.
- Append `{"item": N, "answer": "<text>"}` to `sim/answers.md`.
- Increment `sim/current_item.md`.
- Reset `sim/cycles_used.md` to 0.
- If next item < 3: transition back to `test_pending`.
- If next item == 3: score all items via `./scoped/scorer.sh`, write per-item to `sim/scores.md`, compute mean. If mean == 1.0: transition to `finalize_entry` (skipping post-mortem). Else: transition to `post_mortem_pending`.

**Verification:** scratch frame test — fake `candidate_path.md` pointing at `./operators/refine.md`, fake `MEMORY.md` with a `## Answer` block from a prior pop, run `test_absorb.sh` repeatedly with synthetic answers; verify scoring path triggers correctly at item 3.

**Requirements covered:** R8 (test on 3 items), R9 (push contract: task + prior_answer empty), R10 (scorer invocation), R20 (warning, not force-pop, per design.md amendment).

---

## T7. Write `lib/finalize_entry.sh` and `lib/record_invalid.sh`

**Goal:** archive append — both the success path and the malformed-candidate path.

**`finalize_entry.sh`:**
- Read `sim/scores.md`, `sim/note.md` (if exists), `candidate_path.md`, `candidate_label.md`, `phase.md`.
- Compute `next_archive_nn`, `score`, `items_passed`, `per_item_scores`.
- Call `archive_write` from common.sh to produce `./scoped/archive/NN-<label>.md`.
- Append `<label>: <score>` to `recent_scores.md` (cap 20).
- Wipe `./scoped/sim/`.
- If `phase == propose`: increment `iter_count.md`.
- Halt check: if last computed mean == 1.0 OR (`phase == propose` AND `iter_count >= max_iterations`): transition to `finalizing`. Else: transition to `seeding_or_proposing`.

**`record_invalid.sh`:**
- Read structural-failure note from `./scoped/sim/note.md` (written by `propose_absorb.sh` on validation failure).
- Read `candidate_path.md`, `candidate_label.md`, `phase.md`.
- Call `archive_write` with score=0, malformed=true, per_item_scores="-", items_passed=0.
- Wipe `./scoped/sim/`.
- If `phase == propose`: increment `iter_count.md`.
- Halt check (same as finalize_entry): transition to `finalizing` or `seeding_or_proposing`.

**Verification:** scratch test with fabricated `sim/{scores.md,note.md}` and a fake candidate file; confirm archive entry written with correct front-matter, recent_scores updated, sim/ wiped, MEMORY transitions correctly. Test halt path by setting iter_count to max-1 and running.

**Requirements covered:** R4 (archive entry format), R5 (append-only), R11 (failure note in entry), R15 (halt conditions), R17 (recent_scores cap), R21 (malformed → score 0 + note), R22 (empty operator_content via record_invalid).

---

## T8. Write `lib/finalize_run.sh`

**Goal:** scan archive, pick best entry, emit `## Return answer` block summarizing the run.

**Logic:**
- List `./scoped/archive/*.md` sorted by NN.
- For each entry: parse front-matter (entry, label, phase, score, items_passed, items_total, malformed) via awk.
- Find max-score entry (tie-break: lowest NN wins — first to reach the score).
- Read best entry's `## Operator content` section verbatim.
- Build summary lines: `NN <label>: <score> — <first line of failure note, or "perfect" if score=1.0>`.
- Write MEMORY with `## State done` + `## Return answer: |` block containing best operator label, score, the per-entry summary, and the full best operator content (indented).

**Verification:** scratch test with 3 fabricated archive entries (one perfect, one partial, one malformed). Confirm `## Return answer` contains best operator content, all 3 summary lines, correct selection.

**Requirements covered:** R16 (OUTPUT.md surfaces best + per-entry summary).

---

## T9. Write `operators/adas-lite.md` (root operator state machine)

**Goal:** the root operator that drives the whole search. Wraps every lib script as a single instruction.

**Structure (mirroring aflow-lite.md's shape):**
1. Header + 1-paragraph description of ADAS-lite.
2. `## Architecture: bookkeeping in scripts, judgement in prose` — same disclaimer as aflow-lite about not summarising or rewriting lib scripts inline.
3. `## Scoped files` table (copied from design.md §"Scoped layout").
4. `## Operator library` section — names the 5 base ops; cross-ref `lib/common.sh::BASE_LIBRARY`.
5. `## Scorer contract` — copied verbatim from aflow-lite.md (same scorer contract).
6. **Above `# Sub-instructions`** (preserved across update_instructions): `## Instruction: Initialize`, `## Instruction: Init-write-scorer`. The scorer-write instruction is byte-equal to aflow-lite's including the wholesale-rewrite heredoc that transitions to the next state — but the next state is `seeding_or_proposing` instead of `selecting`.
7. **`# Sub-instructions`** (LLM-rewriteable):
   - `Stage-next` (state `seeding_or_proposing`): `bash ../../lib/seed_stage.sh`.
   - `Propose-push` (state `propose_pending`): `bash ../../lib/propose_push.sh`.
   - `Propose-absorb` (state `propose_pending_completed`, requires `## Operator_content`): `bash ../../lib/propose_absorb.sh`.
   - `Test-push` (state `test_pending`): `bash ../../lib/test_push.sh`.
   - `Test-absorb` (state `test_pending_completed`, requires `## Answer`): `bash ../../lib/test_absorb.sh`.
   - `Post-mortem-write` (state `post_mortem_pending`): LLM reads `./scoped/sim/answers.md`, candidate file at `./scoped/candidate_path.md`'s value, `./scoped/sim/scores.md`; writes 1-3 sentences to `./scoped/sim/note.md`; wholesale-rewrites MEMORY transitioning to `finalize_entry`. (Inline LLM step — same exception aflow-lite makes for `Init-write-scorer`.)
   - `Record-invalid` (state `record_invalid`): `bash ../../lib/record_invalid.sh`.
   - `Finalize-entry` (state `finalize_entry`): `bash ../../lib/finalize_entry.sh`.
   - `Finalize-run` (state `finalizing`): `bash ../../lib/finalize_run.sh`.

**Verification:** `bash -n` is N/A (markdown). Visual review against design.md §"`operators/adas-lite.md` (root)" state-machine table — every state has exactly one matching instruction. Confirm strategy section header convention (`# Strategy` → `# Sub-instructions`) matches aflow-lite.md.

**Requirements covered:** R1 (root operator present), R6 (proposer-push wired), R10 (scorer invocation wired), R11 (post-mortem inline step), R15 (halt logic delegated to finalize_entry), R18 (script/prose split honored).

---

## T10. Write `lib/propose_push.sh`

**Goal:** serialize the archive into the proposer's push-args and emit the push.

**Logic:**
- For each `./scoped/archive/NN-*.md` (sorted): parse front-matter (label, score, items_passed, items_total, per_item_scores, malformed), extract the `## Failure note` and `## Operator content` sections. Compose a per-entry block:

  ```
  --- entry NN (<label>, score <score>) ---
  Per-item: <per_item_scores>
  <Failure note: <first line of note> | No failure note.>
  Operator content:
  <indent2 of operator content>
  ```

- Concatenate blocks into `archive` text (separated by blank lines).
- Build `benchmark_sample`: for each line of `benchmark_items.md`, extract the `question` field via python3 json, format as `Item N: <question>`.
- `task`: contents of `./scoped/task.md`.
- All three values get YAML block-scalar formatting (`indent2`).
- Write MEMORY:

  ```
  ## State
  propose_pending
  ## Matched Instruction
  Propose-push
  ## Last Action
  Pushing operators/propose-operator.md with archive size <N>.
  ## Result
  Push queued.
  ## Push
  operators/propose-operator.md
  ## Push-Args
  archive: |
  <indented archive>
  benchmark_sample: |
  <indented benchmark_sample>
  task: |
  <indented task>
  ```

**Verification:** scratch test — populate `./scoped/archive/` with 2 fake entries, `./scoped/benchmark_items.md` with 3 lines, `./scoped/task.md` with sample text. Run `propose_push.sh`. Inspect resulting MEMORY: confirm `## Push` and `## Push-Args` blocks present, all three keys populated, archive entries serialized in order.

**Requirements covered:** R6 (full archive in push-args), R8 (proposer push wiring).

---

## T11. Write `lib/propose_absorb.sh`

**Goal:** capture the proposer's `operator_content`, validate it, write to scoped, transition to test or record-invalid.

**Logic:**
- `extract_operator_content` from common.sh — pulls the `## Operator_content` block.
- If empty: write `./scoped/sim/note.md` = "Proposer returned empty operator_content."; transition to `record_invalid`.
- Compute next NN: `iter_count + 6` (5 seeds preceded; 1-indexed) — actually use `next_archive_nn` from common.sh (consistent with seed entries also being numbered by `archive_count + 1`).
- Wait — design.md says NN is global across phases. So just use `next_archive_nn`.
- Write content to `./scoped/proposed-NN.md` (NN here is the propose-iteration counter, NOT the archive NN — i.e., `iter_count + 1`, zero-padded). Both naming schemes coexist: archive entry NN tracks archive position, `proposed-NN.md` tracks propose iteration. Keep the propose-iteration counter for human readability of `./scoped/proposed-*.md`.
- Validate (per design.md):
  1. Contains `## Return` line.
  2. Contains `## Instruction:` line.
  3. Contains `state\s+is\s+"empty"` (regex via grep -E).
  4. Contains no unresolved `{{...}}` placeholders other than `{{task}}`/`{{prior_answer}}`.
- If any check fails: collect failure reasons into `./scoped/sim/note.md`; transition to `record_invalid`.
- Set `candidate_path.md = ./scoped/proposed-NN.md`, `candidate_label.md = proposed-NN`, reset `sim/{current_item.md=0,scores.md=,answers.md=}`. Transition to `test_pending`.

**Verification:** scratch test — fake MEMORY with valid `## Operator_content`, run, confirm proposed-NN.md written and state is `test_pending`. Then test invalid cases (missing `## Return`, unresolved `{{foo}}`) — confirm transition to `record_invalid` with explanatory note.

**Requirements covered:** R7 (operator_content key), R8 (write to scoped), R12 (operator-contract validation), R21 (malformed → record_invalid), R23 (writes only inside instance).

---

## T12. Write `operators/propose-operator.md`

**Goal:** LLM-facing prompt that proposes a candidate operator from the archive context.

**Structure:**
- Header + brief description (mirrors aflow-lite's `expand-workflow.md` shape).
- "IMPORTANT: this operator is loaded only at push-time" disclaimer.
- Push-args declared: `{{archive}}`, `{{benchmark_sample}}`, `{{task}}`.
- Strategy section explaining the operator contract the candidate must satisfy:
  - Pushable with `task` + `prior_answer` push-args.
  - Multi-cycle state machine permitted (free-form per R13).
  - May push library operators (`refine`, `reflexion`, `cove`, `plan-execute`, `debate`, `answer-independently`, `evaluate`, `opine`, `plan`, `reflect`, `tackle`, `verify`).
  - Must end with `## State done` + `## Return answer: |` block.
- Single instruction (state `empty`): generate the operator content; wholesale-rewrite MEMORY with state `done` and `## Return operator_content: |` block (indented operator content).
- Append push-args at the end of the file (per aflow-lite's pattern):

  ```
  Archive of past candidates (read top-to-bottom):

  {{archive}}

  Benchmark sample (questions only, no ground truth):

  {{benchmark_sample}}

  Task (PROGRAM.md content):

  {{task}}
  ```

**Verification:** visual review against design.md §"`operators/propose-operator.md`". Confirm placeholders match `propose_push.sh`'s push-args names.

**Requirements covered:** R7 (returns `operator_content` key), R12 (contract documented in prompt), R13 (free-form structure permitted), R14 (sub-push contracts referenced).

---

## T13. End-to-end smoke test on a fresh instance

**Goal:** validate the full pipeline as a user would invoke it.

**Steps:**
1. `npm run build` (dist/ in case anything in src/ changed since last build — should be a no-op).
2. `./new-instance.sh adas1 interpreters/mas-papers/7-meta-framework/b-adas-lite`. Verify the instance directory layout matches design.md §"Per-frame instance layout (post-bootstrap)" — operators/ has 14 files, .root-operator points at operators/adas-lite.md, frames/f000-adas-lite/INSTRUCTIONS.md exists with `{{program}}` substituted.
3. Configure `instances/adas1/.env` (provider + model — likely api or claude-code with haiku for cost).
4. Run `instances/adas1/run.sh`. Watch for milestones:
   - Cycle 1: Initialize (lib script transitions to `init_scorer_pending`).
   - Cycle 2: Init-write-scorer (LLM writes `./scoped/scorer.sh`).
   - Cycles 3+: seed phase begins. Expect the first seed (`refine`) to be pushed once per item × 3 items.
5. Verify the first archive entry appears at `./scoped/archive/01-seed-refine.md` after the third item completes.
6. Continue running. If refine scores 1.0 on the 3-item sample (matching aflow5's empirical result), the run will halt early — that's correct R15 behaviour. To observe the propose phase, temporarily disable halt-on-1.0 in `lib/finalize_entry.sh` (comment out the perfect-score branch) and re-run.
7. Verify final `OUTPUT.md` contains `## Answer` with best operator label, score, summary lines, and best operator content.

**Verification gates:**
- `instances/adas1/.call-stack.json` shows depth 1 (root only) at halt.
- `OUTPUT.md` exists and contains the structure from design.md §"`finalize_run.sh`".
- `./scoped/archive/` has at least 1 entry (5 if seeds completed, more if propose phase ran).
- `./scoped/recent_scores.md` non-empty, capped at ≤20 lines.

**Requirements covered:** end-to-end validation of R1-R23 (except R20 force-pop, which is documented as deferred).

---

## T14. Write `interpreters/mas-papers/7-meta-framework/b-adas-lite/README.md`

**Goal:** human-facing notes — what ADAS-lite is, how it differs from aflow-lite, how to run it, expected runtime.

**Sections:**
- 1-paragraph summary citing ADAS (Hu et al. 2024).
- "How it differs from aflow-lite": searches over operator code, not compositions; flat archive instead of MCTS; 5 seeded base ops; max_iterations of 10 propose-iterations.
- Quickstart: `./new-instance.sh foo interpreters/mas-papers/7-meta-framework/b-adas-lite` + run.sh.
- Expected runtime ranges (cite from T13 actuals once available).
- Known limitations: R20 force-pop deferred; cross-run archive persistence not v1; halt-on-1.0 may stop early.
- Pointer to `docs/specs/2026-05-08-phase-8-adas-lite-meta-interpreter/` for the full spec.

**Verification:** review for completeness; cross-reference design.md.

**Requirements covered:** none (docs).

---

## Dependency graph

```
T1 ──> T2 ──> T3 ──> T4 ──> T5 ──> T6 ──> T7 ──> T9 ──> T13 ──> T14
              │     (T4 indep)   │       │         │
              └─> T10 ─> T12 ────┴> T11 ─┘         │
                                                   T8 (independent of T6/T7;
                                                       depends on T3 only)
```

Practical ordering: T1, T2, T3, T4, T5, T6, T7, T8, T10, T11, T12, T9 (root operator), T13 (smoke), T14 (docs).

T9 deliberately comes after the lib scripts because the operator file references each script by filename — no point committing a root operator that points at empty stubs.

## Estimated touch surface

- New files: `INSTRUCTIONS.md`, `PROGRAM.md`, `README.md`, 1 fixture, 14 operators (12 copies + 2 new), 10 lib scripts. Total: ~28 files.
- Modified files: 0 (no `src/` changes; no shell changes).
- New directories: 3 (`b-adas-lite/`, `lib/`, `workspace/`).

No build step required between tasks (no TypeScript). `npm run build` is only relevant in T13 to ensure dist/ is current before launching an instance.

## What's NOT in tasks

- No new shell-level primitives (per design.md note: R20 force-pop is deferred).
- No `src/` modifications.
- No tests in `src/test/` (the tasks rely on scratch-frame manual testing per script; the unit-test pattern in `src/test/` is for TS, not bash).
- No automation to migrate ADAS-lite results into a-aflow-lite's library — that's a manual git op per US4.
