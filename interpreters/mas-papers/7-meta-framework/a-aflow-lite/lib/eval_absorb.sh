#!/usr/bin/env bash
# Evaluate-absorb: compute mean reward over the just-completed item scores,
# back-prop along chosen-child-to-root, record in recent_scores, and either
# halt (perfect score or max iterations) or continue with selecting.

set -euo pipefail
SELF_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
. "$SELF_DIR/common.sh"

NUM_PASS=$(awk '$1==1{c++} END{print c+0}' ./scoped/sim/scores.md)
NUM_TOTAL=$(wc -l < ./scoped/sim/scores.md | tr -d ' ')

if [ "$NUM_TOTAL" -eq 0 ]; then
  cat > ./MEMORY.md << EOF
## State
waiting_for_user
## Matched Instruction
Evaluate-absorb
## Last Action
scores.md is empty; cannot compute reward.
## Result
Halting evaluation; need a human to inspect ./scoped/sim/.

## Pending Questions
- ./scoped/sim/scores.md was empty at evaluate time. Inspect the simulation trace and decide whether to retry or abort.
EOF
  exit 0
fi

REWARD=$(echo "scale=4; $NUM_PASS / $NUM_TOTAL" | bc -l)

CHOSEN=$(cat ./scoped/chosen_child.md)
RECIPE=$(cat "./scoped/state-${CHOSEN}.md")

backprop "$CHOSEN" "$REWARD"

echo "${RECIPE}: ${REWARD}" >> ./scoped/recent_scores.md
tail -n 20 ./scoped/recent_scores.md > ./scoped/recent_scores.md.tmp
mv ./scoped/recent_scores.md.tmp ./scoped/recent_scores.md

rm -rf ./scoped/sim

IS_PERFECT=$(echo "$REWARD == 1.0" | bc -l)
if [ "$IS_PERFECT" = "1" ]; then
  cat > ./MEMORY.md << EOF
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
EOF
  exit 0
fi

ITER=$(cat ./scoped/iter_count.md)
NEW_ITER=$((ITER + 1))
echo "$NEW_ITER" > ./scoped/iter_count.md

MAX=$(cat ./scoped/max_iterations.md)

if [ "$NEW_ITER" -ge "$MAX" ]; then
  BEST_LINE=$(awk -F': ' '{print $2 " " $1}' ./scoped/recent_scores.md | sort -k1,1nr | head -n 1)
  BEST_SCORE=$(echo "$BEST_LINE" | awk '{print $1}')
  BEST_RECIPE=$(echo "$BEST_LINE" | cut -d' ' -f2-)
  cat > ./MEMORY.md << EOF
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
EOF
  exit 0
fi

cat > ./MEMORY.md << EOF
## State
selecting
## Matched Instruction
Evaluate-absorb
## Last Action
Iteration $NEW_ITER complete (reward $REWARD); back-propped; selecting next leaf.
## Result
Continuing search.
EOF
