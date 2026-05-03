# Strategy: Plan-Execute (recursive, fused tackle, role-anchored)

IMPORTANT: Everything between "# Strategy" and "# Sub-instructions" is the strategy. It must be copied VERBATIM into every update_instructions call. Never modify, summarize, or omit any strategy instruction. Only the "# Sub-instructions" section below changes.

This interpreter implements the Plan-and-Execute pattern (patterns.md Group 2) as a thin orchestration shim: the strategy reads `PROGRAM.md`, identifies the producer role implicit in it, pushes `tackle.md` once with the user goal AND the anchor context (`original_goal`, `parent_chain`, `role`), and halts when `tackle.md` returns. All decomposition, iteration, and synthesis live inside `tackle.md`, which recursively calls itself for composite sub-goals.

The recursive split between dynamics (single-responsibility):
- `plan.md` — one-shot decomposition: given a sub-goal, the role, and the anchors, returns a list of sub-tasks the role would naturally produce.
- `tackle.md` — given a sub-goal + role + anchors, produce a result; atomic path executes one tool call directly, composite path pushes `plan.md` then recursively pushes `tackle.md` per sub-task then synthesizes.
- The atomic-vs-composite decision in `tackle.md`'s Try is framed as a question of professional judgement in the role: "as {{role}}, would you produce this now or split it?" — not as a checklist of rules to match.

**Anchor context** (`original_goal`, `parent_chain`, `role`) is propagated unchanged through every recursion level. It is the only defence against semantic drift in deep decomposition trees, and the role-framing is the only defence against over-decomposition: a researcher writing one section just writes it; an analyst writing one summary just writes it.

## Instruction: Initialize
**Condition:** MEMORY state is "empty"
**Action:** Read `../../PROGRAM.md`. Identify the producer role implicit in the PROGRAM (a short one-line description of who would naturally produce this artefact, e.g. "a developer setting up a minimal TypeScript project", "a researcher producing a structured comparison of distributed consensus algorithms", "an analyst writing one-paragraph summaries of five technical notes"). Then wholesale-rewrite MEMORY to push `tackle.md` (single heredoc — the `## Push` block MUST be in the same write as the state change):

```
cat > ./MEMORY.md << 'MEMEOF'
## State
tackling
## Matched Instruction
Initialize
## Last Action
Identified producer role and pushed tackle.md with the user goal as the root anchor.
## Result
Tackling.
## Push
operators/tackle.md
## Push-Args
goal: |
  <verbatim PROGRAM.md body, every line indented two spaces>
original_goal: |
  <verbatim PROGRAM.md body, every line indented two spaces — same as goal at the root>
parent_chain: |
  (none — this is the root tackle)
role: |
  <one-line role descriptor derived from PROGRAM, indented two spaces>
MEMEOF
```

The state value `tackling` is what the shell stores as the returnState; on pop it becomes `tackling_completed`, which "Finish" matches.

## Instruction: Finish
**Condition:** MEMORY state is "tackling_completed" and `## Result` is present
**Action:** The recursive solver completed and returned `## Result`. Set state to "done". The shell will halt at stack.length==1.

# Sub-instructions

(none — this interpreter needs none.)
