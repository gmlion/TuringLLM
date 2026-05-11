# Tasks: phase-8-1-adas-lite-measurement

15 ordered tasks. Implementation order is fixture-first (T1–T2) so the rest can run real verification, then dynamic-items refactor (T3–T6) which is needed by both the search and holdout loops, then the new holdout phase (T7–T9), then output and harness (T10–T13), then smoke and docs (T14–T15).

All work is local to `interpreters/mas-papers/7-meta-framework/b-adas-lite/`, `workspace/`, and a new `scripts/` directory. Zero `src/` changes. Per the requirements, this is a **breaking change** for Phase 8 instances — they cannot resume.

---

## T1. Move curated 20-item fixture aside

**Goal:** preserve the Phase-8 curated fixture for archival before replacing.

**Steps:**
1. `git mv interpreters/mas-papers/7-meta-framework/b-adas-lite/workspace/gsm8k.jsonl interpreters/mas-papers/7-meta-framework/b-adas-lite/workspace/gsm8k-curated-20.jsonl` — keeps the 20-item curated set under git history, accessible for inspection.
2. `git mv` is intentional (not `cp`) so the 20-item file isn't ALSO present at the canonical path during T2.

**Verification:** `ls interpreters/mas-papers/7-meta-framework/b-adas-lite/workspace/` shows `gsm8k-curated-20.jsonl` only; no `gsm8k.jsonl`.

**Requirements covered:** R1 (preparing for replacement).

---

## T2. Write `scripts/fetch-gsm8k.sh` and produce the 60-item slice

**Goal:** committed, reproducible 60-item slice of the official GSM8K test set.

**Steps:**
1. `mkdir -p scripts/`.
2. Write `scripts/fetch-gsm8k.sh` per design.md §"`scripts/fetch-gsm8k.sh`":
   - Download `https://raw.githubusercontent.com/openai/grade-school-math/master/grade_school_math/data/test.jsonl` via `curl -fsSL`.
   - Verify the SHA-256 against a hex string committed at `scripts/fetch-gsm8k.sha256`. If the hash is missing on first run, write the actual hash to that file and warn (so the operator can commit it).
   - For each line, parse JSON, extract `question`, parse the `answer` field for `#### <integer>`, write `{"question": "...", "answer": "<integer>"}` JSONL.
   - Take items at indices 0, 21, 42, ..., 21*59 = 1239 (every 21st item; gives 60 items spread across the ~1319-item test set).
   - Write to `interpreters/mas-papers/7-meta-framework/b-adas-lite/workspace/gsm8k.jsonl`.
   - Verify line count == 60; exit 1 if not.
3. `chmod +x scripts/fetch-gsm8k.sh`.
4. Run the script. Commit the resulting `workspace/gsm8k.jsonl` (60 lines).
5. Commit `scripts/fetch-gsm8k.sha256` with the hash recorded on first run.

**Verification:**
- `wc -l interpreters/mas-papers/7-meta-framework/b-adas-lite/workspace/gsm8k.jsonl` shows `60`.
- `head -1 ... | python3 -c 'import sys,json; o=json.loads(sys.stdin.read()); assert "question" in o and "answer" in o; assert o["answer"].lstrip("-").isdigit()'` exits 0.
- Re-running `bash scripts/fetch-gsm8k.sh` produces a byte-equal `gsm8k.jsonl` (idempotent).

**Requirements covered:** R1, R2, R3.

---

## T3. Update `lib/initialize.sh` for 30/30 split

**Goal:** sample 30 search items into `benchmark_items.md` and 30 holdout items into `holdout_items.md` from the new 60-item fixture.

**Steps:**
1. Replace the 3-item slice block (lines that read `MID=$((TOTAL / 2))` and the `sed -n` 1p/MIDp/TOTALp pattern).
2. New block:
   - Verify `TOTAL >= 60` (the 60-item fixture is required); else `waiting_for_user` with explanatory pending question.
   - Take items 1–30 → `./scoped/benchmark_items.md` (the search set).
   - Take items 31–60 → `./scoped/holdout_items.md` (the held-out set).
3. Update the `## Last Action` text to mention `30 search + 30 held-out`.

