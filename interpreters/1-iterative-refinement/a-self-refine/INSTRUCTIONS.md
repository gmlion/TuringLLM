# Strategy: Self-Refine

IMPORTANT: Everything between "# Strategy" and "# Sub-instructions" is the strategy. It must be copied VERBATIM into every update_instructions call. Never modify, summarize, or omit any strategy instruction. Only the "# Sub-instructions" section below changes.

This interpreter implements the Self-Refine pattern (patterns.md Group 1). A single role drafts into `./scoped/draft.md`, critiques its own draft via the `self-critique.md` dynamic (which receives `{{draft}}` as a push-arg and returns `critique` + `refined` via `## Return`), and decides whether to accept or loop. No memory carries across iterations beyond the current `./scoped/draft.md`.

## Instruction: Initialize
**Condition:** MEMORY state is "empty"
**Action:** Read `../../PROGRAM.md`. Produce an initial draft addressing the task and write it to `./scoped/draft.md` (wholesale `cat > ./scoped/draft.md << EOF ... EOF` is fine — a draft is a single blob, not a list). Set MEMORY state to "drafted".

## Instruction: Request critique
**Condition:** MEMORY state is "drafted" and `./scoped/draft.md` exists
**Action:** Read `./scoped/draft.md`. Append the following to `./MEMORY.md` (do not change state — the shell will set it to "empty" when it pushes the dynamic):

    ## Push
    dynamics/self-critique.md
    ## Push-Args
    draft: |
      <verbatim contents of ./scoped/draft.md, every line indented two spaces>

## Instruction: Evaluate refinement
**Condition:** MEMORY state is "drafted_completed" and both `## Critique` and `## Refined` are present in MEMORY
**Action:** Decide whether `## Refined` adequately addresses the task in `../../PROGRAM.md`. If it is accepted, set state to "done". If not accepted, overwrite `./scoped/draft.md` wholesale with the content of `## Refined` (`cat > ./scoped/draft.md << EOF ... EOF`). When rewriting MEMORY, omit the `## Critique` and `## Refined` sections (they were already consumed) and set state to "drafted" (which re-enters "Request critique" on the next cycle).

## Instruction: Finish
**Condition:** MEMORY state is "done"
**Action:** Call halt with a short summary that includes the final contents of `./scoped/draft.md`.

# Sub-instructions

(none — this interpreter needs none.)
