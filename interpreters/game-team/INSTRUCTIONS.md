# Strategy: Game Development Team

IMPORTANT: Everything between "# Strategy" and "# Sub-instructions" is the strategy. It must be copied VERBATIM into every update_instructions call. Never modify, summarize, or omit any strategy instruction. Only the "# Sub-instructions" section below changes.

## Team members

Role descriptions are in the instance directory. Read these files to understand each role:
- team-lead.md — coordinates, decides, asks user when specs are unclear
- architect.md — technical structure, patterns, performance
- game-designer.md — gameplay, balance, player experience
- developer.md — implementation, complexity, practical concerns
- artist-2d.md — visual assets, art style, programmatic art creation
- ui-ux.md — interface design, interaction patterns, feedback

## Instruction: Initialize
**Condition:** MEMORY state is "empty"
**Action:** Read PROGRAM.md to understand the game being built. Read all team member description files. As the team lead, write an overview of the project into MEMORY. Set MEMORY state to "planning_features".

## Instruction: Plan features
**Condition:** MEMORY state is "planning_features"
**Action:** As the team lead, review PROGRAM.md and the current ## Feature Backlog in MEMORY (if any). Decide what features the game needs to be a complete, playable product. Consider what has already been completed (## Completed Features). Write or update ## Feature Backlog in MEMORY with a prioritized list of features still to build. If you're unsure about scope or priorities, ask the user (set state to "waiting_for_user"). Otherwise, set state to "strategy_ready". This instruction fires after every feature is completed, so you can add, reprioritize, or cut features based on what you've learned.

## Instruction: Pick next feature
**Condition:** MEMORY state is "strategy_ready"
**Action:** As the team lead, read ## Feature Backlog in MEMORY. Pick the first feature not marked done. If the backlog is empty or all features are done, set state to "planning_features" to reassess (or set state to "done" if the game is truly complete). Write the feature description into MEMORY under ## Current Feature and set state to "gathering_opinions".

## Instruction: Consult architect
**Condition:** MEMORY state is "gathering_opinions" and MEMORY does not contain "## Architect Opinion"
**Action:** As the architect (read architect.md for your role), review the current feature in MEMORY. Write your technical opinion into MEMORY under ## Architect Opinion. Keep state as "gathering_opinions".

## Instruction: Consult game designer
**Condition:** MEMORY state is "gathering_opinions" and MEMORY does not contain "## Game Designer Opinion"
**Action:** As the game designer (read game-designer.md for your role), review the current feature in MEMORY. Write your gameplay opinion into MEMORY under ## Game Designer Opinion. Keep state as "gathering_opinions".

## Instruction: Consult developer
**Condition:** MEMORY state is "gathering_opinions" and MEMORY does not contain "## Developer Opinion"
**Action:** As the developer (read developer.md for your role), review the current feature in MEMORY and the opinions so far. Write your implementation opinion into MEMORY under ## Developer Opinion. Keep state as "gathering_opinions".

## Instruction: Consult 2D artist
**Condition:** MEMORY state is "gathering_opinions" and MEMORY does not contain "## Artist Opinion"
**Action:** As the 2D artist (read artist-2d.md for your role), review the current feature in MEMORY. Write your opinion on visual assets needed into MEMORY under ## Artist Opinion. Keep state as "gathering_opinions".

## Instruction: Consult UI/UX expert
**Condition:** MEMORY state is "gathering_opinions" and MEMORY does not contain "## UI/UX Opinion"
**Action:** As the UI/UX expert (read ui-ux.md for your role), review the current feature in MEMORY and opinions so far. Write your interface design opinion into MEMORY under ## UI/UX Opinion. Keep state as "gathering_opinions".

## Instruction: Team lead synthesizes
**Condition:** MEMORY state is "gathering_opinions" and MEMORY contains all five opinion sections (Architect, Game Designer, Developer, Artist, UI/UX)
**Action:** As the team lead, review all opinions. If the spec is ambiguous or team members disagree on something fundamental that needs user input, set state to "waiting_for_user" with the question under ## Question (and ensure an instruction exists for "user_responded"). If team members propose 2-3 fundamentally different implementation approaches that are all viable and hard to judge without trying (e.g., different rendering strategies, different game mechanics, different architectures), synthesize each into a brief plan under ## Candidate Plans in MEMORY and set state to "branching". Otherwise, synthesize the opinions into a clear implementation plan under ## Implementation Plan in MEMORY. Set state to "plan_ready".

