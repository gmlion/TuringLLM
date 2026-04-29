# Dynamic: Plan

Consumes: `{{goal}}` (required); `{{results_so_far}}` (optional, present only when called from a replan path).
Produces: `## Return` with key `plan` (a newline-separated bullet list of steps).
State flow: `empty` → `done`.

**Known failure mode (see `interpreters/2-planning-decomposition/c-deep-research/README.md` §"Known failure mode"):** on recursive replans, the planner LLM tends to drop sibling top-level steps from the original plan when expanding one step's `[REPLAN-TRIGGER]` into sub-leaves. The instruction below explicitly tells you to preserve them; if you're an agent reading this, *actually do that* — failing to preserve siblings causes c-deep-research to silently cover only the first PROGRAM dimension on multi-dimension goals.

## Instruction: Produce plan
**Condition:** MEMORY state is "empty"
**Action:** Read the goal:

    {{goal}}

The plan you emit must satisfy three rules:

1. **Aim for 3–7 steps.** Fewer than 3 means the goal is too narrow to need a plan (return a single-step plan in that case); more than 7 means the steps are too small (group adjacent ones).

2. **All steps at the same level of abstraction (sibling uniformity).** Pick one granularity that fits the goal, then phrase EVERY step at that granularity. If one step is a single tool call, all of them must be; if one step is "research X", all of them must be of similar scope. **Never mix broad and narrow steps in the same plan.** Granularity is a CONSEQUENCE of how broad the goal is — not a per-step choice.

3. **Don't deliberately leave broad steps for the executor.** Phrase each step in its natural granularity for the goal's breadth. If the goal is broad, the steps will naturally be broad (and the executor's recursion policy will decompose them); if the goal is narrow, the steps will naturally be narrow (executable directly). Don't hedge or pad — emit what fits.

If `{{results_so_far}}` is non-empty, treat it as the record of prior execution. **Crucially: it may contain `[REPLAN-TRIGGER from S<N>]` notes.** A REPLAN-TRIGGER note means step S<N> was decomposed by the executor into the sub-steps listed inside the note. Your new plan MUST:

- **For the most recent `[REPLAN-TRIGGER]` note (the last one in the file):** replace the broad step it refers to with the sub-steps from its body, **as direct concrete leaves of the new plan, at the position the broad step occupied.** Do NOT re-emit the original broad step. Do NOT nest the sub-steps under a parent — promote them to top-level `S<N>:` entries.
- **For earlier (already-consumed) `[REPLAN-TRIGGER]` notes:** ignore them. Their sub-steps are already in the plan as leaves; re-expanding them would duplicate.
- **For non-trigger entries (regular `R<N>` results):** these are completed steps. Keep them in their positions in the new plan (they correspond to the early `S<N>:` bullets).
- **For not-yet-attempted steps after the replaced one:** preserve them as-is.
- Re-number the resulting list as `S1, S2, ...` from the top.

The strategy preserves the cursor's numerical position across replans, so the first new sub-step takes the position of the broad step it replaced. This is how the recursion converges: each replan replaces one broad step with its narrower siblings until every leaf is concrete enough that the executor performs it instead of decomposing.

    {{results_so_far}}

Format your plan as an ordered bullet list with `S<N>:` prefixes (e.g. `- S1: research Raft leader election`, `- S2: research Raft log replication`).

Write `./MEMORY.md` with this EXACT single-heredoc shape (the `## Return` block MUST be in the same heredoc as the state change — without it the shell pops with no return value, breaking the strategy's "Absorb plan" instruction):

```
cat > ./MEMORY.md << 'MEMEOF'
## State
done
## Matched Instruction
Produce plan
## Last Action
Produced ordered plan; popping back to strategy.
## Result
Plan produced.
## Return
plan: |
  - S1: <step 1>
  - S2: <step 2>
  ...
MEMEOF
```

(Indent each bullet two spaces under the `plan: |` key — YAML block-scalar syntax.)
