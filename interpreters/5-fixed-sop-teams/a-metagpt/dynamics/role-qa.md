# Dynamic: Role — QA

Consumes: `{{tasks}}`, `{{code_location}}`.
Produces: `## Return` with key `code_review`.
State flow: `empty` → `reviewing` → `awaiting_verdict` → `done`.
Stack: pushes `evaluate.md` at depth 2.

## Instruction: Review
**Condition:** MEMORY state is "empty"
**Action:** The engineered tasks are:

    {{tasks}}

The code lives under:

    {{code_location}}

Read the relevant files in that location via `bash cat`. Synthesise a review *attempt* (one paragraph describing what was implemented and your overall judgement) and a *criterion* (one sentence from the PRD/acceptance criteria). Append to `./MEMORY.md`:

    ## Push
    dynamics/evaluate.md
    ## Push-Args
    attempt: |
      <verbatim attempt summary, indented two spaces>
    criterion: |
      <verbatim criterion, indented two spaces>

Set state to "awaiting_verdict". (Note: "awaiting_verdict" is a local label; the shell sets frame state to "empty" on push and to "awaiting_verdict_completed" on pop.)

## Instruction: Return verdict
**Condition:** MEMORY state is "awaiting_verdict_completed" and `## Verdict` is present
**Action:** Read `## Verdict` (literal `pass` or `fail`) and `## Feedback` from MEMORY. Append to `./MEMORY.md`:

    ## Return
    code_review: |
      verdict: <pass|fail>
      feedback: |
        <verbatim feedback body, indented two more spaces>

Remove `## Verdict` and `## Feedback` from MEMORY. Set state to "done".
