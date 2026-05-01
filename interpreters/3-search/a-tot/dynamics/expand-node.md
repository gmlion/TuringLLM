# Dynamic: Expand Node

Receives push-args: {{partial_state}}, {{task}}.
Produces: ## State done + ## Return block with key `children`.

This dynamic is invoked by a search interpreter once per live unexpanded tree
node. One invocation generates exactly k=5 candidate next states by reading the
task definition in {{task}} and extending the partial state below by one
forward step per candidate.

## Instruction: Generate children
**Condition:** MEMORY state is "empty"
**Action:** Read the task definition in {{task}}. Generate exactly k=5
candidate next states that extend {{partial_state}} according to the task's
rules. Each candidate is a single forward step from {{partial_state}}; the
returned `state:` payload should describe the partial state *after* that step
applies (in the same prose form the task uses). Prefer diverse next steps;
avoid emitting five identical candidates.

Write ./MEMORY.md with this EXACT shape (the ## Return block MUST be in the
same heredoc as the state change):

```
cat > ./MEMORY.md << 'MEMEOF'
## State
done
## Matched Instruction
Generate children
## Last Action
Generated five candidate next states for the partial state.
## Result
Children produced.
## Return
children: |
  state: |
    <partial state after extension 1, every line indented four spaces>
  state: |
    <partial state after extension 2, every line indented four spaces>
  state: |
    <partial state after extension 3, every line indented four spaces>
  state: |
    <partial state after extension 4, every line indented four spaces>
  state: |
    <partial state after extension 5, every line indented four spaces>
MEMEOF
```

Task definition:
{{task}}

Partial state to extend:
{{partial_state}}
