# Strategy: Karpathy Loop

IMPORTANT: Everything between "# Strategy" and "# Sub-instructions" is the strategy. It must be copied VERBATIM into every update_instructions call. Never modify, summarize, or omit any strategy instruction. Only the "# Sub-instructions" section below changes.

This strategy implements a tight code-test-fix loop inspired by Andrej Karpathy's development philosophy: write a small thing, run it immediately, look at the actual output, fix what's wrong, repeat. No big upfront planning. Let the code and its output guide you.

When there are multiple possible approaches, the strategy explores them breadth-first: create a branch for each, push each forward ONE step at a time in round-robin, compare, and pick the best one.

## Instruction: Initialize
**Condition:** MEMORY state is "empty"
**Action:** Read PROGRAM.md. Write a brief note in MEMORY about what we're building. Don't plan — just identify the smallest possible first thing to code that produces visible output. Initialize ## Branches in MEMORY as empty. Set state to "coding".

## Instruction: Code
**Condition:** MEMORY state is "coding"
**Action:** Write a small, focused change in workspace/. Do the SMALLEST thing that moves toward the goal — a few lines, one function, one visible change. Prefer adding to working code over rewriting. After writing, set state to "testing".

## Instruction: Test
**Condition:** MEMORY state is "testing"
**Action:** Run the code in workspace/. Capture the ACTUAL output — stdout, stderr, exit code, or verify programmatically (file exists, file size, grep for expected content). Write the real output into MEMORY under ## Test Output. If it works as expected, set state to "evaluating". If there's an error, set state to "fixing".

## Instruction: Fix
**Condition:** MEMORY state is "fixing"
**Action:** Read ## Test Output in MEMORY. Identify the specific error. Make the MINIMAL fix — change as few lines as possible. Don't refactor, don't improve other things, just fix the one error. Set state to "testing" to re-run.

## Instruction: Evaluate (on a branch)
**Condition:** MEMORY state is "evaluating" and MEMORY contains "## Active Branch"
**Action:** The current step on this branch works. Update ## Progress for the active branch in MEMORY. Now SWITCH — commit current work on this branch with the git tool and set state to "switching". This enforces round-robin: each branch gets one code→test→evaluate pass before rotating to the next.

## Instruction: Evaluate (on main)
**Condition:** MEMORY state is "evaluating" and MEMORY does not contain "## Active Branch"
**Action:** The current code works. Step back and assess:
- Read PROGRAM.md and ## Progress in MEMORY.
- Is the goal achieved? If yes, set state to "converging".
- Is there a decision point where multiple approaches could work? If yes, set state to "branching".
- Otherwise, note the next micro-step under ## Next in MEMORY and set state to "coding".
Keep ## Progress updated.

## Instruction: Branch
**Condition:** MEMORY state is "branching"
**Action:** You've identified multiple possible approaches. For each approach:
1. Use the git tool to create a branch from the current point (e.g., git branch approach-canvas, git branch approach-svg).
2. Record each branch name, its intended approach, and its round-robin order in MEMORY under ## Branches.
Check out the first branch. Set ## Active Branch in MEMORY. Set state to "coding".

## Instruction: Switch branch
**Condition:** MEMORY state is "switching"
**Action:** Use the git tool to commit current work on the active branch. Look at ## Branches in MEMORY and find the next branch in round-robin order. If all branches have had at least one round of progress, set state to "comparing". Otherwise, check out the next branch, update ## Active Branch in MEMORY, and set state to "coding".

## Instruction: Compare branches
**Condition:** MEMORY state is "comparing"
**Action:** All branches have been pushed forward one round. For each branch in ## Branches:
1. Check it out with the git tool.
2. Run the code, capture output.
3. Note the results in MEMORY under ## Branch Results.
Assess: is one clearly better? If yes, set state to "picking". If they need more exploration, set state to "switching" to do another round of round-robin.

## Instruction: Pick winner
**Condition:** MEMORY state is "picking"
**Action:** Read ## Branch Results in MEMORY. Choose the best branch. Use git to check it out. Remove ## Branches, ## Branch Results, ## Active Branch from MEMORY. Set state to "evaluating" to continue the normal loop from the winning approach.

## Instruction: Converge
**Condition:** MEMORY state is "converging"
**Action:** The goal is achieved. If on a branch other than main, merge into main with the git tool. Clean up any remaining branches. Set state to "done".

## Instruction: Finish
**Condition:** MEMORY state is "done"
**Action:** Call halt with a summary of what was built.

# Sub-instructions

(the strategy populates these dynamically during coding/testing cycles)
