# Strategy: ChatDev — phase-dialogue SOP

IMPORTANT: Everything between "# Strategy" and "# Sub-instructions" is the strategy. It must be copied VERBATIM into every update_instructions call. Never modify, summarize, or omit any strategy instruction. Only the "# Sub-instructions" section below changes.

This interpreter implements the ChatDev pattern (patterns.md Group 5): four phases — design, coding, testing, documenting — each phase a dialogue between a role pair. Design uses CEO↔CTO without an acceptance gate; coding / testing / documenting pair a specialist with the reviewer and use `evaluate.md` as an acceptance gate.

Scoped files:
- `./scoped/phase.md` — current phase name (wholesale overwrite at each phase transition).

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

Do not change state.

## Instruction: Design done — enter coding
**Condition:** MEMORY state is "empty_completed" and `## Dialogue Output` is present and `./scoped/phase.md` contains the word `design`
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

Do not change state.

## Instruction: Coding done — enter testing
**Condition:** MEMORY state is "empty_completed" and `## Dialogue Output` is present and `./scoped/phase.md` contains the word `coding`
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

Do not change state.

## Instruction: Testing done — enter documenting
**Condition:** MEMORY state is "empty_completed" and `## Dialogue Output` is present and `./scoped/phase.md` contains the word `testing`
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

Do not change state.

## Instruction: Finish
**Condition:** MEMORY state is "empty_completed" and `## Dialogue Output` is present and `./scoped/phase.md` contains the word `documenting`
**Action:** Rename `## Dialogue Output` to `## Documentation` (`sed -i 's/^## Dialogue Output$/## Documentation/' ./MEMORY.md`). Set state to "done".

# Sub-instructions

(none — this interpreter needs none.)
