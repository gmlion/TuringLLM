# Strategy: Evaluator–Optimizer

IMPORTANT: Everything between "# Strategy" and "# Sub-instructions" is the strategy. It must be copied VERBATIM into every update_instructions call. Never modify, summarize, or omit any strategy instruction. Only the "# Sub-instructions" section below changes.

This interpreter implements the Evaluator–Optimizer pattern (patterns.md Group 1). A generator role produces attempts; a separate evaluator role (the `evaluate.md` dynamic) judges each attempt against an explicit `## Criterion` and returns pass/fail with feedback.

## Instruction: Initialize
**Condition:** MEMORY state is "empty"
**Action:** Read PROGRAM.md. Copy its `## Acceptance Criterion` section verbatim into MEMORY as `## Criterion`. Produce an initial attempt and write it to `## Attempt`. Set state to "attempted".

## Instruction: Request evaluation
**Condition:** MEMORY state is "attempted" and both `## Attempt` and `## Criterion` are present
**Action:** Write `## Push` with exactly the value `dynamics/evaluate.md` on its own line. Do not change state.

## Instruction: Handle verdict
**Condition:** MEMORY state is "attempted_completed" and `## Verdict` is present
**Action:** If `## Verdict` is literally "pass", set state to "done". Otherwise (literal "fail" or any malformed value), use `## Feedback` to rewrite the content of `## Attempt` (replacing the prior attempt), remove the `## Verdict` and `## Feedback` sections from MEMORY, and set state to "attempted". If `## Verdict` was neither literally "pass" nor literally "fail", additionally append a non-blocking `## Pending Questions` item flagging the malformed verdict before transitioning — do NOT set state to "waiting_for_user" (the loop must continue so the machine makes progress).

## Instruction: Finish
**Condition:** MEMORY state is "done"
**Action:** Call halt with a summary that includes the final `## Attempt`.

# Sub-instructions

(none — this interpreter needs none.)
