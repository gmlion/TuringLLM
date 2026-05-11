# ADAS-lite (measurement edition)

A sequential-iteration meta-framework that searches over **operator code**, after Hu et al. 2024 (*Automated Design of Agentic Systems*, arXiv:2408.08435). Ports the ADAS paper's evaluation protocol — train/test split, halt-on-budget (not halt-on-luck), held-out reporting, multi-run aggregation — onto the AFlow-lite push/pop substrate.

## What it does

Every iteration: an LLM proposer reads an archive of past candidates (full operator content + scores + failure notes) and writes a new operator markdown file; the shell tests it on the **30-item search set** by pushing it once per item; the result is appended to the archive. The archive is pre-seeded with the 5 base operators (`refine`, `reflexion`, `cove`, `plan-execute`, `debate`).

After `max_iterations` proposer iterations (default 10) the search ends. The single archive entry with the highest search score is then evaluated against the **30-item held-out set** that the proposer never saw. The held-out score is the headline number in `OUTPUT.md`; the search score is shown adjacent so search-vs-holdout drift is visible.

## Search/holdout protocol

The discriminating idea borrowed from the ADAS paper: the proposer sees scores from a search set, but the reported number is from a held-out set. This is what tells you whether the discovered agent generalises or just memorised the specific items it was scored on.

| Setting | This interpreter |
|---|---|
| Fixture | 60 deterministic items from GSM8K test set |
| Search set | 30 items |
| Held-out set | 30 items, disjoint from search |
| Halt | max-iter only (no early halt) |
| Reporting | held-out score (headline) + search score |
| Statistical resolution | {0, 1/30, ..., 1.0} |

## Fixture

`workspace/gsm8k.jsonl` is a 60-item slice of the official GSM8K test set (Cobbe et al. 2021, arXiv:2110.14168). The slice takes every 21st item across the 1319-item test split (indices 0, 21, 42, ..., 1239) for spread without clustering bias.

To regenerate:

```bash
bash scripts/fetch-gsm8k.sh    # downloads upstream, normalises, writes 60 items
```

The script verifies the upstream SHA-256 against `scripts/fetch-gsm8k.sha256` (committed) so re-runs produce a byte-equal fixture as long as upstream is unchanged. An earlier curated 20-item set is preserved at `workspace/gsm8k-curated-20.jsonl` for reference.

## State machine

| State | Action | Next |
|-------|--------|------|
| `empty` | `Initialize` (lib): copy PROGRAM, sample 30 search + 30 holdout, set constants | `init_scorer_pending` |
| `init_scorer_pending` | `Init-write-scorer` (LLM): write `./scoped/scorer.sh` per the contract | `seeding_or_proposing` |
| `seeding_or_proposing` | `Stage-next` (lib): pick next seed (seed phase) or transition to propose phase | `test_pending` or `propose_pending` |
| `propose_pending` | `Propose-push` (lib): emit `## Push operators/propose-operator.md` with full archive, search-set sample, task | `propose_pending_completed` |
| `propose_pending_completed` | `Propose-absorb` (lib): validate `proposed/proposed-NN.md`; stage as candidate | `test_pending` or `record_invalid` |
| `test_pending` | `Test-push` (lib): push the candidate for the current item | `test_pending_completed` |
| `test_pending_completed` | `Test-absorb` (lib): capture `## Answer`; advance item; on completion, score via `scorer.sh` | `test_pending`, `post_mortem_pending`, or `finalize_entry` |
| `post_mortem_pending` | `Post-mortem-write` (LLM): write 1-3 sentence failure note | `finalize_entry` |
| `record_invalid` | `Record-invalid` (lib): append archive entry with score 0 + structural-issue note | `seeding_or_proposing` or `holdout_init` |
| `finalize_entry` | `Finalize-entry` (lib): append archive entry; advance iter_count; halt-check (max-iter only) | `seeding_or_proposing` or `holdout_init` |
| `holdout_init` | `Holdout-init` (lib): pick search-winner; stage as candidate; reset sim with holdout source | `holdout_pending` |
| `holdout_pending` | `Holdout-push` (lib): push winner for current holdout item | `holdout_pending_completed` |
| `holdout_pending_completed` | `Holdout-absorb` (lib): capture answer; advance; on completion, splice holdout fields into winner archive entry | `holdout_pending` or `finalizing` |
| `finalizing` | `Finalize-run` (lib): build OUTPUT with both headline lines + per-entry summary | `done` |

