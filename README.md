# Turing

An LLM-powered universal Turing machine.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        INSTANCE                             │
│                                                             │
│  PROGRAM.md          INSTRUCTIONS.md         MEMORY.md      │
│  ┌─────────────┐    ┌──────────────────┐    ┌───────────┐  │
│  │ # Goal      │    │ # Strategy       │    │ ## State   │  │
│  │             │    │ (interpreter)    │    │ current    │  │
│  │ (user-      │◄───│                  │    │            │  │
│  │  authored)  │    │ # Sub-instruct.  │───►│ ## Result  │  │
│  │             │    │ (generated)      │    │ ...        │  │
│  └─────────────┘    └──────────────────┘    └───────────┘  │
│                                                             │
│  workspace/          history/                logs/           │
│  ┌─────────────┐    ┌──────────────────┐    ┌───────────┐  │
│  │ (project    │    │ 0001-a3f1b2c/    │    │ run-*.log │  │
│  │  artifacts, │    │ 0002-b4e2c3d/    │    │ (full     │  │
│  │  own git    │    │ ...              │    │  output)  │  │
│  │  repo)      │    │                  │    │           │  │
│  └─────────────┘    └──────────────────┘    └───────────┘  │
└─────────────────────────────────────────────────────────────┘
                              │
              ┌───────────────┼───────────────┐
              │               │               │
              ▼               ▼               ▼
        ┌──────────┐   ┌──────────┐   ┌──────────────┐
        │ Machine  │   │  Shell   │   │   Provider   │
        │ Git      │   │ main.ts  │   │ claude-code  │
        │ (auto-   │   │ (cycle   │   │ or api       │
        │  commit  │   │  loop,   │   │ (LLM invoc.) │
        │  per     │   │  retry,  │   │              │
        │  cycle)  │   │  halt)   │   │              │
        └──────────┘   └──────────┘   └──────────────┘
```

## Three-Layer Design

```
┌──────────────────────────────────────────────────┐
│  PROGRAM.md (user layer)                         │
│                                                  │
│  High-level goals. Written by user.              │
│  Never modified by the machine.                  │
├──────────────────────────────────────────────────┤
│  INSTRUCTIONS.md (interpreter layer)             │
│                                                  │
│  # Strategy section: immutable meta-program      │
│  that interprets PROGRAM.md. Survives rewrites.  │
│                                                  │
│  # Sub-instructions section: mutable working     │
│  area. Generated and consumed each cycle.        │
├──────────────────────────────────────────────────┤
│  Shell (universal executor)                      │
│                                                  │
│  Single cycle loop. Invokes LLM, retries on      │
│  incomplete cycles, auto-commits, snapshots.     │
│  No hardcoded phases — the interpreter decides.  │
└──────────────────────────────────────────────────┘
```

## Cycle Flow (default interpreter)

```
    ┌──────────┐
    │  empty   │
    └────┬─────┘
         │ Initialize
         ▼
    ┌──────────────┐
    │strategy_ready│◄─────────────────────────────┐
    └────┬─────────┘                               │
         │ Load next step from PROGRAM.md          │
         ▼                                         │
    ┌──────────┐                                   │
    │ sub-step │                                   │
    │ execute  │                                   │
    └────┬─────┘                                   │
         │ verify                                  │
         ▼                                         │
    ┌───────────────────┐                          │
    │ Return to strategy│──────────────────────────┘
    └───────────────────┘
         │ (all steps done)
         ▼
    ┌──────────┐
    │  HALTED  │
    └──────────┘
```

## Retry Mechanism

```
    LLM emits tool calls
         │
         ▼
    Execute tools
         │
         ├─── tool error? ──► feed error back, retry (unbounded)
         │
         ├─── no state change? ──► feed results + nudge, retry (unbounded)
         │
         ├─── orphan state? ──► "no matching instruction", retry (unbounded)
         │
         └─── all good ──► git commit ──► snapshot ──► next cycle
```

## Usage

```bash
# Build
npm run build

# Create instances
./new-instance.sh my-project                          # default interpreter
./new-instance.sh my-game interpreters/game-team      # game dev team
./new-instance.sh my-proto interpreters/karpathy-loop # tight code-test-fix loop

# Edit the program
vim instances/my-project/PROGRAM.md

# Run (default: claude-code provider with Haiku)
instances/my-project/run.sh

