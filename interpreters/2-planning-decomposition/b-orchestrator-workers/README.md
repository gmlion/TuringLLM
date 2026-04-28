# b-orchestrator-workers

*Orchestrator–Workers (Anthropic, 2024 — "Building Effective Agents").
See `docs/agent-workflows/patterns.md` §Group 2.*

This leaf demonstrates the **Orchestrator–Workers** framing: a
central LLM dynamically decomposes the task, delegates each
subtask to a worker, and synthesises results. Under the current
sequential shell, fan-out to generic workers is indistinguishable
from Plan-and-Execute's single-executor iteration; the demo here
makes the decomposition explicit by giving the orchestrator five
pre-shipped input files to process.

## Collapsed framings

See `../README.md` for the full collapse rationale. The shared
strategy at this group level subsumes:

| Framing                 | Source                                                                           |
| ----------------------- | -------------------------------------------------------------------------------- |
| Plan-and-Execute        | Wang et al., 2023 — "Plan-and-Solve", arXiv:2305.04091. See `../a-plan-execute/`. |
| Orchestrator–Workers    | Anthropic, 2024 — "Building Effective Agents". **(this leaf)**                   |
| Deep Research           | Product pattern; Self-Ask — Press et al., arXiv:2210.03350. See `../c-deep-research/`. |
| XAgent                  | OpenBMB / Tsinghua, tech report 2023. *(no dedicated leaf — prompting-level variant.)* |

## State machine

Identical to `../a-plan-execute/README.md`'s diagram. INSTRUCTIONS,
`plan.md`, `execute-step.md`, `synthesize.md` are byte-equal
across the three leaves (pinned by
`src/test/phase-3-dynamics-identity.test.ts`).

## Demo `PROGRAM.md`

Summarise each of the five technical notes in
`./workspace/inputs/input-{1..5}.md` (CAP theorem, eventual
consistency, Paxos, sharding, replication) and produce a unified
synthesis. The plan typically has one step per input file,
exercising exactly five `execute-step.md` pushes — the
orchestrator-workers fan-out under sequential execution.

## Run it

```bash
./new-instance.sh my-b interpreters/2-planning-decomposition/b-orchestrator-workers
instances/my-b/run.sh
```

## Known behaviour

- Plan contains exactly 5 top-level steps, one per input file.
  Validated in `src/test/phase-3-orchestrator-workers.test.ts`.
- Under an LLM that chooses a different plan shape, the test's
  "exactly 5 pushes" invariant is the quality gate.
