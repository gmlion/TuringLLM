# Design: phase-8-1-adas-lite-measurement

## Overview

Phase 8.1 turns `b-adas-lite` from a 3-item smoke test into a measurement tool by:

1. Replacing the 20-item curated fixture with a deterministic 60-item slice of the official GSM8K test set.
2. Adding a search/holdout split (30 search items + 30 holdout) at initialize time.
3. Removing halt-on-1.0 — the search runs strictly to `iter_count >= max_iterations`.
4. Adding a held-out evaluation phase that runs the search-winner over the 30 holdout items after the search ends.
5. Surfacing the holdout score as the headline metric in `OUTPUT.md`.
6. Adding a sweep harness (3 runs by default) and an aggregation script that produces mean ± stdev.

All changes are local to `interpreters/mas-papers/7-meta-framework/b-adas-lite/`, `workspace/`, and a new `scripts/` directory at the repo root. No `src/` changes.

## File and directory layout (changes from Phase 8)

### `workspace/`

```
workspace/
├── gsm8k.jsonl              # REPLACED — 60 items from official GSM8K test set
└── gsm8k-curated-20.jsonl   # MOVED here from gsm8k.jsonl (Phase 8 fixture, archival)
```

`gsm8k.jsonl` now contains 60 items, each `{"question": "...", "answer": "<integer>"}` — same shape so the existing scorer needs no changes. The curated 20-item set is preserved alongside for archival.

### `scripts/`

New top-level directory at the repo root (does not exist today):

```
scripts/
├── fetch-gsm8k.sh           # one-time fetch + normalize + 60-item slice
├── adas-sweep.sh            # run the search N times sequentially
└── adas-aggregate.sh        # parse N OUTPUT.md files; emit mean ± stdev
```

### `interpreters/mas-papers/7-meta-framework/b-adas-lite/`

```
b-adas-lite/
├── INSTRUCTIONS.md          # unchanged
├── PROGRAM.md               # MODIFIED — describes 30/30 split and held-out protocol
├── README.md                # MODIFIED — measurement protocol replaces demo
├── lib/
│   ├── common.sh            # MODIFIED — add holdout_score field to archive_write
│   ├── initialize.sh        # MODIFIED — sample 30 search + 30 holdout
│   ├── seed_stage.sh        # unchanged
│   ├── propose_push.sh      # unchanged
│   ├── propose_absorb.sh    # unchanged
│   ├── test_push.sh         # MODIFIED — dynamic items count
│   ├── test_absorb.sh       # MODIFIED — dynamic items count; drop halt-on-1.0 transition
│   ├── record_invalid.sh    # MODIFIED — dynamic items_total
│   ├── finalize_entry.sh    # MODIFIED — drop perfect-score halt; on max_iter → holdout_init
│   ├── holdout_init.sh      # NEW — stage winner; reset sim with holdout config
│   ├── holdout_push.sh      # NEW — push winner for current holdout item
│   ├── holdout_absorb.sh    # NEW — capture answer; advance; score on completion
│   └── finalize_run.sh      # MODIFIED — surface holdout score in OUTPUT
├── operators/
│   ├── adas-lite.md         # MODIFIED — new states (holdout_init, holdout_pending, holdout_pending_completed)
│   └── (other operators unchanged)
└── workspace/
    └── (deleted; instances copy from repo-root workspace/ via new-instance.sh)
```

## Per-frame scoped layout (added/changed)

| File | Lifetime | Status | Content |
|------|----------|--------|---------|
| `./scoped/benchmark_items.md` | run | unchanged shape | now 30 items (was 3) |
| `./scoped/holdout_items.md` | run | **NEW** | 30 items the proposer never sees |
| `./scoped/winner.md` | run | **NEW** | label of the search-winner archive entry, written at `holdout_init` |
| `./scoped/winner_path.md` | run | **NEW** | candidate path of the winner (from its archive entry) |
| `./scoped/holdout_summary.md` | run | **NEW** | `<winner_label>: <holdout_score> (<passed>/<total>)` |
| `./scoped/sim/items_source.md` | per-test-loop | **NEW** | path to current items file (`benchmark_items.md` or `holdout_items.md`) — read by `test_push.sh`/`test_absorb.sh` and `holdout_push.sh`/`holdout_absorb.sh` |
| `./scoped/sim/items_total.md` | per-test-loop | **NEW** | item count, written at sim init, read each cycle |

