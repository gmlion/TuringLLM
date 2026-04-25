# Strategy: Plan-Execute (subsumes Orchestrator-Workers, Deep Research, XAgent)

IMPORTANT: Everything between "# Strategy" and "# Sub-instructions" is the strategy. It must be copied VERBATIM into every update_instructions call. Never modify, summarize, or omit any strategy instruction. Only the "# Sub-instructions" section below changes.

This interpreter implements the Plan-and-Execute pattern (patterns.md Group 2), which subsumes Orchestrator–Workers, Deep Research, and XAgent under the current sequential shell. The strategy plans, iterates through steps, optionally replans on step failure, and synthesizes a final report. The machine halts when state is "done" at stack depth 1 (the shell intercepts this well-known state). Three scoped files hold state:
- `./scoped/plan.md` — the current plan (wholesale-rewritten by "Absorb plan" and when replanning)
- `./scoped/results.md` — append-only log of step results; MUST use surgical `echo "- R<N>: <text>" >> ./scoped/results.md`, never wholesale rewrite
- `./scoped/cursor.md` — integer index of the step currently executing (wholesale overwrite each advance)

## Instruction: Initialize
**Condition:** MEMORY state is "empty"
**Action:** Read `../../PROGRAM.md`. Create `./scoped/results.md` (empty — `: > ./scoped/results.md`) and `./scoped/cursor.md` containing the single line `0`. Append to `./MEMORY.md`:

    ## Push
    dynamics/plan.md
    ## Push-Args
    goal: |
      <verbatim PROGRAM.md body, every line indented two spaces>

Do not change state — the shell will set it to "empty" when it pushes the dynamic. After the push returns, this frame's state becomes "planning_completed" and `## Plan` is spliced into MEMORY.

## Instruction: Absorb plan
**Condition:** MEMORY state is "planning_completed" and `## Plan` is present
**Action:** Read `## Plan` from MEMORY. Write its body to `./scoped/plan.md` via wholesale `cat > ./scoped/plan.md << 'EOF' ... EOF` (initial creation or replan overwrite is allowed for this specific file). Remove the `## Plan` section from MEMORY (it is now on disk). Set state to "ready".

## Instruction: Dispatch step
**Condition:** MEMORY state is "ready" and the cursor in `./scoped/cursor.md` is less than the number of `- S<N>:` bullets in `./scoped/plan.md`
**Action:** Read the cursor integer from `./scoped/cursor.md`. Read the corresponding step line from `./scoped/plan.md` (the `(cursor+1)`-th `- S<N>:` bullet). Build a short context digest by reading the last few bullets from `./scoped/results.md` (tail -n 3 or similar). Append to `./MEMORY.md`:

    ## Push
    dynamics/execute-step.md
    ## Push-Args
    current_step: |
      <verbatim step text, every line indented two spaces>
    context: |
      <digest of results.md tail, every line indented two spaces; if empty, the literal value `(no prior results)`>

Do not change state.

## Instruction: Route after step
**Condition:** MEMORY state is "executing_completed" and `## Step Result` is present
**Action:** Parse the `## Step Result` body. The first non-empty key-value line should be `status: <value>`.

If the status value suggests success (e.g. the literal word `success`, or the line otherwise indicates acceptable completion), read the cursor from `./scoped/cursor.md`; surgically append the output to `./scoped/results.md` via `echo "- R$(( $(wc -l < ./scoped/results.md) + 1 )): <one-line output>" >> ./scoped/results.md` (or a simpler incrementing scheme that does not rewrite the file); increment the cursor by one and write it back to `./scoped/cursor.md`. Remove `## Step Result` from MEMORY. Set state to "ready".

If the status value suggests that the plan needs revising (e.g. the literal `needs_replan`), append to `./MEMORY.md`:

    ## Push
    dynamics/plan.md
    ## Push-Args
    goal: |
      <verbatim PROGRAM.md body re-read from ../../PROGRAM.md, indented two spaces>
    results_so_far: |
      <verbatim contents of ./scoped/results.md, indented two spaces; if empty, the literal value `(no prior results)`>

Do not change the cursor. Do not change state (shell will set to "empty" on push). After return the plan is re-absorbed via "Absorb plan" and iteration resumes.

If the status is neither clearly success nor clearly needs_replan (malformed), append a `## Pending Questions` item of the form `- **Q<N>**: Step S<cursor+1> returned a malformed status; asking user to disambiguate.` (use the next free Q-index). DO NOT set state to "waiting_for_user" — keep iteration going by advancing the cursor (so progress continues while the question sits unanswered). Set state to "ready".

## Instruction: Ready to synthesise
**Condition:** MEMORY state is "ready" and the cursor in `./scoped/cursor.md` equals the number of `- S<N>:` bullets in `./scoped/plan.md`
**Action:** Append to `./MEMORY.md`:

    ## Push
    dynamics/synthesize.md
    ## Push-Args
    results: |
      <verbatim contents of ./scoped/results.md, every line indented two spaces>

Do not change state.

## Instruction: Finish
**Condition:** MEMORY state is "synthesising_completed" and `## Report` is present
**Action:** Set state to "done". The shell will halt at stack.length==1.

# Sub-instructions

(none — this interpreter needs none.)
