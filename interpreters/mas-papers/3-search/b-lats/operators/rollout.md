# Dynamic: Rollout

Receives push-args: {{partial_state}}, {{task}}.
Produces: ## State done + ## Return block with key `terminal_state`.

This dynamic is invoked by a Monte Carlo Tree Search controller once per
selected leaf to estimate the leaf's value via a single committed playout.
The dynamic plays one trajectory forward from {{partial_state}} all the way
to a terminal state (per the task's terminal predicate) and returns only the
endpoint — intermediate steps are not tracked in the tree, so they need not
be returned.

## Instruction: Play forward
**Condition:** MEMORY state is "empty"
**Action:** Read the task definition in {{task}}. Starting from
{{partial_state}}, repeatedly apply one forward extension at a time per the
task's rules, committing to a single trajectory, until the task's terminal
predicate fires (i.e. the state cannot be extended further or the task's
acceptance criterion is decidable on it). Return only the terminal state
reached; do not return intermediate states.

Write ./MEMORY.md with this EXACT shape (the ## Return block MUST be in the
same heredoc as the state change):

```
cat > ./MEMORY.md << 'MEMEOF'
## State
done
## Matched Instruction
Play forward
## Last Action
Rolled forward from the partial state to a terminal state; popping.
## Result
Terminal state produced.
## Return
terminal_state: |
  <multi-line terminal state, every line indented two spaces>
MEMEOF
```

Task definition:
{{task}}

Starting partial state:
{{partial_state}}
