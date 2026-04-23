# Dynamic: Verify

Receives argument: {{draft}}.
Produced MEMORY: ## Revised.
Return: state done → caller sees {caller_state}_completed.

Internal MEMORY scratch (cleared before pop): ## Verifications.
Pushes (depth 2): dynamics/answer-independently.md, once per claim.

## Instruction: Pose questions
**Condition:** MEMORY state is "empty"
**Action:** Read the draft below. Decompose it into at least two atomic factual or inferential claims (prefer 4–8 for a rich draft). Write `## Verifications` to MEMORY as a numbered list, one bullet per claim, each in the form:

    - V1: <verification question that tests claim 1>; pending
    - V2: <verification question that tests claim 2>; pending
    - ...

Every bullet MUST end with the literal word `pending`. Each verification question must be self-contained enough that an answerer with access to PROGRAM.md (premises only) and the question alone can evaluate it without seeing the draft. Set state to "asking".

**Prohibitions for this instruction:** Do NOT write `## Revised`. Do NOT append `## Push` here. Do NOT set state to "revising" or "done". You are only generating questions.

Draft:
{{draft}}

## Instruction: Ask next or transition to revising
**Condition:** MEMORY state is "asking"
**Action:** Scan `## Verifications`. Count the bullets whose status is literally the word `pending`.

- **If the pending count is greater than zero:** find the FIRST bullet whose status is `pending`, and append to MEMORY:

        ## Push
        dynamics/answer-independently.md
        ## Push-Args
        question: |
          <verbatim text of that pending V_i's verification question, every line indented two spaces>

  Do NOT change state (the shell will set it to "empty" when it pushes the dynamic). Do NOT write `## Revised`. Do NOT modify `## Verifications` — the pending bullet's status is updated by "Record answer" after the child pops back, not here.

- **If the pending count is exactly zero** (every bullet's status starts with `answered:`): set state to "revising". Do NOT append `## Push`. Do NOT write `## Revised` in this instruction — that is "Build revised"'s job.

## Instruction: Record answer
**Condition:** MEMORY state is "asking_completed" and `## Answer` is present
**Action:** In `## Verifications`, locate the FIRST bullet whose status is literally `pending` (answers are recorded in the same order questions were asked, so the first pending bullet is the one that was just answered). Replace that bullet's `pending` with `answered: <verbatim contents of ## Answer>`. Remove the `## Answer` section from MEMORY. Set state to "asking".

**Strict prohibitions for this instruction:** state MUST be set to "asking", unconditionally, regardless of how many bullets remain pending. Do NOT inspect the remaining bullets here. Do NOT write `## Revised`. Do NOT clear or remove `## Verifications`. Do NOT set state to "revising" or "done" — that decision belongs to "Ask next or transition to revising", which runs next. Your only job is: one record, one state transition to `asking`.

## Instruction: Build revised
**Condition:** MEMORY state is "revising"
**Action:** By the time this instruction fires, every bullet in `## Verifications` is guaranteed to start with `answered:` (otherwise "Ask next or transition to revising" would not have set state to "revising"). Read `## Verifications` and the draft below. For each claim in the draft, compare against the corresponding V_i answer. Where they agree, keep the draft's claim. Where they disagree, replace the draft's claim with the verified value. Write the corrected full answer to `## Revised` in MEMORY. Remove the `## Verifications` section from MEMORY. Set state to "done".

Draft:
{{draft}}
