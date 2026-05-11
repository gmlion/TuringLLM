#!/usr/bin/env bash
# Holdout-push: push the search-winner for the current holdout item.
# Structurally identical to test_push.sh except for state/matched-instruction
# strings; sim/items_source.md is already pointing at holdout_items.md
# (configured by holdout_init.sh) so the test-loop machinery is reused.

set -euo pipefail
SELF_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
. "$SELF_DIR/common.sh"

mkdir -p ./scoped/sim
[ -f ./scoped/sim/current_item.md ] || echo "0" > ./scoped/sim/current_item.md
[ -f ./scoped/sim/cycles_used.md ]  || echo "0" > ./scoped/sim/cycles_used.md

ITEM_IDX=$(cat ./scoped/sim/current_item.md)
CAND_PATH=$(cat ./scoped/candidate_path.md)
CAND_LABEL=$(cat ./scoped/candidate_label.md)
BUDGET=$(cat ./scoped/per_item_cycle_budget.md)

CYCLES=$(cat ./scoped/sim/cycles_used.md)
NEW_CYCLES=$((CYCLES + 1))
echo "$NEW_CYCLES" > ./scoped/sim/cycles_used.md

WARN=""
if [ "$NEW_CYCLES" -gt "$BUDGET" ]; then
  WARN=" [WARNING: cycle ${NEW_CYCLES} exceeds per-item budget ${BUDGET}]"
fi

ITEMS_SRC=$(cat ./scoped/sim/items_source.md)
ITEM_LINE=$(sed -n "$((ITEM_IDX + 1))p" "$ITEMS_SRC")
TASK_TEXT=$(echo "$ITEM_LINE" | python3 -c 'import sys,json; print(json.loads(sys.stdin.read())["question"])')

TASK_INDENTED=$(printf '%s\n' "$TASK_TEXT" | indent2)

cat > ./MEMORY.md << EOF
## State
holdout_pending
## Matched Instruction
Holdout-push
## Last Action
Pushing ${CAND_PATH} (winner ${CAND_LABEL}) for holdout item ${ITEM_IDX}.${WARN}
## Result
Push queued.
## Push
${CAND_PATH}
## Push-Args
program: |

task: |
${TASK_INDENTED}
prior_answer: |

EOF
