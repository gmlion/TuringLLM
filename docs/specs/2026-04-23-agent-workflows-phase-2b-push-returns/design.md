# Design: agent-workflows Phase 2b — isolated MEMORY per frame with declared returns

## Overview

Each frame becomes its own directory containing its own `MEMORY.md`,
`INSTRUCTIONS.md`, and `scoped/` subtree. The shell points the LLM
at the active frame by setting cwd before every cycle; all LLM-side
file paths are resolved relative to that cwd, which means drafts,
lists, and other per-frame state are physically isolated at the
filesystem level rather than fenced by in-shell string shuffling.
Push creates a new frame directory; pop deletes it after splicing
the child's declared `## Return` entries into the caller's on-disk
`MEMORY.md`. `PROGRAM.md` and `workspace/` stay at the instance root
and are reached via the invariant relative paths `../../PROGRAM.md`
/ `../../workspace/` from any frame. The pre-Phase-2b single-file
layout is dropped outright: existing instances are deleted, no
backward-compat code path is preserved, and `new-instance.sh`
creates the `frames/f000-strategy/` layout directly. Core
trade-off: isolation is path-based (the child is never told the
parent's frame path), not ACL-enforced; a misbehaving LLM that
traverses with `..` is still physically capable of reaching sibling
frames, but nothing in the prompt directs it to do so.

## Requirement coverage

| R#  | Summary                                                              | Addressed in                                               |
| --- | -------------------------------------------------------------------- | ---------------------------------------------------------- |
| R1  | Caller MEMORY survives push on-disk in caller frame dir              | §Architecture → push flow, §Data model → StackEntry        |
| R2  | Fresh MEMORY.md written at child frame dir, State=empty only         | §Architecture → push flow, §API → applyPush                |
| R3  | Pop splices ## Return directly into caller on-disk MEMORY            | §Architecture → pop flow, §API → applyPop                  |
| R4  | nextCounter persisted in .call-stack.json; starts at 1               | §Data model → CallStack                                    |
| R5  | Frame dir naming: instances/<n>/frames/f<NNN>-<slug>/ with 3 files   | §Architecture → frame-dir naming, §API → formatFrameDir    |
| R6  | Pop deletes the popped frame directory recursively                   | §Architecture → pop flow, §API → applyPop                  |
| R7  | new-instance.sh creates frames/f000-strategy/ at instance creation   | §Architecture → bootstrap, §API → new-instance.sh          |
| R8  | mkdirSync/rmSync recursive (cross-platform, no shell-out)            | §Architecture → cross-platform notes                       |
| R9  | Failed push does not create dir or increment nextCounter             | §Architecture → push flow ordering                         |
| R10 | ~~{{scope_dir}} substitution in target INSTRUCTIONS~~                | §Architecture → superseded requirements                    |
| R11 | ~~Bootstrap substitution of {{scope_dir}}~~                          | §Architecture → superseded requirements                    |
| R12 | ~~## Scope section in MEMORY~~                                       | §Architecture → superseded requirements                    |
| R13 | Parse ## Return with same grammar as ## Push-Args                    | §API → parseReturn                                         |
| R14 | Splice return entries as ## <CapitalizedKey> sections                | §API → spliceReturns, §Architecture → pop flow             |
| R15 | Missing ## Return: pop proceeds, log, no failure                     | §Error handling                                            |
| R16 | Malformed ## Return entries skipped individually                     | §Error handling                                            |
| R17 | .call-stack.json = { nextCounter, stack: [frameDirName, ...] }       | §Data model → CallStack persistence                        |
| R18 | ~~Backward-compat load of bare-array .call-stack.json~~              | §Architecture → superseded requirements                    |
| R19 | System prompt surgical-edit subsection with ≥3 examples              | §Architecture → system prompt addendum                     |
| R20 | Exemption list: MEMORY.md, INSTRUCTIONS.md, PROGRAM.md               | §Architecture → system prompt addendum                     |
| R21 | a-self-refine migration                                              | §Interpreter retrofits → a                                 |
| R22 | b-evaluator-optimizer migration                                      | §Interpreter retrofits → b                                 |
| R23 | c-reflexion migration (lessons.md surgical append)                   | §Interpreter retrofits → c                                 |
| R24 | d-cove migration (verifications.md surgical sed)                     | §Interpreter retrofits → d                                 |
| R25 | b's and c's evaluate.md byte-equality preserved                      | §Interpreter retrofits → byte-equality                     |
| R26 | Reflexion still accumulates ≥2 lessons                               | §Test strategy → phase-1-reflexion                         |
| R27 | Depth-2 invariant: stack length 2 (strategy+verify) or 3             | §Test strategy → phase-2-cove                              |
| R28 | CLAUDE.md documents frame layout + canonical schema + conventions    | §Documentation                                             |
| R29 | Group README describes frame dir usage per interpreter               | §Documentation                                             |
| R30 | agent-workflows requirements.md updated for Phase 2b                 | §Documentation                                             |
| R31 | phase-2b-notes.md created                                            | §Documentation                                             |
| R32 | All existing tests pass after updates                                | §Test strategy → retrofit existing tests                   |
| R33 | New unit tests: frame dir lifecycle, Return parse, splicing, etc.    | §Test strategy → new test files                            |
| R34 | d-cove live demo halts at done with ## Revised, no drift             | §Test strategy → live demos                                |
| R35 | a/b/c live demos halt with expected observable outputs               | §Test strategy → live demos                                |
| R36 | Retry-budget exhaustion uses existing exit path                      | §Error handling                                            |
| R37 | Shell sets cwd to active frame dir before each LLM cycle             | §Architecture → cwd handoff, §API → frame-aware paths      |
| R38 | System prompt documents frame-specific cwd + invariant paths         | §Architecture → system prompt addendum                     |
| R39 | new-instance.sh creates frames/f000-strategy/ with 3 files, no root  | §Architecture → bootstrap, §API → new-instance.sh          |
| R40 | PROGRAM.md / workspace/ at instance root; ../../ access from frames  | §Architecture → file layout                                |
| R41 | history/ snapshots capture the entire frames/ subtree                | §Architecture → history snapshots, §API → snapshot         |
| R42 | config.ts path exports become frame-aware resolvers; providers OK    | §API → config changes, §Architecture → cwd handoff         |
| R43 | Docs state pre-2b instances cannot resume; no compat code anywhere   | §Documentation                                             |
| R44 | rm -rf every existing instance dir in the same commit as R39         | §Architecture → cleanup, §Documentation                    |

## Architecture

### File layout

```
instances/foo/
├── PROGRAM.md              # unchanged location (R40)
├── workspace/              # unchanged location, own git repo (R40)
├── .env                    # unchanged
├── .api_key                # unchanged
├── .gitignore              # unchanged
├── .call-stack.json        # NEW shape: { nextCounter, stack: [frameDirName...] }
├── frames/                 # NEW — all per-frame state lives here (R5, R7)
│   ├── f000-strategy/
│   │   ├── INSTRUCTIONS.md
│   │   ├── MEMORY.md
│   │   └── scoped/         # drafts, lessons, criterion, etc.
│   ├── f001-verify/        # present only while stack depth ≥ 1
│   │   ├── INSTRUCTIONS.md
│   │   ├── MEMORY.md
│   │   └── scoped/
│   └── f002-answer-independently/
│       ├── INSTRUCTIONS.md
│       ├── MEMORY.md
│       └── scoped/
├── dynamics/               # unchanged (copied from interpreter at create-time)
├── run.sh                  # unchanged
├── history/                # NEW contents: each snapshot now holds full frames/ subtree (R41)
└── logs/                   # unchanged
```

The legacy `instances/foo/INSTRUCTIONS.md`, `instances/foo/MEMORY.md`,
and `instances/foo/SYSCALLS.md` at the instance root **cease to
exist**; they migrate to `frames/f000-strategy/`.

### Source-tree changes (delta vs. current codebase)

```
src/
├── config.ts               # MEMORY_PATH / INSTRUCTIONS_PATH removed; new resolvers (R42)
├── main.ts                 # cwd handoff per cycle, bootstrap uses frames/, snapshot/git updates
├── call-stack.ts           # applyPush/Pop rewrite, new StackEntry shape, formatFrameDir, slugFromTarget
├── memory.ts               # adds parseReturn, removeReturn, spliceReturns
├── prompt.ts               # adds cwd/frame + surgical-edit subsections (R19, R38)
├── git.ts                  # history snapshot captures frames/ subtree (R41)
└── providers/*.ts          # unchanged at the source level; receive frame-aware paths from main.ts

new-instance.sh             # rewritten to create frames/f000-strategy/ (R7, R39)
                            # plus the rm -rf cleanup step (R44)

interpreters/1-iterative-refinement/
├── a-self-refine/          # retrofit (R21)
├── b-evaluator-optimizer/  # retrofit (R22)
├── c-reflexion/            # retrofit (R23, R25)
└── d-cove/                 # retrofit (R24)

src/test/
├── memory.test.ts          # extend: parseReturn, removeReturn, spliceReturns
├── push-args.test.ts       # extend: applyPush with CallStack object, frame dir return
├── stack-integration.test.ts   # extend: caller MEMORY persists on disk across push
├── phase-2b-returns.test.ts    # NEW: end-to-end push/pop/splice + cwd semantics
├── phase-1-self-refine.test.ts         # retrofit
├── phase-1-evaluator-optimizer.test.ts # retrofit
├── phase-1-reflexion.test.ts           # retrofit (R26)
├── phase-2-cove.test.ts                # retrofit (R27)
└── phase-1-dynamics-identity.test.ts   # unchanged (R25)

docs/
├── agent-workflows/
│   ├── requirements.md     # updated (R30)
│   └── phase-2b-notes.md   # NEW (R31)
└── (CLAUDE.md at repo root) # updated (R28)
```

### Frame-dir naming (R5)

```
instances/<name>/frames/f<NNN>-<slug>/
```

- **`<NNN>`**: `nextCounter` value, zero-padded to 3 digits. Width
  widens beyond 3 digits if counts ever reach 1000+ (lexical sort is
  preserved because every value in the same padding bucket sorts
  together).
- **`<slug>`**: for a pushed dynamic, `basename(target, '.md')` with
  every character outside `[a-zA-Z0-9_-]` replaced by `_`
  (`dynamics/answer-independently.md` → `answer-independently`). For
  the root frame, the literal string `strategy`.

Each frame directory contains exactly three entries at creation:

1. `INSTRUCTIONS.md` — copied/populated from the push target (with
   `## Push-Args` substitutions applied).
2. `MEMORY.md` — initialized to `## State\nempty\n`.
3. `scoped/` — empty directory, used by the LLM for per-frame
   structured state via surgical edits (R19).

### Push flow (applyPush) — R1, R2, R5, R9

```
input: callStack, callerMemory (string), readTarget
       (applyPush becomes pure modulo readTarget, same shape as Phase 2)

1. target = parsePush(callerMemory)
   - null → { ok: false, reason: "no-push" }

2. args = parsePushArgs(callerMemory)

3. content = readTarget(target)
   - null → { ok: false, reason: "missing-target",
              memory: removePushArgs(removePush(callerMemory)) }

4. newCounter = callStack.nextCounter
   frameDir = formatFrameDir(newCounter, slugFromTarget(target))
     # e.g. "frames/f001-verify"
   (no mkdir yet, no counter increment yet — R9)

5. substituted, unresolved = substitutePlaceholders(content, args)
   - unresolved non-empty → failure, strip Push/Push-Args, return

6. newEntry = { returnState: parseState(callerMemory), frameDir }
   newStack = [...callStack.stack, newEntry]
   newCallStack = { nextCounter: newCounter + 1, stack: newStack }

7. return { ok: true,
            callStack: newCallStack,
            callerMemoryAfter: removePushArgs(removePush(callerMemory)),
            childInstructions: substituted,
            childMemory: "## State\nempty\n",
            frameDir, target }
```

**Main.ts responsibilities after a successful push** (the I/O side):

- `mkdirSync(instances/<name>/<frameDir>/scoped, { recursive: true })` — creates frame + scoped subdirs (R8).
- Write `childInstructions` → `<frameDir>/INSTRUCTIONS.md`.
- Write `childMemory` → `<frameDir>/MEMORY.md`.
- Write `callerMemoryAfter` → caller's frame's `MEMORY.md` (strips `## Push`/`## Push-Args` from it).
- Persist `newCallStack` → `.call-stack.json`.
- Set cwd for the next cycle to `instances/<name>/<frameDir>` (R37).

### Pop flow (applyPop) — R3, R6, R13–R16

```
input: callStack
       childMemory (string, read from the active frame's MEMORY.md)

1. cascadePops: while parseState(childMemory) == "done" AND callStack.stack.length > 1:
   - frame = callStack.stack.pop()
   - returns, malformedLines = parseReturn(childMemory)
     # may be empty if section absent (R15)
     # malformed entries already skipped during parse (R16)
   - callerFrameDir = callStack.stack[top].frameDir
                       OR frames/f000-strategy for the root
   - callerMemory = readFile(instances/<name>/<callerFrameDir>/MEMORY.md)
   - callerMemory = setState(callerMemory, frame.returnState + "_completed")
   - callerMemory = spliceReturns(callerMemory, returns)    # (R14)
   - writeFileSync(instances/<name>/<callerFrameDir>/MEMORY.md, callerMemory)
   - events.push({ returnState: frame.returnState,
                   depthAfter: callStack.stack.length,
                   frameDir: frame.frameDir,
                   splicedKeys: Object.keys(returns),
                   missingReturn: Object.keys(returns).length === 0,
                   malformedLines })
   - nextChildMemory for cascade check:
     - if cascading (still might hit "done"), read caller's memory
       (just updated above) again
     - if not cascading, exit loop
   (subtlety: because caller's state is now <returnState>_completed,
   parseState(callerMemory) != "done", so the loop exits naturally
   after one pop — cascading only happens if the caller itself also
   has state "done" after the splice, which is unusual.)

2. For each event, main.ts calls rmSync(instances/<name>/<event.frameDir>,
   { recursive: true, force: true }) — (R6, R8).

3. Persist callStack → .call-stack.json.

4. Set cwd to the new top-of-stack frame dir.
```

Unlike Phase 2, `applyPop` does **not** restore a memory string from
the frame — the frame didn't carry one. The caller's `MEMORY.md` has
been sitting on disk undisturbed since the push (it lives in the
caller's frame directory, not the child's), so "restore" reduces to
"read the caller's on-disk MEMORY and splice returns into it".

**Root is on the stack.** The root frame (`frames/f000-strategy/`) is
pre-populated as `stack[0]` at instance creation (by
`new-instance.sh`; see §Bootstrap), so the stack is never empty at
runtime. This simplifies three code paths:

- **Cwd handoff**: always `callStack.stack[top].frameDir` — no "empty
  stack = strategy" fallback.
- **Pop cascade**: stops at `stack.length === 1` (root remains).
  Root is never popped and its `scopeDir` is never rmSync'd.
- **Halt detection**: `parseState(rootMemory) === "done" && stack.length === 1`.
  When the strategy's state reaches `done` and only the root entry
  is on the stack, the machine halts.

The root entry's `returnState` is a fixed sentinel string `"<root>"`
— never consumed as `<returnState>_completed` since root is never
popped. The sentinel serves only to keep the type consistent
(`StackEntry = { returnState, frameDir }` with both fields required).

### Cwd handoff (R37)

`main.ts`'s cycle loop establishes, before every LLM invocation:

```
activeFrameDir = callStack.stack[callStack.stack.length - 1].frameDir
cwd = resolve(INSTANCE_DIR, activeFrameDir)
```

No fallback branch is needed because the root frame is always on the
stack (see §Pop flow's "Root is on the stack" note).

`cwd` is then passed to the provider as:

- For `claude-code` (subprocess): included in the `execSync` /
  `spawn` options so `claude -p` inherits it.
- For API / OpenAI / Ollama / local providers: used to compute the
  concrete `memoryPath` and `instructionsPath` passed into the
  existing provider signatures (providers already take these as
  parameters — see `src/providers/shared.ts`).

The bash tool's `execSync(command, { cwd: BASE_DIR })` call (currently
in `src/main.ts`, tool-execution path) is updated to use the active
frame dir instead of `BASE_DIR`.

### Bootstrap (R7, R39)

Bootstrap responsibility moves **out of the shell** and **into
`new-instance.sh`**. By the time the shell first runs for an instance,
the `frames/f000-strategy/` directory already exists fully populated,
and `.call-stack.json` already contains the root stack entry:

```
# new-instance.sh (pseudocode outline)
DIR="instances/$NAME"
mkdir -p "$DIR/frames/f000-strategy/scoped"
cat > "$DIR/frames/f000-strategy/MEMORY.md" << 'EOF'
## State
empty
EOF

if interpreter specified:
  cp "$INTERP_DIR/INSTRUCTIONS.md" "$DIR/frames/f000-strategy/INSTRUCTIONS.md"
  for each supporting *.md in interpreter (besides INSTRUCTIONS.md):
    cp into "$DIR/frames/f000-strategy/<base>"   # support files are strategy-local
  if interpreter has dynamics/:
    cp -r "$INTERP_DIR/dynamics" "$DIR/dynamics"   # dynamics stay at instance root
else:
  write default strategy INSTRUCTIONS.md into "$DIR/frames/f000-strategy/INSTRUCTIONS.md"

cat > "$DIR/PROGRAM.md" << 'EOF'
...template...
EOF

# .call-stack.json initialized with the root frame on the stack
echo '{"nextCounter":1,"stack":[{"returnState":"<root>","frameDir":"frames/f000-strategy"}]}' > "$DIR/.call-stack.json"
```

Dynamics live at `instances/<name>/dynamics/*.md` (instance root).
When a frame pushes a dynamic, the push target path is relative to
the instance root (e.g. `dynamics/verify.md` as today). The shell
reads that file from `instances/<name>/dynamics/verify.md` — NOT from
the active frame's cwd — because dynamics are shared across all
frames and should not be duplicated per-frame. `readTarget` in
`applyPush` uses `resolve(INSTANCE_DIR, target)` for the read.

### Cleanup of pre-Phase-2b instances (R44)

As part of the same commit that rewrites `new-instance.sh`, the
implementation performs `rm -rf instances/<name>/` for every
directory present in `instances/` at the time. The `instances/`
directory itself is retained (empty). Since `instances/` is
`.gitignored`, this is a local filesystem operation only — no git
commit of deletion is required. The implementer lists each deleted
directory in the commit message for auditability.

### System prompt addendum (R19, R20, R38)

`src/prompt.ts` today contains the canonical MEMORY-writing recipe.
Phase 2b replaces the single `# MEMORY.md` subsection with two
sibling subsections and adds a frame-context subsection.

Outline of the three subsections (actual prose in `src/prompt.ts`):

**1. Frame context (NEW — R38).**

> You are running inside a frame-specific directory at
> `instances/<name>/frames/f<NNN>-<slug>/`. Your cwd has been set to
> this directory before the cycle started. Paths you reference
> resolve as follows:
>
> - `./MEMORY.md` — your frame's MEMORY (write via the canonical recipe below).
> - `./INSTRUCTIONS.md` — your frame's program.
> - `./scoped/` — your frame's scratch directory for structured state (drafts, lists, tables).
> - `../../PROGRAM.md` — the shared user program (read-only to the machine).
> - `../../workspace/` — the shared project artifacts directory, with its own git repo; the `git` tool operates there.
>
> These relative paths are invariant regardless of stack depth (every
> frame sits one directory below `instances/<name>/frames/`, so
> `../..` always lands at the instance root).

**2. MEMORY.md (unchanged recipe — R20 exempt file).**

`cat > MEMORY.md << 'MEMEOF' ... MEMEOF`, etc. As today.

**3. Mutating other files (NEW — R19).**

> For every file other than `./MEMORY.md`, `./INSTRUCTIONS.md`, and
> `../../PROGRAM.md`, do not rewrite the file wholesale. Use
> surgical in-place edits: `sed -i`, `awk` piped to a temp-file
> rename, `echo >>` for appends. Wholesale rewrites of structured
> files (bullet lists, tables) are a silent drift source.
>
> Examples:
> - Mark the first pending bullet as answered:
>   `sed -i '0,/^- V[0-9]\\+:.*pending$/{s/pending$/answered: <text>/}' ./scoped/verifications.md`
> - Append a new bullet to a list:
>   `echo "- L<N>: <text>" >> ./scoped/lessons.md`
> - Read a single entry:
>   `grep '^- V3:' ./scoped/verifications.md`

### History snapshots (R41)

Today, `snapshot(cycle, hash)` in `src/main.ts` copies three files into
`history/NNNN-<hash>/`: `MEMORY.md`, `INSTRUCTIONS.md`,
`.call-stack.json`. Under Phase 2b, the snapshot recursively copies:

- `.call-stack.json`
- The entire `frames/` subtree (preserving the per-frame structure,
  including `MEMORY.md`, `INSTRUCTIONS.md`, and `scoped/` within each
  frame dir)

Disk cost grows proportional to stack depth at snapshot time, but
peak depth is bounded (2–3 in all current interpreters). Each
snapshot is a one-shot recursive copy via Node's `cpSync(src, dst,
{ recursive: true })`.

### Superseded requirements (R10, R11, R12, R18)

- **R10, R11** (`{{scope_dir}}` substitution): gone. The LLM doesn't
  need a substituted path because its cwd IS the scope. Any interpreter
  author who would have written `cat {{scope_dir}}/draft.md` now
  writes `cat ./scoped/draft.md`.
- **R12** (`## Scope` section): gone. There's no runtime lookup that
  needs to parse the scope path out of MEMORY — cwd is implicit for
  the LLM, and `callStack.stack[top].frameDir` is explicit for the
  shell. No in-MEMORY duplication needed.
