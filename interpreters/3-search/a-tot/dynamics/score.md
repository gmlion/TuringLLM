# Dynamic: Score

Receives push-args: {{partial_state}}, {{task}}.
Produces: ## State done + ## Return block with key `value` set to one of
`sure`, `likely`, or `impossible`.

This dynamic is invoked by a search interpreter to judge whether a partial
state can plausibly satisfy the task's success criterion. The strategy
typically aggregates multiple invocations.

## Instruction: Score state
**Condition:** MEMORY state is "empty"
**Action:** Read the task definition in {{task}}. Judge whether
{{partial_state}} can plausibly be extended into a state that satisfies the
task. Output exactly one label:

  - sure: the task can definitely be satisfied from this partial state (e.g.
    the partial state already satisfies the task, or one obvious extension
    away).
  - likely: feasible but not obvious (further extensions are needed and the
    path forward is plausible but uncertain).
  - impossible: commonsense rules out completion from this partial state.

Write ./MEMORY.md with this EXACT shape (the ## Return block MUST be in the
same heredoc as the state change):

```
cat > ./MEMORY.md << 'MEMEOF'
## State
done
## Matched Instruction
Score state
## Last Action
Scored partial state for task plausibility; popping.
## Result
Score produced.
## Return
value: <one of: sure, likely, impossible>
MEMEOF
```

Task definition:
{{task}}

Partial state to score:
{{partial_state}}
