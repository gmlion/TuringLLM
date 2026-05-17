# Operator: Phase — Summarise

IMPORTANT: This operator file is the canonical phase shim. Do not modify it via update_instructions; it is only loaded at push-time.

Receives push-args: none (this shim reads PROGRAM.md and the refinement-note file directly).

Produces: `## State done` + `## Return` block with key `artefact` (the path of the written summary). The orchestrator's "Phase completed — stage gate" instruction consumes that key.

This shim runs Phase 0 of the SDLC POC pipeline: turn the user's source documents into a normalised system summary at `../../workspace/00-system-summary.md`. Two steps:

1. **Draft** — push `plan-execute.md` with a task that asks for a structured summary following the canonical schema, decomposed by section if needed. plan-execute / tackle write to workspace and return the text via `## Answer`.
2. **Verify** — push `cove.md` with the draft as `prior_answer`. CoVe decomposes the summary into atomic claims and verifies each one independently against the source documents (which the answerers read via PROGRAM.md). CoVe returns the corrected text via `## Answer`, which this shim writes back to the workspace path.

Refinement: if `../../workspace/.sdlc/summarise-refinement-note.md` is non-empty, the task description tells the recursive workers to read and apply it.

Scoped files:
- `./scoped/draft.md` — the unverified draft (written between the two steps).

## Instruction: Initialize — push drafter
**Condition:** MEMORY state is "empty"
**Action:** Wholesale-rewrite MEMORY with a static push of `plan-execute.md`. The task description tells the recursive workers to read PROGRAM.md, every listed source document, the existing summary (if refining), and any refinement note, and to write the result to `../../workspace/00-system-summary.md`.

    cat > ./MEMORY.md << 'MEM_EOF'
    ## State
    drafting
    ## Matched Instruction
    Initialize — push drafter
    ## Last Action
    Pushed plan-execute.md to draft the system summary.
    ## Result
    Drafting phase initiated.
    ## Push
    operators/plan-execute.md
    ## Push-Args
    task: |
      Produce a normalised system summary at ../../workspace/00-system-summary.md.

      INPUTS — read these via bash before writing anything:
        1. ../../PROGRAM.md — contains the POC name (first line after "# POC:") and a "## Source documents" section listing the source documents to read.
        2. Every source document listed under "## Source documents" in PROGRAM.md.
        3. ../../workspace/.sdlc/summarise-refinement-note.md — if this file is NON-EMPTY, it is a user refinement note from a previous gate; apply it.
        4. ../../workspace/00-system-summary.md — if this file already EXISTS (refinement run), read it and preserve its structure; you are improving it, not replacing it from scratch.

      OUTPUT — write the summary to ../../workspace/00-system-summary.md with this exact schema:

          # System Summary: <POC name from PROGRAM.md>

          ## Source documents
          - <path> — <one-line description, drawn from the document itself>

          ## Purpose of the real system

          ## External interfaces
          - <name>: <shape> — <who calls it / who it calls>

          ## Internal subsystems
          - <name>: <one-paragraph role>

          ## Data model (as observed)

          ## Behaviours to preserve in the mock
          - <numbered list — these will become R# requirements downstream>

          ## Behaviours intentionally NOT mocked
          - <numbered list — these will become Out-of-scope items downstream>

          ## Ambiguities / contradictions in the source docs
          - <numbered list — these will become Open questions downstream>

      RULES:
      - Every claim must be grounded in at least one source document. Do not invent behaviours.
      - If two source documents contradict each other, flag the contradiction under "Ambiguities" instead of silently picking one.
      - The "Behaviours to preserve" and "Behaviours intentionally NOT mocked" lists are the most important for downstream phases — be specific and number them.
      - Write the file to ../../workspace/00-system-summary.md via bash (you can use heredocs or write_file). Your ## Answer (returned via ## Return) must be the FULL text of the summary, verbatim, so the verifier in the next step can use it.
    prior_answer: |
      (none — fresh draft)
    MEM_EOF

(Post-pop state will be "drafting_completed".)

## Instruction: Drafter done — stage verify
**Condition:** MEMORY state is "drafting_completed" and `## Answer` is present
**Action:** Extract the draft text from `## Answer` to `./scoped/draft.md`, prune the splice sections from MEMORY, and park at the verify-push state.

    mkdir -p ./scoped
    awk '/^## Answer$/{f=1; next} /^## [A-Z]/ && f {exit} f' ./MEMORY.md > ./scoped/draft.md
    awk 'BEGIN{f=0} /^## (Answer|Refined|Revised|Verdict|Feedback|Result)$/{f=1; next} /^## [A-Z]/ && f {f=0} !f' ./MEMORY.md > ./MEMORY.md.tmp && mv ./MEMORY.md.tmp ./MEMORY.md
    sed -i 's/^drafting_completed$/verifying_pushing/' ./MEMORY.md

## Instruction: Push verifier
**Condition:** MEMORY state is "verifying_pushing"
**Action:** Wholesale-rewrite MEMORY with a push of `cove.md` carrying the draft as `prior_answer` (CoVe uses prior_answer directly as the draft to verify, skipping its own drafting step).

    DRAFT_BODY=$(sed 's/^/  /' ./scoped/draft.md)
    cat > ./MEMORY.md << MEM_EOF
    ## State
    verifying
    ## Matched Instruction
    Push verifier
    ## Last Action
    Pushed cove.md to verify the summary draft against the source documents.
    ## Result
    Verification phase initiated.
    ## Push
    operators/cove.md
    ## Push-Args
    task: |
      Verify a system summary against the source documents listed in PROGRAM.md.

      Read PROGRAM.md (../../PROGRAM.md) to find the source-document paths under "## Source documents". When the verification step decomposes the summary into atomic claims, each verification question should:
        - Reference specific source documents where the claim originated;
        - Be answerable with no access to the summary draft itself (the answerer has only the question + PROGRAM.md + the documents PROGRAM.md references).

      Focus the verification on: external interfaces (names, shapes), behaviours (each preserved/not-mocked behaviour grounded in source), data model entries, and any ambiguities flagged. Each independent answerer will read the relevant source document(s) and answer afresh.

      After verification, produce a corrected full summary as the revised output. The revised version overrides the draft.
    prior_answer: |
${DRAFT_BODY}
    MEM_EOF

(Post-pop state will be "verifying_completed".)

## Instruction: Finish
**Condition:** MEMORY state is "verifying_completed" and `## Answer` is present
**Action:** The CoVe operator returned the verified summary via `## Return answer:` (spliced as `## Answer`). Write that to `../../workspace/00-system-summary.md`, then write `./MEMORY.md` with the FULL done state in a SINGLE heredoc (the `## Return` block MUST be in the same heredoc as the state change — at depth>=1 the shell pops on state is "done" BEFORE any subsequent instruction runs, so a separate Finish instruction would be unreachable).

    mkdir -p ../../workspace
    awk '/^## Answer$/{f=1; next} /^## [A-Z]/ && f {exit} f' ./MEMORY.md > ../../workspace/00-system-summary.md

Then:

    cat > ./MEMORY.md << 'FINEOF'
    ## State
    done
    ## Matched Instruction
    Finish
    ## Last Action
    Wrote verified system summary to ../../workspace/00-system-summary.md.
    ## Result
    Phase Summarise complete.
    ## Return
    artefact: |
      ../../workspace/00-system-summary.md
    FINEOF

# Sub-instructions

(none — this operator needs none.)
