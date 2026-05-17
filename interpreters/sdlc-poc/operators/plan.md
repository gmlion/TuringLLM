# Dynamic: Plan

Receives push-args: `goal` (the current sub-goal to decompose), `original_goal` (the user's PROGRAM body — invariant at every recursion level), `parent_chain` (the trail of broader goals leading to the current sub-goal, or "(none — this is the root tackle)" at the top), `role` (the producer role identified at strategy Initialize, invariant throughout recursion).
Produces: `## Return` with key `plan` (a newline-separated bullet list of sub-tasks).
State flow: `empty` → `done`.

`plan.md` is a one-shot decomposer. Given a sub-goal AND its anchoring context AND the role, it returns the sub-tasks the role would naturally break the goal into. It does NOT iterate, does NOT classify atomicity, does NOT synthesize — those responsibilities live in `tackle.md`. The caller decides what to do with the returned plan.

## Instruction: Decompose
**Condition:** MEMORY state is "empty"
**Action:** Read the anchoring context first:

You are: {{role}}.

The user's original goal (the root, fixed throughout recursion):

    {{original_goal}}

The trail of broader goals that led to the current sub-task:

    {{parent_chain}}

The current sub-task to decompose:

    {{goal}}

As {{role}}, what 3–7 sub-tasks would you break the current sub-task into to advance the original goal? Use professional judgement appropriate to the role — the same way the role would actually structure this work. Each sub-task must be self-contained (a downstream agent given that sub-task plus the same anchors must be able to act on it or recurse on it). All sub-tasks at the same layer should have similar scope.

**Sub-tasks must be mutually independent.** Each one will be tackled by an isolated agent that sees only its own goal plus the same anchors — never its siblings' results, working state, or notes. Synthesis across siblings happens at the *parent* level after all children return, not inside any child. So decompose into **parallel structural components of the final artefact** — sections of a report, dimensions of a comparison, files in a project, items in a list, algorithms being studied. Do NOT decompose into **sequential workflow phases** (e.g. "gather sources → analyse → write up", "design → implement → test"); a phase-style split puts later children in frames with no access to earlier children's output, and produces hallucinated or empty sub-results. If sub-task B can't be addressed without sub-task A's output, your decomposition is structurally invalid.

Write `./MEMORY.md` with this EXACT single-heredoc shape (the `## Return` block MUST be in the same heredoc as the state change — without it the shell pops with no return value, breaking the caller):

```
cat > ./MEMORY.md << 'MEMEOF'
## State
done
## Matched Instruction
Decompose
## Last Action
Decomposed sub-task into ordered list as the role would naturally structure it; popping back to caller.
## Result
Plan produced.
## Return
plan: |
  - <sub-task 1>
  - <sub-task 2>
  - <sub-task 3>
  ...
MEMEOF
```
