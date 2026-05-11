#!/usr/bin/env bash
# fetch-gsm8k.sh — download the official GSM8K test split, normalize the
# answer field (extract integer after ####), take a deterministic 60-item
# slice (every 21st item across the ~1319-item test set), and write to
# interpreters/mas-papers/7-meta-framework/b-adas-lite/workspace/gsm8k.jsonl.
#
# Idempotent: re-running with the same upstream produces a byte-equal output.
# Network: requires curl. Fails closed if download or hash check fails.

set -euo pipefail

SELF_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SELF_DIR/.." && pwd)"

UPSTREAM_URL="https://raw.githubusercontent.com/openai/grade-school-math/master/grade_school_math/data/test.jsonl"
HASH_FILE="$SELF_DIR/fetch-gsm8k.sha256"
OUT_FILE="$REPO_ROOT/interpreters/mas-papers/7-meta-framework/b-adas-lite/workspace/gsm8k.jsonl"

TMPDIR=$(mktemp -d)
trap 'rm -rf "$TMPDIR"' EXIT

RAW="$TMPDIR/test.jsonl"
echo "Fetching GSM8K test split from upstream..."
if ! curl -fsSL "$UPSTREAM_URL" -o "$RAW"; then
  echo "ERROR: download failed" >&2
  exit 1
fi

ACTUAL_HASH=$(sha256sum "$RAW" | awk '{print $1}')
echo "Upstream SHA-256: $ACTUAL_HASH"

if [ -f "$HASH_FILE" ]; then
  EXPECTED_HASH=$(cat "$HASH_FILE" | tr -d '[:space:]')
  if [ "$ACTUAL_HASH" != "$EXPECTED_HASH" ]; then
    echo "ERROR: SHA-256 mismatch." >&2
    echo "  expected: $EXPECTED_HASH" >&2
    echo "  actual:   $ACTUAL_HASH"   >&2
    echo "If upstream changed intentionally, delete $HASH_FILE and re-run." >&2
    exit 1
  fi
  echo "Hash verified against $HASH_FILE."
else
  echo "$ACTUAL_HASH" > "$HASH_FILE"
  echo "WARNING: no committed hash; wrote $HASH_FILE. Commit it for reproducibility." >&2
fi

# Normalize: extract integer after #### in the answer field.
NORM="$TMPDIR/normalized.jsonl"
python3 - "$RAW" "$NORM" << 'PYEOF'
import json, sys, re

src, dst = sys.argv[1], sys.argv[2]
out = []
with open(src, encoding="utf-8") as f:
    for line in f:
        line = line.strip()
        if not line:
            continue
        obj = json.loads(line)
        ans_field = obj.get("answer", "")
        m = re.search(r"####\s*(-?[0-9]+)", ans_field)
        if not m:
            sys.stderr.write(f"WARN: no #### marker in answer: {ans_field[:60]!r}\n")
            continue
        out.append({"question": obj["question"], "answer": m.group(1)})

with open(dst, "w", encoding="utf-8") as f:
    for o in out:
        f.write(json.dumps(o, ensure_ascii=False) + "\n")

print(f"Normalized {len(out)} items.", file=sys.stderr)
PYEOF

TOTAL=$(wc -l < "$NORM" | tr -d ' ')
echo "Normalized total: $TOTAL items"

if [ "$TOTAL" -lt 1260 ]; then
  echo "ERROR: normalized fixture has $TOTAL items, expected ≥1260 for the every-21st slice." >&2
  exit 1
fi

# Take every 21st item starting at index 0 → 60 items at indices 0,21,42,...,1239.
mkdir -p "$(dirname "$OUT_FILE")"
awk 'NR == 1 || (NR - 1) % 21 == 0' "$NORM" | head -n 60 > "$OUT_FILE"

OUT_LINES=$(wc -l < "$OUT_FILE" | tr -d ' ')
if [ "$OUT_LINES" -ne 60 ]; then
  echo "ERROR: output has $OUT_LINES lines, expected 60." >&2
  exit 1
fi

echo "Wrote $OUT_FILE ($OUT_LINES items)."
