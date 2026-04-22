# Dynamic: Self-Critique

Receives argument: {{draft}}.
Produced MEMORY: ## Critique, ## Refined.
Return: state done → caller sees {caller_state}_completed.

## Instruction: Critique
**Condition:** MEMORY state is "empty"
**Action:** Critique the draft below — describe concrete strengths, weaknesses, and specific improvements to make. Write `## Critique` in MEMORY. Set state to "critiqued".

Draft:
{{draft}}

## Instruction: Refine
**Condition:** MEMORY state is "critiqued" and `## Critique` is present
**Action:** Read `## Critique`. Produce an improved version of the draft below that addresses every critique point and write it to `## Refined`. Set state to "done".

Draft:
{{draft}}
