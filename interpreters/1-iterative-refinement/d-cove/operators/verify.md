# Dynamic: Verify

Receives argument: {{draft}}.
Produced MEMORY: ## State done + ## Return block with key `revised`.
Return: state done → caller sees {caller_state}_completed, and ## Return entry is spliced into caller's MEMORY as ## Revised.

Internal scoped file: `./scoped/verifications.md` (owned by this dynamic's frame; NOT a MEMORY section).
**WHOLESALE REWRITES of `./scoped/verifications.md` are FORBIDDEN after initial creation. All status updates MUST use surgical `sed -i` to modify individual bullet lines. Never use `cat >` or any full overwrite on this file after it is created.**

Pushes (depth 2): `dynamics/answer-independently.md`, once per pending verification question.

## Instruction: Pose questions
**Condition:** MEMORY state is "empty"
**Action:** Read the draft below. Decompose it into at least two (preferably 4–8) atomic factual or inferential claims. Write `./scoped/verifications.md` (wholesale create is fine — this is initial creation, not a mutation):

    - V1: <verification question that tests claim 1>; pending
    - V2: <verification question that tests claim 2>; pending
    - ...

Every bullet MUST end with the literal word `pending`. Each verification question must be self-contained: an answerer with only PROGRAM.md and the question can evaluate it without seeing the draft. Set MEMORY state to "asking".

**Prohibitions for this instruction:** Do NOT write `## Return`. Do NOT append `## Push` here. Do NOT set state to "done". You are only generating questions and writing the verifications file.

Draft:
{{draft}}

## Instruction: Ask next
**Condition:** MEMORY state is "asking" and `./scoped/verifications.md` has bullets ending in `pending`
**Action:** Find the FIRST bullet in `./scoped/verifications.md` whose status is the literal word `pending`. Append the following to `./MEMORY.md` (do not change state — the shell will set it to "empty" when it pushes the dynamic):

    ## Push
    dynamics/answer-independently.md
    ## Push-Args
    question: |
      <verbatim text of that pending bullet's verification question, every line indented two spaces>

Do NOT modify `./scoped/verifications.md` here. Do NOT write `## Return`. Do NOT change state — the shell handles it on push.

## Instruction: Record answer
**Condition:** MEMORY state is "asking_completed" and `## Answer` is present in MEMORY
**Action:**
1. Read `## Answer` from MEMORY.
2. SURGICALLY update `./scoped/verifications.md`: replace the FIRST bullet line whose status is the literal word `pending` with the same bullet text but status changed to `answered: <verbatim contents of ## Answer>`. Use `sed -i` for this single-line replacement — do NOT rewrite the whole file.
3. Remove the `## Answer` section from MEMORY.
4. Check whether any pending bullets remain: run `grep -c 'pending$' ./scoped/verifications.md`.
   - **If count > 0** (more questions remain): set state to "asking".
   - **If count == 0** (all questions answered): read `./scoped/verifications.md` and the draft below, synthesize a corrected full answer by comparing each verified claim against the original draft, then write `./MEMORY.md` with this EXACT single-heredoc shape (the `## Return` block MUST be in the same heredoc as the state change — without it the shell pops with no return value, breaking the caller):

         cat > ./MEMORY.md << 'MEMEOF'
         ## State
         done
         ## Matched Instruction
         Record answer (final)
         ## Last Action
         All verification questions answered; wrote revised draft to ## Return; popping back to caller.
         ## Result
         Verification complete.
         ## Return
         revised: |
           <your corrected full answer, every line indented two spaces>
         MEMEOF

Draft:
{{draft}}
