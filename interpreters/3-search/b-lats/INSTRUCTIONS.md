# Strategy: Language Agent Tree Search

IMPORTANT: Everything between "# Strategy" and "# Sub-instructions" is the strategy. It must be copied VERBATIM into every update_instructions call. Never modify, summarize, or omit any strategy instruction. Only the "# Sub-instructions" section below changes.

This interpreter implements Language Agent Tree Search (Zhou et al., 2023; patterns.md Group 3 — Search). The strategy is a single-frame MCTS controller running selection → expansion → simulation → evaluation → back-prop → reflection in a loop bounded by `max_iterations`. The growing tree lives in the strategy frame's `./scoped/tree.md` as an append-only YAML-block ledger; per-node partial states live in `./scoped/state-<id>.md` files (write-once); per-node accumulated lessons live in `./scoped/lessons-<id>.md` files (lazy + append-only). All MCTS arithmetic (UCT selection, back-prop) runs in bash; the dynamics are LLM-faceting only.

Scoped files (in this strategy frame's `./scoped/`):

- `./scoped/tree.md` — the YAML-block ledger (R37–R41).
- `./scoped/task.md` — byte-equal copy of `../../PROGRAM.md` written once at Initialize.
- `./scoped/max_iterations.md` — single integer; written once at Initialize, default 30.
- `./scoped/uct_c.md` — single float (UCT exploration constant); written once at Initialize, default 1.41421356.
- `./scoped/iter_count.md` — single integer; bumped after each back-prop.
- `./scoped/cursor.md` — id of the leaf currently selected.
- `./scoped/chosen_child.md` — id of the new child being rolled out this iteration.
- `./scoped/last_terminal.md` — text of the latest rollout's terminal state.
- `./scoped/state-<id>.md` — per-node partial state, write-once at node creation.
- `./scoped/lessons-<id>.md` — per-node accumulated lessons, lazy + append-only.
- `./scoped/staged/{partial_state,task,attempt,criterion,verdict,feedback}.md` — push-arg staging files.

## Instruction: Initialize
**Condition:** MEMORY state is "empty"
**Action:** Persist scoped files, write the root node, transition to `selecting`.

    mkdir -p ./scoped/staged

    cp ../../PROGRAM.md ./scoped/task.md
    echo 30          > ./scoped/max_iterations.md
    echo 1.41421356  > ./scoped/uct_c.md
    echo 0           > ./scoped/iter_count.md

    cat > ./scoped/tree.md << ROOT_EOF
    ---
    id: n0
    parent_id: -
    depth: 0
    q: 0
    n: 0
    status: live
    ROOT_EOF

    > ./scoped/state-n0.md

Then wholesale-rewrite MEMORY:

    cat > ./MEMORY.md << 'INIT_OK_EOF'
    ## State
    selecting
    ## Matched Instruction
    Initialize
    ## Last Action
    Persisted scoped files; seeded scoped/tree.md with root n0; created empty state-n0.md.
    ## Result
    Initialization complete; ready to select.
    INIT_OK_EOF

# Sub-instructions

(none — this interpreter needs none.)
