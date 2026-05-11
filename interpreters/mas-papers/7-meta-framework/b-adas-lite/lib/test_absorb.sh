#!/usr/bin/env bash
# Test-absorb: capture spliced ## Answer, append to sim/answers.md, advance
# item index. When all items done, score via scorer.sh, transition to
# post_mortem_pending (reward < 1.0) or finalize_entry (reward == 1.0).
# Item count and source come from sim/items_total.md and sim/items_source.md
# (set by seed_stage.sh / propose_absorb.sh / holdout_init.sh).

set -euo pipefail
SELF_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
. "$SELF_DIR/common.sh"

NUM_ITEMS=$(cat ./scoped/sim/items_total.md)
ITEMS_SRC=$(cat ./scoped/sim/items_source.md)
ITEM_IDX=$(cat ./scoped/sim/current_item.md)
CAND_LABEL=$(cat ./scoped/candidate_label.md)

ANSWER=$(extract_answer)
# Append answer as JSON line for post-mortem reading.
python3 -c '
import sys, json
item = int(sys.argv[1])
ans  = sys.stdin.read()
print(json.dumps({"item": item, "answer": ans}))
' "$ITEM_IDX" <<< "$ANSWER" >> ./scoped/sim/answers.md

ITEM_IDX=$((ITEM_IDX + 1))
echo "$ITEM_IDX" > ./scoped/sim/current_item.md
echo "0" > ./scoped/sim/cycles_used.md

if [ "$ITEM_IDX" -lt "$NUM_ITEMS" ]; then
  cat > ./MEMORY.md << EOF
## State
test_pending
## Matched Instruction
Test-absorb
## Last Action
Captured answer for item $((ITEM_IDX - 1)); advancing to item ${ITEM_IDX}.
## Result
Continuing test loop.
EOF
  exit 0
fi

# All items done — score them.
: > ./scoped/sim/scores.md
NUM_PASS=0
for i in $(seq 0 $((NUM_ITEMS - 1))); do
  ITEM_LINE=$(sed -n "$((i + 1))p" "$ITEMS_SRC")
  EXPECTED=$(echo "$ITEM_LINE" | python3 -c 'import sys,json; print(json.loads(sys.stdin.read())["answer"])')
  ITEM_ANS=$(awk -v I="$i" 'NR==I+1' ./scoped/sim/answers.md \
    | python3 -c 'import sys,json; print(json.loads(sys.stdin.read())["answer"])')
  SCORE=$(printf '%s\n' "$ITEM_ANS" | bash ./scoped/scorer.sh "$EXPECTED")
  case "$SCORE" in
    0|1) ;;
    *) SCORE=0 ;;
  esac
  echo "$SCORE" >> ./scoped/sim/scores.md
  NUM_PASS=$((NUM_PASS + SCORE))
done

REWARD=$(python3 -c "print(f'{${NUM_PASS} / ${NUM_ITEMS}:.4f}')")
IS_PERFECT=$([ "$NUM_PASS" -eq "$NUM_ITEMS" ] && echo 1 || echo 0)

if [ "$IS_PERFECT" = "1" ]; then
  cat > ./MEMORY.md << EOF
## State
finalize_entry
## Matched Instruction
Test-absorb
## Last Action
Candidate ${CAND_LABEL} scored ${NUM_PASS}/${NUM_ITEMS} (mean reward ${REWARD}).
## Result
Skipping post-mortem (perfect score).
EOF
else
  cat > ./MEMORY.md << EOF
## State
post_mortem_pending
## Matched Instruction
Test-absorb
## Last Action
Candidate ${CAND_LABEL} scored ${NUM_PASS}/${NUM_ITEMS} (mean reward ${REWARD}).
## Result
Ready for post-mortem note.
EOF
fi
