# Requirements: phase-8-1-adas-lite-measurement

## Context

Phase 8 (`b-adas-lite`) shipped the ADAS-lite plumbing — sequential proposer iteration over an archive of operator files, with a 3-item GSM8K smoke test that proves the push/pop and lib-script layout works. But the 3-item setup is a tautology: the proposer reads scores from the same 3 items it's tested against, `OUTPUT.md` reports those same 3-item scores, and the only possible reward values are {0, 0.33, 0.67, 1.0} — too coarse to distinguish operators that differ by real-world percentage points. Worse, halt-on-1.0 stops the search the first time a seed gets lucky on those 3 specific items, and `refine` empirically does so.

Phase 8.1 turns ADAS-lite into a real measurement tool by porting the ADAS paper's evaluation protocol (Hu et al. 2024, arXiv:2408.08435 §3): train/test split where the proposer only sees scores from a *search set* and the headline number is the best discovered agent's accuracy on a separate *held-out test set*; multiple stochastic runs reported as mean ± stdev rather than a single number; halt strictly on iteration budget rather than on first lucky perfect score.

Scope: modify `interpreters/mas-papers/7-meta-framework/b-adas-lite/` in place. The 3-item demo path is dropped. The fixture is replaced with a real GSM8K test-set sample. New states and lib scripts are added for held-out evaluation and multi-run aggregation.

## User stories

- **US1**: As a researcher, I want a held-out evaluation set that the proposer never sees, so I can report a number that reflects generalization rather than memorization of the search items.
- **US2**: As a researcher, I want the search to run to a fixed iteration budget (no early halt), so the archive is populated regardless of early luck and the proposer has incentive to explore diverse patterns.
- **US3**: As a researcher reporting results, I want a sweep harness that runs the full search 3 times and aggregates the held-out scores into mean ± stdev, so my reported numbers reflect run-to-run noise honestly.
- **US4**: As a user inspecting `OUTPUT.md`, I want the headline number to be the winner's held-out score (not the search score), with the search score visible nearby for comparison, so I can see at a glance whether the search overfit.
- **US5**: As a developer, I want the GSM8K test-set fetch to be reproducible and committed (or scriptable), so different runs use the same items and results are comparable across machines.

## Acceptance criteria (EARS)

### Fixture (real GSM8K test set)

- **R1**: THE SYSTEM SHALL replace `workspace/gsm8k.jsonl` (currently 20 hand-curated items) with a deterministic ~60-item slice of the official GSM8K test set (Cobbe et al. 2021, arXiv:2110.14168), committed in the same `{question, answer}` JSONL format that the existing scorer expects.
- **R2**: THE SYSTEM SHALL provide a one-time fetch script at `scripts/fetch-gsm8k.sh` that downloads the official GSM8K test split and emits a deterministic 60-item slice, so the fixture can be regenerated reproducibly.
- **R3**: THE GSM8K answer field SHALL be normalised to the integer ground truth (the `#### N` suffix in the original GSM8K format), matching the format of the existing 20-item curated set so the per-program scorer requires no changes.

### Search/holdout split

- **R4**: WHEN ADAS-lite is initialized, THE SYSTEM SHALL deterministically sample 30 items into `./scoped/benchmark_items.md` (the search set the proposer sees) and a separate 30 items into `./scoped/holdout_items.md` (the held-out set the proposer never sees), drawn from non-overlapping ranges of the fixture.
- **R5**: THE proposer's push-args SHALL include the search set (`benchmark_sample`) but SHALL NOT include any item from the held-out set, even indirectly via summary statistics.
- **R6**: THE candidate test loop SHALL operate strictly on the search set (R3 of Phase 8 stays — score against `benchmark_items.md`).

### Search loop changes