- **R18** (backward-compat load of bare-array `.call-stack.json`):
  gone per R43/R44. The new shape is loaded; no compat branch. If an
  instance's `.call-stack.json` is the old array form, the shell may
  fail on load — but by R44, there are no old instances left.

### Cross-platform notes (R8)

All filesystem operations go through Node's `fs`:
`mkdirSync(path, { recursive: true })`, `rmSync(path, { recursive:
true, force: true })`, `cpSync(src, dst, { recursive: true })`. No
shell-outs, no symlinks, no platform-specific path handling. The `cd`
for cwd handoff is set per-subprocess-invocation via provider
parameters, not via `process.chdir()` globally (avoids global-state
hazards in a single Node process).

## Data model

### Canonical per-frame MEMORY schema (R2)

Every frame's `MEMORY.md` conforms to a fixed shell-aware schema. The
schema is deliberately small because structured content lives in
`scoped/` files, not in MEMORY.

| Section                      | Who writes                     | Lifetime                                        | Notes                                                 |
| ---------------------------- | ------------------------------ | ----------------------------------------------- | ----------------------------------------------------- |
| `## State`                   | LLM                            | mutates per cycle                               | Unchanged from Phase 1.                               |
| `## Push`                    | LLM (before push)              | stripped by shell on push                       | Unchanged from Phase 2.                               |
| `## Push-Args`               | LLM (before push)              | stripped by shell on push                       | Unchanged from Phase 2.                               |
| `## Return`                  | LLM (before pop, state=done)   | consumed by shell on pop                        | NEW. Same grammar as `## Push-Args`.                  |
| `## Matched Instruction`, `## Last Action`, `## Result` | LLM | per cycle                                       | Cycle metadata; not structural.                       |
| `## <Key>` (spliced returns) | shell on pop                   | persists until LLM mutates                      | Key derived from child's `## Return` entry.           |
| `## Pending Questions`, `## Answers` | LLM / shell                    | lives until consumed                            | Unchanged from Phase 1 (user-interaction flow).       |

