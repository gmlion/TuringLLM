# Operator: ADAS-lite (sequential search over operator code)

A lightweight meta-framework following Hu et al. (arXiv:2408.08435) that searches over candidate **operator files** rather than over compositions of fixed operators. Each iteration: an LLM proposer reads an archive of past candidates (with scores and failure notes) and writes a new operator markdown file; the shell tests it on the 30-item GSM8K **search set** by pushing it once per item; the result is appended to the archive. The archive is pre-seeded with the 5 base operators (`refine`, `reflexion`, `cove`, `plan-execute`, `debate`) so the proposer has concrete scaffolds to imitate, mutate, and hybridise. After `max_iterations` proposer iterations the search ends and the winner is evaluated against a separate 30-item **held-out set** the proposer never saw — that holdout score is the headline metric.

Receives push-args (mode 1: standalone via root-operator bootstrap):
  - `{{program}}` — the user's PROGRAM.md content.

(ADAS-lite is invoked only standalone in v1 — never as a sub-operator. The operator file does not contain `{{task}}` or `{{prior_answer}}` placeholders since ADAS-lite is not part of any other workflow.)

Produces: `## State done` + `## Return` block with key `answer` containing the winner's held-out score (headline), search score, per-entry archive summary, and the winner's operator content.

## Architecture: bookkeeping in scripts, judgement in prose

Every state transition that is pure bookkeeping (archive append, simulation tracking, halt detection, holdout evaluation, summary emission) lives in a checked-in shell script under `../../lib/*.sh`. Each instruction below invokes one script as a single bash tool call. **Do not summarise these scripts or rewrite their behaviour inline** — the whole point of the lib/ split is that bookkeeping is deterministic and out of the prompt. Only `Init-write-scorer` and `Post-mortem-write` involve LLM judgement; everything else is mechanical.

The scripts assume CWD is the active frame directory. They read and write `./scoped/*` and rewrite `./MEMORY.md` directly.

## Scoped files

| File | Lifetime | Content |
|------|----------|---------|
| `./scoped/task.md` | run | byte-equal copy of `../../PROGRAM.md` |
| `./scoped/benchmark_items.md` | run | 30 search items the proposer can see |
| `./scoped/holdout_items.md` | run | 30 held-out items the proposer never sees |
| `./scoped/scorer.sh` | run | per-program scorer; written once by `Init-write-scorer` |
| `./scoped/max_iterations.md` | run | `10` (proposer-iteration budget; halt-on-1.0 disabled) |
| `./scoped/per_item_cycle_budget.md` | run | `50` (warn-only soft cap per item) |
| `./scoped/iter_count.md` | run | proposer-iteration counter |
| `./scoped/seed_queue.md` | run | one base-operator name per line |
| `./scoped/seed_idx.md` | run | integer pointer into seed_queue.md |
| `./scoped/phase.md` | run | `seed` or `propose` |
| `./scoped/candidate_path.md` | run | instance-root-relative path to the candidate currently under test |
| `./scoped/candidate_label.md` | run | display label for the current archive entry |
| `./scoped/archive/NN-<label>.md` | run | one archive entry per file (front-matter + failure note + operator content); winner gains `holdout_score` + `holdout_per_item` fields after evaluation |
| `./scoped/recent_scores.md` | run | last 20 `<label>: <score>` lines |
| `./scoped/winner.md` | run | label of search-winner, written at `holdout_init` |
| `./scoped/winner_path.md` | run | candidate path of search-winner |
| `./scoped/holdout_summary.md` | run | `<label>: <holdout_score> (<n>/<m>)`, written by `Holdout-absorb` |
| `./scoped/sim/current_item.md` | per-test-loop | which item (0..N-1) is being tested |
| `./scoped/sim/items_source.md` | per-test-loop | path to current items file (`benchmark_items.md` or `holdout_items.md`) |
| `./scoped/sim/items_total.md` | per-test-loop | item count, read each cycle |
| `./scoped/sim/cycles_used.md` | per-test-loop | per-item cycle counter |
| `./scoped/sim/scores.md` | per-test-loop | one `1`/`0` per scored item |
| `./scoped/sim/answers.md` | per-test-loop | one JSON line per item, `{"item":N,"answer":"..."}` |
| `./scoped/sim/note.md` | per-candidate | LLM-written failure note (only when reward < 1.0; not used in holdout) |

`../../proposed/proposed-NN.md` (instance root, NOT in scoped) holds the per-iteration generated operator file. Stored at instance root so the shell's `## Push` can resolve it; persisted across the run for inspection.

