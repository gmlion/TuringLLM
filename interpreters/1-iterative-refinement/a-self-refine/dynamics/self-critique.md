# Dynamic: Self-Critique

Receives argument: {{draft}}.
Produced MEMORY: ## State done + ## Return block with keys `critique`, `refined`.
Return: state done → caller sees {caller_state}_completed, and ## Return entries are spliced into caller's MEMORY as ## Critique and ## Refined.

## Instruction: Critique
**Condition:** MEMORY state is "empty"
**Action:** Critique the draft below — describe concrete strengths, weaknesses, and specific improvements to make. Write the critique to a scratch section `## CritiqueScratch` in MEMORY. Set state to "critiqued".

Draft:
{{draft}}

## Instruction: Refine
**Condition:** MEMORY state is "critiqued" and `## CritiqueScratch` is present
**Action:** Read `## CritiqueScratch`. Produce an improved version of the draft below that addresses every critique point. Write MEMORY with state=done plus a `## Return` section containing `critique` (copied from `## CritiqueScratch`) and `refined` (the improved version), both as block scalars:

    ## State
    done
    ## Return
    critique: |
      <verbatim contents of ## CritiqueScratch, every line indented two spaces>
    refined: |
      <your refined draft, every line indented two spaces>

Draft:
{{draft}}
