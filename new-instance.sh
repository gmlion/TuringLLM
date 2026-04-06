#!/usr/bin/env bash
set -euo pipefail

if [ -z "${1:-}" ]; then
  echo "Usage: ./new-instance.sh <name> [interpreter-path]"
  echo ""
  echo "  name              Name of the instance"
  echo "  interpreter-path  Path to an interpreter directory containing INSTRUCTIONS.md"
  echo "                    (default: built-in generic strategy)"
  echo ""
  echo "Examples:"
  echo "  ./new-instance.sh my-project"
  echo "  ./new-instance.sh my-game interpreters/game-team"
  exit 1
fi

NAME="$1"
INTERPRETER="${2:-}"
DIR="instances/$NAME"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

if [ -d "$DIR" ]; then
  echo "Error: instance '$NAME' already exists at $DIR"
  exit 1
fi

mkdir -p "$DIR"

# PROGRAM.md — always a fresh template for the user to fill in
cat > "$DIR/PROGRAM.md" << 'EOF'
# Goal
(describe the goal here)

## Step 1: (first high-level step)
(describe what to do)

## Step 2: (second high-level step)
(describe what to do)
EOF

# INSTRUCTIONS.md — from interpreter or built-in default
if [ -n "$INTERPRETER" ]; then
  INTERP_DIR="$SCRIPT_DIR/$INTERPRETER"
  if [ ! -f "$INTERP_DIR/INSTRUCTIONS.md" ]; then
    echo "Error: interpreter at '$INTERP_DIR' has no INSTRUCTIONS.md"
    exit 1
  fi
  cp "$INTERP_DIR/INSTRUCTIONS.md" "$DIR/INSTRUCTIONS.md"

  # Copy any supporting files (role descriptions, etc.) into the instance
  for f in "$INTERP_DIR"/*.md; do
    base="$(basename "$f")"
    if [ "$base" != "INSTRUCTIONS.md" ]; then
      cp "$f" "$DIR/$base"
    fi
  done
else
  cat > "$DIR/INSTRUCTIONS.md" << 'INSTEOF'
# Strategy

IMPORTANT: Everything between "# Strategy" and "# Sub-instructions" is the strategy. It must be copied VERBATIM into every update_instructions call. Never modify, summarize, or omit any strategy instruction. Only the "# Sub-instructions" section below changes.

## Instruction: Initialize
**Condition:** MEMORY state is "empty"
**Action:** Read PROGRAM.md to understand the goal. Set MEMORY state to "strategy_ready" with a note about the overall plan.

## Instruction: Load next program step
**Condition:** MEMORY state is "strategy_ready"
**Action:** Read PROGRAM.md. Find the first step not marked done in MEMORY. Decompose it into 2-4 concrete sub-instructions for the CURRENT step only. Write them in the "# Sub-instructions" section below. Each action sub-instruction must be followed by a verification sub-instruction. The LAST sub-instruction must always be:

  ## Instruction: Step complete
  **Condition:** MEMORY state is "<final_verified_state>"
  **Action:** Mark the current program step as done in MEMORY. Set state to "strategy_ready".

If all steps in PROGRAM.md are done, set MEMORY state to "done" instead. Set MEMORY state to the first sub-instruction's expected state. Remember: copy the ENTIRE strategy section above verbatim when calling update_instructions.

## Instruction: Finish
**Condition:** MEMORY state is "done"
**Action:** Call halt with a summary of what was accomplished.

# Sub-instructions

(none yet — the "Load next program step" instruction will populate these)
INSTEOF
fi

# MEMORY.md — always starts empty
cat > "$DIR/MEMORY.md" << 'EOF'
## State
empty
EOF

# run.sh
cat > "$DIR/run.sh" << 'RUNEOF'
#!/usr/bin/env bash
set -euo pipefail

INSTANCE_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$INSTANCE_DIR/../.." && pwd)"
KEY_FILE="$INSTANCE_DIR/.api_key"

# Default to claude-code provider
export TURING_PROVIDER="${TURING_PROVIDER:-claude-code}"

# API provider needs an API key
if [ "$TURING_PROVIDER" = "api" ]; then
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
fi

cd "$INSTANCE_DIR"
node "$PROJECT_ROOT/dist/main.js"
RUNEOF

chmod +x "$DIR/run.sh"

echo "Instance '$NAME' created at $DIR/"
if [ -n "$INTERPRETER" ]; then
  echo "  Interpreter: $INTERPRETER"
fi
echo "  1. Edit $DIR/PROGRAM.md with your goal and high-level steps"
echo "  2. Run:  $DIR/run.sh"
