# Design: phase-7-including-cove-and-1b-in-addition-or-instead-of-1a

## Overview

Phase 7 ships a Language-Agent meta-framework (AFlow-lite) at `interpreters/mas-papers/7-meta-framework/a-aflow-lite/` that runs MCTS over candidate workflows composed from a five-operator library (refine, reflexion, cove, plan-execute, debate). The meta-search reuses Phase 6b's MCTS controller verbatim — selection (UCT), expansion (LLM-driven), simulation (run the candidate workflow on benchmark items), back-propagation (mean-fraction-passing reward), no meta-reflexion. Three structural changes ship alongside the new interpreter: a project-wide `dynamics/` → `operators/` rename; a shell change that lets a configured "root operator" be loaded with `PROGRAM.md` content as a `{{program}}` push-arg, with the operator's `## Return` written to `OUTPUT.md` on halt; and the migration of every existing interpreter's strategy out of `INSTRUCTIONS.md` and into `operators/<name>.md` as a single canonical pushable file (no duplication — standalone interpreters and AFlow-lite consume the same operator). The core trade-off is **architectural unification over scope minimisation**: bundling rename + shell change + 11-interpreter migration + meta-framework into one spec is a beast (≈70 R#s, ≈40 file moves, ≈300+ commits estimated), but it produces a coherent end-state where "operator" is the universal pushable unit and every pattern in the catalogue is composable into Phase 7 via the same push/pop interface.

## Requirement coverage

| R# | Summary | Addressed in |
| -- | ------- | ------------ |
| R1 | Interpreter dir at `interpreters/mas-papers/7-meta-framework/a-aflow-lite/` | §Architecture (Component layout) |
| R2 | Group README `interpreters/mas-papers/7-meta-framework/README.md` | §Architecture (Component layout, Group README) |
| R3 | Leaf README content | §Architecture (Component layout, Leaf README) |
| R4 | Rename `dynamics/` → `operators/` in every interpreter | §Architecture (Rename), §Test strategy |
| R5 | Update `## Push` paths in every INSTRUCTIONS.md / canonical operator | §Architecture (Rename) |
| R6 | Update markdown docs (interpreters/, docs/agent-workflows/, CLAUDE.md) | §Architecture (Rename, Frozen-spec exception) |
| R7 | Source identifier rename in `src/` | §Architecture (Rename — code identifiers) |
| R8 | `new-instance.sh` copies `operators/` not `dynamics/` | §Interfaces (`new-instance.sh` delta) |
| R9 | Rename `phase-operators-identity.test.ts` → `phase-operators-identity.test.ts` | §Test strategy (identity test rename) |
| R10 | No `dynamics/` substring outside frozen spec dirs | §Test strategy (rename-completeness pin) |
| R11 | `.root-operator` config file at instance root | §Architecture (Root-operator bootstrap), §Data model |
| R12 | Shell pushes named operator as root frame with `{{program}}` substituted | §Interfaces (Shell bootstrap delta), §Architecture (Root-operator bootstrap) |
| R13 | At done@depth1, write `## Return` entries to `OUTPUT.md` | §Interfaces (Shell halt delta) |
| R14 | Absent `.root-operator` → clean error, no fallback | §Error handling, §Interfaces (Shell bootstrap delta) |
| R15 | `new-instance.sh` writes `.root-operator` from interpreter | §Interfaces (`new-instance.sh` delta) |
| R16 | Each interpreter's INSTRUCTIONS.md is a single-line marker | §Architecture (Per-interpreter migration shape), §Data model (Marker file) |
| R17 | `.call-stack.json` initialized with root operator's frame already pushed | §Data model (Initial call stack), §Interfaces (Shell bootstrap delta) |
| R18 | Shell exits 0 cleanly after writing OUTPUT.md | §Interfaces (Shell halt delta) |
| R19 | Empty `## Return` → diagnostic in OUTPUT.md, exit 0 | §Error handling, §Interfaces (Shell halt delta) |
| R20 | Each existing interpreter's strategy → pushable operator file | §Architecture (Per-interpreter migration shape), §Interfaces (Operator file contract) |
| R21 | Each interpreter's INSTRUCTIONS.md becomes a marker file | §Architecture (Per-interpreter migration shape) |
| R22 | Specific canonical operator file per leaf | §Architecture (Per-interpreter migration shape — table) |
| R23 | Migrated operators read `{{program}}` and emit `## Return\nanswer:` | §Interfaces (Operator file contract) |
| R24 | Existing terminal-output sections preserved | §Interfaces (Operator file contract — preservation) |
| R25 | Internal sub-pushes use `operators/`-relative paths | §Architecture (Rename), §Interfaces (Operator file contract) |
| R26 | Byte-equality identity across operator copies | §Test strategy (identity tests) |
| R27 | No behavior regression vs pre-migration | §Test strategy (regression assertions) |
| R28 | `aflow-lite.md` operator is the canonical pushable | §Interfaces (`aflow-lite.md` contract) |
| R29 | Aflow-lite imports MCTS primitives from Phase 6b | §Architecture (MCTS reuse), §Interfaces (Aflow-lite state machine) |
| R30 | Workflow recipes stored in `./scoped/state-<id>.md` | §Data model (Tree node + workflow recipe) |
| R31 | Hardcoded library: refine, reflexion, cove, plan-execute, debate | §Data model (Operator library), §Architecture (Operator library) |
| R32 | Expansion pushes `expand-workflow.md` | §Interfaces (Aflow-lite state machine — expansion) |
| R33 | Simulation pushes operators sequentially with `{{task}}` + `{{prior_answer}}` | §Interfaces (Aflow-lite state machine — simulation), §Interfaces (Operator file contract — AFlow-lite invocation) |
| R34 | Aflow-lite's `operators/` contains canonical pushable + sub-operators | §Architecture (Component layout — aflow-lite operators) |
| R35 | Per-item scoring via integer regex match | §Interfaces (Aflow-lite state machine — score extraction), §Error handling |
| R36 | 3 items, deterministic Initialize-time sample, fixed across iterations | §Architecture (Demo + benchmark sampling), §Data model (Scoped files) |
| R37 | Reward = mean fraction passing | §Interfaces (Aflow-lite state machine — back-prop) |
| R38 | Halt on first 1.0 OR `iter_count >= max_iterations` (default 10) | §Interfaces (Aflow-lite state machine — termination) |
| R39 | No meta-reflexion in v1 | §Architecture (Meta-reflexion deferral), §Test strategy (negative pin) |
| R40 | No nested shell instances | §Architecture (No nested instances), §Test strategy (negative pin) |
| R41 | `expand-workflow.md` push-args declaration | §Interfaces (`expand-workflow.md` contract) |
| R42 | `expand-workflow.md` single-cycle, returns `children:` k=5 | §Interfaces (`expand-workflow.md` contract) |
| R43 | `expand-workflow.md` domain-agnostic prose | §Test strategy (vocabulary check) |
| R44 | `expand-workflow.md` no further pushes | §Interfaces (`expand-workflow.md` contract) |
| R45 | Library operators adapt on `{{prior_answer}}` non-empty | §Interfaces (Operator file contract — AFlow-lite invocation) |
| R46 | Library operators behave standalone with `{{program}}` only | §Interfaces (Operator file contract — standalone invocation) |
| R47 | Operators detect which arg is present and adapt parsing | §Interfaces (Operator file contract — bimodal Initialize) |
| R48 | `workspace/gsm8k.jsonl` with 20 items | §Data model (GSM8K fixture) |
| R49 | Demo PROGRAM.md is short prose pointing at fixture | §Architecture (Demo) |
| R50 | Initialize loads fixture, samples 3, persists to `./scoped/benchmark_items.md` | §Interfaces (Aflow-lite Initialize), §Data model (Scoped files) |
| R51 | `new-instance.sh` copies `workspace/` from interpreter | §Interfaces (`new-instance.sh` delta — workspace) |
| R52 | `phase-7-aflow-lite.test.ts` content | §Test strategy (Phase 7 test) |
| R53 | Identity test extensions | §Test strategy (identity tests) |
| R54 | Existing tests updated for rename + marker shape | §Test strategy (existing-test updates) |
| R55 | New `phase-7-shell-bootstrap.test.ts` | §Test strategy (Shell bootstrap test) |
| R56 | Parent doc updates | §Architecture (Source-spec mutation) |
| R57 | `interpreters/README.md` updates | §Architecture (Interpreters README delta) |
| R58 | `CLAUDE.md` updates | §Architecture (CLAUDE.md delta) |
| R59 | Per-leaf README updates | §Architecture (Per-leaf README delta) |
| R60 | Per-group README updates | §Architecture (Per-group README delta) |
| R61 | No 1a in v1 library | §Architecture (Operator library — exclusions) |
| R62 | No MoA in v1 library (deferred) | §Architecture (Operator library — exclusions) |
| R63 | No search interpreters in library (no recursion) | §Architecture (Operator library — exclusions) |
| R64 | No fixed-SOP team interpreters in library | §Architecture (Operator library — exclusions) |
| R65 | No meta-reflexion (operator reflexion still in library) | §Architecture (Meta-reflexion deferral) |
| R66 | No nested shell instances (push/pop is the mechanism) | §Architecture (No nested instances) |
| R67 | New shell does NOT support old bootstrap | §Architecture (Backwards-compat) |
| R68 | Pre-existing instances stay on disk, not deleted | §Architecture (Backwards-compat) |
| R69 | Earlier spec dirs not edited | §Architecture (Frozen-spec exception) |
| R70 | No new concurrency primitives | §Architecture (No concurrency) |
| R71 | `aflow-lite.md` is domain-agnostic | §Test strategy (vocabulary check) |
| R72 | No new "## Aflow Answer" tag | §Interfaces (Operator file contract — return convention) |

