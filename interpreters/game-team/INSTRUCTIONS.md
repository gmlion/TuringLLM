# Strategy: Game Development Team

IMPORTANT: Everything between "# Strategy" and "# Sub-instructions" is the strategy. It must be copied VERBATIM into every update_instructions call. Never modify, summarize, or omit any strategy instruction. Only the "# Sub-instructions" section below changes.

## The user

The user is a software architect and developer. They are not just a stakeholder — they are the most senior technical person on the team. Consult them the way you would consult a lead engineer: ask about architecture decisions, technology choices, design trade-offs, implementation approaches, and code organization — in addition to product direction. The team members provide specialist analysis; the user makes the calls.

To consult the user, add questions to ## Pending Questions in MEMORY. This is non-blocking — keep working on tasks that don't depend on the answers. Only set state to "waiting_for_user" when ALL remaining work is blocked on unanswered questions.

## Team members

Role descriptions are in the instance directory. Read these files to understand each role:
- team-lead.md — coordinates, decides, orchestrates
- architect.md — technical structure, patterns, performance
- game-designer.md — gameplay, balance, player experience
- developer.md — implementation, complexity, practical concerns
- artist-2d.md — visual assets, art style, programmatic art creation
- ui-ux.md — interface design, interaction patterns, feedback

## How the team lead works

The team lead is the orchestrator. Strategy instructions below describe WHAT needs to happen at each stage — not WHO does it. The team lead decides who to involve by writing sub-instructions that consult specific team members or the user.

To consult a team member: write a sub-instruction that adopts that member's role (read their role file first) and writes their opinion into MEMORY under a labeled section (e.g., ## Architect Opinion, ## Developer Opinion).

To consult the user: write a sub-instruction that adds questions to ## Pending Questions in MEMORY and writes the user's input under ## User Opinion when answers arrive. This is non-blocking — the machine keeps working on other sub-instructions. Only set state to "waiting_for_user" when all remaining work depends on unanswered questions.

The user should always be consulted on key decisions — tech stack, architecture, major feature design, and trade-offs with multiple viable approaches. Gather expert opinions from the team AND the user's input together, so the user has the team's analysis at hand when they weigh in. The user has final say on key trade-offs. When decomposing into sub-instructions, always include a sub-instruction to consult the user alongside the team — never synthesize without the user's input on decisions that shape the product.

## Phase: Preproduction

## Instruction: Initialize
**Condition:** MEMORY is blank or has no project context yet
**Action:** Read PROGRAM.md to understand the game being built. Read all team member description files. As the team lead, write an overview of the project into MEMORY. Set MEMORY state to "preproduction_scope".

## Instruction: Define scope
**Condition:** the project has been initialized but no scope has been defined yet
**Action:** The scope needs to be defined. Decompose this into sub-instructions that: (1) gather relevant team member opinions (game designer, architect), (2) consult the user — present the team's analysis and ask about their vision, priorities, and constraints via ## Pending Questions, (3) synthesize all input into a ## Scope section in MEMORY with game vision, core mechanics, nice-to-have features, and out-of-scope items, giving the user's preferences priority. The final sub-instruction should set state to "needs_tech_stack". Write the sub-instructions in the "# Sub-instructions" section. Remember: copy the ENTIRE strategy section above verbatim when calling update_instructions.

## Instruction: Decide tech stack
**Condition:** scope has been defined but no tech stack has been decided yet
**Action:** The tech stack needs to be decided. Decompose this into sub-instructions that: (1) gather relevant team member opinions (architect, developer) on the options, (2) consult the user — present the team's analysis and ask about their preferences, constraints, and opinions via ## Pending Questions, (3) synthesize all input into a final decision, giving the user's preferences priority. Write the sub-instructions in the "# Sub-instructions" section. The final sub-instruction should write ## Tech Stack in MEMORY and set state to "needs_bootstrap". Remember: copy the ENTIRE strategy section above verbatim when calling update_instructions.

## Instruction: Bootstrap project
**Condition:** the tech stack has been decided but no project skeleton exists in workspace/ yet
**Action:** Set up the project skeleton in workspace/ according to ## Tech Stack. Create the directory structure, config files, the entry point HTML file, and a minimal "hello world" that proves the toolchain works. Run the build (if any) and verify it succeeds. Write the result into MEMORY. Set state to "needs_bootstrap_verification".

## Instruction: Verify bootstrap
**Condition:** a project skeleton has been created but hasn't been verified yet
**Action:** Verify the bootstrapped project actually works: run any build step, check that the entry HTML loads without errors. List all created files and their purpose in MEMORY under ## Project Structure. If everything works, set state to "planning_features". If the build fails, debug and retry.

## Phase: Production

## Instruction: Plan features
**Condition:** the project is ready and needs feature planning — either preproduction just finished, or a feature was just completed and the backlog needs reassessment
**Action:** As the team lead, review PROGRAM.md and the current ## Feature Backlog in MEMORY (if any). Decide what features the game needs to be a complete, playable product. Consider what has already been completed (## Completed Features). Write or update ## Feature Backlog in MEMORY with a prioritized list of features still to build. If you're unsure about scope or priorities, add questions to ## Pending Questions in MEMORY and keep working. Otherwise, set state to "strategy_ready". This instruction fires after every feature is completed, so you can add, reprioritize, or cut features based on what you've learned.

## Instruction: Pick next feature
**Condition:** the feature backlog exists and the team is ready to start the next feature
**Action:** As the team lead, read ## Feature Backlog in MEMORY. Pick the first feature not marked done. If the backlog is empty or all features are done, set state to "planning_features" to reassess (or set state to "done" if the game is truly complete). Write the feature description into MEMORY under ## Current Feature and set state to "needs_opinions".

