#!/usr/bin/env bash
# Expand-push: stage push-args (current workflow recipe + library + recent
# scores), emit ## Push for operators/expand-workflow.md.

set -euo pipefail
SELF_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
. "$SELF_DIR/common.sh"

mkdir -p ./scoped/staged
CURSOR=$(cat ./scoped/cursor.md)
CURRENT=$(cat "./scoped/state-${CURSOR}.md")
RECENT=$(tail -n 10 ./scoped/recent_scores.md 2>/dev/null || true)

cat > ./scoped/staged/partial_state.md << EOF
Current workflow recipe (the operator chain to extend; empty means the root):
${CURRENT}

Library of available operator names:
${LIBRARY}

Recent scores observed in this run (workflow: mean_reward over 3 items):
${RECENT}
EOF

cp ./scoped/task.md ./scoped/staged/task.md

PS_INDENTED=$(indent2 < ./scoped/staged/partial_state.md)
TK_INDENTED=$(indent2 < ./scoped/staged/task.md)

cat > ./MEMORY.md << EOF
## State
expanding
## Matched Instruction
Expand-push
## Last Action
Pushed expand-workflow.md for $CURSOR.
## Result
Push queued.
## Push
operators/expand-workflow.md
## Push-Args
partial_state: |
$PS_INDENTED
task: |
$TK_INDENTED
EOF