No `## Scope` section (per the R12 supersedence).

### `StackEntry` (R17)

```ts
type StackEntry = {
  returnState: string;  // state to restore (as "<returnState>_completed")
                        // or the sentinel "<root>" for the root frame
  frameDir: string;     // e.g. "frames/f001-verify" — relative to instance root
};
```

The Phase-2 `instructions` field is gone — INSTRUCTIONS.md lives on
disk in `<frameDir>/INSTRUCTIONS.md`, not in the stack entry.

The root frame (`frames/f000-strategy`) is always `stack[0]` with
`returnState: "<root>"`. Pop never fires on the root; its sentinel is
never consumed as `<state>_completed`.

### `CallStack` persistence (R4, R17)

```ts
type CallStack = {
  nextCounter: number;
  stack: StackEntry[];
};
```

On disk (`.call-stack.json`) mid-cycle with depth 3 (strategy pushed
verify, verify pushed answer-indep):

```json
{
  "nextCounter": 3,
  "stack": [
    { "returnState": "<root>",  "frameDir": "frames/f000-strategy" },
    { "returnState": "drafted", "frameDir": "frames/f001-verify" },
    { "returnState": "asking",  "frameDir": "frames/f002-answer-independently" }
  ]
}
```

Root frame (strategy) IS on the stack as `stack[0]`. Stack is never
empty at runtime. `stack.length === 1` means only root is active
(push depth 0); `stack.length === 2` means one dynamic is pushed;
and so on — `stack.length - 1` is the push depth.

