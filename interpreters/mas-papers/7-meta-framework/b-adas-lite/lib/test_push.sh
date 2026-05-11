#!/usr/bin/env bash
# Test-push: push the candidate operator for the current benchmark item with
# task=question, prior_answer="" push-args. Increment per-item cycle counter
# and warn if it exceeds the budget (no force-pop in v1).

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
test_pending
## Matched Instruction
Test-push
## Last Action
Pushing ${CAND_PATH} (label ${CAND_LABEL}) for item ${ITEM_IDX}.${WARN}
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
