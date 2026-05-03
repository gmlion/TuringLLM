# Operator: AFlow-lite (MCTS over operator workflows)

A lightweight meta-framework following Zhang et al. (arXiv:2410.10762) that runs Monte Carlo Tree Search over candidate workflows composed from a fixed library of five operators. Each tree node represents a candidate workflow (a comma-separated list of operator names); the root n0 is the empty workflow. Each MCTS iteration: Select a leaf via UCT, Expand it via `operators/expand-workflow.md` (k=5 children), Simulate each candidate by running its operators on 3 GSM8K items, Evaluate via mean fraction passing, Back-propagate the reward up the chosen-child path. Halts on the first 1.0 reward, or after `max_iterations`.

Receives push-args (mode 1: standalone via root-operator bootstrap):
  - `{{program}}` — the user's PROGRAM.md content.

(AFlow-lite is invoked only standalone in v1 — never as a sub-operator. The operator file does not contain `{{task}}` or `{{prior_answer}}` placeholders since AFlow-lite is not part of any other workflow.)

Produces: `## State done` + `## Return` block with key `answer` (the best workflow found and its score), alongside `## Solution` (winner) or `## No Solution Found` for human inspection.

## Scoped files

State that persists for the run lives in `./scoped/`:

| File | Lifetime | Content | Edit pattern |
|------|----------|---------|--------------|
| `./scoped/tree.md` | whole run | YAML-block ledger of MCTS nodes (id, parent_id, depth, q, n, status) | append + awk-update only |
| `./scoped/task.md` | whole run | byte-equal copy of `../../PROGRAM.md` | wholesale-write at Initialize |
| `./scoped/max_iterations.md` | whole run | `10` | wholesale-write at Initialize |
| `./scoped/uct_c.md` | whole run | `1.41421356` | wholesale-write at Initialize |
| `./scoped/iter_count.md` | whole run | integer | bumped per iteration |
| `./scoped/benchmark_items.md` | whole run | the 3 sampled items as JSON lines | wholesale-write at Initialize |
| `./scoped/cursor.md` | whole run | one node id (selection target) | wholesale-write each Select |
| `./scoped/chosen_child.md` | whole run | one node id (rollout origin) | wholesale-write each Expand-absorb |
| `./scoped/recent_scores.md` | whole run | last N (workflow, score) pairs, capped | append-only, capped |
| `./scoped/state-<id>.md` | whole run | per-node workflow recipe (comma-separated) | write-once at node creation |
| `./scoped/last_answer_item-<i>.md` | per-iteration | the latest workflow's final answer for item i | wholesale-write per item |

## Operator library

Hardcoded:

    LIBRARY="refine,reflexion,cove,plan-execute,debate"

The library does NOT include `self-refine` (subsumed by `refine`), `tot`/`lats` (search-over-search recursion), `metagpt`/`chatdev` (end-to-end pipelines), or `MoA` (deferred — blocked on per-prompt model selection in the harness).

## Tree-ledger primitives (LATS-equivalent)

Every instruction that reads or writes `./scoped/tree.md` uses these bash idioms. They are stated once here and referenced by name from each Instruction body.

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

**Next monotonic id**:

    NEXT_INDEX=$(grep -c '^id: n' ./scoped/tree.md)
    NEW_ID="n$NEXT_INDEX"

**Update one field of one node** (surgical edit):

    # Args: $1 = id, $2 = field name, $3 = new value
    awk -v ID="$1" -v F="$2" -v V="$3" '
      /^---$/ { in_block = 0; print; next }
      /^id:/  { in_block = ($2 == ID); print; next }
      in_block && $1 == F":" { print F": " V; next }
      { print }
    ' ./scoped/tree.md > ./scoped/tree.md.tmp && mv ./scoped/tree.md.tmp ./scoped/tree.md

Compact one-line form, used inline by Back-prop and other instructions where the field name is a literal:

    awk -v X="$ID" -v V="$NEWV" '/^---$/{ib=0;print;next} /^id:/{ib=($2==X);print;next} ib && /^q:/{print "q: " V;next} {print}' ./scoped/tree.md > ./scoped/tree.md.tmp && mv ./scoped/tree.md.tmp ./scoped/tree.md

**Per-node state file**: created at node-creation time as `./scoped/state-<id>.md`; **write-once**, never modified after creation. Read whenever the strategy needs to push that node's workflow recipe into a dynamic.

### Compose-partial-state primitive

