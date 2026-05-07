#!/usr/bin/env bash
# Initialize: copy PROGRAM, sample 3 fixture items deterministically, seed the
# tree with root n0 (empty workflow), set constants. Transition MEMORY to
# "init_scorer_pending" so the LLM writes a per-program scorer next.

set -euo pipefail

mkdir -p ./scoped

cp ../../PROGRAM.md ./scoped/task.md

echo "10"           > ./scoped/max_iterations.md
echo "1.41421356"   > ./scoped/uct_c.md
echo "0"            > ./scoped/iter_count.md

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
if [ "$TOTAL" -lt 3 ]; then
  cat > ./MEMORY.md << EOF
## State
waiting_for_user
## Matched Instruction
Initialize
## Last Action
Fixture too small.
## Result
Need at least 3 items in the fixture.

## Pending Questions
- Fixture has fewer than 3 items.
EOF
  exit 0
fi

MID=$((TOTAL / 2))
{
  sed -n '1p' "$FIXTURE"
  sed -n "${MID}p" "$FIXTURE"
  sed -n "${TOTAL}p" "$FIXTURE"
} > ./scoped/benchmark_items.md

cat > ./scoped/tree.md << 'EOF'
---
id: n0
parent_id: -
depth: 0
q: 0
n: 0
status: live
EOF

: > ./scoped/state-n0.md
: > ./scoped/recent_scores.md

cat > ./MEMORY.md << EOF
## State
init_scorer_pending
## Matched Instruction
Initialize
## Last Action
Loaded PROGRAM, sampled 3 benchmark items deterministically (1st, middle, last), seeded root n0 (empty workflow).
## Result
Ready for the LLM to write the per-program scorer at ./scoped/scorer.sh.
EOF
