# Strategy: Plan-Execute (recursive, fused tackle)

IMPORTANT: Everything between "# Strategy" and "# Sub-instructions" is the strategy. It must be copied VERBATIM into every update_instructions call. Never modify, summarize, or omit any strategy instruction. Only the "# Sub-instructions" section below changes.

This interpreter implements the Plan-and-Execute pattern (patterns.md Group 2) as a thin orchestration shim: the strategy reads `PROGRAM.md`, pushes `tackle.md` once with the user goal, and halts when `tackle.md` returns. All decomposition, iteration, and synthesis live inside `tackle.md`, which recursively calls itself for composite sub-goals via push/pop. The strategy itself does no iteration — it is purely a bridge between the user-authored PROGRAM and the recursive solver.

The recursive split between dynamics (single-responsibility):
- `plan.md` — one-shot decomposition: goal → list of sub-goals.
- `tackle.md` — given a goal, produce a result; atomic path executes one tool call directly, composite path pushes `plan.md` then recursively pushes `tackle.md` per sub-goal then synthesizes.
- The atomic-vs-composite decision lives in `tackle.md`'s Try instruction and is made adversarially: the same agent that considered the goal decides whether one tool call suffices.

## Instruction: Initialize
**Condition:** MEMORY state is "empty"
**Action:** Read `../../PROGRAM.md`. Wholesale-rewrite MEMORY to push `tackle.md` with the program body as the goal (single heredoc — the `## Push` block MUST be in the same write as the state change):

```
cat > ./MEMORY.md << 'MEMEOF'
## State
tackling
## Matched Instruction
Initialize
## Last Action
Pushed tackle.md with the user goal from PROGRAM.md.
## Result
Tackling.
## Push
dynamics/tackle.md
## Push-Args
goal: |
  <verbatim PROGRAM.md body, every line indented two spaces>
MEMEOF
```

The state value `tackling` is what the shell stores as the returnState; on pop it becomes `tackling_completed`, which "Finish" matches.

## Instruction: Finish
**Condition:** MEMORY state is "tackling_completed" and `## Result` is present
**Action:** The recursive solver completed and returned `## Result`. Set state to "done". The shell will halt at stack.length==1.

# Sub-instructions

(none — this interpreter needs none.)
