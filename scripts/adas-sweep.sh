#!/usr/bin/env bash
# adas-sweep.sh — run ADAS-lite N times sequentially.
#
# Creates instances/<prefix>-1, ..., instances/<prefix>-N using the
# b-adas-lite interpreter, then runs each in turn. Aborts on first failure
# (already-completed instances are preserved). After all runs succeed,
# prints the headline ## Answer line from each instance's OUTPUT.md and
# suggests running adas-aggregate.sh.
#
# Usage: scripts/adas-sweep.sh <prefix> <N>
#   <prefix>   alphanumeric + dashes; instance dir prefix
#   <N>        integer 1..20

set -euo pipefail

SELF_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SELF_DIR/.." && pwd)"

PREFIX="${1:-}"
N="${2:-}"

if [ -z "$PREFIX" ] || [ -z "$N" ]; then
  cat << EOF >&2
Usage: scripts/adas-sweep.sh <prefix> <N>
  <prefix>  instance dir prefix (alphanumeric and '-')
  <N>       integer 1..20

Example: scripts/adas-sweep.sh adas-run 3
EOF
  exit 1
fi

if ! [[ "$PREFIX" =~ ^[a-zA-Z0-9][a-zA-Z0-9-]*$ ]]; then
  echo "ERROR: prefix '${PREFIX}' must be alphanumeric or '-' (cannot start with -)." >&2
  exit 1
fi

if ! [[ "$N" =~ ^[0-9]+$ ]] || [ "$N" -lt 1 ] || [ "$N" -gt 20 ]; then
  echo "ERROR: N='${N}' must be an integer between 1 and 20." >&2
  exit 1
fi

cd "$REPO_ROOT"

# Pre-flight: refuse to clobber any existing instance dir.
for i in $(seq 1 "$N"); do
  INSTANCE="${PREFIX}-${i}"
  if [ -d "instances/${INSTANCE}" ]; then
    echo "ERROR: instance dir 'instances/${INSTANCE}' already exists; refusing to clobber." >&2
    echo "Either delete it or pick a different prefix." >&2
    exit 1
  fi
done

# Run each.
for i in $(seq 1 "$N"); do
  INSTANCE="${PREFIX}-${i}"
  echo "=== Run ${i}/${N}: instances/${INSTANCE} ==="
  ./new-instance.sh interpreters/mas-papers/7-meta-framework/b-adas-lite "$INSTANCE"
  if [ -f "${REPO_ROOT}/.env" ]; then
    cp "${REPO_ROOT}/.env" "instances/${INSTANCE}/.env"
    echo "  Copied root .env to instances/${INSTANCE}/.env"
  fi
  if ! "instances/${INSTANCE}/run.sh"; then
    echo "ERROR: run ${i} failed (instances/${INSTANCE}). Aborting sweep." >&2
    echo "Already-completed instances are preserved on disk." >&2
    exit 1
  fi
done

echo ""
echo "=== Sweep complete (${N} runs) ==="
for i in $(seq 1 "$N"); do
  INSTANCE="${PREFIX}-${i}"
  OUTPUT="instances/${INSTANCE}/OUTPUT.md"
  if [ -f "$OUTPUT" ]; then
    HEADLINE=$(awk '/^Best agent \(held-out\):/{print; exit}' "$OUTPUT")
    [ -z "$HEADLINE" ] && HEADLINE="(no headline; check ${OUTPUT})"
    echo "  ${INSTANCE}: ${HEADLINE}"
  else
    echo "  ${INSTANCE}: (OUTPUT.md missing)"
  fi
done
echo ""
echo "Run 'scripts/adas-aggregate.sh ${PREFIX}' to aggregate the results."