## Run it (single instance)

```bash
bash scripts/fetch-gsm8k.sh    # one-time, if workspace/gsm8k.jsonl is missing
npm run build                  # one-time, after any src/ changes
./new-instance.sh interpreters/mas-papers/7-meta-framework/b-adas-lite adas1
# Configure instances/adas1/.env (provider, model, keys)
instances/adas1/run.sh
```

After halt, `instances/adas1/OUTPUT.md` contains:

```
## Answer

Best agent (held-out): seed-cove 0.6667 (20/30)
Best agent (search):   seed-cove 0.7333 (22/30)

Archive summary (15 entries; search-set scores; held-out score on winner only):
  01 seed-refine: 0.5333 — Got items 3,7,12,18 wrong because draft missed unit conversion.
  02 seed-reflexion: 0.6000 — Got items 4,8,15,22 wrong because evaluator returned pass too early.
  03 seed-cove: 0.7333 [HOLDOUT 0.6667] — No failure note.
  ...

  Best operator content:
  <best operator markdown>
```

The full archive is at `instances/adas1/frames/f000-adas-lite/scoped/archive/` (one file per entry). Generated candidate operators are at `instances/adas1/proposed/proposed-NN.md`.

## Run it (multi-run sweep)

```bash
bash scripts/adas-sweep.sh adas-run 3       # creates instances/adas-run-{1,2,3}, runs each
bash scripts/adas-aggregate.sh adas-run     # parses each OUTPUT.md, emits aggregate report
```

The sweep:
- pre-flight checks that no `instances/adas-run-*/` already exist (refuses to clobber);
- creates each instance via `new-instance.sh`;
- copies the repo-root `.env` (if present) into each instance for shared provider/model config;
- runs each instance to completion sequentially; aborts on first failure (preserving completed instances).

The aggregate script:
- glob-reads `instances/adas-run-*/OUTPUT.md`, sorted by run index;
- parses headline holdout and search scores;
- computes mean ± stdev (population stdev since N is small);
- writes `adas-run-aggregate.md` at the repo root.

Sample aggregate report:

```
# ADAS sweep aggregate: adas-run (N=3)

## Per-run results

| Run | Winner | Search | Holdout | Overfit |
|-----|--------|--------|---------|---------|
| adas-run-1 | seed-cove   | 0.7333 | 0.6667 | +0.0666 |
| adas-run-2 | proposed-04 | 0.8000 | 0.7333 | +0.0667 |
| adas-run-3 | seed-cove   | 0.7000 | 0.7000 | +0.0000 |

## Aggregates (N=3)

- Holdout: mean 0.7000, stdev 0.0271
- Search:  mean 0.7444, stdev 0.0419
- Mean overfit (search - holdout): +0.0444

## Winners
- seed-cove × 2 runs
- proposed-04 × 1 run
```

## Cost realism

Per single run with 30 search items + 30 held-out + 15 candidates × ~15 cycles per item ≈ 8–10K LLM calls. Multiplied by a 3-run sweep ≈ 25–30K calls. With Haiku that's a few dollars; with Sonnet a few tens of dollars; with Opus hundreds. Wall-clock per run: 4–12 hours depending on rate limits and how many sub-pushes the discovered operators do.

If you want to dial cost down for plumbing verification (not measurement), edit `lib/initialize.sh` to take smaller slices, or set `max_iterations` to 1 in `scoped/max_iterations.md` after init.

## Notable design choices

