# Operator: Plan-Execute (recursive, fused tackle, role-anchored)

IMPORTANT: This operator file is the canonical strategy. Do not modify it via update_instructions; it is only loaded at push-time.

Receives push-args (mode 1: standalone via root-operator bootstrap):
  - `{{program}}` — the user's PROGRAM.md content.

Receives push-args (mode 2: invoked by aflow-lite as part of a workflow):
  - `{{task}}` — the task description (e.g. one GSM8K item's question text).
  - `{{prior_answer}}` — the previous operator's `## Answer`, or empty for the first operator.

Produces: `## State done` + `## Return` block with key `answer`. The existing `## Result` section is also written for human inspection.

This interpreter implements the Plan-and-Execute pattern (patterns.md Group 2) as a thin orchestration shim: the strategy identifies the producer role implicit in the goal, pushes `tackle.md` once with the user goal AND the anchor context (`original_goal`, `parent_chain`, `role`), and halts when `tackle.md` returns. All decomposition, iteration, and synthesis live inside `tackle.md`, which recursively calls itself for composite sub-goals.

The recursive split between operators (single-responsibility):
- `plan.md` — one-shot decomposition: given a sub-goal, the role, and the anchors, returns a list of sub-tasks the role would naturally produce.
- `tackle.md` — given a sub-goal + role + anchors, produce a result; atomic path executes one tool call directly, composite path pushes `plan.md` then recursively pushes `tackle.md` per sub-task then synthesizes.
- The atomic-vs-composite decision in `tackle.md`'s Try is framed as a question of professional judgement in the role — "as <the producer role>, would you produce this now or split it?" — not as a checklist of rules to match. (`tackle.md` itself receives the role as a real push-arg; this prose just describes the rhetorical framing.)

**Anchor context** (`original_goal`, `parent_chain`, `role`) is propagated unchanged through every recursion level. It is the only defence against semantic drift in deep decomposition trees, and the role-framing is the only defence against over-decomposition: a researcher writing one section just writes it; an analyst writing one summary just writes it.

## Instruction: Initialize
**Condition:** MEMORY state is "empty"
**Action:** Detect which mode this operator was invoked in, then identify the producer role and push tackle.md.

    # Detect mode (R47): if {{task}} is still a literal token, we are in standalone mode.
    # substitutePlaceholders only replaces what was passed in ## Push-Args, so
    # an unsubstituted {{task}} token remains verbatim in INSTRUCTIONS.md.
    if grep -qF '{{task}}' ./INSTRUCTIONS.md; then
      # Mode 1 — standalone: {{program}} was substituted with PROGRAM.md content.
      # The task is the full program text (visible inline below in this file).
      MODE="standalone"
    else
      # Mode 2 — AFlow-lite: {{task}} was substituted with the item's question text
      # and {{prior_answer}} was substituted with the previous operator's answer.
      MODE="aflow"
    fi

Identify the producer role implicit in the goal (a short one-line description of who would naturally produce this artefact, e.g. "a developer setting up a minimal TypeScript project", "a researcher producing a structured comparison of distributed consensus algorithms", "an analyst writing one-paragraph summaries of five technical notes"). In AFlow-lite mode, if `{{prior_answer}}` is non-empty, prepend it as context for the role. Then wholesale-rewrite MEMORY to push `tackle.md` (single heredoc — the `## Push` block MUST be in the same write as the state change):

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
  <verbatim goal content, every line indented two spaces>
original_goal: |
  <verbatim goal content, every line indented two spaces — same as goal at the root>
parent_chain: |
  (none — this is the root tackle)
role: |
  <one-line role descriptor derived from the goal, indented two spaces>
MEMEOF
```

The state value `tackling` is what the shell stores as the returnState; on pop it becomes `tackling_completed`, which "Finish" matches.

Program (mode 1 — substituted at push-time):
{{program}}

Task (mode 2 — substituted at push-time):
{{task}}

Prior answer (mode 2 — substituted at push-time, may be empty):
{{prior_answer}}

## Instruction: Finish
**Condition:** MEMORY state is "tackling_completed" and `## Result` is present
**Action:** The recursive solver completed and returned `## Result`. Set state to "done". Read `## Result` and write `./MEMORY.md` with this EXACT single-heredoc shape (the `## Return` block MUST be in the same heredoc as the state change — without it the caller receives no return value):

```
cat > ./MEMORY.md << FINEOF
## State
done
## Matched Instruction
Finish
## Last Action
Recursive plan-execute solver completed.
## Result
$(cat ./MEMORY.md | sed -n '/^## Result/{n;p}')
## Return
answer: |
$(grep -A1000 '^## Result' ./MEMORY.md | tail -n +2 | head -n -1 | sed 's/^/  /')
FINEOF
```

The shell will halt at stack.length==1.

# Sub-instructions

(none — this operator needs none.)
