# Dynamic: Score

Receives push-args: `{{thought}}`, `{{target}}`.
Produces: `## State done` + `## Return` block with key `value` set to one of `sure`, `likely`, or `impossible`.

This dynamic is invoked by the ToT strategy three times per child node. The strategy aggregates the three labels by weighted sum (sure=20, likely=1, impossible=0.001) per Yao et al. 2023.

## Instruction: Score thought
**Condition:** MEMORY state is "empty"
**Action:** Judge whether the partial Game-of-24 state below can reach the target. Output exactly one label:

- `sure` — the remaining numbers can definitely combine to make `{{target}}` (e.g. one number already equals the target, or two numbers obviously combine to it).
- `likely` — feasible but not obvious (one small operation away from a known-good intermediate).
- `impossible` — too-big-or-too-small commonsense rules it out (e.g. `{1, 1, 1}` cannot reach `{{target}}` if target ≫ 3).

Write `./MEMORY.md` with this EXACT single-heredoc shape (the `## Return` block MUST be in the same heredoc as the state change):

```
cat > ./MEMORY.md << 'MEMEOF'
## State
done
## Matched Instruction
Score thought
## Last Action
Scored partial state {{thought}} for target {{target}}; popping.
## Result
Score produced.
## Return
value: <one of: sure, likely, impossible>
MEMEOF
```

Partial state to score:
{{thought}}

Target:
{{target}}
