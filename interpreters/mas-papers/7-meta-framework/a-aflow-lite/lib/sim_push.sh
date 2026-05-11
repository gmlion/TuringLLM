#!/usr/bin/env bash
# Simulate-push: pick the next operator in the chosen child's recipe, compose
# task and prior_answer push-args from the current item and last answer,
# emit ## Push.

set -euo pipefail
SELF_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
. "$SELF_DIR/common.sh"

mkdir -p ./scoped/sim
[ -f ./scoped/sim/current_item.md ] || echo "0" > ./scoped/sim/current_item.md
[ -f ./scoped/sim/current_op.md ]   || echo "0" > ./scoped/sim/current_op.md
[ -f ./scoped/sim/scores.md ]       || : > ./scoped/sim/scores.md
[ -f ./scoped/sim/last_answer.md ]  || : > ./scoped/sim/last_answer.md

ITEM_IDX=$(cat ./scoped/sim/current_item.md)
OP_IDX=$(cat ./scoped/sim/current_op.md)
CHOSEN=$(cat ./scoped/chosen_child.md)
RECIPE=$(cat "./scoped/state-${CHOSEN}.md")

IFS=',' read -ra OPS <<< "$RECIPE"
OP_NAME=$(echo "${OPS[$OP_IDX]}" | tr -d ' ')

ITEM_LINE=$(sed -n "$((ITEM_IDX + 1))p" ./scoped/benchmark_items.md)
TASK_TEXT=$(echo "$ITEM_LINE" | python3 -c 'import sys,json; print(json.loads(sys.stdin.read())["question"])')

if [ "$OP_IDX" -eq 0 ]; then
  PRIOR=""
else
  PRIOR=$(cat ./scoped/sim/last_answer.md)
fi

TASK_INDENTED=$(printf '%s\n' "$TASK_TEXT" | indent2)
PRIOR_INDENTED=$(printf '%s\n' "$PRIOR" | indent2)

cat > ./MEMORY.md << EOF
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
program: |

task: |
${TASK_INDENTED}
prior_answer: |
${PRIOR_INDENTED}
EOF
