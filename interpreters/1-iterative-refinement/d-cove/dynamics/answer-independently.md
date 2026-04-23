# Dynamic: Answer Independently

Receives argument: {{question}}.
Produced MEMORY: ## State done + ## Return block with key `answer`.
Return: state done → caller sees {caller_state}_completed, and ## Return entry is spliced into caller's MEMORY as ## Answer.

## Instruction: Answer in isolation
**Condition:** MEMORY state is "empty"
**Action:** Answer the question below using only:
  (a) the premises in PROGRAM.md (you may read `../../PROGRAM.md`), and
  (b) general world knowledge applicable to the question.

You have no draft, no prior reasoning, and no access to any other context from the caller. Write MEMORY with state=done plus a `## Return` section containing `answer` as a block scalar:

    ## State
    done
    ## Return
    answer: |
      <your answer, every line indented two spaces>

Question:
{{question}}
