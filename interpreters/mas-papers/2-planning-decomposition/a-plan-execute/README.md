# a-plan-execute

*Plan-and-Execute (Wang et al., 2023 — "Plan-and-Solve",
arXiv:2305.04091). See `docs/agent-workflows/patterns.md` §Group 2.*

## What's modeled

A planner-then-executor split, recursive. Given a goal, an agent
decides whether the goal is small enough to do with one tool call;
if yes, it just does it; if no, it asks a planner to break the
goal into 3–7 sub-goals and then tackles each sub-goal the same
way (recursively). When all sub-goals are done, the agent
synthesizes the sub-results into a final answer.

The recursion is the architecture: the same dynamic (`tackle.md`)
handles the goal at every level. The planner (`plan.md`) is a
one-shot decomposer with no internal state and no iteration. The
strategy is a thin shim that just hands the user goal to
`tackle.md` and waits.

## Collapsed framings

The shared strategy under
`interpreters/mas-papers/2-planning-decomposition/` subsumes four published
patterns (all of which reduce to the same state machine under the
current sequential shell — see `patterns.md` Group 2 for the
rationale):

| Framing                 | Source                                                                           |
| ----------------------- | -------------------------------------------------------------------------------- |
| Plan-and-Execute        | Wang et al., 2023 — "Plan-and-Solve", arXiv:2305.04091. **(this interpreter)**   |
| Orchestrator–Workers    | Anthropic, 2024 — "Building Effective Agents". See `../b-orchestrator-workers/`. |
| Deep Research           | Product pattern; academically Self-Ask — Press et al., arXiv:2210.03350. See `../c-deep-research/`. |
| XAgent                  | OpenBMB / Tsinghua, tech report 2023. *(no dedicated interpreter — prompting-level variant.)* |

Each interpreter ships a different `PROGRAM.md` to elicit the
framing's characteristic execution trace; the strategy and dynamics
are byte-equal across the three.

## Three orchestrators, three context types

| Driver | When it's active | What it can see | What it produces |
| --- | --- | --- | --- |
| **Strategy** (`f000-strategy`) | Just at startup and just at the very end | The user program (`PROGRAM.md`) | One push of `tackle.md` with the goal, then on pop, halt |
| **Tackle** (`fNNN-tackle`) | Once per goal at every recursion level | Only `goal` handed in via push-args; on the composite path also the spliced `## Plan` from its child planner and the spliced `## Result` from each child tackle | Either an immediate `result` (atomic case — one tool call done), or after orchestrating sub-tackles, a synthesized `result` |
| **Plan** (`fNNN-plan`) | Once per composite goal | Only `goal` handed in via push-args | A `plan` (3–7 sub-goal bullets), and that's it — no iteration, no synthesis |

A new context is created on every push and destroyed on the
matching pop. **Sibling tackle contexts never see each other's
working state** — only the parent tackle stitches them together
through its accumulating `./scoped/sub-results.md`.

The recursion bottoms out when a tackle's `Try` instruction
judges the goal atomic and executes a single tool call directly.
For a goal whose natural decomposition tree is k deep, the
peak stack is `1 (strategy) + 1 + 2k (tackle/plan pairs)`
frames.

## How a single-level tackle works

A composite tackle is 4 sub-instructions executed across roughly
`(1 + 2 + N + 1)` cycles where N is the number of sub-goals (one
push, one absorb-plan, one continue per sub-goal except the last,
one final synthesize):

1. **Try** (state=empty). Read the goal. Assess: does this need
   exactly one tool call, or more? If one, perform it now and
   pop with `result`. If more, push `plan.md` with the goal and
   park at `decomposing`.
2. **Iterate** (state=decomposing_completed, `## Plan` present).
   Write the planner's bullet list to
   `./scoped/sub-goals.md`, init cursor to 0, push `tackle.md`
   for the first sub-goal. State → `iterating`.
3. **Continue** (state=iterating_completed AND `## Result`
   present AND cursor < N-1). The just-popped sub-tackle gave us
   one sub-result; append it to `./scoped/sub-results.md`,
   advance the cursor, push `tackle.md` for the next sub-goal.
   Loop.
4. **Synthesize** (state=iterating_completed AND `## Result`
   present AND cursor == N-1). The last sub-result has just
   come back. Append it, then read all sub-results +
   sub-goals and produce a synthesized final result. If the
   original goal mentioned a specific output file (e.g.
   `workspace/report.md`), write it as part of synthesis. Pop
   with `result`.

The atomic Try path is just steps 1: one tool call, one pop.

## Where things live

- `./scoped/sub-goals.md` (composite tackle frames only) — the
  planner's bullet list, wholesale-written in Iterate.
- `./scoped/cursor.md` — integer index of the sub-goal currently
  being tackled.
- `./scoped/sub-results.md` — accumulating sub-results,
  **surgical append only** (`echo >>` / heredoc-append).
  Wholesale rewriting it would lose prior children's results.
- `./scoped/result.md` — the synthesized final result before pop
  (composite case only); written wholesale by Synthesize.
- `workspace/` — actual project artefacts written by atomic
  tackle frames via the Bash / Write tools. This is the shared
  mutable surface across all execution.

## Dynamics in this interpreter

| File | Receives (push-args) | Returns | Stack depth from caller |
| --- | --- | --- | --- |
| `operators/tackle.md` | `goal` | `result` | 1 (atomic Try); recursive (composite path pushes `plan.md` momentarily, then pushes `tackle.md` per sub-goal) |
| `operators/plan.md` | `goal` | `plan` | no further push — pure one-shot decomposer |

Both files are byte-identical across this interpreter,
`../b-orchestrator-workers/`, and `../c-deep-research/`, pinned
by an identity test under `src/test/`.

## Demo `PROGRAM.md`

Minimal TypeScript Node.js project setup (tsconfig, test, CI).
Exercises the recursive path: the root `tackle.md` will judge
the project setup composite, push `plan.md`, then iterate sub-
tackles; some sub-goals will be atomic (write a single config
file), others may further decompose (set up CI = workflow file +
script + secrets reference).

## Run it

```bash
./new-instance.sh interpreters/mas-papers/2-planning-decomposition/a-plan-execute my-a
instances/my-a/run.sh
```

## Notable behaviour

- **The atomic-vs-composite decision is adversarial.** Each
  tackle's Try makes the call based on its own assessment of
  what one tool call could accomplish, not on a planner's
  pre-classification. This avoids the planner's structural bias
  toward decomposition.
- **No iteration cap on recursion depth.** Convergence happens
  when every leaf is atomic. In practice, 1–3 levels suffice for
  reasonable goals.
- **Sibling preservation is automatic.** Because each tackle
  frame works on its own goal in isolation, it never needs to
  re-plan or remember its caller's other sub-goals — those are
  the parent's bookkeeping, in `./scoped/sub-goals.md` of the
  parent frame.

## Layout note

`INSTRUCTIONS.md` is a single-line marker pointing at the canonical operator file `operators/plan-execute.md`. The strategy body lives in the canonical operator. This pattern lets the same operator be invoked standalone (via `.root-operator` bootstrap) AND as a library operator inside meta-frameworks like `aflow-lite`.

For this interpreter the canonical operator is `operators/plan-execute.md`.
