# Dynamic: Evaluate

Receives arguments: {{attempt}}, {{criterion}}.
Produced MEMORY: ## Verdict (literal "pass" or "fail"), ## Feedback.
Return: state done → caller sees {caller_state}_completed.

## Instruction: Judge
**Condition:** MEMORY state is "empty"
**Action:** Judge whether the attempt below meets every bullet of the criterion. Write `## Verdict` with the literal text `pass` or `fail` on its own line (no other content in that section). Write `## Feedback` describing concretely what is right or wrong, citing specific criterion bullets by number. Set state to "done".

Attempt:
{{attempt}}

Criterion:
{{criterion}}
