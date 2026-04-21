# Dynamic: Reflect

Consumed MEMORY: `## Attempt`, `## Verdict` (and `## Feedback` if present).
Produced MEMORY: `## Lesson`.
Return: state `done` → caller sees `{caller_state}_completed`.

## Instruction: Distil lesson
**Condition:** MEMORY state is "empty" and `## Attempt` and `## Verdict` are present
**Action:** Read `## Attempt`, `## Verdict`, and `## Feedback` if present. Write `## Lesson` as one short verbal rule the next attempt should apply — one or two sentences, phrased as a directive ("always X", "avoid Y"), not a restatement of the feedback. Set state to "done".
