# Group 5 — Fixed-SOP teams

*See `docs/agent-workflows/patterns.md` §Group 5 for the
literature taxonomy.*

## What's modeled at the family level

A small simulated software team running a **fixed Standard
Operating Procedure** (SOP). The phases are predetermined; the
work that happens within each phase is what the LLM contributes.
The orchestrator (the strategy frame) walks through the SOP
phases in order, spawning a child context for each phase. The
two interpreters in this group differ in **what kind of context
runs inside a phase** — that's the axis of variation.

## The variants

| Leaf | Framing | Source | What happens inside a phase |
| --- | --- | --- | --- |
| [`a-metagpt/`](./a-metagpt/) | MetaGPT | Hong et al., ICLR 2024 | **Document hand-off.** One specialist role per phase, acting alone. The phase produces a typed document (PRD, Design, Tasks, Code Review) which is the input to the next phase. No back-and-forth. |
| [`b-chatdev/`](./b-chatdev/) | ChatDev | Qian et al., 2023 | **Phase dialogue.** Two specialists per phase (CEO↔CTO, coder↔reviewer, …) take turns negotiating the phase's artefact. Coding/testing/documenting are gated by an independent evaluator that inspects what's actually on disk. |

The two are **structurally different role-collaboration models**
running on the same task. They're shipped together so the
outputs are directly comparable.

## When to reach for which one

- **a metagpt** — when the work decomposes cleanly into typed
  hand-offs and a single specialist per phase is enough. Linear,
  no retries; if the QA reports fail, the run halts with the
  failure recorded. Lowest cost.
- **b chatdev** — when you want distinct viewpoints to negotiate
  each artefact (the coder writes, the reviewer pushes back),
  and you want failed phases to retry until accepted. Higher
  cost; better artefacts on goals where naïve first-pass output
  is likely to be wrong.

## Why two interpreters, not one collapse

Under the `interpreter + PROGRAM → instance` rule, comparing two
role-collaboration models requires two interpreters running the
same PROGRAM. Collapsing them into one interpreter would erase
the comparison this group exists to enable.

## Shared `PROGRAM.md`

Both leaves ship byte-identical `PROGRAM.md` — the `wc-plus`
CLI tool task (see `a-metagpt/PROGRAM.md`). Identity is pinned
by `src/test/phase-4-chatdev.test.ts`. Run both interpreters and
diff their outputs:

```bash
./new-instance.sh mg interpreters/5-fixed-sop-teams/a-metagpt
./new-instance.sh cd interpreters/5-fixed-sop-teams/b-chatdev
instances/mg/run.sh
instances/cd/run.sh
diff -u instances/mg/workspace/ instances/cd/workspace/
```

## Shared dynamic: `evaluate.md`

Both leaves ship a byte-equal copy of `dynamics/evaluate.md` (the
canonical copy lives at
`../1-iterative-refinement/b-evaluator-optimizer/dynamics/evaluate.md`).
The four-way identity across `b-evaluator-optimizer`,
`c-reflexion`, `a-metagpt`, `b-chatdev` is pinned by
`src/test/phase-dynamics-identity.test.ts`. The evaluator is
file-aware: when the criterion mentions `workspace/` paths, it
inspects what's actually on disk before issuing a verdict, so
agents that *describe* having written files without actually
writing them get caught.

## What each leaf README explains

Every leaf README in this group describes (1) the SOP and the
role pairs in plain terms, (2) the orchestrator-by-orchestrator
view of which context is driving each LLM cycle (strategy / role
contexts / dialogue / evaluator), (3) the per-phase trace end to
end, (4) what's shared across role contexts vs. what's
isolated, (5) where artefacts live (in `workspace/.chatdev/` for
chatdev, in strategy MEMORY for metagpt).
