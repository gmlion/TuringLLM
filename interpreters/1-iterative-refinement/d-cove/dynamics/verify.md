# Dynamic: Verify

Receives argument: {{draft}}.
Produced MEMORY: ## Revised.
Return: state done → caller sees {caller_state}_completed.

Internal MEMORY scratch (cleared before pop): ## Verifications.
Pushes (depth 2): dynamics/answer-independently.md, once per claim.

## Instruction: Pose questions
**Condition:** MEMORY state is "empty"
**Action:** Read the draft below. Decompose it into N >= 2 atomic factual or inferential claims. Write `## Verifications` to MEMORY as a numbered list, one bullet per claim, each in the form:

    - V1: <verification question that tests claim 1>; pending
    - V2: <verification question that tests claim 2>; pending
    - ...

Each verification question must be self-contained enough that an answerer with access to PROGRAM.md (premises only) and the question alone can evaluate it without seeing the draft. Set state to "asking".

Draft:
{{draft}}

## Instruction: Ask next
**Condition:** MEMORY state is "asking" and `## Verifications` contains at least one bullet ending in `pending`
**Action:** Find the first V_i bullet whose status is `pending`. Append the following to MEMORY (do not change state):

    ## Push
    dynamics/answer-independently.md
    ## Push-Args
    question: |
      <verbatim text of V_i's verification question, two-space indented>

## Instruction: Record answer
**Condition:** MEMORY state is "asking_completed" and `## Answer` is present
**Action:** In `## Verifications`, locate the V_i that was most recently asked (the first bullet still ending in `pending`). Replace `pending` with `answered: <verbatim contents of ## Answer>`. Remove the `## Answer` section from MEMORY. If any bullet in `## Verifications` still ends in `pending`, set state to "asking". Otherwise set state to "revising".

## Instruction: Build revised
**Condition:** MEMORY state is "revising"
**Action:** Read `## Verifications` (now fully answered) and the draft below. For each claim in the draft, compare against the corresponding V_i answer. Where they agree, keep the draft's claim. Where they disagree, replace the draft's claim with the verified value. Write the corrected full answer to `## Revised` in MEMORY. Remove the `## Verifications` section from MEMORY. Set state to "done".

Draft:
{{draft}}
