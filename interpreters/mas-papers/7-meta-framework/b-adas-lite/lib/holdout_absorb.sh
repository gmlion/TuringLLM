#!/usr/bin/env bash
# Holdout-absorb: structurally near-twin of test_absorb.sh, but the terminal
# transition splices holdout_score/holdout_per_item into the winner's
# archive entry, writes ./scoped/holdout_summary.md, and goes to `finalizing`
# (NOT post_mortem_pending or finalize_entry — holdout doesn't loop and
# doesn't need a per-item post-mortem).

set -euo pipefail
SELF_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
. "$SELF_DIR/common.sh"

NUM_ITEMS=$(cat ./scoped/sim/items_total.md)
ITEMS_SRC=$(cat ./scoped/sim/items_source.md)
ITEM_IDX=$(cat ./scoped/sim/current_item.md)
WINNER=$(cat ./scoped/winner.md)

ANSWER=$(extract_answer)
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
holdout_pending
## Matched Instruction
Holdout-absorb
## Last Action
Captured holdout answer for item $((ITEM_IDX - 1)); advancing to item ${ITEM_IDX}.
## Result
Continuing holdout loop.
EOF
  exit 0
fi

# All holdout items done — score them.
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

HOLDOUT_SCORE=$(python3 -c "print(f'{${NUM_PASS} / ${NUM_ITEMS}:.4f}')")
HOLDOUT_PER_ITEM=$(paste -sd, ./scoped/sim/scores.md)

# Splice holdout fields into the winner's archive entry.
ENTRY_FILE=$(ls ./scoped/archive/*-${WINNER}.md 2>/dev/null | head -n 1)
if [ -z "$ENTRY_FILE" ] || [ ! -f "$ENTRY_FILE" ]; then
  cat > ./MEMORY.md << EOF
## State
finalizing
## Matched Instruction
Holdout-absorb
## Last Action
Computed holdout score ${HOLDOUT_SCORE} but could not locate winner archive entry for ${WINNER}.
## Result
Holdout summary written; emitting OUTPUT.
EOF
  echo "${WINNER}: ${HOLDOUT_SCORE} (${NUM_PASS}/${NUM_ITEMS})" > ./scoped/holdout_summary.md
  rm -rf ./scoped/sim
  exit 0
fi

splice_holdout_fields "$ENTRY_FILE" "$HOLDOUT_SCORE" "$HOLDOUT_PER_ITEM"

echo "${WINNER}: ${HOLDOUT_SCORE} (${NUM_PASS}/${NUM_ITEMS})" > ./scoped/holdout_summary.md

rm -rf ./scoped/sim

cat > ./MEMORY.md << EOF
## State
finalizing
## Matched Instruction
Holdout-absorb
## Last Action
Held-out evaluation complete: ${WINNER} scored ${HOLDOUT_SCORE} (${NUM_PASS}/${NUM_ITEMS}). Spliced holdout fields into archive entry.
## Result
Ready to emit OUTPUT.md.
EOF