**Verification:** scratch frame test — populate `../../workspace/gsm8k.jsonl` with 60 lines, run `bash lib/initialize.sh`, confirm both files have 30 lines each, are disjoint (`comm -12 benchmark_items.md holdout_items.md` is empty).

**Requirements covered:** R4.

---

## T4. Wire `seed_stage.sh` and `propose_absorb.sh` to write `sim/items_source.md` and `sim/items_total.md`

**Goal:** when a candidate is staged for testing (seed or proposed), write the items-source pointer so `test_push.sh`/`test_absorb.sh` know where to read items from.

**Steps:**
1. In `lib/seed_stage.sh`, after the `reset_sim()` call (or inline at sim init), add:
   ```bash
   echo "./scoped/benchmark_items.md" > ./scoped/sim/items_source.md
   wc -l < ./scoped/benchmark_items.md | tr -d ' ' > ./scoped/sim/items_total.md
   ```
2. In `lib/propose_absorb.sh` (the valid-candidate branch only — after sim/ is reset), add the same two lines.

**Verification:** scratch test — drive `seed_stage.sh` to stage a seed, confirm `./scoped/sim/items_source.md` reads `./scoped/benchmark_items.md` and `./scoped/sim/items_total.md` reads `30`.

**Requirements covered:** R7 (foundation).

---

## T5. Make `test_push.sh` and `test_absorb.sh` items-source-aware

**Goal:** replace the hardcoded fixture path and `NUM_ITEMS=3` with reads from sim/items_source.md and sim/items_total.md.

**Steps:**
1. In `lib/test_push.sh`:
   - Replace `ITEM_LINE=$(sed -n "$((ITEM_IDX + 1))p" ./scoped/benchmark_items.md)` with:
     ```bash
     ITEMS_SRC=$(cat ./scoped/sim/items_source.md)
     ITEM_LINE=$(sed -n "$((ITEM_IDX + 1))p" "$ITEMS_SRC")
     ```
2. In `lib/test_absorb.sh`:
   - Replace `NUM_ITEMS=3` with `NUM_ITEMS=$(cat ./scoped/sim/items_total.md)`.
   - Replace the `for i in 0 1 2; do ITEM_LINE=$(sed -n ... ./scoped/benchmark_items.md)` loop with:
     ```bash
     ITEMS_SRC=$(cat ./scoped/sim/items_source.md)
     for i in $(seq 0 $((NUM_ITEMS - 1))); do
       ITEM_LINE=$(sed -n "$((i + 1))p" "$ITEMS_SRC")
       ...
     done
     ```
   - The `## Answer` extraction from sim/answers.md uses `awk -v I="$i" 'NR==I+1'` — confirm this still works (it indexes JSON-line answer records by 1-based line number, not by item index value; should be fine).

**Verification:** scratch test — populate sim/ with 30 fake answers (one JSON line per item), run `test_absorb.sh` after the 30th absorb cycle, confirm `sim/scores.md` has 30 lines and the score-mean is computed correctly.

**Requirements covered:** R7.

---

## T6. Drop halt-on-1.0 in `finalize_entry.sh` and update `record_invalid.sh`

**Goal:** search runs strictly to budget; remove perfect-score early-halt; on max-iter, transition to `holdout_init`.

**Steps:**
1. In `lib/finalize_entry.sh`:
   - Delete the entire `if [ "$IS_PERFECT" = "1" ]; then ... exit 0; fi` block (the early-halt branch).
   - In the existing `if [ "$PHASE" = "propose" ] && [ "$ITER_NOW" -ge "$MAX" ]; then ...` block, change the `## State` from `finalizing` to `holdout_init`.
   - Update the `## Last Action` and `## Result` text accordingly.
2. In `lib/record_invalid.sh`:
   - Replace the hardcoded `"3"` items_total argument to `archive_write` with:
     ```bash
     ITEMS_TOTAL=$(cat ./scoped/sim/items_total.md 2>/dev/null || wc -l < ./scoped/benchmark_items.md | tr -d ' ')
     ```
   - Change the halt-path `## State finalizing` (in the propose-max branch) to `## State holdout_init` to match finalize_entry.

**Verification:** scratch test — set iter_count=10, max_iterations=10, drive finalize_entry, confirm state is `holdout_init` (not `finalizing`); set iter_count=5, drive finalize_entry, confirm state is `seeding_or_proposing` (search continues even on perfect score).

