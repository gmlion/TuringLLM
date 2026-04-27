# Dynamic: Execute-Step

Consumes: `{{current_step}}`, `{{context}}`.
Produces: `## Return` with key `outcome` (YAML block with `status` and `output`). The shell splices this into the caller's MEMORY as `## Outcome`.
State flow: `empty` → (`executing` | push `plan.md` → `empty_completed`) → (`acceptable` | `needs_replan`) → `done`.
Stack: 1 by default; MAY push `plan.md` within this frame for sub-planning (depth 2).

**ATOMIC RETURN RULE — read carefully.** The two Return instructions below (`Return acceptable`, `Return needs_replan`) write the **entire** MEMORY.md in a SINGLE bash heredoc that includes BOTH the canonical sections (## State, ## Matched Instruction, ## Last Action, ## Result) AND the `## Return` block. Do NOT split the write into a `cat > MEMORY.md` followed by a separate `cat >> MEMORY.md` for the `## Return` block — the system prompt's canonical MEMORY recipe shows only the four canonical sections, and following it literally would clobber the `## Return` block, leaving the shell with nothing to splice on pop. Follow the heredoc templates below LITERALLY.

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
**Action:** A recursive sub-plan was returned from a `plan.md` push within this frame. Read the sub-plan body — it contains concrete sub-steps that decompose the broad current step. Write the sub-plan body verbatim to `./scoped/attempt.md` (wholesale rewrite — it's the single artefact this frame will return to the strategy). Remove `## Plan` from MEMORY (it has been absorbed and is about to be returned). Set state to "needs_replan" — the current step itself was NOT executed; only decomposed. The strategy will re-plan with the sub-steps now visible in `results_so_far`, then iterate execute-step over the new concrete leaves. Do NOT set state to "acceptable" — that would tell the strategy this step is done, advance the cursor, and the sub-steps would be lost.

## Instruction: Self-check
**Condition:** MEMORY state is "executing"
**Action:** Read `./scoped/attempt.md`. Judge whether the step produced the intended artefact or outcome. If the work suggests success and no broader plan adjustment is warranted, set state to "acceptable". If the work indicates failure, missing prerequisites, or new information that warrants replanning, set state to "needs_replan".

## Instruction: Return acceptable
**Condition:** MEMORY state is "acceptable"
**Action:** Read `./scoped/attempt.md` to recall what was produced. Write `./MEMORY.md` with this EXACT single-heredoc shape (the `## Return` block MUST be in the same heredoc as the state change — do NOT use a separate `cat >>`):

```
cat > ./MEMORY.md << 'MEMEOF'
## State
done
## Matched Instruction
Return acceptable
## Last Action
Wrote success outcome to ## Return; popping back to strategy.
## Result
Step executed successfully.
## Return
outcome: |
  status: success
  output: <one-paragraph summary of what was produced, indented two spaces under the `output:` key>
MEMEOF
```

## Instruction: Return needs_replan
**Condition:** MEMORY state is "needs_replan"
**Action:** Read `./scoped/attempt.md` for the failure or sub-plan context. Write `./MEMORY.md` with this EXACT single-heredoc shape:

```
cat > ./MEMORY.md << 'MEMEOF'
## State
done
## Matched Instruction
Return needs_replan
## Last Action
Wrote needs_replan outcome to ## Return; popping back to strategy.
## Result
Step needs replanning.
## Return
outcome: |
  status: needs_replan
  output: <one-paragraph explanation of why the plan needs revising. If attempt.md holds an absorbed sub-plan (a `- S<N>:` bullet list), summarize it inline so plan.md will see the sub-steps via results_so_far — e.g. "Decomposed step into the following concrete sub-steps: 1) <first>, 2) <second>, 3) <third>... Re-plan to include these as leaf steps." If attempt.md instead describes a failure or missing prerequisite, describe that.>
MEMEOF
```
