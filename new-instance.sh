#!/usr/bin/env bash
set -euo pipefail

if [ -z "${1:-}" ]; then
  echo "Usage: ./new-instance.sh <name>"
  exit 1
fi

NAME="$1"
DIR="instances/$NAME"

if [ -d "$DIR" ]; then
  echo "Error: instance '$NAME' already exists at $DIR"
  exit 1
fi

mkdir -p "$DIR"

cat > "$DIR/INSTRUCTIONS.md" << 'EOF'
# Goal
(describe the goal here)

## Instruction: Initialize
**Condition:** MEMORY state is "empty"
**Action:** Set MEMORY state to "started". Plan the first concrete step and add it as a new instruction.

## Instruction: Finish
**Condition:** MEMORY state is "done"
**Action:** Call halt with a summary of what was accomplished.
EOF

cat > "$DIR/MEMORY.md" << 'EOF'
## State
empty
EOF

cat > "$DIR/run.sh" << 'RUNEOF'
#!/usr/bin/env bash
set -euo pipefail

INSTANCE_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$INSTANCE_DIR/../.." && pwd)"
KEY_FILE="$INSTANCE_DIR/.api_key"

if [ -z "${ANTHROPIC_API_KEY:-}" ]; then
  if [ -f "$KEY_FILE" ]; then
    ANTHROPIC_API_KEY="$(cat "$KEY_FILE")"
  else
    read -rsp "ANTHROPIC_API_KEY: " ANTHROPIC_API_KEY
    echo
    echo "$ANTHROPIC_API_KEY" > "$KEY_FILE"
    chmod 600 "$KEY_FILE"
  fi
  export ANTHROPIC_API_KEY
fi

cd "$INSTANCE_DIR"
node "$PROJECT_ROOT/dist/main.js"
RUNEOF

chmod +x "$DIR/run.sh"

echo "Instance '$NAME' created at $DIR/"
echo "  1. Edit $DIR/INSTRUCTIONS.md with your program"
echo "  2. Run:  $DIR/run.sh"
