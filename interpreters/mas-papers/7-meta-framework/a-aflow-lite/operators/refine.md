# Operator: Evaluator–Optimizer

IMPORTANT: This operator file is the canonical strategy. Do not modify it via update_instructions; it is only loaded at push-time.

Receives push-args:
  - `{{task}}` — the task body. PROGRAM.md content when bootstrap-loaded; the per-item task text when invoked as a library operator by a meta-framework.
  - `{{prior_answer}}` — a prior operator's answer to use as a starting attempt, or empty if none.

Produces: `## State done` + `## Return` block with key `answer`. The existing `## Refined`, `## Verdict`, and `## Feedback` sections are also written for human inspection.

This operator implements the Evaluator–Optimizer pattern (patterns.md Group 1). A generator role produces attempts into `./scoped/attempt.md`; a separate evaluator role (the `operators/evaluate.md` sub-operator) judges each attempt against an explicit `./scoped/criterion.md` and returns `verdict` + `feedback` via `## Return`, which the shell splices into caller MEMORY as `## Verdict` and `## Feedback`.

## Instruction: Initialize
**Condition:** MEMORY state is "empty"
**Action:** Produce an initial attempt.

Read the task from the `{{task}}` section below. If the task body contains an explicit `## Acceptance Criterion` section, extract it and write it to `./scoped/criterion.md`; otherwise default the criterion to "produce a correct answer to: {{task}}". Either way write `./scoped/criterion.md` wholesale (a single heredoc is fine — `cat > ./scoped/criterion.md << EOF ... EOF`). If `{{prior_answer}}` is non-empty, use it as the initial attempt; otherwise draft a fresh attempt from scratch. Write the attempt to `./scoped/attempt.md` (wholesale heredoc is fine). Set MEMORY state to "attempted".

Task (substituted at push-time):
{{task}}

Prior answer (substituted at push-time, may be empty):
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
