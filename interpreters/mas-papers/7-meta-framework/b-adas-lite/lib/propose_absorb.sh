#!/usr/bin/env bash
# Propose-absorb: the proposer wrote the operator file directly to
# ../../proposed/proposed-NN.md (path agreed via the output_path push-arg).
# This script reads that file, validates structure, and transitions to
# test_pending or record_invalid. The MEMORY hand-off is small (status only)
# to avoid the spliceReturns-vs-markdown-headers conflict.

set -euo pipefail
SELF_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
. "$SELF_DIR/common.sh"

mkdir -p ./scoped/sim

ITER=$(cat ./scoped/iter_count.md)
NN_PROP=$(printf '%02d' "$((ITER + 1))")
TARGET="../../proposed/proposed-${NN_PROP}.md"

# Always set the candidate label/path so record_invalid can refer to them.
echo "proposed-${NN_PROP}"             > ./scoped/candidate_label.md
echo "proposed/proposed-${NN_PROP}.md" > ./scoped/candidate_path.md

# Branch: file missing or empty.
if [ ! -s "$TARGET" ]; then
  echo "Proposer did not produce a non-empty file at ${TARGET}." > ./scoped/sim/note.md
  cat > ./MEMORY.md << EOF
## State
record_invalid
## Matched Instruction
Propose-absorb
## Last Action
Proposer left ${TARGET} missing or empty for iteration ${NN_PROP}.
## Result
Routing to record_invalid.
EOF
  exit 0
fi

# Validate structure.
REASONS=()

if ! grep -q '^## Return' "$TARGET"; then
  REASONS+=("missing ## Return section")
fi

if ! grep -q '^## Instruction:' "$TARGET"; then
  REASONS+=("missing ## Instruction: heading")
fi

if ! grep -Eq 'state\s+is\s+"empty"' "$TARGET"; then
  REASONS+=("no instruction matches state \"empty\"")
fi

# Find unresolved {{...}} placeholders other than {{task}} and {{prior_answer}}.
BAD_PLACEHOLDERS=$(grep -oE '\{\{[a-zA-Z_][a-zA-Z0-9_]*\}\}' "$TARGET" \
  | sort -u \
  | grep -vxE '\{\{task\}\}|\{\{prior_answer\}\}' || true)
if [ -n "$BAD_PLACEHOLDERS" ]; then
  REASONS+=("unresolved placeholders: $(echo "$BAD_PLACEHOLDERS" | tr '\n' ' ')")
fi

if [ ${#REASONS[@]} -gt 0 ]; then
  printf '%s\n' "Structural validation failed: $(IFS='; '; echo "${REASONS[*]}")" > ./scoped/sim/note.md
  cat > ./MEMORY.md << EOF
## State
record_invalid
## Matched Instruction
Propose-absorb
## Last Action
Validated ${TARGET}; structural issues found.
## Result
Routing to record_invalid.
EOF
  exit 0
fi

# Valid — stage for testing on the search set.
rm -rf ./scoped/sim
mkdir -p ./scoped/sim
echo "0" > ./scoped/sim/current_item.md
echo "0" > ./scoped/sim/cycles_used.md
: > ./scoped/sim/scores.md
: > ./scoped/sim/answers.md
echo "./scoped/benchmark_items.md" > ./scoped/sim/items_source.md
wc -l < ./scoped/benchmark_items.md | tr -d ' ' > ./scoped/sim/items_total.md

cat > ./MEMORY.md << EOF
## State
test_pending
## Matched Instruction
Propose-absorb
## Last Action
Validated proposed-${NN_PROP} at ${TARGET}; ready to test on the search set.
## Result
Test loop starting.
EOF
