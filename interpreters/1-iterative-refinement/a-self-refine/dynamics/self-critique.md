# Dynamic: Self-Critique

Receives argument: {{draft}}.
Produced MEMORY: ## State done + ## Return block with keys `critique`, `refined`.
Return: state done → caller sees {caller_state}_completed, and ## Return entries are spliced into caller's MEMORY as ## Critique and ## Refined.

## Instruction: Critique
**Condition:** MEMORY state is "empty"
**Action:** Critique the draft below — describe concrete strengths, weaknesses, and specific improvements to make. Write the critique to a scratch section `## CritiqueScratch` in MEMORY. Set state to "critiqued".

Draft:
{{draft}}

## Instruction: Refine
**Condition:** MEMORY state is "critiqued" and `## CritiqueScratch` is present
**Action:** Read `## CritiqueScratch`. Produce an improved version of the draft below that addresses every critique point. Write `./MEMORY.md` with this EXACT single-heredoc shape (the `## Return` block MUST be in the same heredoc as the state change — without it the shell pops with no return value, breaking the caller):

```
cat > ./MEMORY.md << 'MEMEOF'
## State
done
## Matched Instruction
Refine
## Last Action
Wrote critique + refined draft to ## Return; popping back to caller.
## Result
Refinement complete.
## Return
critique: |
  <verbatim contents of ## CritiqueScratch, every line indented two spaces>
refined: |
  <your refined draft, every line indented two spaces>
MEMEOF
```

Draft:
{{draft}}
