# Strategy: Reflexion

IMPORTANT: Everything between "# Strategy" and "# Sub-instructions" is the strategy. It must be copied VERBATIM into every update_instructions call. Never modify, summarize, or omit any strategy instruction. Only the "# Sub-instructions" section below changes.

This interpreter implements the Reflexion pattern (patterns.md Group 1): Evaluator–Optimizer plus an explicit reflection step that distils each failed attempt into a verbal lesson. Lessons accumulate in `./scoped/lessons.md` and are read into every subsequent attempt. Three scoped files hold persistent state:
- `./scoped/attempt.md` — current attempt (single blob, wholesale-rewrite OK)
- `./scoped/criterion.md` — set once at Initialize from PROGRAM.md's `## Acceptance Criterion`
- `./scoped/lessons.md` — accumulating list; **MUST use surgical `echo "- L<N>: <text>" >> ./scoped/lessons.md` for appends; wholesale rewrites are forbidden**

## Instruction: Initialize
**Condition:** MEMORY state is "empty"
**Action:** Read `../../PROGRAM.md`. Copy its `## Acceptance Criterion` section verbatim into `./scoped/criterion.md` (wholesale `cat > ./scoped/criterion.md << EOF ... EOF` is fine — a criterion is a single blob). Create an empty `./scoped/lessons.md` (touch or `cat > ./scoped/lessons.md << EOF ... EOF` with empty content). If PROGRAM.md names auxiliary files to be materialised under `workspace/` (for example the palindrome demo's `test_palindrome.md`), read the corresponding `*.md` file from the instance directory, extract the fenced code block, and write it to the named path via the `write_file` tool (note: workspace is at `../../workspace/` relative to the scoped directory). Set MEMORY state to "attempting".

## Instruction: Attempt
**Condition:** MEMORY state is "attempting"
**Action:** Read `./scoped/criterion.md` and `./scoped/lessons.md`. Produce an attempt that reflects every lesson currently listed in `./scoped/lessons.md`; write it to `./scoped/attempt.md` (wholesale `cat > ./scoped/attempt.md << EOF ... EOF` is fine — an attempt is a single blob). Set MEMORY state to "attempted".

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

## Instruction: Route on verdict
**Condition:** MEMORY state is "attempted_completed" and `## Verdict` is present
**Action:** Read `## Verdict` from MEMORY. If `## Verdict` is literally "pass", set state to "done". Otherwise (literal "fail" or any malformed value), set state to "failed_attempt". When rewriting MEMORY, retain `## Verdict` and `## Feedback` so the Reflect step can read them. If `## Verdict` was neither literally "pass" nor literally "fail", additionally append a non-blocking `## Pending Questions` item flagging the malformed verdict before transitioning — do NOT set state to "waiting_for_user" (the loop must continue so the machine makes progress).

## Instruction: Reflect
**Condition:** MEMORY state is "failed_attempt" and `## Verdict` is present
**Action:** Read `./scoped/attempt.md` for the attempt, and `## Verdict` and `## Feedback` from MEMORY. Append the following to `./MEMORY.md` (do not change state — the shell will set it to "empty" when it pushes the dynamic):

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

## Instruction: Finish
**Condition:** MEMORY state is "done"
**Action:** Call halt with a summary that includes the final contents of `./scoped/attempt.md` and the full contents of `./scoped/lessons.md`.

# Sub-instructions

(none — this interpreter needs none.)
