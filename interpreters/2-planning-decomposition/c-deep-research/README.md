# c-deep-research

*Deep Research (product pattern — OpenAI Deep Research,
Anthropic Research, Perplexity Pro; academically close to
Self-Ask — Press et al., arXiv:2210.03350). See
`docs/agent-workflows/patterns.md` §Group 2.*

## What's modeled

A research question gets decomposed into sub-questions; each
sub-question is investigated; if a sub-question is itself too
broad, it gets *recursively* decomposed before being
investigated; finally everything is aggregated into a structured
report. Under the current sequential shell, the recursion shows
up as **stack depth 2** — the executor handling a sub-question
re-pushes the planner within its own frame to break the
sub-question into concrete leaves.

The Deep Research framing is what justifies the recursive
sub-planning path that's optional in the other two leaves of
this group: here it's expected.

## Collapsed framings

The shared strategy under
`interpreters/2-planning-decomposition/` subsumes four published
patterns (all of which reduce to the same state machine under the
current sequential shell — see `../README.md` for the rationale):

| Framing                 | Source                                                                           |
| ----------------------- | -------------------------------------------------------------------------------- |
| Plan-and-Execute        | Wang et al., 2023 — "Plan-and-Solve", arXiv:2305.04091. See `../a-plan-execute/`. |
| Orchestrator–Workers    | Anthropic, 2024 — "Building Effective Agents". See `../b-orchestrator-workers/`. |
| Deep Research           | Product pattern; Self-Ask — Press et al., arXiv:2210.03350. **(this leaf)**      |
| XAgent                  | OpenBMB / Tsinghua, tech report 2023. *(no dedicated leaf — prompting-level variant.)* |

Each leaf ships a different `PROGRAM.md` to elicit the framing's
characteristic trace.

## Four orchestrators, four contexts (with recursion)

| Driver | When it's active | What it can see | What it produces |
| --- | --- | --- | --- |
| **Strategy** (`f000-strategy`) | Initial plan request, after each pop, between sub-question dispatches | Its own MEMORY, the plan at `./scoped/plan.md`, the cursor at `./scoped/cursor.md`, the accumulating findings at `./scoped/results.md`, the user program | A push (request a plan, dispatch a sub-question, request synthesis), or `done` |
| **Planner** (`fNNN-plan`) | One planning pass (initial or recursive) | Only `goal` and `results_so_far` handed in via push-args. **Recursive planners are pushed by the executor, not the strategy** — those still see only their immediate goal (the broad sub-question) and an empty `results_so_far` | An ordered list of sub-questions as `plan` |
| **Executor** (`fNNN-execute-step`) | One sub-question | `current_step` and `context` handed in via push-args; can use the toolset including web search; **may decide its assigned sub-question is too broad and push `plan.md` recursively** | Either an `outcome` (`status: success | needs_replan` + `output`), or — if it recursively planned — an absorbed sub-plan returned via `outcome.status: needs_replan` |
| **Synthesizer** (`fNNN-synthesize`) | One synthesis pass at the end | The full `results` log handed in via push-args | A final `report`, also written to `workspace/report.md` |

The recursive case creates a **stack depth of 2**: `strategy →
execute-step → plan`. While the recursive planner runs, three
frames are alive simultaneously. You can verify by inspecting
`.call-stack.json` mid-run.

The executor that triggered the recursion does NOT execute the
sub-questions itself. It absorbs the returned sub-plan into its
own `./scoped/attempt.md` and returns `needs_replan` to the
strategy; the strategy then re-runs `plan.md` at depth 1, which
sees the absorbed sub-plan via `results_so_far` and produces a
new plan with the sub-questions promoted to top-level leaves.
This is how the recursion converges: each recursive replan
replaces one broad step with its narrower siblings until every
leaf is concrete enough that the executor performs the work
instead of decomposing.

## How a run works

The base loop is the same as the other two leaves; the
distinguishing event is recursive decomposition:

1. **(strategy)** *Initialize.* Push `plan.md` with the broad
   research question.
2. **(planner, depth 1)** *Produce plan.* Returns 3–7
   sub-questions on pop.
3. **(strategy)** *Absorb plan.* Write to `./scoped/plan.md`.
4. **(strategy)** *Dispatch sub-question.* Push
   `execute-step.md` with the cursor's sub-question as
   `current_step`.
5. **(executor, depth 1)** Decides: investigate directly, OR
   the sub-question is itself too broad → push `plan.md` again
   to break it down (depth 2).
6. **(planner, depth 2 — only when recursing)** *Produce
   sub-plan.* Returns concrete sub-sub-questions.
7. **(executor, depth 1)** Absorbs the sub-plan into
   `./scoped/attempt.md`. Returns `needs_replan` so the strategy
   will re-plan with the sub-sub-questions visible.
8. **(strategy)** *Route after step (needs_replan).* Logs a
   `[REPLAN-TRIGGER from S<N>]` note in `./scoped/results.md`,
   pushes `plan.md` again — the next plan will replace the
   broad sub-question with its concrete sub-leaves, in the same
   cursor position.
9. **Loop** until the cursor reaches `#steps` with every step
   having returned `success`.
10. **(synthesizer)** Reads the full findings log and writes a
    structured report (typically to `workspace/report.md`).

## Where things live

- `./scoped/plan.md` (strategy frame) — the current plan.
  Wholesale rewritten on each replan, including replans
  triggered by recursive decomposition.
