# Group 2 — Iterative refinement

Interpreters in this directory implement variants of the **iterative
refinement** family from `docs/agent-workflows/patterns.md` Group 2.
They all share one architectural shape:

> **generate → critique → revise**, repeated until a stop criterion is met.

They differ in three axes:

| Interpreter | Critic | Memory across iterations | Critique structure |
| --- | --- | --- | --- |
| [`1a-self-refine/`](./1a-self-refine/) | same role (self) | none | free-form |
| [`1b-evaluator-optimizer/`](./1b-evaluator-optimizer/) | separate role (external) | none | `## Verdict` (pass/fail) + `## Feedback` |
| [`1c-reflexion/`](./1c-reflexion/) | separate role (external) | verbal lessons in `## Lessons` | verdict + feedback + distilled lesson |

All three rely on the shell's existing push/pop machinery at stack
depth 1. The strategy loops by re-entering its trigger state after each
pop; there is no hard iteration cap — the LLM decides when the work is
accepted (see `requirements.md` R10).

## When to reach for which one

- **1a self-refine** — the minimal case. Use when one role can judge
  its own output and an external evaluator isn't worth building.
- **1b evaluator-optimizer** — when the acceptance criterion is
  explicit (a short bullet list, a test suite, a formal property) and
  benefits from a dedicated evaluator that doesn't also generate.
- **1c reflexion** — when failures carry structural information that a
  simple feedback loop forgets. Lessons persist across retries, so each
  attempt starts from the accumulated memory of prior failures.

## Shared dynamic: `evaluate.md`

`1b-evaluator-optimizer/dynamics/evaluate.md` is the canonical copy.
`1c-reflexion/dynamics/evaluate.md` is a byte-equal copy, enforced by
`src/test/phase-1-dynamics-identity.test.ts`. Do not hand-edit the copy
— if the contract changes, update the canonical file and `cp` again.
Phase 2 (CoVe) is expected to be the third consumer; at that point a
shared-dynamics convention in `new-instance.sh` may be worth the churn
(see `docs/specs/2026-04-19-agent-workflows-phase-1/design.md` OQ4).

## Coming next in this group

- **Phase 2 — `2-cove/`** (Chain-of-Verification). Decomposes the
  critique step into independent verification Q&A at stack depth 2.
  Will reuse `evaluate.md`.

See `docs/agent-workflows/requirements.md` for the full phase plan and
`docs/agent-workflows/patterns.md` §Group 2 for literature references
(Madaan et al. 2023, Anthropic 2024, Shinn et al. 2023, Dhuliawala et
al. 2023).