- **R7**: THE candidate test loop SHALL read the item count dynamically from `benchmark_items.md` (replacing Phase-8's hardcoded `NUM_ITEMS=3`), so the same code paths work for any sample size.
- **R8**: THE SYSTEM SHALL halt the search strictly when `iter_count >= max_iterations` (default 10 propose-iterations on top of the 5 seeds = 15 archive entries total). THE first-1.0 early-halt path SHALL be removed.
- **R9**: THE per-item cycle budget (`./scoped/per_item_cycle_budget.md`) SHALL remain warn-only (Phase-8 R20 amendment); no new force-pop primitive is in scope.

### Held-out evaluation

- **R10**: WHEN the search ends, THE SYSTEM SHALL identify the single archive entry with the highest search-set score (tie-break: lowest entry NN — first to reach the score) and run that entry over every item in `./scoped/holdout_items.md`.
- **R11**: THE held-out evaluation SHALL use the SAME push/pop test loop infrastructure as the search-set evaluation: push the winner once per held-out item, capture `## Answer`, score via `./scoped/scorer.sh`, accumulate per-item scores.
- **R12**: WHEN held-out evaluation completes, THE SYSTEM SHALL persist the holdout score to a new field on the winning archive entry (e.g., `holdout_score: 0.7333`) and to a top-level `./scoped/holdout_summary.md`.
- **R13**: WHILE held-out evaluation runs, THE per-item cycle counter and warn-on-overrun SHALL apply identically to the search-set test loop.
- **R14**: THE held-out evaluation SHALL run only the search-winner (single archive entry). Per-entry holdout evaluation, top-k, and similar variants are out of scope.

### Output and reporting

- **R15**: WHEN ADAS-lite halts, THE OUTPUT.md SHALL surface the held-out score as the headline number (e.g., `Best agent (holdout): seed-cove 0.7333`), with the search-set score visible immediately below for comparison, followed by the per-entry archive summary as in Phase 8.
- **R16**: THE per-entry archive summary in OUTPUT.md SHALL include the search score for every entry; the holdout score column SHALL appear only on the winner's row.

### Multi-run sweep

- **R17**: THE SYSTEM SHALL provide a sweep harness at `scripts/adas-sweep.sh <name-prefix> <num-runs>` that creates `<name-prefix>-1`, `<name-prefix>-2`, ..., `<name-prefix>-N` instances using the b-adas-lite interpreter and runs each sequentially.
- **R18**: THE sweep harness SHALL exit 0 when all runs complete successfully and SHALL preserve the run instances on disk for inspection.
- **R19**: THE SYSTEM SHALL provide an aggregation script at `scripts/adas-aggregate.sh <name-prefix>` that reads the `OUTPUT.md` of each `<name-prefix>-*` instance, extracts the headline holdout score and the search score of the winner, and emits a summary report.
- **R20**: THE aggregation report SHALL include: (a) per-run holdout score and per-run winner label; (b) mean and standard deviation of the holdout scores across runs; (c) mean and standard deviation of the search scores across runs (so search-vs-holdout drift is visible); (d) a 1-line per-run overfit indicator (search_score - holdout_score). Report goes to stdout and to `<name-prefix>-aggregate.md` in the repo root.

### Halt and shell behaviour

- **R21**: THE SYSTEM SHALL keep the existing `## Return answer:` mechanism at root-operator halt (Phase-7 splicing). The headline OUTPUT.md `## Answer` section SHALL contain the held-out + search score lines and the per-entry summary; the operator content of the winner SHALL be available either inline or via a reference to its archive file path.
- **R22**: THE SYSTEM SHALL NOT modify any code under `src/`, `dist/`, or shell-level frame-management primitives. All Phase 8.1 changes live under `interpreters/mas-papers/7-meta-framework/b-adas-lite/`, `workspace/gsm8k.jsonl`, and `scripts/`.

### Backwards compatibility

- **R23**: PRE-EXISTING `instances/<name>/` directories created under Phase-8 b-adas-lite (with the 3-item layout) SHALL NOT be expected to resume cleanly under Phase 8.1. They are read-only artefacts. The kiro-flow tasks file SHALL document this as a breaking change.

## Out of scope

- **Per-entry held-out evaluation, top-k holdout, and adaptive holdout sampling.** v1 evaluates only the single search-winner. R14.
- **GSM8K full test set (1319 items).** We sample 60 items deterministically for cost reasons. Bumping to the full test set is a config change away but not done by default.
- **Other benchmarks (ARC, MGSM, DROP).** The ADAS paper used 5 domains; we stay on GSM8K. Multi-domain support requires per-domain `scorer.sh` write logic and per-domain fixture format that aren't designed yet.
- **Transfer experiments.** ADAS paper measures transfer (discover on A, evaluate on B). Out of scope; needs multiple instance archives and cross-domain runs.
- **Parallelism.** Sequential only. The sweep harness runs instances back-to-back, not in parallel. R17.
- **Per-iteration confidence intervals.** We report run-to-run stdev only. Bootstrap confidence intervals over individual items are out of scope.
- **Promotion of discovered operators into the canonical library.** Same as Phase 8: `instances/.../proposed/` files stay there. Manual git op to promote.
- **MoA, force-pop, multi-language GSM8K.** Same exclusions as Phase 8.

## Open questions

- **Default `max_iterations` (R8 — "10").** ADAS paper uses ~30 generations. With 30/30 split and ~15 cycles per item this is ~25K LLM calls per run; a 30-iteration sweep is ~75K. Keep 10 as default for now (matching Phase 8) and let the user bump it; the lib-script change to dial it is a one-line edit.
- **Sample stratification (R4).** Should the search/holdout split stratify by problem difficulty (e.g., word-count, expected-answer magnitude) to ensure both sets cover similar distributions? Or pure deterministic slicing (first 30 / last 30)? Tentative: pure slicing — simpler, and GSM8K's official test set is already reasonably distributed. Revisit if results show systematic search/holdout drift.
- **Sweep harness vs. per-instance .env.** Should the 3 runs share a single `.env` (same provider/model, only stochastic LLM seed differs) or take per-run overrides? Tentative: share a single `.env` at the root; the aggregation script reads each instance's effective config and warns if they differ.
- **Where to commit the 60-item GSM8K slice.** As `workspace/gsm8k.jsonl` directly (replaces the curated 20)? Or as `workspace/gsm8k-test-60.jsonl` alongside the 20-item file? Tentative: replace `gsm8k.jsonl` outright. The Phase-8 demo path is gone anyway. The curated 20 can stay as a reference at `workspace/gsm8k-curated-20.jsonl` for archival.
