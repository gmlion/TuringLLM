# Dynamic: Plan

Receives push-arg: `goal`.
Produces: `## Return` with key `plan` (a newline-separated bullet list of sub-goals).
State flow: `empty` → `done`.

`plan.md` is a one-shot decomposer. Given a goal, it returns a list of sub-goals that together cover the goal. It does NOT iterate, does NOT classify atomicity, does NOT synthesize — those responsibilities live in `tackle.md`. The caller decides what to do with the returned plan.

## Instruction: Decompose
**Condition:** MEMORY state is "empty"
**Action:** Read the goal:

    {{goal}}

Produce a list of 3–7 sub-goals at the same level of granularity. All sub-goals at the same layer must have similar scope — never mix broad and narrow ones in the same plan. Each sub-goal must be self-contained: a downstream agent given only that one sub-goal as input must be able to act on it (or recurse on it) without needing the others.

Write `./MEMORY.md` with this EXACT single-heredoc shape (the `## Return` block MUST be in the same heredoc as the state change — without it the shell pops with no return value, breaking the caller):

```
cat > ./MEMORY.md << 'MEMEOF'
## State
done
## Matched Instruction
Decompose
## Last Action
Produced ordered list of sub-goals; popping back to caller.
## Result
Plan produced.
## Return
plan: |
  - <sub-goal 1>
  - <sub-goal 2>
  - <sub-goal 3>
  ...
MEMEOF
```
