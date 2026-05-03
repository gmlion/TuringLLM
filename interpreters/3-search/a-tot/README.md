# a — Tree of Thoughts

*Yao et al., NeurIPS 2023, arXiv:2305.10601. See `docs/agent-workflows/patterns.md` §Group 3 — Search.*

## What's modeled

Explicit BFS over partial Game-of-24 states. At each depth the strategy expands every live node into k=5 candidates (`expand-node.md`), scores each candidate 3× with discrete `sure | likely | impossible` labels (`score.md`), aggregates by Yao et al.'s weighted sum (sure=20, likely=1, impossible=0.001), keeps the top b=5 per level, and at depth = N − 1 (= 3 for the bundled 4-number puzzle) checks each surviving terminal expression with `evaluate.md` for pass/fail.

The defining contrast with Group 1 (refinement) is that Group 3 explores *alternatives* rather than iterating on one solution — the tree is the artefact, not a single best draft.

## State machine

Eleven instructions. Two-cycle push/absorb pattern per dispatch (push instruction emits `## Push`, dynamic runs and pops with `## Return`, absorb instruction consumes the spliced result and routes via the Phase-router):

```
empty                  → Initialize    → expanding
expanding              → Expand-push   → expanding (shell pop → expanding_completed)
expanding_completed    → Expand-absorb → expanding | scoring | pruning   (Phase-router)
scoring                → Score-push    → scoring (shell pop → scoring_completed)
scoring_completed      → Score-absorb  → scoring | expanding | pruning   (Phase-router)
pruning                → Prune         → advancing | done (R37 dead-end)
advancing              → Advance       → expanding | goal_checking
goal_checking          → Goal-push     → goal_checking (shell pop → goal_checking_completed)
goal_checking_completed→ Goal-absorb   → goal_checking | solved | done (R34)
solved                 → Solved        → done
done                   → (shell halts at stack depth 1)
```

Tree state lives in the strategy frame's `./scoped/tree.md` as an append-only YAML-block ledger; every field update is an awk-based surgical edit (R12).

## Dynamics

| File | Push-args | Returns | Stack depth from caller |
| ---- | --------- | ------- | ----------------------- |
| `operators/expand-node.md` | `partial_state`, `task` | `children` (5 state entries) | 1 |
| `operators/score.md` | `partial_state`, `task` | `value` ∈ {`sure`, `likely`, `impossible`} | 1 (pushed 3× per child) |
| `operators/evaluate.md` | `attempt`, `criterion` | `verdict` ∈ {`pass`, `fail`}, `feedback` | 1 |

`evaluate.md` is the canonical 1b copy, byte-equal — pinned by `src/test/phase-dynamics-identity.test.ts`.

## Demo `PROGRAM.md`

"Find an arithmetic expression using 4, 5, 6, and 10 exactly once that evaluates to 24 using only `+`, `−`, `×`, `÷` and parentheses." A solution exists (e.g. `(10 − 4) × 5 − 6 = 24`).

## Run it

```bash
./new-instance.sh my-tot interpreters/3-search/a-tot
instances/my-tot/run.sh
```

After completion, inspect:

- `instances/my-tot/frames/f000-strategy/MEMORY.md` for `## Solution` (or `## No Solution Found` if the search exhausted).
- `instances/my-tot/frames/f000-strategy/scoped/tree.md` for the full search ledger — depth-coverage, b=5 cap, samples-per-node invariants are all visible there.

## Notable behaviour

- **Refactored in Phase 6b** (`docs/specs/2026-05-01-implement-phase-6b/`). Both dynamics now take the canonical push-arg pair `partial_state`/`task` (replacing the prior Game-of-24-flavoured arg names). The ledger no longer carries op/left fields — partial states live in `./scoped/state-<id>.md` instead. BFS semantics (k=5, b=5, max_depth, 3-sample scoring, weighted-sum aggregation, pruning, goal-checking) are unchanged.
- **Cycle cost (~540 LLM cycles per puzzle worst case).** The bounded BFS schedule is k=5 children, b=5 retained, depth=N−1, plus 3 score samples per child and the two-cycle push/absorb dispatch pattern. Worst case: ~11 expand dispatches + ~165 score dispatches + ≤5 evaluate dispatches ≈ 181 dispatches × 3 LLM cycles each ≈ 540 cycles. The "~200" figure cited in spec requirement R3 refers to *dispatches*, not LLM cycles — both numbers are stated here so the discrepancy doesn't bite later readers.
- **3× value-sampling fidelity** per Yao et al. 2023. Each child node is scored with three samples by `score.md` (three samples per node, drawn independently); the three label outputs are aggregated by weighted sum (`sure=20`, `likely=1`, `impossible=0.001`). Range: `[0.003, 60]`. This matches the reference implementation at github.com/princeton-nlp/tree-of-thought-llm verbatim.
- **No retry, no early termination beyond BFS.** A failed puzzle just halts with `## No Solution Found`. The bounded depth means there is no infinite-loop risk; conversely, there is no second-pass, no tree restart, no temperature ramp.
- **Malformed dynamic outputs are non-blocking.** Bad `expand-node` children, malformed `score.md` labels, or unexpected `evaluate.md` verdicts append a `## Pending Questions` entry and otherwise progress (treated as `impossible` / `fail` respectively). The strategy never transitions to `waiting_for_user` for soft errors — only at Initialize when PROGRAM.md is genuinely missing input.
- **PROGRAM.md prose constraint.** Initialize parses integers via `grep -oE '\b[0-9]+\b' | head -n 5`; the convention is "puzzle numbers, then target" with the LAST integer as target. Do not include stray integer tokens in the prose (no "Phase 6", "Section 3", or duplicate "24" headings). Stick to the demo's plain shape: title that contains no digits, then prose listing the puzzle numbers and target as integers.
- **Project-git per branch is deferred.** The source spec mentions per-branch `workspace/` git as a future integration; Game of 24 has no per-branch artefacts, so the integration is out of scope here. Phase 6b (LATS) or a future code-search demo is the natural place to introduce it.
