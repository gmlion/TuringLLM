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
    results_so_far: |
      (no prior results)

Do not change state when pushing (the shell creates a fresh child frame at state "empty"; on pop, this frame's state becomes "empty_completed" — see "Absorb sub-plan" below).

Otherwise, perform the step using the tools available: bash, write_file, git, web_search, web_fetch (or under Claude Code: Bash, Write, Edit, WebSearch, WebFetch). Artefacts go under `../../workspace/`. Append a short prose summary of what was done to `./scoped/attempt.md` via surgical `echo >>` (create the file if absent). Set state to "executing".

## Instruction: Absorb sub-plan
**Condition:** MEMORY state is "empty_completed" and `## Plan` is present
**Action:** A recursive sub-plan was returned from a `plan.md` push within this frame. Read the sub-plan body. Append a short prose summary to `./scoped/attempt.md` via `echo >>` describing the decomposition (e.g. "Decomposed broad step into N sub-questions: ..."). The current step is now considered handled at this layer (the sub-questions become inputs to the strategy's next planning round). Remove `## Plan` from MEMORY (it has been absorbed). Set state to "acceptable".

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
