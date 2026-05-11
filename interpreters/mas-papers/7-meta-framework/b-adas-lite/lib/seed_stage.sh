#!/usr/bin/env bash
# Seed-stage: decide whether the next archive entry comes from a base seed
# operator (seed phase) or from the LLM proposer (propose phase). Stage the
# next candidate and transition MEMORY accordingly.

set -euo pipefail
SELF_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
. "$SELF_DIR/common.sh"

mkdir -p ./scoped/sim
PHASE=$(cat ./scoped/phase.md)
SEED_IDX=$(cat ./scoped/seed_idx.md)
SEED_TOTAL=$(wc -l < ./scoped/seed_queue.md | tr -d ' ')

# Reset per-candidate sim state. Points the test loop at the search set.
reset_sim() {
  rm -rf ./scoped/sim
  mkdir -p ./scoped/sim
  echo "0" > ./scoped/sim/current_item.md
  echo "0" > ./scoped/sim/cycles_used.md
  : > ./scoped/sim/scores.md
  : > ./scoped/sim/answers.md
  echo "./scoped/benchmark_items.md" > ./scoped/sim/items_source.md
  wc -l < ./scoped/benchmark_items.md | tr -d ' ' > ./scoped/sim/items_total.md
}

if [ "$PHASE" = "seed" ] && [ "$SEED_IDX" -lt "$SEED_TOTAL" ]; then
  # Pick next seed (seed_queue.md is 1-indexed; SEED_IDX is 0-indexed).
  SEED_NAME=$(sed -n "$((SEED_IDX + 1))p" ./scoped/seed_queue.md | tr -d '[:space:]')
  # candidate_path is instance-root-relative (used directly in ## Push).
  echo "operators/${SEED_NAME}.md" > ./scoped/candidate_path.md
  echo "seed-${SEED_NAME}"         > ./scoped/candidate_label.md
  echo "$((SEED_IDX + 1))"           > ./scoped/seed_idx.md
  reset_sim
  cat > ./MEMORY.md << EOF
## State
test_pending
## Matched Instruction
Stage-next
## Last Action
Staged seed candidate ${SEED_NAME} ($((SEED_IDX + 1))/${SEED_TOTAL}).
## Result
Ready to test seed-${SEED_NAME} on the search set.
EOF
  exit 0
fi

if [ "$PHASE" = "seed" ]; then
  # All seeds done; flip to propose phase.
  echo "propose" > ./scoped/phase.md
  cat > ./MEMORY.md << EOF
## State
propose_pending
## Matched Instruction
Stage-next
## Last Action
All ${SEED_TOTAL} seed candidates processed; transitioning to propose phase.
## Result
Ready to invoke the proposer.
EOF
  exit 0
fi

# phase == propose
cat > ./MEMORY.md << EOF
## State
propose_pending
## Matched Instruction
Stage-next
## Last Action
Continuing in propose phase.
## Result
Ready to invoke the proposer.
EOF
