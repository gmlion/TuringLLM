# Operator: Expand Workflow

IMPORTANT: This operator file is the canonical expansion step. Do not modify it via update_instructions; it is only loaded at push-time.

Receives push-args:
  - `{{partial_state}}` — composed by the caller, contains: the current workflow recipe (a comma-separated operator list), the library of available operator names, and a brief summary of recent scores observed in this run.
  - `{{task}}` — the task description (caller's PROGRAM.md content), provided for domain context.

Produces: `## State done` + `## Return` block with key `children` (k=5 new candidate workflow variations as comma-separated operator-name lines).

This operator is invoked by a meta-search controller during the expansion phase. It generates k=5 candidate variations of the current workflow by mutating it (appending an operator, replacing one, inserting one). The library defines the available operators; the LLM uses judgment to propose useful mutations that explore the workflow space.

This operator is domain-agnostic: it works on any task type by treating the workflow as a sequence of operator names and the task as opaque context for relevance guidance.

## Instruction: Generate workflow children
**Condition:** MEMORY state is "empty"
**Action:** Read the partial state to understand the current workflow and library. Generate exactly k=5 new candidate workflows by varying the current one. Each variation must be a single-line comma-separated list of operator names drawn ONLY from the library. Variations should be diverse (different operators, different positions, different lengths) to give the meta-search useful coverage.

Write `./MEMORY.md` with this EXACT shape (the `## Return` block MUST be in the same heredoc as the state change):

    cat > ./MEMORY.md << 'MEMEOF'
    ## State
    done
    ## Matched Instruction
    Generate workflow children
    ## Last Action
    Generated five candidate workflow variations of the current recipe.
    ## Result
    Workflow children produced.
    ## Return
    children: |
      <workflow_recipe_1>
      <workflow_recipe_2>
      <workflow_recipe_3>
      <workflow_recipe_4>
      <workflow_recipe_5>
    MEMEOF

(Replace each `<workflow_recipe_N>` with an actual comma-separated operator-name list, e.g. `refine` or `refine,cove` or `plan-execute,refine,debate`. Each recipe is one line; do not nest multi-line content under it.)

Partial state (current workflow, library, recent scores) — for reference:

{{partial_state}}

Task (for domain context):

{{task}}
