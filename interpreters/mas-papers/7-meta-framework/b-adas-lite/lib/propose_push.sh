#!/usr/bin/env bash
# Propose-push: serialize the archive (per-entry blocks with score + note +
# operator content), the benchmark sample (questions only), and the task
# (PROGRAM.md). Emit ## Push operators/propose-operator.md with three
# push-args.

set -euo pipefail
SELF_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
. "$SELF_DIR/common.sh"

ARCHIVE_DIR=./scoped/archive
COUNT=$(archive_count)
ITER=$(cat ./scoped/iter_count.md)
NN_PROP=$(printf '%02d' "$((ITER + 1))")
OUTPUT_PATH="proposed/proposed-${NN_PROP}.md"
mkdir -p ../../proposed

# Build archive serialization.
ARCHIVE_TXT=$(mktemp)
for f in $(ls "$ARCHIVE_DIR" | sort); do
  full="$ARCHIVE_DIR/$f"
  ENTRY=$(awk -F': ' '/^entry:/{print $2; exit}' "$full" | tr -d ' ')
  LABEL=$(awk -F': ' '/^label:/{print $2; exit}' "$full" | tr -d ' ')
  SCORE=$(awk -F': ' '/^score:/{print $2; exit}' "$full" | tr -d ' ')
  PER_ITEM=$(awk -F': ' '/^per_item_scores:/{print $2; exit}' "$full" | tr -d ' ')
  MALF=$(awk -F': ' '/^malformed:/{print $2; exit}' "$full" | tr -d ' ')
  NOTE=$(awk '/^## Failure note$/{found=1;next} found && /^## /{exit} found' "$full" | sed '/^[[:space:]]*$/d')
  CONTENT=$(awk '/^## Operator content$/{found=1;next} found' "$full" | sed '1{/^$/d;}')
  {
    echo "--- entry ${ENTRY} (${LABEL}, score ${SCORE}, per-item ${PER_ITEM}, malformed=${MALF}) ---"
    if [ -n "$NOTE" ]; then
      echo "Failure note: ${NOTE}"
    else
      echo "Failure note: (none)"
    fi
    echo "Operator content:"
    printf '%s\n' "$CONTENT" | indent2
    echo
  } >> "$ARCHIVE_TXT"
done

# Build benchmark_sample (questions only, no ground truth).
SAMPLE_TXT=$(mktemp)
for i in 0 1 2; do
  ITEM_LINE=$(sed -n "$((i + 1))p" ./scoped/benchmark_items.md)
  Q=$(echo "$ITEM_LINE" | python3 -c 'import sys,json; print(json.loads(sys.stdin.read())["question"])')
  echo "Item $((i + 1)):" >> "$SAMPLE_TXT"
  printf '%s\n' "$Q" | indent2 >> "$SAMPLE_TXT"
  echo >> "$SAMPLE_TXT"
done

ARCHIVE_INDENT=$(cat "$ARCHIVE_TXT" | indent2)
SAMPLE_INDENT=$(cat "$SAMPLE_TXT" | indent2)
TASK_INDENT=$(cat ./scoped/task.md | indent2)

cat > ./MEMORY.md << EOF
## State
propose_pending
## Matched Instruction
Propose-push
## Last Action
Pushing operators/propose-operator.md (archive size ${COUNT}, propose iter ${ITER}).
## Result
Push queued.
## Push
operators/propose-operator.md
## Push-Args
output_path: ${OUTPUT_PATH}
archive: |
${ARCHIVE_INDENT}
benchmark_sample: |
${SAMPLE_INDENT}
task: |
${TASK_INDENT}
EOF

rm -f "$ARCHIVE_TXT" "$SAMPLE_TXT"
