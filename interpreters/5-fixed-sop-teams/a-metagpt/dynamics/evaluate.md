# Dynamic: Evaluate

Receives arguments: {{attempt}}, {{criterion}}.
Produced MEMORY: ## State done + ## Return block with keys `verdict`, `feedback`.
Return: state done → caller sees {caller_state}_completed, and ## Return entries are spliced into caller's MEMORY as ## Verdict and ## Feedback.

## Instruction: Judge
**Condition:** MEMORY state is "empty"
**Action:** Judge whether the attempt below meets every bullet of the criterion. Write MEMORY with state=done plus a `## Return` section containing `verdict` (the literal text `pass` or `fail`) and `feedback` (concrete description of what is right or wrong, citing specific criterion bullets by number), both as block scalars:

    ## State
    done
    ## Return
    verdict: |
      <pass or fail>
    feedback: |
      <your concrete feedback, every line indented two spaces>

Attempt:
{{attempt}}

Criterion:
{{criterion}}