## Operator library

Hardcoded in `../../lib/common.sh`:

    BASE_LIBRARY="refine reflexion cove plan-execute debate"

The library does NOT include `self-refine` (subsumed by `refine`), `tot`/`lats` (search-over-search recursion), `metagpt`/`chatdev` (end-to-end pipelines), or `MoA` (deferred — blocked on per-prompt model selection in the harness).

## Scorer contract

`./scoped/scorer.sh` is the only program-specific code in this run. It is written once by the LLM at `Init-write-scorer` based on PROGRAM.md and the benchmark items.

Contract:
- **Input:** the operator's final answer text on stdin; the expected answer (verbatim from the fixture's `answer` field) as `$1`.
- **Output:** a single line on stdout — `1` for pass, `0` for fail.
- **No other side effects.** Must terminate. Must be idempotent.

Example (GSM8K, integer answers):

```bash
#!/usr/bin/env bash
EXPECTED="$1"
ANSWER=$(cat)
ACTUAL=$(printf '%s\n' "$ANSWER" | grep -oE '[-+]?[0-9]+' | tail -n 1)
[ "$ACTUAL" = "$EXPECTED" ] && echo 1 || echo 0
```

The LLM should adapt this to whatever the program's fixture demands (string match, regex extraction, structured comparison, etc.).

## Instruction: Initialize
**Condition:** MEMORY state is "empty"
**Action:** Run `bash ../../lib/initialize.sh`. The script copies PROGRAM.md, samples 30 search items + 30 held-out items from `../../workspace/gsm8k.jsonl` (60 items required), sets constants (max_iterations=10, per_item_cycle_budget=50), seeds the queue with the 5 base operators, creates the archive directory, and transitions MEMORY to `init_scorer_pending`. Do not run any other commands or rewrite MEMORY yourself.

## Instruction: Init-write-scorer
**Condition:** MEMORY state is "init_scorer_pending"
**Action:** Read `./scoped/task.md` (the program) and `./scoped/benchmark_items.md` (30 JSON lines, each with `question` and `answer`). Decide how to compare an operator's textual output to the fixture's `answer` field. Write a small bash scorer to `./scoped/scorer.sh` honouring the contract above (stdin = answer text; `$1` = expected; stdout = `1` or `0`). For numeric benchmarks like GSM8K, "extract the last integer from stdin and compare to `$1`" is correct. Mark the scorer executable with `chmod +x`. Then wholesale-rewrite MEMORY to transition to `seeding_or_proposing`:

```
cat > ./MEMORY.md << EOF
## State
seeding_or_proposing
## Matched Instruction
Init-write-scorer
## Last Action
Wrote per-program scorer at ./scoped/scorer.sh.
## Result
Ready for first archive entry (seed phase).
EOF
```

# Sub-instructions

## Instruction: Stage-next
**Condition:** MEMORY state is "seeding_or_proposing"
**Action:** Run `bash ../../lib/seed_stage.sh`. The script picks the next seed candidate (in seed phase) or transitions to the propose phase. Sets `candidate_path.md` and `candidate_label.md` and resets `sim/`. Transitions MEMORY to `test_pending` (seed) or `propose_pending` (propose).

## Instruction: Propose-push
**Condition:** MEMORY state is "propose_pending"
**Action:** Run `bash ../../lib/propose_push.sh`. The script serialises the archive (per-entry blocks with score, failure note, full operator content), the benchmark sample (questions only), and the task; emits `## Push operators/propose-operator.md` with push-args `output_path`, `archive`, `benchmark_sample`, `task`. The state value `propose_pending` is the returnState; on pop the shell sets state to `propose_pending_completed`, which `Propose-absorb` matches.

## Instruction: Propose-absorb
**Condition:** MEMORY state is "propose_pending_completed"
**Action:** Run `bash ../../lib/propose_absorb.sh`. The script reads `../../proposed/proposed-NN.md` (which the proposer wrote directly), validates structural requirements (`## Return`, `## Instruction:`, an entry condition for state `empty`, no unresolved placeholders other than `{{task}}`/`{{prior_answer}}`), and transitions to `test_pending` (valid) or `record_invalid` (malformed/missing).

## Instruction: Test-push
**Condition:** MEMORY state is "test_pending"
**Action:** Run `bash ../../lib/test_push.sh`. The script reads the current item, composes push-args `task` (the question) and `prior_answer: ""`, increments the per-item cycle counter (warn-only), and emits `## Push` for the candidate.

