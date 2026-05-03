# c-deep-research

*Deep Research (product pattern — OpenAI Deep Research,
Anthropic Research, Perplexity Pro; academically close to
Self-Ask — Press et al., arXiv:2210.03350). See
`docs/agent-workflows/patterns.md` §Group 2.*

## What's modeled

A research question gets decomposed into sub-questions; each
sub-question is investigated; if a sub-question is itself too
broad to investigate in one go, it gets *recursively*
decomposed before being investigated; finally everything is
aggregated into a structured report. Under the current
sequential shell, the recursion shows up as a tree of `tackle.md`
frames, with the root tackle covering the whole PROGRAM and each
internal node covering one sub-question.

The Deep Research framing is what justifies the recursive
sub-tackling that's optional in the other two leaves of this
group: here it's expected on most goals.

## Collapsed framings

The shared strategy under
`interpreters/2-planning-decomposition/` subsumes four published
patterns; see `../README.md` for the rationale.

| Framing                 | Source                                                                           |
| ----------------------- | -------------------------------------------------------------------------------- |
| Plan-and-Execute        | Wang et al., 2023 — "Plan-and-Solve", arXiv:2305.04091. See `../a-plan-execute/`. |
| Orchestrator–Workers    | Anthropic, 2024 — "Building Effective Agents". See `../b-orchestrator-workers/`. |
| Deep Research           | Product pattern; Self-Ask — Press et al., arXiv:2210.03350. **(this leaf)**      |
| XAgent                  | OpenBMB / Tsinghua, tech report 2023. *(no dedicated leaf — prompting-level variant.)* |

## Three orchestrators, three context types

| Driver | When it's active | What it can see | What it produces |
| --- | --- | --- | --- |
| **Strategy** (`f000-strategy`) | Just at startup and the very end | The user program | One push of `tackle.md` with the goal; on pop, halt |
| **Tackle** (`fNNN-tackle`) | Once per goal at every recursion level | Only `goal` handed in via push-args; on the composite path also the spliced `## Plan` and per-child `## Result` | A `result` (atomic case — single tool call done) or a synthesized `result` over its sub-tackles |
| **Plan** (`fNNN-plan`) | Once per composite goal | Only `goal` handed in via push-args | A `plan` (3–7 sub-goal bullets) |

A new context is created on every push and destroyed on the
matching pop. Each tackle level only ever sees its own goal +
its own children's results. Sibling sub-tackles never see each
other's working state — only their parent does, through its
accumulating `./scoped/sub-results.md`.

## Recursion — how deep does it go on this demo

For a 4-dimension × 3-algorithm research question, a typical
recursion tree looks like:

```
strategy
└── tackle(PROGRAM = "compare A,B,C across X,Y,Z,W")
    ├── plan → [X, Y, Z, W, synthesis]   (5 sub-goals)
    ├── tackle(X = "leader election across A,B,C")
    │   ├── plan → [A on X, B on X, C on X, compare]   (4 sub-goals)
    │   ├── tackle("research A on X")  ← atomic: 1 web fetch / 1 write
    │   ├── tackle("research B on X")  ← atomic
    │   ├── tackle("research C on X")  ← atomic
    │   └── tackle("compare A/B/C on X") ← atomic synthesis or further recursion
    ├── tackle(Y = …)  ← analogous
    ├── tackle(Z = …)
    ├── tackle(W = …)
    └── tackle("write final report") ← atomic write to workspace/report.md
```

Peak stack depth on this demo: 1 strategy + 3 nested tackles + 1
plan = **5 frames simultaneously** when a planner runs at the
deepest tackle. You can verify by inspecting `.call-stack.json`
mid-run.

The recursion bottoms out wherever a tackle's Try judges its
goal "atomic" (achievable in a single tool call). Each level of
recursion is structurally identical — same `tackle.md`
instructions; only the input goal differs.

## How a single-level tackle works

Same as the other two leaves of this group (the dynamics are
byte-equal). For a composite tackle:

1. **Try** — assess the goal: single tool call possible? If yes,
   execute and pop with `result`. If no, push `plan.md`.
2. **Iterate** — receive the planner's bullets, write to
   `./scoped/sub-goals.md`, push `tackle.md` for the first
   sub-goal.
3. **Continue** — append each returned child `result`, advance
   cursor, push `tackle.md` for the next sub-goal.
4. **Synthesize** — when all children are done, consolidate
   their results into a final answer. If the goal mentioned an
   output file (e.g. `workspace/report.md`), write it as part
   of synthesis. Pop with `result`.

For an atomic tackle, only step 1 runs.

## Where things live

- `./scoped/sub-goals.md` (composite tackles) — the planner's
  list of sub-goals at this level.
- `./scoped/cursor.md` — index into sub-goals.
- `./scoped/sub-results.md` — accumulating sub-results,
  **surgical append only**.
- `./scoped/result.md` — synthesized final result before pop.
- `workspace/report.md` (typically) — the final structured
  report, written by the root-level Synthesize step.

## Dynamics in this interpreter

| File | Receives (push-args) | Returns | Stack depth from caller |
| --- | --- | --- | --- |
| `operators/tackle.md` | `goal` | `result` | recursive — composite pushes `plan.md` momentarily, then `tackle.md` per sub-goal |
| `operators/plan.md` | `goal` | `plan` | leaf — pure one-shot decomposer |

Both files are byte-identical across this leaf,
`../a-plan-execute/`, and `../b-orchestrator-workers/`, pinned
by an identity test under `src/test/`. Recursion is not a
runtime mode of one specific dynamic — it's the natural
consequence of `tackle.md` pushing itself for each composite
sub-goal.

## Demo `PROGRAM.md`

"Compare trade-offs among Raft, Paxos, and Multi-Paxos" — open
research question covering 4 dimensions (leader election, log
replication, fault tolerance, implementation complexity).
Final report written to `./workspace/report.md`. Web tools
(`web_search` / `web_fetch` under non-CC providers; CC's native
`WebSearch` / `WebFetch` under Claude Code) are available for
grounding.

## Run it

```bash
./new-instance.sh my-c interpreters/2-planning-decomposition/c-deep-research
instances/my-c/run.sh
```

## Notable behaviour

- **Recursion is the distinguishing feature.** Every other leaf
  of this group can run flat; this one is expected to nest
  multiple levels deep on most goals.
- **Each level's planner sees only its parent's goal.** The
  planner at depth 3 doesn't know anything about its
  great-grandparent's other branches — it just decomposes the
  one sub-goal it received. This is what prevents the
  dimension-drop failure mode the previous architecture had:
  no level ever has to "preserve" sibling steps because no
  level sees its siblings.
- **No iteration cap on recursion depth.** Convergence happens
  when every leaf is atomic. In practice 2–3 levels suffice for
  this demo.
- **Report quality depends on the provider** and on whether the
  atomic tackle frames actually use web tools (vs. answering
  from training data).
