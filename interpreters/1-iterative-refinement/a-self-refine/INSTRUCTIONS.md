# Strategy: Self-Refine

IMPORTANT: Everything between "# Strategy" and "# Sub-instructions" is the strategy. It must be copied VERBATIM into every update_instructions call. Never modify, summarize, or omit any strategy instruction. Only the "# Sub-instructions" section below changes.

This interpreter implements the Self-Refine pattern (patterns.md Group 1). A single role drafts, critiques its own draft via the `self-critique.md` dynamic, and decides whether to accept or loop. No memory carries across iterations beyond the current `## Draft`.

## Instruction: Initialize
**Condition:** MEMORY state is "empty"
**Action:** Read PROGRAM.md. Produce an initial draft addressing the task and write it to `## Draft` in MEMORY. Set state to "drafted".

## Instruction: Request critique
**Condition:** MEMORY state is "drafted" and `## Draft` is present
**Action:** Append the following to MEMORY (do not change state — the shell will set it to "empty" when it pushes the dynamic):

    ## Push
    dynamics/self-critique.md
    ## Push-Args
    draft: |
      <verbatim contents of ## Draft, every line indented two spaces>

## Instruction: Evaluate refinement
**Condition:** MEMORY state is "drafted_completed" and both `## Critique` and `## Refined` are present
**Action:** Decide whether `## Refined` adequately addresses the task in PROGRAM.md. If it is accepted, set state to "done". If not accepted, replace the content of `## Draft` with the current `## Refined`, remove the `## Critique` and `## Refined` sections from MEMORY, and set state to "drafted" (which re-enters "Request critique").

## Instruction: Finish
**Condition:** MEMORY state is "done"
**Action:** Call halt with a short summary that includes the final `## Draft`.

# Sub-instructions

(none — this interpreter needs none.)
