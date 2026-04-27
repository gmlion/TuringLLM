# Strategy: ChatDev — phase-dialogue SOP

IMPORTANT: Everything between "# Strategy" and "# Sub-instructions" is the strategy. It must be copied VERBATIM into every update_instructions call. Never modify, summarize, or omit any strategy instruction. Only the "# Sub-instructions" section below changes.

This interpreter implements the ChatDev pattern (patterns.md Group 5): four phases — design, coding, testing, documenting — each phase a dialogue between a role pair. Design uses CEO↔CTO without an acceptance gate; coding / testing / documenting pair a specialist with the reviewer and use `evaluate.md` as an acceptance gate. **A failed verdict loops back into the same phase**; the reviewer's feedback is fed into the next attempt's input. No iteration cap — convergence is the LLM's judgement (consistent with R10 across iterative interpreters).

Scoped files:
- `./scoped/phase.md` — current phase name (wholesale overwrite at each phase transition; debug aid).

Each transition sets the caller's state to a phase-active label (`design_active`, `coding_active`, `testing_active`, `doc_active`) BEFORE the push. The shell preserves that as the returnState; on pop, the caller's state becomes `<label>_completed`. Retry instructions match `<label>_completed` AND `## Verdict` is `fail`, and re-push the dialogue with the reviewer's feedback included as `input`. The proceed instruction matches `<label>_completed` AND `## Dialogue` is present (with no failed verdict, since the retry instruction would have first-matched on `fail`).

## Instruction: Initialize
**Condition:** MEMORY state is "empty"
**Action:** Read `../../PROGRAM.md`. Overwrite `./scoped/phase.md` with the single word `design`. Append to `./MEMORY.md`:

    ## Push
    dynamics/dialogue.md
    ## Push-Args
    participants: |
      ceo,cto
    topic: |
      <verbatim PROGRAM.md body, every line indented two spaces>
    input: |
      (none — first phase)
    acceptance: |
      false

**Set state to "design_active"** (post-pop state will be "design_active_completed").

## Instruction: Design done — enter coding
**Condition:** MEMORY state is "design_active_completed" and `## Dialogue` is present
**Action:** Rename the returned `## Dialogue` section to `## Design Doc` (`sed -i 's/^## Dialogue$/## Design Doc/' ./MEMORY.md`). Overwrite `./scoped/phase.md` with the single word `coding`. Append to `./MEMORY.md`:

    ## Push
    dynamics/dialogue.md
    ## Push-Args
    participants: |
      coder,reviewer
    topic: |
      Implement the following design:
      <verbatim ## Design Doc body, indented two spaces>
    input: |
      <verbatim ## Design Doc body, indented two spaces>
    acceptance: |
      true

**Set state to "coding_active"**.

## Instruction: Coding rejected — retry
**Condition:** MEMORY state is "coding_active_completed" AND `## Verdict` equals the literal `fail`
**Action:** Read `## Feedback` (the reviewer's reasons). Append to `./MEMORY.md`:

    ## Push
    dynamics/dialogue.md
    ## Push-Args
    participants: |
      coder,reviewer
    topic: |
      Implement the following design:
      <verbatim ## Design Doc body, indented two spaces>
    input: |
      The previous implementation was REJECTED by the reviewer. Address ONLY the issues in the feedback below; produce a fresh complete implementation that satisfies the design above.
      Reviewer feedback:
      <verbatim ## Feedback body, indented two spaces>
    acceptance: |
      true

Remove `## Verdict`, `## Feedback`, and `## Dialogue` from MEMORY (the next dialogue will produce a fresh attempt; the rejected attempt body is intentionally NOT carried forward, mirroring ChatDev's `CodeReviewModification` which receives only the latest `comments` plus the current code state, not prior attempts). **Set state to "coding_active"**.

## Instruction: Coding done — enter testing
**Condition:** MEMORY state is "coding_active_completed" and `## Dialogue` is present
**Action:** Rename `## Dialogue` to `## Code` (`sed -i 's/^## Dialogue$/## Code/' ./MEMORY.md`). Remove `## Verdict` and `## Feedback` from MEMORY if present. Overwrite `./scoped/phase.md` with the single word `testing`. Append to `./MEMORY.md`:

    ## Push
    dynamics/dialogue.md
    ## Push-Args
    participants: |
      tester,reviewer
    topic: |
      Write and run tests for the following code:
      <verbatim ## Code body, indented two spaces>
    input: |
      <verbatim ## Code body, indented two spaces>
    acceptance: |
      true

**Set state to "testing_active"**.

## Instruction: Testing rejected — retry
**Condition:** MEMORY state is "testing_active_completed" AND `## Verdict` equals the literal `fail`
**Action:** Read `## Feedback`. Append to `./MEMORY.md`:

    ## Push
    dynamics/dialogue.md
    ## Push-Args
    participants: |
      tester,reviewer
    topic: |
      Write and run tests for the following code:
      <verbatim ## Code body, indented two spaces>
    input: |
      The previous test plan was REJECTED by the reviewer. Address ONLY the issues in the feedback below; produce a fresh complete test plan for the code above.
      Reviewer feedback:
      <verbatim ## Feedback body, indented two spaces>
    acceptance: |
      true

Remove `## Verdict`, `## Feedback`, and `## Dialogue` from MEMORY. **Set state to "testing_active"**.

## Instruction: Testing done — enter documenting
**Condition:** MEMORY state is "testing_active_completed" and `## Dialogue` is present
**Action:** Rename `## Dialogue` to `## Test Report` (`sed -i 's/^## Dialogue$/## Test Report/' ./MEMORY.md`). Remove `## Verdict` and `## Feedback` from MEMORY if present. Overwrite `./scoped/phase.md` with the single word `documenting`. Append to `./MEMORY.md`:

    ## Push
    dynamics/dialogue.md
    ## Push-Args
    participants: |
      writer,reviewer
    topic: |
      Write user-facing documentation for the following code:
      <verbatim ## Code body, indented two spaces>
    input: |
      <verbatim ## Code body, indented two spaces>
    acceptance: |
      true

**Set state to "doc_active"**.

## Instruction: Documenting rejected — retry
**Condition:** MEMORY state is "doc_active_completed" AND `## Verdict` equals the literal `fail`
**Action:** Read `## Feedback`. Append to `./MEMORY.md`:

    ## Push
    dynamics/dialogue.md
    ## Push-Args
    participants: |
      writer,reviewer
    topic: |
      Write user-facing documentation for the following code:
      <verbatim ## Code body, indented two spaces>
    input: |
      The previous documentation was REJECTED by the reviewer. Address ONLY the issues in the feedback below; produce fresh complete documentation for the code above.
      Reviewer feedback:
      <verbatim ## Feedback body, indented two spaces>
    acceptance: |
      true

Remove `## Verdict`, `## Feedback`, and `## Dialogue` from MEMORY. **Set state to "doc_active"**.

## Instruction: Finish
**Condition:** MEMORY state is "doc_active_completed" and `## Dialogue` is present
**Action:** Rename `## Dialogue` to `## Documentation` (`sed -i 's/^## Dialogue$/## Documentation/' ./MEMORY.md`). Remove `## Verdict` and `## Feedback` from MEMORY if present. Set state to "done".

# Sub-instructions

(none — this interpreter needs none.)
