#!/usr/bin/env bash
set -euo pipefail

INSTANCE="${1:-}"
PORT="${2:-8080}"

if [ -z "$INSTANCE" ]; then
  echo "Usage: ./visualize.sh <instance-name> [port]"
  echo ""
  echo "  instance-name   Name of the instance (e.g., test-drive-3)"
  echo "  port            HTTP port (default: 8080)"
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

if [ ! -d "instances/$INSTANCE" ]; then
  echo "Error: instance 'instances/$INSTANCE' not found"
  exit 1
fi

URL="http://localhost:${PORT}/visualizer.html?instance=instances/${INSTANCE}"

echo "Starting visualizer for instance '$INSTANCE'"
echo "  URL: $URL"
echo ""

# Open browser in background
(
  sleep 1
  if command -v xdg-open &>/dev/null; then
    xdg-open "$URL" 2>/dev/null
  elif command -v open &>/dev/null; then
    open "$URL"
  elif command -v wslview &>/dev/null; then
    wslview "$URL"
  else
    echo "  Open manually: $URL"
  fi
) &

PORT="$PORT" node dist/server.js