## Architecture

### Component layout

```
interpreters/mas-papers/7-meta-framework/
├── README.md                          # group-level (R2)
└── a-aflow-lite/
    ├── INSTRUCTIONS.md                # marker: "operators/aflow-lite.md"           (R16, R21)
    ├── PROGRAM.md                     # demo: GSM8K task description                (R49)
    ├── README.md                      # leaf: pattern citation, etc.                (R3)
    ├── workspace/
    │   └── gsm8k.jsonl                # 20-item fixture                             (R48)
    └── operators/
        ├── aflow-lite.md              # canonical: MCTS meta-strategy               (R28, R29)
        ├── expand-workflow.md         # NEW: workflow expansion                     (R32, R41-R44)
        ├── refine.md                  # COPY of b-evaluator-optimizer's refine.md   (R34, R26)
        ├── reflexion.md               # COPY of c-reflexion's reflexion.md          (R34, R26)
        ├── cove.md                    # COPY of d-cove's cove.md                    (R34, R26)
        ├── plan-execute.md            # COPY of a-plan-execute's plan-execute.md    (R34, R26)
        ├── debate.md                  # COPY of a-debate's debate.md                (R34, R26)
        ├── evaluate.md                # COPY of canonical 1b/operators/evaluate.md  (R34, R26)
        ├── reflect.md                 # COPY of canonical 1c/operators/reflect.md   (R34, R26)
        ├── verify.md                  # COPY of canonical 1d/operators/verify.md    (R34, R26)
        ├── answer-independently.md    # COPY of 1d's                                (R34, R26)
        ├── tackle.md                  # COPY of 2a's                                (R34, R26)
        ├── plan.md                    # COPY of 2a's                                (R34, R26)
        └── opine.md                   # COPY of 4a's                                (R34, R26)
```

The fourteen `operators/` files (a-flow-lite + expand-workflow + 5 library operators + 7 transitively-required sub-operators) are byte-equal copies of their canonical sources except `aflow-lite.md` and `expand-workflow.md` which are canonical here. R26 enforces the byte-equality.

### Rename: `dynamics/` → `operators/` (R4–R10)

Project-wide mechanical rename with three layers:

1. **On-disk:** every interpreter's `dynamics/` subdirectory renamed to `operators/`. Affects all paths in R4. The `git mv` per leaf preserves history.

2. **In-content (markdown):** the literal substring `dynamics/` in:
   - All `## Push <path>` directives inside any interpreter's `INSTRUCTIONS.md` or operator file.
   - All prose under `interpreters/`, `docs/agent-workflows/`, `CLAUDE.md`.
   - Test files under `src/test/`.
   
   Replaced with `operators/`. Sed-driven.

3. **In-content (source identifiers):** the word "dynamic" in the "pushable INSTRUCTIONS file" sense (function names, comments, type aliases) renamed to "operator" in `src/*.ts`. Identifiers with unrelated meanings (e.g. "dynamically allocated", JSDoc text describing dynamic behaviour) are left untouched. Manual review per file: `src/main.ts`, `src/call-stack.ts`, `src/memory.ts`, `src/prompt.ts`, `src/tools.ts`, providers under `src/providers/`.

**Frozen-spec exception (R69):** Spec artefacts under `docs/specs/<earlier-than-this-spec>/` (Phase 1, 2, 2b, 3+4, 6, 6b) are NOT edited. They remain frozen historical records (Phase 6b R28/R85 model carries forward). The rename-completeness assertion (R10) explicitly excludes those directories.

### Per-interpreter migration shape (R20–R25)

Each existing interpreter is split into two artefacts:

