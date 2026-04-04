# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

An LLM-powered universal Turing machine. A cycle loop invokes an LLM once per cycle. The LLM reads its state (MEMORY.md) and program (INSTRUCTIONS.md), matches the first instruction by state, acts, and is destroyed. The cycle repeats until halt.

## Build and Run

```bash
npm run build          # tsc → dist/
./new-instance.sh foo  # creates instances/foo/ with PROGRAM.md, INSTRUCTIONS.md, MEMORY.md, run.sh
# edit instances/foo/PROGRAM.md
instances/foo/run.sh   # runs the machine (default: claude-code provider)
TURING_PROVIDER=api instances/foo/run.sh  # use Anthropic SDK instead (needs ANTHROPIC_API_KEY)
```

No test suite or linter configured. After TypeScript changes, always `npm run build` before running instances.

## Architecture — Three Layers

**Shell** (`src/main.ts`) — Universal executor. Single cycle loop. Reads MEMORY state after each cycle to detect halt (`done`), user interaction (`waiting_for_user`), and cycle completeness. Snapshots MEMORY+INSTRUCTIONS to `history/` each cycle. Resumes from last cycle number on restart.

**Strategy** (default INSTRUCTIONS.md template in `new-instance.sh`) — Meta-program that interprets PROGRAM.md. Decomposes high-level steps into sub-instructions, ensures handback to strategy via a "Return to strategy" instruction after sub-steps complete. Strategy instructions live at the top of INSTRUCTIONS.md and must survive rewrites.

**Program** (PROGRAM.md) — User-authored high-level goals and steps. Never modified by the machine.

## Source Files

- `src/main.ts` — Cycle loop, history snapshots, user interaction handling, provider dispatch
- `src/prompt.ts` — System prompt (universal machine description) and user prompt construction (inlines MEMORY + INSTRUCTIONS)
- `src/tools.ts` — Tool definitions (bash, write_file, update_instructions, halt) and execution for the API provider
- `src/providers/api.ts` — Anthropic SDK provider. Manages tool call loop with retries: syntax errors feed back to LLM, orphan states (MEMORY changed but no matching instruction) trigger retry with feedback message
- `src/providers/claude-code.ts` — Claude Code CLI provider. Invokes `claude --bare -p` per cycle. Retries externally by checking file changes after each invocation
- `src/logger.ts` — Dual output: console gets summaries, `logs/run-<timestamp>.log` gets full untruncated output
- `src/errors.ts` — `QuotaExceededError` for graceful exit on rate limits (process exits 0, resumable)

## Provider Differences

**API provider** (`TURING_PROVIDER=api`): Custom tools (bash, write_file, update_instructions, halt). The shell manages the tool call loop, feeds errors back, detects orphan states. Uses `claude-haiku-4-5-20251001`.

**Claude Code provider** (`TURING_PROVIDER=claude-code`, default): Invokes `claude --bare -p --dangerously-skip-permissions` as a subprocess. Uses Claude Code's built-in tools (Bash, Write, Edit, Read). The shell only checks file changes after each invocation — it cannot intercept mid-execution.

## Well-Known States

The shell intercepts these MEMORY states:
- `done` — halts the machine
- `waiting_for_user` — prompts user via stdin, writes answer to `## Answer` in MEMORY, sets state to `user_responded`

## Retry Mechanisms (API provider)

Retries within a cycle are unbounded. Two types:
1. **Tool errors** (bash syntax errors, empty commands): error fed back as `is_error: true` tool result
2. **Orphan state**: MEMORY state changed but INSTRUCTIONS has no matching condition — feedback message tells LLM to call `update_instructions`
3. **No state change**: neither MEMORY nor INSTRUCTIONS modified — feedback message tells LLM the cycle is incomplete

## Instance Layout

```
instances/foo/
├── PROGRAM.md         # User's program (read-only to machine)
├── INSTRUCTIONS.md    # Strategy + generated sub-instructions
├── MEMORY.md          # Current state
├── run.sh             # Launch script
├── .api_key           # Cached API key (gitignored)
├── history/0001/      # Snapshot per cycle
└── logs/              # Full run logs
```
