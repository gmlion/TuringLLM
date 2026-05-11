# Operator: Chain-of-Verification

IMPORTANT: This operator file is the canonical strategy. Do not modify it via update_instructions; it is only loaded at push-time.

Receives push-args (mode 1: standalone via root-operator bootstrap):
  - `{{program}}` — the user's PROGRAM.md content.

Receives push-args (mode 2: invoked by aflow-lite as part of a workflow):
  - `{{task}}` — the task description (e.g. one GSM8K item's question text).
  - `{{prior_answer}}` — the previous operator's `## Answer`, or empty for the first operator. If non-empty, it is used as the draft to verify rather than generating a fresh draft.

Produces: `## State done` + `## Return` block with key `answer`. The existing `## Revised` section is also written for human inspection.

This operator implements the Chain-of-Verification pattern (patterns.md Group 1, Dhuliawala et al., Meta, 2023). The drafter emits a candidate answer into `./scoped/draft.md`, then `operators/verify.md` decomposes the answer into independent verification questions stored surgically in `./scoped/verifications.md`. Each question is answered by a separate push of `operators/answer-independently.md`, which receives only its question as an argument and reads PROGRAM.md for shared premise context — it has no access to the draft. After all answers are gathered, `operators/verify.md` emits `revised` via `## Return`, which the shell splices into caller MEMORY as `## Revised`.

Scoped files:
- `./scoped/draft.md` — initial draft (single blob, wholesale-write OK)

This operator is one-shot: there is no acceptance loop. If the revised answer is still wrong, the run halts with that output. The pattern's value is the structural separation of drafting from claim-checking.

## Instruction: Initialize
**Condition:** MEMORY state is "empty"
**Action:** Detect which mode this operator was invoked in, then produce an initial draft.

    # Detect mode (R47): if {{task}} is still a literal token, we are in standalone mode.
    # substitutePlaceholders only replaces what was passed in ## Push-Args, so
    # an unsubstituted {{task}} token remains verbatim in INSTRUCTIONS.md.
    if grep -qF '{{task}}' ./INSTRUCTIONS.md; then
      # Mode 1 — standalone: {{program}} was substituted with PROGRAM.md content.
      # The task is the full program text (visible inline below in this file).
      MODE="standalone"
    else
      # Mode 2 — AFlow-lite: {{task}} was substituted with the item's question text
      # and {{prior_answer}} was substituted with the previous operator's answer.
      MODE="aflow"
    fi

Read the task content from this operator file (the substituted content of `{{program}}` or `{{task}}` is visible inline in INSTRUCTIONS.md after substitution). In AFlow-lite mode, if `{{prior_answer}}` is non-empty, use it as the draft to verify rather than generating a fresh draft. Otherwise produce an initial draft addressing the task. Write the draft to `./scoped/draft.md` (wholesale `cat > ./scoped/draft.md << 'DRAFTEOF' ... DRAFTEOF` is fine — a draft is a single blob). Set MEMORY state to "drafted".

Program (mode 1 — substituted at push-time):
{{program}}

Task (mode 2 — substituted at push-time):
{{task}}

Prior answer (mode 2 — substituted at push-time, may be empty):
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
**Condition:** MEMORY state is "drafted_completed" and `## Revised` is present in MEMORY
**Action:** Read `## Revised` from MEMORY. Write `./MEMORY.md` with the FULL done state in a SINGLE heredoc (the `## Return` block MUST be in the same heredoc as the state change — at depth>=2 the shell pops on state is "done" BEFORE any subsequent instruction runs, so a separate Finish instruction would be unreachable):

```
REVISED=$(grep -A 9999 '^## Revised' ./MEMORY.md | tail -n +2 | sed '/^## /,$d')
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
