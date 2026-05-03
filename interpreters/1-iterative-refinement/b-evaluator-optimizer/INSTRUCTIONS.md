# Strategy: Evaluator–Optimizer

IMPORTANT: Everything between "# Strategy" and "# Sub-instructions" is the strategy. It must be copied VERBATIM into every update_instructions call. Never modify, summarize, or omit any strategy instruction. Only the "# Sub-instructions" section below changes.

This interpreter implements the Evaluator–Optimizer pattern (patterns.md Group 1). A generator role produces attempts into `./scoped/attempt.md`; a separate evaluator role (the `evaluate.md` dynamic) judges each attempt against an explicit `./scoped/criterion.md` (received via push-args) and returns `verdict` + `feedback` via `## Return`, which the shell splices into caller MEMORY as `## Verdict` and `## Feedback`.

## Instruction: Initialize
**Condition:** MEMORY state is "empty"
**Action:** Read `../../PROGRAM.md`. Copy its `## Acceptance Criterion` section verbatim into `./scoped/criterion.md` (wholesale `cat > ./scoped/criterion.md << EOF ... EOF` is fine — a criterion is a single blob). Produce an initial attempt addressing the task and write it to `./scoped/attempt.md` (wholesale `cat > ./scoped/attempt.md << EOF ... EOF` is fine — an attempt is a single blob). Set MEMORY state to "attempted".

## Instruction: Request evaluation
**Condition:** MEMORY state is "attempted" and `./scoped/attempt.md` exists
**Action:** Read `./scoped/attempt.md` and `./scoped/criterion.md`. Append the following to `./MEMORY.md` (do not change state — the shell will set it to "empty" when it pushes the dynamic):

    ## Push
    operators/evaluate.md
    ## Push-Args
    attempt: |
      <verbatim contents of ./scoped/attempt.md, every line indented two spaces>
    criterion: |
      <verbatim contents of ./scoped/criterion.md, every line indented two spaces>

## Instruction: Handle verdict
**Condition:** MEMORY state is "attempted_completed" and `## Verdict` is present
**Action:** If `## Verdict` is literally "pass", set state to "done". Otherwise (literal "fail" or any malformed value), use `## Feedback` to rewrite `./scoped/attempt.md` wholesale (`cat > ./scoped/attempt.md << EOF ... EOF` is fine — a single blob). When rewriting MEMORY, omit the `## Verdict` and `## Feedback` sections (they were already consumed) and set state to "attempted" (which re-enters "Request evaluation" on the next cycle). If `## Verdict` was neither literally "pass" nor literally "fail", additionally append a non-blocking `## Pending Questions` item flagging the malformed verdict before transitioning — do NOT set state to "waiting_for_user" (the loop must continue so the machine makes progress).

## Instruction: Finish
**Condition:** MEMORY state is "done"
**Action:** Call halt with a short summary that includes the final contents of `./scoped/attempt.md`.

# Sub-instructions

(none — this interpreter needs none.)
