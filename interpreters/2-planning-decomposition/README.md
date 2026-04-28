# Planning & decomposition — Group 2

*patterns.md §Group 2 — "Plan-and-Execute (includes Orchestrator–
Workers, Deep Research, XAgent)".*

This group ships **one strategy** exposed through **three leaves**,
each shipping a different `PROGRAM.md` to demonstrate a different
canonical framing of the same pattern. Under the current
sequential shell, four published patterns collapse onto the same
state machine — so we ship one implementation and three demos
rather than three duplicated implementations.

## Framings subsumed (all four named with citations)

| Leaf                         | Framing                 | Source                                                                         |
| ---------------------------- | ----------------------- | ------------------------------------------------------------------------------ |
| `a-plan-execute/`            | Plan-and-Execute        | Wang et al., 2023 — "Plan-and-Solve", arXiv:2305.04091.                        |
| `b-orchestrator-workers/`    | Orchestrator–Workers    | Anthropic, 2024 — "Building Effective Agents".                                 |
| `c-deep-research/`           | Deep Research           | Product pattern (OpenAI Deep Research, Anthropic Research, Perplexity Pro); academically close to Self-Ask — Press et al., arXiv:2210.03350. |
| *(no dedicated leaf)*        | XAgent                  | OpenBMB / Tsinghua, tech report 2023. Collapses to Plan-and-Execute with a more aggressive replanner prompt; no structural distinction under sequential execution. |

## Why one strategy for four framings

Under sequential execution:

- **Plan-and-Execute → Orchestrator–Workers** collapse because
  sequential fan-out is indistinguishable from sequential
  single-executor iteration. The orchestrator/planner distinction
  is prompting-level, not structural.
- **Plan-and-Execute → Deep Research** collapse because
  recursive sub-question investigation is a special case of
  `execute-step.md` re-pushing `plan.md` on a coarse step.
- **Plan-and-Execute → XAgent** collapse because XAgent's
  "planner can rewrite at any time" is just a replanner
  prompted to fire every cycle; the three-component
  (dispatcher / planner / actor) split is prompting-level too.

The distinction between the framings is therefore the PROGRAM.md
each leaf ships — which naturally elicits the different
execution traces.

## Shared dynamics

| File                        | Consumes                                  | Produces (via `## Return`)                        |
| --------------------------- | ----------------------------------------- | ------------------------------------------------- |
| `dynamics/plan.md`          | `{{goal}}`, `{{results_so_far}}` (opt.)   | `plan`                                            |
| `dynamics/execute-step.md`  | `{{current_step}}`, `{{context}}`         | `step_result` (`status: success | needs_replan`)  |
| `dynamics/synthesize.md`    | `{{results}}`                             | `report`                                          |

The three files are **byte-identical** across all three leaves,
pinned by an identity test under `src/test/`.

## Demos at a glance

| Leaf                         | Demo                                     | Replan mode                                    | Recursion expected |
| ---------------------------- | ---------------------------------------- | ---------------------------------------------- | ------------------ |
| `a-plan-execute/`            | Minimal TypeScript project (tsconfig, test, CI) | At least one (intentional under-specification) | No                 |
| `b-orchestrator-workers/`    | Summarise 5 files in `workspace/inputs/` | Zero (plan is stable)                           | No                 |
| `c-deep-research/`           | Compare Raft / Paxos / Multi-Paxos       | Possible on broad sub-questions                | **Yes** (depth 2)  |

## Run any of the three

```bash
./new-instance.sh my-a interpreters/2-planning-decomposition/a-plan-execute
instances/my-a/run.sh
```

(substitute `b-orchestrator-workers` or `c-deep-research` as needed).

## See also

- `docs/agent-workflows/patterns.md` §Group 2 — the conceptual taxonomy.