The `sim/items_source.md` and `sim/items_total.md` parametrise the test loop so the same per-cycle code can drive search and holdout phases. `seed_stage.sh` and `propose_absorb.sh` populate them from `benchmark_items.md`; `holdout_init.sh` populates them from `holdout_items.md`.

## Archive entry format (added field)

The Phase-8 archive entry front-matter gains an optional `holdout_score` field, present only on the winner:

```
---
entry: 03
label: seed-cove
phase: seed
score: 0.7333
items_passed: 22
items_total: 30
per_item_scores: 1,1,0,1,1,...,1
malformed: false
holdout_score: 0.6667        ← NEW; absent on non-winners
holdout_per_item: 1,1,0,...   ← NEW; absent on non-winners
---
```

Surgically appended to the existing entry file by `finalize_run.sh` after holdout evaluation completes (so the entry's primary content and front-matter stay write-once during the search; only the holdout fields are appended later).

## Lib script changes

### `scripts/fetch-gsm8k.sh` (new, repo root)

```bash
#!/usr/bin/env bash
# Download the official GSM8K test split from grade-school-math, normalize the
# answer field (extract integer after ####), and emit a deterministic 60-item
# slice to workspace/gsm8k.jsonl.
#
# Source: https://github.com/openai/grade-school-math/blob/master/grade_school_math/data/test.jsonl
# Hash committed to scripts/fetch-gsm8k.sh.sha256 for reproducibility.
```

Logic:
1. `curl -fsSL` the GSM8K `test.jsonl` from the openai/grade-school-math repo.
2. Verify the SHA-256 against a committed reference (`scripts/fetch-gsm8k.sha256`).
3. For each line, parse JSON, extract `question`, parse `answer` field for the `#### N` suffix, write `{"question": "...", "answer": "N"}` JSONL.
4. Take a deterministic 60-item slice — strategy: every K-th item where K is chosen so that 60 items are evenly spaced across the ~1319-item test set (i.e., `K = floor(1319/60) = 21`, take items at indices 0, 21, 42, ..., 60×21=1260). This gives spread across the test set without favoring any particular section.
5. Write to `workspace/gsm8k.jsonl`.
6. Verify line count == 60 before exit.
7. The script is idempotent: re-running produces a byte-equal output.

The current 20-item curated fixture moves to `workspace/gsm8k-curated-20.jsonl` (manual `git mv` step before running the fetch script).

### `lib/initialize.sh` (modified)

Change the fixture sampling block. Replace the 3-item slice with:

- Read `../../workspace/gsm8k.jsonl`. Verify ≥ 60 items (else `waiting_for_user`).
- Write items 1–30 to `./scoped/benchmark_items.md` (search set the proposer sees).
- Write items 31–60 to `./scoped/holdout_items.md` (held-out set).
- Add a `## Last Action` line confirming the split.

Existing constants (`max_iterations=10`, `per_item_cycle_budget=50`, `seed_queue`, `iter_count=0`) are unchanged. `phase=seed` and `seed_idx=0` are unchanged.

### `lib/seed_stage.sh` (modified, small)

When staging a candidate, also write the items-source pair so the test loop knows where to read items from:

```
echo "./scoped/benchmark_items.md" > ./scoped/sim/items_source.md
wc -l < ./scoped/benchmark_items.md | tr -d ' ' > ./scoped/sim/items_total.md
```

Logic is otherwise identical.

### `lib/propose_absorb.sh` (modified, small)

Same change as `seed_stage.sh`: when valid candidate is staged for testing, write `items_source.md` and `items_total.md` pointing at the search set.

### `lib/test_push.sh` (modified)

Replace the hardcoded items file path and per-item indexing:

```bash
ITEMS_SRC=$(cat ./scoped/sim/items_source.md)
ITEM_LINE=$(sed -n "$((ITEM_IDX + 1))p" "$ITEMS_SRC")
```

Other logic (push-args, cycle counter, MEMORY rewrite) unchanged.

### `lib/test_absorb.sh` (modified)

Two changes:

1. Replace `NUM_ITEMS=3` with `NUM_ITEMS=$(cat ./scoped/sim/items_total.md)`.
2. Read items from the dynamic source: `ITEMS_SRC=$(cat ./scoped/sim/items_source.md); for i in $(seq 0 $((NUM_ITEMS - 1))); do ITEM_LINE=$(sed -n "$((i + 1))p" "$ITEMS_SRC"); ...`.
3. Drop the perfect-score early-finalize branch — always transition to `post_mortem_pending` when reward < 1.0, and to `finalize_entry` when reward == 1.0 (the post-mortem skip is fine to keep — it saves a cycle when nothing went wrong; the change is in `finalize_entry.sh`, not here).

### `lib/record_invalid.sh` (modified)

Replace the hardcoded `"3"` items_total argument to `archive_write` with a read from `./scoped/sim/items_total.md` (or, if sim/ has been wiped, default to `$(wc -l < ./scoped/benchmark_items.md)`).

### `lib/finalize_entry.sh` (modified)

Drop the perfect-score halt branch. Halt-check becomes:

```bash
if [ "$PHASE" = "propose" ] && [ "$ITER_NOW" -ge "$MAX" ]; then
  # transition to holdout_init (was: finalizing in Phase 8)
  cat > ./MEMORY.md << EOF
## State
holdout_init
## Matched Instruction
Finalize-entry
## Last Action
Appended archive entry ${NN}-${LABEL}; reached max_iterations (${MAX}).
## Result
Search complete; staging held-out evaluation.
EOF
  exit 0
fi
# else continue search
```

The perfect-score early-halt is removed entirely. The search runs to budget regardless.

### `lib/holdout_init.sh` (new)

Pick winner, stage candidate, reset sim with holdout source.

```bash
#!/usr/bin/env bash
# Holdout-init: scan archive, pick best entry (max score, tie-break lowest NN),
# write winner.md and winner_path.md, reset sim/ with holdout items source,
# transition to holdout_pending.
```

Logic:
1. List `./scoped/archive/*.md`, parse front-matter, find max-score entry (tie-break lowest NN).
2. Write `winner.md` (label) and `winner_path.md` (candidate path from entry; either `operators/<seed>.md` or `proposed/proposed-NN.md`).
3. Set `candidate_path.md` and `candidate_label.md` to the winner's values (so `holdout_push.sh` can reuse the existing candidate-path machinery).
4. Reset `sim/` with: `current_item.md=0`, `cycles_used.md=0`, `scores.md=` empty, `answers.md=` empty, `items_source.md=./scoped/holdout_items.md`, `items_total.md=$(wc -l < ./scoped/holdout_items.md)`.
5. Transition MEMORY to `holdout_pending`.

### `lib/holdout_push.sh` (new)

Push the winner for the current holdout item. Functionally identical to `test_push.sh` but writes a different `## Last Action` and a different ## Push (well, same path — the candidate is the same; the only difference is the items source, which is already configured in sim/items_source.md). Could simply alias to test_push.sh — but for clarity and explicit transitions, keep it as a thin separate file that calls into the same logic.

Implementation: source `common.sh`; inline-implement push (small enough that duplication is fine), reuse `test_push.sh`'s exact logic but write `## State holdout_pending` and `## Matched Instruction Holdout-push`.

### `lib/holdout_absorb.sh` (new)

Same as `test_absorb.sh` but the post-completion transition differs:

```bash
# After all NUM_ITEMS items scored:
NUM_PASS=$(awk '$1==1{c++} END{print c+0}' ./scoped/sim/scores.md)
NUM_TOTAL=$(wc -l < ./scoped/sim/scores.md | tr -d ' ')
HOLDOUT_SCORE=$(python3 -c "print(f'{${NUM_PASS} / ${NUM_TOTAL}:.4f}')")
HOLDOUT_PER_ITEM=$(paste -sd, ./scoped/sim/scores.md)

WINNER=$(cat ./scoped/winner.md)
echo "${WINNER}: ${HOLDOUT_SCORE} (${NUM_PASS}/${NUM_TOTAL})" > ./scoped/holdout_summary.md
echo "${HOLDOUT_PER_ITEM}" > ./scoped/holdout_per_item.md

# Splice holdout fields onto the winner's archive entry. Surgical sed -i to
# insert two lines before the closing `---` of the front-matter.
WINNER_NN=$(awk -F': ' '/^entry:/{print $2; exit}' "$ARCHIVE_DIR/${WINNER_NN}-${WINNER}.md" | tr -d ' ')
ENTRY_FILE="${ARCHIVE_DIR}/$(ls $ARCHIVE_DIR | grep "^${WINNER_NN}-")"

# Insert holdout_score and holdout_per_item before the second ---
awk -v hs="$HOLDOUT_SCORE" -v hp="$HOLDOUT_PER_ITEM" '
  /^---$/ { count++; if (count == 2) { print "holdout_score: " hs; print "holdout_per_item: " hp } }
  { print }
' "$ENTRY_FILE" > "${ENTRY_FILE}.tmp" && mv "${ENTRY_FILE}.tmp" "$ENTRY_FILE"

# Wipe sim/, transition to finalizing.
rm -rf ./scoped/sim
cat > ./MEMORY.md << EOF
## State
finalizing
## Matched Instruction
Holdout-absorb
## Last Action
Held-out evaluation complete: ${WINNER} scored ${HOLDOUT_SCORE} (${NUM_PASS}/${NUM_TOTAL}).
## Result
Ready to emit OUTPUT.md.
EOF
```

When items remain (`ITEM_IDX < NUM_ITEMS`), transition back to `holdout_pending` (mirroring `test_pending`).

### `lib/finalize_run.sh` (modified)

Surface holdout score in OUTPUT.

Changes:
1. Read `./scoped/holdout_summary.md` (one line: `<label>: <score> (<n>/<m>)`) — extracts holdout_score and counts.
2. Restructure the `## Return answer` block:

```
## Return
answer: |
  Best agent (held-out): ${WINNER_LABEL} ${HOLDOUT_SCORE} (${HO_PASS}/${HO_TOTAL})
  Best agent (search):   ${WINNER_LABEL} ${SEARCH_SCORE} (${S_PASS}/${S_TOTAL})

  Archive summary (${COUNT} entries; search-set scores; held-out score on winner only):
  01 seed-refine: 0.5333 — Got items 3,7,12,18 wrong because draft missed unit conversion.
  02 seed-reflexion: 0.6000 — ...
  03 seed-cove: 0.7333 [HOLDOUT 0.6667] — No failure note.
  ...

  Best operator content:
  <operator markdown indented>
```

3. Halt logic identical to Phase 8 (transition to `done`, shell intercepts, OUTPUT.md gets `## Answer`).

### `lib/common.sh` (modified)

Optionally extend `archive_write` to take an extra optional argument for holdout_score, but cleaner is to keep `archive_write` as is and have `holdout_absorb.sh` do the surgical insert separately (already in the spec above). No change to `common.sh` needed unless we want a `splice_holdout_fields` helper — which would be cleaner. Add it:

```bash
# Splice holdout fields into a winner archive entry's front-matter.
# Args: entry_file, holdout_score, holdout_per_item.
splice_holdout_fields() {
  local f="$1" hs="$2" hp="$3"
  awk -v hs="$hs" -v hp="$hp" '
    /^---$/ { count++; if (count == 2) { print "holdout_score: " hs; print "holdout_per_item: " hp } }
    { print }
  ' "$f" > "${f}.tmp" && mv "${f}.tmp" "$f"
}
```

Used by `holdout_absorb.sh`.

## Operator state machine (changes)

`operators/adas-lite.md` gains three sub-instructions and modifies one. Strategy section unchanged.

| State | Instruction | Mechanism | Δ Phase 8 |
|---|---|---|---|
| `empty` | Initialize | `bash ../../lib/initialize.sh` | unchanged |
| `init_scorer_pending` | Init-write-scorer | LLM writes scorer.sh | unchanged |
| `seeding_or_proposing` | Stage-next | `bash ../../lib/seed_stage.sh` | unchanged (small lib internal change) |
| `propose_pending` | Propose-push | `bash ../../lib/propose_push.sh` | unchanged |
| `propose_pending_completed` | Propose-absorb | `bash ../../lib/propose_absorb.sh` | unchanged (small lib internal change) |
| `test_pending` | Test-push | `bash ../../lib/test_push.sh` | unchanged (lib param change) |
| `test_pending_completed` | Test-absorb | `bash ../../lib/test_absorb.sh` | unchanged (lib param change) |
| `post_mortem_pending` | Post-mortem-write | LLM writes `./scoped/sim/note.md` | unchanged |
| `record_invalid` | Record-invalid | `bash ../../lib/record_invalid.sh` | unchanged (lib param change) |
| `finalize_entry` | Finalize-entry | `bash ../../lib/finalize_entry.sh` | drops halt-on-1.0; transitions to `holdout_init` instead of `finalizing` on max-iter |
| **`holdout_init`** | **Holdout-init** | **`bash ../../lib/holdout_init.sh`** | **NEW** |
| **`holdout_pending`** | **Holdout-push** | **`bash ../../lib/holdout_push.sh`** | **NEW** |
| **`holdout_pending_completed`** | **Holdout-absorb** | **`bash ../../lib/holdout_absorb.sh`** | **NEW** |
| `finalizing` | Finalize-run | `bash ../../lib/finalize_run.sh` | reads holdout_summary.md; restructures OUTPUT |
| `done` | (shell intercepts) | root halt | unchanged |

The strategy section above `# Sub-instructions` is unchanged. Three new sub-instruction blocks land in the LLM-rewriteable section. The `Test-absorb` text gets a small note that on max-iter the next state is `holdout_init` (purely informational; the lib script handles the actual transition).

## Sweep harness

### `scripts/adas-sweep.sh <prefix> <N>` (new)

```bash
#!/usr/bin/env bash
# Run ADAS-lite N times sequentially with instances named <prefix>-1 ..
# <prefix>-N. Each run uses the same .env from the repo root (or per-instance
# overrides via -e flag, future).
#
# Usage: scripts/adas-sweep.sh adas-run 3
```

Logic:
1. Validate args: prefix is a valid filesystem name; N is integer 1..20.
2. For `i in $(seq 1 $N)`:
   a. Bail if `instances/<prefix>-$i/` already exists (don't clobber).
   b. `./new-instance.sh "<prefix>-$i" interpreters/mas-papers/7-meta-framework/b-adas-lite`.
   c. Optionally copy a top-level `.env` template into `instances/<prefix>-$i/.env`.
   d. `instances/<prefix>-$i/run.sh` (sequential; bash runs to completion before next).
   e. Capture exit code; abort sweep if any run fails.
3. After all N runs complete, print summary: list each instance's `OUTPUT.md` headline line.
4. Suggest the user run `scripts/adas-aggregate.sh <prefix>` next.

### `scripts/adas-aggregate.sh <prefix>` (new)

```bash
#!/usr/bin/env bash
# Read every instances/<prefix>-*/OUTPUT.md, parse holdout and search scores
# of the winner, compute mean/stdev, write report.
#
# Usage: scripts/adas-aggregate.sh adas-run
```

Logic:
1. Glob `instances/<prefix>-*/OUTPUT.md`. Sort by run index.
2. For each: parse the headline lines (`Best agent (held-out): <label> <score> ...` and `Best agent (search): ...`). Extract `<label>` and `<score>` floats.
3. Compute mean and stdev (population stdev; N is small) over holdout scores and over search scores using python3 inline.
4. Compute per-run overfit indicator: `search_score - holdout_score`.
5. Write report to stdout AND to `<prefix>-aggregate.md` at the repo root:

```
# ADAS sweep aggregate: <prefix> (N=3)

## Per-run results
| Run | Winner | Search | Holdout | Overfit |
|-----|--------|--------|---------|---------|
| adas-run-1 | seed-cove | 0.7333 | 0.6667 | +0.0666 |
| adas-run-2 | proposed-04 | 0.8000 | 0.7333 | +0.0667 |
| adas-run-3 | seed-cove | 0.7000 | 0.7000 | +0.0000 |

## Aggregates (N=3)
- Holdout: mean 0.7000, stdev 0.0271
- Search:  mean 0.7444, stdev 0.0419
- Mean overfit (search - holdout): +0.0444

## Winners
- seed-cove × 2 runs
- proposed-04 × 1 run
```

6. Exit 0 if all OUTPUT.md files parsed successfully; exit 1 (with explanatory message) if any run is missing or unparseable.

## Output format change

`OUTPUT.md` (written by Phase-7 root-pop) gets one `## Answer` section. The contents change:

**Phase 8:**
```
Best operator: seed-cove (mean reward 1.0000 over 3 GSM8K items)

Archive summary (5 entries):
01 seed-refine: 1.0000 — perfect (would have halted)
...
```

**Phase 8.1:**
```
Best agent (held-out): seed-cove 0.6667 (20/30)
Best agent (search):   seed-cove 0.7333 (22/30)

Archive summary (15 entries; search-set scores; held-out score on winner only):
01 seed-refine: 0.5333 — Got items 3,7,12,18 wrong because draft missed unit conversion.
02 seed-reflexion: 0.6000 — Got items 4,8,15,22 wrong because evaluator returned pass too early.
03 seed-cove: 0.7333 [HOLDOUT 0.6667] — No failure note.
...

Best operator content:
<operator markdown>
```

The headline IS the held-out number. Search number is shown adjacent so search-vs-holdout drift is visible at a glance.

## Phase 8 alignment

- **Push/pop semantics:** unchanged. `holdout_push.sh`/`holdout_absorb.sh` are byte-for-byte structural twins of `test_push.sh`/`test_absorb.sh`; the only difference is the items source they parametrise on and the next-state transitions.
- **Per-frame directories:** unchanged. The holdout phase runs in the same root frame as the search phase; pushed candidates land in the same `frames/fNNN-<slug>/` structure.
- **`## Return` splicing:** unchanged. The proposer's file-based handoff convention (write to `proposed/proposed-NN.md`, return only `status: written`) is preserved.
- **No `src/` changes:** confirmed. R22 of requirements.

## Open questions resolved during design

1. **Items-source parametrisation.** Two options were evaluated: (a) flag-based branching inside `test_push.sh`/`test_absorb.sh` to handle both search and holdout phases, (b) separate `holdout_push.sh`/`holdout_absorb.sh` scripts that share params via `sim/items_source.md`. Chose (b): explicit transitions in the state machine, no risk of breaking the search code path, small duplication is fine.

2. **Where to write holdout fields.** Surgical insert into the winner's existing archive entry file (insert before the closing `---` of the front-matter). Rejected alternative: separate `archive/winner-holdout.md` file. Rationale: a single archive entry as the source of truth is simpler for downstream tools (aggregate.sh).

3. **Sweep harness — scripts/ vs. interpreter-local.** Chose `scripts/` at the repo root. Sweep is cross-instance (creates and runs N instances); it's not interpreter-local. The aggregate script also reads cross-instance state.

4. **GSM8K slice strategy.** Even-spacing every 21st item across the 1319-item test set, not first-60. Rationale: avoids any clustering bias if the test set has internal ordering.

## Open questions remaining

- **Per-instance LLM seed for stochasticity.** The 3 sweep runs differ only in LLM sampling noise (no explicit seeds). Should `adas-sweep.sh` set distinct `TURING_RUN_SEED` env vars that get logged into instance `.env`? If yes, providers need to forward seeds — out of scope for v1, but flag for future.
- **Aggregate report format.** Markdown table is friendly to humans; consider also a JSON sidecar for downstream tooling. v1: markdown only. JSON is a small future addition.
- **Holdout sample stratification.** Even-spacing of the underlying GSM8K test set into the 60-item slice should distribute difficulty reasonably. The 30/30 search/holdout split (search = first 30 of slice; holdout = last 30 of slice) preserves that distribution. Open question: re-shuffle to interleave (search = even indices, holdout = odd indices)? Tentative: keep first-30/last-30 for v1; revisit if results show systematic drift.

## Smoke-test plan

After implementation, before Phase 4 close:

1. `bash scripts/fetch-gsm8k.sh` — verify `workspace/gsm8k.jsonl` has exactly 60 lines, hash matches reference.
2. `npm run build` (no-op; no `src/` changes).
3. `./new-instance.sh adas-mvp interpreters/mas-papers/7-meta-framework/b-adas-lite`. Verify `workspace/gsm8k.jsonl` is the 60-item file.
4. Manually bootstrap (without running LLM): `bash ../../lib/initialize.sh` from `frames/f000-adas-lite/`. Verify `benchmark_items.md` has 30 lines, `holdout_items.md` has 30 lines, sets are disjoint.
5. Manually drive a partial seed phase: run `seed_stage.sh` then synthesise 30 fake answers (e.g., all "0") to exercise `test_absorb.sh`'s dynamic-NUM_ITEMS path. Verify scoring writes 30 entries to `sim/scores.md`.
6. Manually drive `finalize_entry.sh` after fake scoring; verify state transitions to `seeding_or_proposing` (not `finalizing`) when iter_count < max, and to `holdout_init` only on max-iter.
7. Manually drive `holdout_init.sh` → `holdout_push.sh` → fake answer → `holdout_absorb.sh` × 30 iterations. Verify the winner's archive entry gains `holdout_score` and `holdout_per_item` fields, `holdout_summary.md` is written.
8. Manually drive `finalize_run.sh`. Verify `OUTPUT.md` (after root-pop) contains the headline `Best agent (held-out)` line, the search line, and the per-entry summary with `[HOLDOUT X]` annotation only on the winner row.
9. Live LLM smoke (1 run, Haiku): `instances/adas-mvp/run.sh`. Expected runtime ~20–60 minutes. Inspect OUTPUT.md.
10. Sweep + aggregate dry-run with 3 instances (mocking out the LLM with a stub provider, if available; else live with budget warning).
