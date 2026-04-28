# b-orchestrator-workers

*Orchestrator–Workers (Anthropic, 2024 — "Building Effective
Agents"). See `docs/agent-workflows/patterns.md` §Group 2.*

## What's modeled

A central orchestrator decomposes a task into N independent
subtasks and dispatches each to a worker. The workers act in
isolation; the orchestrator collects results and synthesizes a
unified answer. Under the current sequential shell the
orchestrator dispatches workers one at a time rather than in
parallel — but the *structural* property (the orchestrator
decides decomposition; each worker sees only its assigned
subtask) is preserved. The bundled demo gives the orchestrator
five pre-shipped input files to summarize, so the fan-out is
visible (one worker dispatch per file).

## Collapsed framings

The shared strategy under
`interpreters/2-planning-decomposition/` subsumes four published
patterns (all of which reduce to the same state machine under the
current sequential shell — see `../README.md` for the rationale):

| Framing                 | Source                                                                           |
| ----------------------- | -------------------------------------------------------------------------------- |
| Plan-and-Execute        | Wang et al., 2023 — "Plan-and-Solve", arXiv:2305.04091. See `../a-plan-execute/`. |
| Orchestrator–Workers    | Anthropic, 2024 — "Building Effective Agents". **(this leaf)**                   |
| Deep Research           | Product pattern; Self-Ask — Press et al., arXiv:2210.03350. See `../c-deep-research/`. |
| XAgent                  | OpenBMB / Tsinghua, tech report 2023. *(no dedicated leaf — prompting-level variant.)* |

Each leaf ships a different `PROGRAM.md` to elicit the framing's
characteristic trace.

## Four orchestrators, four contexts

| Driver | When it's active | What it can see | What it produces |
| --- | --- | --- | --- |
| **Strategy / orchestrator** (`f000-strategy`) | Initial plan request, after each pop, between dispatches | Its own MEMORY, the plan at `./scoped/plan.md`, the cursor at `./scoped/cursor.md`, the accumulating worker results at `./scoped/results.md`, the user program | A push (request a plan, dispatch a worker, request synthesis), or `done` |
| **Planner** (`fNNN-plan`) | One planning pass | Only `goal` and `results_so_far` handed in via push-args | An ordered list of subtasks as `plan` |
| **Worker** (`fNNN-execute-step`) | One subtask | `current_step` (the worker's assignment) and `context` (a short digest of prior workers' results) handed in via push-args; can use the full toolset and write to `workspace/` | An `outcome` (`status: success | needs_replan` + `output`), spliced to the orchestrator as `## Outcome` |
| **Synthesizer** (`fNNN-synthesize`) | One synthesis pass at the end | The full `results` log handed in via push-args | A final `report` |

A new context is created on every push and destroyed on the
matching pop. **Workers do not see the plan, do not see other
workers' contexts, and only get a brief digest of prior
results.** That structural ignorance is the whole point — workers
can't quietly merge or reorder subtasks because they don't know
what the others are.

## How a run works

1. **(orchestrator)** *Initialize.* Read PROGRAM.md, create
   empty `./scoped/results.md` and `./scoped/cursor.md = 0`,
   push `plan.md`. State → `planning`.
2. **(planner)** *Produce plan.* Returns the subtask list as
   `plan` on pop.
3. **(orchestrator)** *Absorb plan.* Write `## Plan` body to
   `./scoped/plan.md`. State → `ready`.
4. **(orchestrator, repeated)** *Dispatch worker.* For each
   subtask in the plan, push `execute-step.md` with the subtask
   as `current_step` and a digest of `./scoped/results.md` as
   `context`. State → `executing`.
5. **(worker)** *Execute subtask.* Perform the work using the
   toolset (bash, write, web). Self-check; return `acceptable`
   (→ `outcome.status = success`) or `needs_replan`.
6. **(orchestrator)** *Route after worker.*
   - `success` → append the worker's output to
     `./scoped/results.md`, advance the cursor, loop.
   - `needs_replan` → log a replan-trigger note and re-push
     `plan.md` (the plan can change mid-run if a worker reveals
     the decomposition was wrong).
7. **(orchestrator)** *Ready to synthesise.* When all subtasks
   are done, push `synthesize.md` with the full results log.
8. **(synthesizer)** *Produce report.* Returns the final report
   on pop.
9. **(orchestrator)** *Finish.* State → `done`. Shell halts.

## Where things live

- `./scoped/plan.md` (orchestrator frame) — the current
  decomposition. Wholesale rewritten on each `Absorb plan`.
- `./scoped/cursor.md` — integer index of the worker currently
  executing.
- `./scoped/results.md` — append-only log of worker outputs
  (`- R<N>: …`). **Surgical `echo >>` only.**
- `./scoped/attempt.md` (worker frame) — short prose summary of
  what the worker did.
- `workspace/` — actual artefacts written by workers via the
  Bash / Write tools.
- `workspace/inputs/input-{1..5}.md` — pre-shipped input files
  the orchestrator dispatches workers over (specific to this
  demo).

## Dynamics in this interpreter

| File | Receives (push-args) | Returns | Stack depth from caller |
| --- | --- | --- | --- |
| `dynamics/plan.md` | `goal`, `results_so_far` (optional) | `plan` | leaf |
| `dynamics/execute-step.md` | `current_step`, `context` | `outcome` | 1 (2 if a worker recursively pushes `plan.md`) |
| `dynamics/synthesize.md` | `results` | `report` | leaf |

The three files are byte-identical across this leaf,
`../a-plan-execute/`, and `../c-deep-research/`, pinned by an
identity test under `src/test/`.

## Demo `PROGRAM.md`

Summarise each of the five technical notes in
`./workspace/inputs/input-{1..5}.md` (CAP theorem, eventual
consistency, Paxos, sharding, replication) and produce a unified
synthesis. The plan typically has one subtask per input file,
exercising exactly five worker dispatches — the
orchestrator-workers fan-out under sequential execution.

## Run it

```bash
./new-instance.sh my-b interpreters/2-planning-decomposition/b-orchestrator-workers
instances/my-b/run.sh
```

## Notable behaviour

- **Plan typically has exactly 5 top-level subtasks**, one per
  input file. Validated in
  `src/test/phase-3-orchestrator-workers.test.ts`.
- Under an LLM that chooses a different plan shape, the test's
  "exactly 5 pushes" invariant is the quality gate for the
  orchestrator-workers framing.
- **No iteration cap on replans.** Convergence is the model's
  judgement.
