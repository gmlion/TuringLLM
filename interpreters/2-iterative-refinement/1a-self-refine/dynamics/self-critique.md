# Dynamic: Self-Critique

Consumed MEMORY: `## Draft`.
Produced MEMORY: `## Critique`, `## Refined`.
Return: state `done` → caller sees `{caller_state}_completed`.

## Instruction: Critique
**Condition:** MEMORY state is "empty" and `## Draft` is present
**Action:** Read `## Draft`. Write `## Critique` in MEMORY describing concrete strengths, weaknesses, and specific improvements to make. Set state to "critiqued".

## Instruction: Refine
**Condition:** MEMORY state is "critiqued" and both `## Draft` and `## Critique` are present
**Action:** Read `## Draft` and `## Critique`. Produce an improved version that addresses every critique point and write it to `## Refined`. Set state to "done".
