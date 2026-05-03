# b — Language Agent Tree Search

*Zhou et al., 2023, arXiv:2310.04406. See `docs/agent-workflows/patterns.md` §Group 3 — Search.*

## What's modeled

Paper-faithful Monte Carlo Tree Search over LLM-generated thoughts. The strategy frame runs an MCTS loop (selection → expansion → simulation → evaluation → back-prop → reflection) bounded by `max_iterations` (default 30). The four dynamics are domain-agnostic: domain knowledge lives exclusively in `PROGRAM.md`. The bundled demo is a byte-equal copy of Phase 6's Game of 24 puzzle, so a LATS run is directly comparable to a ToT run on identical input.

## State machine

Eleven instructions. Two-cycle push/absorb pattern per dynamic dispatch:

```
empty                    → Initialize       → selecting
selecting                → Select           → expanding (UCT descent picks leaf cursor)
expanding                → Expand-push      → expanding (shell pop → expanding_completed)
expanding_completed      → Expand-absorb    → simulating | selecting (R50 zero-children fallback)
simulating               → Simulate-push    → simulating (shell pop → simulating_completed)
simulating_completed     → Simulate-absorb  → evaluating
evaluating               → (push evaluate)  → evaluating (shell pop → evaluating_completed)
evaluating_completed     → Evaluate-absorb  → done (reward=1, ## Solution)
                                            | reflecting (reward=0)
reflecting               → Reflect-push     → reflecting (shell pop → reflecting_completed)
reflecting_completed     → Reflect-absorb   → selecting (next iter)
                                            | done (budget exhausted, ## No Solution Found)
done                     → (shell halts at stack depth 1)
```

Tree state lives in the strategy frame's `./scoped/tree.md` as an append-only YAML-block ledger; per-node partial states live in `./scoped/state-<id>.md` files (write-once); per-node accumulated lessons live in `./scoped/lessons-<id>.md` files (lazy + append-only). Every field update of `tree.md` is an awk-based surgical edit (R39).

## Dynamics

| File | Push-args | Returns | Stack depth from caller |
| ---- | --------- | ------- | ----------------------- |
| `operators/expand-node.md` | `partial_state`, `task` | `children` (5 state: entries) | 1 |
| `operators/rollout.md` | `partial_state`, `task` | `terminal_state` (single endpoint) | 1 |
| `operators/evaluate.md` | `attempt`, `criterion` | `verdict` ∈ {`pass`, `fail`}, `feedback` | 1 |
| `operators/reflect.md` | `attempt`, `verdict`, `feedback` | `lesson` | 1 |

`expand-node.md`, `evaluate.md`, and `reflect.md` are byte-equal copies pinned by `src/test/phase-dynamics-identity.test.ts`. `rollout.md` is new in this phase.

## Demo `PROGRAM.md`

Byte-equal with `interpreters/3-search/a-tot/PROGRAM.md`: "Find an arithmetic expression using 4, 5, 6, and 10 exactly once that evaluates to 24 using only `+`, `−`, `×`, `÷` and parentheses." Same puzzle as ToT, enabling A/B comparison.

## Run it

```bash
./new-instance.sh my-lats interpreters/3-search/b-lats
instances/my-lats/run.sh
```

After completion, inspect:

- `instances/my-lats/frames/f000-strategy/MEMORY.md` for `## Solution` (terminal state + iteration count) or `## No Solution Found` (iteration count + terminal_fail count).
- `instances/my-lats/frames/f000-strategy/scoped/tree.md` for the full search ledger (q/n statistics per node).
- `instances/my-lats/frames/f000-strategy/scoped/state-*.md` for per-node partial states.
- `instances/my-lats/frames/f000-strategy/scoped/lessons-*.md` (if any) for harvested per-node reflections.

For A/B comparison against Phase 6 ToT on the same puzzle:

```bash
./new-instance.sh my-tot interpreters/3-search/a-tot
instances/my-tot/run.sh
```

Contrast the resulting trees: ToT grows breadth-first to fixed `max_depth = N − 1` with 3-sample scoring; LATS grows depth-first via UCT with 1 rollout per iteration.

## Notable behaviour

- **Cycle cost (~10–13 cycles per MCTS iteration, ~30 iterations max)**. Per iteration: selection (1 strategy cycle, no LLM) + expand push/absorb (3 cycles, 1 LLM) + rollout push/absorb (3 cycles, 1 LLM) + evaluate push/absorb (3 cycles, 1 LLM) + on failure reflect push/absorb (3 cycles, 1 LLM). Worst case at `max_iterations=30`: ~390 cycles, ~120 LLM calls. Single-shot LLM-policy rollout (the new `rollout.md`) keeps the per-iteration cost roughly comparable to one Phase 6 score sample.
- **Deliberate omission of `score.md`.** UCT-driven exploration of rollout-derived statistics replaces graded-rank value sampling. The Phase 6 ToT artefact is intentionally not shipped in `b-lats/operators/`. A future LATS variant that wants score-as-UCT-prior can re-introduce it without contract change.
- **Deliberate omission of pruning.** UCT handles exploration/exploitation implicitly via the second term of the UCT formula. No explicit prune phase exists; the `pruned` status value from Phase 6's enum is absent from the LATS ledger.
- **Per-node ancestor-walk lesson scope.** A failed rollout from chosen_child C produces a `## Lesson` that is appended to `./scoped/lessons-<C>.md`. Future expansions of any descendant of C see the lesson concatenated into `partial_state` via the Compose-partial-state primitive (root-to-cursor order). Siblings of C don't inherit; this is paper-faithful per-subtree reflexion.
- **Record-A: failed rollouts do NOT materialise into the tree.** The tree only grows by deliberate UCT expansions (k=5 children per iteration). Winning rollouts are recorded only in MEMORY's `## Solution` section (and in `history/` snapshots). This matches the LATS paper's distinction between deliberate tree growth and throwaway rollouts.
- **Malformed dynamic outputs are non-blocking.** Bad `expand-node` children (R50), missing `rollout` terminal state (R53), unexpected `evaluate` verdicts (R54), missing `reflect` lessons (R60) all append `## Pending Questions` and progress (treated as fail / fall-through). The strategy never transitions to `waiting_for_user`.
- **Phase 6 dynamics generalisation landed alongside this interpreter.** As of `docs/specs/2026-05-01-implement-phase-6b/`, `expand-node.md` and `score.md` (Phase 6) are domain-agnostic — same `partial_state` / `task` push-arg shape that LATS uses. The LATS leaf adopts the canonical (post-refactor) `expand-node.md` byte-equal.
