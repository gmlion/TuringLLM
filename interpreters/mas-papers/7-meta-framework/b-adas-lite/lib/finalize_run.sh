#!/usr/bin/env bash
# Finalize-run: scan archive, find best entry (max score, tie-break by NN),
# read holdout_summary.md (written by holdout_absorb.sh) for the headline
# held-out score, build per-entry summary, write ## Return answer block with
# both held-out and search headline lines + best operator content.

set -euo pipefail
SELF_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
. "$SELF_DIR/common.sh"

ARCHIVE_DIR=./scoped/archive
COUNT=$(archive_count)

if [ "$COUNT" -eq 0 ]; then
  cat > ./MEMORY.md << EOF
## State
done
## Matched Instruction
Finalize-run
## Last Action
Archive empty at finalize-run.
## Result
No candidates were tested.
## Return
answer: |
  No candidates were tested. Archive is empty.
EOF
  exit 0
fi

# Walk archive, parse front-matter, build per-entry summary lines.
SUMMARY=$(mktemp)
BEST_NN=""
BEST_SCORE="-1"
BEST_LABEL=""
BEST_FILE=""
BEST_PASSED=""
BEST_TOTAL=""

# Read holdout summary if present (written by holdout_absorb.sh).
HOLDOUT_LINE=""
HOLDOUT_LABEL=""
HOLDOUT_SCORE=""
HOLDOUT_PASSED=""
HOLDOUT_TOTAL=""
if [ -f ./scoped/holdout_summary.md ]; then
  HOLDOUT_LINE=$(cat ./scoped/holdout_summary.md)
  # Format: "<label>: <score> (<n>/<m>)"
  HOLDOUT_LABEL=$(echo "$HOLDOUT_LINE" | awk -F': ' '{print $1}')
  HOLDOUT_REST=$(echo "$HOLDOUT_LINE" | awk -F': ' '{print $2}')
  HOLDOUT_SCORE=$(echo "$HOLDOUT_REST" | awk '{print $1}')
  HOLDOUT_PASSED=$(echo "$HOLDOUT_REST" | sed -E 's/.*\(([0-9]+)\/([0-9]+)\).*/\1/')
  HOLDOUT_TOTAL=$(echo "$HOLDOUT_REST" | sed -E 's/.*\(([0-9]+)\/([0-9]+)\).*/\2/')
fi

for f in $(ls "$ARCHIVE_DIR" | sort); do
  full="$ARCHIVE_DIR/$f"
  ENTRY=$(awk -F': ' '/^entry:/{print $2; exit}' "$full" | tr -d ' ')
  LABEL=$(awk -F': ' '/^label:/{print $2; exit}' "$full" | tr -d ' ')
  SCORE=$(awk -F': ' '/^score:/{print $2; exit}' "$full" | tr -d ' ')
  PASSED=$(awk -F': ' '/^items_passed:/{print $2; exit}' "$full" | tr -d ' ')
  TOTAL=$(awk -F': ' '/^items_total:/{print $2; exit}' "$full" | tr -d ' ')
  MALF=$(awk -F': ' '/^malformed:/{print $2; exit}' "$full" | tr -d ' ')
  HS=$(awk -F': ' '/^holdout_score:/{print $2; exit}' "$full" | tr -d ' ')
  NOTE_LINE=$(awk '/^## Failure note$/{found=1;next} found && NF{print; exit}' "$full")
  if [ -z "$NOTE_LINE" ]; then NOTE_LINE="(no note)"; fi
  if [ "$MALF" = "true" ]; then NOTE_LINE="malformed — ${NOTE_LINE}"; fi
  if [ -n "$HS" ]; then
    echo "${ENTRY} ${LABEL}: ${SCORE} [HOLDOUT ${HS}] — ${NOTE_LINE}" >> "$SUMMARY"
  else
    echo "${ENTRY} ${LABEL}: ${SCORE} — ${NOTE_LINE}" >> "$SUMMARY"
  fi
  # Best-pick: max search score, tie-break by lowest entry NN.
  CMP=$(python3 -c "print(1 if ${SCORE} > ${BEST_SCORE} else 0)")
  if [ "$CMP" = "1" ]; then
    BEST_NN="$ENTRY"
    BEST_SCORE="$SCORE"
    BEST_LABEL="$LABEL"
    BEST_FILE="$full"
    BEST_PASSED="$PASSED"
    BEST_TOTAL="$TOTAL"
  fi
done

BEST_CONTENT=$(awk '/^## Operator content$/{found=1;next} found' "$BEST_FILE" | sed '1{/^$/d;}')
BEST_CONTENT_INDENT=$(printf '%s\n' "$BEST_CONTENT" | indent2)
SUMMARY_INDENT=$(cat "$SUMMARY" | indent2)

# Build the headline lines.
if [ -n "$HOLDOUT_SCORE" ]; then
  HEAD_HOLDOUT="Best agent (held-out): ${HOLDOUT_LABEL} ${HOLDOUT_SCORE} (${HOLDOUT_PASSED}/${HOLDOUT_TOTAL})"
else
  HEAD_HOLDOUT="Best agent (held-out): (no holdout evaluation)"
fi
HEAD_SEARCH="Best agent (search):   ${BEST_LABEL} ${BEST_SCORE} (${BEST_PASSED}/${BEST_TOTAL})"

cat > ./MEMORY.md << EOF
## State
done
## Matched Instruction
Finalize-run
## Last Action
Halted; emitting OUTPUT via ## Return.
## Result
Best entry (search): ${BEST_LABEL} (${BEST_SCORE}); held-out: ${HOLDOUT_SCORE:-n/a}.
## Return
answer: |
  ${HEAD_HOLDOUT}
  ${HEAD_SEARCH}

  Archive summary (${COUNT} entries; search-set scores; held-out score on winner only):
${SUMMARY_INDENT}

  Best operator content:
${BEST_CONTENT_INDENT}
EOF

rm -f "$SUMMARY"
