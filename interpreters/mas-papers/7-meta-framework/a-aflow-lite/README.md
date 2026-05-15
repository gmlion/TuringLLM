# AFlow-lite

A lightweight MCTS-based meta-framework over a five-operator library, after Zhang et al. 2024 (*AFlow: Automating Agentic Workflow Generation*, arXiv:2410.10762).

## What it does

AFlow-lite treats the operator library itself as a search space. Each tree node is a *candidate workflow* — a comma-separated list of operator names like `refine` or `cove,plan-execute`. The empty workflow is the root. Each MCTS iteration:

1. **Select** a leaf via UCT descent (LATS-equivalent).
2. **Expand** the leaf via `expand-workflow.md`, which produces k=5 candidate child workflows.
3. **Simulate** the chosen child by running its operators sequentially on each of 3 benchmark items.
4. **Evaluate** by computing the mean fraction passing (∈ {0, 0.333, 0.667, 1.0}).
5. **Back-propagate** the reward up the chosen-child→root path.

Halts on the first 1.0 reward, or after `max_iterations` (default 10).

## Operator library

Hardcoded:

```
refine, reflexion, cove, plan-execute, debate
```

Each is a byte-equal copy of its canonical source under another interpreter's `operators/`. The byte-equality is enforced by `src/test/phase-operators-identity.test.ts`.

**Excluded from the v1 library:**

- `self-refine` — subsumed by `refine` (the explicit-judge interface in 1b is a cleaner composition primitive).
- `MoA` — blocked on per-prompt model selection in the harness; future spec adds it.
- `tot`, `lats` — search-over-search recursion; intractable as this meta-framework IS itself a search.
- `metagpt`, `chatdev` — end-to-end pipelines tied to "build a software project"; not composable as building blocks.

## State machine

| State | Action | Next |
|-------|--------|------|
| `empty` | Initialize: load PROGRAM.md + benchmark fixture, sample 3 items, seed root n0 | `selecting` |
| `selecting` | Walk tree from root via UCT; set cursor to leaf | `expanding` |
| `expanding` | Push `expand-workflow.md` with `{{partial_state}}` + `{{task}}` | `expanding_completed` |
| `expanding_completed` | Append k=5 children; per-node `state-<id>.md`; set chosen_child | `simulating` |
| `simulating` | Push next operator in chosen_child's recipe with `{{task}}` + `{{prior_answer}}` | `simulating_completed` |
| `simulating_completed` | Capture `## Answer`; advance op or item; loop until 3 items × len(recipe) operators run | `simulating` or `evaluating` |
| `evaluating` | Compute mean reward; back-prop via parent chain; record; terminate or loop | `selecting` or `done` |

## Demo: GSM8K

`PROGRAM.md` describes the demo: solve GSM8K math word problems (`workspace/gsm8k.jsonl`, 20 hand-curated items). The 3 items used per run are sampled deterministically (1st, middle, last in the file). Per-item scoring extracts the last integer from the operator chain's final `## Answer` and compares to the expected integer answer.

GSM8K is from Cobbe et al. 2021 (*Training Verifiers to Solve Math Word Problems*, arXiv:2110.14168), released by OpenAI under the MIT License at [github.com/openai/grade-school-math](https://github.com/openai/grade-school-math). The 20 items in `workspace/gsm8k.jsonl` are a sample drawn from that dataset.

## Run it

From the repo root:

```bash
npm run build
./new-instance.sh interpreters/mas-papers/7-meta-framework/a-aflow-lite aflow1
# Optionally edit instances/aflow1/PROGRAM.md or workspace/gsm8k.jsonl
# Configure instances/aflow1/.env (provider, model, keys)
instances/aflow1/run.sh
```

A successful run halts with `## Solution` (best workflow + score) in `OUTPUT.md`. A run that exhausts iterations halts with `## No Solution Found` (best workflow seen + best reward).

## Notable behaviour

- **No meta-reflexion in v1:** The operator `reflexion.md` is in the library and runs INSIDE workflows (per-attempt verbal lessons within its own pushed frame), but aflow-lite's own meta-strategy uses only UCT + LLM-driven expansion (with `recent_scores` as data) for learning. Cross-iteration meta-meta-reflection is future scope.
- **No nested shell instances:** All workflow execution happens via push/pop within one instance. Stack depth temporarily grows during operator execution (depth 1 for the operator itself, depth 2+ when an operator pushes its own sub-operators) and shrinks back.
- **Stack-depth invariant:** `stack.length ≤ 4` at every cycle (root aflow-lite + library operator + library operator's sub-push + sub-push's own sub-push).
- **No concurrency:** Sequential under the existing single-threaded shell, exactly like LATS. Per-iteration, the 3 benchmark items are processed in sequence; each runs the candidate workflow's operators in sequence.
- **No new "## Aflow Answer" tag:** The terminal state writes the standard `## Return\nanswer:` block, identical to every other operator. The `OUTPUT.md` writer surfaces this as `## Answer`.

## Files

| File | Role |
|------|------|
| `INSTRUCTIONS.md` | marker — single line `operators/aflow-lite.md` |
| `PROGRAM.md` | demo description (GSM8K) |
| `operators/aflow-lite.md` | canonical strategy: MCTS controller |
| `operators/expand-workflow.md` | new operator: k=5 LLM-driven workflow expansion |
| `operators/{refine,reflexion,cove,plan-execute,debate}.md` | library operators (byte-equal copies) |
| `operators/{evaluate,reflect,verify,answer-independently,tackle,plan,opine}.md` | sub-operators reused by the library operators (byte-equal copies) |
| `workspace/gsm8k.jsonl` | 20-item benchmark fixture |