The expansion phase sends a `{{partial_state}}` push-arg to `expand-workflow.md`. For aflow-lite this is composed from three pieces:
1. The current workflow recipe (the cursor node's `state-${CURSOR}.md` content; for the root n0 it's empty).
2. The library of available operator names (`$LIBRARY`).
3. A summary of recent scores (the last N entries from `./scoped/recent_scores.md`, where each entry is `<workflow>: <score>`).

Bash:

    compose_partial_state() {
      local CURSOR=$(cat ./scoped/cursor.md)
      local CURRENT=$(cat "./scoped/state-${CURSOR}.md")
      local RECENT=$(tail -n 10 ./scoped/recent_scores.md 2>/dev/null || true)
      cat << COMPOSE_EOF
    Current workflow recipe (the operator chain to extend; empty means the root):
    ${CURRENT}

    Library of available operator names:
    ${LIBRARY}

    Recent scores observed in this run (workflow: mean_reward over 3 items):
    ${RECENT}
    COMPOSE_EOF
    }

The composed text is written to a staging file (e.g. `./scoped/staged/partial_state.md`) before being passed as a `{{partial_state}}` push-arg to `expand-workflow.md`.

### Back-prop primitive

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
**Action:** Load the demo configuration, copy the program, sample benchmark items, seed the tree.

    # Mode-detection guard: AFlow-lite is standalone-only in v1
    if grep -qF '{{task}}' ./INSTRUCTIONS.md; then
      true  # standalone mode (token still literal — expected for AFlow-lite)
    fi

    mkdir -p ./scoped

    # Copy PROGRAM.md text into scoped task
    cp ../../PROGRAM.md ./scoped/task.md

    # Constants
    echo "10" > ./scoped/max_iterations.md
    echo "1.41421356" > ./scoped/uct_c.md
    echo "0" > ./scoped/iter_count.md

    # Sample 3 items deterministically from the fixture.
    # Deterministic seed: take the first item, the middle item, and the last item.
    # (This is reproducible: same fixture file → same 3 items every run.)
    FIXTURE=../../workspace/gsm8k.jsonl
    if [ ! -f "$FIXTURE" ]; then
      cat >> ./MEMORY.md << 'PQEOF'

## Pending Questions
- Fixture file workspace/gsm8k.jsonl is missing. Create the fixture or correct the path.
PQEOF
      cat > ./MEMORY.md << 'WAITEOF'
## State
waiting_for_user
## Matched Instruction
Initialize
## Last Action
Fixture missing.
## Result
Cannot proceed without fixture.
WAITEOF
      exit 0
    fi
    TOTAL=$(wc -l < "$FIXTURE")
    if [ "$TOTAL" -lt 3 ]; then
      cat > ./MEMORY.md << 'WAITEOF2'
## State
waiting_for_user
## Matched Instruction
Initialize
## Last Action
Fixture too small.
## Result
Need at least 3 items in the fixture.

## Pending Questions
- Fixture has fewer than 3 items.
WAITEOF2
      exit 0
    fi
    MID=$(( TOTAL / 2 ))
    {
      sed -n '1p' "$FIXTURE"
      sed -n "${MID}p" "$FIXTURE"
      sed -n "${TOTAL}p" "$FIXTURE"
    } > ./scoped/benchmark_items.md

    # Seed the tree with root n0 (empty workflow)
    cat > ./scoped/tree.md << 'TREEEOF'
---
id: n0
parent_id: -
depth: 0
q: 0
n: 0
status: live
TREEEOF

    # n0 is the empty workflow
    : > ./scoped/state-n0.md

    # Empty recent scores
    : > ./scoped/recent_scores.md

    # Transition to selecting
    cat > ./MEMORY.md << 'INITEOF'
## State
selecting
## Matched Instruction
Initialize
## Last Action
Loaded PROGRAM, sampled 3 benchmark items deterministically (1st, middle, last), seeded root n0 (empty workflow).
## Result
Ready for first MCTS iteration.
INITEOF

# Sub-instructions