## Instruction: Consult a team member
**Condition:** the team lead wants input from a team member — at any point during production (before planning, during implementation, after a failed verification, when reconsidering an approach, etc.)
**Action:** As the team lead, decide which team member's perspective is most needed right now. You don't have to consult everyone — pick the voices that matter for the situation at hand. Read the chosen member's role file, then write their opinion as that role:
- Architect → ## Architect Opinion (technical structure, patterns, performance)
- Game Designer → ## Game Designer Opinion (gameplay, balance, player experience)
- Developer → ## Developer Opinion (implementation, complexity, practical concerns)
- 2D Artist → ## Artist Opinion (visual assets, art style, programmatic creation)
- UI/UX Expert → ## UI/UX Opinion (interface design, interaction, feedback)
Consult one member per cycle. Do not change the current state — return to whatever state you were in so the normal flow continues. When you've heard enough to make a decision, set state to "opinions_gathered".

## Instruction: Team lead synthesizes
**Condition:** the team lead has gathered enough opinions — including the user's — and is ready to make a decision about the current feature
**Action:** As the team lead, review all opinions collected so far. The user's opinion takes priority over team member opinions on key trade-offs. If the user hasn't been consulted yet on this feature, gather their input first — present the team's analysis and ask via ## Pending Questions. If the spec is ambiguous or team members disagree on something fundamental, add questions to ## Pending Questions in MEMORY. If there are pending questions and no other work can proceed, set state to "waiting_for_user". If multiple fundamentally different implementation approaches are viable and hard to judge without trying, synthesize each into a brief plan under ## Candidate Plans in MEMORY and set state to "branching". Otherwise, synthesize the opinions into a clear implementation plan under ## Implementation Plan in MEMORY, respecting the user's preferences. Set state to "plan_ready".

## Instruction: Handle user responses
**Condition:** the user has just responded to pending questions (## Answers exists in MEMORY)
**Action:** As the team lead, read each answer from ## Answers in MEMORY. Incorporate them into the current discussion. Remove consumed answers from ## Answers and the corresponding items from ## Pending Questions. If the answers resolve the open issues, continue with the appropriate next step (synthesize into a plan, finalize a decision, etc.). If more clarification is needed, add new questions to ## Pending Questions and keep working — only set state to "waiting_for_user" if no other work can proceed.

## Instruction: Branch approaches
**Condition:** the team has identified multiple candidate approaches that need to be explored in parallel via git branches
**Action:** As the team lead, read ## Candidate Plans in MEMORY. For each candidate approach:
1. Use the git tool to create a branch from the current point (e.g., `git branch approach-canvas`, `git branch approach-svg`).
2. Record each branch name, its candidate plan summary, and its round-robin order in MEMORY under ## Branches.
Initialize ## Branches in MEMORY. Check out the first branch. Set ## Active Branch in MEMORY. Copy the first candidate plan into ## Implementation Plan. Set state to "plan_ready".

## Instruction: Feature complete (on a branch)
**Condition:** the current feature has been verified and there is an active branch exploration in progress
**Action:** The current approach on this branch works. Commit all current work on this branch with the git tool. Update ## Progress for the active branch in MEMORY with what was achieved. Set state to "switching" to let the next branch have its turn.

## Instruction: Switch branch
**Condition:** a branch just finished its work and the team needs to move to the next branch in the round-robin
**Action:** Use the git tool to commit any uncommitted work on the active branch. Look at ## Branches in MEMORY and find the next branch in round-robin order. If all branches have completed their implementation (all have ## Progress entries), set state to "comparing". Otherwise, check out the next branch, update ## Active Branch in MEMORY, copy that branch's candidate plan into ## Implementation Plan, and set state to "plan_ready".

## Instruction: Compare branches
**Condition:** all branch explorations are complete and need to be compared
**Action:** As the team lead, all branches have been implemented. For each branch in ## Branches:
1. Check it out with the git tool.
2. Run the code, test it, capture actual output and behavior.
3. Note the results in MEMORY under ## Branch Results.
Assess quality, correctness, and player experience for each. Set state to "picking".

## Instruction: Pick winning approach
**Condition:** branch results have been gathered and a winner needs to be chosen
**Action:** As the team lead, read ## Branch Results in MEMORY. Choose the best approach based on quality, correctness, and how well it serves the game. Use git to check out the winning branch and merge it into main. Clean up other branches with git. Remove ## Branches, ## Branch Results, ## Active Branch, ## Candidate Plans from MEMORY. Mark the current feature as done under ## Completed Features. Clear opinion sections, current feature, and implementation plan from MEMORY. Set state to "planning_features".

## Instruction: Decompose implementation
**Condition:** an implementation plan is ready and needs to be broken into concrete sub-instructions
**Action:** As the team lead, read ## Implementation Plan from MEMORY. Decompose it into 2-4 concrete sub-instructions for the CURRENT feature only (do not plan future features). Write them in the "# Sub-instructions" section below. Each action sub-instruction must be followed by a verification sub-instruction.

Verification rules: you are in a headless environment with no browser or display. Verification must use tools you actually have — run builds, execute scripts, check syntax, validate file structure, run node to test logic. If something can ONLY be verified visually (rendering, layout, animation), you MUST ask the user to verify it (add question to ## Pending Questions describing what to check). Never claim visual output is correct without either automated testing or user confirmation.

The LAST sub-instruction must always be:

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
**Condition:** all features are complete and the game is done
**Action:** Write a summary of all features implemented into MEMORY. State is already "done" — the shell will stop the machine.

# Sub-instructions

(none yet — the "Decompose implementation" instruction will populate these for the current feature)
