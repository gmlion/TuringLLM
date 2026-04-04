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

cat > "$DIR/PROGRAM.md" << 'EOF'
# Goal
(describe the goal here)

## Step 1: (first high-level step)
(describe what to do)

## Step 2: (second high-level step)
(describe what to do)
EOF

cat > "$DIR/INSTRUCTIONS.md" << 'INSTEOF'
# Strategy

These strategy instructions must be preserved at the top of INSTRUCTIONS.md every time it is rewritten. They are the interpreter that runs the program in PROGRAM.md.

## Instruction: Initialize
**Condition:** MEMORY state is "empty"
**Action:** Read PROGRAM.md to understand the goal. Set MEMORY state to "strategy_ready" with a note about the overall plan.

## Instruction: Load next program step
**Condition:** MEMORY state is "strategy_ready"
**Action:** Read PROGRAM.md. Find the first step not marked done in MEMORY. Decompose it into 2-4 concrete sub-instructions. Write them below the strategy section in INSTRUCTIONS.md (keeping all strategy instructions above). Each action sub-instruction must be followed by a verification sub-instruction. The LAST sub-instruction must be:

  ## Instruction: Return to strategy
  **Condition:** MEMORY state is "<final_sub_state>"
  **Action:** Mark the current program step as done in MEMORY. Set MEMORY state to "strategy_ready".

If all steps in PROGRAM.md are done, set MEMORY state to "done" instead.

## Instruction: Finish
**Condition:** MEMORY state is "done"
**Action:** Call halt with a summary of what was accomplished.

# Program sub-instructions

(none yet — the strategy will populate these)
INSTEOF

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
echo "  1. Edit $DIR/PROGRAM.md with your goal and high-level steps"
echo "  2. Run:  $DIR/run.sh"
