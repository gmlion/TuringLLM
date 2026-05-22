# Dynamic: Implement Feature

Receives arguments:
  - `{{feature}}` — the feature description.
  - `{{implementation_plan}}` — the team-lead's synthesized plan (3-8 concrete steps).

Produces: `## State done` + `## Return` block with keys `outcome` (literal `done` or `fail`) and `notes` (free-text summary of what was done or why it failed).
Return: state done → caller sees {caller_state}_completed, and the verbatim `## Return` body is placed into the caller's MEMORY under a single `## Popped Return` section (the caller reads `outcome` and `notes` keys from inside that section).

Scoped state:
  - `./scoped/progress.md` — append-only log of step-by-step execution (`- step N: <action>; <result>`). **Surgical edits only** (`echo >>`); never wholesale-rewrite.
  - `./scoped/plan.md` — current per-step queue (`- step N: <action>; pending|done|fail`). **Surgical edits only** (`sed -i`).

## Instruction: Bootstrap
**Condition:** MEMORY state is "empty"
**Action:** Read the implementation plan below. Convert it into a numbered step queue at `./scoped/plan.md` (wholesale create — initial creation only):

    - step 1: <action>; pending
    - step 2: <action>; pending
    ...

Create empty `./scoped/progress.md`. Set MEMORY state to "executing".

Implementation plan (substituted at push-time):
{{implementation_plan}}

Feature being implemented (substituted at push-time):
{{feature}}

## Instruction: Execute next step
**Condition:** MEMORY state is "executing" and `./scoped/plan.md` has a line ending in `pending`
**Action:** Find the FIRST pending step in `./scoped/plan.md`. Read its action text. Execute it against the workspace at `../../workspace/`. Project artifacts (source files, configs, assets) go in `../../workspace/`; that directory has its own git repo and the `git` tool operates there.

Headless verification is mandatory for each step that produces a file or executes code:
  - For source files: run a syntax check (`node --check foo.js`, `python -c "import ast; ast.parse(open('foo.py').read())"`, etc).
  - For build configs: run the build (`npm run build`, `make`, etc) and capture the exit code.
  - For tests: actually run them and capture pass/fail.
  - For assets generated programmatically (SVG, generated PNG): verify the file is non-empty and well-formed.

Record the step result surgically:

    echo "- step <N>: <action>; <verification command and outcome>" >> ./scoped/progress.md

Then surgically update `./scoped/plan.md`:
  - On success: replace the line's `pending` with `done`:
    `sed -i '0,/^- step <N>:.*pending$/{s/pending$/done/}' ./scoped/plan.md`
  - On failure: replace with `fail: <short reason>` and set MEMORY state to "step_failed" (not "executing"):
    `sed -i '0,/^- step <N>:.*pending$/{s/pending$/fail: <reason>/}' ./scoped/plan.md`

If still in "executing" state, stay in "executing" (the next cycle picks up the next pending step). Do NOT change state on success — the loop continues until no pending lines remain.

## Instruction: All steps done — finalize
**Condition:** MEMORY state is "executing" and `./scoped/plan.md` has no lines ending in `pending` AND no lines starting `- step .*; fail:`
**Action:** All steps succeeded. Write `./MEMORY.md` with the FULL done state in a SINGLE heredoc:

    PROGRESS=$(cat ./scoped/progress.md)
    cat > ./MEMORY.md << FINEOF
    ## State
    done
    ## Matched Instruction
    All steps done — finalize
    ## Last Action
    Completed all implementation steps for the feature; all headless verifications passed.
    ## Result
    Feature implemented and verified.
    ## Return
    outcome: done
    notes: |
    $(echo "${PROGRESS}" | sed 's/^/  /')
    FINEOF

## Instruction: A step failed — finalize as fail
**Condition:** MEMORY state is "step_failed", OR (MEMORY state is "executing" AND `./scoped/plan.md` has a line starting `- step .*; fail:`)
**Action:** A step failed and the implementation cannot proceed without team-lead intervention. Capture the failure context and return `outcome: fail`. The caller will decide whether to retry or drop the feature.

    PROGRESS=$(cat ./scoped/progress.md)
    FAILED=$(grep '^- step .*; fail:' ./scoped/plan.md | head -n 1)
    cat > ./MEMORY.md << FINEOF
    ## State
    done
    ## Matched Instruction
    A step failed — finalize as fail
    ## Last Action
    Implementation failed at: ${FAILED}
    ## Result
    Feature implementation failed; popping back to caller with outcome: fail.
    ## Return
    outcome: fail
    notes: |
      Failed step: ${FAILED}

      Progress log:
    $(echo "${PROGRESS}" | sed 's/^/      /')
    FINEOF
