# Dynamic: Plan

Receives push-args: `goal` (the current sub-goal to decompose), `original_goal` (the user's PROGRAM body — the same at every recursion level), `parent_chain` (the trail of broader goals that led to the current sub-goal, or "(none — this is the root tackle)" at the top).
Produces: `## Return` with key `plan` (a newline-separated bullet list of sub-goals).
State flow: `empty` → `done`.

`plan.md` is a one-shot decomposer. Given a sub-goal AND its anchoring context, it returns a list of sub-goals that decompose the current goal in a way that contributes to the original_goal. It does NOT iterate, does NOT classify atomicity, does NOT synthesize — those responsibilities live in `tackle.md`. The caller decides what to do with the returned plan.

## Instruction: Decompose
**Condition:** MEMORY state is "empty"
**Action:** Read the anchoring context first:

The user's original goal (the root, fixed throughout recursion):

    {{original_goal}}

The trail of broader goals that led to the current sub-goal:

    {{parent_chain}}

The current sub-goal to decompose:

    {{goal}}

**Decomposition rules:**

1. Produce 3–7 sub-goals at the same level of granularity. All sub-goals at the same layer must have similar scope — never mix broad and narrow ones in the same plan.
2. Every sub-goal must trace back through the parent chain to contribute meaningfully to the **original_goal**. If a candidate sub-goal could be sensible in isolation but doesn't actually advance the original goal, drop it.
3. **Beware semantic drift.** If you find yourself producing sub-goals on a topic that is only tangentially related to the original_goal — re-read the original_goal and re-anchor. The recursive decomposition pattern is prone to drift; this instruction is the only place that can catch it.
4. Each sub-goal must be self-contained: a downstream agent given that one sub-goal plus the same anchors as input must be able to act on it (or recurse on it) without needing the others.

Write `./MEMORY.md` with this EXACT single-heredoc shape (the `## Return` block MUST be in the same heredoc as the state change — without it the shell pops with no return value, breaking the caller):

```
cat > ./MEMORY.md << 'MEMEOF'
## State
done
## Matched Instruction
Decompose
## Last Action
Produced ordered list of sub-goals anchored to the original_goal; popping back to caller.
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
