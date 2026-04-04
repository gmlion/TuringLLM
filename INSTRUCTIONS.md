# Program: Hello World

## Instruction: Initialize
**When:** MEMORY has no `## Status` section
**Do:** Write a `## Status` section to MEMORY with value `started`. Write a greeting to a file called `output.txt`.

## Instruction: Finish
**When:** MEMORY status is `started` and `output.txt` exists
**Do:** Update MEMORY status to `done`. Halt with message "Hello world complete".
