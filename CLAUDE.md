# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

An LLM-powered universal Turing machine. A cycle loop invokes an LLM once per cycle. The LLM reads its state (MEMORY.md) and program (INSTRUCTIONS.md), matches the first instruction by state, acts, and is destroyed. The cycle repeats until halt.

## Build and Run

```bash
npm run build          # tsc → dist/
./new-instance.sh foo                          # default interpreter
./new-instance.sh foo interpreters/game-team   # custom interpreter
# edit instances/foo/PROGRAM.md
# configure instances/foo/.env (provider, model, keys)
instances/foo/run.sh                           # run
./visualize.sh foo                             # launch web visualizer for an instance
```

No test suite or linter configured. After TypeScript changes, always `npm run build` before running instances.

## Architecture — Three Layers

**Shell** (`src/main.ts`) — Universal executor. Single cycle loop, no hardcoded phases. After each cycle: auto-commits via git, snapshots to history/, checks for halt/user-interaction/completeness. Retries if the LLM didn't advance state. Resumes from last cycle number on restart. Exits cleanly on quota exceeded.

**Strategy/Interpreter** (INSTRUCTIONS.md) — Meta-program that interprets PROGRAM.md. Different interpreters encode different execution strategies. Lives in `interpreters/<name>/` and is copied into instances on creation. The strategy section of INSTRUCTIONS.md must survive rewrites — only the `# Sub-instructions` section below it changes.

**Program** (PROGRAM.md) — User-authored goals. Never modified by the machine.

## Source Files

- `src/main.ts` — Cycle loop, git commits, history snapshots, user interaction handling, provider dispatch
- `src/prompt.ts` — System prompt and user prompt construction (inlines MEMORY + INSTRUCTIONS)
- `src/tools.ts` — Tool definitions (bash, write_file, git, update_instructions, ask_user, halt) and execution
- `src/providers/api.ts` — Anthropic SDK provider with managed tool loop
- `src/providers/claude-code.ts` — Claude Code CLI provider using native CC tools
- `src/providers/openai.ts` — OpenAI-compatible API provider
- `src/providers/ollama.ts` — Ollama native API provider with streaming
- `src/providers/local.ts` — In-process GGUF provider via node-llama-cpp (no server needed)
- `src/logger.ts` — Dual output: console gets summaries, `logs/run-<timestamp>.log` gets full untruncated output
- `src/errors.ts` — QuotaExceededError for graceful pause on rate limits (exit 0, resumable)
- `src/git.ts` — Two git repos per instance: machine git (instance root, auto-commits per cycle) and project git (workspace/, LLM-controlled)
- `src/server.ts` — Static file server for the visualizer

## Two Git Repos Per Instance

- **Machine git** (instance root) — Hardwired. Each instance gets its own `.git` repo (never inherits from a parent project repo). Auto-commits all files after each cycle. Commit message: `cycle N: <state>`. History dirs include the short hash: `history/0042-a3f1b2c/`. Tracks MEMORY, INSTRUCTIONS, and workspace changes.
- **Project git** (`workspace/`) — LLM-controlled via the `git` tool. The LLM can branch, commit, diff, checkout freely. Used by interpreters like karpathy-loop for exploring alternative approaches.

The machine git ignores `workspace/.git/` so nested repos don't conflict.

## Configuration

Providers and models are configured via environment variables. Use a `.env` file at the project root (shared defaults) or per-instance (`instances/foo/.env`, overrides project). Shell env vars take precedence over `.env` files.

## Providers

All providers except Claude Code use the same custom tools (bash, write_file, git, update_instructions, halt) with the shell managing the tool call loop. All providers cap retries at 20 for incomplete cycles.

**API provider** (`TURING_PROVIDER=api`): Anthropic SDK. Requires `ANTHROPIC_API_KEY`.
- `ANTHROPIC_MODEL` — model name (default: claude-haiku-4-5-20251001)

**Claude Code provider** (`TURING_PROVIDER=claude-code`, default): Invokes `claude -p` as a subprocess with its native tools (Bash, Write, Edit). CC manages its own tool loop internally. The shell checks file changes after each invocation and retries if no progress. Note: CC's autonomy training can cause it to do too much per cycle or skip verification.
- `CC_MODEL` — model name passed to `claude --model` (default: haiku)

**OpenAI provider** (`TURING_PROVIDER=openai`): OpenAI-compatible API with function calling.
- `OPENAI_API_KEY` — API key (required)
- `OPENAI_BASE_URL` — custom endpoint (optional, for compatible APIs)
- `OPENAI_MODEL` — model name (default: gpt-4o)

