# Strategy: MetaGPT — document hand-off SOP

IMPORTANT: Everything between "# Strategy" and "# Sub-instructions" is the strategy. It must be copied VERBATIM into every update_instructions call. Never modify, summarize, or omit any strategy instruction. Only the "# Sub-instructions" section below changes.

This interpreter implements the MetaGPT pattern (patterns.md Group 5): a fixed SOP walking PM → Architect → Engineer → QA, with document hand-off as the contract between roles (one role per phase, each produces a typed document consumed by the next).

Typed hand-off contract (per role, via `## Push-Args`):
- `role-pm.md` consumes `{{program}}`, returns `## PRD`.
- `role-architect.md` consumes `{{prd}}`, returns `## Design`.
- `role-engineer.md` consumes `{{design}}`, returns `## Tasks`.
- `role-qa.md` consumes `{{tasks}}` and `{{code_location}}`, returns `## Code Review`.

## Instruction: Initialize
**Condition:** MEMORY state is "empty"
**Action:** Read `../../PROGRAM.md`. Append to `./MEMORY.md`:

    ## Push
    dynamics/role-pm.md
    ## Push-Args
    program: |
      <verbatim PROGRAM.md body, every line indented two spaces>

Do not change state.

## Instruction: Dispatch Architect
**Condition:** MEMORY state is "empty_completed" and `## PRD` is present
**Action:** Append to `./MEMORY.md`:

    ## Push
    dynamics/role-architect.md
    ## Push-Args
    prd: |
      <verbatim ## PRD body, every line indented two spaces>

Do not change state.

## Instruction: Dispatch Engineer
**Condition:** MEMORY state is "empty_completed" and `## Design` is present
**Action:** Append to `./MEMORY.md`:

    ## Push
    dynamics/role-engineer.md
    ## Push-Args
    design: |
      <verbatim ## Design body, every line indented two spaces>

Do not change state.

## Instruction: Dispatch QA
**Condition:** MEMORY state is "empty_completed" and `## Tasks` is present
**Action:** Append to `./MEMORY.md`:

    ## Push
    dynamics/role-qa.md
    ## Push-Args
    tasks: |
      <verbatim ## Tasks body, every line indented two spaces>
    code_location: |
      ../../workspace/

Do not change state.

## Instruction: Finish
**Condition:** MEMORY state is "empty_completed" and `## Code Review` is present
**Action:** Read `## Code Review`. If the verdict field suggests success, set state to "done". If it suggests failure, append a non-blocking `## Pending Questions` entry noting the failed review and set state to "done" anyway (the CLI tool is still an artefact; the user may inspect it). Do NOT re-push any role; this interpreter is a linear SOP, not a loop.

# Sub-instructions

(none — this interpreter needs none.)
