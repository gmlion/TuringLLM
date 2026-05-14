# Operator: Plan-Execute with HITL clarification preamble

IMPORTANT: This operator file is the canonical strategy. Do not modify it via update_instructions; it is only loaded at push-time.

Receives push-args:
  - `{{task}}` — the task body (PROGRAM.md content when bootstrap-loaded).
  - `{{prior_answer}}` — present in the shell's bootstrap dict but unused.

Produces: `## State done` + `## Return` block with key `answer`. The existing `## Result` section is also written for human inspection.

This is a HITL variant of `c-deep-research`. Before pushing the recursive `tackle.md` solver, the strategy frame asks the user a few clarifying questions whose answers materially shape the goal. The questions are **non-blocking**: they go into `## Pending Questions` *without* setting state to `waiting_for_user`, so the shell delivers them via Telegram/stdin and the strategy keeps gathering background context while the user thinks. Only if the strategy runs out of useful preliminary work before the user has answered does it fall back to `waiting_for_user`.

The strategy frame stays active across every clarify cycle — it does its own background `web_search` / `web_fetch` calls instead of pushing children. That's deliberate: it means the user's answers are routed back to this same frame's MEMORY by the shell's question-router, never to a child. Once the goal has been refined, the strategy pushes `tackle.md` exactly the way `c-deep-research` does, and the recursion proceeds unchanged.

Scoped files:
- `./scoped/background.md` — accumulating background notes. **Surgical-append only** (`echo` / `>>` / `cat >>`). Wholesale rewrites here will silently drop earlier cycles' findings.
- `./scoped/refined_goal.md` — the synthesized refined goal, written wholesale once just before pushing `tackle.md`.

## Instruction: Initialize
**Condition:** MEMORY state is "empty"
**Action:** Read the task body (substituted at push-time):

{{task}}

Identify 2–4 *specific* ambiguities or scope decisions whose resolution would materially change the final report — things like team size, latency budget, deployment target, whether self-hosted or managed offerings are in scope, language/runtime version constraints. Frame each as a concrete clarifying question (e.g. "What's the team size that will own this service?", "Are managed/serverless options in scope, or self-hosted only?"). Avoid open-ended questions like "What do you want to know?".

Then perform ONE preliminary `web_search` for context that will be useful regardless of how the user answers (e.g. an inventory of major options in the space). Surgically append a short summary of what you found to `./scoped/background.md`:

    mkdir -p ./scoped
    {
      echo ""
      echo "### Cycle $(date -Iseconds): initial inventory"
      echo "<one-paragraph summary of the inventory you just gathered>"
    } >> ./scoped/background.md

Wholesale-rewrite MEMORY (single heredoc — the `## Pending Questions` block MUST be in the same write as the state change):

```
cat > ./MEMORY.md << 'MEMEOF'
## State
gathering
## Matched Instruction
Initialize
## Last Action
Identified N clarifying ambiguities; sent N non-blocking questions; gathered initial inventory of options into ./scoped/background.md.
## Result
Awaiting answers; gathering background.
## Pending Questions
- **Q1**: <first clarifying question>
- **Q2**: <second clarifying question>
- **Q3**: <third clarifying question — if applicable>
MEMEOF
```

DO NOT set state to `waiting_for_user`. The shell delivers the questions immediately and we keep working.

## Instruction: Continue gathering (the non-blocking HITL loop)
**Condition:** MEMORY state is "gathering" or "user_responded"
**Action:** This instruction is the loop body. It runs once per cycle while we wait on the user; the user's answers, when they arrive, appear in `## Answers` (the shell's question-router routes them back to this frame).

Read `## Answers` (may be empty, partial, or complete) and `./scoped/background.md` (the accumulating notes).

Decide which transition to take this cycle:

**(a) All answers received AND background sufficient → state: refining.** Set state to `refining` (the next instruction handles the synthesis and push). Preserve `## Answers` verbatim.

