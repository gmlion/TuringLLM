# Group 1 — Iterative refinement

*See `docs/agent-workflows/patterns.md` §Group 1 for the
literature taxonomy (Madaan et al. 2023, Anthropic 2024, Shinn
et al. 2023, Dhuliawala et al. 2023).*

## What's modeled at the family level

All four interpreters in this group share one architectural
shape:

> **generate → critique → revise**, repeated until the work is
> accepted.

What differs between them is *who critiques*, *what is
remembered between iterations*, and *how the critique is
structured*. None of them ship hard iteration caps — the loop
terminates when the configured judge says "good enough".

The orchestrator in every variant is the strategy frame
(`f000-strategy`); the critic / verifier always lives in a
separate context (a child frame pushed per iteration), so the
critic is never a continuation of the producer's reasoning.
That separation is the point of the family.

## The variants and their axis of variation

| Interpreter | Critic | Memory across iterations | Critique structure | Stack depth |
| --- | --- | --- | --- | --- |
| [`a-self-refine/`](./a-self-refine/) | same role (the producer's model, but a fresh context) | none | free-form prose | 2 |
| [`b-evaluator-optimizer/`](./b-evaluator-optimizer/) | a separate evaluator role with an explicit acceptance criterion | none | `verdict` (pass/fail) + `feedback` | 2 |
| [`c-reflexion/`](./c-reflexion/) | same as b, plus a reflection step that distills each failure into a verbal rule | accumulating list of "lessons" the next attempt reads | verdict + feedback + a one-line directive | 2 |
| [`d-cove/`](./d-cove/) | the producer pushes a verifier, which decomposes the draft into atomic claims and pushes an *independent* answerer per claim | none | per-claim Q&A reconciled into a corrected draft | 3 |

The leaf-letter prefix (`a`, `b`, `c`, `d`) suggests an
**exploration order** — `a` is the minimal case, each subsequent
leaf adds one structural element — but each leaf is fully
self-contained.

## When to reach for which one

- **a self-refine** — the minimal case. Use when one role's
  judgement of its own output is a meaningful signal and a
  separate evaluator isn't worth building.
- **b evaluator-optimizer** — when the acceptance criterion is
  explicit (a short bullet list, a test suite, a formal
  property) and benefits from a dedicated judge that doesn't
  also generate.
- **c reflexion** — when failures carry information that a
  simple feedback loop forgets. Lessons accumulate across
  retries, so each new attempt starts from the *summarized*
  history of past mistakes.
- **d cove** — when hallucinated factual claims are the failure
  mode. The decomposition into independently-answered atomic
  claims is what keeps the verifier from anchoring on the
  producer's mistakes.

## Shared dynamic: `evaluate.md`

`b-evaluator-optimizer/dynamics/evaluate.md` is the canonical
copy of the evaluator. `c-reflexion`, plus `a-metagpt` and
`b-chatdev` in Group 5, ship byte-equal copies. Identity is
pinned by `src/test/phase-dynamics-identity.test.ts`. Don't
hand-edit a copy; update the canonical and `cp` again.

## What each leaf README explains

Every leaf README in this group describes (1) the situation
modeled, (2) the orchestrator-by-orchestrator view of which
context is driving each LLM cycle, (3) the per-iteration trace
end to end, (4) where state lives across cycles, (5) the
dynamics' push-arg/return contract. Open the leaf you're
interested in.

## Coming next in this group

Future variants in this group, if any, would compose CoVe with
iteration (e.g. CoVe + Evaluator–Optimizer hybrid).
