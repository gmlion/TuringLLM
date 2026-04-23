# Dynamic: Reflect

Receives arguments: {{attempt}}, {{verdict}}, {{feedback}}.
Produced MEMORY: ## State done + ## Return block with key `lesson`.
Return: state done → caller sees {caller_state}_completed, and ## Return entries are spliced into caller's MEMORY as ## Lesson.

## Instruction: Distil lesson
**Condition:** MEMORY state is "empty"
**Action:** Read the attempt, verdict, and feedback below. Write MEMORY with state=done plus a `## Return` section containing `lesson` (one short verbal rule the next attempt should apply — one or two sentences, phrased as a directive ("always X", "avoid Y"), not a restatement of the feedback) as a block scalar:

    ## State
    done
    ## Return
    lesson: |
      <your one or two sentence directive, every line indented two spaces>

Attempt:
{{attempt}}

Verdict:
{{verdict}}

Feedback:
{{feedback}}
