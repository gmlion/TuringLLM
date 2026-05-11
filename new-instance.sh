#!/usr/bin/env bash
set -euo pipefail

if [ -z "${1:-}" ]; then
  echo "Usage: ./new-instance.sh [interpreter-path] <name>"
  echo ""
  echo "  interpreter-path  Path to an interpreter directory containing INSTRUCTIONS.md"
  echo "                    (omit to use built-in generic strategy)"
  echo "  name              Name of the instance"
  echo ""
  echo "Examples:"
  echo "  ./new-instance.sh my-project"
  echo "  ./new-instance.sh interpreters/mas-papers/2-planning-decomposition/a-plan-execute my-a"
  exit 1
fi

if [ -n "${2:-}" ]; then
  INTERPRETER="$1"
  NAME="$2"
else
  INTERPRETER=""
  NAME="$1"
fi
DIR="instances/$NAME"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

if [ -d "$DIR" ]; then
  echo "Error: instance '$NAME' already exists at $DIR"
  exit 1
fi

mkdir -p "$DIR"

if [ -n "$INTERPRETER" ]; then
  # Support both absolute paths (for tests/custom) and paths relative to repo root.
  # Handles Unix absolute (/path), Windows absolute (C:/path), and relative paths.
  case "$INTERPRETER" in
    /*|[A-Za-z]:*) INTERP_DIR="$INTERPRETER" ;;
    *)             INTERP_DIR="$SCRIPT_DIR/$INTERPRETER" ;;
  esac
  if [ ! -f "$INTERP_DIR/INSTRUCTIONS.md" ]; then
    echo "Error: interpreter at '$INTERP_DIR' has no INSTRUCTIONS.md"
    exit 1
  fi

  # Write .root-operator — the marker file containing the path to the root
  # operator (e.g. "operators/strategy.md"). The shell reads this at startup
  # to bootstrap the first frame instead of expecting frames/ to be pre-created.
  cp "$INTERP_DIR/INSTRUCTIONS.md" "$DIR/.root-operator"

  # Operators — shared across all frames, at instance root.
  if [ -d "$INTERP_DIR/operators" ]; then
    cp -r "$INTERP_DIR/operators" "$DIR/operators"
  fi

  # Library scripts — shared bookkeeping for operators that need deterministic
  # state management (e.g. aflow-lite's MCTS loop). At instance root so frames
  # can invoke them as `bash ../../lib/<name>.sh`.
  if [ -d "$INTERP_DIR/lib" ]; then
    cp -r "$INTERP_DIR/lib" "$DIR/lib"
    chmod +x "$DIR/lib/"*.sh 2>/dev/null || true
  fi

  # Roles (or other interpreter-shared subdirectories the operators reference) —
  # copied to the instance root so operators can `cat ../../roles/<name>.md` from
  # any frame. Used by b-chatdev for its CEO/CTO/coder/reviewer/tester/writer
  # personas; harmless when absent.
  if [ -d "$INTERP_DIR/roles" ]; then
    cp -r "$INTERP_DIR/roles" "$DIR/roles"
  fi

  # Workspace seed (interpreter-shipped input files, fixtures, etc.) — copied
  # into the instance's workspace/ which the LLM operates on. Used by
  # b-orchestrator-workers for its 5 input notes; harmless when absent.
  if [ -d "$INTERP_DIR/workspace" ]; then
    cp -r "$INTERP_DIR/workspace" "$DIR/workspace"
  fi

  # PROGRAM.md — instance root. Use interpreter's demo if present; else template.
  if [ -f "$INTERP_DIR/PROGRAM.md" ]; then
    cp "$INTERP_DIR/PROGRAM.md" "$DIR/PROGRAM.md"
  else
    cat > "$DIR/PROGRAM.md" << 'EOF'
# Goal
(describe the goal here)

## Step 1: (first high-level step)
(describe what to do)

## Step 2: (second high-level step)
(describe what to do)
EOF
  fi
else
  # Default interpreter: write a built-in .root-operator pointing at
  # operators/strategy.md, then write that operator file.
  cat > "$DIR/.root-operator" << 'EOF'
operators/strategy.md
EOF

  mkdir -p "$DIR/operators"
  cat > "$DIR/operators/strategy.md" << 'STRATEOF'
# Strategy

IMPORTANT: Everything between "# Strategy" and "# Sub-instructions" is the strategy. It must be copied VERBATIM into every update_instructions call. Never modify, summarize, or omit any strategy instruction. Only the "# Sub-instructions" section below changes.

## Instruction: Initialize
**Condition:** MEMORY state is "empty"
**Action:** Read ../../PROGRAM.md to understand the goal. Set MEMORY state to "strategy_ready" with a note about the overall plan.

## Instruction: Load next program step
**Condition:** MEMORY state is "strategy_ready"
**Action:** Read ../../PROGRAM.md. Find the first step not marked done in MEMORY. Decompose it into 2-4 concrete sub-instructions for the CURRENT step only. Write them in the "# Sub-instructions" section below. Each action sub-instruction must be followed by a verification sub-instruction. The LAST sub-instruction must always be:

  ## Instruction: Step complete
  **Condition:** MEMORY state is "<final_verified_state>"
  **Action:** Mark the current program step as done in MEMORY. Set state to "strategy_ready".

If all steps in PROGRAM.md are done, set MEMORY state to "done" instead. Set MEMORY state to the first sub-instruction's expected state. Remember: copy the ENTIRE strategy section above verbatim when calling update_instructions.

## Instruction: Finish
**Condition:** MEMORY state is "done"
**Action:** Call halt with a summary of what was accomplished.

# Sub-instructions

(none yet — the "Load next program step" instruction will populate these)
STRATEOF

  cat > "$DIR/PROGRAM.md" << 'EOF'
# Goal
(describe the goal here)

## Step 1: (first high-level step)
(describe what to do)

## Step 2: (second high-level step)
(describe what to do)
EOF
fi

# SYSCALLS.md — empty, used by stateful mode (instance root, unchanged).
touch "$DIR/SYSCALLS.md"

# .gitignore for instance
cat > "$DIR/.gitignore" << 'EOF'
.api_key
.env
.telegram-state.json
logs/
history/
workspace/.git/
EOF

# run.sh — unchanged from Phase 2.
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
