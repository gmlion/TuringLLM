# Operator: Phase — Design

IMPORTANT: This operator file is the canonical phase shim. Do not modify it via update_instructions; it is only loaded at push-time.

Receives push-args: none. Reads the approved upstream artefacts (00, 01) directly.

Produces: `## State done` + `## Return` with key `artefact` (always `../../workspace/02-design.md`). The orchestrator's gate question lists this; the per-ADR files under `../../workspace/02-adr/` are sibling artefacts referenced from the design body's ADR index.

This shim runs Phase 2. It composes three steps:

1. **Body** — push `dialogue.md` with participants `architect,engineer,qa,pm`, `acceptance: true`. The dialogue writes `../../workspace/02-design.md` (including a `## Decisions (ADR index)` section that names the non-trivial choices needing ADRs).
2. **Verify** — push `cove.md` with the design body as `prior_answer`. CoVe checks R# coverage and Test matrix claims against the upstream summary and requirements; the revised body overwrites `02-design.md`.
3. **ADRs** — parse the ADR index from the verified body to `./scoped/adr-queue.md`, then push `phase-adr.md` once per ADR entry. Each ADR runs its own four-role dialogue (Architect, Engineer, QA, Devil's Advocate) and writes one file under `../../workspace/02-adr/`.

Scoped files:
- `./scoped/adr-queue.md` — pipe-delimited rows: `ADR-NNN|Title|pending|done` (surgical sed updates only after creation).
- `./scoped/current-adr.md` — the row currently being processed.

## Instruction: Initialize — push design dialogue
**Condition:** MEMORY state is "empty"
**Action:** Wholesale-rewrite MEMORY with a static push of `dialogue.md` for the design body.

    cat > ./MEMORY.md << 'MEM_EOF'
    ## State
    design_dialoguing
    ## Matched Instruction
    Initialize — push design dialogue
    ## Last Action
    Pushed dialogue.md with participants architect,engineer,qa,pm for the design phase.
    ## Result
    Design dialogue initiated.
    ## Push
    operators/dialogue.md
    ## Push-Args
    participants: |
      architect,engineer,qa,pm
    topic: |
      Produce a design artefact at ../../workspace/02-design.md that satisfies every R# from ../../workspace/01-requirements.md.

      INPUTS — each speaker reads (via bash) at the start of every turn:
        - ../../PROGRAM.md (POC name + constraints)
        - ../../workspace/00-system-summary.md (system under mock)
        - ../../workspace/01-requirements.md (approved R# list)
        - ../../workspace/.sdlc/design-refinement-note.md (if NON-EMPTY, address it)
        - ../../workspace/02-design.md (if it already exists, preserve P# IDs and ADR-### identifiers — only APPEND new ones)

      OUTPUT — the speaker who emits <SOLUTION> writes ../../workspace/02-design.md via bash with this schema:

          # Design: <POC name>

          ## Overview

          ## Requirement coverage
          | R# | Addressed by |
          | -- | -- |
          | R1 | <architecture component / ADR-### / test surface> |

          ## Architecture
          <diagrams (mermaid), components, sequence flows>

          ## Data model

          ## Interfaces / API

          ## Error handling

          ## Correctness properties
          - **P1** — <invariant>. Traces to: R#, R#.
          - **P2** — ...

          ## Decisions (ADR index)
          | ADR | Title | Status | Drives |
          | --- | --- | --- | --- |
          | ADR-001 | <title> | proposed | R1, R3, P2 |

          ## Test strategy
          ### Unit tests
          ### Integration tests
          ### Property-based tests

          ## Test matrix
          | R# | P# | Category | Verification surface |
          | -- | -- | -------- | -------------------- |
          | R1 | -  | Unit     | `tests/unit/foo.spec.ts::handles_basic` |

          ## Open questions

      RULES:
        - Every R# in 01-requirements.md must appear in the Requirement coverage table.
        - Every load-bearing structural choice must appear as a row in the Decisions (ADR index) table — exact ADR number format `ADR-NNN` (zero-padded to three digits).
        - The Test matrix must have one row per test case; each row must name a real test file or surface and a verification command.
        - P# identifiers are stable across refinement.
        - No implementation work — design lives at the level of signatures and pseudocode at most.

      ROLE TURN INSTRUCTIONS:
        - Architect (scribe / first speaker): drafts v0; redrafts each round to address Engineer/QA/PM critiques. Identifies load-bearing decisions and adds them to the ADR index.
        - Engineer: every turn, checks feasibility; flags places where the design would force impractical code shapes.
        - QA: every turn, checks every P# has a real test surface, every R# is in the coverage table.
        - PM: every turn, checks no R# was silently dropped and no out-of-scope behaviour snuck in.

      A speaker emits <SOLUTION> followed by the full file body when all four roles agree. The file at ../../workspace/02-design.md must be on disk at the moment <SOLUTION> is emitted.
    input: |
      Upstream artefacts: ../../workspace/00-system-summary.md and ../../workspace/01-requirements.md. Read both at every turn.
    output_path: |
      ../../workspace/02-design.md
    acceptance: |
      true
    MEM_EOF

(Post-pop state will be "design_dialoguing_completed".)

## Instruction: Design body done — stage verify
**Condition:** MEMORY state is "design_dialoguing_completed"
**Action:** Prune dialogue/verdict/feedback splice sections; park at the CoVe-push state.

    awk 'BEGIN{f=0} /^## (Dialogue|Verdict|Feedback|Result)$/{f=1; next} /^## [A-Z]/ && f {f=0} !f' ./MEMORY.md > ./MEMORY.md.tmp && mv ./MEMORY.md.tmp ./MEMORY.md
    sed -i 's/^design_dialoguing_completed$/cove_pushing/' ./MEMORY.md

## Instruction: Push CoVe verifier
**Condition:** MEMORY state is "cove_pushing"
**Action:** Push `cove.md` with the design body as `prior_answer`. CoVe will decompose the design's R# coverage and Test matrix into atomic claims and verify each independently.

    DRAFT_BODY=$(sed 's/^/  /' ../../workspace/02-design.md)
    cat > ./MEMORY.md << MEM_EOF
    ## State
    cove_verifying
    ## Matched Instruction
    Push CoVe verifier
    ## Last Action
    Pushed cove.md to verify the design's R# coverage and Test matrix claims.
    ## Result
    Design verification initiated.
    ## Push
    operators/cove.md
    ## Push-Args
    task: |
      Verify a design artefact against its upstream requirements and summary.

      The draft (prior_answer) is the design body. Decompose it into atomic verification questions targeting:
        - Each row of the "Requirement coverage" table: does this R# really map to the named component, ADR, or test surface? (verifiable against 01-requirements.md)
        - Each row of the "Test matrix" table: is the named test file or surface plausible given the architecture described? Is the verification command coherent?
        - Each Correctness property (P#): does it trace to a real R#?
        - Each ADR row: is the title coherent with the architecture body?

      Each verification question must be answerable using only PROGRAM.md and the artefacts it references (00-system-summary, 01-requirements). The answerer reads those files via bash; they do not see the design draft.

      The revised output is the corrected full design body. Preserve all P# and ADR-### identifiers from the draft.
    prior_answer: |
${DRAFT_BODY}
    MEM_EOF

(Post-pop state will be "cove_verifying_completed".)

## Instruction: Verifier done — extract ADR queue
**Condition:** MEMORY state is "cove_verifying_completed" and `## Answer` is present
**Action:** Extract the revised design body to `../../workspace/02-design.md`, parse the ADR index into a queue, prune MEMORY, then advance to ADR-iteration.

    mkdir -p ../../workspace ../../workspace/02-adr ./scoped
    awk '/^## Answer$/{f=1; next} /^## [A-Z]/ && f {exit} f' ./MEMORY.md > ../../workspace/02-design.md

Parse the ADR index. Rows look like `| ADR-001 | <title> | <status> | <drives> |`. Extract number and title to `./scoped/adr-queue.md`, status `pending`:

    awk '
      /^## Decisions \(ADR index\)$/ { in_section=1; next }
      in_section && /^## [A-Z]/ { in_section=0 }
      in_section && /^\| ADR-[0-9]+ \|/ {
        n = split($0, f, /[[:space:]]*\|[[:space:]]*/)
        num = f[2]
        title = f[3]
        printf "%s|%s|pending\n", num, title
      }
    ' ../../workspace/02-design.md > ./scoped/adr-queue.md

Prune the splice sections from MEMORY and advance:

    awk 'BEGIN{f=0} /^## (Answer|Refined|Revised|Result)$/{f=1; next} /^## [A-Z]/ && f {f=0} !f' ./MEMORY.md > ./MEMORY.md.tmp && mv ./MEMORY.md.tmp ./MEMORY.md
    sed -i 's/^cove_verifying_completed$/adr_iterating/' ./MEMORY.md

## Instruction: ADR loop — push next or finish
**Condition:** MEMORY state is "adr_iterating"
**Action:** Find the first `pending` row in `./scoped/adr-queue.md`. If one exists, stage it as `./scoped/current-adr.md` and push `phase-adr.md`. If none, all ADRs are done — finish the phase.

    NEXT=$(grep '|pending$' ./scoped/adr-queue.md | head -n 1 || true)
    if [ -n "$NEXT" ]; then
      echo "$NEXT" > ./scoped/current-adr.md
      ADR_NUMBER=$(echo "$NEXT" | cut -d'|' -f1)
      ADR_TITLE=$(echo "$NEXT" | cut -d'|' -f2)
      cat > ./MEMORY.md << MEM_EOF
    ## State
    adr_writing
    ## Matched Instruction
    ADR loop — push next
    ## Last Action
    Pushed phase-adr.md for ${ADR_NUMBER}: ${ADR_TITLE}.
    ## Result
    Writing ${ADR_NUMBER}.
    ## Push
    operators/phase-adr.md
    ## Push-Args
    adr_number: |
      ${ADR_NUMBER}
    adr_title: |
      ${ADR_TITLE}
    MEM_EOF
    else
      cat > ./MEMORY.md << 'FINEOF'
    ## State
    done
    ## Matched Instruction
    ADR loop — finish
    ## Last Action
    All ADRs written; design phase complete.
    ## Result
    Phase Design complete.
    ## Return
    artefact: |
      ../../workspace/02-design.md
    FINEOF
    fi

## Instruction: ADR done — mark and loop
**Condition:** MEMORY state is "adr_writing_completed"
**Action:** Mark the current ADR as done in the queue via surgical sed, prune the child's splice, and return to `adr_iterating`.

    CURRENT=$(cat ./scoped/current-adr.md)
    ADR_NUMBER=$(echo "$CURRENT" | cut -d'|' -f1)
    sed -i "s|^${ADR_NUMBER}|.*|pending$|${CURRENT%|*}|done|" ./scoped/adr-queue.md || true

(Alternative simpler form: rewrite that line by escaping pipes — use a different delimiter for the sed.)

    awk -v num="$ADR_NUMBER" -F '|' 'BEGIN{OFS="|"} $1==num {$3="done"} {print}' ./scoped/adr-queue.md > ./scoped/adr-queue.md.tmp && mv ./scoped/adr-queue.md.tmp ./scoped/adr-queue.md

Prune the popped child's splice sections and loop back:

    awk 'BEGIN{f=0} /^## (Artefact|Verdict|Feedback|Answer|Dialogue|Result)$/{f=1; next} /^## [A-Z]/ && f {f=0} !f' ./MEMORY.md > ./MEMORY.md.tmp && mv ./MEMORY.md.tmp ./MEMORY.md
    sed -i 's/^adr_writing_completed$/adr_iterating/' ./MEMORY.md

# Sub-instructions

(none — this operator needs none.)
