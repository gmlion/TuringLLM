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

After TypeScript changes, always `npm run build` before running instances. A `node:test` suite lives in `src/test/` — run it with `npm test` (builds + runs). No linter is configured.

## Architecture — Three Layers

**Shell** (`src/main.ts`) — Universal executor. Single cycle loop, no hardcoded phases. After each cycle: auto-commits via git, snapshots to history/, checks for halt/user-interaction/completeness. Retries if the LLM didn't advance state. Resumes from last cycle number on restart. Exits cleanly on quota exceeded.

**Strategy/Interpreter** (INSTRUCTIONS.md) — Meta-program that interprets PROGRAM.md. Different interpreters encode different execution strategies. Lives in `interpreters/<name>/` and is copied into instances on creation. The strategy section of INSTRUCTIONS.md must survive rewrites — only the `# Sub-instructions` section below it changes.

**Program** (PROGRAM.md) — User-authored goals. Never modified by the machine.

## Source Files

- `src/main.ts` — Cycle loop, git commits, history snapshots, user interaction, provider dispatch, stack management
- `src/config.ts` — Environment and path configuration (loads .env, exports paths and provider flags)
- `src/memory.ts` — Pure MEMORY.md parsers and transforms (`parseState`, `parsePush`, `removePush`, etc.)
- `src/call-stack.ts` — Instruction call stack: persistence (`.call-stack.json`) and pure push/pop transforms
- `src/prompt.ts` — System prompt and user prompt construction (inlines MEMORY + INSTRUCTIONS)
- `src/tools.ts` — Tool definitions (bash, write_file, git, update_instructions) and execution
- `src/telegram.ts` — Telegram bot integration (non-blocking user questions via chat)
- `src/providers/api.ts` — Anthropic SDK provider with managed tool loop
- `src/providers/claude-code.ts` — Claude Code CLI provider using native CC tools
- `src/providers/openai.ts` — OpenAI-compatible API provider
- `src/providers/ollama.ts` — Ollama native API provider with streaming
- `src/providers/local.ts` — In-process GGUF provider via node-llama-cpp (no server needed)
- `src/providers/shared.ts` — Shared helpers: readFile, logToolCall, checkCycleCompleteness, CycleResult, MAX_RETRIES
- `src/logger.ts` — Dual output: console gets summaries, `logs/run-<timestamp>.log` gets full untruncated output
- `src/errors.ts` — QuotaExceededError for graceful pause on rate limits (exit 0, resumable)
- `src/git.ts` — Two git repos per instance: machine git (instance root, auto-commits per cycle) and project git (workspace/, LLM-controlled)
- `src/server.ts` — Static file server for the visualizer
- `src/test/` — `node:test` suite for memory, call-stack, prompt, and stack integration scenarios

## Two Git Repos Per Instance

- **Machine git** (instance root) — Hardwired. Each instance gets its own `.git` repo (never inherits from a parent project repo). Auto-commits all files after each cycle. Commit message: `cycle N: <state>`. History dirs include the short hash: `history/0042-a3f1b2c/`. Tracks MEMORY, INSTRUCTIONS, and workspace changes.
- **Project git** (`workspace/`) — LLM-controlled via the `git` tool. The LLM can branch, commit, diff, checkout freely. Used by interpreters like karpathy-loop for exploring alternative approaches.

The machine git ignores `workspace/.git/` so nested repos don't conflict.

## Configuration

Providers and models are configured via environment variables. Use a `.env` file at the project root (shared defaults) or per-instance (`instances/foo/.env`, overrides project). Shell env vars take precedence over `.env` files.

## Providers

All providers except Claude Code use the same custom tools (bash, write_file, git, update_instructions) with the shell managing the tool call loop. All providers cap retries at 20 for incomplete cycles.

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
- `TELEGRAM_BOT_TOKEN` — Telegram bot token (from @BotFather). When set with `TELEGRAM_CHAT_ID`, user questions are sent via Telegram instead of stdin.
- `TELEGRAM_CHAT_ID` — Telegram chat ID for the user. Run `./setup-telegram.sh <TOKEN>` to detect automatically.

## Condition Matching

Instruction conditions in INSTRUCTIONS.md are natural language — the LLM interprets them using judgment, not exact string matching. The LLM writes `## Matched Instruction` in MEMORY.md each cycle, declaring which instruction it matched (or `none` if nothing matched).

When the LLM writes `## Matched Instruction: none`, the shell automatically enters `waiting_for_user` and asks the user what to do next. This means conditions can be fuzzy (e.g., "state suggests tests are failing" rather than `state is "tests_failing"`), and the machine gracefully pauses when it reaches an unhandled state instead of retrying forever.

## Well-Known States

The shell intercepts these MEMORY states before each LLM invocation:

- `done` — If the call stack is empty, halts the machine. If the call stack has frames (a dynamic is active), the shell pops one frame: restores the caller's instructions and sets state to `{returnState}_completed` (where `returnState` is the state the caller was in when it pushed). Cascade-pops while state remains `done`.
- `waiting_for_user` — reads `## Pending Questions` from MEMORY, prompts user one question at a time, writes answers to `## Answers` in MEMORY, sets state to `user_responded`. Questions are non-blocking: the LLM adds them to `## Pending Questions` without changing state and keeps working. Only sets `waiting_for_user` when all remaining work is blocked on unanswered questions.

The shell also intercepts the `## Push` MEMORY section (see Dynamics below).

## Dynamics (Call Stack)

A **dynamic** is a reusable instruction file that can be invoked from the running instruction set via push/pop semantics — like calling a subroutine. The shell owns the stack; the LLM signals intent through MEMORY.

