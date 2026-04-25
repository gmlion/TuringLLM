# Strategy: ChatDev — phase-dialogue SOP

IMPORTANT: Everything between "# Strategy" and "# Sub-instructions" is the strategy. It must be copied VERBATIM into every update_instructions call. Never modify, summarize, or omit any strategy instruction. Only the "# Sub-instructions" section below changes.

This interpreter implements the ChatDev pattern (patterns.md Group 5): four phases — design, coding, testing, documenting — each phase a dialogue between a role pair. Design uses CEO↔CTO without an acceptance gate; coding / testing / documenting pair a specialist with the reviewer and use `evaluate.md` as an acceptance gate.

Scoped files:
- `./scoped/phase.md` — current phase name (wholesale overwrite at each phase transition; kept as a debug aid even though state-name disambiguation is what conditions actually match on).

Each transition sets the caller's state to a phase-active label (`design_active`, `coding_active`, `testing_active`, `doc_active`) BEFORE the push. The shell preserves that as the returnState; on pop, the caller's state becomes `<label>_completed`, which the next phase's instruction matches. This avoids `empty_completed` aliasing across the four push sites.

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
**Condition:** MEMORY state is "design_active_completed" and `## Dialogue Output` is present
**Action:** Rename the returned `## Dialogue Output` section to `## Design Doc` (bash: `sed -i 's/^## Dialogue Output$/## Design Doc/' ./MEMORY.md`). Overwrite `./scoped/phase.md` with the single word `coding`. Append to `./MEMORY.md`:

    ## Push
    dynamics/dialogue.md
    ## Push-Args
    participants: |
      coder,reviewer
    topic: |
      Implement the following design:
      <verbatim ## Design Doc body, indented two spaces under this line>
    input: |
      <verbatim ## Design Doc body, indented two spaces>
    acceptance: |
      true

**Set state to "coding_active"**.

## Instruction: Coding done — enter testing
**Condition:** MEMORY state is "coding_active_completed" and `## Dialogue Output` is present
**Action:** Rename `## Dialogue Output` to `## Code` (`sed -i 's/^## Dialogue Output$/## Code/' ./MEMORY.md`). Overwrite `./scoped/phase.md` with the single word `testing`. Append to `./MEMORY.md`:

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

## Instruction: Testing done — enter documenting
**Condition:** MEMORY state is "testing_active_completed" and `## Dialogue Output` is present
**Action:** Rename `## Dialogue Output` to `## Test Report` (`sed -i 's/^## Dialogue Output$/## Test Report/' ./MEMORY.md`). Overwrite `./scoped/phase.md` with the single word `documenting`. Append to `./MEMORY.md`:

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

## Instruction: Finish
**Condition:** MEMORY state is "doc_active_completed" and `## Dialogue Output` is present
**Action:** Rename `## Dialogue Output` to `## Documentation` (`sed -i 's/^## Dialogue Output$/## Documentation/' ./MEMORY.md`). Set state to "done".

# Sub-instructions

(none — this interpreter needs none.)