1. **A marker file** at `interpreters/<group>/<leaf>/INSTRUCTIONS.md` containing exactly one line: the relative path to the canonical operator. Example for 1b:

   ```
   operators/refine.md
   ```

2. **The canonical operator** at `interpreters/<group>/<leaf>/operators/<name>.md` containing the previous strategy's body, with two adaptations:
   - **Top of file:** an Initialize section that reads `{{program}}` (the substituted push-arg) instead of `cat ../../PROGRAM.md`.
   - **At `state == done`:** a final `## Return\nanswer: <text>` block alongside any existing terminal-output sections (R24 — `## Solution`, `## Refined`, `## Result`, `## Revised`, etc. all preserved for human inspection and existing test compatibility).

The mapping per leaf (R22):

| Leaf | Canonical operator file |
|------|-------------------------|
| 1a self-refine | `operators/self-refine.md` |
| 1b evaluator-optimizer | `operators/refine.md` |
| 1c reflexion | `operators/reflexion.md` |
| 1d cove | `operators/cove.md` |
| 2a plan-execute | `operators/plan-execute.md` |
| 2b orchestrator-workers | `operators/plan-execute.md` (byte-equal to 2a's) |
| 2c deep-research | `operators/plan-execute.md` (byte-equal to 2a's) |
| 3a tot | `operators/tot.md` |
| 3b lats | `operators/lats.md` |
| 4a debate | `operators/debate.md` |
| 5a metagpt | `operators/metagpt.md` |
| 5b chatdev | `operators/chatdev.md` |

### Root-operator bootstrap (R11–R19)

The shell gains a new instance-startup mode driven by `instances/<name>/.root-operator`:

```
┌─────────────────────────────────────────────────────────────┐
│ Shell startup                                                │
│   1. Read instances/<name>/.root-operator                    │
│      → operator path (e.g. "operators/refine.md")            │
│   2. Read instances/<name>/PROGRAM.md → program text         │
│   3. Substitute {{program}} in operator content              │
│   4. Initialize call stack:                                  │
│      stack = [{ returnState: "<root>",                       │
│                 frameDir: "frames/f000-<slug>" }]            │
│   5. Write substituted operator → frames/f000-<slug>/        │
│        INSTRUCTIONS.md                                       │
│   6. Write fresh "## State\nempty\n" → MEMORY.md             │
│   7. Enter the cycle loop                                    │
└─────────────────────────────────────────────────────────────┘
   ...
   When root frame transitions to state == done:
┌─────────────────────────────────────────────────────────────┐
│ Shell halt                                                   │
│   1. Read frames/f000-<slug>/MEMORY.md                       │
│   2. Parse ## Return block (key-value or block scalar)       │
│   3. For each key, write to instances/<name>/OUTPUT.md as    │
│      ## <CapitalizedKey> sections                            │
│   4. If no ## Return present or empty:                       │
│      Write "# OUTPUT (no return values)\n..." diagnostic     │
│   5. Exit 0                                                  │
└─────────────────────────────────────────────────────────────┘
```

The slug in `f000-<slug>` is derived from the operator filename (basename without extension). Example: `operators/refine.md` → frame `f000-refine`. This replaces the previous hard-coded `frames/f000-strategy/` constant in `src/call-stack.ts:47`.

**Backwards-compat (R67–R68):** The shell does NOT keep a fallback for the old "load `frames/f000-strategy/INSTRUCTIONS.md`" behaviour. Pre-existing instances stay on disk for inspection; attempting to run them under the new shell exits with a clean error from R14: *"no .root-operator configured for this instance — pre-Phase-7 instances are read-only artefacts; create a new instance via new-instance.sh"*.

### MCTS reuse (R29)

AFlow-lite imports the MCTS controller verbatim from Phase 6b's `operators/lats.md` (post-rename). Specifically:

- The UCT formula and selection descent.
- The back-prop primitive (walk parent chain, surgical `q` and `n` updates).
- The tree-ledger schema (id, parent_id, depth, q, n, status fields in YAML blocks under `./scoped/tree.md`).
- The R45 leftmost-unvisited tiebreak.
- The Compose-partial-state primitive (ancestor-walk lessons concatenation; aflow-lite uses an empty version since no meta-reflexion in v1, but the structure is preserved for symmetry).

What's different in aflow-lite vs LATS:

| Aspect | LATS (Phase 6b) | AFlow-lite (Phase 7) |
|--------|-----------------|----------------------|
| Tree node represents | A partial state (text blob describing a thought) | A candidate workflow (comma-separated operator names) |
| Expansion operator | `expand-node.md` (k=5 thought children) | `expand-workflow.md` (k=5 workflow children) |
| Rollout / simulation | One LLM call producing a terminal state | Run the candidate workflow on 3 GSM8K items (3×len(workflow) operator pushes) |
| Reward | 0/1 from `evaluate.md` | mean fraction passing ∈ {0, 0.333, 0.667, 1.0} |
| Termination | First reward=1 or `max_iterations=30` | First reward=1.0 or `max_iterations=10` (smaller because each iteration is much more expensive) |
| Lessons / reflexion | Per-node lessons via `reflect.md` (ancestor-walk) | None in v1 (R39, R65); `recent_scores` is in `expand-workflow.md`'s push-args instead |

### Operator library (R31)

Hardcoded list of five operators in aflow-lite's strategy:

- `refine` — invokes `operators/refine.md` (1b's canonical)
- `reflexion` — invokes `operators/reflexion.md` (1c's canonical)
- `cove` — invokes `operators/cove.md` (1d's canonical)
- `plan-execute` — invokes `operators/plan-execute.md` (2a's canonical)
- `debate` — invokes `operators/debate.md` (4a's canonical)

**Exclusions** (R61–R64):
- `1a self-refine`: subsumed by `refine` (1b's explicit-judge interface is the cleaner composition primitive).
- `5b MoA`: blocked on per-prompt model selection in the harness. Future spec adds it.
- `3a tot`, `3b lats`: search-over-search recursion; intractable as Phase 7 IS itself a search.
- `5a metagpt`, `5b chatdev`: end-to-end pipelines tied to "build a software project"; not composable building blocks.

### Demo + benchmark sampling (R36, R49–R51)

- `workspace/gsm8k.jsonl` ships with 20 items from the GSM8K test split. Each line: `{"question": "...", "answer": <integer>}`.
- `PROGRAM.md` is short prose: *"Solve the GSM8K math word problems found in `workspace/gsm8k.jsonl`. The meta-search will sample 3 items deterministically and try operator compositions to maximise the fraction answered correctly."*
- At Initialize, aflow-lite loads `../../workspace/gsm8k.jsonl`, picks 3 items deterministically (a fixed seed derived from the fixture path so the same fixture always picks the same 3), persists them to `./scoped/benchmark_items.md`. The same 3 items are used across all MCTS iterations of a single run.

### Meta-reflexion deferral (R39, R65)

Aflow-lite v1 does NOT push `reflect.md` at the meta level. The OPERATOR `reflexion.md` is in the library and runs INSIDE workflows (where it provides per-attempt verbal lessons within its own pushed frame), but aflow-lite's own meta-strategy uses only UCT + LLM-driven expansion (with `recent_scores` as data) for learning. Documented in the leaf README's "Notable behaviour" section as future work for a higher-level meta-meta-spec.

### No nested shell instances (R40, R66)

The original Phase 7 plan in `docs/agent-workflows/requirements.md` mentioned "evaluate-workflow.md … launches it via a nested shell invocation". This is superseded. With operators repackaged as pushable, all workflow execution happens via push/pop within one instance. Stack depth temporarily grows during operator execution (depth 2 for the operator itself, depth 3+ when an operator pushes its own sub-operators) and shrinks back.

Stack-depth invariant: `stack.length ≤ 4` at every cycle (root aflow-lite + library operator + library operator's sub-push + sub-push's own sub-push). Most cycles run at depth 1–2; the deepest reachable point is when CoVe (depth 2) pushes verify.md (depth 3) which pushes answer-independently.md (depth 4).

### No concurrency (R70)

AFlow-lite executes sequentially under the existing single-threaded shell, exactly like Phase 6b LATS. Per-iteration, the 3 benchmark items are processed in sequence, each running the candidate workflow's operators in sequence. No `xargs -P`, no background processes, no parallel scoring.

### Source-spec mutation (R56)

`docs/agent-workflows/requirements.md` is updated:

1. **Section heading rename** "Reusable dynamics library" → "Reusable operators library".

2. **New row** in the table for `expand-workflow.md`:
   ```
   | `expand-workflow.md` | 7 | `## Partial State`, `## Task` | `## Children` | 1 |
   ```

3. **Phase 7 section rewrite**. The current speculative description ("evaluate-workflow.md materialises … launches via nested shell invocation") is replaced with the actual deliverables: the operator library list (refine, reflexion, cove, plan-execute, debate), the rename, the shell change, the per-interpreter migration scope, the deferred MoA, the deferred meta-reflexion, the citation to Zhang et al. arXiv:2410.10762.

### Interpreters README delta (R57)

`interpreters/README.md` updated post-refactor:
- All "dynamics" → "operators" terminology.
- Operator-shortlist section reflects the actual five v1 operators (no longer hedging about MoA being "shipped pending"); MoA explicitly listed as future scope.
- New "Phase 7 — Meta-frameworks" section in the family tour, mirroring the existing five group tours.
- Execution-context section gains a paragraph about the root-operator bootstrap mechanism.

### CLAUDE.md delta (R58)

- "Dynamics (Call Stack)" section renamed to "Operators (Call Stack)".
- New "Root-operator bootstrap" section documenting `.root-operator`, `OUTPUT.md`, and the slug derivation.
- Instance Layout diagram updated: `.root-operator` and `OUTPUT.md` at the instance root, `frames/f000-<operator-slug>/` instead of `frames/f000-strategy/`.
- Code-block examples updated.

### Per-leaf README delta (R59) and per-group README delta (R60)

Each per-leaf README under `interpreters/<group>/<leaf>/README.md`:
- Path references rename.
- Strategy-living-in-INSTRUCTIONS.md updated to mention the marker pattern + canonical operator location.
- Cycle counts and behaviour sections unchanged.

Each per-group README under `interpreters/<group>/README.md`: rename only.

## Data model

### `.root-operator` (R11)

A single-line text file at `instances/<name>/.root-operator` containing the relative path of the canonical operator. Example:

```
operators/refine.md
```

Resolved as `instances/<name>/operators/refine.md`. The shell reads this once at startup.

### Initial call stack (R17)

When the shell starts an instance, `.call-stack.json` is initialized as:

```json
{
  "nextCounter": 1,
  "stack": [
    {
      "returnState": "<root>",
      "frameDir": "frames/f000-<operator-slug>"
    }
  ]
}
```

The slug is derived from the operator filename: `operators/refine.md` → `refine`. This replaces the previous fixed `frames/f000-strategy/` value (`src/call-stack.ts:47`'s `ROOT_FRAME_DIR`).

The corresponding directory `instances/<name>/frames/f000-<operator-slug>/` exists with:
- `INSTRUCTIONS.md` — the operator's body with `{{program}}` substituted.
- `MEMORY.md` — `## State\nempty\n`.
- `scoped/` — empty.

### Marker file (R16)

Each interpreter's `INSTRUCTIONS.md` (post-migration) is a single-line text file:

```
operators/refine.md
```

`new-instance.sh` reads this file when creating an instance and writes its content to `instances/<name>/.root-operator`.

### `OUTPUT.md` (R13, R19)

When the root frame transitions to `state == done`, the shell parses the `## Return` block from MEMORY.md and writes one section per key to `instances/<name>/OUTPUT.md`. Example for an operator that returned `answer: 18`:

```markdown
## Answer
18
```

If the operator returns multiple keys (rare; standard return is just `answer`), each becomes a separate section (`## Answer`, `## Verdict`, etc.).

If `## Return` is absent or empty, the shell writes a diagnostic:

```markdown
# OUTPUT (no return values)

The root operator halted without a ## Return block. Inspect frames/f000-<slug>/MEMORY.md for terminal state.
```

### Tree node + workflow recipe (R30)

Aflow-lite's `./scoped/tree.md` follows the LATS schema (Phase 6b R37–R41 verbatim):

```
---
id: n0
parent_id: -
depth: 0
q: 0
n: 0
status: live
```

Status enum: `{live, terminal_pass, terminal_fail}`. Per-node workflow recipe lives in `./scoped/state-<id>.md` as a single line:

```
refine,cove
```

The empty workflow (root n0) has `state-n0.md` empty.

### Operator library (R31)

Hardcoded as a bash literal in `aflow-lite.md`:

```bash
LIBRARY="refine,reflexion,cove,plan-execute,debate"
```

Used as the `{{library}}` push-arg to `expand-workflow.md`.

### GSM8K fixture (R48, R50)

`workspace/gsm8k.jsonl` — one JSON object per line:

```jsonl
{"question": "Janet's ducks lay 16 eggs per day. She eats three for breakfast every morning and bakes muffins for her friends every day with four. She sells the remainder at the farmers' market daily for $2 per fresh duck egg. How much in dollars does she make every day at the farmers' market?", "answer": 18}
{"question": "...", "answer": 42}
...
```

Twenty items total. Items SHALL be drawn from GSM8K test split (cited in leaf README).

### Aflow-lite scoped files

| File | Lifetime | Content | Edit pattern |
|------|----------|---------|--------------|
| `./scoped/tree.md` | whole run | YAML-block ledger (LATS schema) | append + awk-update only |
| `./scoped/task.md` | whole run | byte-equal copy of `../../PROGRAM.md` | wholesale-write at Initialize |
| `./scoped/max_iterations.md` | whole run | one integer, default 10 | wholesale-write at Initialize |
| `./scoped/uct_c.md` | whole run | one float, default 1.41421356 | wholesale-write at Initialize |
| `./scoped/iter_count.md` | whole run | one integer | bumped per iteration |
| `./scoped/benchmark_items.md` | whole run | the 3 sampled items as JSON lines | wholesale-write at Initialize |
| `./scoped/cursor.md` | whole run | one node id (selection target) | wholesale-write each Select |
| `./scoped/chosen_child.md` | whole run | one node id (rollout origin) | wholesale-write each Expand-absorb |
| `./scoped/recent_scores.md` | whole run | last N (workflow, score) pairs | append-only, capped |
| `./scoped/last_answer.md` | per-iteration | the latest workflow's final answer per item | wholesale-write per item |
| `./scoped/state-<id>.md` | whole run | per-node workflow recipe (comma-separated) | write-once at node creation |
| `./scoped/staged/{partial_state,task,prior_answer,...}.md` | per-dispatch | push-arg staging | wholesale-write per push |

## Interfaces / API

### Shell bootstrap delta (R12, R14, R17)

Pseudocode for the new startup path in `src/main.ts`:

```typescript
// satisfies: R11, R12, R14, R17
function startupBootstrap(baseDir: string): { callStack: CallStack; mp: string; ip: string } {
  const rootOpPath = readFile(join(baseDir, ".root-operator"))?.trim();
  if (!rootOpPath) {
    throw new Error(
      "no .root-operator configured for this instance — pre-Phase-7 instances " +
      "are read-only artefacts; create a new instance via new-instance.sh"
    );
  }
  const slug = basename(rootOpPath, ".md");
  const frameDir = `frames/f000-${slug}`;

  const operatorContent = readFile(join(baseDir, rootOpPath));
  const programContent = readFile(join(baseDir, "PROGRAM.md"));
  const substituted = substitutePlaceholders(operatorContent, { program: programContent }).result;

  mkdirSync(join(baseDir, frameDir, "scoped"), { recursive: true });
  writeFileSync(join(baseDir, frameDir, "INSTRUCTIONS.md"), substituted);
  writeFileSync(join(baseDir, frameDir, "MEMORY.md"), "## State\nempty\n");

  const callStack: CallStack = {
    nextCounter: 1,
    stack: [{ returnState: "<root>", frameDir }],
  };
  return { callStack, mp: join(baseDir, frameDir, "MEMORY.md"), ip: join(baseDir, frameDir, "INSTRUCTIONS.md") };
}
```

`substitutePlaceholders` already exists in `src/memory.ts` (used by `applyPush` for `## Push-Args`). Reused here unchanged.

### Shell halt delta (R13, R18, R19)

Pseudocode appended to the cycle loop's halt branch in `src/main.ts`:

```typescript
// satisfies: R13, R18, R19
function emitOutputMd(baseDir: string, rootMemory: string): void {
  const returnEntries = parseReturn(rootMemory); // exists in src/memory.ts
  let outputBody: string;

  if (returnEntries.size === 0) {
    outputBody =
      "# OUTPUT (no return values)\n\n" +
      "The root operator halted without a ## Return block. " +
      "Inspect frames/f000-<slug>/MEMORY.md for terminal state.\n";
  } else {
    outputBody = "";
    for (const [key, value] of returnEntries) {
      const sectionTitle = key.charAt(0).toUpperCase() + key.slice(1);
      outputBody += `## ${sectionTitle}\n${value}\n\n`;
    }
  }
  writeFileSync(join(baseDir, "OUTPUT.md"), outputBody);
}
```

Called in the halt path after the existing snapshot/commit logic. After writing `OUTPUT.md`, the shell exits 0.

### `new-instance.sh` delta (R8, R15, R51)

The script (currently 183 lines) is updated:

1. **Stop creating** `frames/f000-strategy/` and writing `INSTRUCTIONS.md` / `MEMORY.md` there. The new shell does this at startup based on `.root-operator`.

2. **Read** the interpreter's `INSTRUCTIONS.md` (now a single-line marker per R16) and write its content as `instances/<name>/.root-operator`.

3. **Copy** `interpreters/<x>/operators/` → `instances/<name>/operators/` (renamed from `dynamics/`). Behavior preserved otherwise.

4. **Copy** `interpreters/<x>/workspace/` → `instances/<name>/workspace/` (already exists; preserved post-rename).

5. **Initialize** `.call-stack.json` as empty (just `{}` or omit it entirely; the shell creates the proper initial stack at startup per R17).

Concrete diff approximation:

```bash
# Before:
mkdir -p "$DIR/frames/f000-strategy/scoped"
cp "$INTERP_DIR/INSTRUCTIONS.md" "$DIR/frames/f000-strategy/INSTRUCTIONS.md"
echo '{"nextCounter":1,"stack":[{"returnState":"<root>","frameDir":"frames/f000-strategy"}]}' > "$DIR/.call-stack.json"

# After:
cp "$INTERP_DIR/INSTRUCTIONS.md" "$DIR/.root-operator"   # marker file content → .root-operator
# (no frames/ created here; shell creates frames/f000-<slug>/ at startup)
# (no .call-stack.json written; shell initializes at startup)
```

The `for f in *.md` strategy-scoped support-file copy (currently lines 40-46) is retained but copies to `instances/<name>/` root or to a new convention; the migrated interpreters don't use such files (they used to be for things like role descriptions, but those move into `operators/` or stay alongside).

### Operator file contract (R20, R23, R24, R45–R47)

Every canonical operator file (post-migration) follows the contract:

#### Push-args declaration (top of file)

Each operator declares the push-args it expects. Two modes are supported:

```markdown
# Operator: <Name>

Receives push-args (mode 1: standalone via root-operator bootstrap):
  - `{{program}}` — the user's PROGRAM.md content.

Receives push-args (mode 2: invoked by aflow-lite as part of a workflow):
  - `{{task}}` — the task description (one GSM8K item's question text).
  - `{{prior_answer}}` — the previous operator's `## Answer`, or empty for the first operator.

Produces: `## State done` + `## Return` block with key `answer`. Existing terminal-output sections (e.g. `## Refined`) are also written for human inspection.
```

#### Bimodal Initialize (R47)

The Initialize instruction detects which mode it's in:

```markdown
## Instruction: Initialize
**Condition:** MEMORY state is "empty"
**Action:**

    # Detect mode by checking which placeholder was substituted
    if grep -qF "{{program}}" ./INSTRUCTIONS.md; then
      # mode 2: aflow-lite invocation (program literal still present, task/prior_answer were substituted)
      TASK=$(... read from INSTRUCTIONS.md or use a {{task}} reference ...)
      PRIOR=$(... read {{prior_answer}} ...)
      ...
    else
      # mode 1: standalone (program was substituted)
      PROGRAM_CONTENT=$(... read {{program}} value ...)
      ...
    fi
```

In practice the substitution mechanism (`src/memory.ts:substitutePlaceholders`) replaces only the placeholders whose keys appear in `## Push-Args`. So:
- Standalone mode: only `{{program}}` is replaced; `{{task}}` and `{{prior_answer}}` remain as literal text in INSTRUCTIONS.md (which means the operator detects them by `grep -qF "{{task}}"` returning zero — the tokens are still literally there).
- AFlow-lite mode: `{{task}}` and `{{prior_answer}}` are replaced; `{{program}}` remains literal.

Each operator's Initialize uses this `grep -qF` test to branch. Concrete pattern:

```bash
if [ -n "$(grep -F '{{task}}' ./INSTRUCTIONS.md)" ]; then
  # task placeholder still literal → not substituted → standalone mode
  MODE=standalone
else
  MODE=aflow
fi
```

(The exact form is specified in tasks; the design here just establishes that Initialize is bimodal and detection uses literal-token presence.)

#### Final cycle: `## Return` (R23)

The instruction that handles the operator's terminal state (e.g. `Solved` for ToT, `Final` for refine) is updated to also write a `## Return\nanswer:` block alongside its existing terminal output:

```bash
cat > ./MEMORY.md << SOLVED_EOF
## State
done
## Matched Instruction
Solved
## Last Action
...
## Result
...
## Solution
... (existing terminal output preserved per R24)
## Return
answer: |
  ... (the final answer text the operator produces)
SOLVED_EOF
```

The `answer:` value is the final text. For ToT/LATS this is the winning expression. For refine/reflexion this is the accepted refined draft. For plan-execute this is the synthesized result. For cove this is the verified-and-revised answer. For debate this is the consensus.

#### Standalone use (R46)

When invoked via `.root-operator` bootstrap with `{{program}}` substituted, the operator behaves exactly as the pre-migration interpreter did (regression-tested per R27).

### `aflow-lite.md` contract (R28)

Push-args:
- `{{program}}` (the GSM8K PROGRAM.md content; aflow-lite is invoked only standalone in v1, never as a sub-operator).

Returns:
```
## Return
answer: |
  Best workflow: refine,cove (mean score 0.667 over 3 items)
  Iterations run: 6
```

Strategy state machine (mirrors LATS, Phase 6b § Interfaces):

| State | Action | Next |
|-------|--------|------|
| `empty` | Initialize: copy PROGRAM.md → task.md, set max_iterations=10, uct_c=1.41421356, iter_count=0; load fixture, sample 3 items → benchmark_items.md; append root n0 (empty workflow) | `selecting` |
| `selecting` | Walk tree from root via UCT (LATS-identical); set `cursor` to leaf | `expanding` |
| `expanding` | Push `expand-workflow.md` with `{{partial_state}}` (cursor's workflow + library + recent_scores) and `{{task}}` (PROGRAM.md text) | `expanding_completed` |
| `expanding_completed` | Append k=5 children to tree; for each new child, write its workflow recipe to `state-<id>.md`; set `chosen_child` to leftmost new child; transition | `simulating` |
| `simulating` | For each of the 3 benchmark items: orchestrate the workflow by sequential pushes (`{{task}}`+`{{prior_answer}}`); after the last operator pops, capture `## Answer`; extract integer; compare to expected; record score | `evaluating_completed` |
| `evaluating_completed` | Compute mean score = (correct count) / 3. Back-prop reward along chosen_child→root path. If reward == 1.0 → emit `## Solution` (best workflow) + `## Return answer:` + state `done`. Else → `selecting` (next iteration); bump iter_count; if `iter_count >= max_iterations` → emit `## No Solution Found` + `## Return answer:` + state `done`. | `selecting` or `done` |

The `simulating` state is a multi-cycle phase: it pushes operators one at a time, each push completes (operator runs internally, returns, pops), the next is pushed with the previous answer, and so on for each benchmark item. Aflow-lite's strategy bookkeeping tracks (current_item, current_op_index_within_workflow, accumulated_score) in scoped files.

### `expand-workflow.md` contract (R32, R41–R44)

```markdown
# Operator: Expand Workflow

Receives push-args: {{partial_state}} (containing the current workflow, library, and recent scores), {{task}} (the GSM8K demo PROGRAM content for context).
Produces: ## State done + ## Return block with key `children` (k=5 new candidate workflows as comma-separated lines).

This operator is invoked by a meta-search controller during the expansion phase. It generates k=5 candidate variations of the current workflow by mutating it (appending an operator, replacing one, inserting one). The library defines the available operators; the LLM uses judgment to propose useful mutations.

## Instruction: Generate workflow children
**Condition:** MEMORY state is "empty"
**Action:** Read {{partial_state}} which contains: the current workflow (a comma-separated operator list), the library of available operator names, and a brief summary of recent scores. Generate exactly k=5 new candidate workflows by varying the current one. Each variation should be a single-line comma-separated list of operator names drawn from the library.

Write ./MEMORY.md with this EXACT shape (the ## Return block MUST be in the same heredoc as the state change):

cat > ./MEMORY.md << 'MEMEOF'
## State
done
## Matched Instruction
Generate workflow children
## Last Action
Generated five candidate workflow variations.
## Result
Workflow children produced.
## Return
children: |
  workflow_1
  workflow_2
  workflow_3
  workflow_4
  workflow_5
MEMEOF

Partial state (current workflow, library, recent scores):
{{partial_state}}

Task (for domain context):
{{task}}
```

R44: no `## Push` anywhere in the file body. Single instruction. Stack depth from caller stays at 1.

R43: domain-agnostic prose — the operator's prompt does not name "GSM8K" or "math"; it talks abstractly about "workflows" and "operators". The {{task}} push-arg carries the domain context.

## Error handling

| Trigger | Mitigation | R# |
|---------|------------|----|
| `.root-operator` is absent at instance startup | Shell exits with the explicit "pre-Phase-7 instances are read-only artefacts" error message; no fallback to old layout | R14 |
| Root operator's `## Return` block is missing or empty at done state | Shell writes diagnostic OUTPUT.md (`# OUTPUT (no return values)\n...`); exits 0 | R19 |
| `expand-workflow.md` returns fewer than 5 well-formed children | Same R47-style pattern as Phase 6b's expand-node.md: append the well-formed entries; if zero, mark cursor terminal_fail and re-enter selecting; non-blocking `## Pending Questions`; never `waiting_for_user` | extends R32 |
| A workflow's operator returns malformed `## Return` (no `answer:` key) | Treat as a fail attempt for that item: per-item score 0; non-blocking `## Pending Questions`; continue to next item | extends R35 |
| Per-item integer extraction yields no match (regex `[-+]?\d+` finds nothing in the answer text) | Treat as a fail (score 0 for that item); non-blocking `## Pending Questions`; continue | R35 |
| `evaluate.md` (when reused inside a library operator like refine) returns a malformed verdict | Existing Phase 1b R33 path: treat as fail, non-blocking `## Pending Questions`; behavior is internal to the library operator and propagates to AFlow-lite as a failed item | preserved |
| Workflow exhausts cycles without converging (no internal halt) | Operators have their own self-termination logic (e.g. refine has max iterations internally). AFlow-lite does not impose an additional per-operator cycle cap in v1. If an operator hangs, it's an operator-level bug, not an AFlow-lite issue | (out of scope per "no per-operator timeouts" exclusion) |
| Fixture file `workspace/gsm8k.jsonl` missing or unparseable | Aflow-lite's Initialize fails with `## Pending Questions` and sets state `waiting_for_user` (only path in aflow-lite that does this — analogous to Phase 6 R6) | extends R50 |

## Test strategy

### `src/test/phase-7-aflow-lite.test.ts` — NEW (R52)

Static-shape tests against the markdown artefacts (no live LLM execution; live runs are the manual smoke check). Following Phase 6b's `phase-6b-lats.test.ts` patterns:

| Test group | Asserts | R# |
|------------|---------|----|
| Directory layout | `interpreters/mas-papers/7-meta-framework/a-aflow-lite/` exists with `INSTRUCTIONS.md`, `PROGRAM.md`, `README.md`, `operators/`, `workspace/gsm8k.jsonl` | R1, R34, R48 |
| Group README | `interpreters/mas-papers/7-meta-framework/README.md` exists, cites Zhang et al. arXiv:2410.10762 | R2 |
| Leaf README | cites Zhang et al., describes operator library + exclusions, MCTS state machine, demo, run instructions, Notable behaviour notes (no MoA, no meta-reflexion in v1) | R3 |
| Marker file | `INSTRUCTIONS.md` is a single line containing `operators/aflow-lite.md` | R16, R21 |
| Operator library file presence | `operators/` contains exactly the 14 expected files (aflow-lite, expand-workflow, refine, reflexion, cove, plan-execute, debate, evaluate, reflect, verify, answer-independently, tackle, plan, opine); does NOT contain `self-refine.md`, `tot.md`, `lats.md`, `metagpt.md`, `chatdev.md`, `score.md`, `expand-node.md`, `rollout.md` | R31, R34, R61–R64 |
| `expand-workflow.md` contract | declares `{{partial_state}}` and `{{task}}` push-args; single instruction matching `state == empty`; emits `## Return: children: \|`; no `## Push` anywhere in the file | R41, R42, R44 |
| `expand-workflow.md` vocabulary | does not contain `Game of 24`, `arithmetic`, `numbers`, `target`, `maze`, `code`, `function`, `test suite`, `GSM8K`, `math` | R43 |
| `aflow-lite.md` strategy structural | declares the 11 LATS-equivalent instructions (Initialize, Select, Expand-push, Expand-absorb, Simulate-push variants, Evaluate-absorb, ...); imports MCTS primitives (UCT, back-prop); hardcodes the five library operator names; uses comma-separated workflow representation in `state-<id>.md`; uses `bc -l` for UCT | R28, R29, R30, R31 |
| Aflow-lite Initialize | copies PROGRAM.md → task.md; writes max_iterations=10, uct_c=1.41421356, iter_count=0; loads fixture, samples 3 items deterministically | R36, R50 |
| Aflow-lite ledger schema | nodes have id/parent_id/depth/q/n/status fields; status enum is `{live, terminal_pass, terminal_fail}` (no `pruned`) | R29 |
| Aflow-lite simulation | for each of 3 items, sequentially pushes operators with `{{task}}`+`{{prior_answer}}`; per-item score via integer regex extraction | R33, R35 |
| Aflow-lite back-prop | reward = correct/3 ∈ {0, 0.333, 0.667, 1.0} | R37 |
| Aflow-lite termination | every code path that sets `state == done` co-occurs with `## Return\nanswer:` block; halts on first 1.0 OR `iter_count >= max_iterations` | R38 |
| Aflow-lite vocabulary | does not contain `GSM8K`, `math`, etc. except in a single "demo-specific" comment block | R71 |
| No meta-reflexion | `aflow-lite.md` does NOT push `reflect.md` (grep for `## Push.*reflect.md` returns no matches) | R39, R65 |
| No nested instances | `aflow-lite.md` does NOT spawn child shell processes (no `node`, no `spawn`, no `execFile` references) | R40, R66 |
| Stack-depth invariant | tree.md ledger snapshots in `history/` show `stack.length` ≤ 4 at every cycle | R40 (structural witness) |
| Demo PROGRAM.md | exists, references workspace/gsm8k.jsonl in its prose | R49 |
| Fixture | `workspace/gsm8k.jsonl` has 20 lines, each parseable JSON with `question` (string) + `answer` (integer) | R48 |

### `src/test/phase-7-shell-bootstrap.test.ts` — NEW (R55)

Tests the shell change end-to-end. Uses a tmpdir-based fixture instance:

| Test group | Asserts | R# |
|------------|---------|----|
| `.root-operator` config | shell reads the config and pushes the named operator at startup | R11, R12 |
| `{{program}}` substitution | the operator's INSTRUCTIONS.md (post-substitution) has `{{program}}` replaced with PROGRAM.md content | R12 |
| Frame slug | initial frame is named `f000-<slug>` based on operator basename | R17 |
| `OUTPUT.md` emission | when state goes done at depth 1 with `## Return\nanswer: 42`, OUTPUT.md is written with `## Answer\n42` | R13, R18 |
| Empty `## Return` diagnostic | when state goes done without a Return, OUTPUT.md contains the `# OUTPUT (no return values)\n...` diagnostic | R19 |
| Absent `.root-operator` error | shell exits with a non-zero code AND a message including "no .root-operator" | R14 |
| Exit 0 on success | shell exits 0 after writing OUTPUT.md | R18 |

### `src/test/phase-operators-identity.test.ts` — RENAMED + EXTENDED (R9, R26, R53)

The existing `src/test/phase-operators-identity.test.ts` is renamed via `git mv`. Constants extended:

```typescript
const EVALUATE_PATHS = [
  "interpreters/mas-papers/1-iterative-refinement/b-evaluator-optimizer/operators/evaluate.md",
  "interpreters/mas-papers/1-iterative-refinement/c-reflexion/operators/evaluate.md",
  "interpreters/mas-papers/3-search/a-tot/operators/evaluate.md",
  "interpreters/mas-papers/3-search/b-lats/operators/evaluate.md",
  "interpreters/mas-papers/5-fixed-sop-teams/a-metagpt/operators/evaluate.md",
  "interpreters/mas-papers/5-fixed-sop-teams/b-chatdev/operators/evaluate.md",
  "interpreters/mas-papers/7-meta-framework/a-aflow-lite/operators/evaluate.md",
];

const REFLECT_PATHS = [
  "interpreters/mas-papers/1-iterative-refinement/c-reflexion/operators/reflect.md",
  "interpreters/mas-papers/3-search/b-lats/operators/reflect.md",
  "interpreters/mas-papers/7-meta-framework/a-aflow-lite/operators/reflect.md",
];

const EXPAND_NODE_PATHS = [
  "interpreters/mas-papers/3-search/a-tot/operators/expand-node.md",
  "interpreters/mas-papers/3-search/b-lats/operators/expand-node.md",
];

const PLAN_EXECUTE_PATHS = [
  "interpreters/mas-papers/2-planning-decomposition/a-plan-execute/operators/plan-execute.md",
  "interpreters/mas-papers/2-planning-decomposition/b-orchestrator-workers/operators/plan-execute.md",
  "interpreters/mas-papers/2-planning-decomposition/c-deep-research/operators/plan-execute.md",
  "interpreters/mas-papers/7-meta-framework/a-aflow-lite/operators/plan-execute.md",
];

const REFINE_PATHS = [
  "interpreters/mas-papers/1-iterative-refinement/b-evaluator-optimizer/operators/refine.md",
  "interpreters/mas-papers/7-meta-framework/a-aflow-lite/operators/refine.md",
];

const REFLEXION_PATHS = [
  "interpreters/mas-papers/1-iterative-refinement/c-reflexion/operators/reflexion.md",
  "interpreters/mas-papers/7-meta-framework/a-aflow-lite/operators/reflexion.md",
];

const COVE_PATHS = [
  "interpreters/mas-papers/1-iterative-refinement/d-cove/operators/cove.md",
  "interpreters/mas-papers/7-meta-framework/a-aflow-lite/operators/cove.md",
];

const DEBATE_PATHS = [
  "interpreters/mas-papers/4-peer-collaboration/a-debate/operators/debate.md",
  "interpreters/mas-papers/7-meta-framework/a-aflow-lite/operators/debate.md",
];

// Plus tackle.md, plan.md, verify.md, answer-independently.md, opine.md across their consumers.
```

A describe block per array enforces byte-equality.

### Existing test updates (R54)

Every `src/test/phase-N-X.test.ts` file is touched:
- References to `dynamics/` → `operators/`.
- References to `frames/f000-strategy/INSTRUCTIONS.md` updated:
  - For tests asserting marker-file shape (R16): `assert.match(readFileSync(resolve(INTERP, "INSTRUCTIONS.md"), "utf-8"), /^operators\/[^\s]+\.md\s*$/)`.
  - For tests reaching into the strategy body: now read from `interpreters/<group>/<leaf>/operators/<canonical>.md` instead.

The phase-N-X tests being touched: `phase-1-evaluator-optimizer.test.ts`, `phase-1-reflexion.test.ts`, `phase-1-self-refine.test.ts`, `phase-1d-cove.test.ts`, `phase-3-plan-execute-d1.test.ts`, `phase-3-orchestrator-workers-d2.test.ts`, `phase-3-deep-research-d3.test.ts`, `phase-4-shell-features.test.ts`, `phase-4-metagpt.test.ts`, `phase-4-chatdev.test.ts`, `phase-5-debate.test.ts`, `phase-6-tot.test.ts`, `phase-6b-lats.test.ts`. Each updated with a focused diff: rename strings, update marker assertions, no semantic test changes.

### Rename-completeness pin (R10)

A new test in `src/test/phase-7-aflow-lite.test.ts` (or a separate `src/test/rename-completeness.test.ts`):

```typescript
test("no 'dynamics/' substring outside frozen spec dirs (R10)", async () => {
  // grep -r 'dynamics/' starting at REPO root, excluding docs/specs/<earlier-than-this-spec>/
  const output = execSync(
    "git grep -l 'dynamics/' -- ':!docs/specs/2026-04-23-agent-workflows-phase-2b-push-returns/' " +
    "':!docs/specs/2026-04-24-implement-phase-3-and-4/' ':!docs/specs/2026-04-30-agent-workflows-phase-6/' " +
    "':!docs/specs/2026-05-01-implement-phase-6b/'",
    { encoding: "utf-8" }
  ).trim();
  assert.equal(output, "", `unexpected 'dynamics/' references: ${output}`);
});
```

(The exclusion list grows as more frozen spec dirs are added; the live spec dir for this work — 2026-05-02-... — is NOT excluded because it can be edited during the spec lifecycle.)

### Behavior regression assertions (R27)

For each migrated standalone interpreter, a smoke-check description in the leaf README's Run-it section, plus existing per-phase tests (which already pin behaviour at the structural level) carry the regression burden. No new behavior-regression tests are added in this spec; the existing tests are updated for the new layout (R54) and continue to enforce the pre-migration contracts.

### Manual smoke-check (out of test suite)

The leaf README's Run-it section directs the user through:

```bash
./new-instance.sh my-aflow interpreters/mas-papers/7-meta-framework/a-aflow-lite
instances/my-aflow/run.sh
```

After completion, inspect:
- `instances/my-aflow/OUTPUT.md` for the `## Answer` (best workflow + score).
- `instances/my-aflow/frames/f000-aflow-lite/scoped/tree.md` for the MCTS search tree.
- `instances/my-aflow/frames/f000-aflow-lite/scoped/recent_scores.md` for the chronological score history.

Cycle-cost expectation: 10 iterations × 3 items × ~3-4 operators × ~30 cycles per operator ≈ 3000-4000 cycles, ~25-35 hours on `claude-code` haiku. Substantial; the leaf README documents this and recommends sonnet or opus for production runs.

## Open questions

(none — all 72 R# requirements addressed by sections above; design choices match brainstorming Q1–Q11 outcomes; remaining details — exact slug derivation, exact bash for bimodal Initialize detection, exact prompt prose for expand-workflow.md — belong in Phase 3 task implementation, not requirements/design.)
