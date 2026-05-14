# Operator: Reflexion

IMPORTANT: This operator file is the canonical strategy. Do not modify it via update_instructions; it is only loaded at push-time.

Receives push-args:
  - `{{task}}` — the task body. PROGRAM.md content when bootstrap-loaded; the per-item task text when invoked as a library operator by a meta-framework.
  - `{{prior_answer}}` — a prior operator's answer to use as a starting attempt, or empty if none.

Produces: `## State done` + `## Return` block with key `answer`. The existing `## Refined` and `## Lessons` sections are also written for human inspection.

This operator implements the Reflexion pattern (patterns.md Group 1): Evaluator–Optimizer plus an explicit reflection step that distils each failed attempt into a verbal lesson. Lessons accumulate in `./scoped/lessons.md` and are read into every subsequent attempt. Three scoped files hold persistent state:
- `./scoped/attempt.md` — current attempt (single blob, wholesale-rewrite OK)
- `./scoped/criterion.md` — set once at Initialize from the task's acceptance criterion
- `./scoped/lessons.md` — accumulating list; **MUST use surgical `echo "- L<N>: <text>" >> ./scoped/lessons.md` for appends; wholesale rewrites are forbidden**

## Instruction: Initialize
**Condition:** MEMORY state is "empty"
**Action:** Bootstrap scoped files and produce an initial attempt.

Read the task from the `{{task}}` section below. If the task body contains an explicit `## Acceptance Criterion` section, extract it and write it to `./scoped/criterion.md`; otherwise default the criterion to "produce a correct answer to: {{task}}". Either way write `./scoped/criterion.md` wholesale (a single heredoc is fine). Create an empty `./scoped/lessons.md`. If the task names auxiliary files to be materialised under `workspace/` (for example the palindrome demo's `test_palindrome.md`), read the corresponding `*.md` file from the instance directory, extract the fenced code block, and write it to the named path via the `write_file` tool (note: workspace is at `../../workspace/` relative to the frame directory). If `{{prior_answer}}` is non-empty, use it as the initial attempt; otherwise draft a fresh attempt from scratch. Write the attempt to `./scoped/attempt.md` (wholesale heredoc is fine). Set MEMORY state to "attempting".

Task (substituted at push-time):
{{task}}

Prior answer (substituted at push-time, may be empty):
{{prior_answer}}

## Instruction: Attempt
**Condition:** MEMORY state is "attempting"
**Action:** Read `./scoped/criterion.md` and `./scoped/lessons.md`. Produce an attempt that reflects every lesson currently listed in `./scoped/lessons.md`; write it to `./scoped/attempt.md` (wholesale `cat > ./scoped/attempt.md << EOF ... EOF` is fine — an attempt is a single blob). Set MEMORY state to "attempted".

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

## Instruction: Route on verdict
**Condition:** MEMORY state is "attempted_completed" and `## Verdict` is present
**Action:** Read `## Verdict` from MEMORY. If `## Verdict` is literally "pass", write `./MEMORY.md` with the FULL done state in a SINGLE heredoc (the `## Return` block MUST be in the same heredoc as the state change — at depth>=2 the shell pops on state is "done" BEFORE any subsequent instruction runs, so a separate Finish instruction would be unreachable):

```
cat > ./MEMORY.md << FINEOF
## State
done
## Matched Instruction
Route on verdict
## Last Action
Accepted attempt.
## Result
Reflexion accepted.
## Refined
$(cat ./scoped/attempt.md)
## Lessons
$(cat ./scoped/lessons.md)
## Return
answer: |
$(cat ./scoped/attempt.md | sed 's/^/  /')
FINEOF
```

Otherwise (literal "fail" or any malformed value), set state to "failed_attempt". When rewriting MEMORY, retain `## Verdict` and `## Feedback` so the Reflect step can read them. If `## Verdict` was neither literally "pass" nor literally "fail", additionally append a non-blocking `## Pending Questions` item flagging the malformed verdict before transitioning — do NOT set state to "waiting_for_user" (the loop must continue so the machine makes progress).

## Instruction: Reflect
**Condition:** MEMORY state is "failed_attempt" and `## Verdict` is present
**Action:** Read `./scoped/attempt.md` for the attempt, and `## Verdict` and `## Feedback` from MEMORY. Append the following to `./MEMORY.md` (do not change state — the shell will set it to "empty" when it pushes the operator):

    ## Push
    operators/reflect.md
    ## Push-Args
    attempt: |
      <verbatim contents of ./scoped/attempt.md, every line indented two spaces>
    verdict: |
      <verbatim contents of ## Verdict, every line indented two spaces>
    feedback: |
      <verbatim contents of ## Feedback, every line indented two spaces; if absent, use the literal value `(no feedback)`>

## Instruction: Accumulate lesson
**Condition:** MEMORY state is "failed_attempt_completed" and `## Lesson` is present
**Action:** Read `./scoped/lessons.md` to determine the next sequential lesson index (count existing `- L<N>:` lines; next index = count + 1). Append the lesson SURGICALLY using: `echo "- L<N>: <lesson text>" >> ./scoped/lessons.md` where `<N>` is the next sequential index. Do NOT use `cat > ./scoped/lessons.md` or any wholesale rewrite — only surgical appends are permitted. When rewriting MEMORY, omit the `## Verdict`, `## Feedback`, and `## Lesson` sections (they were already consumed). Set MEMORY state to "attempting".