`nextCounter` starts at 1 (f000 is reserved for the strategy, created
by `new-instance.sh` along with the root stack entry) and increments
once per successful push.

### `PushResult` discriminated union (R2, R9)

```ts
type PushResult =
  | {
      ok: true;
      callStack: CallStack;
      callerMemoryAfter: string;   // caller's MEMORY with Push/Push-Args stripped
      childMemory: string;         // "## State\nempty\n"
      childInstructions: string;   // substituted push target
      frameDir: string;            // relative path, e.g. "frames/f001-verify"
      target: string;              // original push target
    }
  | { ok: false; memory: string; reason: "no-push" }
  | { ok: false; memory: string; reason: "missing-target"; target: string }
  | {
      ok: false;
      memory: string;
      reason: "unresolved-placeholder";
      target: string;
      placeholders: string[];
    };
```

The `ok: true` branch splits what used to be a single `memory` field
into `callerMemoryAfter` and `childMemory` — they go to different
files now.

### `PopResult` / `PopEvent` (R3, R6, R13–R16)

```ts
type PopEvent = {
  returnState: string;
  depthAfter: number;
  frameDir: string;                // for rmSync in main.ts
  splicedKeys: string[];
  missingReturn: boolean;
  malformedLines: string[];
};

type PopResult = {
  callStack: CallStack;
  callerMemoryAfter: string;       // caller MEMORY post-splice (for main.ts to write)
  callerFrameDir: string;          // so main.ts knows where to write callerMemoryAfter
  events: PopEvent[];
};
```

