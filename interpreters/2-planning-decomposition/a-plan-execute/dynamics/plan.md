# Dynamic: Plan

Consumes: `{{goal}}` (required); `{{results_so_far}}` (optional, present only when called from a replan path).
Produces: `## Return` with key `plan` (a newline-separated bullet list of steps).
State flow: `empty` → `done`.

## Instruction: Produce plan
**Condition:** MEMORY state is "empty"
**Action:** Read the goal:

    {{goal}}

If `{{results_so_far}}` is non-empty below, treat it as the record of prior execution; update the plan in light of these results, preferring minimal edits:

    {{results_so_far}}

Produce an ordered plan as a numbered bullet list with `S<N>:` prefixes (e.g. `- S1: set up tsconfig`, `- S2: write index.ts`). Each step must be concrete enough that an executor can act on it without further decomposition of intent; if a step is inherently broad (e.g. a research question), phrase it so that the executor's recursion policy can itself decide to re-plan. Append the result to `./MEMORY.md` as:

    ## Return
    plan: |
      - S1: <step 1>
      - S2: <step 2>
      ...

(Indent each bullet two spaces under the `plan: |` key — YAML block-scalar syntax.) Then set state to "done".
