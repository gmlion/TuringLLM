# a-plan-execute

*Plan-and-Execute (Wang et al., 2023 — "Plan-and-Solve",
arXiv:2305.04091). See `docs/agent-workflows/patterns.md` §Group 2.*

This leaf demonstrates the **Plan-and-Execute** framing: planner
emits an ordered list of steps, executor performs them one at a
time, replanner updates the list on step failure.

## Collapsed framings

The shared strategy under
`interpreters/2-planning-decomposition/` subsumes four published
patterns (all of which reduce to the same state machine under the
current sequential shell — see `patterns.md` Group 2 for the
collapse rationale):

| Framing                 | Source                                                                           |
| ----------------------- | -------------------------------------------------------------------------------- |
| Plan-and-Execute        | Wang et al., 2023 — "Plan-and-Solve", arXiv:2305.04091. **(this leaf)**          |
| Orchestrator–Workers    | Anthropic, 2024 — "Building Effective Agents". See `../b-orchestrator-workers/`. |
| Deep Research           | Product pattern; academically Self-Ask — Press et al., arXiv:2210.03350. See `../c-deep-research/`. |
| XAgent                  | OpenBMB / Tsinghua, tech report 2023. *(no dedicated leaf — prompting-level variant.)* |

See also the group README at `../README.md` for the full collapse story.

## State machine

```
empty ─► (Initialize → push plan.md) ─► planning ─► planning_completed ─(absorb)─► ready
                                                                                    │
                                                ┌─(cursor < len: push execute-step.md)
ready ─►──┤
          └─ cursor == len ─► (push synthesize.md) ─► synthesising ─► synthesising_completed ─► done
                                                                                    │
                                       executing_completed ─(route)─ success ─► ready (cursor++)
                                                                    │
                                                               needs_replan ─► (push plan.md) ─► planning
                                                                    │
                                                               malformed ─► non-blocking Q; ready (cursor++)
```

Six strategy instructions: `Initialize`, `Absorb plan`, `Dispatch
step`, `Route after step`, `Ready to synthesise`, `Finish`.

## Dynamics

| File                     | Consumes                        | Produces (via `## Return`)              | Stack depth |
| ------------------------ | ------------------------------- | --------------------------------------- | ----------- |
| `dynamics/plan.md`       | `{{goal}}`, `{{results_so_far}}` (opt.) | `plan` (splices to `## Plan`)           | 1           |
| `dynamics/execute-step.md` | `{{current_step}}`, `{{context}}` | `step_result` (splices to `## Step Result`) | 1 (2 on recursive sub-plan) |
| `dynamics/synthesize.md` | `{{results}}`                   | `report` (splices to `## Report`)       | 1           |

`dynamics/plan.md`, `dynamics/execute-step.md`, and
`dynamics/synthesize.md` are **byte-identical** across this leaf,
`../b-orchestrator-workers/`, and `../c-deep-research/`. Pinned by
`src/test/phase-3-dynamics-identity.test.ts`.

## Demo `PROGRAM.md`

Minimal TypeScript Node.js project setup (tsconfig, test, CI).
Exercise replan at least once (the first plan typically
under-specifies a step, triggering a `needs_replan` return).

## Run it

```bash
./new-instance.sh my-a interpreters/2-planning-decomposition/a-plan-execute
instances/my-a/run.sh
```

## Known behaviour

- No iteration cap on replans; the loop is the LLM's judgement.
- `## Pending Questions` are non-blocking; malformed step returns
  advance the cursor while logging a question.
