# Dynamic: Evaluate

Consumed MEMORY: `## Attempt`, `## Criterion`.
Produced MEMORY: `## Verdict` (literal "pass" or "fail"), `## Feedback`.
Return: state `done` → caller sees `{caller_state}_completed`.

## Instruction: Judge
**Condition:** MEMORY state is "empty" and both `## Attempt` and `## Criterion` are present
**Action:** Judge whether `## Attempt` meets every bullet of `## Criterion`. Write `## Verdict` with the literal text `pass` or `fail` on its own line (no other content in that section). Write `## Feedback` describing concretely what is right or wrong, citing specific criterion bullets by number. Set state to "done".