## Interfaces / API

### `src/memory.ts` additions

```ts
// Parse a ## Return section (top-of-memory, grammar identical to
// parsePushArgs). Returns entries + any malformed lines for logging.
// satisfies: R13, R16
export function parseReturn(memory: string): {
  entries: Record<string, string>;
  malformedLines: string[];
};

// Strip the ## Return section from MEMORY (symmetric with removePushArgs).
// Exported for completeness; not strictly required in the pop path
// since the child's MEMORY is consumed whole by applyPop.
// satisfies: R14 (by symmetry)
export function removeReturn(memory: string): string;

// Splice entries into caller MEMORY as ## <Capitalized> sections.
// Upsert semantics: replace an existing section's body in place,
// or append a new section at the end.
// Capitalization: first char upper-cased, remaining chars unchanged.
// satisfies: R14
export function spliceReturns(
  callerMemory: string,
  returns: Record<string, string>,
): string;
```

### `src/call-stack.ts` additions / changes

```ts
// Frame-dir naming helper. Pure string transform.
// satisfies: R5
export function formatFrameDir(counter: number, slug: string): string;

// Slug derivation (basename + sanitize).
// satisfies: R5
export function slugFromTarget(target: string): string;

// Updated loaders — always return the new shape; no bare-array compat (R18 dropped).
// If the JSON on disk is malformed or the old shape, loadCallStack
// returns { nextCounter: 1, stack: [] } and logs a warning. (The
// R44 cleanup step means the old shape should never actually appear.)
// satisfies: R17
export function loadCallStack(path: string): CallStack;
export function saveCallStack(path: string, callStack: CallStack): void;

// applyPush — extended (see §Push flow).
// satisfies: R1, R2, R5, R9
export function applyPush(
  callStack: CallStack,
  callerMemory: string,
  readTarget: (path: string) => string | null,
): PushResult;

// applyPop — extended (see §Pop flow).
// Takes a readFrame callback so it can read the caller's on-disk MEMORY
// to splice returns into. Pure modulo readFrame.
// satisfies: R3, R14, R15, R16
export function applyPop(
  callStack: CallStack,
  childMemory: string,
  readFrame: (frameDir: string, file: "MEMORY.md") => string,
): PopResult;
```

