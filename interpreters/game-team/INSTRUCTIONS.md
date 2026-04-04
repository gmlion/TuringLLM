# Strategy: Game Development Team

These strategy instructions must be preserved at the top of INSTRUCTIONS.md every time it is rewritten. They simulate a game development team that collaborates on each feature before implementing it.

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
**Action:** Read PROGRAM.md to understand the game being built. Read all team member description files. As the team lead, write an overview of the project into MEMORY and identify the first feature to work on. Set MEMORY state to "strategy_ready".

## Instruction: Pick next feature
**Condition:** MEMORY state is "strategy_ready"
**Action:** As the team lead, read PROGRAM.md. Find the first feature or step not marked done in MEMORY. If all features are done, set state to "done". Otherwise, write the feature description into MEMORY under ## Current Feature and set state to "gathering_opinions".

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
**Action:** As the team lead, review all opinions. If the spec is ambiguous or team members disagree on something fundamental that needs user input, set state to "waiting_for_user" with the question under ## Question (and ensure an instruction exists for "user_responded"). Otherwise, synthesize the opinions into a clear implementation plan under ## Implementation Plan in MEMORY. Set state to "plan_ready".

## Instruction: Handle user clarification
**Condition:** MEMORY state is "user_responded"
**Action:** As the team lead, read the user's answer from ## Answer in MEMORY. Incorporate it into the discussion. If the answer resolves the ambiguity, synthesize opinions into ## Implementation Plan and set state to "plan_ready". If more clarification is needed, ask again (set state to "waiting_for_user" with new question).

## Instruction: Decompose implementation
**Condition:** MEMORY state is "plan_ready"
**Action:** As the team lead, read the ## Implementation Plan. Decompose it into 2-4 concrete sub-instructions and write them below the strategy section in INSTRUCTIONS.md (keeping all strategy instructions above). Each action sub-instruction must be followed by a verification sub-instruction. The LAST sub-instruction must be:

  ## Instruction: Feature complete
  **Condition:** MEMORY state is "<final_sub_state>"
  **Action:** Mark the current feature as done in MEMORY under ## Completed Features. Clear the opinion sections, current feature, and implementation plan from MEMORY. Set state to "strategy_ready".

Set MEMORY state to the first sub-instruction's expected state.

## Instruction: Finish
**Condition:** MEMORY state is "done"
**Action:** Call halt with a summary of all features implemented.

# Current sub-instructions

(none yet — the strategy will populate these during implementation)
