# Operator: Phase — Single ADR

IMPORTANT: This operator file is the canonical phase shim. Do not modify it via update_instructions; it is only loaded at push-time.

Receives push-args:
  - `{{adr_number}}` — e.g. `ADR-001` (with the `ADR-` prefix and zero-padded).
  - `{{adr_title}}` — the title of the decision.

Produces: `## State done` + `## Return` with key `artefact` (the written `02-adr/ADR-NNN-<slug>.md` path) and (when the dialogue's evaluator failed) `verdict` + `feedback`.

This shim is pushed by `phase-design.md` once per row in the design body's "Decisions (ADR index)" table. It runs a four-role dialogue (Architect, Engineer, QA, Devil's Advocate) over the single decision named by the push-args, then writes one ADR file under `../../workspace/02-adr/`.

Slug is computed from the title (lowercase, non-alphanumeric → hyphen, collapsed).

## Instruction: Initialize — push ADR dialogue
**Condition:** MEMORY state is "empty"
**Action:** Compute slug and output path, then wholesale-rewrite MEMORY with a static push of `dialogue.md`. The push-args themselves are static (the topic embeds the title and the design-body path via the substituted `{{adr_title}}` and `{{adr_number}}`).

    ADR_NUMBER='{{adr_number}}'
    ADR_TITLE='{{adr_title}}'
    NUM=$(echo "$ADR_NUMBER" | sed 's/^ADR-//')
    SLUG=$(echo "$ADR_TITLE" | tr '[:upper:]' '[:lower:]' | sed 's/[^a-z0-9]/-/g; s/--*/-/g; s/^-//; s/-$//')
    OUTPATH="../../workspace/02-adr/ADR-${NUM}-${SLUG}.md"
    mkdir -p ../../workspace/02-adr

    cat > ./MEMORY.md << MEM_EOF
    ## State
    dialoguing
    ## Matched Instruction
    Initialize — push ADR dialogue
    ## Last Action
    Pushed dialogue.md with participants architect,engineer,qa,devils-advocate for ${ADR_NUMBER}.
    ## Result
    ADR dialogue initiated for ${ADR_NUMBER}.
    ## Push
    operators/dialogue.md
    ## Push-Args
    participants: |
      architect,engineer,qa,devils-advocate
    topic: |
      Produce ${ADR_NUMBER} ("${ADR_TITLE}") at ${OUTPATH}.

      CONTEXT — read these via bash at the start of every turn:
        - ../../workspace/02-design.md (the design body that names this decision)
        - ../../workspace/01-requirements.md (R# identifiers this decision drives)
        - ../../PROGRAM.md
        - ../../workspace/.sdlc/design-refinement-note.md (if NON-EMPTY, may apply to this ADR)

      OUTPUT — the speaker who emits <SOLUTION> writes ${OUTPATH} via bash with this schema:

          # ${ADR_NUMBER}: ${ADR_TITLE}

          - **Status:** proposed | accepted | superseded by ADR-### | deprecated
          - **Date:** YYYY-MM-DD
          - **Drives requirements:** R#, R#
          - **Relates to properties:** P#

          ## Context
          <the forces in tension — why a decision is needed>

          ## Decision
          <the choice taken, in one or two sentences first, then expanded>

          ## Consequences
          - **Positive:** ...
          - **Negative:** ...
          - **Neutral / follow-ups:** ...

          ## Alternatives considered
          - **Alt A:** <one-paragraph description>. Rejected because <substantive reason>.
          - **Alt B:** ...

      ROLE TURN INSTRUCTIONS:
        - Architect (scribe / first speaker): drafts v0 and defends the chosen Decision; redrafts each round.
        - Engineer: checks the Decision's feasibility and the costs in the Consequences section are honestly named.
        - QA: checks the Decision interacts cleanly with the test strategy and named test surfaces.
        - Devil's Advocate: steelmans each alternative in the Alternatives section; refuses to let Architect dismiss an alternative on a surface reason. Forces every rejected alternative to be defeated on a substantive axis.

      A speaker emits <SOLUTION> followed by the full ADR file body when all four roles agree. ${OUTPATH} must be on disk at that point.
    input: |
      The design body is at ../../workspace/02-design.md. Read it at every turn.
    output_path: |
      ${OUTPATH}
    acceptance: |
      true
    MEM_EOF

    echo "$OUTPATH" > ./scoped/output-path.md

(Post-pop state will be "dialoguing_completed".)

## Instruction: Finish
**Condition:** MEMORY state is "dialoguing_completed"
**Action:** Capture verdict + feedback and return.

    VERDICT=$(awk '/^## Verdict$/{f=1; next} /^## [A-Z]/ && f {exit} f' ./MEMORY.md | head -n 1)
    FEEDBACK=$(awk '/^## Feedback$/{f=1; next} /^## [A-Z]/ && f {exit} f' ./MEMORY.md)
    OUTPATH=$(cat ./scoped/output-path.md)
    if [ -z "$VERDICT" ]; then VERDICT=pass; fi

    cat > ./MEMORY.md << FINEOF
    ## State
    done
    ## Matched Instruction
    Finish
    ## Last Action
    ADR dialogue completed; verdict=${VERDICT}; wrote ${OUTPATH}.
    ## Result
    ADR complete.
    ## Return
    artefact: |
      ${OUTPATH}
    verdict: ${VERDICT}
    feedback: |
$(printf '%s\n' "${FEEDBACK}" | sed 's/^/      /')
    FINEOF

# Sub-instructions

(none — this operator needs none.)
