# Dynamic: Answer Independently

Receives argument: {{question}}.
Produced MEMORY: ## State done + ## Return block with key `answer`.
Return: state done → caller sees {caller_state}_completed, and ## Return entry is spliced into caller's MEMORY as ## Answer.

## Instruction: Answer in isolation
**Condition:** MEMORY state is "empty"
**Action:** Answer the question below from a fresh perspective. You have no access to the draft being verified, the verification queue, or any reasoning the caller produced — that is the point: the verifier needs an independent answer, untainted by the artefact under review. Beyond that, use whatever you need: PROGRAM.md and any files it references (e.g. `../../PROGRAM.md`, `../../workspace/*`), the web (`web_search`, `web_fetch`), and your own world knowledge. The independence constraint is "don't consult the draft," not "don't consult any source."

Write `./MEMORY.md` with this EXACT single-heredoc shape (the `## Return` block MUST be in the same heredoc as the state change — without it the shell pops with no return value, breaking the caller):

```
cat > ./MEMORY.md << 'MEMEOF'
## State
done
## Matched Instruction
Answer in isolation
## Last Action
Wrote answer to ## Return; popping back to caller.
## Result
Answered.
## Return
answer: |
  <your answer, every line indented two spaces>
MEMEOF
```

Question:
{{question}}
