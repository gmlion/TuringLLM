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

(Future tasks T28-T34 add: tree-ledger primitives, Compose-partial-state, Select, Expand-push, Expand-absorb, Simulate-push, Simulate-absorb, Evaluate-absorb, termination, etc.)
