# Dynamic: Expand Node

Receives push-args: `{{parent_thought}}`, `{{target}}`, `{{numbers_remaining}}`.
Produces: `## State done` + `## Return` block with key `children`.

This dynamic is invoked by the ToT strategy once per live unexpanded tree node. One invocation generates exactly k=5 candidate next moves, each consuming two of `{{numbers_remaining}}` and producing one new number from a binary op (`+`, `−`, `×`, `÷`). The resulting `left` set is the remaining numbers plus the new number.

## Instruction: Generate children
**Condition:** MEMORY state is "empty"
**Action:** Generate exactly 5 candidate next moves for the parent state below, targeting `{{target}}`. For each move:

- Pick two distinct numbers from `{{numbers_remaining}}`.
- Apply one of `+`, `−`, `×`, `÷`.
- The new `left` set is the unused numbers plus the new result.
- Avoid producing five identical entries; prefer diverse operations.

Write `./MEMORY.md` with this EXACT single-heredoc shape (the `## Return` block MUST be in the same heredoc as the state change — without it the shell pops with no return value, breaking the caller):

```
cat > ./MEMORY.md << 'MEMEOF'
## State
done
## Matched Instruction
Generate children
## Last Action
Generated five candidate next moves for parent state {{parent_thought}}; popping back to controller.
## Result
Children produced.
## Return
children: |
  op: <a> <op> <b> = <result>
  left: <space-separated remaining numbers + result>
  op: <a> <op> <b> = <result>
  left: <space-separated remaining numbers + result>
  op: <a> <op> <b> = <result>
  left: <space-separated remaining numbers + result>
  op: <a> <op> <b> = <result>
  left: <space-separated remaining numbers + result>
  op: <a> <op> <b> = <result>
  left: <space-separated remaining numbers + result>
MEMEOF
```

Parent state:
{{parent_thought}}

Numbers remaining:
{{numbers_remaining}}

Target:
{{target}}
