# Operator: Evaluator–Optimizer

IMPORTANT: This operator file is the canonical strategy. Do not modify it via update_instructions; it is only loaded at push-time.

Receives push-args (mode 1: standalone via root-operator bootstrap):
  - `{{program}}` — the user's PROGRAM.md content.

Receives push-args (mode 2: invoked by aflow-lite as part of a workflow):
  - `{{task}}` — the task description (e.g. one GSM8K item's question text).
  - `{{prior_answer}}` — the previous operator's `## Answer`, or empty for the first operator.

Produces: `## State done` + `## Return` block with key `answer`. The existing `## Refined`, `## Verdict`, and `## Feedback` sections are also written for human inspection.

This operator implements the Evaluator–Optimizer pattern (patterns.md Group 1). A generator role produces attempts into `./scoped/attempt.md`; a separate evaluator role (the `operators/evaluate.md` sub-operator) judges each attempt against an explicit `./scoped/criterion.md` and returns `verdict` + `feedback` via `## Return`, which the shell splices into caller MEMORY as `## Verdict` and `## Feedback`.

## Instruction: Initialize
**Condition:** MEMORY state is "empty"
**Action:** Detect which mode this operator was invoked in, then produce an initial attempt.

    # Detect mode (R47): if {{task}} is still a literal token, we are in standalone mode.
    # substitutePlaceholders only replaces what was passed in ## Push-Args, so
    # an unsubstituted {{task}} token remains verbatim in INSTRUCTIONS.md.
    if grep -qF '{{task}}' ./INSTRUCTIONS.md; then
      # Mode 1 — standalone: {{program}} was substituted with PROGRAM.md content.
      # The task is the full program text (visible inline below in this file).
      MODE="standalone"
    else
      # Mode 2 — AFlow-lite: {{task}} was substituted with the item's question text
      # and {{prior_answer}} was substituted with the previous operator's answer.
      MODE="aflow"
    fi

**In standalone mode:** Read the task from the `{{program}}` section below. Extract the `## Acceptance Criterion` section from the program and write it to `./scoped/criterion.md` (wholesale `cat > ./scoped/criterion.md << EOF ... EOF` is fine). Produce an initial attempt addressing the task and write it to `./scoped/attempt.md` (wholesale `cat > ./scoped/attempt.md << EOF ... EOF` is fine). Set MEMORY state to "attempted".

**In AFlow-lite mode:** The task is in the `{{task}}` section below; the criterion defaults to "produce a correct answer to: {{task}}". Write the criterion to `./scoped/criterion.md`. If `{{prior_answer}}` is non-empty, use it as the initial attempt; otherwise draft a fresh attempt from scratch. Write the attempt to `./scoped/attempt.md`. Set MEMORY state to "attempted".

Program (mode 1 — substituted at push-time):
{{program}}

Task (mode 2 — substituted at push-time):
{{task}}

Prior answer (mode 2 — substituted at push-time, may be empty):
{{prior_answer}}

## Instruction: Request evaluation
**Condition:** MEMORY state is "attempted" and `./scoped/attempt.md` exists
**Action:** Read `./scoped/attempt.md` and `./scoped/criterion.md`. Append the following to `./MEMORY.md` (do not change state — the shell will set it to "empty" when it pushes the operator):

    ## Push
    operators/evaluate.md
    ## Push-Args
    attempt: |
      <verbatim contents of ./scoped/attempt.md, every line indented two spaces>
    criterion: |
      <verbatim contents of ./scoped/criterion.md, every line indented two spaces>

## Instruction: Handle verdict
**Condition:** MEMORY state is "attempted_completed" and `## Verdict` is present
**Action:** If `## Verdict` is literally "pass", write `./MEMORY.md` with the FULL done state in a SINGLE heredoc (the `## Return` block MUST be in the same heredoc as the state change — at depth>=2 the shell pops on state is "done" BEFORE any subsequent instruction runs, so a separate Finish instruction would be unreachable):

```
cat > ./MEMORY.md << FINEOF
## State
done
## Matched Instruction
Handle verdict
## Last Action
Accepted attempt.
## Result
Evaluator-optimizer accepted.
## Refined
$(cat ./scoped/attempt.md)
## Return
answer: |
$(cat ./scoped/attempt.md | sed 's/^/  /')
FINEOF
```

Otherwise (literal "fail" or any malformed value), use `## Feedback` to rewrite `./scoped/attempt.md` wholesale (`cat > ./scoped/attempt.md << EOF ... EOF` is fine — a single blob). When rewriting MEMORY, omit the `## Verdict` and `## Feedback` sections (they were already consumed) and set state to "attempted" (which re-enters "Request evaluation" on the next cycle). If `## Verdict` was neither literally "pass" nor literally "fail", additionally append a non-blocking `## Pending Questions` item flagging the malformed verdict before transitioning — do NOT set state to "waiting_for_user" (the loop must continue so the machine makes progress).
