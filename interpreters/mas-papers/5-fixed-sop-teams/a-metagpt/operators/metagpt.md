# Operator: MetaGPT — document hand-off SOP

IMPORTANT: This operator file is the canonical strategy. Do not modify it via update_instructions; it is only loaded at push-time.

Receives push-args:
  - `{{task}}` — the task body. PROGRAM.md content when bootstrap-loaded; the per-item task text when invoked as a library operator by a meta-framework.
  - `{{prior_answer}}` — a prior operator's answer to prepend as context, or empty if none.

Produces: `## State done` + `## Return` block with key `answer`. The `## Review` section is also written for human inspection.

This operator implements the MetaGPT pattern (patterns.md Group 5): a fixed SOP walking PM → Architect → Engineer → QA, with document hand-off as the contract between roles (one role per phase, each produces a typed document consumed by the next).

Typed hand-off contract (per role, via `## Push-Args` and `## Return`). Section names follow the project convention: Title Case, no underscores. Return keys are single English words so the shell's splice (`key:` → `## Key`) yields clean section names:
- `role-pm.md` consumes `{{task}}`, returns key `prd` → splices as `## Prd`.
- `role-architect.md` consumes `{{prd}}`, returns key `design` → splices as `## Design`.
- `role-engineer.md` consumes `{{design}}`, returns key `tasks` → splices as `## Tasks`.
- `role-qa.md` consumes `{{tasks}}` and `{{code_location}}`, returns key `review` → splices as `## Review`.

Each Dispatch instruction sets the caller's state to a phase-active label (`pm_active`, `architect_active`, `engineer_active`, `qa_active`) BEFORE the push. The shell preserves that as the returnState; on pop, the caller's state becomes `<label>_completed`, which the next Dispatch instruction matches. This avoids the `empty_completed` aliasing across all four push sites.

The typed hand-off sections (`## Prd`, `## Design`, `## Tasks`, `## Review`) **accumulate in MEMORY** as the SOP progresses — they are NOT removed after dispatch. State-name disambiguation handles the condition matching; section accumulation gives the final MEMORY a complete record of every role's contribution.

## Instruction: Initialize
**Condition:** MEMORY state is "empty"
**Action:** Push role-pm.md with the task body. If `{{prior_answer}}` is non-empty, prepend it as context to the task body before passing it on.

Append to `./MEMORY.md`:

    ## Push
    operators/role-pm.md
    ## Push-Args
    task: |
      <verbatim {{task}} content (with {{prior_answer}} prepended as context if non-empty), every line indented two spaces>

**Set state to "pm_active"** (the post-pop state will be "pm_active_completed", which Dispatch Architect matches).

Task (substituted at push-time):
{{task}}

Prior answer (substituted at push-time, may be empty):
{{prior_answer}}

## Instruction: Dispatch Architect
**Condition:** MEMORY state is "pm_active_completed" and `## Prd` is present
**Action:** Append to `./MEMORY.md`:

    ## Push
    operators/role-architect.md
    ## Push-Args
    prd: |
      <verbatim ## Prd body, every line indented two spaces>

Leave `## Prd` in MEMORY (it accumulates as part of the final hand-off record per the typed hand-off contract above). **Set state to "architect_active"**.

## Instruction: Dispatch Engineer
**Condition:** MEMORY state is "architect_active_completed" and `## Design` is present
**Action:** Append to `./MEMORY.md`:

    ## Push
    operators/role-engineer.md
    ## Push-Args
    design: |
      <verbatim ## Design body, every line indented two spaces>

Leave `## Design` in MEMORY. **Set state to "engineer_active"**.

## Instruction: Dispatch QA
**Condition:** MEMORY state is "engineer_active_completed" and `## Tasks` is present
**Action:** Append to `./MEMORY.md`:

    ## Push
    operators/role-qa.md
    ## Push-Args
    tasks: |
      <verbatim ## Tasks body, every line indented two spaces>
    code_location: |
      ../../workspace/

Leave `## Tasks` in MEMORY. **Set state to "qa_active"**.

## Instruction: Finish
**Condition:** MEMORY state is "qa_active_completed" and `## Review` is present
**Action:** Read `## Review`. If the verdict field suggests success, set state to "done". If it suggests failure, append a non-blocking `## Pending Questions` entry noting the failed review and set state to "done" anyway (the CLI tool is still an artefact; the user may inspect it). Do NOT re-push any role; this operator is a linear SOP, not a loop.

Write `./MEMORY.md` with this EXACT single-heredoc shape (the `## Return` block MUST be in the same heredoc as the state change — without it the caller receives no return value):

```
cat > ./MEMORY.md << FINEOF
## State
done
## Matched Instruction
Finish
## Last Action
MetaGPT SOP completed. All four phases (PM → Architect → Engineer → QA) have run.
## Result
$(cat ./MEMORY.md | grep -A1000 '^## Review' | head -50)
## Review
$(grep -A1000 '^## Review' ./MEMORY.md | tail -n +2 | sed '/^## /,$d')
## Return
answer: |
$(grep -A1000 '^## Review' ./MEMORY.md | tail -n +2 | sed '/^## /,$d' | sed 's/^/  /')
FINEOF
```

The shell will halt at stack.length==1 (standalone) or pop to caller (AFlow-lite mode).

# Sub-instructions

(none — this operator needs none.)
