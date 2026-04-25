# Dynamic: Role — Architect

Consumes: `{{prd}}`.
Produces: `## Return` with key `design`.
State flow: `empty` → `done`.

## Instruction: Design the system
**Condition:** MEMORY state is "empty"
**Action:** Read the PRD below:

    {{prd}}

Produce a short design spec with: (1) component breakdown (modules and their responsibilities); (2) data model (types, schema, or file layout); (3) key interfaces (function signatures, CLI flags, or API endpoints); (4) error-handling strategy. Keep it under 500 words.

Append to `./MEMORY.md`:

    ## Return
    design: |
      <design body, every line indented two spaces>

Set state to "done".
