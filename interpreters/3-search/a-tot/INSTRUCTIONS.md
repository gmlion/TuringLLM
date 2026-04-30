# Strategy: Tree of Thoughts

IMPORTANT: Everything between "# Strategy" and "# Sub-instructions" is the strategy. It must be copied VERBATIM into every update_instructions call. Never modify, summarize, or omit any strategy instruction. Only the "# Sub-instructions" section below changes.

This interpreter implements Tree of Thoughts (Yao et al., 2023; patterns.md Group 3 — Search). The strategy is a level-wise BFS controller over partial Game-of-24 states. At each depth it pushes `expand-node.md` for every live unexpanded node (k=5 children each), pushes `score.md` 3× per child (sure/likely/impossible labels weighted 20/1/0.001 and summed), prunes to top b=5 by summed value, advances depth. At depth = max_depth (= len(numbers) − 1), terminal candidates are pushed to `evaluate.md` for pass/fail goal-checking. The growing tree lives in `./scoped/tree.md` as an append-only YAML-block ledger; field updates use awk-based surgical edits.

Scoped files (in this strategy frame's `./scoped/`):

- `./scoped/numbers.md` — space-separated puzzle integers; written once at Initialize.
- `./scoped/target.md` — single integer target; written once at Initialize.
- `./scoped/max_depth.md` — single integer max_depth = N − 1; written once at Initialize.
- `./scoped/current_depth.md` — single integer; bumped by Advance.
- `./scoped/cursor.md` — id of the node being acted on this dispatch.
- `./scoped/tree.md` — the YAML-block ledger (R10–R14).
- `./scoped/staged/{parent_thought,numbers_remaining,thought,attempt,criterion}.md` — push-arg staging files.

### Tree ledger primitives

Every instruction below uses these bash idioms when reading or writing `./scoped/tree.md`. They are stated once here and referenced by name from each Instruction body.

**Append a node block** (used by Initialize for n0, by Expand-absorb for children):

    cat >> ./scoped/tree.md << NODE_EOF
    ---
    id: $NEW_ID
    parent_id: $PARENT_ID
    depth: $DEPTH
    op: $OP
    left: $LEFT
    value: 0
    samples: 0
    status: live
    NODE_EOF

**Next monotonic id** (R13):

    NEXT_INDEX=$(grep -c '^id: n' ./scoped/tree.md)
    NEW_ID="n$NEXT_INDEX"

**Update one field of one node** (R12, surgical edit):

    # Args: $1 = id, $2 = field name, $3 = new value
    awk -v ID="$1" -v F="$2" -v V="$3" '
      /^---$/ { in_block = 0; print; next }
      /^id:/  { in_block = ($2 == ID); print; next }
      in_block && $1 == F":" { print F": " V; next }
      { print }
    ' ./scoped/tree.md > ./scoped/tree.md.tmp && mv ./scoped/tree.md.tmp ./scoped/tree.md

**Status value enum** (R14): `live`, `pruned`, `terminal_pass`, `terminal_fail`. Once a node leaves `live`, it never returns.

**Find first matching node** — see design.md §Interfaces — Update primitives. Two-pass awk (pass 1 collects parent_ids; pass 2 emits first id matching a depth/status/predicate filter).

**Walk parent chain** — see design.md §Interfaces — Walk parents primitive. Iterates from a terminal id back to n0, concatenating `op:` lines.

## Instruction: Initialize
**Condition:** MEMORY state is "empty"
**Action:** Read `../../PROGRAM.md` and parse integers from prose. The convention is "puzzle numbers, then target": the LAST integer encountered is the target; the rest are the puzzle numbers.

    mkdir -p ./scoped/staged

    NUMBERS_ALL=$(grep -oE '\b[0-9]+\b' ../../PROGRAM.md | head -n 5 | tr '\n' ' ')
    COUNT=$(echo $NUMBERS_ALL | wc -w)

Validate: at least 2 puzzle numbers + 1 target ⇒ COUNT ≥ 3. If fewer, append a non-blocking `## Pending Questions` and pause (R6):

    cat > ./MEMORY.md << 'INIT_FAIL_EOF'
    ## State
    waiting_for_user
    ## Matched Instruction
    Initialize (insufficient input)
    ## Last Action
    PROGRAM.md does not contain at least 2 puzzle numbers and a target; pausing for input.
    ## Result
    Awaiting puzzle definition.
    ## Pending Questions
    - Q1: Please ensure PROGRAM.md states the puzzle numbers and the target as integers in prose (e.g. "Use 4, 5, 6, and 10 to make 24").
    INIT_FAIL_EOF

Otherwise, persist parsed values, derive max_depth, write the root node. Each node block in `./scoped/tree.md` is preceded by the block separator on its own line:

---

    TARGET=$(echo $NUMBERS_ALL | awk '{print $NF}')
    PUZZLE=$(echo $NUMBERS_ALL | awk '{$NF=""; print}' | sed 's/ *$//')
    N=$(echo $PUZZLE | wc -w)
    MAX_DEPTH=$((N - 1))

    echo "$PUZZLE"    > ./scoped/numbers.md
    echo "$TARGET"    > ./scoped/target.md
    echo "$MAX_DEPTH" > ./scoped/max_depth.md
    echo 0            > ./scoped/current_depth.md

    cat > ./scoped/tree.md << ROOT_EOF
    ---
    id: n0
    parent_id: -
    depth: 0
    op: -
    left: $PUZZLE
    value: 0
    samples: 0
    status: live
    ROOT_EOF

Then wholesale-rewrite MEMORY (R9):

    cat > ./MEMORY.md << 'INIT_OK_EOF'
    ## State
    expanding
    ## Matched Instruction
    Initialize
    ## Last Action
    Parsed PROGRAM.md; persisted scoped/{numbers,target,max_depth,current_depth}.md and seeded scoped/tree.md with root n0.
    ## Result
    Initialization complete; current_depth=0; ready to expand the root.
    INIT_OK_EOF

# Sub-instructions

(none — this interpreter needs none.)
