# Operator: Phase — Requirements

IMPORTANT: This operator file is the canonical phase shim. Do not modify it via update_instructions; it is only loaded at push-time.

Receives push-args: none. This shim reads PROGRAM.md and the approved upstream artefact (`../../workspace/00-system-summary.md`) directly.

Produces: `## State done` + `## Return` with keys `artefact`, and (when the dialogue's acceptance evaluator failed) `verdict` + `feedback`. The orchestrator's "Phase completed — stage gate" instruction consumes those.

This shim runs Phase 1 of the SDLC POC pipeline. It pushes `dialogue.md` once with three participants (PM, QA, Architect) and `acceptance: true`. The dialogue ends when one role emits `<SOLUTION>` or after the 10-turn cap, then `evaluate.md` (auto-pushed by dialogue) signs off on `../../workspace/01-requirements.md`. The roles write the artefact body to that path via bash during their turns.

If a refinement note exists at `../../workspace/.sdlc/requirements-refinement-note.md`, the topic asks the roles to read and apply it.

## Instruction: Initialize — push dialogue
**Condition:** MEMORY state is "empty"
**Action:** Wholesale-rewrite MEMORY with a static push of `dialogue.md`.

    cat > ./MEMORY.md << 'MEM_EOF'
    ## State
    dialoguing
    ## Matched Instruction
    Initialize — push dialogue
    ## Last Action
    Pushed dialogue.md with participants pm,qa,architect for the requirements phase.
    ## Result
    Requirements dialogue initiated.
    ## Push
    operators/dialogue.md
    ## Push-Args
    participants: |
      pm,qa,architect
    topic: |
      Produce a requirements artefact at ../../workspace/01-requirements.md that captures every behaviour the POC must satisfy, drawn from the approved system summary.

      INPUTS — each speaker reads (via bash) at the start of every turn:
        - ../../PROGRAM.md (POC name + constraints)
        - ../../workspace/00-system-summary.md (the approved upstream artefact)
        - ../../workspace/.sdlc/requirements-refinement-note.md (if NON-EMPTY, a user refinement note; address it)
        - ../../workspace/01-requirements.md (if it already exists from a previous run, preserve all existing R# identifiers; only APPEND new ones, never renumber)

      OUTPUT — the consensus body, written by the speaker who emits <SOLUTION> directly to ../../workspace/01-requirements.md via bash. Use this schema:

          # Requirements: <POC name>

          ## Context
          <2-5 paragraphs framing what is being mocked and why a POC is being built>

          ## User stories (high level)
          <bulleted, narrative — just enough to motivate R#; not the granular S# stories>

          ## Acceptance criteria (EARS)
          - **R1** — <EARS statement>
          - **R2** — <EARS statement>

          ## Out of scope
          - <numbered list, fed by the summary's "Behaviours intentionally NOT mocked">

          ## Open questions
          - <numbered list, each marked [blocker] or [non-blocker]>

      EARS templates:
        - When <trigger>, the system shall <behaviour>.
        - While <state>, the system shall <invariant>.
        - Where <feature>, the system shall <…>.
        - If <condition> then the system shall <response>.
        - Ubiquitous: The system shall always <…>.

      RULES:
        - Every numbered behaviour from the summary's "Behaviours to preserve" MUST appear as an R#.
        - Every R# must be testable and implementation-agnostic.
        - R# IDs are stable: never renumber existing IDs across refinements; only append.
        - No placeholders. No "TODO". No "similar to above".

      ROLE TURN INSTRUCTIONS:
        - PM (scribe / first speaker): drafts v0; on later turns, redrafts to address QA/Architect critiques.
        - QA: every turn, checks testability and EARS shape; calls out R#s that fail.
        - Architect: every turn, checks for implementation-locking and missing cross-cut concerns.

      A speaker emits <SOLUTION> followed by the full file body when all three roles agree the artefact is complete and correct. The artefact file at ../../workspace/01-requirements.md must already be on disk (written via bash) at the moment <SOLUTION> is emitted — the evaluator checks the file, not the transcript.
    input: |
      The approved system summary is at ../../workspace/00-system-summary.md. Read it at the start of every turn.
    output_path: |
      ../../workspace/01-requirements.md
    acceptance: |
      true
    MEM_EOF

(Post-pop state will be "dialoguing_completed".)

## Instruction: Finish
**Condition:** MEMORY state is "dialoguing_completed"
**Action:** The dialogue popped. The shell spliced `## Dialogue` (a "written to <path>" marker) plus `## Verdict` and `## Feedback` from the auto-evaluator into MEMORY. Capture the verdict + feedback (so the orchestrator can surface them to the user on `fail`) and return.

    VERDICT=$(awk '/^## Verdict$/{f=1; next} /^## [A-Z]/ && f {exit} f' ./MEMORY.md | head -n 1)
    FEEDBACK=$(awk '/^## Feedback$/{f=1; next} /^## [A-Z]/ && f {exit} f' ./MEMORY.md)
    if [ -z "$VERDICT" ]; then VERDICT=pass; fi

Write `./MEMORY.md` with the FULL done state in a SINGLE heredoc (the `## Return` block MUST be in the same heredoc as the state change — at depth>=1 the shell pops on state is "done" BEFORE any subsequent instruction runs):

    cat > ./MEMORY.md << FINEOF
    ## State
    done
    ## Matched Instruction
    Finish
    ## Last Action
    Requirements dialogue completed; verdict=${VERDICT}.
    ## Result
    Phase Requirements complete.
    ## Return
    artefact: |
      ../../workspace/01-requirements.md
    verdict: ${VERDICT}
    feedback: |
$(printf '%s\n' "${FEEDBACK}" | sed 's/^/      /')
    FINEOF

# Sub-instructions

(none — this operator needs none.)
