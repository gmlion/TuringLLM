#!/usr/bin/env bash
# Select: descend the MCTS tree from root using UCT, write the leaf id to
# ./scoped/cursor.md, transition MEMORY to "expanding".

set -euo pipefail
SELF_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
. "$SELF_DIR/common.sh"

C=$(cat ./scoped/uct_c.md)
CURRENT="n0"

while true; do
  CHILDREN=$(children_of "$CURRENT")
  [ -z "$CHILDREN" ] && break

  # Leftmost unvisited child wins (R45)
  UNVISITED=$(for ID in $CHILDREN; do
    N=$(node_field "$ID" n)
    [ "$N" = "0" ] && echo "$ID"
  done | sort | head -n 1)

  if [ -n "$UNVISITED" ]; then
    CURRENT="$UNVISITED"
    continue
  fi

  # UCT among visited children (R44)
  N_PARENT=$(node_field "$CURRENT" n)
  BEST_ID=""
  BEST_UCT=""
  for ID in $CHILDREN; do
    Q=$(node_field "$ID" q)
    N=$(node_field "$ID" n)
    UCT=$(echo "$Q/$N + $C * sqrt(l($N_PARENT)/$N)" | bc -l)
    if [ -z "$BEST_UCT" ] || [ "$(echo "$UCT > $BEST_UCT" | bc -l)" = "1" ]; then
      BEST_ID="$ID"
      BEST_UCT="$UCT"
    fi
  done
  CURRENT="$BEST_ID"
done

echo "$CURRENT" > ./scoped/cursor.md

cat > ./MEMORY.md << EOF
## State
expanding
## Matched Instruction
Select
## Last Action
Descended via UCT to leaf $CURRENT.
## Result
Cursor set; ready to expand.
EOF
