# Operator: Phase — Backlog

IMPORTANT: This operator file is the canonical phase shim. Do not modify it via update_instructions; it is only loaded at push-time.

Receives push-args: none. Reads PROGRAM.md plus 00, 01, 02 directly.

Produces: `## State done` + `## Return` with key `artefact` (`../../workspace/03-backlog.md`) and (on dialogue evaluator fail) `verdict` + `feedback`.

This shim runs Phase 3. Two steps:

1. **Decompose** — push `plan-execute.md` with a goal that tells the recursive workers to read 01-requirements, 02-design (for component boundaries) and produce the E#/F#/S# tree. Result lands as `## Answer` and is written to `../../workspace/03-backlog.md`.
2. **Debate** — push `dialogue.md` with participants `pm,qa,architect`, `acceptance: true`. The dialogue validates the tree against R# coverage, every story has Given/When/Then AC, and produces a final consensus body which overwrites `03-backlog.md`.

## Instruction: Initialize — push decomposer
**Condition:** MEMORY state is "empty"
**Action:** Wholesale-rewrite MEMORY with a static push of `plan-execute.md` to produce the v0 tree.

    cat > ./MEMORY.md << 'MEM_EOF'
    ## State
    decomposing
    ## Matched Instruction
    Initialize — push decomposer
    ## Last Action
    Pushed plan-execute.md to decompose the requirements into an E#/F#/S# backlog tree.
    ## Result
    Backlog decomposition initiated.
    ## Push
    operators/plan-execute.md
    ## Push-Args
    task: |
      Produce a v0 backlog tree at ../../workspace/03-backlog.md, decomposing the approved requirements into epics → features → stories.

      INPUTS — read these via bash before drafting:
        - ../../PROGRAM.md (POC name)
        - ../../workspace/01-requirements.md (the R# list this backlog must cover)
        - ../../workspace/02-design.md (component boundaries inform feature seams)
        - ../../workspace/.sdlc/backlog-refinement-note.md (if NON-EMPTY, address it)
        - ../../workspace/03-backlog.md (if it exists, preserve existing E#/F#/S# IDs; only APPEND new ones)

      OUTPUT — write ../../workspace/03-backlog.md with this schema:

          # Backlog: <POC name>

          ## Tree

          ### E1: <Epic name>
          **Goal:** <one paragraph>
          **Satisfies:** R1, R2

          #### E1.F1: <Feature name>
          **Satisfies:** R1
          **ADRs:** ADR-001

          ##### E1.F1.S1: <Story title>
          > As a <role>, I want <capability>, so that <benefit>.
          - **Satisfies:** R1
          - **Acceptance:**
            - Given <state>, when <action>, then <observable outcome>.
          - **Realised by tasks:** (to be filled in Phase 4)

          ##### E1.F1.S2: ...

          #### E1.F2: ...

          ### E2: ...

          ## Coverage check
          - R1 → E1.F1.S1
          - R2 → E1.F1.S2, E1.F2.S1

      RULES:
        - Every R# from 01-requirements.md must appear in the Coverage check section.
        - Every story has Given/When/Then acceptance criteria of its own.
        - IDs are parent-qualified (E1.F1.S1, etc.) and stable across refinement.
        - Epics named after user goals, not implementation layers.

      Your ## Answer must be the FULL text of the backlog file.
    prior_answer: |
      (none — fresh decomposition)
    MEM_EOF

(Post-pop state will be "decomposing_completed".)

## Instruction: Decomposer done — stage dialogue
**Condition:** MEMORY state is "decomposing_completed" and `## Answer` is present
**Action:** Extract the v0 tree to `../../workspace/03-backlog.md`, prune splice, park at the dialogue-push state.

    mkdir -p ../../workspace
    awk '/^## Answer$/{f=1; next} /^## [A-Z]/ && f {exit} f' ./MEMORY.md > ../../workspace/03-backlog.md
    awk 'BEGIN{f=0} /^## (Answer|Refined|Revised|Result)$/{f=1; next} /^## [A-Z]/ && f {f=0} !f' ./MEMORY.md > ./MEMORY.md.tmp && mv ./MEMORY.md.tmp ./MEMORY.md
    sed -i 's/^decomposing_completed$/dialogue_pushing/' ./MEMORY.md

## Instruction: Push dialogue
**Condition:** MEMORY state is "dialogue_pushing"
**Action:** Wholesale-rewrite MEMORY with a static push of `dialogue.md`.

    cat > ./MEMORY.md << 'MEM_EOF'
    ## State
    dialoguing
    ## Matched Instruction
    Push dialogue
    ## Last Action
    Pushed dialogue.md with participants pm,qa,architect to validate and refine the backlog tree.
    ## Result
    Backlog dialogue initiated.
    ## Push
    operators/dialogue.md
    ## Push-Args
    participants: |
      pm,qa,architect
    topic: |
      Validate and refine the v0 backlog tree at ../../workspace/03-backlog.md against the approved requirements and design. The roles produce a consensus tree.

      INPUTS — each speaker reads (via bash) at the start of every turn:
        - ../../workspace/01-requirements.md (R# coverage check)
        - ../../workspace/02-design.md (feature boundaries)
        - ../../workspace/03-backlog.md (current draft)
        - ../../workspace/.sdlc/backlog-refinement-note.md (if NON-EMPTY, address it)

      OUTPUT — the speaker who emits <SOLUTION> writes the consensus body to ../../workspace/03-backlog.md via bash, following the schema already present (E#/F#/S# tree + Coverage check).

      ROLE TURN INSTRUCTIONS:
        - PM (scribe / first speaker): drafts the consensus; redrafts each round.
        - QA: every turn, checks every story has Given/When/Then AC; flags vague AC ("works correctly").
        - Architect: every turn, checks feature seams align with the design's component boundaries; flags epics organised by code-shape instead of user-shape.

      A speaker emits <SOLUTION> followed by the full file body when all three roles agree.
    input: |
      Upstream artefacts: 01-requirements.md and 02-design.md. Draft tree: 03-backlog.md.
    output_path: |
      ../../workspace/03-backlog.md
    acceptance: |
      true
    MEM_EOF

(Post-pop state will be "dialoguing_completed".)

## Instruction: Finish
**Condition:** MEMORY state is "dialoguing_completed"
**Action:** Capture verdict + feedback and return.

    VERDICT=$(awk '/^## Verdict$/{f=1; next} /^## [A-Z]/ && f {exit} f' ./MEMORY.md | head -n 1)
    FEEDBACK=$(awk '/^## Feedback$/{f=1; next} /^## [A-Z]/ && f {exit} f' ./MEMORY.md)
    if [ -z "$VERDICT" ]; then VERDICT=pass; fi

    cat > ./MEMORY.md << FINEOF
    ## State
    done
    ## Matched Instruction
    Finish
    ## Last Action
    Backlog dialogue completed; verdict=${VERDICT}.
    ## Result
    Phase Backlog complete.
    ## Return
    artefact: |
      ../../workspace/03-backlog.md
    verdict: ${VERDICT}
    feedback: |
$(printf '%s\n' "${FEEDBACK}" | sed 's/^/      /')
    FINEOF

# Sub-instructions

(none — this operator needs none.)
