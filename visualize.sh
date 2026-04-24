#!/usr/bin/env bash
set -euo pipefail

INSTANCE="${1:-}"
PORT="${2:-8080}"

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

if [ -n "$INSTANCE" ]; then
  if [ ! -d "instances/$INSTANCE" ]; then
    echo "Error: instance 'instances/$INSTANCE' not found"
    exit 1
  fi
  URL="http://localhost:${PORT}/visualizer.html?instance=instances/${INSTANCE}"
  echo "Starting visualizer for instance '$INSTANCE'"
else
  URL="http://localhost:${PORT}/visualizer.html"
  echo "Starting visualizer (home page — pick an instance in the browser)"
fi
echo "  URL: $URL"
echo ""

(
  sleep 1
  if command -v xdg-open &>/dev/null; then xdg-open "$URL" 2>/dev/null
  elif command -v open &>/dev/null; then open "$URL"
  elif command -v wslview &>/dev/null; then wslview "$URL"
  else echo "  Open manually: $URL"
  fi
) &

PORT="$PORT" node dist/server.js