- `./scoped/cursor.md` — integer index of the sub-question
  currently being investigated. **Preserved across replans** —
  the new plan replaces the broad step at the cursor's position
  with its concrete sub-leaves, so iteration resumes from the
  same index against the new plan.
- `./scoped/results.md` — append-only log of completed findings
  (`- R<N>: …`) and replan triggers
  (`- R<N>: [REPLAN-TRIGGER from S<M>] …`). **Surgical `echo >>`
  only.**
- `./scoped/attempt.md` (executor frame) — short prose summary
  of what the executor did, or the absorbed sub-plan if
  recursion happened.
- `workspace/report.md` — the final report.

## Dynamics in this interpreter

| File | Receives (push-args) | Returns | Stack depth from caller |
| --- | --- | --- | --- |
| `dynamics/plan.md` | `goal`, `results_so_far` (optional) | `plan` | leaf — but reachable at both depth 1 (strategy push) and depth 2 (executor push) |
| `dynamics/execute-step.md` | `current_step`, `context` | `outcome` | 1 (2 when the executor pushes `plan.md`) |
| `dynamics/synthesize.md` | `results` | `report` | leaf |

The three files are byte-identical across this leaf,
`../a-plan-execute/`, and `../b-orchestrator-workers/`, pinned
by an identity test under `src/test/`. Recursion is a *runtime*
behaviour of `execute-step.md` driven by the breadth of its
assigned step, not a structural difference in the strategy.

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

## Notable behaviour

- **Stack depth 2 is the distinguishing feature.** Mid-run you
  can `cat .call-stack.json` to see three frames active during
  recursive decomposition. The depth-2 invariant is exercised
  by the scripted integration test and by the breadth of the
  Raft/Paxos question.
- **The cursor doesn't advance on `needs_replan`.** A broad
  step gets replaced by its concrete sub-leaves at the same
  cursor position, so iteration continues from the same index
  against the new plan.
- **No iteration cap on replans.** Convergence is the model's
  judgement — in practice 1–3 recursive replans suffice for
  this demo.
- **Report quality depends on the provider** and on web-tool
  availability.

## Known failure mode: dimension drop on recursive replan

When the PROGRAM goal names multiple parallel dimensions ("compare
A, B, C across X, Y, Z, W"), this pattern can converge on covering
*one* dimension in depth and silently dropping the others. The
failure was observed empirically on the bundled Raft/Paxos/
Multi-Paxos demo with Haiku 4.5: a 56-cycle, 28-minute run
produced a 16 KB report covering only **leader election** (1 of
the 4 PROGRAM dimensions), with the other three reduced to a
one-row appendix table.

**Trace (from `instances/dr/scoped/results.md`):**

1. Initial plan (cycle 2): correctly emits 5 top-level steps,
   one per dimension plus a synthesis step.
2. Cycle ~5: executor on S1 ("leader election") returns
   `needs_replan` with a sub-decomposition into raft / paxos /
   multi-paxos / compare. Strategy logs `[REPLAN-TRIGGER from
   S1]` and re-pushes `plan.md`.
3. **The new plan replaces S1 with the 4 sub-steps but ALSO
   drops S2/S3/S4** — the planner LLM ignores `plan.md`'s
   instruction to "preserve not-yet-attempted siblings as-is".
4. Iteration proceeds through the leader-election sub-steps.
   Each subsequent "compare" / "synthesize" sub-step also
   triggers another replan that again drops the (still missing)
   sibling dimensions.
5. By cycle 49 the planner finally produces a plan that
   mentions log replication / fault tolerance / implementation
   complexity — but the cursor has already advanced to
   `len(plan)` from intermediate plan-shrinking, so "Ready to
   synthesise" fires immediately. The synthesizer receives
   only leader-election results and writes a leader-election-
   only report.

**Three contributing root causes:**

1. **`plan.md` doesn't reliably preserve sibling top-level
   steps across replans.** The instruction tells the planner to
   keep them; the planner LLM often drops them. (The same
   `plan.md` file is shared with `a-plan-execute` and
   `b-orchestrator-workers` — which don't expose the bug
   because their demos don't trigger recursive replans.)
2. **The cursor advances faster than the plan shrinks.** When a
   replan reduces plan length from N to M < N, the cursor
   isn't clipped — so over time it can pass the new
   `len(plan)` and trigger synthesis prematurely.
3. **No coverage check before synthesis.** "Ready to synthesise"
   fires purely on `cursor == len(plan)`, with no validation
   that `results_so_far` actually mentions every dimension
   named in the original PROGRAM goal.

**Mitigations (none currently implemented — these would be a
follow-up):**

- The strategy could pass `original_dimensions` (parsed from
  PROGRAM) as a separate push-arg to `plan.md`, and `plan.md`
  could be required to emit at least one step for every
  dimension not yet covered in `results_so_far`.
- The strategy could insert a pre-synthesis validation
  instruction that refuses to push `synthesize.md` until each
  declared dimension has at least one corresponding `R<N>:`
  entry in the results log; on validation failure, force a
  final replan.

**Empirical evidence:** see
`benchmarks/deep-research-single-prompt/COMPARISON.md` for the
detailed comparison against a single-prompt Haiku call (which
also failed to satisfy the spec, in a different way), and
`benchmarks/deep-research-single-prompt-sonnet/COMPARISON.md`
for the three-way comparison showing that a single-prompt
**Sonnet** call produces a 24 KB four-dimension report in 5
minutes for $1.10 — outperforming the multi-cycle Haiku
interpreter on every quality axis at a fraction of the cost.