**Requirements covered:** R7, R8.

---

## T7. Write `lib/holdout_init.sh`

**Goal:** at `holdout_init` state, scan archive, pick the search-winner, stage as candidate, reset sim with holdout items source.

**Steps:**
1. Create `lib/holdout_init.sh`:
   ```bash
   #!/usr/bin/env bash
   set -euo pipefail
   SELF_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
   . "$SELF_DIR/common.sh"
   ```
2. Scan archive, find max-score entry (tie-break lowest NN). Use the same logic pattern as `finalize_run.sh`. Read entry NN, label, score, candidate path (need to add candidate path as front-matter? No — the operator content section IS the candidate. Read the original `candidate_path` indirectly via the label: seed-X → `operators/X.md`; proposed-NN → `proposed/proposed-NN.md`).
3. Write `./scoped/winner.md` (label) and `./scoped/winner_path.md` (instance-root candidate path derived from label).
4. Set `./scoped/candidate_path.md` and `./scoped/candidate_label.md` to winner's values (so `holdout_push.sh` reuses the existing candidate-path machinery).
5. Reset `./scoped/sim/`:
   - `current_item.md=0`
   - `cycles_used.md=0`
   - `scores.md=` empty
   - `answers.md=` empty
   - `items_source.md=./scoped/holdout_items.md`
   - `items_total.md=$(wc -l < ./scoped/holdout_items.md)`
6. Transition MEMORY to `holdout_pending` with explanatory `## Last Action`.

**Verification:** scratch test — fabricate 3 archive entries with scores 0.5, 0.8, 0.6; run holdout_init.sh; confirm winner.md=`(label of 0.8 entry)`, candidate_path.md derived correctly (e.g., `operators/cove.md` for `seed-cove`, `proposed/proposed-04.md` for `proposed-04`), sim/items_source.md=`./scoped/holdout_items.md`, state=`holdout_pending`.

**Requirements covered:** R10.

---

## T8. Write `lib/holdout_push.sh`

**Goal:** push the winner for the current holdout item. Functionally a sibling of `test_push.sh` but with explicit `holdout_pending` state and `Holdout-push` matched-instruction tag.

**Steps:**
1. Create `lib/holdout_push.sh` by copying `lib/test_push.sh` verbatim and changing:
   - `## State test_pending` → `## State holdout_pending`
   - `## Matched Instruction Test-push` → `## Matched Instruction Holdout-push`
   - `## Last Action Pushing ...` text to mention "holdout item" instead of "item".
2. The items-source logic from T5 (`ITEMS_SRC=$(cat ./scoped/sim/items_source.md)`) carries over since holdout_init.sh wrote `holdout_items.md` to `items_source.md` in T7.

**Verification:** scratch test — after T7 setup, run holdout_push.sh, confirm `## Push <candidate_path>` is emitted with `task` push-arg containing the first holdout item's question, state stays `holdout_pending`.

**Requirements covered:** R11, R13.

---

## T9. Write `lib/holdout_absorb.sh` and `splice_holdout_fields` in common.sh

**Goal:** capture answer, advance, score on holdout-completion; splice holdout fields into winner's archive entry; write holdout_summary.md; transition to `finalizing`.

