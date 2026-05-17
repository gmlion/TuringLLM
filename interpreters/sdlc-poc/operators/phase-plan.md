# Operator: Phase — Plan

IMPORTANT: This operator file is the canonical phase shim. Do not modify it via update_instructions; it is only loaded at push-time.

Receives push-args: none. Reads PROGRAM.md plus 02, 04 directly.

Produces: `## State done` + `## Return` with key `artefact` (`../../workspace/05-plan.md`).

This shim runs Phase 5. Two steps:

1. **Draft** — push `tackle.md` (role: an engineer producing a dependency graph and execution-wave plan from the tasks list). The drafter reads `04-tasks.md` and `02-design.md`, emits the dep table, the mermaid graph, the waves (topologically computed), and the critical path. Result written to `../../workspace/05-plan.md`.
2. **Verify** — push `cove.md` with the draft as `prior_answer`. CoVe decomposes the plan into atomic claims: "Does T# depend on T#?" (one per edge), "Is the DAG acyclic?", "Is wave membership correct given the dep table?". Each claim is answered independently by reading 02 and 04.

Wave grouping rule (encoded in the topic so the LLM computes it deterministically): Wave 1 = all tasks with no dependencies; Wave K = all tasks whose dependencies all lie in Waves 1..K-1.

Scoped files:
- `./scoped/draft.md` — the unverified draft.

## Instruction: Initialize — push drafter
**Condition:** MEMORY state is "empty"
**Action:** Wholesale-rewrite MEMORY with a static push of `tackle.md`.

    cat > ./MEMORY.md << 'MEM_EOF'
    ## State
    drafting
    ## Matched Instruction
    Initialize — push drafter
    ## Last Action
    Pushed tackle.md to draft the dependency graph + waves plan.
    ## Result
    Plan drafting initiated.
    ## Push
    operators/tackle.md
    ## Push-Args
    goal: |
      Produce ../../workspace/05-plan.md: a dependency-graph + execution-waves plan over the tasks in ../../workspace/04-tasks.md.

      INPUTS — read these via bash:
        - ../../workspace/04-tasks.md (full task list with T# identifiers and Files / Story / Satisfies fields)
        - ../../workspace/02-design.md (architecture; informs which tasks share a component or interface)
        - ../../workspace/.sdlc/plan-refinement-note.md (if NON-EMPTY, apply it)

      OUTPUT — write to ../../workspace/05-plan.md with this schema:

          # Plan: <POC name>

          ## Dependency table
          | T# | Depends on | Reason |
          | -- | ---------- | ------ |
          | T1 | —          | (root) |
          | T2 | T1         | <substantive reason — e.g. T2 imports the module created by T1> |
          | ... |

          ## Dependency graph

          \`\`\`mermaid
          graph TD
            T1 --> T2
            T1 --> T4
            T3 --> T4
            ...
          \`\`\`

          ## Waves
          A wave is a maximal set of tasks with no intra-wave dependencies, all of whose dependencies are in earlier waves.

          ### W1 — <descriptive label>
          - T#, T#, ...

          ### W2
          - T#, T#

          ...

          ## Critical path
          T# → T# → ... → T#  (N waves, longest chain)

          ## Parallelism summary
          - Total tasks: N
          - Waves: K
          - Max width: M (in W#)
          - Sequential floor: K (= depth of critical path)

          ## Assumptions / cross-wave caveats
          - <e.g. "T# and T# touch the same config file; second-to-merge must rebase">

      RULES:
        - Every T# in 04-tasks.md appears in exactly one wave AND exactly one row of the Dependency table.
        - A task with no real dependency uses `—` (em dash) in the "Depends on" column.
        - Edges must have a substantive Reason — not "follows T1" but "T2 imports the module T1 creates".
        - The graph MUST be a DAG. If you find a cycle, that is a bug in 04-tasks.md — flag it in "Assumptions / cross-wave caveats" and break the cycle by re-stating one edge.
        - Wave computation (Kahn's algorithm): W1 = {tasks with no deps}; iteratively, W_{K+1} = {remaining tasks whose deps are all in W1..W_K}.
        - Critical path = the longest dependency chain in the DAG (number of nodes; equals the wave count if the graph is dense enough).

      Write the file to ../../workspace/05-plan.md via bash and return its full text as ## Answer.
    original_goal: |
      Produce the dependency-graph + waves plan from the approved tasks.
    parent_chain: |
      (none — this is the only push)
    role: |
      an engineer producing a topologically-ordered execution plan from a TDD-shaped task list
    MEM_EOF

(Post-pop state will be "drafting_completed".)

## Instruction: Drafter done — stage verify
**Condition:** MEMORY state is "drafting_completed" and `## Answer` is present
**Action:** Extract the draft to `./scoped/draft.md`, prune the splice sections, and park at the verify-push state.

    mkdir -p ./scoped
    awk '/^## Answer$/{f=1; next} /^## [A-Z]/ && f {exit} f' ./MEMORY.md > ./scoped/draft.md
    awk 'BEGIN{f=0} /^## (Answer|Refined|Revised|Result)$/{f=1; next} /^## [A-Z]/ && f {f=0} !f' ./MEMORY.md > ./MEMORY.md.tmp && mv ./MEMORY.md.tmp ./MEMORY.md
    sed -i 's/^drafting_completed$/verifying_pushing/' ./MEMORY.md

## Instruction: Push verifier
**Condition:** MEMORY state is "verifying_pushing"
**Action:** Push `cove.md` with the draft as `prior_answer`.

    DRAFT_BODY=$(sed 's/^/  /' ./scoped/draft.md)
    cat > ./MEMORY.md << MEM_EOF
    ## State
    verifying
    ## Matched Instruction
    Push verifier
    ## Last Action
    Pushed cove.md to verify the plan's edges and wave grouping.
    ## Result
    Plan verification initiated.
    ## Push
    operators/cove.md
    ## Push-Args
    task: |
      Verify a Plan artefact: dependency graph, waves, and critical path.

      The draft (prior_answer) is the plan body. Decompose verification into atomic questions:
        - One question per row of the Dependency table: does T# really depend on the listed tasks? Use ../../workspace/04-tasks.md and ../../workspace/02-design.md to check (does T# import / extend / wire-up the named upstream task's output?).
        - Acyclicity: is the graph a DAG?
        - Wave correctness: is wave membership consistent with the dep table (Kahn's algorithm)?
        - Coverage: does every T# in 04-tasks.md appear in exactly one wave?
        - Critical path correctness: is the named chain truly the longest path?

      Each verification question must be answerable by an independent worker who reads ../../workspace/02-design.md and ../../workspace/04-tasks.md via bash; the answerer does NOT see the plan draft.

      The revised output is the corrected full plan body. Fix any wrong edges, recompute waves if needed.
    prior_answer: |
${DRAFT_BODY}
    MEM_EOF

(Post-pop state will be "verifying_completed".)

## Instruction: Finish
**Condition:** MEMORY state is "verifying_completed" and `## Answer` is present
**Action:** Extract the revised plan to `../../workspace/05-plan.md` and return.

    mkdir -p ../../workspace
    awk '/^## Answer$/{f=1; next} /^## [A-Z]/ && f {exit} f' ./MEMORY.md > ../../workspace/05-plan.md

    cat > ./MEMORY.md << 'FINEOF'
    ## State
    done
    ## Matched Instruction
    Finish
    ## Last Action
    Wrote verified plan artefact to ../../workspace/05-plan.md.
    ## Result
    Phase Plan complete.
    ## Return
    artefact: |
      ../../workspace/05-plan.md
    FINEOF

# Sub-instructions

(none — this operator needs none.)