**Push.** The LLM writes `## Push` in MEMORY with a file path relative to the instance directory:

```
## Push
dynamics/consult.md
```

Before the next LLM invocation, the shell:
1. Saves the current `{state, instructions}` as a new frame on the call stack.
2. Loads the target file as the new `INSTRUCTIONS.md`.
3. Strips the `## Push` section from MEMORY.
4. Sets state to `empty` so the dynamic starts fresh.

The dynamic then runs its own state machine over the MEMORY the caller left behind. The caller is expected to write any context the dynamic needs into dedicated MEMORY sections before pushing.

**Pop.** When the dynamic sets state to `done`, the shell pops the top frame, restores the caller's instructions, and sets state to `{caller_state}_completed` — where `caller_state` is the state the caller was in at push time. The caller must have an instruction that matches `{caller_state}_completed` to consume the returned result.

The `_completed` suffix prevents an infinite loop: the caller's original `{caller_state}` instruction (which did the push) does not immediately re-fire.

**Nesting.** Dynamics can push further dynamics. Each push adds a frame; pops cascade while state remains `done`.

**Persistence.** The stack is persisted to `.call-stack.json` in the instance directory after every change. Snapshots in `history/NNNN-<hash>/` include a copy of the stack so past cycles are fully reconstructable.

**Authoring dynamics.** Create `interpreters/<name>/dynamics/<thing>.md` alongside `INSTRUCTIONS.md`. The `new-instance.sh` script copies the whole `dynamics/` directory into each new instance. A dynamic file follows the same format as `INSTRUCTIONS.md` (a state machine with conditions/actions), must have an entry condition for state `empty`, and must eventually set state `done` to return control to the caller.

**Missing push targets.** If `## Push` points at a non-existent or empty file, the shell logs an error, strips `## Push` from MEMORY, and continues with the caller unchanged (no frame is pushed). The LLM sees the next cycle without the push request and can adapt.

**Implementation.** All push/pop semantics live in `src/call-stack.ts` as pure functions (`applyPush`, `applyPop`) that take `{stack, memory, instructions}` and return the transformed state. The shell in `src/main.ts` runs them before each LLM invocation and writes results back to disk. This split is why the stack logic is unit-tested independently of the main loop.

## Interpreters

Interpreters live in `interpreters/<name>/`. Each has an `INSTRUCTIONS.md` and optional supporting `*.md` files (role descriptions, etc.).

### Existing interpreters

- **default** (no argument to new-instance.sh) — Step-by-step executor. Reads PROGRAM.md steps, decomposes each into sub-instructions with verification.
- **`interpreters/game-team`** — Game dev team simulation with fuzzy natural-language conditions. Six roles (team lead, architect, game designer, developer, 2D artist, UI/UX). Scheduled for deletion in Phase 4 of the agent-workflows plan; exempt from the Phase-1 directory layout convention.
- **`interpreters/2-iterative-refinement/1a-self-refine`** — Self-Refine (patterns.md Group 2). Single role drafts, critiques its own output via `self-critique.md`, iterates until accepted.
- **`interpreters/2-iterative-refinement/1b-evaluator-optimizer`** — Evaluator–Optimizer (patterns.md Group 2). Generator produces attempts; external evaluator (`evaluate.md`) judges against an explicit `## Criterion` and returns pass/fail with feedback.
- **`interpreters/2-iterative-refinement/1c-reflexion`** — Reflexion (patterns.md Group 2). Evaluator–Optimizer plus a `reflect.md` step that distils each failed attempt into a verbal lesson accumulated in `## Lessons` and read back into every subsequent attempt.

### Creating a new interpreter

An interpreter's INSTRUCTIONS.md must:

1. **Preserve the strategy section**: Start with `IMPORTANT: Everything between "# Strategy" and "# Sub-instructions" must be copied VERBATIM into every update_instructions call.`

2. **Have a clear boundary**: `# Strategy` at the top, `# Sub-instructions` at the bottom. Only the sub-instructions section changes during execution.

3. **Initialize**: An instruction (condition: state is "empty") that reads PROGRAM.md and bootstraps state.

4. **State machine with handback**: Instructions form a state machine. Every path through the machine must eventually return to a "pick next" or "evaluate" state that reads PROGRAM.md for the next step. Without handback, the machine stalls after completing work.

5. **Decompose → execute → verify**: When work needs to happen, decompose into sub-instructions. Each action must be followed by verification. The last sub-instruction returns to the strategy.

6. **Finish**: An instruction (condition: state is "done") — the shell intercepts this state and stops the machine.

Supporting `.md` files (role descriptions, templates) are copied into the instance alongside INSTRUCTIONS.md. Reference them by filename in your instructions.

## Instance Layout

```
instances/foo/
├── PROGRAM.md         # User's program (read-only to machine)
├── INSTRUCTIONS.md    # Strategy + generated sub-instructions (or a dynamic, while one is active)
├── MEMORY.md          # Current state; may contain ## Push to delegate to a dynamic
├── .call-stack.json   # Saved call stack (empty array at depth 0)
├── .env               # Provider/model config (gitignored)
├── workspace/         # Project artifacts (has its own git repo)
├── dynamics/          # Reusable instruction files copied from the interpreter (optional)
├── run.sh             # Launch script
├── .api_key           # Cached API key (gitignored)
├── .gitignore         # Ignores .api_key, .env, logs/, history/, workspace/.git/
├── history/           # Snapshot per cycle (0001-a3f1b2c/ — includes .call-stack.json)
└── logs/              # Full run logs (run-<timestamp>.log)
```
