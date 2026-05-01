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

## Instruction: Expand-push
**Condition:** MEMORY state is "expanding"
**Action:** Find the first unexpanded live node at `current_depth` using the "Find first matching node" primitive (depth == current_depth, status == live, has zero children). If none exists, route via Phase-router (below) without emitting a push.

The canonical push block this instruction emits into MEMORY is:

```
## Push
dynamics/expand-node.md
## Push-Args
parent_thought: |
  op: <parent op>
  left: <parent left>
target: <target int>
numbers_remaining: <space-separated remaining numbers>
```

    DEPTH=$(cat ./scoped/current_depth.md)
    TARGET=$(cat ./scoped/target.md)

    HAS_CHILD=$(awk '/^parent_id:/ {print $2}' ./scoped/tree.md | sort -u)

    ID=$(awk -v D="$DEPTH" -v EXCL="$HAS_CHILD" '
      BEGIN { n=split(EXCL, arr, "\n"); for (i=1; i<=n; i++) excl[arr[i]] = 1 }
      /^---$/ {
        if (id != "" && d == D && s == "live" && !(id in excl)) { print id; exit }
        id=""; d=""; s=""; next
      }
      /^id:/      { id = $2 }
      /^depth:/   { d = $2 }
      /^status:/  { s = $2 }
    ' ./scoped/tree.md)

If `$ID` is empty, defer to Phase-router via the absorb cycle (skip emitting `## Push`). Otherwise:

    echo "$ID" > ./scoped/cursor.md
    OP=$(awk -v ID="$ID" '/^---$/{in_block=0;next} /^id:/{in_block=($2==ID)} in_block && /^op:/{sub(/^op: /,""); print; exit}' ./scoped/tree.md)
    LEFT=$(awk -v ID="$ID" '/^---$/{in_block=0;next} /^id:/{in_block=($2==ID)} in_block && /^left:/{sub(/^left: /,""); print; exit}' ./scoped/tree.md)
    printf 'op: %s\nleft: %s\n' "$OP" "$LEFT" > ./scoped/staged/parent_thought.md
    echo "$LEFT" > ./scoped/staged/numbers_remaining.md

Then emit MEMORY:

    PT=$(sed 's/^/  /' ./scoped/staged/parent_thought.md)
    NR=$(cat ./scoped/staged/numbers_remaining.md)

    cat > ./MEMORY.md << MEM_EOF
    ## State
    expanding
    ## Matched Instruction
    Expand-push
    ## Last Action
    Pushed expand-node.md for $ID at depth $DEPTH.
    ## Result
    Push queued.
    ## Push
    dynamics/expand-node.md
    ## Push-Args
    parent_thought: |
    $PT
    target: $TARGET
    numbers_remaining: $NR
    MEM_EOF

The state value `expanding` is the returnState; on pop the shell sets state to `expanding_completed`, which `Expand-absorb` matches.

## Instruction: Expand-absorb
**Condition:** MEMORY state is "expanding_completed" and `## Children` is present in MEMORY
**Action:** Parse the spliced `## Children` block as alternating `op:` / `left:` lines. For each well-formed pair, append a node block to `./scoped/tree.md` using the "Append a node block" primitive with `parent_id = $(cat ./scoped/cursor.md)`, `depth = current_depth + 1`, `value: 0`, `samples: 0`, `status: live`, and `op`/`left` parsed from the pair.

    DEPTH=$(cat ./scoped/current_depth.md)
    NEXT_DEPTH=$((DEPTH + 1))
    PARENT=$(cat ./scoped/cursor.md)

    awk '/^## Children$/{f=1; next} /^## [A-Z]/ && f {exit} f' ./MEMORY.md > ./scoped/_children.txt

    WELL_FORMED=0
    op=""
    while IFS= read -r line; do
      if [[ "$line" =~ ^op:\ (.+)$ ]]; then
        op="${BASH_REMATCH[1]}"
      elif [[ "$line" =~ ^left:\ (.+)$ ]] && [ -n "$op" ]; then
        left="${BASH_REMATCH[1]}"
        NEXT_INDEX=$(grep -c '^id: n' ./scoped/tree.md)
        NEW_ID="n$NEXT_INDEX"
        cat >> ./scoped/tree.md << NODE_EOF
    ---
    id: $NEW_ID
    parent_id: $PARENT
    depth: $NEXT_DEPTH
    op: $op
    left: $left
    value: 0
    samples: 0
    status: live
    NODE_EOF
        WELL_FORMED=$((WELL_FORMED + 1))
        op=""
      fi
    done < ./scoped/_children.txt

    MISSING=$((5 - WELL_FORMED))

Decide next state via Phase-router (R18):

    UNEXPANDED=$(awk -v D="$DEPTH" -v EXCL="$(awk '/^parent_id:/ {print $2}' ./scoped/tree.md | sort -u)" '
      BEGIN { n=split(EXCL, arr, "\n"); for (i=1; i<=n; i++) excl[arr[i]] = 1 }
      /^---$/ {
        if (id != "" && d == D && s == "live" && !(id in excl)) { print id; exit }
        id=""; d=""; s=""; next
      }
      /^id:/{id=$2} /^depth:/{d=$2} /^status:/{s=$2}
    ' ./scoped/tree.md)

    UNSCORED=$(awk -v D="$NEXT_DEPTH" '
      /^---$/ {
        if (id != "" && d == D && s == "live" && samp < 3) { print id; exit }
        id=""; d=""; s=""; samp=0; next
      }
      /^id:/{id=$2} /^depth:/{d=$2} /^status:/{s=$2} /^samples:/{samp=$2}
    ' ./scoped/tree.md)

    if [ -n "$UNEXPANDED" ]; then
      [ -n "$UNSCORED" ] && NEXT_STATE=scoring || NEXT_STATE=expanding
    elif [ -n "$UNSCORED" ]; then
      NEXT_STATE=scoring
    else
      NEXT_STATE=pruning
    fi

Then wholesale-rewrite MEMORY (drop `## Children`, optionally append `## Pending Questions` on malformed):

    if [ "$MISSING" -gt 0 ]; then
      PQ_BLOCK=$(printf '\n## Pending Questions\n- Q: expand-node.md returned %d well-formed children (expected 5); %d entries malformed for parent %s.' "$WELL_FORMED" "$MISSING" "$PARENT")
    else
      PQ_BLOCK=""
    fi

    cat > ./MEMORY.md << MEM_EOF
    ## State
    $NEXT_STATE
    ## Matched Instruction
    Expand-absorb
    ## Last Action
    Absorbed $WELL_FORMED children for $PARENT at depth $NEXT_DEPTH; routing to $NEXT_STATE.
    ## Result
    Children appended to scoped/tree.md.$PQ_BLOCK
    MEM_EOF

The R47 path: `## Pending Questions` is appended; state is NEVER `waiting_for_user` here — the loop must keep progressing.

## Instruction: Score-push
**Condition:** MEMORY state is "scoring"
**Action:** Find the first live unscored child (`depth == current_depth + 1` AND `status == live` AND `samples < 3`). If none, defer to Phase-router (no push this cycle).

    DEPTH=$(cat ./scoped/current_depth.md)
    NEXT_DEPTH=$((DEPTH + 1))
    TARGET=$(cat ./scoped/target.md)

    ID=$(awk -v D="$NEXT_DEPTH" '
      /^---$/ {
        if (id != "" && d == D && s == "live" && samp < 3) { print id; exit }
        id=""; d=""; s=""; samp=0; next
      }
      /^id:/      { id = $2 }
      /^depth:/   { d = $2 }
      /^status:/  { s = $2 }
      /^samples:/ { samp = $2 }
    ' ./scoped/tree.md)

If `$ID` is empty, route via Phase-router on the next cycle (no push). Otherwise stage the thought and emit `## Push`:

    echo "$ID" > ./scoped/cursor.md
    OP=$(awk -v ID="$ID" '/^---$/{in_block=0;next} /^id:/{in_block=($2==ID)} in_block && /^op:/{sub(/^op: /,""); print; exit}' ./scoped/tree.md)
    LEFT=$(awk -v ID="$ID" '/^---$/{in_block=0;next} /^id:/{in_block=($2==ID)} in_block && /^left:/{sub(/^left: /,""); print; exit}' ./scoped/tree.md)
    SAMP=$(awk -v ID="$ID" '/^---$/{in_block=0;next} /^id:/{in_block=($2==ID)} in_block && /^samples:/{print $2; exit}' ./scoped/tree.md)
    printf 'op: %s\nleft: %s\n' "$OP" "$LEFT" > ./scoped/staged/thought.md

    TH=$(sed 's/^/  /' ./scoped/staged/thought.md)

The canonical push block this instruction emits into MEMORY is:

```
## Push
dynamics/score.md
## Push-Args
thought: |
  <staged thought, two-space indented>
target: <target int>
```

Heredoc-form bash for the strategy:

    cat > ./MEMORY.md << MEM_EOF
    ## State
    scoring
    ## Matched Instruction
    Score-push
    ## Last Action
    Pushed score.md for $ID (sample $((SAMP + 1)) of 3).
    ## Result
    Push queued.
    ## Push
    dynamics/score.md
    ## Push-Args
    thought: |
    $TH
    target: $TARGET
    MEM_EOF

The state value `scoring` is the returnState; on pop the shell sets state to `scoring_completed`, which `Score-absorb` matches.

## Instruction: Score-absorb
**Condition:** MEMORY state is "scoring_completed" and `## Value` is present in MEMORY
**Action:** Read the cursor id and the returned label. Map label → weight per `{sure: 20, likely: 1, impossible: 0.001}` (R21). On malformed label, treat as `impossible` (R44) and append non-blocking `## Pending Questions`. Surgically increment samples and add weight to value. Drop `## Value`. Route via Phase-router.

    ID=$(cat ./scoped/cursor.md)
    LABEL=$(awk '/^## Value$/{f=1; next} /^## /{f=0} f && /[a-z]/{print; exit}' ./MEMORY.md | tr -d ' ')

    case "$LABEL" in
      sure)       WEIGHT=20      ;;
      likely)     WEIGHT=1       ;;
      impossible) WEIGHT=0.001   ;;
      *)          WEIGHT=0.001
                  MALFORMED=1   ;;
    esac

    CURRENT_VALUE=$(awk -v ID="$ID" '/^---$/{in_block=0;next} /^id:/{in_block=($2==ID)} in_block && /^value:/{print $2; exit}' ./scoped/tree.md)
    NEW_VALUE=$(echo "$CURRENT_VALUE + $WEIGHT" | bc -l)
    CURRENT_SAMPLES=$(awk -v ID="$ID" '/^---$/{in_block=0;next} /^id:/{in_block=($2==ID)} in_block && /^samples:/{print $2; exit}' ./scoped/tree.md)
    NEW_SAMPLES=$((CURRENT_SAMPLES + 1))

    awk -v ID="$ID" -v V="$NEW_VALUE" '
      /^---$/ { in_block = 0; print; next }
      /^id:/  { in_block = ($2 == ID); print; next }
      in_block && /^value:/ { print "value: " V; next }
      { print }
    ' ./scoped/tree.md > ./scoped/tree.md.tmp && mv ./scoped/tree.md.tmp ./scoped/tree.md

    awk -v ID="$ID" -v S="$NEW_SAMPLES" '
      /^---$/ { in_block = 0; print; next }
      /^id:/  { in_block = ($2 == ID); print; next }
      in_block && /^samples:/ { print "samples: " S; next }
      { print }
    ' ./scoped/tree.md > ./scoped/tree.md.tmp && mv ./scoped/tree.md.tmp ./scoped/tree.md

