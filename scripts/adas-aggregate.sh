#!/usr/bin/env bash
# adas-aggregate.sh — read instances/<prefix>-*/OUTPUT.md, parse headline
# holdout and search scores, compute mean ± stdev, emit a markdown report
# to stdout AND <prefix>-aggregate.md at the repo root.
#
# Usage: scripts/adas-aggregate.sh <prefix>

set -euo pipefail

SELF_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SELF_DIR/.." && pwd)"

PREFIX="${1:-}"
if [ -z "$PREFIX" ]; then
  echo "Usage: scripts/adas-aggregate.sh <prefix>" >&2
  exit 1
fi

cd "$REPO_ROOT"

# Glob instance OUTPUT.md files; sort by run index (numeric).
mapfile -t OUTPUTS < <(ls -d instances/"${PREFIX}"-*/ 2>/dev/null \
  | awk -v P="$PREFIX" -F'/' '{n=$2; gsub("^"P"-","",n); print n " " $0"OUTPUT.md"}' \
  | sort -n \
  | awk '{print $2}')

if [ "${#OUTPUTS[@]}" -eq 0 ]; then
  echo "ERROR: no instances found for prefix '${PREFIX}' (looked at instances/${PREFIX}-*/)." >&2
  exit 1
fi

# Parse each OUTPUT.md.
TMP=$(mktemp)
for f in "${OUTPUTS[@]}"; do
  if [ ! -f "$f" ]; then
    echo "ERROR: $f missing." >&2
    exit 1
  fi
  INSTANCE=$(echo "$f" | awk -F'/' '{print $2}')
  HOLDOUT_LINE=$(awk '/^Best agent \(held-out\):/{print; exit}' "$f")
  SEARCH_LINE=$(awk '/^Best agent \(search\):/{print; exit}'   "$f")
  if [ -z "$HOLDOUT_LINE" ] || [ -z "$SEARCH_LINE" ]; then
    echo "ERROR: $f does not contain expected headline lines." >&2
    rm -f "$TMP"
    exit 1
  fi
  HOLDOUT_LABEL=$(echo "$HOLDOUT_LINE" | sed -E 's/^Best agent \(held-out\):\s*([A-Za-z0-9_-]+).*/\1/')
  HOLDOUT_SCORE=$(echo "$HOLDOUT_LINE" | sed -E 's/^Best agent \(held-out\):\s*[A-Za-z0-9_-]+\s+([0-9.]+).*/\1/')
  SEARCH_LABEL=$( echo "$SEARCH_LINE"  | sed -E 's/^Best agent \(search\):\s*([A-Za-z0-9_-]+).*/\1/')
  SEARCH_SCORE=$( echo "$SEARCH_LINE"  | sed -E 's/^Best agent \(search\):\s*[A-Za-z0-9_-]+\s+([0-9.]+).*/\1/')
  echo "${INSTANCE} ${HOLDOUT_LABEL} ${HOLDOUT_SCORE} ${SEARCH_SCORE}" >> "$TMP"
done

N_RUNS=$(wc -l < "$TMP" | tr -d ' ')

REPORT="${PREFIX}-aggregate.md"

# Build report via inline python for stats; emit to both stdout and file.
python3 - "$TMP" "$N_RUNS" "$PREFIX" "$REPORT" << 'PYEOF'
import sys, statistics, os
src, n_str, prefix, report_path = sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4]
n = int(n_str)
rows = []
with open(src) as f:
    for line in f:
        parts = line.strip().split()
        if len(parts) < 4:
            continue
        instance, label, ho, se = parts[0], parts[1], float(parts[2]), float(parts[3])
        rows.append((instance, label, ho, se, se - ho))

ho_scores = [r[2] for r in rows]
se_scores = [r[3] for r in rows]
overfits  = [r[4] for r in rows]

ho_mean = statistics.mean(ho_scores)
se_mean = statistics.mean(se_scores)
of_mean = statistics.mean(overfits)
ho_std = statistics.pstdev(ho_scores) if n > 1 else 0.0
se_std = statistics.pstdev(se_scores) if n > 1 else 0.0

# Winner histogram.
winners = {}
for r in rows:
    winners[r[1]] = winners.get(r[1], 0) + 1

lines = []
lines.append(f"# ADAS sweep aggregate: {prefix} (N={n})")
lines.append("")
lines.append("## Per-run results")
lines.append("")
lines.append("| Run | Winner | Search | Holdout | Overfit |")
lines.append("|-----|--------|--------|---------|---------|")
for instance, label, ho, se, of in rows:
    lines.append(f"| {instance} | {label} | {se:.4f} | {ho:.4f} | {of:+.4f} |")
lines.append("")
lines.append(f"## Aggregates (N={n})")
lines.append("")
lines.append(f"- Holdout: mean {ho_mean:.4f}, stdev {ho_std:.4f}")
lines.append(f"- Search:  mean {se_mean:.4f}, stdev {se_std:.4f}")
lines.append(f"- Mean overfit (search - holdout): {of_mean:+.4f}")
lines.append("")
lines.append("## Winners")
for label, count in sorted(winners.items(), key=lambda x: (-x[1], x[0])):
    lines.append(f"- {label} × {count} run{'s' if count > 1 else ''}")

report = "\n".join(lines) + "\n"
sys.stdout.write(report)
with open(report_path, "w", encoding="utf-8") as out:
    out.write(report)

sys.stderr.write(f"\nWrote {report_path}\n")
PYEOF

rm -f "$TMP"
