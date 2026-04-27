# Strategy: Plan-Execute (subsumes Orchestrator-Workers, Deep Research, XAgent)

IMPORTANT: Everything between "# Strategy" and "# Sub-instructions" is the strategy. It must be copied VERBATIM into every update_instructions call. Never modify, summarize, or omit any strategy instruction. Only the "# Sub-instructions" section below changes.

This interpreter implements the Plan-and-Execute pattern (patterns.md Group 2), which subsumes Orchestrator–Workers, Deep Research, and XAgent under the current sequential shell. The strategy plans, iterates through steps, optionally replans on step failure, and synthesizes a final report. The machine halts when state is "done" at stack depth 1 (the shell intercepts this well-known state). Three scoped files hold state:
- `./scoped/plan.md` — the current plan (wholesale-rewritten by "Absorb plan" and when replanning)
- `./scoped/results.md` — append-only log of step results; MUST use surgical `echo "- R<N>: <text>" >> ./scoped/results.md`, never wholesale rewrite
- `./scoped/cursor.md` — integer index of the step currently executing (wholesale overwrite each advance)

**ATOMIC PUSH RULE — read carefully.** Every instruction below that emits a `## Push` block writes the **entire** MEMORY.md in a SINGLE bash heredoc that includes BOTH the canonical sections (## State, ## Matched Instruction, ## Last Action, ## Result) AND the push sections (## Push, ## Push-Args). Do NOT split the write into a `cat > MEMORY.md` followed by a `cat >> MEMORY.md` for the push — the shell processes ## Push only when it is in the SAME MEMORY.md as the state change. The instruction templates below show the exact heredoc shape; follow them literally.

## Instruction: Initialize
**Condition:** MEMORY state is "empty"
**Action:** Read `../../PROGRAM.md`. Create `./scoped/results.md` (empty — `: > ./scoped/results.md`) and `./scoped/cursor.md` containing the single line `0`.

Then write `./MEMORY.md` with this EXACT single-heredoc shape (substitute `<...>` placeholders with concrete values; keep everything else literal):

```
cat > ./MEMORY.md << 'MEMEOF'
## State
planning
## Matched Instruction
Initialize
## Last Action
Bootstrapped scoped/{results.md, cursor.md}; queued plan.md push.
## Result
Initial plan dispatch queued.
## Push
dynamics/plan.md
## Push-Args
goal: |
  <verbatim PROGRAM.md body, every line indented two spaces>
results_so_far: |
  (no prior results)
MEMEOF
```

The state value `planning` is what the shell stores as the returnState; on pop it becomes `planning_completed`, which "Absorb plan" matches. Both `goal` and `results_so_far` are required by `dynamics/plan.md`'s `{{...}}` placeholders.

## Instruction: Absorb plan
**Condition:** MEMORY state is "planning_completed" and `## Plan` is present
**Action:** Read `## Plan` from MEMORY. Write its body to `./scoped/plan.md` via wholesale `cat > ./scoped/plan.md << 'EOF' ... EOF` (initial creation or replan overwrite is allowed for this specific file). Then rewrite MEMORY without the `## Plan` section and with state="ready":

```
cat > ./MEMORY.md << 'MEMEOF'
## State
ready
## Matched Instruction
Absorb plan
## Last Action
Wrote returned plan to ./scoped/plan.md and consumed ## Plan from MEMORY.
## Result
Ready to dispatch step at cursor 0.
MEMEOF
```

## Instruction: Dispatch step
**Condition:** MEMORY state is "ready" and the cursor in `./scoped/cursor.md` is less than the number of `- S<N>:` bullets in `./scoped/plan.md`
**Action:** Read the cursor integer from `./scoped/cursor.md`. Read the corresponding step line from `./scoped/plan.md` (the `(cursor+1)`-th `- S<N>:` bullet). Build a short context digest by reading the last few bullets from `./scoped/results.md` (tail -n 3 or similar; use the literal string `(no prior results)` if the file is empty).

Then write `./MEMORY.md` with this EXACT single-heredoc shape (the push MUST be in the same heredoc as the state change — do NOT use a separate `cat >>`):

```
cat > ./MEMORY.md << 'MEMEOF'
## State
executing
## Matched Instruction
Dispatch step
## Last Action
Dispatched step S<cursor+1> for execution.
## Result
Push queued.
## Push
dynamics/execute-step.md
## Push-Args
current_step: |
  <verbatim step text, every line indented two spaces>
context: |
  <verbatim context digest, every line indented two spaces; or the literal "(no prior results)" if empty>
MEMEOF
```

The state value `executing` is what the shell stores as the returnState; on pop it becomes `executing_completed`, which "Route after step" matches.

## Instruction: Route after step
**Condition:** MEMORY state is "executing_completed" and `## Outcome` is present
**Action:** Parse the `## Outcome` body. The first non-empty key-value line should be `status: <value>`.

**If the status value suggests success** (e.g. the literal word `success`, or the line otherwise indicates acceptable completion):
1. Read the cursor from `./scoped/cursor.md`; surgically append the output to `./scoped/results.md` via `echo "- R$(( $(wc -l < ./scoped/results.md) + 1 )): <one-line output>" >> ./scoped/results.md`.
2. Increment the cursor by one and write it back to `./scoped/cursor.md`.
3. Rewrite MEMORY without `## Outcome` and with state="ready":

```
cat > ./MEMORY.md << 'MEMEOF'
## State
ready
## Matched Instruction
Route after step (success)
## Last Action
Recorded step S<old_cursor+1> success; advanced cursor to <new_cursor>.
## Result
OK.
MEMEOF
```

**If the status value suggests the plan needs revising** (e.g. the literal `needs_replan`):
1. Read the cursor from `./scoped/cursor.md`. Surgically record the just-popped step's output as a `[REPLAN-TRIGGER]` note in `./scoped/results.md` — this is what makes the sub-steps (or failure reason) visible to the next plan.md push:
   `echo "- R$(( $(wc -l < ./scoped/results.md) + 1 )): [REPLAN-TRIGGER from S<cursor+1>] <one-line summary of the output, e.g. 'Decomposed into: <comma-separated sub-steps>'>" >> ./scoped/results.md`
   (If the output already contains a structured sub-step list, summarize it as `Decomposed into: 1) X, 2) Y, ...` so plan.md can incorporate them as concrete leaves.)
2. Do NOT change the cursor — the new plan will be absorbed and iteration will resume from the same cursor index, but against the regenerated plan.
3. Then write MEMORY:

```
cat > ./MEMORY.md << 'MEMEOF'
## State
planning
## Matched Instruction
Route after step (needs_replan)
## Last Action
Step S<cursor+1> requested replan; recorded REPLAN-TRIGGER note in results.md; queued plan.md push.
## Result
Replan queued.
## Push
dynamics/plan.md
## Push-Args
goal: |
  <verbatim PROGRAM.md body re-read from ../../PROGRAM.md, indented two spaces>
results_so_far: |
  <verbatim contents of ./scoped/results.md, indented two spaces>
MEMEOF
```

After return the plan is re-absorbed via "Absorb plan" and iteration resumes from the unchanged cursor — but against the new plan, which should now contain the sub-steps as concrete leaves.

**If the status is neither clearly success nor clearly needs_replan** (malformed): rewrite MEMORY with state="ready" and append a non-blocking `## Pending Questions` item of the form `- **Q<N>**: Step S<cursor+1> returned a malformed status; asking user to disambiguate.` (use the next free Q-index). DO NOT set state to "waiting_for_user" — keep iteration going by advancing the cursor. The MEMORY rewrite for this case looks like:

```
cat > ./MEMORY.md << 'MEMEOF'
## State
ready
## Matched Instruction
Route after step (malformed)
## Last Action
Logged malformed step result for S<cursor+1> as pending question; advanced cursor.
## Result
OK; user can disambiguate later.
## Pending Questions
- **Q<N>**: Step S<cursor+1> returned a malformed status; asking user to disambiguate.
MEMEOF
```

## Instruction: Ready to synthesise
**Condition:** MEMORY state is "ready" and the cursor in `./scoped/cursor.md` equals the number of `- S<N>:` bullets in `./scoped/plan.md`
**Action:** Write `./MEMORY.md` with this EXACT single-heredoc shape:

```
cat > ./MEMORY.md << 'MEMEOF'
## State
synthesising
## Matched Instruction
Ready to synthesise
## Last Action
All steps complete; queued synthesize.md push.
## Result
Synthesis queued.
## Push
dynamics/synthesize.md
## Push-Args
results: |
  <verbatim contents of ./scoped/results.md, every line indented two spaces>
MEMEOF
```

The state value `synthesising` is what the shell stores as the returnState; on pop it becomes `synthesising_completed`, which "Finish" matches.

## Instruction: Finish
**Condition:** MEMORY state is "synthesising_completed" and `## Report` is present
**Action:** Set state to "done". The shell will halt at stack.length==1.

# Sub-instructions

(none — this interpreter needs none.)
