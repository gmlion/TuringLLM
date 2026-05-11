#!/usr/bin/env bash
# Record-invalid: a structurally malformed candidate (or empty operator_content
# from the proposer). Append archive entry with score 0 and the failure note
# stored at ./scoped/sim/note.md by propose_absorb.sh, then advance and halt-check.

set -euo pipefail
SELF_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
. "$SELF_DIR/common.sh"

PHASE=$(cat ./scoped/phase.md)
LABEL=$(cat ./scoped/candidate_label.md)
CAND_PATH=$(cat ./scoped/candidate_path.md)
NN=$(next_archive_nn)

NOTE="No failure note."
if [ -f ./scoped/sim/note.md ]; then
  NOTE=$(cat ./scoped/sim/note.md)
fi

READ_PATH="../../${CAND_PATH}"

# items_total may have been wiped if record_invalid is called after sim/ was
# reset; fall back to the search-set size.
ITEMS_TOTAL=$(cat ./scoped/sim/items_total.md 2>/dev/null \
              || wc -l < ./scoped/benchmark_items.md | tr -d ' ')

archive_write "$NN" "$LABEL" "$PHASE" "0.0000" "0" "$ITEMS_TOTAL" "-" "true" "$NOTE" "$READ_PATH"
recent_scores_append "$LABEL" "0.0000 (malformed)"

rm -rf ./scoped/sim

# Advance iter_count only in propose phase.
if [ "$PHASE" = "propose" ]; then
  ITER=$(cat ./scoped/iter_count.md)
  echo "$((ITER + 1))" > ./scoped/iter_count.md
fi

ITER_NOW=$(cat ./scoped/iter_count.md)
MAX=$(cat ./scoped/max_iterations.md)

if [ "$PHASE" = "propose" ] && [ "$ITER_NOW" -ge "$MAX" ]; then
  cat > ./MEMORY.md << EOF
## State
holdout_init
## Matched Instruction
Record-invalid
## Last Action
Recorded malformed candidate ${NN}-${LABEL}; reached max_iterations (${MAX}).
## Result
Search complete; staging held-out evaluation of the winner.
EOF
  exit 0
fi

cat > ./MEMORY.md << EOF
## State
seeding_or_proposing
## Matched Instruction
Record-invalid
## Last Action
Recorded malformed candidate ${NN}-${LABEL} (score 0).
## Result
Continuing search.
EOF
