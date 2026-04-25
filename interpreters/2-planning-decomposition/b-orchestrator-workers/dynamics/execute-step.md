# Dynamic: Execute-Step

Consumes: `{{current_step}}`, `{{context}}`.
Produces: `## Return` with key `step_result` (YAML block with `status` and `output`).
State flow: `empty` → `executing` → (`acceptable` | `needs_replan`) → `done`.
Stack: 1 by default; MAY push `plan.md` within this frame for sub-planning (depth 2).

## Instruction: Execute
**Condition:** MEMORY state is "empty"
**Action:** The current step to execute is:

    {{current_step}}

Prior results context (may be empty):

    {{context}}

If the step describes a broad research area rather than an executable action (e.g. "analyse X across all variants"), push `plan.md` within THIS frame to decompose — write to `./MEMORY.md`:

    ## Push
    dynamics/plan.md
    ## Push-Args
    goal: |
      <verbatim current_step>

Do not change state when pushing (the shell will set it to "empty" on return).

Otherwise, perform the step using the tools available: bash, write_file, git, web_search, web_fetch (or under Claude Code: Bash, Write, Edit, WebSearch, WebFetch). Artefacts go under `../../workspace/`. Append a short prose summary of what was done to `./scoped/attempt.md` via surgical `echo >>` (create the file if absent). Set state to "executing".

## Instruction: Self-check
**Condition:** MEMORY state is "executing"
**Action:** Read `./scoped/attempt.md`. Judge whether the step produced the intended artefact or outcome. If the work suggests success and no broader plan adjustment is warranted, set state to "acceptable". If the work indicates failure, missing prerequisites, or new information that warrants replanning, set state to "needs_replan".

## Instruction: Return acceptable
**Condition:** MEMORY state is "acceptable"
**Action:** Append to `./MEMORY.md`:

    ## Return
    step_result: |
      status: success
      output: <one-paragraph summary of what was produced>

Set state to "done".

## Instruction: Return needs_replan
**Condition:** MEMORY state is "needs_replan"
**Action:** Append to `./MEMORY.md`:

    ## Return
    step_result: |
      status: needs_replan
      output: <one-paragraph explanation of why the plan needs revising>

Set state to "done".
