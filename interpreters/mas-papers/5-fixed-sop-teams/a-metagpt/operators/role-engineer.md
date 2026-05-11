# Dynamic: Role — Engineer

Consumes: `{{design}}`.
Produces: `## Return` with key `tasks`; side-effect: writes code under `../../workspace/`.
State flow: `empty` → `authoring` → `done`.

## Instruction: Author code
**Condition:** MEMORY state is "empty"
**Action:** Read the design below:

    {{design}}

Implement the design by writing source files under `../../workspace/` using the `write_file` tool. Run any necessary validation (syntax check, `node --check`, or a trivial smoke test) via the `bash` tool; report the exit code in `./scoped/attempt.md` via `echo >>`. Set state to "authoring".

## Instruction: Enumerate tasks
**Condition:** MEMORY state is "authoring"
**Action:** Re-read the design and list each concrete task you actually carried out as a bullet. Include paths, commands run, and verification status. Append to `./MEMORY.md`:

    ## Return
    tasks: |
      - T1: <task, e.g. "wrote workspace/src/index.ts (24 lines)">
      - T2: <task>
      ...

Set state to "done".
