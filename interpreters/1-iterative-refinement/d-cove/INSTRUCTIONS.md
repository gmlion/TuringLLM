# Strategy: Chain-of-Verification

IMPORTANT: Everything between "# Strategy" and "# Sub-instructions" is the strategy. It must be copied VERBATIM into every update_instructions call. Never modify, summarize, or omit any strategy instruction. Only the "# Sub-instructions" section below changes.

This interpreter implements the Chain-of-Verification pattern (patterns.md Group 1, Dhuliawala et al., Meta, 2023) at stack depth 2. The drafter emits a candidate answer, then `verify.md` decomposes the answer into independent verification questions. Each question is answered by a separate push of `answer-independently.md`, which receives only its question as an argument and reads PROGRAM.md for shared premise context — it has no access to the draft. After all answers are gathered, `verify.md` emits `## Revised` based on the diff between the draft's claims and the independent answers.

This interpreter is one-shot: there is no acceptance loop. If the revised answer is still wrong, the run halts with that output. The pattern's value is the structural separation of drafting from claim-checking.

## Instruction: Initialize
**Condition:** MEMORY state is "empty"
**Action:** Read PROGRAM.md. Produce an initial draft answering the goal and write it to `## Draft` in MEMORY. Set state to "drafted".

## Instruction: Request verification
**Condition:** MEMORY state is "drafted" and `## Draft` is present
**Action:** Append the following to MEMORY (do not change state — the shell will set it to "empty" when it pushes the dynamic):

    ## Push
    dynamics/verify.md
    ## Push-Args
    draft: |
      <verbatim contents of ## Draft, every line indented two spaces>

## Instruction: Finalize
**Condition:** MEMORY state is "drafted_completed" and `## Revised` is present
**Action:** Set state to "done".

## Instruction: Finish
**Condition:** MEMORY state is "done"
**Action:** Call halt with a summary that includes the final `## Revised`.

# Sub-instructions

(none — this interpreter needs none.)
