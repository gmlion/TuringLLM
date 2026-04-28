# a-plan-execute

*Plan-and-Execute (Wang et al., 2023 — "Plan-and-Solve",
arXiv:2305.04091). See `docs/agent-workflows/patterns.md` §Group 2.*

## What's modeled

A planner-then-executor split. A first agent receives the goal
and emits an ordered list of steps. A second agent executes one
step at a time, reporting back what happened. After every step,
the orchestrator decides whether to advance, replan from
scratch, or move on to the synthesis phase. When all steps are
done, a third agent reads the accumulated step results and emits
a final report.

The "plan, then execute" decomposition is the point: planning
happens once (or N times after replans), independently of any
single step's execution. The executor never sees the full plan
— only the current step plus a short digest of prior results —
so it can't optimize across steps in ways the planner didn't
anticipate.

## Collapsed framings

The shared strategy under
`interpreters/2-planning-decomposition/` subsumes four published
patterns (all of which reduce to the same state machine under the
current sequential shell — see `patterns.md` Group 2 for the
rationale):

| Framing                 | Source                                                                           |
| ----------------------- | -------------------------------------------------------------------------------- |
| Plan-and-Execute        | Wang et al., 2023 — "Plan-and-Solve", arXiv:2305.04091. **(this leaf)**          |
| Orchestrator–Workers    | Anthropic, 2024 — "Building Effective Agents". See `../b-orchestrator-workers/`. |
| Deep Research           | Product pattern; academically Self-Ask — Press et al., arXiv:2210.03350. See `../c-deep-research/`. |
| XAgent                  | OpenBMB / Tsinghua, tech report 2023. *(no dedicated leaf — prompting-level variant.)* |

Each leaf ships a different `PROGRAM.md` to elicit the framing's
characteristic execution trace; the strategy and dynamics are
byte-equal across the three leaves.

## Four orchestrators, four contexts

| Driver | When it's active | What it can see | What it produces |
| --- | --- | --- | --- |
| **Strategy** (`f000-strategy`) | Initial plan request, after each pop, between steps | Its own MEMORY, the plan at `./scoped/plan.md`, the cursor (current step index) at `./scoped/cursor.md`, the accumulating step log at `./scoped/results.md`, the user program | A push (request a plan, dispatch a step, request synthesis), or `done` |
| **Planner** (`fNNN-plan`) | One planning pass | Only `goal` and `results_so_far` handed in via push-args; nothing else about the strategy's state | An ordered list of steps as `plan` |
| **Executor** (`fNNN-execute-step`) | One step, possibly with a recursive replan request | `current_step` and `context` (a short digest of prior results) handed in via push-args; can use the full toolset (bash, write_file, web search) and write to `workspace/`. May push `plan.md` recursively if the step is too broad | An `outcome` (`status: success | needs_replan` + `output`), spliced to the strategy as `## Outcome` |
| **Synthesizer** (`fNNN-synthesize`) | One synthesis pass at the end | The full `results` log handed in via push-args | A final `report` |

A new context is created on every push and destroyed on the
matching pop. **The executor does not see the plan** — only the
single step it was dispatched. This is what makes the decomposition
real: an executor can't quietly merge or reorder steps, because
it doesn't know what the others are.

The executor *may* push `plan.md` again recursively if its step is
too broad to act on directly. This is the depth-2 case
(`strategy → execute-step → plan`); the executor pops with
`needs_replan` and the strategy then re-runs `plan.md` with the
expanded sub-steps visible in `results_so_far`. The next plan
replaces the broad step with its concrete sub-step leaves.

## How a run works

A run is `1 + 2 + sum_over_steps(2 to 4) + 2 + 1` cycles —
typically ~15–25 cycles for a 5-step plan with no replans.

1. **(strategy)** *Initialize.* Read PROGRAM.md, create empty
   `./scoped/results.md` and `./scoped/cursor.md = 0`, push
   `plan.md` with the goal. State → `planning`.
2. **(planner)** *Produce plan.* Returns 3–7 ordered steps as
   `plan` on pop.