## Instruction: Handle user clarification
**Condition:** MEMORY state is "user_responded"
**Action:** As the team lead, read the user's answer from ## Answer in MEMORY. Incorporate it into the discussion. If the answer resolves the ambiguity, synthesize opinions into ## Implementation Plan and set state to "plan_ready". If more clarification is needed, ask again (set state to "waiting_for_user" with new question).

## Instruction: Branch approaches
**Condition:** MEMORY state is "branching"
**Action:** As the team lead, read ## Candidate Plans in MEMORY. For each candidate approach:
1. Use the git tool to create a branch from the current point (e.g., `git branch approach-canvas`, `git branch approach-svg`).
2. Record each branch name, its candidate plan summary, and its round-robin order in MEMORY under ## Branches.
Initialize ## Branches in MEMORY. Check out the first branch. Set ## Active Branch in MEMORY. Copy the first candidate plan into ## Implementation Plan. Set state to "plan_ready".

## Instruction: Feature complete (on a branch)
**Condition:** MEMORY state is "feature_verified" and MEMORY contains "## Active Branch"
**Action:** The current approach on this branch works. Commit all current work on this branch with the git tool. Update ## Progress for the active branch in MEMORY with what was achieved. Set state to "switching" to let the next branch have its turn.

## Instruction: Switch branch
**Condition:** MEMORY state is "switching"
**Action:** Use the git tool to commit any uncommitted work on the active branch. Look at ## Branches in MEMORY and find the next branch in round-robin order. If all branches have completed their implementation (all have ## Progress entries), set state to "comparing". Otherwise, check out the next branch, update ## Active Branch in MEMORY, copy that branch's candidate plan into ## Implementation Plan, and set state to "plan_ready".

## Instruction: Compare branches
**Condition:** MEMORY state is "comparing"
**Action:** As the team lead, all branches have been implemented. For each branch in ## Branches:
1. Check it out with the git tool.
2. Run the code, test it, capture actual output and behavior.
3. Note the results in MEMORY under ## Branch Results.
Assess quality, correctness, and player experience for each. Set state to "picking".

## Instruction: Pick winning approach
**Condition:** MEMORY state is "picking"
**Action:** As the team lead, read ## Branch Results in MEMORY. Choose the best approach based on quality, correctness, and how well it serves the game. Use git to check out the winning branch and merge it into main. Clean up other branches with git. Remove ## Branches, ## Branch Results, ## Active Branch, ## Candidate Plans from MEMORY. Mark the current feature as done under ## Completed Features. Clear opinion sections, current feature, and implementation plan from MEMORY. Set state to "planning_features".

## Instruction: Decompose implementation
**Condition:** MEMORY state is "plan_ready"
**Action:** As the team lead, read ## Implementation Plan from MEMORY. Decompose it into 2-4 concrete sub-instructions for the CURRENT feature only (do not plan future features). Write them in the "# Sub-instructions" section below. Each action sub-instruction must be followed by a verification sub-instruction. The LAST sub-instruction must always be:

If MEMORY contains "## Active Branch" (we're exploring on a branch):

  ## Instruction: Feature complete
  **Condition:** MEMORY state is "<final_verified_state>"
  **Action:** Set state to "feature_verified".

If MEMORY does NOT contain "## Active Branch" (normal single-plan flow):

  ## Instruction: Feature complete
  **Condition:** MEMORY state is "<final_verified_state>"
  **Action:** Mark the current feature as done in MEMORY under ## Completed Features. Clear opinion sections, current feature, and implementation plan from MEMORY. Set state to "planning_features".

Set MEMORY state to the first sub-instruction's expected state. Remember: copy the ENTIRE strategy section above verbatim when calling update_instructions.

## Instruction: Finish
**Condition:** MEMORY state is "done"
**Action:** Call halt with a summary of all features implemented.

# Sub-instructions

(none yet — the "Decompose implementation" instruction will populate these for the current feature)
