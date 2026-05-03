# Strategy: ChatDev — phase-dialogue SOP

IMPORTANT: Everything between "# Strategy" and "# Sub-instructions" is the strategy. It must be copied VERBATIM into every update_instructions call. Never modify, summarize, or omit any strategy instruction. Only the "# Sub-instructions" section below changes.

This interpreter implements the ChatDev pattern (patterns.md Group 5): four phases — design, coding, testing, documenting — each phase a dialogue between a role pair. Design uses CEO↔CTO without an acceptance gate; coding / testing / documenting pair a specialist with the reviewer and use `evaluate.md` as an acceptance gate. **A failed verdict loops back into the same phase**; the reviewer's feedback is fed into the next attempt. No iteration cap — convergence is the LLM's judgement (consistent across iterative interpreters in this repo).

**Artefacts live as workspace files, not as MEMORY sections or push-args.** Each phase passes an `output_path` push-arg to its dialogue; the dialogue writes its consensus body directly to that path. The strategy never inlines artefact bodies into push-args, and never has to parse `## Dialogue` body sections (which can contain arbitrary markdown including `## ...` headers — which would defeat any section-boundary awk). The strategy only references workspace files by path.

**Two-cycle phase transitions.** Every phase boundary (forward AND retry) is split across two cycles, one focused action per cycle. Cycle 1 ("stage") does the prune/extract bash work and parks in an intermediate `*_pushing` state. Cycle 2 ("push") wholesale-rewrites MEMORY with a *fully static* `## Push` template (no LLM-side variable substitution). This eliminates the failure mode where the LLM would narrate "appended the push" while skipping the textual emission. Retries pass reviewer feedback by **path** (`../../workspace/.chatdev/last_rejection.md`) rather than by inline-substituted body, so the static template stays static.

Scoped files:
- `./scoped/phase.md` — current phase name (wholesale overwrite at each phase transition; debug aid).

Workspace staging files (written by dialogue role agents or by this strategy, read by dialogue role agents):
- `../../workspace/.chatdev/program.md` — copy of PROGRAM.md.
- `../../workspace/.chatdev/design.md` — design dialogue's consensus artefact.
- `../../workspace/.chatdev/code.md` — coding dialogue's consensus artefact.
- `../../workspace/.chatdev/test_report.md` — testing dialogue's consensus artefact.
- `../../workspace/.chatdev/documentation.md` — documentation dialogue's consensus artefact.
- `../../workspace/.chatdev/last_rejection.md` — most recent reviewer feedback (overwritten on each retry).

Each transition sets the caller's state to a phase-active label (`design_active`, `coding_active`, `testing_active`, `doc_active`) BEFORE the push. The shell preserves that as the returnState; on pop, the caller's state becomes `<label>_completed`. Retry-stage instructions match `<label>_completed` AND `## Verdict` is `fail`; forward-prune instructions match `<label>_completed` only (the retry-stage instruction would have first-matched on `fail`, so reaching the forward-prune means the verdict was `pass` or absent). Push instructions (both retry and forward) match the corresponding `*_pushing` intermediate state.

## Instruction: Initialize
**Condition:** MEMORY state is "empty"
**Action:** Stage the program where every role agent can find it by a fixed path, then start the design dialogue (single-cycle: this is a clean-slate emission, no prior MEMORY content to merge with):

    mkdir -p ../../workspace/.chatdev
    cp ../../PROGRAM.md ../../workspace/.chatdev/program.md
    echo design > ./scoped/phase.md

Then wholesale-rewrite MEMORY:

    cat > ./MEMORY.md << 'MEM_EOF'
    ## State
    design_active
    ## Matched Instruction
    Initialize
    ## Last Action
    Staged program at ../../workspace/.chatdev/program.md and pushed design dialogue.
    ## Result
    Design phase initiated.
    ## Push
    operators/dialogue.md
    ## Push-Args
    participants: |
      ceo,cto
    topic: |
      Design a solution for the program described at ../../workspace/.chatdev/program.md
    input: |
      (none — first phase)
    output_path: |
      ../../workspace/.chatdev/design.md
    acceptance: |
      false
    MEM_EOF

