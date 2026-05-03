# b-orchestrator-workers

*Orchestrator–Workers (Anthropic, 2024 — "Building Effective
Agents"). See `docs/agent-workflows/patterns.md` §Group 2.*

## What's modeled

A central agent decomposes a task into N independent subtasks
and dispatches each to a worker. The workers act in isolation;
the orchestrator collects their results and synthesizes a
unified answer. Under the current sequential shell the
orchestrator dispatches workers one at a time rather than in
parallel — but the *structural* property (the orchestrator
decides decomposition; each worker sees only its assigned
subtask) is preserved. The bundled demo gives the orchestrator
five pre-shipped input files to summarize, so the fan-out is
visible (one worker per file).

In this interpreter, **the orchestrator and worker are both
instances of `tackle.md`** — the orchestrator is the root tackle
frame on the user goal, and each worker is a recursive tackle
frame on one of the sub-goals the planner returned. Same
dynamic; recursion replaces an explicit orchestrator/worker
distinction.

## Collapsed framings

The shared strategy under
`interpreters/2-planning-decomposition/` subsumes four published
patterns; see `../README.md` for the rationale. Each leaf ships
a different `PROGRAM.md` to elicit the framing's characteristic
trace.

| Framing                 | Source                                                                           |
| ----------------------- | -------------------------------------------------------------------------------- |
| Plan-and-Execute        | Wang et al., 2023 — "Plan-and-Solve", arXiv:2305.04091. See `../a-plan-execute/`. |
| Orchestrator–Workers    | Anthropic, 2024 — "Building Effective Agents". **(this leaf)**                   |
| Deep Research           | Product pattern; Self-Ask — Press et al., arXiv:2210.03350. See `../c-deep-research/`. |
| XAgent                  | OpenBMB / Tsinghua, tech report 2023. *(no dedicated leaf — prompting-level variant.)* |

## Three orchestrators, three context types

| Driver | When it's active | What it can see | What it produces |
| --- | --- | --- | --- |
| **Strategy** (`f000-strategy`) | Just at startup and the very end | The user program | One push of `tackle.md` with the goal, then on pop, halt |
| **Tackle** (`fNNN-tackle`) | Once per goal at every level. The root tackle plays the orchestrator role; each sub-tackle plays a worker | Only `goal` handed in via push-args; on the composite path also the spliced `## Plan` and per-child `## Result` | A `result` (atomic case) or a synthesized `result` over its sub-tackles (composite case) |
| **Plan** (`fNNN-plan`) | Once per composite goal | Only `goal` handed in via push-args | A `plan` (3–7 sub-goal bullets) |

A new context is created on every push and destroyed on the
matching pop. Worker tackles never see each other's working
state — the orchestrator (root tackle) stitches them together
through its accumulating `./scoped/sub-results.md`.

## How the orchestrator–worker fan-out runs

For the bundled demo (5 input files), peak stack depth is 3:
strategy → root tackle → worker tackle. Walk-through:

1. **(root tackle, Try)** Read goal: "summarize each of the 5
   input files". Single tool call? No — needs ≥5 reads + a
   synthesis. Push `plan.md`.
2. **(plan)** Returns 5 sub-goals: one per input file. Pop.
3. **(root tackle, Iterate)** Write the 5 bullets to
   `./scoped/sub-goals.md`, init cursor=0, push `tackle.md` for
   sub-goal 1 ("summarize input-1.md").
4. **(worker tackle 1, Try)** Read goal. Single tool call? Yes —
   one `bash cat input-1.md` plus the produced summary, or a
   single `Write` call to a summary file. Execute, pop with
   `result`.
5. **(root tackle, Continue)** Append worker 1's result to
   `./scoped/sub-results.md`, advance cursor, push tackle for
   sub-goal 2.
6. Loop steps 4–5 for inputs 2 through 4.
7. **(root tackle, Synthesize)** Append worker 5's result, then
   read all 5 sub-results and the original goal, produce a
   unified synthesis (write `workspace/synthesis.md` if
   appropriate), pop with the synthesis as `result`.
8. **(strategy, Finish)** State → done. Halt.

## Where things live

- `./scoped/sub-goals.md` (root tackle frame) — the planner's
  list of 5 worker assignments.
- `./scoped/cursor.md` — current worker index.
- `./scoped/sub-results.md` — accumulating worker outputs,
  **surgical append only**.
- `./scoped/result.md` — the synthesized final result.
- `workspace/inputs/input-{1..5}.md` — pre-shipped input files
  the workers consume (specific to this demo).
- `workspace/<other artefacts>` — anything workers write via
  Bash / Write.

## Dynamics in this interpreter

| File | Receives (push-args) | Returns | Stack depth from caller |
| --- | --- | --- | --- |
| `operators/tackle.md` | `goal` | `result` | 1 (atomic Try); recursive (composite pushes `plan.md` then `tackle.md` per sub-goal) |
| `operators/plan.md` | `goal` | `plan` | leaf |

Both files are byte-identical across this leaf,
`../a-plan-execute/`, and `../c-deep-research/`, pinned by an
identity test under `src/test/`.

## Demo `PROGRAM.md`

Summarise each of the five technical notes in
`./workspace/inputs/input-{1..5}.md` (CAP theorem, eventual
consistency, Paxos, sharding, replication) and produce a unified
synthesis. The plan typically has one sub-goal per input file,
exercising exactly five worker tackles — the orchestrator-workers
fan-out under sequential execution.

## Run it

```bash
./new-instance.sh my-b interpreters/2-planning-decomposition/b-orchestrator-workers
instances/my-b/run.sh
```

## Notable behaviour

- **Plan typically has exactly 5 top-level sub-goals**, one per
  input file. Each worker tackle's Try should classify
  "summarize one file" as atomic.
- **No iteration cap.** Convergence happens when every leaf is
  atomic. The 5-summary fan-out converges in one level of
  recursion.
- **Workers are stateless across iterations.** Each worker
  tackle is a fresh frame; it can't see prior workers' outputs
  except through the orchestrator's synthesis at the end.
