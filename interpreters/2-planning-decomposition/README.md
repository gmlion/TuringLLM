# Group 2 — Planning & decomposition

*See `docs/agent-workflows/patterns.md` §Group 2 for the
literature taxonomy.*

## What's modeled at the family level

A **planner** breaks a goal into an ordered list of steps; an
**executor** performs them one at a time; a **synthesizer**
aggregates the per-step results into a final report. After every
step the strategy decides: advance, replan from scratch, or
move on to synthesis. When the executor judges its assigned
step too broad, it can recursively push the planner again
within its own frame to decompose — that's the depth-2 case
that distinguishes the Deep Research framing.

The orchestrator is always the strategy frame
(`f000-strategy`). Planner, executor, and synthesizer each live
in their own per-push child contexts. Sibling executors never
see each other's working state — only a brief digest of prior
results that the strategy assembles.

## Why one strategy for four framings

Under sequential execution, four published patterns reduce to
the same state machine. The differences between them are
prompting-level (or, for Deep Research, a *runtime* recursion
behaviour the executor opts into) rather than structural — so
this group ships **one strategy** exposed through **three
leaves**, each with a different `PROGRAM.md` to elicit the
distinguishing trace.

| Leaf                         | Framing                 | Source                                                                         |
| ---------------------------- | ----------------------- | ------------------------------------------------------------------------------ |
| [`a-plan-execute/`](./a-plan-execute/)            | Plan-and-Execute        | Wang et al., 2023 — "Plan-and-Solve", arXiv:2305.04091.                        |
| [`b-orchestrator-workers/`](./b-orchestrator-workers/)    | Orchestrator–Workers    | Anthropic, 2024 — "Building Effective Agents".                                 |
| [`c-deep-research/`](./c-deep-research/)           | Deep Research           | Product pattern (OpenAI Deep Research, Anthropic Research, Perplexity Pro); academically close to Self-Ask — Press et al., arXiv:2210.03350. |
| *(no dedicated leaf)*        | XAgent                  | OpenBMB / Tsinghua, tech report 2023. Collapses to Plan-and-Execute with a more aggressive replanner prompt; no structural distinction under sequential execution. |

The collapses, briefly:

- **Plan-and-Execute → Orchestrator–Workers** because sequential
  fan-out is indistinguishable from sequential single-executor
  iteration. The orchestrator/planner distinction is
  prompting-level.
- **Plan-and-Execute → Deep Research** because recursive
  sub-question investigation is `execute-step.md` re-pushing
  `plan.md` on a coarse step. Same dynamics, runtime depth-2.
- **Plan-and-Execute → XAgent** because XAgent's "planner can
  rewrite at any time" is just a replanner prompted to fire
  every cycle.

## When to reach for which one

- **a plan-execute** — when the task is a concrete sequence of
  actions and the plan is mostly stable but might need one
  replan if a step fails or under-specifies.
- **b orchestrator-workers** — when the decomposition is
  obviously fan-out (N independent inputs, N independent
  outputs) and you want the trace to make that visible.
- **c deep-research** — when the question is open enough that
  some sub-questions will themselves need decomposing. This is
  the only leaf that exercises stack depth 2 by design.

## Shared dynamics

All three leaves ship byte-identical copies of these dynamics:

| File                        | Receives (push-args)                      | Returns (via `## Return`)                         |
| --------------------------- | ----------------------------------------- | ------------------------------------------------- |
| `dynamics/plan.md`          | `goal`, `results_so_far` (optional)       | `plan` (an ordered bullet list of steps)          |
| `dynamics/execute-step.md`  | `current_step`, `context`                 | `outcome` (`status: success | needs_replan` + `output`) |
| `dynamics/synthesize.md`    | `results`                                 | `report`                                          |

Identity is pinned by an identity test under `src/test/`.

## Demos at a glance

| Leaf                         | Demo                                     | Replan expected | Recursion expected |
| ---------------------------- | ---------------------------------------- | --------------- | ------------------ |
| `a-plan-execute/`            | Minimal TypeScript project (tsconfig, test, CI) | At least one (intentional under-specification) | No |
| `b-orchestrator-workers/`    | Summarise 5 files in `workspace/inputs/` | Zero (plan is stable) | No |
| `c-deep-research/`           | Compare Raft / Paxos / Multi-Paxos       | Possible on broad sub-questions | **Yes** (depth 2) |

## Run any of the three

```bash
./new-instance.sh my-a interpreters/2-planning-decomposition/a-plan-execute
instances/my-a/run.sh
```

(substitute `b-orchestrator-workers` or `c-deep-research` as
needed).

## What each leaf README explains

Every leaf README in this group describes (1) the framing in
plain terms, (2) the orchestrator-by-orchestrator view of which
context is driving each LLM cycle, (3) the per-step trace end
to end, (4) where state lives across cycles, (5) the dynamics'
push-arg/return contract.
