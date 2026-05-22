# Operator: Chain-of-Verification

IMPORTANT: This operator file is the canonical strategy. Do not modify it via update_instructions; it is only loaded at push-time.

Receives push-args:
  - `{{task}}` — the task body. PROGRAM.md content when bootstrap-loaded; the per-item task text when invoked as a library operator by a meta-framework.
  - `{{prior_answer}}` — a prior operator's answer to use as the draft to verify, or empty if none. If non-empty, used directly as the draft rather than generating a fresh one.

Produces: `## State done` + `## Return` block with key `answer`. The existing `## Revised` section is also written for human inspection.

This operator implements the Chain-of-Verification pattern (patterns.md Group 1, Dhuliawala et al., Meta, 2023). The drafter emits a candidate answer into `./scoped/draft.md`, then `operators/verify.md` decomposes the answer into independent verification questions stored surgically in `./scoped/verifications.md`. Each question is answered by a separate push of `operators/answer-independently.md`, which receives only its question as an argument and reads PROGRAM.md for shared premise context — it has no access to the draft. After all answers are gathered, `operators/verify.md` emits `revised` via `## Return`. The shell places that body verbatim under `## Popped Return` in this frame's MEMORY; this operator then reads the `revised` key from inside `## Popped Return`.

Scoped files:
- `./scoped/draft.md` — initial draft (single blob, wholesale-write OK)

This operator is one-shot: there is no acceptance loop. If the revised answer is still wrong, the run halts with that output. The pattern's value is the structural separation of drafting from claim-checking.

## Instruction: Initialize
**Condition:** MEMORY state is "empty"
**Action:** Produce an initial draft.

Read the task from the `{{task}}` section below. If `{{prior_answer}}` is non-empty, use it as the draft to verify rather than generating a fresh draft. Otherwise produce an initial draft addressing the task. Write the draft to `./scoped/draft.md` (wholesale `cat > ./scoped/draft.md << 'DRAFTEOF' ... DRAFTEOF` is fine — a draft is a single blob). Set MEMORY state to "drafted".

Task (substituted at push-time):
{{task}}

Prior answer (substituted at push-time, may be empty):
{{prior_answer}}

## Instruction: Request verification
**Condition:** MEMORY state is "drafted" and `./scoped/draft.md` exists
**Action:** Read `./scoped/draft.md`. Append the following to `./MEMORY.md` (do not change state — the shell will set it to "empty" when it pushes the operator):

    ## Push
    operators/verify.md
    ## Push-Args
    draft: |
      <verbatim contents of ./scoped/draft.md, every line indented two spaces>

## Instruction: Finalize
**Condition:** MEMORY state is "drafted_completed" and `## Popped Return` is present in MEMORY with a `revised` key
**Action:** Read the `revised` value from the `## Popped Return` section in MEMORY (the body uses block-scalar form: `revised: |` followed by indented-two-space lines). Strip the leading two spaces of indentation to recover the revised text. Write `./MEMORY.md` with the FULL done state in a SINGLE heredoc (the `## Return` block MUST be in the same heredoc as the state change — at depth>=1 the shell pops on state is "done" BEFORE any subsequent instruction runs, so a separate Finish instruction would be unreachable):

```
# Extract the block-scalar value of `revised:` from inside ## Popped Return.
REVISED=$(awk '
  /^## Popped Return$/ { in_pr=1; next }
  in_pr && /^## / { exit }
  in_pr && /^revised: \|$/ { in_v=1; next }
  in_pr && in_v && /^[a-zA-Z_]/ { exit }
  in_pr && in_v { sub(/^  /, ""); print }
' ./MEMORY.md)
cat > ./MEMORY.md << FINEOF
## State
done
## Matched Instruction
Finalize
## Last Action
Finalized Chain-of-Verification revised answer.
## Result
Chain-of-Verification complete.
## Revised
${REVISED}
## Return
answer: |
$(echo "${REVISED}" | sed 's/^/  /')
FINEOF
```
