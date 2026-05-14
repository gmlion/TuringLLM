# Operator: Self-Refine

IMPORTANT: This operator file is the canonical strategy. Do not modify it via update_instructions; it is only loaded at push-time.

Receives push-args:
  - `{{task}}` — the task body. PROGRAM.md content when bootstrap-loaded; the per-item task text when invoked as a library operator by a meta-framework.
  - `{{prior_answer}}` — a prior operator's answer to use as a starting draft, or empty if none.

Produces: `## State done` + `## Return` block with key `answer`. The existing `## Refined` section is also written for human inspection.

This operator implements the Self-Refine pattern (patterns.md Group 1). A single role drafts into `./scoped/draft.md`, critiques its own draft via the `operators/self-critique.md` sub-operator (which receives a `draft` push-arg and returns `critique` + `refined` via `## Return`), and decides whether to accept or loop. No memory carries across iterations beyond the current `./scoped/draft.md`.

## Instruction: Initialize
**Condition:** MEMORY state is "empty"
**Action:** Produce an initial draft.

Read the task from the `{{task}}` section below. If `{{prior_answer}}` is non-empty, use it as a starting-point draft. Otherwise produce an initial draft addressing the task. Write the draft to `./scoped/draft.md` (wholesale `cat > ./scoped/draft.md << 'DRAFTEOF' ... DRAFTEOF` is fine — a draft is a single blob, not a list). Set MEMORY state to "drafted".

Task (substituted at push-time):
{{task}}

Prior answer (substituted at push-time, may be empty):
{{prior_answer}}

## Instruction: Request critique
**Condition:** MEMORY state is "drafted" and `./scoped/draft.md` exists
**Action:** Read `./scoped/draft.md`. Append the following to `./MEMORY.md` (do not change state — the shell will set it to "empty" when it pushes the operator):

    ## Push
    operators/self-critique.md
    ## Push-Args
    draft: |
      <verbatim contents of ./scoped/draft.md, every line indented two spaces>

## Instruction: Evaluate refinement
**Condition:** MEMORY state is "drafted_completed" and both `## Critique` and `## Refined` are present in MEMORY
**Action:** Decide whether `## Refined` adequately addresses the task.

**If accepted:** Write `./MEMORY.md` with state `done`, `## Refined`, and `## Return\nanswer:` in a SINGLE heredoc. (Note: the `## Return` block MUST be in the same heredoc as the state change — at depth>=2 the shell pops on state is "done" BEFORE any subsequent instruction runs, so a separate Finish instruction would be unreachable.)

```
cat > ./MEMORY.md << FINEOF
## State
done
## Matched Instruction
Evaluate refinement
## Last Action
Accepted refined draft.
## Result
Self-refine accepted.
## Refined
$(cat ./scoped/draft.md)
## Return
answer: |
$(cat ./scoped/draft.md | sed 's/^/  /')
FINEOF
```

**If not accepted:** Overwrite `./scoped/draft.md` wholesale with the content of `## Refined` (`cat > ./scoped/draft.md << 'DRAFTEOF' ... DRAFTEOF`). When rewriting MEMORY, omit the `## Critique` and `## Refined` sections (they were already consumed) and set state to "drafted" (which re-enters "Request critique" on the next cycle).
