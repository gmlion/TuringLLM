# c-deep-research

*Deep Research (product pattern — OpenAI Deep Research,
Anthropic Research, Perplexity Pro; academically close to
Self-Ask — Press et al., arXiv:2210.03350). See
`docs/agent-workflows/patterns.md` §Group 2.*

This leaf demonstrates the **Deep Research** framing: decompose a
research question into sub-questions, investigate each
(recursively if a sub-question is still too broad), and aggregate
the findings into a structured report. Under the current
sequential shell, the recursion shows up as stack depth 2 —
`execute-step.md` re-pushes `plan.md` within its own frame when
the step it is executing reads as a research area rather than a
single executable action.

## Collapsed framings

See `../README.md` for the full collapse rationale. The shared
strategy at this group level subsumes:

| Framing                 | Source                                                                           |
| ----------------------- | -------------------------------------------------------------------------------- |
| Plan-and-Execute        | Wang et al., 2023 — "Plan-and-Solve", arXiv:2305.04091. See `../a-plan-execute/`. |
| Orchestrator–Workers    | Anthropic, 2024 — "Building Effective Agents". See `../b-orchestrator-workers/`. |
| Deep Research           | Product pattern; Self-Ask — Press et al., arXiv:2210.03350. **(this leaf)**      |
| XAgent                  | OpenBMB / Tsinghua, tech report 2023. *(no dedicated leaf — prompting-level variant.)* |

## State machine

Identical to `../a-plan-execute/README.md`'s diagram. INSTRUCTIONS,
`plan.md`, `execute-step.md`, `synthesize.md` are byte-equal
across the three leaves. Recursion is a *runtime* behaviour of
`execute-step.md`, not a structural difference in the strategy.

## Dynamics

Same as `../a-plan-execute/`. Stack depth reaches 2 when
`execute-step.md` decides the current step is too coarse and
re-pushes `plan.md` to decompose it. See
`src/test/phase-3-deep-research.test.ts` for the depth-2
invariant.

## Demo `PROGRAM.md`

"Compare trade-offs among Raft, Paxos, and Multi-Paxos" — open
research question, final report written to
`./workspace/report.md`. Web tools (`web_search` / `web_fetch`
under non-CC providers; CC's native `WebSearch` / `WebFetch`
under Claude Code) are available for grounding.

## Run it

```bash
./new-instance.sh my-c interpreters/2-planning-decomposition/c-deep-research
instances/my-c/run.sh
```

## Known behaviour

- Live run's stack-depth-2 invariant depends on the LLM choosing
  to recurse on broad steps; this is exercised both by the
  scripted integration test and by the shape of the Raft /
  Paxos / Multi-Paxos question in PROGRAM.md.
- Final artefact at `./workspace/report.md`; quality depends on
  the provider and on web-tool availability.