### `src/config.ts` changes (R42)

The static exports `MEMORY_PATH` and `INSTRUCTIONS_PATH` are
removed. In their place:

```ts
// satisfies: R42
export function activeFramePaths(callStack: CallStack): {
  frameDir: string;                // absolute path
  memoryPath: string;
  instructionsPath: string;
};
```

`HISTORY_DIR`, `SYSCALLS_PATH`, `CALL_STACK_PATH`, and all other
exports unrelated to per-frame state stay as-is. `SYSCALLS_PATH` —
used by stateful mode — stays at the instance root because it's a
shell-level stream, not per-frame state.

Providers (already take `memoryPath` / `instructionsPath` as
parameters, not as module-level constants) are untouched. Main.ts
calls `activeFramePaths(callStack)` once per cycle and passes the
results to the provider.

### `src/main.ts` changes

- Cycle-loop prelude (after `applyPop`, before LLM invocation): compute `activeFramePaths(callStack)`, pass `memoryPath`/`instructionsPath` to `runCycle(...)` — signatures unchanged from Phase 2.
- `readFile(MEMORY_PATH)` → `readFile(activeFramePaths(callStack).memoryPath)` everywhere. Similar for writes.
- `snapshot(cycle, hash)` (R41): replace `copyFileSync` calls with `cpSync(INSTANCE_DIR + "/frames", HISTORY_DIR + "/NNNN-<hash>/frames", { recursive: true })` plus `.call-stack.json`.
- Bash tool invocation path: `execSync(command, { cwd: activeFrameDir })` instead of `{ cwd: BASE_DIR }`.
- Subprocess providers (claude-code): `spawn(...)` receives `cwd: activeFrameDir` in the options.

