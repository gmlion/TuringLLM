# Dynamic: Answer Independently

Receives argument: {{question}}.
Produced MEMORY: ## Answer.
Return: state done → caller sees {caller_state}_completed.

## Instruction: Answer in isolation
**Condition:** MEMORY state is "empty"
**Action:** Answer the question below using only:
  (a) the premises in PROGRAM.md (you may read PROGRAM.md), and
  (b) general world knowledge applicable to the question.

You have no draft, no prior reasoning, and no access to other MEMORY sections produced by the caller. Do not read MEMORY.md beyond checking your own `## State` header.

Write your answer to `## Answer` in MEMORY (one sentence preferred, short paragraph maximum). Set state to "done".

Question:
{{question}}