(Post-pop state will be "design_active_completed".)

## Instruction: Design done — prune (stage)
**Condition:** MEMORY state is "design_active_completed"
**Action:** The design dialogue already wrote `../../workspace/.chatdev/design.md`. Prune `## Dialogue` from MEMORY and park at the push state:

    awk 'BEGIN{f=0} /^## Dialogue$/{f=1; next} /^## [A-Z]/ && f {f=0} !f' ./MEMORY.md > ./MEMORY.md.tmp && mv ./MEMORY.md.tmp ./MEMORY.md

Then update state via in-place sed (single-line replacement, no template-emission risk):

    sed -i 's/^design_active_completed$/design_to_coding_pushing/' ./MEMORY.md

## Instruction: Design done — push
**Condition:** MEMORY state is "design_to_coding_pushing"
**Action:** Set phase marker, then wholesale-rewrite MEMORY with the static coding push (no variable substitution, no prior content to preserve):

    echo coding > ./scoped/phase.md
    cat > ./MEMORY.md << 'MEM_EOF'
    ## State
    coding_active
    ## Matched Instruction
    Design done — push
    ## Last Action
    Pushed coding dialogue (coder + reviewer) to implement design at ../../workspace/.chatdev/design.md.
    ## Result
    Coding phase initiated.
    ## Push
    operators/dialogue.md
    ## Push-Args
    participants: |
      coder,reviewer
    topic: |
      Implement the design at ../../workspace/.chatdev/design.md. Write the source files to ../../workspace/ via bash; the consensus artefact you write to your output_path should describe what you built and where (file list, entry points, key decisions) — not the full source verbatim.
    input: |
      The design is at ../../workspace/.chatdev/design.md.
    output_path: |
      ../../workspace/.chatdev/code.md
    acceptance: |
      true
    MEM_EOF

## Instruction: Coding rejected — stage retry
**Condition:** MEMORY state is "coding_active_completed" AND `## Verdict` equals the literal `fail`
**Action:** Extract reviewer feedback to a workspace file (so the retry dialogue reads it by path), then prune and park at the push state. No verbatim substitution into MEMORY — the dialogue will read the file:

    awk '/^## Feedback$/{f=1; next} /^## [A-Z]/ && f {exit} f' ./MEMORY.md > ../../workspace/.chatdev/last_rejection.md
    awk 'BEGIN{f=0} /^## (Verdict|Feedback|Dialogue)$/{f=1; next} /^## [A-Z]/ && f {f=0} !f' ./MEMORY.md > ./MEMORY.md.tmp && mv ./MEMORY.md.tmp ./MEMORY.md
    sed -i 's/^coding_active_completed$/coding_retry_pushing/' ./MEMORY.md

## Instruction: Coding rejected — push retry
**Condition:** MEMORY state is "coding_retry_pushing"
**Action:** Wholesale-rewrite MEMORY with the static retry push (feedback is already at `../../workspace/.chatdev/last_rejection.md`; the dialogue role agents will read it):

    cat > ./MEMORY.md << 'MEM_EOF'
    ## State
    coding_active
    ## Matched Instruction
    Coding rejected — push retry
    ## Last Action
    Pushed coding-retry dialogue with reviewer feedback staged at ../../workspace/.chatdev/last_rejection.md.
    ## Result
    Coding retry initiated.
    ## Push
    operators/dialogue.md
    ## Push-Args
    participants: |
      coder,reviewer
    topic: |
      Implement the design at ../../workspace/.chatdev/design.md. Write the source files to ../../workspace/ via bash; the consensus artefact at your output_path should describe what you built (file list, entry points, key decisions) — not the full source verbatim.
    input: |
      The previous implementation was REJECTED by the reviewer. BEFORE starting, read ../../workspace/.chatdev/last_rejection.md for the reviewer's feedback. Address ONLY the issues there; produce a fresh complete implementation that satisfies the design above.
    output_path: |
      ../../workspace/.chatdev/code.md
    acceptance: |
      true
    MEM_EOF

