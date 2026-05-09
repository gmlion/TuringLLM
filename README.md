# Turing

An LLM-powered universal Turing machine. A cycle loop invokes an LLM
once per cycle. The LLM reads its state (`MEMORY.md`) and program
(`INSTRUCTIONS.md`), matches the first instruction whose condition
fits, acts, and is destroyed. The cycle repeats until halt.

The shell is generic. **Interpreters** plug in to define how an
arbitrary user goal in `PROGRAM.md` is executed. They live under
`interpreters/<group>/<variant>/` and are copied into each new
instance.

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
        │ Git      │   │ main.ts  │   │ claude-code, │
        │ (auto-   │   │ (cycle   │   │ api, openai, │
        │  commit  │   │  loop,   │   │ ollama,      │
        │  per     │   │  retry,  │   │ local        │
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

## Usage

```bash
# Build
npm run build

# Create an instance with the default interpreter
./new-instance.sh my-project

# Or with a specific interpreter
./new-instance.sh my-a interpreters/1-iterative-refinement/a-self-refine
./new-instance.sh foo interpreters/2-planning-decomposition/a-plan-execute

# Edit the program
vim instances/my-project/PROGRAM.md

# Optional: configure provider/model in instances/my-project/.env
# (defaults to claude-code with Haiku)

# Run
instances/my-project/run.sh

# Visualize a running or completed instance
./visualize.sh my-project
```

Instances are resumable. Stop anytime (Ctrl+C or quota exceeded) and
restart with `run.sh` — the cycle counter picks up where it left off.

## Interpreters

Interpreters live under `interpreters/<group-number>-<group-slug>/`,
mirroring the taxonomy in
[`docs/agent-workflows/patterns.md`](docs/agent-workflows/patterns.md).
Within a group, variants are prefixed with `a-`, `b-`, `c-`, …
indicating a recommended exploration order, not strict prerequisites.

### Currently available

- **default** (no argument to `new-instance.sh`) — Step-by-step
  executor. Reads steps from `PROGRAM.md`, decomposes each into
  sub-instructions with verification, hands back to the strategy after
  each step.
- **`interpreters/1-iterative-refinement/`** — `generate → critique →
  revise` family ([patterns.md Group 1](docs/agent-workflows/patterns.md)).
  - `a-self-refine` — single role drafts, self-critiques, iterates.
  - `b-evaluator-optimizer` — generator + separate evaluator with
    explicit `## Criterion`.
  - `c-reflexion` — `b` plus distilled lessons accumulated in
    `## Lessons` across retries.
- **`interpreters/2-planning-decomposition/`** — Plan-and-Execute family
  ([patterns.md Group 2](docs/agent-workflows/patterns.md)). Three
  leaves with byte-equal `INSTRUCTIONS.md` and `operators/` differing
  only in their demo `PROGRAM.md`:
  - `a-plan-execute` — d1: TypeScript project setup.
  - `b-orchestrator-workers` — d2: summarise N technical notes.
  - `c-deep-research` — d3: open research prompt; exercises stack
    depth 2 via recursive `plan.md` push.
- **`interpreters/5-fixed-sop-teams/`** — Fixed-SOP teams
  ([patterns.md Group 5](docs/agent-workflows/patterns.md)).
  - `a-metagpt` — document hand-off SOP (PM → Architect → Engineer →
    QA).
  - `b-chatdev` — phase-dialogue SOP (design → coding → testing →
    documenting). Shares its demo `PROGRAM.md` with `a-metagpt` so
    outputs are directly comparable.

The agent-workflows roadmap
([`docs/agent-workflows/requirements.md`](docs/agent-workflows/requirements.md))
plans further phases — planning & decomposition, fixed-SOP teams, peer
collaboration, search, meta-frameworks — each pulling from a different
group of `patterns.md`.

### Creating a new interpreter

Create a directory `interpreters/<group-number>-<group-slug>/<letter>-<slug>/`
with at least `INSTRUCTIONS.md`. Add optional `*.md` files for role
descriptions, templates, etc. — they're copied into instances.
Optional `operators/` directory holds reusable instruction files (see
below).

`INSTRUCTIONS.md` structure:

```markdown
# Strategy: <Name>

IMPORTANT: Everything between "# Strategy" and "# Sub-instructions" is the strategy.
It must be copied VERBATIM into every update_instructions call. Never modify, summarize,
or omit any strategy instruction. Only the "# Sub-instructions" section below changes.

<one-paragraph description of what this interpreter does>

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

Key patterns:

1. **Strategy preservation** — the `IMPORTANT` block tells the LLM to
   copy the strategy section verbatim on every rewrite.
2. **State machine** — instructions match on MEMORY state strings via
   natural-language conditions. Every state must have a matching
   instruction. Unmatched states automatically transition to
   `waiting_for_user` so the user can intervene.
3. **Handback** — after a unit of work, state must loop back to a
   "pick next" instruction that reads PROGRAM.md. Without handback,
   the machine completes one thing and stalls.
4. **Decompose → execute → verify** — when work needs to happen, write
   sub-instructions in `# Sub-instructions`. Each action followed by
   verification. The last sub-instruction returns to the strategy.
5. **Project artifacts** go in `workspace/` (which has its own git
   repo). MEMORY.md and INSTRUCTIONS.md stay in the instance root.

## Operators (Call Stack)

An **operator** is a reusable instruction file invoked like a
subroutine. The running instruction set delegates by writing
`## Push` in MEMORY:

```
## Push
operators/self-critique.md
```

The shell saves the current `{state, instructions}` onto a call stack,
loads the operator as the new `INSTRUCTIONS.md`, and sets state to
`empty`. When the operator sets state to `done`, the shell pops the
stack, restores the caller's instructions, and sets state to
`{caller_state}_completed` — preventing the caller's original
instruction from immediately re-firing.

```
    ┌─── caller ───┐
    │ state: drafted                       ┌─ operator ─┐
    │ ## Push: operators/self-critique.md ─►│ state: empty
    └──────────────┘                       │ ...
                                           │ state: done ───┐
    ┌─── caller ───┐                       └────────────────┘
    │ state: drafted_completed ◄───────────────── pop
    └──────────────┘
```

- Operators can nest (an operator can push another).
- The stack is persisted to `.call-stack.json` and snapshotted into
  every `history/` entry.
- Missing push targets are logged and ignored — no frame is pushed.

Implementation: `src/call-stack.ts` (pure `applyPush` / `applyPop`
transforms), called from the cycle loop in `src/main.ts`. Unit-tested
under `src/test/`.

## Well-Known States

The shell intercepts these MEMORY states before each LLM invocation:

- **`done`** — if the call stack is empty, the machine halts. If an
  operator is active, the shell pops one frame and sets state to
  `{caller_state}_completed`. Cascade-pops while state remains `done`.
- **`waiting_for_user`** — the shell reads `## Pending Questions` from
  MEMORY, prompts the user one at a time (via stdin or Telegram if
  configured), writes answers to `## Answers`, and sets state to
  `user_responded`. Only triggered when all remaining work is blocked
  on unanswered questions.
- **unmatched state** — if no instruction's condition matches, the
  shell automatically enters `waiting_for_user` and asks for guidance.

## Providers

All providers except `claude-code` use the same custom tools (`bash`,
`write_file`, `git`, `update_instructions`) with the shell managing
the tool call loop. Configured via `TURING_PROVIDER` (set in `.env`
or shell env). All providers cap retries at 20 for incomplete cycles.

| Provider | Description | Required env |
|---|---|---|
| `claude-code` (default) | Invokes `claude -p` as a subprocess with native CC tools (Bash, Write, Edit). CC manages its own tool loop. | — (uses your installed Claude Code) |
| `api` | Anthropic SDK with managed tool loop. | `ANTHROPIC_API_KEY`, optional `ANTHROPIC_MODEL` |
| `openai` | OpenAI-compatible API with function calling. | `OPENAI_API_KEY`, optional `OPENAI_BASE_URL`, `OPENAI_MODEL` |
| `ollama` | Native Ollama API with streaming output. | `OLLAMA_BASE_URL`, `OLLAMA_MODEL` |
| `local` | Loads a GGUF model in-process via `node-llama-cpp`. No server. | `LOCAL_MODEL_PATH` (file) or `LOCAL_MODEL_URI` (HF) |

Other shared knobs:

- `BASH_TIMEOUT` — seconds for `bash` tool commands (default 300, set
  to 0 to disable).
- `TELEGRAM_BOT_TOKEN` + `TELEGRAM_CHAT_ID` — when both are set, user
  questions are sent via Telegram instead of stdin.
  `./setup-telegram.sh <TOKEN>` autodetects the chat ID.

## Two Git Repos Per Instance

- **Machine git** (instance root) — Hardwired. Each instance gets its
  own `.git`. Auto-commits all files after each cycle with message
  `cycle N: <state>`. History dirs include the short hash:
  `history/0042-a3f1b2c/`.
- **Project git** (`workspace/`) — LLM-controlled via the `git` tool.
  The LLM can branch, commit, diff, checkout freely. Used for
  exploring alternative approaches.

The machine git ignores `workspace/.git/` so nested repos don't conflict.

## Instance Structure

```
instances/foo/
├── PROGRAM.md         # User's program (read-only to machine)
├── .root-operator     # Marker pointing at canonical operator (e.g. "operators/refine.md")
├── .call-stack.json   # Saved call stack; stack[0] is always the root frame
├── .env               # Provider/model config (gitignored)
├── workspace/         # Project artifacts (has its own git repo)
├── operators/         # Reusable instruction files copied from the interpreter
├── frames/
│   ├── f000-<operator-slug>/  # Root frame (always present; slug = operator basename)
│   │   ├── INSTRUCTIONS.md    # Operator content with {{program}} substituted
│   │   ├── MEMORY.md          # Current state; may contain ## Push / ## Return
│   │   └── scoped/            # Per-frame heap files (draft.md, etc.)
│   └── f001-<slug>/           # Pushed frames appear here while active
│       ├── INSTRUCTIONS.md
│       ├── MEMORY.md
│       └── scoped/
├── OUTPUT.md          # Written on halt; one section per ## Return key from root frame
├── run.sh             # Launch script
├── .api_key           # Cached API key (gitignored)
├── .gitignore         # Ignores .api_key, .env, logs/, history/, workspace/.git/
├── history/           # Snapshot per cycle (0001-a3f1b2c/ — includes .call-stack.json)
└── logs/              # Full run logs (run-<timestamp>.log)
```

## Source Layout

- `src/main.ts` — cycle loop, git auto-commit, history snapshots, user
  interaction, provider dispatch, stack management
- `src/call-stack.ts` — pure push/pop transforms + persistence to
  `.call-stack.json`
- `src/memory.ts` — pure parsers/transforms over MEMORY.md sections
- `src/prompt.ts` — system + user prompt construction
- `src/tools.ts` — tool definitions (bash, write_file, git,
  update_instructions) and execution
- `src/providers/` — one file per provider plus `shared.ts`
- `src/telegram.ts` — non-blocking user questions via Telegram
- `src/test/` — `node:test` suite (`npm test` builds + runs)

## Further reading

- [`docs/agent-workflows/patterns.md`](docs/agent-workflows/patterns.md)
  — taxonomy of agentic patterns, with citations. Source of truth for
  group numbering.
- [`docs/agent-workflows/requirements.md`](docs/agent-workflows/requirements.md)
  — phased rollout plan: which patterns become interpreters in which
  order, and which operators they share.
- [`docs/agent-workflows/phase-1-notes.md`](docs/agent-workflows/phase-1-notes.md)
  — implementation notes from Phase 1 (iterative refinement).
- [`CLAUDE.md`](CLAUDE.md) — project-specific guidance for Claude Code
  agents working on this repo.

## License

Apache License 2.0 — see [`LICENSE`](LICENSE) and [`NOTICE`](NOTICE).
