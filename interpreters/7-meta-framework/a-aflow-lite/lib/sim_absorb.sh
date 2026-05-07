#!/usr/bin/env bash
# Simulate-absorb: capture the just-popped operator's ## Answer, advance
# op_index. If recipe exhausted for the current item, score the item via
# ./scoped/scorer.sh, advance item_index. If all 3 items done, transition to
# evaluating; otherwise loop back to simulating.

set -euo pipefail
SELF_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
. "$SELF_DIR/common.sh"

ITEM_IDX=$(cat ./scoped/sim/current_item.md)
OP_IDX=$(cat ./scoped/sim/current_op.md)
CHOSEN=$(cat ./scoped/chosen_child.md)
RECIPE=$(cat "./scoped/state-${CHOSEN}.md")
IFS=',' read -ra OPS <<< "$RECIPE"
NUM_OPS=${#OPS[@]}
NUM_ITEMS=3

# Capture ## Answer (spliced from the popped operator's ## Return).
ANSWER=$(awk '/^## Answer$/{found=1;next} found && /^## /{exit} found{print}' ./MEMORY.md | sed '/^[[:space:]]*$/d')
printf '%s\n' "$ANSWER" > ./scoped/sim/last_answer.md

OP_IDX=$((OP_IDX + 1))
echo "$OP_IDX" > ./scoped/sim/current_op.md

if [ "$OP_IDX" -ge "$NUM_OPS" ]; then
  ITEM_LINE=$(sed -n "$((ITEM_IDX + 1))p" ./scoped/benchmark_items.md)
  EXPECTED=$(echo "$ITEM_LINE" | python3 -c 'import sys,json; print(json.loads(sys.stdin.read())["answer"])')

  # Delegate scoring to the per-instance scorer the LLM wrote at Initialize.
  # Contract: stdin = answer text, $1 = expected (verbatim from the fixture);
  # stdout = "1" for pass, "0" for fail.
  SCORE=$(printf '%s\n' "$ANSWER" | bash ./scoped/scorer.sh "$EXPECTED")
  case "$SCORE" in
    0|1) ;;
    *) SCORE=0 ;;
  esac
  echo "$SCORE" >> ./scoped/sim/scores.md

  ITEM_IDX=$((ITEM_IDX + 1))
  echo "$ITEM_IDX" > ./scoped/sim/current_item.md
  echo "0" > ./scoped/sim/current_op.md
  : > ./scoped/sim/last_answer.md

  if [ "$ITEM_IDX" -ge "$NUM_ITEMS" ]; then
    cat > ./MEMORY.md << EOF
## State
evaluating
## Matched Instruction
Simulate-absorb
## Last Action
All ${NUM_ITEMS} items simulated for chosen child ${CHOSEN}. Per-item scores in scoped/sim/scores.md.
## Result
Ready for back-prop.
EOF
    exit 0
  fi
fi

cat > ./MEMORY.md << EOF
## State
simulating
## Matched Instruction
Simulate-absorb
## Last Action
Captured operator answer for item ${ITEM_IDX}, advancing simulation.
## Result
Continuing simulation.
EOF