## Instruction: Test-absorb
**Condition:** MEMORY state is "test_pending_completed"
**Action:** Run `bash ../../lib/test_absorb.sh`. The script captures the spliced `## Answer`, appends it to `sim/answers.md`, advances the item counter, and (when all items in `sim/items_total.md` are done) scores via `./scoped/scorer.sh` and transitions to `post_mortem_pending` (reward < 1.0) or `finalize_entry` (reward == 1.0).

## Instruction: Post-mortem-write
**Condition:** MEMORY state is "post_mortem_pending"
**Action:** Read `./scoped/sim/answers.md` (the per-item answers as JSON lines), `./scoped/sim/scores.md` (the 0/1 scores), and the candidate file at `./scoped/candidate_path.md`'s value (resolve relative to `../../`, e.g. `../../operators/refine.md` or `../../proposed/proposed-NN.md`). Identify why the candidate failed: which item(s) were wrong, and what about the candidate's structure or prose likely caused the failure. Write a 1-3 sentence note to `./scoped/sim/note.md`:

```
cat > ./scoped/sim/note.md << 'EOF'
<one to three sentences citing per-item failures and structural issues>
EOF
```

Then wholesale-rewrite MEMORY to advance to `finalize_entry`:

```
cat > ./MEMORY.md << EOF
## State
finalize_entry
## Matched Instruction
Post-mortem-write
## Last Action
Wrote post-mortem note for the current candidate.
## Result
Ready to append archive entry.
EOF
```

## Instruction: Record-invalid
**Condition:** MEMORY state is "record_invalid"
**Action:** Run `bash ../../lib/record_invalid.sh`. The script appends a malformed-marked archive entry with score 0 (note text from `sim/note.md` written by `propose_absorb.sh`), wipes `sim/`, advances `iter_count` if in propose phase, halt-checks, and transitions to `seeding_or_proposing` (continue) or `holdout_init` (max-iter reached).

## Instruction: Finalize-entry
**Condition:** MEMORY state is "finalize_entry"
**Action:** Run `bash ../../lib/finalize_entry.sh`. The script reads `sim/scores.md` and (optionally) `sim/note.md`, appends an archive entry, appends to `recent_scores.md`, wipes `sim/`, advances `iter_count` if in propose phase. Halt check is `iter_count >= max_iterations` only — Phase-8.1 dropped the halt-on-1.0 early exit so the proposer keeps exploring even after a perfect score lands. On halt, transitions to `holdout_init`; otherwise to `seeding_or_proposing`.

## Instruction: Holdout-init
**Condition:** MEMORY state is "holdout_init"
**Action:** Run `bash ../../lib/holdout_init.sh`. The script scans the archive, picks the search-winner (max search score, tie-break lowest NN), derives the candidate path from the label (`seed-X` → `operators/X.md`; `proposed-NN` → `proposed/proposed-NN.md`), writes `./scoped/winner.md` and `./scoped/winner_path.md`, stages the winner as the active candidate, resets `sim/` with `items_source.md=./scoped/holdout_items.md`, and transitions MEMORY to `holdout_pending`.

## Instruction: Holdout-push
**Condition:** MEMORY state is "holdout_pending"
**Action:** Run `bash ../../lib/holdout_push.sh`. Structural twin of `Test-push`; pushes the winner for the current holdout item with the same `task` + `prior_answer: ""` push-args contract.

## Instruction: Holdout-absorb
**Condition:** MEMORY state is "holdout_pending_completed"
**Action:** Run `bash ../../lib/holdout_absorb.sh`. The script captures the spliced `## Answer`, appends to `sim/answers.md`, advances. When all holdout items are done, scores via `./scoped/scorer.sh`, splices `holdout_score` and `holdout_per_item` into the winner's archive entry's front-matter (via `splice_holdout_fields` in `common.sh`), writes `./scoped/holdout_summary.md`, and transitions MEMORY to `finalizing`. No post-mortem on holdout.

## Instruction: Finalize-run
**Condition:** MEMORY state is "finalizing"
**Action:** Run `bash ../../lib/finalize_run.sh`. The script scans the archive, picks the best entry (max search score, tie-break by lowest NN), reads `./scoped/holdout_summary.md` for the headline holdout score, builds a per-entry summary that annotates the winner row with `[HOLDOUT X]`, and wholesale-rewrites MEMORY with `## State done` + `## Return answer` containing both headline lines, the archive summary, and the winner's operator content. The shell intercepts `done` on the root frame, splices `## Return` to `OUTPUT.md`, and halts.