Decide next state via Phase-router (mirrors Expand-absorb's logic):

    DEPTH=$(cat ./scoped/current_depth.md)
    NEXT_DEPTH=$((DEPTH + 1))
    HAS_CHILD=$(awk '/^parent_id:/ {print $2}' ./scoped/tree.md | sort -u)
    UNEXPANDED=$(awk -v D="$DEPTH" -v EXCL="$HAS_CHILD" '
      BEGIN { n=split(EXCL, arr, "\n"); for (i=1; i<=n; i++) excl[arr[i]] = 1 }
      /^---$/ {
        if (id != "" && d == D && s == "live" && !(id in excl)) { print id; exit }
        id=""; d=""; s=""; next
      }
      /^id:/{id=$2} /^depth:/{d=$2} /^status:/{s=$2}
    ' ./scoped/tree.md)
    UNSCORED=$(awk -v D="$NEXT_DEPTH" '
      /^---$/ {
        if (id != "" && d == D && s == "live" && samp < 3) { print id; exit }
        id=""; d=""; s=""; samp=0; next
      }
      /^id:/{id=$2} /^depth:/{d=$2} /^status:/{s=$2} /^samples:/{samp=$2}
    ' ./scoped/tree.md)

    if [ -n "$UNEXPANDED" ]; then
      [ -n "$UNSCORED" ] && NEXT_STATE=scoring || NEXT_STATE=expanding
    elif [ -n "$UNSCORED" ]; then
      NEXT_STATE=scoring
    else
      NEXT_STATE=pruning
    fi

    if [ -n "$MALFORMED" ]; then
      PQ_BLOCK=$(printf '\n## Pending Questions\n- Q: score.md returned label "%s" not in {sure, likely, impossible}; treated as impossible.' "$LABEL")
    else
      PQ_BLOCK=""
    fi

    cat > ./MEMORY.md << MEM_EOF
    ## State
    $NEXT_STATE
    ## Matched Instruction
    Score-absorb
    ## Last Action
    Updated $ID: samples=$NEW_SAMPLES, value=$NEW_VALUE; routing to $NEXT_STATE.
    ## Result
    Score absorbed.$PQ_BLOCK
    MEM_EOF

The R44 path: malformed labels are treated as `impossible` and a non-blocking `## Pending Questions` is appended; state is NEVER `waiting_for_user` here — the loop must keep progressing.

## Instruction: Prune
**Condition:** MEMORY state is "pruning"
**Action:** Select all `live` nodes at `current_depth + 1`, sort by `value` descending then `id` ascending, retain top b=5, mark every other as `status: pruned`. If no live nodes exist at `current_depth + 1`, write `## No Solution Found` and halt (R37).

    DEPTH=$(cat ./scoped/current_depth.md)
    NEXT_DEPTH=$((DEPTH + 1))

    LIVE_NODES=$(awk -v D="$NEXT_DEPTH" '
      /^---$/ { id=""; d=""; v=""; s=""; next }
      /^id:/      { id=$2 }
      /^depth:/   { d=$2 }
      /^value:/   { v=$2 }
      /^status:/  { s=$2; if (id != "" && d == D && s == "live") printf "%s %s\n", v, id }
    ' ./scoped/tree.md)

    if [ -z "$LIVE_NODES" ]; then
      cat > ./MEMORY.md << DEAD_EOF
    ## State
    done
    ## Matched Instruction
    Prune (dead-end)
    ## Last Action
    No live nodes at depth $NEXT_DEPTH; halting.
    ## Result
    Search exhausted without solution.
    ## No Solution Found
    Pruning at depth $NEXT_DEPTH found zero live candidates; aborting BFS.
    DEAD_EOF
      exit 0
    fi

    LOSERS=$(echo "$LIVE_NODES" | sort -k1,1nr -k2,2 | tail -n +6 | awk '{print $2}')

    for L in $LOSERS; do
      awk -v ID="$L" '
        /^---$/ { in_block = 0; print; next }
        /^id:/  { in_block = ($2 == ID); print; next }
        in_block && /^status:/ { print "status: pruned"; next }
        { print }
      ' ./scoped/tree.md > ./scoped/tree.md.tmp && mv ./scoped/tree.md.tmp ./scoped/tree.md
    done

    KEPT=$(echo "$LIVE_NODES" | sort -k1,1nr -k2,2 | head -n 5 | wc -l)
    TOTAL_LIVE=$(echo "$LIVE_NODES" | wc -l)

    cat > ./MEMORY.md << MEM_EOF
    ## State
    advancing
    ## Matched Instruction
    Prune
    ## Last Action
    Pruned depth $NEXT_DEPTH from $TOTAL_LIVE live nodes to top $KEPT.
    ## Result
    Frontier reduced.
    MEM_EOF

## Instruction: Advance
**Condition:** MEMORY state is "advancing"
**Action:** Read current_depth and max_depth. If `current_depth + 1 ≤ max_depth`, increment and re-enter expanding (R26). Else, transition to goal_checking (R27).

    DEPTH=$(cat ./scoped/current_depth.md)
    MAX=$(cat ./scoped/max_depth.md)
    NEXT=$((DEPTH + 1))

    if [ "$NEXT" -le "$MAX" ]; then
      echo "$NEXT" > ./scoped/current_depth.md
      NEXT_STATE=expanding
    else
      NEXT_STATE=goal_checking
    fi

    cat > ./MEMORY.md << MEM_EOF
    ## State
    $NEXT_STATE
    ## Matched Instruction
    Advance
    ## Last Action
    Advanced from depth $DEPTH; routing to $NEXT_STATE.
    ## Result
    Depth advanced.
    MEM_EOF

## Instruction: Goal-push
**Condition:** MEMORY state is "goal_checking"
**Action:** Find first live terminal (`depth == max_depth` AND `status == live`). If none, emit `## No Solution Found` (R34). Otherwise reconstruct expression via parent-walk, synthesize criterion, push evaluate.md.

The canonical push block this instruction emits into MEMORY is:

```
## Push
dynamics/evaluate.md
## Push-Args
attempt: |
  <reconstructed expression chain>
criterion: |
  Expression must use each of <numbers> exactly once and evaluate to <target>.
```

    MAX=$(cat ./scoped/max_depth.md)

    ID=$(awk -v D="$MAX" '
      /^---$/ {
        if (id != "" && d == D && s == "live") { print id; exit }
        id=""; d=""; s=""; next
      }
      /^id:/      { id = $2 }
      /^depth:/   { d = $2 }
      /^status:/  { s = $2 }
    ' ./scoped/tree.md)

    if [ -z "$ID" ]; then
      FAILS=$(grep -c '^status: terminal_fail$' ./scoped/tree.md)
      cat > ./MEMORY.md << EXH_EOF
    ## State
    done
    ## Matched Instruction
    Goal-push (exhausted)
    ## Last Action
    No live terminals remain; halting.
    ## Result
    Search exhausted without solution.
    ## No Solution Found
    $FAILS terminal candidates evaluated; none satisfied the criterion.
    EXH_EOF
      exit 0
    fi

    echo "$ID" > ./scoped/cursor.md

    EXPR=""
    CURRENT="$ID"
    while [ "$CURRENT" != "n0" ] && [ -n "$CURRENT" ]; do
      OP=$(awk -v X="$CURRENT" '/^---$/{in_block=0;next} /^id:/{in_block=($2==X)} in_block && /^op:/{sub(/^op: /,""); print; exit}' ./scoped/tree.md)
      PARENT=$(awk -v X="$CURRENT" '/^---$/{in_block=0;next} /^id:/{in_block=($2==X)} in_block && /^parent_id:/{print $2; exit}' ./scoped/tree.md)
      if [ -z "$EXPR" ]; then EXPR="($OP)"; else EXPR="($OP); $EXPR"; fi
      CURRENT="$PARENT"
    done

    echo "$EXPR" > ./scoped/staged/attempt.md

    NUMBERS=$(cat ./scoped/numbers.md)
    TARGET=$(cat ./scoped/target.md)
    printf 'Expression must use each of %s exactly once and evaluate to %s.\n' "$NUMBERS" "$TARGET" > ./scoped/staged/criterion.md

    ATT=$(sed 's/^/  /' ./scoped/staged/attempt.md)
    CRIT=$(sed 's/^/  /' ./scoped/staged/criterion.md)

    cat > ./MEMORY.md << MEM_EOF
    ## State
    goal_checking
    ## Matched Instruction
    Goal-push
    ## Last Action
    Pushed evaluate.md for terminal $ID with attempt and criterion.
    ## Result
    Push queued.
    ## Push
    dynamics/evaluate.md
    ## Push-Args
    attempt: |
    $ATT
    criterion: |
    $CRIT
    MEM_EOF

## Instruction: Goal-absorb
**Condition:** MEMORY state is "goal_checking_completed" and `## Verdict` is present in MEMORY
**Action:** Read cursor id and `## Verdict`. On `pass` → status `terminal_pass`, route `solved` (R31). On `fail` → status `terminal_fail`, route `goal_checking` (R32). On malformed verdict → treat as fail, append non-blocking `## Pending Questions` (R33).

    ID=$(cat ./scoped/cursor.md)
    VERDICT=$(awk '/^## Verdict$/{f=1; next} /^## /{f=0} f && /[a-z]/{print; exit}' ./MEMORY.md | tr -d ' ')

    case "$VERDICT" in
      pass)
        NEW_STATUS=terminal_pass
        NEXT_STATE=solved
        ;;
      fail)
        NEW_STATUS=terminal_fail
        NEXT_STATE=goal_checking
        ;;
      *)
        NEW_STATUS=terminal_fail
        NEXT_STATE=goal_checking
        MALFORMED=1
        ;;
    esac

    awk -v X="$ID" -v NS="$NEW_STATUS" '
      /^---$/ { in_block = 0; print; next }
      /^id:/  { in_block = ($2 == X); print; next }
      in_block && /^status:/ { print "status: " NS; next }
      { print }
    ' ./scoped/tree.md > ./scoped/tree.md.tmp && mv ./scoped/tree.md.tmp ./scoped/tree.md

    if [ -n "$MALFORMED" ]; then
      PQ_BLOCK=$(printf '\n## Pending Questions\n- Q: evaluate.md returned verdict "%s" not in {pass, fail}; treated as fail.' "$VERDICT")
    else
      PQ_BLOCK=""
    fi

    cat > ./MEMORY.md << MEM_EOF
    ## State
    $NEXT_STATE
    ## Matched Instruction
    Goal-absorb
    ## Last Action
    Marked $ID as $NEW_STATUS; routing to $NEXT_STATE.
    ## Result
    Verdict absorbed.$PQ_BLOCK
    MEM_EOF

## Instruction: Solved
**Condition:** MEMORY state is "solved"
**Action:** Find the (single) terminal_pass node. Reconstruct its expression via parent-walk. Count total nodes and pruned nodes. Emit `## Solution` and set state `done` (R35).

    PASS_ID=$(awk '/^---$/{id=""; s=""; next} /^id:/{id=$2} /^status:/{s=$2; if (s=="terminal_pass") {print id; exit}}' ./scoped/tree.md)

    EXPR=""
    CURRENT="$PASS_ID"
    while [ "$CURRENT" != "n0" ] && [ -n "$CURRENT" ]; do
      OP=$(awk -v X="$CURRENT" '/^---$/{in_block=0;next} /^id:/{in_block=($2==X)} in_block && /^op:/{sub(/^op: /,""); print; exit}' ./scoped/tree.md)
      PARENT=$(awk -v X="$CURRENT" '/^---$/{in_block=0;next} /^id:/{in_block=($2==X)} in_block && /^parent_id:/{print $2; exit}' ./scoped/tree.md)
      if [ -z "$EXPR" ]; then EXPR="($OP)"; else EXPR="($OP); $EXPR"; fi
      CURRENT="$PARENT"
    done

    TOTAL=$(grep -c '^id: n' ./scoped/tree.md)
    PRUNED=$(grep -c '^status: pruned$' ./scoped/tree.md)

    cat > ./MEMORY.md << MEM_EOF
    ## State
    done
    ## Matched Instruction
    Solved
    ## Last Action
    Reconstructed winning expression for $PASS_ID (total=$TOTAL nodes, pruned=$PRUNED).
    ## Result
    Search complete with verified solution.
    ## Solution
    Expression: $EXPR
    Total nodes expanded: $TOTAL
    Nodes pruned: $PRUNED
    MEM_EOF

The shell intercepts `state == done` at stack depth 1 (R36) and halts.

# Sub-instructions

(none — this interpreter needs none.)