## Instruction: Coding done — prune (stage)
**Condition:** MEMORY state is "coding_active_completed"
**Action:** The coding dialogue already wrote `../../workspace/.chatdev/code.md`. Prune `## Dialogue`, `## Verdict`, and `## Feedback` from MEMORY and park at the push state:

    awk 'BEGIN{f=0} /^## (Verdict|Feedback|Dialogue)$/{f=1; next} /^## [A-Z]/ && f {f=0} !f' ./MEMORY.md > ./MEMORY.md.tmp && mv ./MEMORY.md.tmp ./MEMORY.md
    sed -i 's/^coding_active_completed$/coding_to_testing_pushing/' ./MEMORY.md

## Instruction: Coding done — push
**Condition:** MEMORY state is "coding_to_testing_pushing"
**Action:** Set phase marker, then wholesale-rewrite MEMORY with the static testing push:

    echo testing > ./scoped/phase.md
    cat > ./MEMORY.md << 'MEM_EOF'
    ## State
    testing_active
    ## Matched Instruction
    Coding done — push
    ## Last Action
    Pushed testing dialogue (tester + reviewer) for the code at ../../workspace/.chatdev/code.md.
    ## Result
    Testing phase initiated.
    ## Push
    operators/dialogue.md
    ## Push-Args
    participants: |
      tester,reviewer
    topic: |
      Write and run tests for the code described at ../../workspace/.chatdev/code.md (the source files are in ../../workspace/). Write test files to ../../workspace/ via bash; the consensus artefact at your output_path should be a short test report — what you tested, results, any gaps — not the full test source verbatim.
    input: |
      The code is described at ../../workspace/.chatdev/code.md; source files are in ../../workspace/.
    output_path: |
      ../../workspace/.chatdev/test_report.md
    acceptance: |
      true
    MEM_EOF

## Instruction: Testing rejected — stage retry
**Condition:** MEMORY state is "testing_active_completed" AND `## Verdict` equals the literal `fail`
**Action:** Extract reviewer feedback to a workspace file, then prune and park at the push state:

    awk '/^## Feedback$/{f=1; next} /^## [A-Z]/ && f {exit} f' ./MEMORY.md > ../../workspace/.chatdev/last_rejection.md
    awk 'BEGIN{f=0} /^## (Verdict|Feedback|Dialogue)$/{f=1; next} /^## [A-Z]/ && f {f=0} !f' ./MEMORY.md > ./MEMORY.md.tmp && mv ./MEMORY.md.tmp ./MEMORY.md
    sed -i 's/^testing_active_completed$/testing_retry_pushing/' ./MEMORY.md

## Instruction: Testing rejected — push retry
**Condition:** MEMORY state is "testing_retry_pushing"
**Action:** Wholesale-rewrite MEMORY with the static retry push:

    cat > ./MEMORY.md << 'MEM_EOF'
    ## State
    testing_active
    ## Matched Instruction
    Testing rejected — push retry
    ## Last Action
    Pushed testing-retry dialogue with reviewer feedback staged at ../../workspace/.chatdev/last_rejection.md.
    ## Result
    Testing retry initiated.
    ## Push
    operators/dialogue.md
    ## Push-Args
    participants: |
      tester,reviewer
    topic: |
      Write and run tests for the code described at ../../workspace/.chatdev/code.md (source in ../../workspace/). Write test files to ../../workspace/; the consensus artefact at your output_path should be a short test report.
    input: |
      The previous test plan was REJECTED by the reviewer. BEFORE starting, read ../../workspace/.chatdev/last_rejection.md for the reviewer's feedback. Address ONLY the issues there; produce a fresh complete test plan for the code above.
    output_path: |
      ../../workspace/.chatdev/test_report.md
    acceptance: |
      true
    MEM_EOF

## Instruction: Testing done — prune (stage)
**Condition:** MEMORY state is "testing_active_completed"
**Action:** The testing dialogue already wrote `../../workspace/.chatdev/test_report.md`. Prune `## Dialogue`, `## Verdict`, and `## Feedback` from MEMORY and park at the push state:

    awk 'BEGIN{f=0} /^## (Verdict|Feedback|Dialogue)$/{f=1; next} /^## [A-Z]/ && f {f=0} !f' ./MEMORY.md > ./MEMORY.md.tmp && mv ./MEMORY.md.tmp ./MEMORY.md
    sed -i 's/^testing_active_completed$/testing_to_doc_pushing/' ./MEMORY.md