- **File-based hand-off for the proposer.** The proposer writes the new operator file directly to `proposed/proposed-NN.md` (path agreed via the `output_path` push-arg) and returns only `status: written` via `## Return`. Round-tripping operator content through MEMORY's section grammar would clash with `## Instruction:` and `## Return` markdown headers inside the operator body.
- **Items source is parametric.** `./scoped/sim/items_source.md` and `./scoped/sim/items_total.md` decouple the test loop from a hardcoded fixture path. Search-phase test loops point at `benchmark_items.md`; the holdout phase points at `holdout_items.md`. One body of test-loop logic, two phases.
- **Runs strictly to budget.** No "halt-on-first-reward-1.0" early exit; the proposer is expected to produce a diverse archive, and halting early on a lucky seed would defeat the point.
- **Holdout splice into winner archive entry.** `lib/holdout_absorb.sh` calls `splice_holdout_fields` (in `common.sh`) which awk-inserts `holdout_score` and `holdout_per_item` lines into the winner's existing archive entry's front-matter (before the closing `---`). Single source of truth for downstream tooling.
- **Soft per-item cycle budget.** Force-pop on cycle exhaustion is not implemented (it would require a shell-level primitive that doesn't exist today). Instead, the test loop warns in MEMORY when the cycle budget is exceeded. If a candidate genuinely hangs, the user must intervene.
- **Per-instance scorer.** Each ADAS-lite instance is self-contained; the LLM writes a per-program scorer at `init_scorer_pending`.

## Out of scope (v1)

- Per-archive-entry holdout evaluation (only the winner gets the holdout pass; top-k holdout is a v2 idea).
- Full GSM8K test set (1319 items); the 60-item slice is fixed.
- Other benchmarks (ARC, MGSM, DROP) — multi-domain support requires per-domain `scorer.sh` write logic.
- Transfer experiments (discover on A, evaluate on B).
- Parallelism (sweep is sequential).
- LLM-seed propagation through providers (the 3 sweep runs differ only in default LLM sampling noise).
- Promotion of discovered operators into `a-aflow-lite/operators/` (manual git op).
- MoA, force-pop primitive, multi-language GSM8K.

## Files

| File | Role |
|------|------|
| `INSTRUCTIONS.md` | marker — single line `operators/adas-lite.md` |
| `PROGRAM.md` | demo description (GSM8K measurement protocol) |
| `operators/adas-lite.md` | canonical strategy: search controller + holdout controller |
| `operators/propose-operator.md` | LLM proposer: reads archive, writes new operator file |
| `operators/{refine,reflexion,cove,plan-execute,debate}.md` | base operators (byte-equal copies) |
| `operators/{answer-independently,evaluate,opine,plan,reflect,tackle,verify}.md` | support operators |
| `lib/initialize.sh` | bootstrap: PROGRAM, 30/30 fixture split, seed queue, constants |
| `lib/seed_stage.sh` | dispatcher between seed and propose phases |
| `lib/propose_push.sh` | serialise archive into push-args; emit `## Push operators/propose-operator.md` |
| `lib/propose_absorb.sh` | validate `proposed/proposed-NN.md` after pop |
| `lib/test_push.sh` | push candidate for the current search-set item |
| `lib/test_absorb.sh` | capture `## Answer`; advance; score on completion (dynamic NUM_ITEMS) |
| `lib/finalize_entry.sh` | append archive entry; advance iter; halt-check (max-iter only); on halt → `holdout_init` |
| `lib/record_invalid.sh` | malformed-candidate path: append entry with score 0 |
| `lib/holdout_init.sh` | pick winner; stage as candidate; sim/items_source → holdout_items.md |
| `lib/holdout_push.sh` | push winner for current holdout item |
| `lib/holdout_absorb.sh` | capture answer; advance; on completion, splice holdout fields into winner archive entry |
| `lib/finalize_run.sh` | pick best entry; build OUTPUT with held-out + search headline + per-entry summary |
| `lib/common.sh` | shared bash helpers (indent2, archive_write, splice_holdout_fields, etc.) |
| `workspace/gsm8k.jsonl` | 60-item GSM8K test-set slice (regenerable via `scripts/fetch-gsm8k.sh`) |
| `workspace/gsm8k-curated-20.jsonl` | Earlier curated 20-item demo fixture (archival only) |
| `../../scripts/fetch-gsm8k.sh` | one-time fetch + normalise + 60-item slice (repo root) |
| `../../scripts/adas-sweep.sh` | sequential N-run sweep (repo root) |
| `../../scripts/adas-aggregate.sh` | parse N OUTPUT.md files; emit mean ± stdev report (repo root) |
