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
│  │             │    │                  │    │ current    │  │
│  │ ## Step 1   │◄───│ Initialize       │    │            │  │
│  │ ## Step 2   │    │ Load next step   │───►│ ## History │  │
│  │ ## Step 3   │    │ Finish           │    │ ...        │  │
│  │ ...         │    │                  │    └───────────┘  │
│  └─────────────┘    │ # Sub-instructions│         ▲        │
│   (user-authored)   │ (generated)       │         │        │
│                     └──────────────────┘         │        │
│                              ▲                    │        │
│                              │                    │        │
│                              └────────┬───────────┘        │
│                                       │                    │
└───────────────────────────────────────┼────────────────────┘
                                        │
                    ┌───────────────────────────────────────┐
                    │              SHELL (main.ts)          │
                    │                                       │
                    │  for each cycle:                      │
                    │    snapshot history                    │
                    │    read MEMORY + INSTRUCTIONS          │
                    │    invoke LLM ◄──────────────────┐    │
                    │    execute tool calls             │    │
                    │    check completeness ────────────┘    │
                    │      retry if:                    │    │
                    │        - tool syntax error        │    │
                    │        - no state change          │    │
                    │        - orphan state             │    │
                    │    if halt → stop                      │
                    │                                       │
                    └───────────────────────────────────────┘
                                        │
                    ┌───────────────────────────────────────┐
                    │              LLM (one invocation)     │
                    │                                       │
                    │  Tools:                               │
                    │    bash         — run commands         │
                    │    write_file   — author files         │
                    │    update_instructions — rewrite plan  │
                    │    halt         — stop machine         │
                    │                                       │
                    │  Reads:  MEMORY state                 │
                    │  Matches: first instruction by state  │
                    │  Decides: execute or decompose        │
                    │                                       │
                    └───────────────────────────────────────┘
```

## Three-Layer Design

```
┌──────────────────────────────────────────────────┐
│  PROGRAM.md (user layer)                         │
│                                                  │
│  High-level goals and steps.                     │
│  Written by the user. Never modified by the      │
│  machine. Read by the strategy to determine      │
│  what to do next.                                │
├──────────────────────────────────────────────────┤
│  INSTRUCTIONS.md (strategy + working layer)      │
│                                                  │
│  Strategy: meta-instructions that interpret       │
│  PROGRAM.md. They read the next program step,    │
│  decompose it into sub-instructions, and         │
│  ensure a handback when sub-steps complete.      │
│                                                  │
│  Sub-instructions: concrete steps generated      │
│  by the strategy. Execute → verify → next.       │
│  The last sub-instruction always returns          │
│  control to the strategy.                        │
├──────────────────────────────────────────────────┤
│  Shell (universal executor)                      │
│                                                  │
│  Single cycle loop. Model-agnostic.              │
│  Reads state, invokes LLM, retries on            │
│  incomplete cycles. No hardcoded phases.         │
└──────────────────────────────────────────────────┘
```

## Cycle Flow

```
    ┌──────────┐
    │  empty   │
    └────┬─────┘
         │ Initialize: read PROGRAM.md
         ▼
    ┌──────────────┐
    │strategy_ready│◄─────────────────────────────┐
    └────┬─────────┘                               │
         │ Load next step: read PROGRAM.md,        │
         │ decompose into sub-instructions         │
         ▼                                         │
    ┌──────────┐                                   │
    │ sub-step │                                   │
    │ execute  │                                   │
    └────┬─────┘                                   │
         │ verify                                  │
         ▼                                         │
    ┌──────────┐                                   │
    │ sub-step │                                   │
    │ verified │                                   │
    └────┬─────┘                                   │
         │ ... more sub-steps ...                  │
         ▼                                         │
    ┌───────────────────┐                          │
    │ Return to strategy│──────────────────────────┘
    │ mark step done    │
    └───────────────────┘
         │ (when all program steps done)
         ▼
    ┌──────────┐
    │   done   │
    └────┬─────┘
         │ Finish: halt
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
    Execute all tools
         │
         ├─── tool syntax error? ──► feed error back, retry
         │
         ├─── no state change? ──► feed results + nudge, retry
         │
         ├─── orphan state? ──► feed "no matching instruction"
         │    (MEMORY changed but         message, retry
         │     INSTRUCTIONS has no
         │     matching condition)
         │
         └─── all good ──► cycle complete
```

## Usage

```bash
# Create a new instance with the default interpreter
./new-instance.sh my-project

# Create an instance with a custom interpreter
./new-instance.sh my-game interpreters/game-team

# Edit the program
vim instances/my-project/PROGRAM.md

# Run (default: claude-code provider)
instances/my-project/run.sh

# Run with API provider
TURING_PROVIDER=api instances/my-project/run.sh
```

## Interpreters

An interpreter is a reusable strategy that defines how PROGRAM.md gets executed. It lives in `interpreters/<name>/` and contains:

- `INSTRUCTIONS.md` (required) — The strategy instructions, copied into the instance on creation
- `*.md` (optional) — Supporting files (role descriptions, templates, etc.), also copied into the instance

### Creating a new interpreter

An interpreter's INSTRUCTIONS.md must follow these patterns:

1. **Strategy preservation**: Start with a comment saying these instructions must be preserved on every rewrite.

2. **Initialize → strategy_ready**: An Initialize instruction that reads PROGRAM.md and sets up initial state.

3. **Step loading loop**: A "pick next step" instruction (condition: `strategy_ready`) that reads PROGRAM.md, finds the next incomplete step, and either decomposes it or sets state to `done`.

4. **Decompose → execute → verify**: When a step (or feature) is ready to implement, decompose it into concrete sub-instructions. Each action must be followed by a verification. The pattern:
   - Action instruction (creates/modifies something)
   - Verify instruction (checks it actually worked)
   - ... more action/verify pairs ...
   - Return instruction (marks step done, sets state back to `strategy_ready`)

5. **Handback**: The last sub-instruction must always return control to the strategy by setting state to `strategy_ready`. Without this, the machine stalls after completing sub-steps.

6. **Finish**: A Finish instruction (condition: `done`) that calls halt.

### Built-in interpreters

- **default** (no argument) — Generic step-by-step executor. Reads PROGRAM.md steps, decomposes each into sub-instructions with verification.
- **`interpreters/game-team`** — Simulates a game dev team. For each feature: gathers opinions from architect, game designer, developer, 2D artist, and UI/UX expert, then synthesizes into an implementation plan before decomposing into executable sub-steps. Can ask the user for clarification when specs are ambiguous.

## Instance Structure

```
instances/my-project/
├── PROGRAM.md        # Your high-level program (goals + steps)
├── INSTRUCTIONS.md   # Strategy + generated sub-instructions
├── MEMORY.md         # Machine state
├── run.sh            # Launch script (prompts for API key on first run)
├── .api_key          # Cached API key (gitignored)
└── history/          # Snapshot per cycle
    ├── 0001/
    │   ├── MEMORY.md
    │   └── INSTRUCTIONS.md
    ├── 0002/
    │   └── ...
    └── ...
```