## Instruction: Testing done — push
**Condition:** MEMORY state is "testing_to_doc_pushing"
**Action:** Set phase marker, then wholesale-rewrite MEMORY with the static documenting push:

    echo documenting > ./scoped/phase.md
    cat > ./MEMORY.md << 'MEM_EOF'
    ## State
    doc_active
    ## Matched Instruction
    Testing done — push
    ## Last Action
    Pushed documenting dialogue (writer + reviewer) for the code at ../../workspace/.chatdev/code.md.
    ## Result
    Documenting phase initiated.
    ## Push
    operators/dialogue.md
    ## Push-Args
    participants: |
      writer,reviewer
    topic: |
      Write user-facing documentation for the code described at ../../workspace/.chatdev/code.md (source in ../../workspace/). Write the documentation to ../../workspace/ (e.g. README.md) via bash; the consensus artefact at your output_path should describe what you documented and where.
    input: |
      Code description: ../../workspace/.chatdev/code.md. Test report: ../../workspace/.chatdev/test_report.md. Source files: ../../workspace/.
    output_path: |
      ../../workspace/.chatdev/documentation.md
    acceptance: |
      true
    MEM_EOF

## Instruction: Documenting rejected — stage retry
**Condition:** MEMORY state is "doc_active_completed" AND `## Verdict` equals the literal `fail`
**Action:** Extract reviewer feedback to a workspace file, then prune and park at the push state:

    awk '/^## Feedback$/{f=1; next} /^## [A-Z]/ && f {exit} f' ./MEMORY.md > ../../workspace/.chatdev/last_rejection.md
    awk 'BEGIN{f=0} /^## (Verdict|Feedback|Dialogue)$/{f=1; next} /^## [A-Z]/ && f {f=0} !f' ./MEMORY.md > ./MEMORY.md.tmp && mv ./MEMORY.md.tmp ./MEMORY.md
    sed -i 's/^doc_active_completed$/doc_retry_pushing/' ./MEMORY.md

## Instruction: Documenting rejected — push retry
**Condition:** MEMORY state is "doc_retry_pushing"
**Action:** Wholesale-rewrite MEMORY with the static retry push:

    cat > ./MEMORY.md << 'MEM_EOF'
    ## State
    doc_active
    ## Matched Instruction
    Documenting rejected — push retry
    ## Last Action
    Pushed documenting-retry dialogue with reviewer feedback staged at ../../workspace/.chatdev/last_rejection.md.
    ## Result
    Documenting retry initiated.
    ## Push
    operators/dialogue.md
    ## Push-Args
    participants: |
      writer,reviewer
    topic: |
      Write user-facing documentation for the code described at ../../workspace/.chatdev/code.md (source in ../../workspace/). Write the documentation to ../../workspace/.
    input: |
      The previous documentation was REJECTED by the reviewer. BEFORE starting, read ../../workspace/.chatdev/last_rejection.md for the reviewer's feedback. Address ONLY the issues there; produce fresh complete documentation for the code above.
    output_path: |
      ../../workspace/.chatdev/documentation.md
    acceptance: |
      true
    MEM_EOF

## Instruction: Finish
**Condition:** MEMORY state is "doc_active_completed"
**Action:** The documentation dialogue already wrote `../../workspace/.chatdev/documentation.md`. Prune any remaining sections and halt:

    awk 'BEGIN{f=0} /^## (Verdict|Feedback|Dialogue)$/{f=1; next} /^## [A-Z]/ && f {f=0} !f' ./MEMORY.md > ./MEMORY.md.tmp && mv ./MEMORY.md.tmp ./MEMORY.md
    sed -i 's/^doc_active_completed$/done/' ./MEMORY.md

# Sub-instructions

(none — this interpreter needs none.)