# Run with Anthropic SDK provider
TURING_PROVIDER=api instances/my-project/run.sh

# Visualize a running or completed instance
./visualize.sh my-project
```

Instances are resumable. Stop anytime (Ctrl+C or quota exceeded) and restart with `run.sh` — the cycle counter picks up where it left off.

## Interpreters

An interpreter defines how PROGRAM.md gets executed. It's a reusable strategy that lives in `interpreters/<name>/`.

### Built-in interpreters

**default** (no argument) — Step-by-step executor. Reads steps from PROGRAM.md, decomposes each into sub-instructions with verification, hands back to strategy after each step.

**`interpreters/game-team`** — Game development team simulation. Six roles with separate role description files:
- Team lead (coordinates, asks user when unclear)
- Architect (technical structure)
- Game designer (gameplay, balance)
- Developer (implementation)
- 2D artist (visual assets, programmatic art)
- UI/UX expert (interface, interaction)

For each feature: plans features → gathers opinions from all roles → synthesizes → decomposes → executes → verifies → loops back to plan next feature. Asks the user interactively when specs are ambiguous.

**`interpreters/karpathy-loop`** — Tight feedback loop. No upfront planning. Code the smallest thing → run it → look at actual output → fix errors → evaluate → repeat. Supports breadth-first branching via git: when multiple approaches are viable, creates branches and explores them round-robin before comparing and picking a winner.

### Creating a new interpreter

Create a directory `interpreters/<name>/` with at least `INSTRUCTIONS.md`. Add optional `*.md` files for role descriptions, templates, etc. — they're copied into instances.

**INSTRUCTIONS.md structure:**

```markdown
# Strategy: <Name>

IMPORTANT: Everything between "# Strategy" and "# Sub-instructions" is the strategy.
It must be copied VERBATIM into every update_instructions call. Never modify, summarize,
or omit any strategy instruction. Only the "# Sub-instructions" section below changes.

<description of what this interpreter does>

## Instruction: Initialize
**Condition:** MEMORY state is "empty"
**Action:** Read PROGRAM.md. Bootstrap state. Set state to "<first_state>".

## Instruction: <your state machine instructions here>
**Condition:** MEMORY state is "<state>"
**Action:** <what to do>

...more instructions forming a complete state machine...

## Instruction: Finish
**Condition:** MEMORY state is "done"
**Action:** Call halt with a summary.

# Sub-instructions

(none yet — the strategy will populate these)
```

**Key patterns:**

1. **Strategy preservation**: The `IMPORTANT` block at the top tells the LLM to copy the strategy section verbatim on every rewrite.

2. **State machine**: Instructions match on MEMORY state strings. Every state must have a matching instruction, and every instruction must set a new state. Dead-end states stall the machine.

3. **Handback**: After completing a unit of work, the state must loop back to a "pick next" instruction that reads PROGRAM.md. Without this, the machine completes one thing and stalls.

4. **Decompose → execute → verify**: When work needs to happen, write sub-instructions in the `# Sub-instructions` section. Each action followed by verification. The last sub-instruction returns to the strategy.

5. **User interaction**: Set state to `waiting_for_user` with `## Question` in MEMORY. The shell prompts the user and sets state to `user_responded` with `## Answer`. You must have an instruction matching `user_responded`.

6. **Project artifacts**: Code and files go in `workspace/`. The `git` tool operates there. MEMORY.md and INSTRUCTIONS.md stay in the instance root.

## Two Git Repos

- **Machine git** (instance root) — Auto-commits per cycle. Tracks everything. History dirs: `history/0042-a3f1b2c/`.
- **Project git** (`workspace/`) — LLM-controlled. Interpreters can branch, commit, diff, explore alternatives.

## Instance Structure

```
instances/foo/
├── PROGRAM.md         # User's program (read-only to machine)
├── INSTRUCTIONS.md    # Strategy + generated sub-instructions
├── MEMORY.md          # Current state
├── workspace/         # Project artifacts (own git repo)
├── run.sh             # Launch script
├── *.md               # Interpreter support files (role descriptions, etc.)
├── .api_key           # Cached API key (gitignored)
├── .gitignore
├── history/           # Snapshots per cycle
│   ├── 0001-a3f1b2c/
│   │   ├── MEMORY.md
│   │   └── INSTRUCTIONS.md
│   └── ...
└── logs/              # Full run logs
    └── run-2026-04-06T*.log
```
