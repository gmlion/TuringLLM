#!/usr/bin/env bash
# Finalize-entry: append archive entry from a completed test run, wipe sim/,
# advance iter_count if propose phase, halt check (max_iterations only —
# Phase-8.1 dropped halt-on-1.0 so the search runs to budget regardless).
# On halt, transition to holdout_init (NOT finalizing) so the winner gets a
# held-out evaluation pass before OUTPUT.md is written.

set -euo pipefail
SELF_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
. "$SELF_DIR/common.sh"

PHASE=$(cat ./scoped/phase.md)
LABEL=$(cat ./scoped/candidate_label.md)
CAND_PATH=$(cat ./scoped/candidate_path.md)
NN=$(next_archive_nn)

# Read per-item scores
PER_ITEM=$(paste -sd, ./scoped/sim/scores.md)
NUM_PASS=$(awk '$1==1{c++} END{print c+0}' ./scoped/sim/scores.md)
NUM_TOTAL=$(wc -l < ./scoped/sim/scores.md | tr -d ' ')
SCORE=$(python3 -c "print(f'{${NUM_PASS} / ${NUM_TOTAL}:.4f}')")

# Read note (may be absent on perfect score)
NOTE=""
if [ -f ./scoped/sim/note.md ]; then
  NOTE=$(cat ./scoped/sim/note.md)
fi

# Resolve candidate path to a filesystem-readable path (instance-root-relative
# means we read it via ../../).
READ_PATH="../../${CAND_PATH}"

archive_write "$NN" "$LABEL" "$PHASE" "$SCORE" "$NUM_PASS" "$NUM_TOTAL" "$PER_ITEM" "false" "$NOTE" "$READ_PATH"
recent_scores_append "$LABEL" "$SCORE"

rm -rf ./scoped/sim

# Advance iter_count only in propose phase.
if [ "$PHASE" = "propose" ]; then
  ITER=$(cat ./scoped/iter_count.md)
  echo "$((ITER + 1))" > ./scoped/iter_count.md
fi

# Halt check (max_iterations only — perfect-score early halt was removed in
# Phase 8.1 so the proposer keeps exploring even after a 1.0 hits).
ITER_NOW=$(cat ./scoped/iter_count.md)
MAX=$(cat ./scoped/max_iterations.md)

if [ "$PHASE" = "propose" ] && [ "$ITER_NOW" -ge "$MAX" ]; then
  cat > ./MEMORY.md << EOF
## State
holdout_init
## Matched Instruction
Finalize-entry
## Last Action
Appended archive entry ${NN}-${LABEL} (score ${SCORE}); reached max_iterations (${MAX}).
## Result
Search complete; staging held-out evaluation of the winner.
EOF
  exit 0
fi

cat > ./MEMORY.md << EOF
## State
seeding_or_proposing
## Matched Instruction
Finalize-entry
## Last Action
Appended archive entry ${NN}-${LABEL} (score ${SCORE}).
## Result
Continuing search.
EOF
