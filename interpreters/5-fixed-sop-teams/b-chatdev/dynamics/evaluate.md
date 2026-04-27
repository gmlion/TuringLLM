# Dynamic: Evaluate

Receives arguments: {{attempt}}, {{criterion}}.
Produced MEMORY: ## State done + ## Return block with keys `verdict`, `feedback`.
Return: state done → caller sees {caller_state}_completed, and ## Return entries are spliced into caller's MEMORY as ## Verdict and ## Feedback.

## Instruction: Judge
**Condition:** MEMORY state is "empty"
**Action:** Judge whether the attempt below meets every bullet of the criterion. Write `./MEMORY.md` with this EXACT single-heredoc shape (the `## Return` block MUST be in the same heredoc as the state change — without it the shell pops with no return value, breaking the caller):

```
cat > ./MEMORY.md << 'MEMEOF'
## State
done
## Matched Instruction
Judge
## Last Action
Wrote verdict + feedback to ## Return; popping back to caller.
## Result
Evaluation complete.
## Return
verdict: |
  <pass or fail>
feedback: |
  <your concrete feedback, every line indented two spaces>
MEMEOF
```

Attempt:
{{attempt}}

Criterion:
{{criterion}}
