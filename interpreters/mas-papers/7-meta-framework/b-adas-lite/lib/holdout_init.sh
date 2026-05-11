#!/usr/bin/env bash
# Holdout-init: pick the search-winner from the archive (max score, tie-break
# lowest NN), derive its candidate path from the label, write winner.md,
# stage the candidate for the holdout test loop (sim/items_source pointed at
# holdout_items.md). Transition to holdout_pending.

set -euo pipefail
SELF_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
. "$SELF_DIR/common.sh"

ARCHIVE_DIR=./scoped/archive

if [ "$(archive_count)" -eq 0 ]; then
  cat > ./MEMORY.md << EOF
## State
finalizing
## Matched Instruction
Holdout-init
## Last Action
Archive is empty; nothing to evaluate on holdout.
## Result
Skipping holdout step; emitting OUTPUT directly.
EOF
  exit 0
fi

# Walk archive in order; pick max-score, tie-break by lowest entry NN.
BEST_NN=""
BEST_LABEL=""
BEST_SCORE="-1"
for f in $(ls "$ARCHIVE_DIR" | sort); do
  full="$ARCHIVE_DIR/$f"
  ENTRY=$(awk -F': ' '/^entry:/{print $2; exit}' "$full" | tr -d ' ')
  LABEL=$(awk -F': ' '/^label:/{print $2; exit}' "$full" | tr -d ' ')
  SCORE=$(awk -F': ' '/^score:/{print $2; exit}' "$full" | tr -d ' ')
  CMP=$(python3 -c "print(1 if ${SCORE} > ${BEST_SCORE} else 0)")
  if [ "$CMP" = "1" ]; then
    BEST_NN="$ENTRY"
    BEST_LABEL="$LABEL"
    BEST_SCORE="$SCORE"
  fi
done

# Derive candidate_path from label:
#   seed-<name>      -> operators/<name>.md
#   proposed-<NN>    -> proposed/proposed-<NN>.md
case "$BEST_LABEL" in
  seed-*)
    SEED_NAME="${BEST_LABEL#seed-}"
    WINNER_PATH="operators/${SEED_NAME}.md"
    ;;
  proposed-*)
    PROP_NN="${BEST_LABEL#proposed-}"
    WINNER_PATH="proposed/proposed-${PROP_NN}.md"
    ;;
  *)
    cat > ./MEMORY.md << EOF
## State
finalizing
## Matched Instruction
Holdout-init
## Last Action
Could not derive candidate path from winner label '${BEST_LABEL}' (expected seed-* or proposed-*).
## Result
Skipping holdout step; emitting OUTPUT directly.
EOF
    exit 0
    ;;
esac

echo "$BEST_LABEL" > ./scoped/winner.md
echo "$WINNER_PATH" > ./scoped/winner_path.md

# Stage as the active candidate for the holdout test loop.
echo "$WINNER_PATH"  > ./scoped/candidate_path.md
echo "$BEST_LABEL"   > ./scoped/candidate_label.md

# Reset sim with holdout items source.
rm -rf ./scoped/sim
mkdir -p ./scoped/sim
echo "0" > ./scoped/sim/current_item.md
echo "0" > ./scoped/sim/cycles_used.md
: > ./scoped/sim/scores.md
: > ./scoped/sim/answers.md
echo "./scoped/holdout_items.md" > ./scoped/sim/items_source.md
wc -l < ./scoped/holdout_items.md | tr -d ' ' > ./scoped/sim/items_total.md

HO_TOTAL=$(cat ./scoped/sim/items_total.md)

cat > ./MEMORY.md << EOF
## State
holdout_pending
## Matched Instruction
Holdout-init
## Last Action
Search winner: ${BEST_LABEL} (search score ${BEST_SCORE}). Staged for held-out evaluation on ${HO_TOTAL} items.
## Result
Holdout test loop starting.
EOF