### `src/git.ts` changes (R41 touches this too)

`commitCycle` currently uses `git add -A` at `instanceDir` — this
already captures `frames/` naturally. No semantic change there. The
only update is informational: `src/git.ts`'s `log` statements can
mention which frame was active.

### `new-instance.sh` rewrite (R7, R39, R44)

```
#!/usr/bin/env bash
set -euo pipefail

# (usage check + arg parsing — unchanged)

# === R44: cleanup pre-Phase-2b instances ===
# Performed as a separate one-shot migration commit, NOT inside
# new-instance.sh itself. new-instance.sh just creates the new
# instance in the new layout; the cleanup of old instances is a
# manual rm -rf during the Phase 2b implementation.

mkdir -p "$DIR/frames/f000-strategy/scoped"

# PROGRAM.md — instance root (unchanged content, unchanged location)
cat > "$DIR/PROGRAM.md" << 'EOF'
...template...
EOF

# INSTRUCTIONS.md — now at frames/f000-strategy/
if interpreter specified:
  cp "$INTERP_DIR/INSTRUCTIONS.md" "$DIR/frames/f000-strategy/INSTRUCTIONS.md"
  # Support files (role descriptions, palindrome harness, etc.) stay
  # with the strategy frame — they were addressed by strategy actions
  # relative to the instance root before, now relative to cwd.
  for f in "$INTERP_DIR"/*.md:
    base="$(basename "$f")"
    if [ "$base" != "INSTRUCTIONS.md" ]; then
      cp "$f" "$DIR/frames/f000-strategy/$base"
    fi
  # Dynamics live at the instance root (shared across frames)
  if [ -d "$INTERP_DIR/dynamics" ]; then
    cp -r "$INTERP_DIR/dynamics" "$DIR/dynamics"
  fi
else:
  cat > "$DIR/frames/f000-strategy/INSTRUCTIONS.md" << 'INSTEOF'
  ...default strategy...
  INSTEOF

# MEMORY.md — at the strategy frame
cat > "$DIR/frames/f000-strategy/MEMORY.md" << 'EOF'
## State
empty
EOF

# .call-stack.json — new shape
echo '{"nextCounter":1,"stack":[]}' > "$DIR/.call-stack.json"

# .gitignore, .env template, run.sh — unchanged locations at instance root

echo "Instance '$NAME' created at $DIR/"
```

## Error handling

| Trigger                                                      | Mitigation                                                                                                            | R#      |
| ------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------- | ------- |
| `## Push` target missing or empty                            | `missing-target`; strip `## Push` + `## Push-Args` from caller MEMORY; no mkdir; no counter increment; log.            | R9      |
| Unresolved `{{placeholder}}` after substitution              | `unresolved-placeholder`; strip both; no mkdir; no counter increment; log with placeholder list.                       | R9      |
| Child sets `state=done` without `## Return`                  | Pop proceeds; no splice; caller MEMORY receives only state transition to `<returnState>_completed`; log `[pop] <target>: no ## Return section`. | R15     |
| `## Return` present, one entry malformed                     | Skip that entry; parse rest; log one line per malformed entry; splice valid entries.                                   | R16     |
| Frame-dir mkdir fails (permissions, disk full)               | Node throws from `mkdirSync`; main.ts catches, rolls back counter/stack (effectively treats as push failure); log.      | R9      |
| Frame-dir rmSync fails on pop (file handle held)             | Log error, continue — caller's MEMORY has already been updated; the stale dir is orphaned but doesn't affect correctness. Cleanup on next run is a non-goal. | R6 (best-effort) |
| `.call-stack.json` malformed or old-shape on load            | Warn + initialize fresh (`{ nextCounter: 1, stack: [] }`). Per R43/R44 this should not occur in practice.              | R17     |
| Retry-budget exhaustion without state advance                | Existing Phase-1 exit path (no new error surface introduced).                                                          | R36     |

