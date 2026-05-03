# Group 2 — Planning & decomposition

*See `docs/agent-workflows/patterns.md` §Group 2 for the
literature taxonomy.*

## What's modeled at the family level

Given a goal, an agent decides whether the goal is small enough
to do with one tool call; if yes, it just does it; if no, it
asks a planner to break the goal into 3–7 sub-goals and tackles
each sub-goal the same way (recursively). When all sub-goals are
done, the agent synthesizes the sub-results into a final answer.

The recursion is the architecture: **the same dynamic
(`tackle.md`) handles a goal at every level of the tree**. The
strategy frame is a thin shim that just hands the user's PROGRAM
to `tackle.md` and waits for the result. The planner (`plan.md`)
is a one-shot decomposer with no internal state and no
iteration responsibility.

## Why one strategy for four framings

Under sequential execution, four published patterns reduce to
the same recursive state machine. The differences between them
are in the demo PROGRAM and in how naturally the recursion
unfolds (depth 1 for orchestrator-workers; 2–3+ for deep
research) — not in the dynamics themselves. So this group ships
**one strategy** exposed through **three leaves**, each with a
different `PROGRAM.md` to elicit the distinguishing trace.

| Leaf                         | Framing                 | Source                                                                         |
| ---------------------------- | ----------------------- | ------------------------------------------------------------------------------ |
| [`a-plan-execute/`](./a-plan-execute/)            | Plan-and-Execute        | Wang et al., 2023 — "Plan-and-Solve", arXiv:2305.04091.                        |
| [`b-orchestrator-workers/`](./b-orchestrator-workers/)    | Orchestrator–Workers    | Anthropic, 2024 — "Building Effective Agents".                                 |
| [`c-deep-research/`](./c-deep-research/)           | Deep Research           | Product pattern (OpenAI Deep Research, Anthropic Research, Perplexity Pro); academically Self-Ask — Press et al., arXiv:2210.03350. |
| *(no dedicated leaf)*        | XAgent                  | OpenBMB / Tsinghua, tech report 2023. Collapses to Plan-and-Execute with a more aggressive recursion prompt; no structural distinction under sequential execution. |

The collapses, briefly:

- **Plan-and-Execute → Orchestrator–Workers** because sequential
  fan-out is structurally just a one-level recursion of
  `tackle.md` over independent sub-goals.
- **Plan-and-Execute → Deep Research** because recursive
  sub-question investigation is `tackle.md`'s natural
  multi-level recursion path.
- **Plan-and-Execute → XAgent** because the only difference is
  prompt-level — encouraging the agent to re-decompose more
  eagerly when sub-results suggest the original plan was wrong.

## When to reach for which one

- **a plan-execute** — when the task is a concrete sequence of
  actions and the plan tree is shallow (≤ 2 levels).
- **b orchestrator-workers** — when the decomposition is
  obviously fan-out (N independent inputs, N independent
  outputs at one level) and you want the trace to make that
  visible.
- **c deep-research** — when the question is open enough that
  multi-level recursion is expected; this is the only leaf
  where deep nesting is the point rather than an edge case.

## Single-responsibility split between dynamics

| Dynamic | One responsibility |
| --- | --- |
| Strategy (root frame) | Bridge user-authored `PROGRAM.md` into the recursive call: read it, push `tackle.md(goal=program body)` once, halt on pop. |
| `tackle.md` | Given a goal, produce a result. Atomic path: one tool call. Composite path: push `plan.md`, recursively push `tackle.md` per sub-goal, synthesize. |
| `plan.md` | Given a goal, return 3–7 sub-goal bullets. Pure decomposition; no iteration, no classification, no synthesis. |

The atomic-vs-composite decision is made adversarially in
`tackle.md`'s Try instruction — by the same agent that just
considered the goal, before doing any work. This avoids the
planner's structural bias toward over-decomposition.

## Shared dynamics

Both dynamics are byte-identical across the three leaves:

| File                   | Receives (push-args) | Returns                                       |
| ---------------------- | -------------------- | --------------------------------------------- |
| `operators/tackle.md`   | `goal`               | `result` (atomic execution output, or synthesized sub-results) |
| `operators/plan.md`     | `goal`               | `plan` (newline-separated bullet list)        |

Identity is pinned by an identity test under `src/test/`.

## Demos at a glance

| Leaf                         | Demo                                     | Typical recursion depth |
| ---------------------------- | ---------------------------------------- | ----------------------- |
| `a-plan-execute/`            | Minimal TypeScript project (tsconfig, test, CI) | 1–2 levels |
| `b-orchestrator-workers/`    | Summarise 5 files in `workspace/inputs/` | 1 level (5-fan-out) |
| `c-deep-research/`           | Compare Raft / Paxos / Multi-Paxos       | 2–3 levels |

## Run any of the three

```bash
./new-instance.sh my-a interpreters/2-planning-decomposition/a-plan-execute
instances/my-a/run.sh
```

(substitute `b-orchestrator-workers` or `c-deep-research` as
needed).

## What each leaf README explains

Every leaf README in this group describes (1) the framing in
plain terms, (2) the orchestrator-by-orchestrator view, (3) the
per-tackle trace at one level + the recursion pattern, (4) where
state lives across cycles, (5) the dynamics' push-arg/return
contract.
