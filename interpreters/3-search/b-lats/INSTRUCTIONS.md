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

### Compose-partial-state primitive (R48, R66)

A bash helper invoked by Expand-push and Simulate-push. Input: a node id `X`. Output: the contents of a string suitable as the `partial_state` push-arg.

    compose_partial_state() {
      local X="$1"

      # 1. Begin with the node's own state (write-once payload, R43)
      cat "./scoped/state-${X}.md"

      # 2. Walk parent chain root → X; for each ancestor (including X
      #    itself, R66) with a lessons file, emit the lessons.
      ANCESTORS=()
      CURRENT="$X"
      while [ -n "$CURRENT" ] && [ "$CURRENT" != "-" ]; do
        ANCESTORS=("$CURRENT" "${ANCESTORS[@]}")   # prepend → root-first order
        CURRENT=$(awk -v ID="$CURRENT" '
          /^---$/ { in_block=0; next }
          /^id:/  { in_block=($2==ID) }
          in_block && /^parent_id:/ { print $2; exit }
        ' ./scoped/tree.md)
      done

      HAS_LESSONS=0
      for A in "${ANCESTORS[@]}"; do
        if [ -s "./scoped/lessons-${A}.md" ]; then
          HAS_LESSONS=1
          break
        fi
      done

      if [ "$HAS_LESSONS" -eq 1 ]; then
        printf '\n\nLessons learned along this branch:\n'
        for A in "${ANCESTORS[@]}"; do
          [ -s "./scoped/lessons-${A}.md" ] && cat "./scoped/lessons-${A}.md"
        done
      fi
    }

Order is root-to-cursor (R48); within a single ancestor's file, original write order (= chronological reflection order) is preserved by the append-only invariant (R65). The "Lessons learned along this branch:" header is omitted when no ancestor has lessons (avoiding gratuitous prompt overhead in the 0-failure case).

### Back-prop primitive (R55)

Walks the parent chain from a starting node up to and including the root, surgically incrementing `n` by 1 and adding `reward` to `q` at every node on the path.

```bash
backprop() {
  local START="$1"
  local REWARD="$2"
  local CURRENT="$START"
  while [ -n "$CURRENT" ] && [ "$CURRENT" != "-" ]; do
    Q=$(awk -v X="$CURRENT" '/^---$/{ib=0;next} /^id:/{ib=($2==X)} ib && /^q:/{print $2; exit}' ./scoped/tree.md)
    N=$(awk -v X="$CURRENT" '/^---$/{ib=0;next} /^id:/{ib=($2==X)} ib && /^n:/{print $2; exit}' ./scoped/tree.md)
    NEW_Q=$(echo "$Q + $REWARD" | bc -l)
    NEW_N=$((N + 1))
    awk -v X="$CURRENT" -v V="$NEW_Q" '/^---$/{ib=0;print;next} /^id:/{ib=($2==X);print;next} ib && /^q:/{print "q: " V;next} {print}' ./scoped/tree.md > ./scoped/tree.md.tmp && mv ./scoped/tree.md.tmp ./scoped/tree.md
    awk -v X="$CURRENT" -v V="$NEW_N" '/^---$/{ib=0;print;next} /^id:/{ib=($2==X);print;next} ib && /^n:/{print "n: " V;next} {print}' ./scoped/tree.md > ./scoped/tree.md.tmp && mv ./scoped/tree.md.tmp ./scoped/tree.md
    CURRENT=$(awk -v X="$CURRENT" '/^---$/{ib=0;next} /^id:/{ib=($2==X)} ib && /^parent_id:/{print $2; exit}' ./scoped/tree.md)
  done
}
```


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

## Instruction: Select
**Condition:** MEMORY state is "selecting"
**Action:** Descend the tree from root using UCT. At each non-leaf, choose the next child by the n=0 fast-path or by UCT formula (R44, R45). When a leaf is reached (no node has `parent_id == this id`), write the leaf id to `./scoped/cursor.md` and transition to `expanding` (R46).

    C=$(cat ./scoped/uct_c.md)
    CURRENT="n0"

    while true; do
      CHILDREN=$(awk -v P="$CURRENT" '/^---$/{id="";p=""} /^id:/{id=$2} /^parent_id:/{p=$2; if (p==P) print id}' ./scoped/tree.md)
      [ -z "$CHILDREN" ] && break

      # R45: leftmost unvisited (n == 0)
      UNVISITED=$(for ID in $CHILDREN; do
        N=$(awk -v X="$ID" '/^---$/{ib=0;next} /^id:/{ib=($2==X)} ib && /^n:/{print $2; exit}' ./scoped/tree.md)
        [ "$N" = "0" ] && echo "$ID"
      done | sort | head -n 1)
      if [ -n "$UNVISITED" ]; then
        CURRENT="$UNVISITED"
        continue
      fi

      # R44: UCT among visited children
      N_PARENT=$(awk -v X="$CURRENT" '/^---$/{ib=0;next} /^id:/{ib=($2==X)} ib && /^n:/{print $2; exit}' ./scoped/tree.md)
      BEST_ID=""
      BEST_UCT=""
      for ID in $CHILDREN; do
        Q=$(awk -v X="$ID" '/^---$/{ib=0;next} /^id:/{ib=($2==X)} ib && /^q:/{print $2; exit}' ./scoped/tree.md)
        N=$(awk -v X="$ID" '/^---$/{ib=0;next} /^id:/{ib=($2==X)} ib && /^n:/{print $2; exit}' ./scoped/tree.md)
        UCT=$(echo "$Q/$N + $C * sqrt(l($N_PARENT)/$N)" | bc -l)
        if [ -z "$BEST_UCT" ] || [ "$(echo "$UCT > $BEST_UCT" | bc -l)" = "1" ]; then
          BEST_ID="$ID"; BEST_UCT="$UCT"
        fi
      done
      CURRENT="$BEST_ID"
    done

    echo "$CURRENT" > ./scoped/cursor.md

Then wholesale-rewrite MEMORY:

    cat > ./MEMORY.md << SEL_EOF
    ## State
    expanding
    ## Matched Instruction
    Select
    ## Last Action
    Descended via UCT to leaf $CURRENT.
    ## Result
    Cursor set; ready to expand.
    SEL_EOF

## Instruction: Expand-push
**Condition:** MEMORY state is "expanding"
**Action:** Stage push-args via the Compose-partial-state primitive; emit `## Push dynamics/expand-node.md`.

    ID=$(cat ./scoped/cursor.md)
    compose_partial_state "$ID" > ./scoped/staged/partial_state.md
    cp ./scoped/task.md ./scoped/staged/task.md

Then emit MEMORY:

    PS=$(sed 's/^/  /' ./scoped/staged/partial_state.md)
    TK=$(sed 's/^/  /' ./scoped/staged/task.md)

    cat > ./MEMORY.md << EXP_EOF
    ## State
    expanding
    ## Matched Instruction
    Expand-push
    ## Last Action
    Pushed expand-node.md for $ID.
    ## Result
    Push queued.
    ## Push
    dynamics/expand-node.md
    ## Push-Args
    partial_state: |
    $PS
    task: |
    $TK
    EXP_EOF

The state value `expanding` is the returnState; on pop the shell sets state to `expanding_completed`, which `Expand-absorb` matches.

## Instruction: Expand-absorb
**Condition:** MEMORY state is "expanding_completed" and `## Children` is present in MEMORY
**Action:** Parse the spliced `## Children` block as a sequence of `state:` block-scalar entries (k=5 expected). For each well-formed entry, allocate the next monotonic id, append a node block to `./scoped/tree.md` with `parent_id = cursor`, `depth = cursor_depth + 1`, `q: 0, n: 0, status: live`, and write the entry's payload verbatim to `./scoped/state-<new_id>.md`. Record the lowest-id newly created child to `./scoped/chosen_child.md`. Drop `## Children`. Transition to `simulating`.

    CURSOR=$(cat ./scoped/cursor.md)
    CURSOR_DEPTH=$(awk -v X="$CURSOR" '/^---$/{ib=0;next} /^id:/{ib=($2==X)} ib && /^depth:/{print $2; exit}' ./scoped/tree.md)
    NEXT_DEPTH=$((CURSOR_DEPTH + 1))

    # Extract body of ## Children
    awk '/^## Children$/{f=1; next} /^## [A-Z]/ && f {exit} f' ./MEMORY.md > ./scoped/_children.txt

    # Awk writes one file per entry. Blank-line-preserving continuation: matches
    # 4-space-indented lines OR fully blank lines (yaml block-scalar semantics).
    rm -f ./scoped/_entry-*.txt
    awk 'BEGIN{n=0; buf=""}
      /^  state:[[:space:]]*\|[[:space:]]*$/ {
        if (n > 0) { printf "%s", buf > ("./scoped/_entry-" n ".txt") }
        n++; buf=""; next
      }
      n > 0 && /^(    |$)/ {
        sub(/^    /, "")
        buf = buf $0 "\n"
        next
      }
      END {
        if (n > 0) { printf "%s", buf > ("./scoped/_entry-" n ".txt") }
      }
    ' ./scoped/_children.txt

    WELL_FORMED=0
    FIRST_NEW=""
    for f in ./scoped/_entry-*.txt; do
      [ -e "$f" ] || continue
      # Capture trailing-newline-preserving payload
      PAYLOAD=$(cat "$f"; printf x); PAYLOAD=${PAYLOAD%x}
      NEW_ID="n$(grep -c '^id: n' ./scoped/tree.md)"
      cat >> ./scoped/tree.md << CHILD_EOF
    ---
    id: $NEW_ID
    parent_id: $CURSOR
    depth: $NEXT_DEPTH
    q: 0
    n: 0
    status: live
    CHILD_EOF
      printf '%s' "$PAYLOAD" > "./scoped/state-${NEW_ID}.md"
      [ -z "$FIRST_NEW" ] && FIRST_NEW="$NEW_ID"
      WELL_FORMED=$((WELL_FORMED + 1))
    done
    rm -f ./scoped/_entry-*.txt

    MISSING=$((5 - WELL_FORMED))

R50 routing — branch by `WELL_FORMED`. Each branch emits the literal next-state value into the MEMORY heredoc:

    if [ "$WELL_FORMED" -eq 0 ]; then
      # All malformed: mark cursor terminal_fail and re-enter selecting.
      awk -v X="$CURSOR" '
        /^---$/ { in_block = 0; print; next }
        /^id:/  { in_block = ($2 == X); print; next }
        in_block && /^status:/ { print "status: terminal_fail"; next }
        { print }
      ' ./scoped/tree.md > ./scoped/tree.md.tmp && mv ./scoped/tree.md.tmp ./scoped/tree.md

      cat > ./MEMORY.md << ABSORB_FAIL_EOF
    ## State
    selecting
    ## Matched Instruction
    Expand-absorb
    ## Last Action
    Absorbed 0 children for $CURSOR; marked terminal_fail and routing to selecting.
    ## Result
    Children appended to scoped/tree.md.

    ## Pending Questions
    - Q: expand-node.md returned zero well-formed state entries for cursor $CURSOR; marked terminal_fail.
    ABSORB_FAIL_EOF
    else
      echo "$FIRST_NEW" > ./scoped/chosen_child.md
      if [ "$MISSING" -gt 0 ]; then
        PQ=$(printf '\n## Pending Questions\n- Q: expand-node.md returned %d well-formed state entries (expected 5).' "$WELL_FORMED")
      else
        PQ=""
      fi

      cat > ./MEMORY.md << ABSORB_OK_EOF
    ## State
    simulating
    ## Matched Instruction
    Expand-absorb
    ## Last Action
    Absorbed $WELL_FORMED children for $CURSOR; chose $FIRST_NEW; routing to simulating.
    ## Result
    Children appended to scoped/tree.md.$PQ
    ABSORB_OK_EOF
    fi

R50: `## Pending Questions` is appended; state is NEVER `waiting_for_user` here — the loop must keep progressing.

## Instruction: Simulate-push
**Condition:** MEMORY state is "simulating"
**Action:** Stage push-args from chosen_child (not cursor); emit `## Push dynamics/rollout.md`.

    CC=$(cat ./scoped/chosen_child.md)
    compose_partial_state "$CC" > ./scoped/staged/partial_state.md
    cp ./scoped/task.md ./scoped/staged/task.md

Then emit MEMORY:

    PS=$(sed 's/^/  /' ./scoped/staged/partial_state.md)
    TK=$(sed 's/^/  /' ./scoped/staged/task.md)

    cat > ./MEMORY.md << SIM_EOF
    ## State
    simulating
    ## Matched Instruction
    Simulate-push
    ## Last Action
    Pushed rollout.md for $CC.
    ## Result
    Push queued.
    ## Push
    dynamics/rollout.md
    ## Push-Args
    partial_state: |
    $PS
    task: |
    $TK
    SIM_EOF

The state value `simulating` is the returnState; on pop the shell sets state to `simulating_completed`.

## Instruction: Simulate-absorb
**Condition:** MEMORY state is "simulating_completed"
**Action:** Persist `## Terminal State` to `./scoped/last_terminal.md`. If non-empty, push `dynamics/evaluate.md` with `attempt` = last_terminal and `criterion` = task. If empty/missing, synthesise a `fail` verdict directly and route to `evaluating_completed` (R53).

    # Extract body of ## Terminal State (or empty if missing)
    awk '/^## Terminal State$/{f=1; next} /^## /{f=0} f' ./MEMORY.md > ./scoped/last_terminal.md

    if [ ! -s ./scoped/last_terminal.md ]; then
      # R53 malformed branch: synthesize fail verdict, skip evaluate push
      PQ=$(printf '\n## Pending Questions\n- Q: rollout.md returned empty or missing ## Terminal State; treating as failed rollout.')
      cat > ./MEMORY.md << SYN_EOF
    ## State
    evaluating_completed
    ## Matched Instruction
    Simulate-absorb (malformed)
    ## Last Action
    rollout.md returned malformed output; synthesising fail verdict.
    ## Result
    Synthetic verdict written.
    ## Verdict
    fail
    ## Feedback
    rollout returned malformed output$PQ
    SYN_EOF
    else
      cp ./scoped/last_terminal.md ./scoped/staged/attempt.md
      cp ./scoped/task.md ./scoped/staged/criterion.md
      AT=$(sed 's/^/  /' ./scoped/staged/attempt.md)
      CR=$(sed 's/^/  /' ./scoped/staged/criterion.md)
      cat > ./MEMORY.md << EVAL_EOF
    ## State
    evaluating
    ## Matched Instruction
    Simulate-absorb
    ## Last Action
    Persisted terminal state; pushing evaluate.md.
    ## Result
    Push queued.
    ## Push
    dynamics/evaluate.md
    ## Push-Args
    attempt: |
    $AT
    criterion: |
    $CR
    EVAL_EOF
    fi

## Instruction: Evaluate-absorb
**Condition:** MEMORY state is "evaluating_completed" and `## Verdict` is present in MEMORY
**Action:** Parse verdict; map to reward (R54). Back-propagate (R55). On reward=1: mark chosen_child terminal_pass (record-A: no intermediate materialisation, R82), emit `## Solution`, set state `done` (R56). On reward=0: transition to `reflecting` (R57; do NOT mark terminal_fail here).

    CC=$(cat ./scoped/chosen_child.md)
    VERDICT=$(awk '/^## Verdict$/{f=1; next} /^## /{f=0} f && /[a-z]/{print; exit}' ./MEMORY.md | tr -d ' ')

    case "$VERDICT" in
      pass) REWARD=1 ;;
      fail) REWARD=0 ;;
      *)    REWARD=0; MALFORMED=1 ;;
    esac

    backprop "$CC" "$REWARD"

    if [ "$REWARD" = "1" ]; then
      awk -v X="$CC" '
        /^---$/ { in_block = 0; print; next }
        /^id:/  { in_block = ($2 == X); print; next }
        in_block && /^status:/ { print "status: terminal_pass"; next }
        { print }
      ' ./scoped/tree.md > ./scoped/tree.md.tmp && mv ./scoped/tree.md.tmp ./scoped/tree.md

      ITER=$(cat ./scoped/iter_count.md)
      TERMINAL=$(cat ./scoped/last_terminal.md)
      cat > ./MEMORY.md << SOLUTION_EOF
    ## State
    done
    ## Matched Instruction
    Evaluate-absorb (solved)
    ## Last Action
    Reward 1 from chosen_child $CC at iteration $ITER.
    ## Result
    Solution found.
    ## Solution
    Iteration: $ITER
    Terminal state:
    $TERMINAL
    SOLUTION_EOF
    else
      NEXT_STATE=reflecting
      if [ -n "$MALFORMED" ]; then
        PQ=$(printf '\n## Pending Questions\n- Q: evaluate.md returned verdict "%s" not in {pass, fail}; treated as fail.' "$VERDICT")
      else
        PQ=""
      fi
      cat > ./MEMORY.md << REFLECT_EOF
    ## State
    $NEXT_STATE
    ## Matched Instruction
    Evaluate-absorb
    ## Last Action
    Reward 0; back-propagated; routing to reflecting.
    ## Result
    Failure registered.$PQ
    REFLECT_EOF
    fi

# Sub-instructions

(none — this interpreter needs none.)
