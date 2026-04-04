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
# Create a new instance
./new-instance.sh my-project

# Edit the program
vim instances/my-project/PROGRAM.md

# Run
instances/my-project/run.sh
```

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