3. **(strategy)** *Absorb plan.* Write `## Plan` body to
   `./scoped/plan.md`. State → `ready`.
4. **(strategy, repeated)** *Dispatch step.* If cursor < #steps,
   read the cursor-th step from `./scoped/plan.md`, build a
   short context digest from the tail of `./scoped/results.md`,
   push `execute-step.md`. State → `executing`.
5. **(executor)** *Execute or recursively replan.* Either:
   - Perform the step using the toolset (bash, write, web), log
     a summary to `./scoped/attempt.md`, then self-check and
     return either `acceptable` or `needs_replan`; or
   - Recognize the step as too broad, push `plan.md` to
     decompose it, absorb the returned sub-plan into
     `./scoped/attempt.md`, and return `needs_replan` so the
     strategy will re-plan with the sub-steps as concrete leaves.
6. **(strategy)** *Route after step.*
   - `success` → surgically append the output to
     `./scoped/results.md` as `- R<N>: …`, advance the cursor,
     state → `ready` (loop to step 4).
   - `needs_replan` → log a `[REPLAN-TRIGGER from S<N>]` note in
     `./scoped/results.md` (without advancing the cursor), push
     `plan.md` again with the updated `results_so_far`. State →
     `planning` (loop back to step 2).
   - malformed → log a non-blocking `## Pending Questions` item,
     advance the cursor anyway. The loop must keep moving.
7. **(strategy)** *Ready to synthesise.* When cursor reaches
   #steps, push `synthesize.md` with the full results log.
   State → `synthesising`.
8. **(synthesizer)** *Produce report.* Returns the report on pop.
9. **(strategy)** *Finish.* State → `done`. Shell halts.

## Where things live

- `./scoped/plan.md` (strategy frame) — the current plan.
  Wholesale rewritten on each `Absorb plan` (initial plan or
  replan).
- `./scoped/cursor.md` — integer index of the step currently
  executing. Wholesale overwritten on each advance.
- `./scoped/results.md` — append-only log of step results
  (`- R<N>: …`) and replan triggers (`- R<N>: [REPLAN-TRIGGER
  from S<M>] …`). **Surgical `echo >>` only** — wholesale
  rewriting it would discard the execution history.
- `./scoped/attempt.md` (executor frame) — short prose summary
  of what the executor did or what sub-plan was absorbed.
- `workspace/` — actual project artefacts written by the executor
  via the Bash / Write tools. This is the shared mutable surface
  across all execution.

## Dynamics in this interpreter

| File | Receives (push-args) | Returns | Stack depth from caller |
| --- | --- | --- | --- |
| `dynamics/plan.md` | `goal`, `results_so_far` (optional) | `plan` | leaf |
| `dynamics/execute-step.md` | `current_step`, `context` | `outcome` (= `status` + `output`) | 1 (2 when the executor recursively pushes `plan.md`) |
| `dynamics/synthesize.md` | `results` | `report` | leaf |

The three files are byte-identical across this leaf,
`../b-orchestrator-workers/`, and `../c-deep-research/`, pinned
by an identity test under `src/test/`.

## Demo `PROGRAM.md`

Minimal TypeScript Node.js project setup (tsconfig, test, CI).
The first plan typically under-specifies one of the steps,
triggering a `needs_replan` return — so this demo exercises the
recursive sub-planning path.

## Run it

```bash
./new-instance.sh my-a interpreters/2-planning-decomposition/a-plan-execute
instances/my-a/run.sh
```

## Notable behaviour

- **No iteration cap on replans.** Convergence is the model's
  judgement — if every replan keeps decomposing further, the
  loop will keep going. In practice replans converge within 1–2
  rounds because the plan rule asks for 3–7 sibling-uniform
  steps.
- **Malformed step returns are non-blocking.** If the executor
  returns a status that's neither `success` nor `needs_replan`,
  the strategy logs a `## Pending Questions` item and advances
  the cursor anyway, so the loop keeps making progress.
- **Stack depth is at most 2.** The recursive sub-plan path is
  `strategy → execute-step → plan`; once that plan pops, the
  executor returns `needs_replan` and the next plan happens at
  depth 1 again.