**Ollama provider** (`TURING_PROVIDER=ollama`): Native Ollama API with streaming output. Tokens print to console in real-time as the model thinks.
- `OLLAMA_BASE_URL` — Ollama endpoint (default: http://localhost:11434)
- `OLLAMA_MODEL` — model name (default: qwen3:14b)

**Local provider** (`TURING_PROVIDER=local`): Loads a GGUF model directly in-process via node-llama-cpp. No server needed. Model stays loaded across cycles. Streaming output. Native function calling via grammar constraints.
- `LOCAL_MODEL_PATH` — path to a GGUF file (e.g., Ollama blob path)
- `LOCAL_MODEL_URI` — or a HuggingFace URI to auto-download (e.g., `hf:Qwen/Qwen3-32B-GGUF/qwen3-32b-q4_k_m.gguf`)

## Shared Configuration

- `BASH_TIMEOUT` — timeout in seconds for bash tool commands (default: 300 / 5 minutes). Set to 0 to disable.

## Well-Known States

The shell intercepts these MEMORY states:
- `done` — halts the machine
- `waiting_for_user` — prompts user via stdin, writes answer to `## Answer` in MEMORY, sets state to `user_responded`

## Interpreters

Interpreters live in `interpreters/<name>/`. Each has an `INSTRUCTIONS.md` and optional supporting `*.md` files (role descriptions, etc.).

### Existing interpreters

- **default** (no argument to new-instance.sh) — Step-by-step executor. Reads PROGRAM.md steps, decomposes each into sub-instructions with verification.
- **`interpreters/game-team`** — Game dev team simulation. Six roles (team lead, architect, game designer, developer, 2D artist, UI/UX). Preproduction phase: defines scope, debates tech stack (architect proposes, developer reviews), bootstraps project skeleton. Production phase: gathers opinions per feature, synthesizes, decomposes into sub-steps. Verification is honest about headless limitations — asks user when visual confirmation is needed. Interactive — asks user when specs are unclear. Feature planning loop reassesses the backlog after each feature. Supports parallel exploration via git branches.
- **`interpreters/karpathy-loop`** — Tight code→test→fix→evaluate loop. No upfront planning. Supports breadth-first branching: when multiple approaches are viable, creates git branches and explores them round-robin before comparing and picking a winner.
- **`interpreters/pair-architect`** — User as co-architect. All design decisions (scope, tech stack, data models, APIs, component boundaries) go through the user via `waiting_for_user`. Implementation details are autonomous. Feature backlog priority is user-confirmed. Visual verification also requires user.
- **`interpreters/red-blue`** — Adversarial red-team/blue-team loop. Blue team builds and hardens code. Red team attacks with exploits, edge cases, and stress tests. Loop escalates until red team can't find issues. Ends with a comprehensive final audit. Best for building robust/secure systems.

### Creating a new interpreter

An interpreter's INSTRUCTIONS.md must:

1. **Preserve the strategy section**: Start with `IMPORTANT: Everything between "# Strategy" and "# Sub-instructions" must be copied VERBATIM into every update_instructions call.`

2. **Have a clear boundary**: `# Strategy` at the top, `# Sub-instructions` at the bottom. Only the sub-instructions section changes during execution.

3. **Initialize**: An instruction (condition: state is "empty") that reads PROGRAM.md and bootstraps state.

4. **State machine with handback**: Instructions form a state machine. Every path through the machine must eventually return to a "pick next" or "evaluate" state that reads PROGRAM.md for the next step. Without handback, the machine stalls after completing work.

5. **Decompose → execute → verify**: When work needs to happen, decompose into sub-instructions. Each action must be followed by verification. The last sub-instruction returns to the strategy.

6. **Finish**: An instruction (condition: state is "done") that calls halt.

Supporting `.md` files (role descriptions, templates) are copied into the instance alongside INSTRUCTIONS.md. Reference them by filename in your instructions.

## Instance Layout

```
instances/foo/
├── PROGRAM.md         # User's program (read-only to machine)
├── INSTRUCTIONS.md    # Strategy + generated sub-instructions
├── MEMORY.md          # Current state
├── .env               # Provider/model config (gitignored)
├── workspace/         # Project artifacts (has its own git repo)
├── run.sh             # Launch script
├── .api_key           # Cached API key (gitignored)
├── .gitignore         # Ignores .api_key, .env, logs/, history/, workspace/.git/
├── history/           # Snapshot per cycle (0001-a3f1b2c/)
└── logs/              # Full run logs (run-<timestamp>.log)
```