## Instruction: Select
**Condition:** MEMORY state is "selecting"
**Action:** Descend the tree from root using UCT. At each non-leaf, choose the next child by the n=0 fast-path or by UCT formula (R44, R45). When a leaf is reached (no node has `parent_id == this id`), write the leaf id to `./scoped/cursor.md` and transition to `expanding` (R46).

    C=$(cat ./scoped/uct_c.md)
    CURRENT="n0"

    while true; do
      CHILDREN=$(awk -v P="$CURRENT" '/^---$/{id="";p=""} /^id:/{id=$2} /^parent_id:/{p=$2; if (p==P) print id}' ./scoped/tree.md)
      [ -z "$CHILDREN" ] && break

      # R45: leftmost unvisited (n == 0) — leftmost tiebreak
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
**Action:** Stage push-args via the Compose-partial-state primitive; emit `## Push operators/expand-workflow.md`.

    ID=$(cat ./scoped/cursor.md)
    mkdir -p ./scoped/staged
    compose_partial_state > ./scoped/staged/partial_state.md
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
    Pushed expand-workflow.md for $ID.
    ## Result
    Push queued.
    ## Push
    operators/expand-workflow.md
    ## Push-Args
    partial_state: |
    $PS
    task: |
    $TK
    EXP_EOF

The state value `expanding` is the returnState; on pop the shell sets state to `expanding_completed`, which `Expand-absorb` matches.

## Instruction: Expand-absorb
**Condition:** MEMORY state is "expanding_completed" and `## Children` is present in MEMORY
**Action:** Parse the spliced `## Children` block as 5 single-line workflow recipes (comma-separated operator names). For each recipe, allocate the next monotonic id, append a node block to `./scoped/tree.md` with `parent_id = cursor`, `depth = cursor_depth + 1`, `q: 0, n: 0, status: live`, and write the recipe verbatim to `./scoped/state-<new_id>.md`. Record the first (leftmost) newly created child id to `./scoped/chosen_child.md`. Drop `## Children`. Transition to `simulating`.

    CURSOR=$(cat ./scoped/cursor.md)
    CURSOR_DEPTH=$(awk -v X="$CURSOR" '/^---$/{ib=0;next} /^id:/{ib=($2==X)} ib && /^depth:/{print $2; exit}' ./scoped/tree.md)
    NEXT_DEPTH=$((CURSOR_DEPTH + 1))

    # Extract body of ## Children — each line is a workflow recipe (comma-separated operator names)
    awk '/^## Children$/{f=1; next} /^## [A-Z]/ && f {exit} f' ./MEMORY.md \
      | grep -v '^[[:space:]]*$' \
      | head -n 5 > ./scoped/staged/children.md

    WELL_FORMED=$(wc -l < ./scoped/staged/children.md | tr -d ' ')
    FIRST_NEW=""

    while IFS= read -r RECIPE; do
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
      printf '%s\n' "$RECIPE" > "./scoped/state-$NEW_ID.md"
      [ -z "$FIRST_NEW" ] && FIRST_NEW="$NEW_ID"
    done < ./scoped/staged/children.md

    if [ "$WELL_FORMED" -eq 0 ]; then
      # Zero children: mark cursor terminal_fail and re-enter selecting.
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
    - expand-workflow.md returned zero workflow children for cursor $CURSOR; check expand-workflow.md output format.
    ABSORB_FAIL_EOF
    else
      echo "$FIRST_NEW" > ./scoped/chosen_child.md

      MISSING=$((5 - WELL_FORMED))
      if [ "$MISSING" -gt 0 ]; then
        PQ=$(printf '\n## Pending Questions\n- expand-workflow.md returned %d workflow children (expected 5) for cursor %s.' "$WELL_FORMED" "$CURSOR")
      else
        PQ=""
      fi

      cat > ./MEMORY.md << ABSORB_OK_EOF
    ## State
    simulating
    ## Matched Instruction
    Expand-absorb
    ## Last Action
    Absorbed $WELL_FORMED workflow children for $CURSOR; chose $FIRST_NEW; routing to simulating.
    ## Result
    Children appended to scoped/tree.md.$PQ
    ABSORB_OK_EOF
    fi