## Test strategy

### New test file

**`src/test/phase-2b-returns.test.ts`** — end-to-end push/pop/splice
plus the new data-model semantics. Covers:

- `formatFrameDir` + `slugFromTarget` rules (R5).
- `applyPush` with CallStack object: counter increments, frameDir
  computed, caller MEMORY in the result has Push/Push-Args stripped,
  child MEMORY initialized correctly (R1, R2, R5).
- `applyPush` failure paths do NOT increment counter (R9).
- `applyPop` splices `## Return` entries into caller MEMORY via the
  `readFrame` callback (R3, R14).
- `applyPop` with missing `## Return` → log + continue (R15).
- `applyPop` with malformed entries → skip individually, splice rest (R16).
- Filesystem integration: a small temp-dir harness that exercises
  `applyPush` → main-side mkdir + writes → applyPop → main-side
  rmdir. Verifies caller MEMORY persists on disk across a child's
  push-pop cycle (R1, R3, R6).
- `parseReturn` — single-line, block scalar, malformed mix.
- `spliceReturns` — new section added, existing section body
  replaced, capitalization rule.
- `loadCallStack` with malformed JSON returns the fresh shape (R17).

### Extensions to existing test files (R32)

- **`src/test/memory.test.ts`**: `parseReturn` / `removeReturn` /
  `spliceReturns` describe blocks.
- **`src/test/push-args.test.ts`**: existing applyPush tests migrated
  to the new `CallStack` object signature; assertions now check
  `frameDir` in the result and the split `callerMemoryAfter` /
  `childMemory` fields.
- **`src/test/stack-integration.test.ts`**: new tests for the
  disk-backed push-pop cycle (caller MEMORY preserved at its frame
  path; child's frame dir appears and disappears).
- **`src/test/phase-1-self-refine.test.ts`**: update memory-string
  synthesis to construct a two-frame scenario (strategy frame +
  self-critique push). Assertions: draft is in strategy
  frame's `scoped/draft.md`, `## Critique` + `## Refined` land in
  strategy's `MEMORY.md` via the splice.
- **`src/test/phase-1-evaluator-optimizer.test.ts`**: similar; check
  `## Verdict` / `## Feedback` arrive via splice, attempt.md +
  criterion.md are read from `./scoped/`.
- **`src/test/phase-1-reflexion.test.ts`**: assert `./scoped/lessons.md`
  is mutated via `echo >>` (by inspecting the retrofitted
  INSTRUCTIONS.md — grep for `echo ".*L.*" >> ./scoped/lessons.md` in
  the strategy's Action text). Still covers R26 (≥2 lessons scenario).
- **`src/test/phase-2-cove.test.ts`**: assert `verifications.md` is
  mutated via `sed -i` in verify.md's INSTRUCTIONS Action text. Stack
  depth invariants under the new shape (root on stack): `stack.length
  === 2` when verify is pushed (root + verify), `stack.length === 3`
  while an answer-independently child is active on top (root + verify
  + answer-indep). This is R27 read literally under the refined stack
  model — no mental arithmetic about "root not counted".
- **`src/test/phase-1-dynamics-identity.test.ts`**: unchanged. Still
  asserts b's and c's `evaluate.md` are byte-equal (R25).

### Live demos (R34, R35)

After implementation, rerun all four end-to-end demos against
claude-code/Haiku in fresh instances:

- `a-self-refine` on the parseState-docstring PROGRAM: halts at `done`,
  `## Refined` in strategy's `MEMORY.md` via splice (R35).
- `b-evaluator-optimizer` on the prompt-caching rewrite PROGRAM:
  halts at `done` with `## Verdict: pass`, `./scoped/attempt.md`
  reflects accepted rewrite (R35).
- `c-reflexion` on the palindrome PROGRAM: halts at `done`,
  `./scoped/lessons.md` contains ≥ 2 entries appended via `echo >>`
  (R26, R35).
- `d-cove` on the 20-person knights-and-knaves PROGRAM: halts at `done`
  with `## Revised`, verify.md's frame's `./scoped/verifications.md`
  (preserved under `history/NNNN-<hash>/frames/f<NNN>-verify/scoped/verifications.md`)
  shows every posed bullet ending in `answered:` (no reconstruction
  drift; R27, R34).

Findings go into `docs/agent-workflows/phase-2b-notes.md` per R31.

## Open questions

(none — brainstorming and the requirements refinement settled
frame-dir naming and lifecycle, return declaration mechanism,
cwd-based access model, invariant relative paths, surgical-edit
convention placement, active cleanup scope, and the
backward-compat stance. Implementation-level details — exact sed
regex patterns for each retrofit, the exact `phase-2b-notes.md`
headings — will settle during task-level work.)
