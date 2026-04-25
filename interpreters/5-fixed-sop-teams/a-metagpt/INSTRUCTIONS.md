# Strategy: MetaGPT — document hand-off SOP

IMPORTANT: Everything between "# Strategy" and "# Sub-instructions" is the strategy. It must be copied VERBATIM into every update_instructions call. Never modify, summarize, or omit any strategy instruction. Only the "# Sub-instructions" section below changes.

This interpreter implements the MetaGPT pattern (patterns.md Group 5): a fixed SOP walking PM → Architect → Engineer → QA, with document hand-off as the contract between roles (one role per phase, each produces a typed document consumed by the next).

Typed hand-off contract (per role, via `## Push-Args` and `## Return`). Note the section names match the shell's splice convention (`key:` becomes `## Key` — first char uppercased, rest preserved):
- `role-pm.md` consumes `{{program}}`, returns key `prd` → splices as `## Prd`.
- `role-architect.md` consumes `{{prd}}`, returns key `design` → splices as `## Design`.
- `role-engineer.md` consumes `{{design}}`, returns key `tasks` → splices as `## Tasks`.
- `role-qa.md` consumes `{{tasks}}` and `{{code_location}}`, returns key `code_review` → splices as `## Code_review`.

After dispatching to the next role, each step REMOVES the section it just forwarded so subsequent `empty_completed` conditions can disambiguate by the most-recently-spliced section.

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
**Condition:** MEMORY state is "empty_completed" and `## Prd` is present
**Action:** Append to `./MEMORY.md`:

    ## Push
    dynamics/role-architect.md
    ## Push-Args
    prd: |
      <verbatim ## Prd body, every line indented two spaces>

Then remove the `## Prd` section from MEMORY (it has been forwarded to the architect via push-args; keeping it would alias future `empty_completed` conditions). Do not change state.

## Instruction: Dispatch Engineer
**Condition:** MEMORY state is "empty_completed" and `## Design` is present
**Action:** Append to `./MEMORY.md`:

    ## Push
    dynamics/role-engineer.md
    ## Push-Args
    design: |
      <verbatim ## Design body, every line indented two spaces>

Then remove the `## Design` section from MEMORY (forwarded to the engineer). Do not change state.

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

Then remove the `## Tasks` section from MEMORY (forwarded to QA). Do not change state.

## Instruction: Finish
**Condition:** MEMORY state is "empty_completed" and `## Code_review` is present
**Action:** Read `## Code_review`. If the verdict field suggests success, set state to "done". If it suggests failure, append a non-blocking `## Pending Questions` entry noting the failed review and set state to "done" anyway (the CLI tool is still an artefact; the user may inspect it). Do NOT re-push any role; this interpreter is a linear SOP, not a loop.

# Sub-instructions

(none — this interpreter needs none.)