**Steps:**
1. Add `splice_holdout_fields()` helper to `lib/common.sh` per design.md (awk insert two lines before the closing `---` of front-matter).
2. Create `lib/holdout_absorb.sh` by:
   - Starting from a copy of `lib/test_absorb.sh`'s body.
   - Changing the per-item-loop transition state to `holdout_pending` (was `test_pending`).
   - When all items are scored (the all-done branch):
     - Compute `HOLDOUT_SCORE`, `HOLDOUT_PER_ITEM` (same as test_absorb).
     - Read `./scoped/winner.md` for label.
     - Find the winner's archive entry file (glob `./scoped/archive/*-${WINNER}.md`).
     - Call `splice_holdout_fields` with the entry file, holdout_score, holdout_per_item.
     - Write `./scoped/holdout_summary.md` with `${WINNER}: ${HOLDOUT_SCORE} (${NUM_PASS}/${NUM_TOTAL})`.
     - Transition to `finalizing` (NOT to `post_mortem_pending` — holdout doesn't need a post-mortem).

**Verification:** scratch test — fabricate a winner archive entry, drive holdout_init → 30 absorbs with synthetic answers → confirm winner's archive entry has `holdout_score: 0.X` and `holdout_per_item: 1,0,1,...` lines inserted before the closing `---`, holdout_summary.md is written, state is `finalizing`.

**Requirements covered:** R11, R12, R14.

---

## T10. Update `lib/finalize_run.sh` to surface holdout in OUTPUT

**Goal:** `## Return answer` block restructured per design.md §"Output format change".

**Steps:**
1. Read `./scoped/holdout_summary.md` (one line: `<label>: <score> (<n>/<m>)`). Parse holdout_score, holdout_passed, holdout_total, winner_label.
2. Find the search-winner's archive entry (same as before — max search score). Read `score`, `items_passed`, `items_total`. (These should match `winner.md` from T7.)
3. Restructure the `## Return answer: |` block to:
   ```
   Best agent (held-out): <label> <holdout_score> (<n>/<m>)
   Best agent (search):   <label> <search_score> (<p>/<t>)

   Archive summary (<COUNT> entries; search-set scores; held-out score on winner only):
   01 seed-refine: 0.5333 — Got items 3,7,12,18 wrong because draft missed unit conversion.
   02 seed-reflexion: 0.6000 — ...
   03 seed-cove: 0.7333 [HOLDOUT 0.6667] — No failure note.
   ...

   Best operator content:
   <indented best operator markdown>
   ```
4. Per-entry summary: when an entry's label matches the winner, append ` [HOLDOUT <holdout_score>]` to its score column.

**Verification:** scratch test — after T9 setup, run finalize_run.sh, confirm `## Return answer` block has both headline lines, archive summary annotates the winner row with `[HOLDOUT X]`, best operator content is included.

**Requirements covered:** R15, R16.

---

## T11. Update `operators/adas-lite.md` for new states

**Goal:** add three new sub-instruction blocks for `holdout_init`, `holdout_pending`, `holdout_pending_completed`. Strategy section unchanged.

**Steps:**
1. Locate the `# Sub-instructions` section.
2. Insert three new instruction blocks after the existing `Finalize-entry` instruction:
   - **Holdout-init** (state `holdout_init`): `bash ../../lib/holdout_init.sh`.
   - **Holdout-push** (state `holdout_pending`): `bash ../../lib/holdout_push.sh`.
   - **Holdout-absorb** (state `holdout_pending_completed`): `bash ../../lib/holdout_absorb.sh`.
3. Update the `## Scoped files` table to mention the new files (`winner.md`, `holdout_items.md`, `holdout_summary.md`, `sim/items_source.md`, `sim/items_total.md`).
4. Update the strategy intro paragraph to mention "search/holdout split" and "held-out evaluation".
5. Verify `# Strategy` → `# Sub-instructions` boundary is preserved (strategy section must survive `update_instructions` rewrites).

**Verification:** visual review against design.md §"Operator state machine (changes)" — every state in the table maps to exactly one matching `## Instruction:` block in the file. No state is unhandled.

**Requirements covered:** R10, R11, R12.

---

## T12. Write `scripts/adas-sweep.sh`

**Goal:** sequential N-run sweep harness.

**Steps:**
1. Create `scripts/adas-sweep.sh`:
   ```bash
   #!/usr/bin/env bash
   set -euo pipefail
   ```
2. Validate args: `<prefix>` (alphanumeric + dashes), `<N>` (integer 1..20). Print usage if wrong.
3. For `i in $(seq 1 $N)`:
   - `INSTANCE="${prefix}-${i}"`
   - If `instances/$INSTANCE/` exists: error and exit 1 (don't clobber).
   - `./new-instance.sh "$INSTANCE" interpreters/mas-papers/7-meta-framework/b-adas-lite`.
   - If a top-level `.env` exists at the repo root: `cp .env "instances/$INSTANCE/.env"`.
   - `instances/$INSTANCE/run.sh` — capture exit code; if non-zero, abort sweep with explanatory message (preserve already-completed instances).
4. After all N runs: print one line per instance with that instance's headline `## Answer` line from OUTPUT.md.
5. Print suggestion: "Run `scripts/adas-aggregate.sh <prefix>` to aggregate."

**Verification:** dry-run with `--dry-run` flag (optional) or with N=1 on the smoke-test instance. Confirm new-instance.sh is called and the orchestration logic works.

**Requirements covered:** R17, R18.

---

## T13. Write `scripts/adas-aggregate.sh`

**Goal:** read N OUTPUT.md files, compute mean ± stdev, emit markdown report.

**Steps:**
1. Create `scripts/adas-aggregate.sh`.
2. Validate args: `<prefix>`. Glob `instances/${prefix}-*/OUTPUT.md`. Exit 1 if none found.
3. For each OUTPUT.md, sorted by run index:
   - Parse `## Answer` section's first two lines:
     - `Best agent (held-out): <label> <score> (<n>/<m>)` → extract label, holdout_score.
     - `Best agent (search):   <label> <score> (<p>/<t>)` → extract search_score (label should match).
   - Compute `overfit = search_score - holdout_score`.
4. Compute aggregates via inline python3:
   - mean(holdout), stdev(holdout) — population stdev since N is small.
   - mean(search), stdev(search).
   - mean(overfit).
5. Build markdown report per design.md §"`scripts/adas-aggregate.sh`":
   - Per-run table.
   - Aggregates.
   - Winner labels histogram.
6. Write report to stdout AND to `${prefix}-aggregate.md` at the repo root.
7. Exit 0 on success; exit 1 if any OUTPUT.md is missing or unparseable (with error message naming the offender).

**Verification:** scratch test — fabricate 3 OUTPUT.md files in 3 mock instance dirs (e.g., `instances/test-1/OUTPUT.md`, etc.) with synthetic headline lines; run aggregate; confirm table is correct, mean and stdev compute correctly (cross-check against `python3 -c "import statistics; ..."`).

**Requirements covered:** R19, R20.

---

## T14. Smoke test (manual + optional 1-run live)

**Goal:** verify the whole pipeline before docs.

**Steps:**

A. **Static checks** (no LLM):
1. `bash -n` every modified and new lib script under `interpreters/mas-papers/7-meta-framework/b-adas-lite/lib/` and `scripts/`.
2. Verify `wc -l workspace/gsm8k.jsonl == 60`.
3. `./new-instance.sh adas81-mvp interpreters/mas-papers/7-meta-framework/b-adas-lite` succeeds; `instances/adas81-mvp/workspace/gsm8k.jsonl` has 60 lines.

B. **Manual frame-driven walk** (no LLM):
4. Manually create `frames/f000-adas-lite/` with a copy of operators/adas-lite.md as INSTRUCTIONS.md and `## State empty` MEMORY.
5. Run `bash ../../lib/initialize.sh` — confirm `benchmark_items.md` (30) + `holdout_items.md` (30) + state `init_scorer_pending`.
6. Manually write a stub `scoped/scorer.sh`.
7. Run `bash ../../lib/seed_stage.sh` — confirm seed-refine staged, items_source.md=benchmark_items.md, items_total.md=30, state=test_pending.
8. Synthesise 30 fake `## Answer` blocks and drive 30 cycles of test_push → fake-pop → test_absorb. Confirm sim/scores.md has 30 lines and reward calculation succeeds.
9. Skip post-mortem (manually write a fake `sim/note.md` then transition to `finalize_entry`).
10. Run `bash ../../lib/finalize_entry.sh` 5 times (with iter_count fudged to simulate seeds + 10 propose-iter ramp). Confirm:
    - At iter_count < 10 in propose phase: state=`seeding_or_proposing`.
    - At iter_count == 10 in propose phase: state=`holdout_init`.
11. Run `bash ../../lib/holdout_init.sh` — confirm winner staged, items_source.md=holdout_items.md, items_total.md=30.
12. Drive 30 holdout cycles (push/fake-pop/absorb). Confirm winner archive entry now has `holdout_score:` and `holdout_per_item:` fields, holdout_summary.md is written, state=`finalizing`.
13. Run `bash ../../lib/finalize_run.sh`. Confirm `## Return answer` has both headline lines and the per-entry summary annotates winner with `[HOLDOUT X]`.

C. **Aggregate dry-run** (no LLM):
14. Manually create 3 mock OUTPUT.md files at `instances/mock-1/OUTPUT.md`, `instances/mock-2/OUTPUT.md`, `instances/mock-3/OUTPUT.md` with synthetic headline lines.
15. Run `bash scripts/adas-aggregate.sh mock`. Verify markdown report is correct.

D. **Live LLM smoke** (1 run, Haiku, optional pending user budget):
16. Configure `.env` for Haiku.
17. `bash scripts/adas-sweep.sh adas81-live 1`. Expected runtime: 30–60 minutes.
18. Inspect `instances/adas81-live-1/OUTPUT.md`. Sanity-check headline numbers are in the [0, 1] range, archive has 15 entries, winner has both search and holdout fields.
19. Run `bash scripts/adas-aggregate.sh adas81-live`. Confirm single-run aggregate (mean=value, stdev=0).

**Verification gates:**
- All static + manual + aggregate dry-run steps pass.
- Live LLM smoke is optional (user-budget-gated) but recommended before T15.

**Requirements covered:** end-to-end validation of R1-R23.

---

## T15. Update README and PROGRAM

**Goal:** docs reflect the measurement protocol.

**Steps:**
1. Rewrite `interpreters/mas-papers/7-meta-framework/b-adas-lite/README.md`:
   - Replace the "Demo: GSM8K" section with "Measurement: GSM8K".
   - Add a "Search/holdout protocol" section explaining the 30/30 split, held-out eval, multi-run sweep.
   - Replace "Run it" with two flows: single-run (`new-instance.sh + run.sh`) and sweep (`scripts/adas-sweep.sh + scripts/adas-aggregate.sh`).
   - Update the state-machine table to include `holdout_init`, `holdout_pending`, `holdout_pending_completed`.
   - Note "Phase 8 demo path is gone; old instances cannot resume."
2. Rewrite `interpreters/mas-papers/7-meta-framework/b-adas-lite/PROGRAM.md`:
   - Update the description to mention "30 search items + 30 held-out items" and the held-out evaluation protocol.
3. Cross-link to `docs/specs/2026-05-09-phase-8-1-adas-lite-measurement/`.

**Verification:** review for completeness; cross-check with design.md and tasks.md.

**Requirements covered:** R23 (breaking-change documentation), docs.

---

## Dependency graph

```
T1 ──> T2 ─┐
           ├─> T3 ──> T4 ──> T5 ──> T6 ──> T7 ──> T8 ──> T9 ──> T10 ──> T11 ──> T14 ──> T15
           │                                                     │
           └────────────────────────────────────────────────────T12 ──> T13 ──┘
```

T12 (sweep) and T13 (aggregate) are independent of T7–T11 (holdout phase) but should land before T14 (smoke) so the sweep dry-run can validate.

## Estimated touch surface

- New files: `scripts/fetch-gsm8k.sh`, `scripts/fetch-gsm8k.sha256`, `scripts/adas-sweep.sh`, `scripts/adas-aggregate.sh`, `lib/holdout_init.sh`, `lib/holdout_push.sh`, `lib/holdout_absorb.sh`. **Total: 7 new files.**
- Modified files: `lib/initialize.sh`, `lib/seed_stage.sh`, `lib/propose_absorb.sh`, `lib/test_push.sh`, `lib/test_absorb.sh`, `lib/finalize_entry.sh`, `lib/record_invalid.sh`, `lib/finalize_run.sh`, `lib/common.sh`, `operators/adas-lite.md`, `README.md`, `PROGRAM.md`. **Total: 12 modified files.**
- Renamed: `workspace/gsm8k.jsonl` → `workspace/gsm8k-curated-20.jsonl`.
- New `workspace/gsm8k.jsonl` (60 items, generated by T2).
- 0 changes to `src/`, `dist/`, or `new-instance.sh`.

## What's NOT in tasks

- No new shell-level primitives (force-pop is still out of scope).
- No `src/` modifications.
- No additions to `src/test/` (Phase 8.1 lib scripts are tested via scratch-frame runs in T14, matching Phase 8's pattern).
- No automated GSM8K test set re-fetch on every build — the slice is committed.
- No multi-benchmark generalisation; the scorer.sh contract and items-source files are still GSM8K-shaped.