## Instruction: Simulate-push
**Condition:** MEMORY state is "simulating"
**Action:** Read current_item_index and current_op_index from scoped sim files, determine the next operator to push from the chosen child's workflow recipe, compose push-args with task (current item's question) and prior_answer (previous operator's answer, empty for first op), emit `## Push` + `## Push-Args`.

    mkdir -p ./scoped/sim
    [ -f ./scoped/sim/current_item.md ] || echo "0" > ./scoped/sim/current_item.md
    [ -f ./scoped/sim/current_op.md ] || echo "0" > ./scoped/sim/current_op.md
    [ -f ./scoped/sim/scores.md ] || : > ./scoped/sim/scores.md
    [ -f ./scoped/sim/last_answer.md ] || : > ./scoped/sim/last_answer.md

    ITEM_IDX=$(cat ./scoped/sim/current_item.md)
    OP_IDX=$(cat ./scoped/sim/current_op.md)
    CHOSEN=$(cat ./scoped/chosen_child.md)
    RECIPE=$(cat "./scoped/state-${CHOSEN}.md")

    # Parse recipe operators (comma-separated, strip whitespace)
    IFS=',' read -ra OPS <<< "$RECIPE"
    NUM_OPS=${#OPS[@]}

    # Get the current operator name (strip surrounding whitespace)
    OP_NAME=$(echo "${OPS[$OP_IDX]}" | tr -d ' ')

    # Get the current item's question text from benchmark_items.md (JSONL, 1-indexed)
    ITEM_LINE=$(sed -n "$((ITEM_IDX + 1))p" ./scoped/benchmark_items.md)
    TASK_TEXT=$(echo "$ITEM_LINE" | python3 -c 'import sys,json; print(json.loads(sys.stdin.read())["question"])')

    # Get prior answer (empty string if first op of this item)
    if [ "$OP_IDX" -eq 0 ]; then
      PRIOR=""
    else
      PRIOR=$(cat ./scoped/sim/last_answer.md)
    fi

    # Indent task and prior for YAML block scalar (two-space indent)
    TASK_INDENTED=$(echo "$TASK_TEXT" | sed 's/^/  /')
    PRIOR_INDENTED=$(echo "$PRIOR" | sed 's/^/  /')

    cat > ./MEMORY.md << SIM_PUSH_EOF
## State
simulating
## Matched Instruction
Simulate-push
## Last Action
Pushing operators/${OP_NAME}.md for item ${ITEM_IDX}, op ${OP_IDX}.
## Result
Push queued.
## Push
operators/${OP_NAME}.md
## Push-Args
task: |
${TASK_INDENTED}
prior_answer: |
${PRIOR_INDENTED}
SIM_PUSH_EOF

## Instruction: Simulate-absorb
**Condition:** MEMORY state is "simulating_completed"
**Action:** Capture the `## Answer` returned from the just-popped operator, save it, advance op_index. If op_index reaches end of recipe, score the item (compare extracted integer to expected answer from benchmark_items.md), record score, advance item_index, reset op_index. If all 3 items done, transition to `evaluating`. Otherwise loop back to `simulating`.

    ITEM_IDX=$(cat ./scoped/sim/current_item.md)
    OP_IDX=$(cat ./scoped/sim/current_op.md)
    CHOSEN=$(cat ./scoped/chosen_child.md)
    RECIPE=$(cat "./scoped/state-${CHOSEN}.md")
    IFS=',' read -ra OPS <<< "$RECIPE"
    NUM_OPS=${#OPS[@]}
    NUM_ITEMS=3

    # Capture ## Answer from MEMORY (spliced in by the just-popped operator's ## Return)
    ANSWER=$(awk '/^## Answer$/{found=1;next} found && /^## /{exit} found{print}' ./MEMORY.md | sed '/^[[:space:]]*$/d')
    echo "$ANSWER" > ./scoped/sim/last_answer.md

    # Advance op_index
    OP_IDX=$((OP_IDX + 1))
    echo "$OP_IDX" > ./scoped/sim/current_op.md

    if [ "$OP_IDX" -ge "$NUM_OPS" ]; then
      # Item complete — score it
      ITEM_LINE=$(sed -n "$((ITEM_IDX + 1))p" ./scoped/benchmark_items.md)
      EXPECTED=$(echo "$ITEM_LINE" | python3 -c 'import sys,json; print(json.loads(sys.stdin.read())["answer"])')
      # Extract last integer from answer using [-+]?\d+ pattern
      ACTUAL=$(echo "$ANSWER" | grep -oE '[-+]?[0-9]+' | tail -n 1)
      if [ "$ACTUAL" = "$EXPECTED" ]; then
        SCORE=1
      else
        SCORE=0
      fi
      echo "$SCORE" >> ./scoped/sim/scores.md

      # Advance to next item, reset op index and last answer
      ITEM_IDX=$((ITEM_IDX + 1))
      echo "$ITEM_IDX" > ./scoped/sim/current_item.md
      echo "0" > ./scoped/sim/current_op.md
      : > ./scoped/sim/last_answer.md

      if [ "$ITEM_IDX" -ge "$NUM_ITEMS" ]; then
        # All 3 items done — transition to evaluating
        cat > ./MEMORY.md << EVALEOF
## State
evaluating
## Matched Instruction
Simulate-absorb
## Last Action
All ${NUM_ITEMS} items simulated for chosen child ${CHOSEN}. Per-item scores in scoped/sim/scores.md.
## Result
Ready for back-prop.
EVALEOF
        exit 0
      fi
    fi

    # Loop back: keep simulating (next op of current item, or first op of next item)
    cat > ./MEMORY.md << LOOPEOF
## State
simulating
## Matched Instruction
Simulate-absorb
## Last Action
Captured operator answer for item ${ITEM_IDX}, advancing simulation.
## Result
Continuing simulation.
LOOPEOF

## Instruction: Evaluate-absorb
**Condition:** MEMORY state is "evaluating"
**Action:** Compute reward (mean fraction passing across 3 items), back-prop along the chosen-child-to-root path, record in recent_scores, then terminate (perfect score or max iterations reached) or continue to the next MCTS iteration.

    # Read scores: one line per item, "0" or "1"
    NUM_PASS=$(awk '$1==1{c++} END{print c+0}' ./scoped/sim/scores.md)
    NUM_TOTAL=$(wc -l < ./scoped/sim/scores.md | tr -d ' ')
    REWARD=$(echo "scale=4; $NUM_PASS / $NUM_TOTAL" | bc -l)

    CHOSEN=$(cat ./scoped/chosen_child.md)
    RECIPE=$(cat "./scoped/state-${CHOSEN}.md")

    # Back-prop: walk from CHOSEN to root, increment q by REWARD and n by 1 for each node
    backprop "$CHOSEN" "$REWARD"

    # Record in recent_scores (capped to last 20)
    echo "${RECIPE}: ${REWARD}" >> ./scoped/recent_scores.md
    tail -n 20 ./scoped/recent_scores.md > ./scoped/recent_scores.md.tmp
    mv ./scoped/recent_scores.md.tmp ./scoped/recent_scores.md

    # Reset sim subdirectory for next iteration
    rm -rf ./scoped/sim

    # Termination check 1: reward == 1.0 (all items passed)
    IS_PERFECT=$(echo "$REWARD == 1.0" | bc -l)
    if [ "$IS_PERFECT" = "1" ]; then
      cat > ./MEMORY.md << SOLEOF
## State
done
## Matched Instruction
Evaluate-absorb
## Last Action
Found a workflow that scores 1.0 on all 3 benchmark items.
## Result
Halting (perfect score reached).
## Solution
Best workflow: ${RECIPE}
Reward: ${REWARD} (${NUM_PASS}/${NUM_TOTAL})
## Return
answer: |
  Best workflow: ${RECIPE} (mean reward ${REWARD} over ${NUM_TOTAL} items)
SOLEOF
      exit 0
    fi

    # Bump iteration counter
    ITER=$(cat ./scoped/iter_count.md)
    NEW_ITER=$((ITER + 1))
    echo "$NEW_ITER" > ./scoped/iter_count.md

    MAX=$(cat ./scoped/max_iterations.md)

    if [ "$NEW_ITER" -ge "$MAX" ]; then
      # Termination check 2: out of iterations — find best so far
      BEST_LINE=$(awk -F': ' '{print $2 " " $1}' ./scoped/recent_scores.md | sort -k1,1nr | head -n 1)
      BEST_SCORE=$(echo "$BEST_LINE" | awk '{print $1}')
      BEST_RECIPE=$(echo "$BEST_LINE" | cut -d' ' -f2-)
      cat > ./MEMORY.md << NOSOLEOF
## State
done
## Matched Instruction
Evaluate-absorb
## Last Action
Reached max_iterations ($MAX) without finding a 1.0 workflow.
## Result
Halting (max iterations reached).
## No Solution Found
Best workflow seen: ${BEST_RECIPE}
Best reward: ${BEST_SCORE}
Iterations run: ${NEW_ITER}
## Return
answer: |
  No perfect workflow found. Best: ${BEST_RECIPE} (mean reward ${BEST_SCORE} over 3 items, after ${NEW_ITER} iterations)
NOSOLEOF
      exit 0
    fi

    # Continue: next MCTS iteration
    cat > ./MEMORY.md << CONTEOF
## State
selecting
## Matched Instruction
Evaluate-absorb
## Last Action
Iteration $NEW_ITER complete (reward $REWARD); back-propped; selecting next leaf.
## Result
Continuing search.
CONTEOF
