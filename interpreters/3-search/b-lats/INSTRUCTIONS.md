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

### Tree ledger schema (R37, R38, R41)

Every node block in `./scoped/tree.md` contains exactly the keys: `id`, `parent_id`, `depth`, `q`, `n`, `status`. Status enum: `live`, `terminal_pass`, `terminal_fail` — once a node leaves `live`, it never returns. There is no `pruned` status (LATS uses UCT for exploration/exploitation; explicit pruning would conflate ToT and MCTS semantics).

### Tree ledger primitives

Every instruction below uses these bash idioms when reading or writing `./scoped/tree.md`. They are stated once here and referenced by name from each Instruction body.

**Append a node block** (used by Initialize for n0, by Expand-absorb for children):

    cat >> ./scoped/tree.md << NODE_EOF
    ---
    id: $NEW_ID
    parent_id: $PARENT_ID
    depth: $DEPTH
    q: 0
    n: 0
    status: live
    NODE_EOF

**Next monotonic id** (R40):

    NEXT_INDEX=$(grep -c '^id: n' ./scoped/tree.md)
    NEW_ID="n$NEXT_INDEX"

**Update one field of one node** (R39, surgical edit):

    # Args: $1 = id, $2 = field name, $3 = new value
    awk -v ID="$1" -v F="$2" -v V="$3" '
      /^---$/ { in_block = 0; print; next }
      /^id:/  { in_block = ($2 == ID); print; next }
      in_block && $1 == F":" { print F": " V; next }
      { print }
    ' ./scoped/tree.md > ./scoped/tree.md.tmp && mv ./scoped/tree.md.tmp ./scoped/tree.md

Compact one-line form, used inline by Back-prop and other instructions where the field name is a literal:

    awk -v X="$ID" -v V="$NEWV" '/^---$/{ib=0;print;next} /^id:/{ib=($2==X);print;next} ib && /^q:/{print "q: " V;next} {print}' ./scoped/tree.md > ./scoped/tree.md.tmp && mv ./scoped/tree.md.tmp ./scoped/tree.md

**Per-node state file** (R42, R43): created at node-creation time as `./scoped/state-<id>.md`; **write-once**, never modified after creation. Read whenever the strategy needs to push that node's state into a dynamic.

**Per-node lessons file** (R64, R65): `./scoped/lessons-<id>.md` is **lazy** (created only on first append) and **append-only** (always `>>`, never `>`). Used by the Compose-partial-state primitive (below) to thread accumulated lessons into expansion and rollout.

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
