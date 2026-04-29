# Strategy: Plan-Execute (recursive, fused tackle, anchored context)

IMPORTANT: Everything between "# Strategy" and "# Sub-instructions" is the strategy. It must be copied VERBATIM into every update_instructions call. Never modify, summarize, or omit any strategy instruction. Only the "# Sub-instructions" section below changes.

This interpreter implements the Plan-and-Execute pattern (patterns.md Group 2) as a thin orchestration shim: the strategy reads `PROGRAM.md`, pushes `tackle.md` once with the user goal AND the anchor context (`original_goal` = the same body, `parent_chain` = empty), and halts when `tackle.md` returns. All decomposition, iteration, and synthesis live inside `tackle.md`, which recursively calls itself for composite sub-goals.

The recursive split between dynamics (single-responsibility):
- `plan.md` — one-shot decomposition: given a goal AND its anchors, returns a list of sub-goals that contribute to the original_goal.
- `tackle.md` — given a goal + anchors, produce a result; atomic path executes one tool call directly, composite path pushes `plan.md` then recursively pushes `tackle.md` per sub-goal then synthesizes.
- The atomic-vs-composite decision lives in `tackle.md`'s Try instruction and is made adversarially: the same agent that just considered the goal decides whether one tool call suffices, with the original_goal and parent_chain visible as anchors so it can resist drifting into tangential topics.

**Anchor context** is the fix for the topic-drift failure mode that recursive decomposition is otherwise prone to: without it, each level only sees its own narrow sub-goal and the planner can drift arbitrarily; with it, every level always sees the original PROGRAM body and the trail of broader goals that led here, so sub-goals stay on-topic.

## Instruction: Initialize
**Condition:** MEMORY state is "empty"
**Action:** Read `../../PROGRAM.md`. Wholesale-rewrite MEMORY to push `tackle.md` with the program body as both `goal` and `original_goal`, and an empty `parent_chain` (single heredoc — the `## Push` block MUST be in the same write as the state change):

```
cat > ./MEMORY.md << 'MEMEOF'
## State
tackling
## Matched Instruction
Initialize
## Last Action
Pushed tackle.md with the user goal from PROGRAM.md as the root anchor.
## Result
Tackling.
## Push
dynamics/tackle.md
## Push-Args
goal: |
  <verbatim PROGRAM.md body, every line indented two spaces>
original_goal: |
  <verbatim PROGRAM.md body, every line indented two spaces — same as goal at the root>
parent_chain: |
  (none — this is the root tackle)
MEMEOF
```

The state value `tackling` is what the shell stores as the returnState; on pop it becomes `tackling_completed`, which "Finish" matches.

## Instruction: Finish
**Condition:** MEMORY state is "tackling_completed" and `## Result` is present
**Action:** The recursive solver completed and returned `## Result`. Set state to "done". The shell will halt at stack.length==1.

# Sub-instructions

(none — this interpreter needs none.)
