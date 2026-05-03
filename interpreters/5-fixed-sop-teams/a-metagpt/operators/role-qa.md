# Dynamic: Role — QA

Consumes: `{{tasks}}`, `{{code_location}}`.
Produces: `## Return` with key `review` (the shell splices it into the caller's MEMORY as `## Review`).
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
**Action:** Read `## Verdict` (literal `pass` or `fail`) and `## Feedback` from MEMORY. Write `./MEMORY.md` with this EXACT single-heredoc shape (the `## Return` block MUST be in the same heredoc as the state change — the system prompt's canonical recipe shows only the four canonical sections, so following it literally would clobber the `## Return`, leaving the shell with nothing to splice on pop):

```
cat > ./MEMORY.md << 'MEMEOF'
## State
done
## Matched Instruction
Return verdict
## Last Action
Wrote QA review (verdict + feedback) to ## Return; popping back to strategy.
## Result
QA review complete.
## Return
review: |
  verdict: <pass|fail, copy literal value of ## Verdict>
  feedback: |
    <verbatim ## Feedback body, indented two more spaces>
MEMEOF
```
