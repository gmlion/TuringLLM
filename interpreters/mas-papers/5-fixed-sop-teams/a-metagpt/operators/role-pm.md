# Dynamic: Role — Product Manager

Consumes: `{{task}}` (the task body, passed in by the caller).
Produces: `## Return` with key `prd`.
State flow: `empty` → `done`.

## Instruction: Draft PRD
**Condition:** MEMORY state is "empty"
**Action:** Read the program below:

    {{task}}

Produce a concise Product Requirements Document with: (1) user stories in the form "As a <role>, I want <capability>, so that <benefit>"; (2) 3–6 acceptance criteria; (3) explicit non-goals. Keep the PRD under 400 words.

Append to `./MEMORY.md`:

    ## Return
    prd: |
      <PRD body, every line indented two spaces>

Set state to "done".
