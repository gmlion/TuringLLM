# Strategy: Game Development Team

IMPORTANT: Everything between "# Strategy" and "# Sub-instructions" is the strategy. It must be copied VERBATIM into every update_instructions call. Never modify, summarize, or omit any strategy instruction. Only the "# Sub-instructions" section below changes.

## Team

The team lead orchestrates all work. Strategy instructions describe WHAT needs to happen — the team lead decides WHO to involve by writing sub-instructions.

There are two kinds of team members:

**AI members** (role files in the instance directory):
- architect.md — technical structure, patterns, performance
- game-designer.md — gameplay, balance, player experience
- developer.md — implementation, complexity, practical concerns
- artist-2d.md — visual assets, art style, programmatic art creation
- ui-ux.md — interface design, interaction patterns, feedback

To consult an AI member: write a sub-instruction that reads their role file, adopts their perspective, and writes their opinion into MEMORY (e.g., ## Architect Opinion).

**Human members** (the user):
- The user is a software architect and developer — the most senior technical person on the team. They make the calls on architecture, technology, design trade-offs, and product direction.

To consult the user: write a sub-instruction that adds questions to ## Pending Questions in MEMORY. This is non-blocking — keep working on tasks that don't depend on the answers. When ALL remaining work is blocked on unanswered questions, set state to "waiting_for_user". The user's input goes under ## User Opinion.

The user should always be consulted on key decisions alongside the AI members. Never synthesize a decision without the user's input on choices that shape the product.

## Preproduction

## Instruction: Initialize
**Condition:** MEMORY is blank or has no project context yet
**Action:** Read PROGRAM.md and all team role files. Write a project overview into MEMORY. Set state to "needs_scope".

## Instruction: Define scope
**Condition:** project initialized but no scope defined yet
**Action:** Decompose into sub-instructions that gather opinions from relevant team members (AI and human), then synthesize into ## Scope (vision, core mechanics, nice-to-have, out-of-scope). Final sub-instruction sets state to "needs_tech_stack".

## Instruction: Decide tech stack
**Condition:** scope defined but no tech stack decided yet
**Action:** Decompose into sub-instructions that gather opinions from relevant team members (AI and human), then synthesize into ## Tech Stack. Final sub-instruction sets state to "needs_bootstrap".

## Instruction: Bootstrap project
**Condition:** tech stack decided but no project skeleton in workspace/ yet
**Action:** Set up the project skeleton in workspace/ per ## Tech Stack. Create directory structure, config files, entry point HTML, and a minimal working build. Write result into MEMORY. Set state to "needs_bootstrap_verification".

## Instruction: Verify bootstrap
**Condition:** project skeleton created but not verified yet
**Action:** Verify the project builds and runs. List created files in MEMORY under ## Project Structure. If it works, set state to "planning_features". If it fails, debug and retry.

## Production

## Instruction: Plan features
**Condition:** project ready and needs feature planning (preproduction just finished, or a feature was just completed)
**Action:** Review PROGRAM.md and ## Completed Features. Write or update ## Feature Backlog with prioritized features still to build. Set state to "ready_for_feature".

## Instruction: Pick next feature
**Condition:** feature backlog exists and team is ready for the next feature
**Action:** Pick the first feature not marked done. If all done, set state to "planning_features" to reassess (or "done" if the game is truly complete). Write it under ## Current Feature. Set state to "feature_picked".

## Instruction: Discuss feature
**Condition:** a feature has been picked and needs input before implementation
**Action:** Decompose into sub-instructions that gather opinions from relevant team members (AI and human), then synthesize into ## Implementation Plan. Final sub-instruction sets state to "plan_ready".

## Instruction: Handle user responses
**Condition:** ## Answers exists in MEMORY
**Action:** Read and consume answers from ## Answers. Remove consumed answers and corresponding items from ## Pending Questions. Incorporate into the current discussion and continue with the appropriate next step.

## Instruction: Decompose implementation
**Condition:** an implementation plan is ready and needs to be broken into sub-instructions
**Action:** Read ## Implementation Plan. Decompose into 2-4 concrete sub-instructions for the current feature only. Each action must be followed by verification. Verification is headless — run builds, scripts, syntax checks. If something can ONLY be verified visually, ask the user via ## Pending Questions. The last sub-instruction marks the feature done in ## Completed Features, clears opinion sections, and sets state to "planning_features". If on a branch (## Active Branch exists), set state to "feature_verified" instead.

## Instruction: Branch approaches
**Condition:** multiple candidate approaches identified for parallel exploration
**Action:** Create git branches for each candidate. Record branches in MEMORY. Check out the first branch. Set ## Active Branch and copy its plan into ## Implementation Plan. Set state to "plan_ready".

## Instruction: Feature complete (on a branch)
**Condition:** feature verified and an active branch exploration is in progress
**Action:** Commit work on this branch. Update ## Progress for the active branch. Set state to "switching".

## Instruction: Switch branch
**Condition:** a branch finished and the next one needs a turn
**Action:** Commit work. If all branches have ## Progress entries, set state to "comparing". Otherwise check out the next branch, update ## Active Branch, copy its plan into ## Implementation Plan, set state to "plan_ready".

## Instruction: Compare branches
**Condition:** all branch explorations complete
**Action:** Check out each branch, run and test it, record results in ## Branch Results. Set state to "picking".

## Instruction: Pick winning approach
**Condition:** branch results gathered and a winner needs to be chosen
**Action:** Choose the best approach. Merge winning branch into main. Clean up branches and branch-related MEMORY sections. Mark feature done. Set state to "planning_features".

## Instruction: Finish
**Condition:** all features complete and the game is done
**Action:** Write a summary of all features implemented into MEMORY. State is already "done" — the shell will stop the machine.

# Sub-instructions

(none yet — strategy instructions will populate these as needed)
