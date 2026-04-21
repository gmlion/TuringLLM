# Group 1 — Iterative refinement

Interpreters in this directory implement variants of the **iterative
refinement** family from `docs/agent-workflows/patterns.md` Group 1.
They all share one architectural shape:

> **generate → critique → revise**, repeated until a stop criterion is met.

They differ in three axes:

| Interpreter | Critic | Memory across iterations | Critique structure |
| --- | --- | --- | --- |
| [`a-self-refine/`](./a-self-refine/) | same role (self) | none | free-form |
| [`b-evaluator-optimizer/`](./b-evaluator-optimizer/) | separate role (external) | none | `## Verdict` (pass/fail) + `## Feedback` |
| [`c-reflexion/`](./c-reflexion/) | separate role (external) | verbal lessons in `## Lessons` | verdict + feedback + distilled lesson |

The leaf-letter prefix (`a`, `b`, `c`) encodes a recommended **exploration
order** within the group, not strict prerequisites. Each interpreter is
self-contained.

All three rely on the shell's existing push/pop machinery at stack
depth 1. The strategy loops by re-entering its trigger state after each
pop; there is no hard iteration cap — the LLM decides when the work is
accepted (see `requirements.md` R10).

## When to reach for which one

- **a self-refine** — the minimal case. Use when one role can judge
  its own output and an external evaluator isn't worth building.
- **b evaluator-optimizer** — when the acceptance criterion is
  explicit (a short bullet list, a test suite, a formal property) and
  benefits from a dedicated evaluator that doesn't also generate.
- **c reflexion** — when failures carry structural information that a
  simple feedback loop forgets. Lessons persist across retries, so each
  attempt starts from the accumulated memory of prior failures.

## Shared dynamic: `evaluate.md`

`b-evaluator-optimizer/dynamics/evaluate.md` is the canonical copy.
`c-reflexion/dynamics/evaluate.md` is a byte-equal copy, enforced by
`src/test/phase-1-dynamics-identity.test.ts`. Do not hand-edit the copy
— if the contract changes, update the canonical file and `cp` again.
Phase 2 (CoVe) is expected to be the third consumer; at that point a
shared-dynamics convention in `new-instance.sh` may be worth the churn
(see `docs/specs/2026-04-19-agent-workflows-phase-1/design.md` OQ4).

## Coming next in this group

- **Phase 2 — `d-cove/`** (Chain-of-Verification). Decomposes the
  critique step into independent verification Q&A at stack depth 2.
  Will reuse `evaluate.md`.

See `docs/agent-workflows/requirements.md` for the full phase plan and
`docs/agent-workflows/patterns.md` §Group 1 for literature references
(Madaan et al. 2023, Anthropic 2024, Shinn et al. 2023, Dhuliawala et
al. 2023).
