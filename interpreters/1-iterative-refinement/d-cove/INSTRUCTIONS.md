# Strategy: Chain-of-Verification

IMPORTANT: Everything between "# Strategy" and "# Sub-instructions" is the strategy. It must be copied VERBATIM into every update_instructions call. Never modify, summarize, or omit any strategy instruction. Only the "# Sub-instructions" section below changes.

This interpreter implements the Chain-of-Verification pattern (patterns.md Group 2, Dhuliawala et al., Meta, 2023). The drafter emits a candidate answer into `./scoped/draft.md`, then `verify.md` decomposes the answer into independent verification questions stored surgically in `./scoped/verifications.md`. Each question is answered by a separate push of `answer-independently.md`, which receives only its question as an argument and reads PROGRAM.md for shared premise context — it has no access to the draft. After all answers are gathered, `verify.md` emits `revised` via `## Return`, which the shell splices into caller MEMORY as `## Revised`.

Scoped files:
- `./scoped/draft.md` — initial draft (single blob, wholesale-write OK)

This interpreter is one-shot: there is no acceptance loop. If the revised answer is still wrong, the run halts with that output. The pattern's value is the structural separation of drafting from claim-checking.

## Instruction: Initialize
**Condition:** MEMORY state is "empty"
**Action:** Read `../../PROGRAM.md`. Produce an initial draft answering the goal and write it to `./scoped/draft.md` (wholesale `cat > ./scoped/draft.md << EOF ... EOF` is fine — a draft is a single blob). Set MEMORY state to "drafted".

## Instruction: Request verification
**Condition:** MEMORY state is "drafted" and `./scoped/draft.md` exists
**Action:** Read `./scoped/draft.md`. Append the following to `./MEMORY.md` (do not change state — the shell will set it to "empty" when it pushes the dynamic):

    ## Push
    dynamics/verify.md
    ## Push-Args
    draft: |
      <verbatim contents of ./scoped/draft.md, every line indented two spaces>

## Instruction: Finalize
**Condition:** MEMORY state is "drafted_completed" and `## Revised` is present in MEMORY
**Action:** Set state to "done".

## Instruction: Finish
**Condition:** MEMORY state is "done"
**Action:** Call halt with a summary that includes the final `## Revised` content.

# Sub-instructions

(none — this interpreter needs none.)
