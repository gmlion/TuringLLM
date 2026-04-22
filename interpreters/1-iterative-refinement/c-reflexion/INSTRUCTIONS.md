# Strategy: Reflexion

IMPORTANT: Everything between "# Strategy" and "# Sub-instructions" is the strategy. It must be copied VERBATIM into every update_instructions call. Never modify, summarize, or omit any strategy instruction. Only the "# Sub-instructions" section below changes.

This interpreter implements the Reflexion pattern (patterns.md Group 1): Evaluator–Optimizer plus an explicit reflection step that distils each failed attempt into a verbal lesson. Lessons accumulate in `## Lessons` and are read into every subsequent attempt.

## Instruction: Initialize
**Condition:** MEMORY state is "empty"
**Action:** Read PROGRAM.md. Copy its `## Acceptance Criterion` section verbatim into `## Criterion` in MEMORY. If PROGRAM.md names an auxiliary file to be materialised under `workspace/` (for example the palindrome demo's hidden test file), read the corresponding `*.md` file from the instance directory that contains its content in a fenced code block, extract the code block, and write it to the named path via the `write_file` tool. Initialize an empty `## Lessons` section in MEMORY. Set state to "attempting".

## Instruction: Attempt
**Condition:** MEMORY state is "attempting"
**Action:** Read `## Criterion` and (if present) `## Lessons`. Produce an attempt that reflects every lesson currently listed in `## Lessons`; write it to `## Attempt`. Set state to "attempted".

## Instruction: Request evaluation
**Condition:** MEMORY state is "attempted" and both `## Attempt` and `## Criterion` are present
**Action:** Append the following to MEMORY (do not change state):

    ## Push
    dynamics/evaluate.md
    ## Push-Args
    attempt: |
      <verbatim contents of ## Attempt, every line indented two spaces>
    criterion: |
      <verbatim contents of ## Criterion, every line indented two spaces>

## Instruction: Route on verdict
**Condition:** MEMORY state is "attempted_completed" and `## Verdict` is present
**Action:** If `## Verdict` is literally "pass", set state to "done". Otherwise set state to "failed_attempt".

## Instruction: Reflect
**Condition:** MEMORY state is "failed_attempt" and `## Attempt` and `## Verdict` are present
**Action:** Append the following to MEMORY (do not change state):

    ## Push
    dynamics/reflect.md
    ## Push-Args
    attempt: |
      <verbatim contents of ## Attempt, every line indented two spaces>
    verdict: |
      <verbatim contents of ## Verdict, every line indented two spaces>
    feedback: |
      <verbatim contents of ## Feedback, every line indented two spaces; if absent, use the literal value `(no feedback)`>

## Instruction: Accumulate lesson
**Condition:** MEMORY state is "failed_attempt_completed" and `## Lesson` is present
**Action:** Append `## Lesson` as a new numbered bullet to `## Lessons` in MEMORY (e.g. `- L1: ...`, incrementing the index from the highest existing lesson number). Remove the `## Attempt`, `## Verdict`, `## Feedback`, and `## Lesson` sections from MEMORY. Leave `## Lessons` and `## Criterion` untouched. Set state to "attempting".

## Instruction: Finish
**Condition:** MEMORY state is "done"
**Action:** Call halt with a summary that includes the final `## Attempt` and a listing of `## Lessons` that were used.

# Sub-instructions

(none — this interpreter needs none.)
