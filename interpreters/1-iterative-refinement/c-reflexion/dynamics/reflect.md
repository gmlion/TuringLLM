# Dynamic: Reflect

Receives arguments: {{attempt}}, {{verdict}}, {{feedback}}.
Produced MEMORY: ## Lesson.
Return: state done → caller sees {caller_state}_completed.

## Instruction: Distil lesson
**Condition:** MEMORY state is "empty"
**Action:** Read the attempt, verdict, and feedback below. Write `## Lesson` as one short verbal rule the next attempt should apply — one or two sentences, phrased as a directive ("always X", "avoid Y"), not a restatement of the feedback. Set state to "done".

Attempt:
{{attempt}}

Verdict:
{{verdict}}

Feedback:
{{feedback}}
