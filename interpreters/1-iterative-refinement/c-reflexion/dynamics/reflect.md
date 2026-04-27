# Dynamic: Reflect

Receives arguments: {{attempt}}, {{verdict}}, {{feedback}}.
Produced MEMORY: ## State done + ## Return block with key `lesson`.
Return: state done → caller sees {caller_state}_completed, and ## Return entries are spliced into caller's MEMORY as ## Lesson.

## Instruction: Distil lesson
**Condition:** MEMORY state is "empty"
**Action:** Read the attempt, verdict, and feedback below. Write `./MEMORY.md` with this EXACT single-heredoc shape (the `## Return` block MUST be in the same heredoc as the state change — without it the shell pops with no return value, breaking the caller):

```
cat > ./MEMORY.md << 'MEMEOF'
## State
done
## Matched Instruction
Distil lesson
## Last Action
Wrote lesson directive to ## Return; popping back to caller.
## Result
Lesson distilled.
## Return
lesson: |
  <your one or two sentence directive ("always X", "avoid Y"), every line indented two spaces>
MEMEOF
```

Attempt:
{{attempt}}

Verdict:
{{verdict}}

Feedback:
{{feedback}}
