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
| [`d-cove/`](./d-cove/) | self (decomposed at depth 2) | none | per-claim Q&A from `answer-independently.md` |

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

## Arguments via INSTRUCTIONS (push-args)

All four dynamics in this group receive their per-call inputs via `## Push-Args` + `{{var}}` substitution at push time, rather than by reading caller-controlled MEMORY sections. The convention separates per-frame arguments (in INSTRUCTIONS, scoped to the frame) from the shared heap (MEMORY, persistent across pops). See `CLAUDE.md` "Dynamics (Call Stack) → Push-Args" for the contract.

Outputs (`## Critique`, `## Refined`, `## Verdict`, `## Feedback`, `## Lesson`, `## Revised`, `## Answer`) are still written to MEMORY — they're the call's return value to the caller.

## Per-frame scoped files (Phase 2b)

Phase 2b introduced a per-frame directory layout (`frames/f<NNN>-<slug>/`) and a `./scoped/` subdirectory in each frame for heap state that is too large or too structured for MEMORY sections. All four interpreters in this group were retrofitted.

### File layout per interpreter

**a-self-refine**

- `./scoped/draft.md` — the current draft blob. Wholesale rewrite is acceptable on each iteration (one atomic blob, no history to preserve).
- Dynamic `self-critique.md` returns its output via `## Return` → `## Refined` in the caller's MEMORY.

**b-evaluator-optimizer**

- `./scoped/attempt.md` — the generator's current attempt. Wholesale rewrite is acceptable on each fail-retry cycle. Lives in the **strategy frame's** scoped dir.
- `./scoped/criterion.md` — the acceptance criterion. Written once at Initialize from PROGRAM.md; never rewritten. Lives in the **strategy frame's** scoped dir.
- The dynamic `evaluate.md` is a one-shot evaluator with no scoped state of its own.
- Dynamic `evaluate.md` returns `## Verdict` + `## Feedback` via `## Return`.

**c-reflexion**

- `./scoped/attempt.md` — same as b; wholesale rewrite per retry. Lives in the **strategy frame's** scoped dir.
- `./scoped/criterion.md` — set once at Initialize. Lives in the **strategy frame's** scoped dir.
- `./scoped/lessons.md` — accumulated verbal lessons. Lives in the **strategy frame's** scoped dir. **Surgical append only** (`echo "- L<N>: ..." >> ./scoped/lessons.md`). Wholesale rewrites are forbidden; they silently discard prior lessons and break the pattern's episodic-memory guarantee.
- Dynamic `reflect.md` returns `## Lesson` via `## Return`; the strategy then appends it to `lessons.md`.

**d-cove**

- Strategy frame owns `./scoped/draft.md` (the candidate answer; wholesale rewrite OK).
- `verify.md` runs in its **own frame** (`frames/f001-verify/`) and owns `./scoped/verifications.md` — a claim-by-claim record (`V1: …`, `V2: …`, etc.). Each `answer-independently.md` pop splices its `## Answer` result back into `verifications.md` using `sed -i` for the matching line. **Surgical `sed -i` updates are mandatory**; wholesale rewrites are forbidden because they would lose prior answered claims.
- `verify.md` returns `## Revised` via `## Return` once all pending claims are answered.

### Surgical-edit convention

Files that accumulate state across multiple pushes or within a single dynamic's run must be edited surgically. The system prompt specifies: use `sed -i`, `awk`, or `echo >>` for any file other than `MEMORY.md`, `INSTRUCTIONS.md`, and `PROGRAM.md`. See `CLAUDE.md` "Per-frame directories and ## Return splicing → Scoped files and the surgical-edit convention" for the normative rule.

## Coming next in this group

Phase 2b (per-frame layout + ## Return) closed out Group 1. Future variants in this group, if any, would compose CoVe with iteration (e.g. CoVe + Evaluator–Optimizer hybrid).

See `docs/agent-workflows/requirements.md` for the full phase plan and
`docs/agent-workflows/patterns.md` §Group 1 for literature references
(Madaan et al. 2023, Anthropic 2024, Shinn et al. 2023, Dhuliawala et
al. 2023).
