#!/usr/bin/env bash
# Initialize: copy PROGRAM, sample 3 fixture items deterministically, set
# constants, seed the queue with the 5 base operators, create the archive
# directory. Transition MEMORY to "init_scorer_pending" so the LLM writes a
# per-program scorer next.

set -euo pipefail
SELF_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
. "$SELF_DIR/common.sh"

mkdir -p ./scoped ./scoped/archive

cp ../../PROGRAM.md ./scoped/task.md

echo "10" > ./scoped/max_iterations.md
echo "50" > ./scoped/per_item_cycle_budget.md
echo "0"  > ./scoped/iter_count.md
echo "0"  > ./scoped/seed_idx.md
echo "seed" > ./scoped/phase.md
: > ./scoped/recent_scores.md

cat > ./scoped/seed_queue.md << 'EOF'
refine
reflexion
cove
plan-execute
debate
EOF

FIXTURE=../../workspace/gsm8k.jsonl
if [ ! -f "$FIXTURE" ]; then
  cat > ./MEMORY.md << EOF
## State
waiting_for_user
## Matched Instruction
Initialize
## Last Action
Fixture missing.
## Result
Cannot proceed without fixture.

## Pending Questions
- Fixture file workspace/gsm8k.jsonl is missing. Create the fixture or correct the path.
EOF
  exit 0
fi

TOTAL=$(wc -l < "$FIXTURE")
if [ "$TOTAL" -lt 60 ]; then
  cat > ./MEMORY.md << EOF
## State
waiting_for_user
## Matched Instruction
Initialize
## Last Action
Fixture too small (need ≥60 items for 30-search + 30-holdout split).
## Result
Need at least 60 items in the fixture. Run scripts/fetch-gsm8k.sh to populate it.

## Pending Questions
- Fixture workspace/gsm8k.jsonl has fewer than 60 items. Run scripts/fetch-gsm8k.sh from the repo root and re-launch.
EOF
  exit 0
fi

# Search set: items 1–30. Held-out set: items 31–60. Disjoint by construction.
sed -n '1,30p'  "$FIXTURE" > ./scoped/benchmark_items.md
sed -n '31,60p' "$FIXTURE" > ./scoped/holdout_items.md

cat > ./MEMORY.md << EOF
## State
init_scorer_pending
## Matched Instruction
Initialize
## Last Action
Loaded PROGRAM, sampled 30 search items + 30 held-out items from a 60-item fixture, seeded the archive queue with 5 base operators (refine, reflexion, cove, plan-execute, debate).
## Result
Ready for the LLM to write the per-program scorer at ./scoped/scorer.sh.
EOF
