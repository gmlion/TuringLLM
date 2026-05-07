#!/usr/bin/env bash
# Expand-absorb: parse the spliced ## Children block, allocate child nodes,
# write per-node state files, record the leftmost as chosen_child, transition
# to "simulating". On zero children, mark cursor terminal_fail and re-enter
# selecting.

set -euo pipefail
SELF_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
. "$SELF_DIR/common.sh"

CURSOR=$(cat ./scoped/cursor.md)
CURSOR_DEPTH=$(node_field "$CURSOR" depth)
NEXT_DEPTH=$((CURSOR_DEPTH + 1))

mkdir -p ./scoped/staged
awk '/^## Children$/{f=1; next} /^## [A-Z]/ && f {exit} f' ./MEMORY.md \
  | grep -v '^[[:space:]]*$' \
  | head -n 5 > ./scoped/staged/children.md

WELL_FORMED=$(wc -l < ./scoped/staged/children.md | tr -d ' ')
FIRST_NEW=""

while IFS= read -r RECIPE; do
  NEW_ID=$(append_node "$CURSOR" "$NEXT_DEPTH")
  printf '%s\n' "$RECIPE" > "./scoped/state-$NEW_ID.md"
  [ -z "$FIRST_NEW" ] && FIRST_NEW="$NEW_ID"
done < ./scoped/staged/children.md

if [ "$WELL_FORMED" -eq 0 ]; then
  node_set "$CURSOR" status terminal_fail
  cat > ./MEMORY.md << EOF
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
EOF
  exit 0
fi

echo "$FIRST_NEW" > ./scoped/chosen_child.md
MISSING=$((5 - WELL_FORMED))
PQ=""
if [ "$MISSING" -gt 0 ]; then
  PQ=$(printf '\n## Pending Questions\n- expand-workflow.md returned %d workflow children (expected 5) for cursor %s.' "$WELL_FORMED" "$CURSOR")
fi

cat > ./MEMORY.md << EOF
## State
simulating
## Matched Instruction
Expand-absorb
## Last Action
Absorbed $WELL_FORMED workflow children for $CURSOR; chose $FIRST_NEW; routing to simulating.
## Result
Children appended to scoped/tree.md.$PQ
EOF