```
cat > ./MEMORY.md << 'MEMEOF'
## State
refining
## Matched Instruction
Continue gathering
## Last Action
All clarifying answers received and background coverage is sufficient; transitioning to refine the goal.
## Result
Ready to refine.
## Answers
<verbatim contents of the previous ## Answers section>
MEMEOF
```

**(b) Background still has obvious gaps → stay state: gathering.** Identify ONE gap and perform ONE more `web_search` or `web_fetch` to close it. Surgically append the new finding (`echo "..." >> ./scoped/background.md`). Then write MEMORY preserving `## Answers` and `## Pending Questions`:

```
cat > ./MEMORY.md << 'MEMEOF'
## State
gathering
## Matched Instruction
Continue gathering
## Last Action
Closed background gap "<topic>" via web_search.
## Result
Background note appended.
## Pending Questions
<verbatim previous ## Pending Questions>
## Answers
<verbatim previous ## Answers, or omit the section if still empty>
MEMEOF
```

**(c) Background sufficient BUT some answers still missing → state: waiting_for_user.** This is the graceful fallback when we genuinely cannot make more useful progress without the user. Set state to `waiting_for_user`; the shell will block until any pending answer arrives, then resume this frame with state `user_responded`. Preserve `## Pending Questions` and any `## Answers`.

```
cat > ./MEMORY.md << 'MEMEOF'
## State
waiting_for_user
## Matched Instruction
Continue gathering
## Last Action
Background coverage sufficient but answers still missing; blocking on the user.
## Result
Blocking.
## Pending Questions
<verbatim previous ## Pending Questions>
## Answers
<verbatim previous ## Answers, or omit if still empty>
MEMEOF
```

When the user answers and the shell sets state to `user_responded`, this same instruction matches again and re-evaluates the (a)/(b)/(c) decision.

**Important constraints:**
- Never wholesale-rewrite `./scoped/background.md` — earlier cycles' work would vanish. Use `echo "..." >> ./scoped/background.md` (or a `{ ...; } >> ./scoped/background.md` group).
- Never push a child operator from this state. The strategy frame must stay active so the question-router knows where to deliver answers.
- Cap the gathering loop at roughly 5 background cycles; beyond that, prefer transition (c) over endlessly searching.

## Instruction: Refine and push
**Condition:** MEMORY state is "refining"
**Action:** Read `## Answers` and `./scoped/background.md`. Synthesize a refined goal: the user's PROGRAM merged with the user's answers and any concrete constraints discovered in background. Wholesale-write `./scoped/refined_goal.md` with the synthesized goal text — make it specific (concrete frameworks to compare, weighted criteria, output file path, etc.) so the recursive solver has unambiguous instructions.

Identify the producer role implicit in the refined goal (a one-line description of who would naturally produce this artefact — e.g. "a researcher producing a structured comparison of TypeScript HTTP frameworks for a small-team SaaS API").

Wholesale-rewrite MEMORY to push `tackle.md` (single heredoc — the `## Push` block MUST be in the same write as the state change):

```
cat > ./MEMORY.md << 'MEMEOF'
## State
tackling
## Matched Instruction
Refine and push
## Last Action
Synthesized refined goal from user answers + background; pushing tackle.md.
## Result
Tackling refined goal.
## Push
operators/tackle.md
## Push-Args
goal: |
  <verbatim ./scoped/refined_goal.md content, every line indented two spaces>
original_goal: |
  <verbatim ./scoped/refined_goal.md content, every line indented two spaces — same as goal at the root>
parent_chain: |
  (none — this is the root tackle)
role: |
  <one-line role descriptor derived from the refined goal, indented two spaces>
MEMEOF
```

The state value `tackling` is what the shell stores as the returnState; on pop it becomes `tackling_completed`, which "Finish" matches.

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
Recursive plan-execute solver completed; returning final report.
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
