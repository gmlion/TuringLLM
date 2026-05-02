# Design: implement-phase-6b

## Overview

Phase 6b ships a Language Agent Tree Search (LATS) interpreter at `interpreters/3-search/b-lats/` driving paper-faithful MCTS over LLM-generated thoughts. The strategy frame runs an eight-state machine (`empty → selecting → expanding → simulating → evaluating → reflecting → … → done`) that pushes four single-cycle dynamics (`expand-node.md`, `rollout.md`, `evaluate.md`, `reflect.md`); UCT selection, back-propagation, and lesson plumbing all live in strategy bash. Because Phase 6's existing `expand-node.md` and `score.md` are Game-of-24-specific in violation of the project-wide invariant that PROGRAM.md is the sole locus of domain knowledge, Phase 6b also performs a cross-cutting in-place refactor of those two dynamics, the Phase 6 strategy, and the Phase 6 ledger schema (`op`/`left` move out of the YAML ledger and into per-node `./scoped/state-<id>.md` files). The core trade-off is **architectural correctness over scope minimisation**: shipping LATS as a sibling of a non-general ToT would have institutionalised the defect; the in-place refactor costs ~12 additional requirements but leaves `interpreters/3-search/` consistently general.

## Requirement coverage

| R# | Summary | Addressed in |
| -- | ------- | ------------ |
| R1 | Interpreter dir at `interpreters/3-search/b-lats/` | §Architecture (Component layout) |
| R2 | Group README updated to list LATS | §Architecture (Component layout, Group README delta) |
| R3 | Leaf README content | §Architecture (Component layout, Leaf README) |
| R4 | dynamics/ contains exactly four files | §Architecture (Component layout) |
| R5 | No `score.md` shipped in LATS | §Architecture (Component layout) |
| R6 | `expand-node.md` byte-equal w/ refactored Phase 6 | §Test strategy (identity test) |
| R7 | `evaluate.md` byte-equal w/ canonical 1b | §Test strategy (identity test) |
| R8 | `reflect.md` byte-equal w/ canonical 1c | §Test strategy (identity test) |
| R9 | Identity test extension covering R6/R7/R8 | §Test strategy (`phase-dynamics-identity.test.ts`) |
| R10 | `rollout.md` push-arg declaration | §Interfaces (`rollout.md`) |
| R11 | `rollout.md` single-cycle, returns `terminal_state` | §Interfaces (`rollout.md`) |
| R12 | `rollout.md` no further pushes | §Interfaces (`rollout.md`), §Architecture (Stack discipline) |
| R13 | `rollout.md` prose domain-agnostic | §Interfaces (`rollout.md`), §Test strategy (vocabulary check) |
| R14 | Refactored `expand-node.md` (general) | §Interfaces (`expand-node.md` post-refactor) |
| R15 | Refactored `score.md` (general) | §Interfaces (`score.md` post-refactor) |
| R16 | Refactored dynamics preserve depth-1 invariant | §Architecture (Stack discipline) |
| R17 | Phase 6 strategy copies PROGRAM.md → task.md | §Interfaces (Phase 6 Initialize delta) |
| R18 | Phase 6 ledger drops op/left | §Data model (Phase 6 ledger post-refactor) |
| R19 | Phase 6 writes per-node `state-<id>.md` | §Interfaces (Phase 6 Initialize delta, Expand-absorb delta) |
| R20 | Phase 6 expand/score push uses `partial_state`+`task` | §Interfaces (Phase 6 Expand-push delta, Score-push delta) |
| R21 | Phase 6 child absorb writes per-node state file | §Interfaces (Phase 6 Expand-absorb delta) |
| R22 | Phase 6 Goal-push reads leaf's state-<id>.md | §Interfaces (Phase 6 Goal-push delta) |
| R23 | Phase 6 Solved reads leaf's state-<id>.md | §Interfaces (Phase 6 Solved delta) |
| R24 | `phase-6-tot.test.ts` updated for new schema | §Test strategy (`phase-6-tot.test.ts` updates) |
| R25 | `phase-6-tot.test.ts` checks per-node state files | §Test strategy (`phase-6-tot.test.ts` updates) |
| R26 | `phase-6-tot.test.ts` vocabulary check | §Test strategy (`phase-6-tot.test.ts` updates) |
| R27 | Phase 6 leaf README updated | §Architecture (Phase 6 README delta) |
| R28 | Phase 6 spec artefacts not edited | §Architecture (Phase 6 spec untouched) |
| R29 | Phase 6 README "Refactored in 6b" note | §Architecture (Phase 6 README delta) |
| R30 | Refactored `expand-node.md` contract | §Interfaces (`expand-node.md` post-refactor) |
| R31 | Refactored `score.md` contract | §Interfaces (`score.md` post-refactor) |
| R32 | Refactored dynamics vocabulary check | §Test strategy (vocabulary check) |
| R33 | Refactored dynamics single-cycle/no-push | §Architecture (Stack discipline), §Interfaces |
| R34 | LATS Initialize writes scoped files + root node | §Interfaces (LATS Initialize) |
| R35 | LATS Initialize transitions to `selecting` | §Interfaces (LATS Initialize) |
| R36 | No PROGRAM.md validation in LATS | §Interfaces (LATS Initialize), §Error handling |
| R37 | LATS tree.md ledger format | §Data model (LATS tree ledger) |
| R38 | LATS node block keys | §Data model (LATS tree ledger) |
| R39 | LATS surgical-edit-only after root | §Data model (LATS tree ledger), §Interfaces (Update primitives) |
| R40 | LATS monotonic IDs | §Data model (LATS tree ledger), §Interfaces (Append node) |
| R41 | LATS status enum (no `pruned`) | §Data model (LATS tree ledger) |
| R42 | LATS per-node state files | §Data model (LATS scoped files) |
| R43 | Per-node state files write-once | §Data model (LATS scoped files) |
| R44 | UCT formula in selection | §Interfaces (LATS Select) |
| R45 | n=0 leftmost-unvisited tiebreak | §Interfaces (LATS Select) |
| R46 | Selection terminates at childless node | §Interfaces (LATS Select) |
| R47 | LATS Expand-push contract | §Interfaces (LATS Expand-push) |
| R48 | partial_state push-arg = state file + ancestor lessons | §Interfaces (Compose-partial-state primitive) |
| R49 | LATS Expand-absorb appends children + sets chosen_child | §Interfaces (LATS Expand-absorb) |
| R50 | Malformed expand-node output handling | §Error handling, §Interfaces (LATS Expand-absorb) |
| R51 | LATS Simulate-push contract | §Interfaces (LATS Simulate-push) |
| R52 | LATS Simulate-absorb persists terminal + pushes evaluate | §Interfaces (LATS Simulate-absorb) |
| R53 | Malformed rollout output handling | §Error handling, §Interfaces (LATS Simulate-absorb) |
| R54 | LATS Evaluate-absorb verdict→reward | §Interfaces (LATS Evaluate-absorb) |
| R55 | LATS back-prop walks parent chain | §Interfaces (LATS Evaluate-absorb), §Interfaces (Back-prop primitive) |
| R56 | reward=1 → terminal_pass + Solution + done (record-A) | §Interfaces (LATS Evaluate-absorb) |
| R57 | reward=0 → reflecting (no terminal_fail) | §Interfaces (LATS Evaluate-absorb) |
| R58 | LATS Reflect-push contract | §Interfaces (LATS Reflect-push) |
| R59 | LATS Reflect-absorb appends to lessons-<id>.md | §Interfaces (LATS Reflect-absorb) |
| R60 | Malformed reflect output handling | §Error handling, §Interfaces (LATS Reflect-absorb) |
| R61 | Iteration counter + budget exhaustion | §Interfaces (LATS Reflect-absorb) |
| R62 | Halt at stack depth 1 | §Architecture (Stack discipline) |
| R63 | Run emits exactly one of Solution / No Solution Found | §Architecture (Termination), §Interfaces |
| R64 | Lesson files lazy creation | §Data model (LATS scoped files) |
| R65 | Lesson files append-only | §Data model (LATS scoped files), §Interfaces (Reflect-absorb) |
| R66 | Ancestor walk includes cursor | §Interfaces (Compose-partial-state primitive) |
| R67 | evaluate.md text-only mode | §Interfaces (`evaluate.md`) |
| R68 | evaluate.md contract not mutated | §Interfaces (`evaluate.md`) |
| R69 | PROGRAM.md byte-equal w/ Phase 6 | §Architecture (Demo) |
| R70 | Demo run produces Solution or No Solution Found | §Architecture (Termination), §Test strategy |
| R71 | Demo exhibits ≥1 back-prop on path of length ≥2 | §Test strategy |
| R72 | `phase-6b-lats.test.ts` content | §Test strategy (`phase-6b-lats.test.ts`) |
| R73 | Parent-doc dynamics table updates | §Architecture (Source-spec mutation) |
| R74 | Parent-doc Phase 6b prose update | §Architecture (Source-spec mutation) |
| R75 | Parent-doc Phase 6 note added | §Architecture (Source-spec mutation) |
| R76 | No workspace usage | §Architecture (Stack discipline), §Test strategy |
| R77 | No score.md in LATS dynamics/ | §Architecture (Component layout) |
| R78 | No pruning phase | §Architecture (Stack discipline), §Interfaces (no Prune state) |
| R79 | Hyperparameters not in PROGRAM.md | §Data model (LATS scoped files) |
| R80 | No concurrency | §Architecture (Stack discipline), §Test strategy |
| R81 | No frame-shared scoped/ access | §Architecture (Stack discipline) |
| R82 | No materialization of failed rollouts | §Interfaces (LATS Evaluate-absorb), §Test strategy |
| R83 | No domain vocabulary in INSTRUCTIONS.md or dynamics | §Test strategy (vocabulary check) |
| R84 | Phase 6 BFS semantics unchanged | §Interfaces (Phase 6 strategy delta — what does NOT change) |
| R85 | Phase 6 spec artefacts not edited | §Architecture (Phase 6 spec untouched) |
| R86 | Existing instances continue to work | §Architecture (Backwards compatibility) |

## Architecture

### Component layout (R1, R2, R4, R5, R77)

```
interpreters/3-search/
├── README.md                     # group-level (UPDATED for R2)
├── a-tot/                        # Phase 6 — REFACTORED in place (R14–R29)
│   ├── INSTRUCTIONS.md           # strategy: BFS controller (delta R17, R19, R20, R21, R22, R23)
│   ├── PROGRAM.md                # demo (unchanged)
│   ├── README.md                 # leaf (UPDATED for R27, R29)
│   └── dynamics/
│       ├── expand-node.md        # REWRITTEN domain-agnostic (R14, R30, R32, R33)
│       ├── score.md              # REWRITTEN domain-agnostic (R15, R31, R32, R33)
│       └── evaluate.md           # unchanged (byte-equal canonical)
└── b-lats/                       # Phase 6b — NEW
    ├── INSTRUCTIONS.md           # strategy: MCTS controller (R34–R63)
    ├── PROGRAM.md                # demo: byte-equal with a-tot/PROGRAM.md (R69)
    ├── README.md                 # leaf: pattern citation, state machine, etc. (R3)
    └── dynamics/
        ├── expand-node.md        # COPY: byte-equal of a-tot's refactored expand-node.md (R6)
        ├── rollout.md            # NEW (R10–R13)
        ├── evaluate.md           # COPY: byte-equal of canonical 1b (R7)
        └── reflect.md            # COPY: byte-equal of canonical 1c (R8)
```

`b-lats/dynamics/` deliberately **omits `score.md`** (R5, R77) — UCT-driven exploration of rollout-derived statistics replaces graded-rank value sampling. A future LATS variant that wants score-as-UCT-prior can re-introduce it without contract change.

### Group README delta (R2)

`interpreters/3-search/README.md`'s "Variants" table gains a row for `b-lats/` and the `interpreters/lats/` placeholder row is removed:

```
| `a-tot/`  | Shipped (Phase 6)   | Tree of Thoughts            | Yao et al., NeurIPS 2023, arXiv:2305.10601 |
| `b-lats/` | Shipped (Phase 6b)  | Language Agent Tree Search  | Zhou et al., 2023, arXiv:2310.04406        |
| `b-got/`  | Deferred            | Graph of Thoughts           | Besta et al., 2023, arXiv:2308.09687       |
```

The "Shared dynamics" section is updated: `expand-node.md` and `score.md` become **domain-agnostic** as of Phase 6b's refactor, so the parenthetical "expected to import both unmodified" stays true and is reinforced by the byte-equal-copy convention LATS adopts.

### Leaf README (R3)

`interpreters/3-search/b-lats/README.md` mirrors `a-tot/README.md`'s shape with LATS-specific content:

- Citation: Zhou et al. arXiv:2310.04406; cross-link to `docs/agent-workflows/patterns.md` § Group 3 — Search.
- State-machine summary: the 10 state names from §Interfaces below.
- Dynamics-and-contracts table: four rows (expand-node/rollout/evaluate/reflect) with push-args and return shapes.
- Run-it section: `./new-instance.sh my-lats interpreters/3-search/b-lats` then `instances/my-lats/run.sh`; inspect `frames/f000-strategy/MEMORY.md` (`## Solution` / `## No Solution Found`) and `frames/f000-strategy/scoped/tree.md` for the tree.
- Demo description: byte-equal Game of 24 from Phase 6, enabling A/B comparison.
- "Notable behaviour" section listing:
  - cycle cost ~10–13 cycles per MCTS iteration, ~3–4 LLM calls per iteration, ~30 iterations max → ~90–120 LLM calls worst case;
  - deliberate omission of `score.md` (UCT replaces it);
  - deliberate omission of pruning (UCT handles exploration/exploitation implicitly);
  - reflexion's per-node ancestor-walk lesson scope (§Data model);
  - record-A: failed rollouts do **not** materialise into the tree (§Interfaces);
  - the Phase 6 dynamics generalisation that landed alongside this interpreter (cross-link to this spec).

### Phase 6 README delta (R27, R29)

`interpreters/3-search/a-tot/README.md` is updated:

- "Notable behaviour" gains a top-of-section bullet: **"Refactored in Phase 6b (`docs/specs/2026-05-01-implement-phase-6b/`). Dynamics' push-args changed from `parent_thought`/`target`/`numbers_remaining` (and `thought`/`target`) to the canonical pair `partial_state`/`task`. The ledger no longer carries `op`/`left` fields — partial states live in `./scoped/state-<id>.md` instead. BFS semantics (k=5, b=5, max_depth, 3-sample scoring, weighted-sum aggregation, pruning, goal-checking) are unchanged."**
- The "Dynamics" table push-arg column is rewritten to the post-refactor names.
- The "PROGRAM.md prose constraint" bullet is preserved verbatim (Initialize-time integer extraction is unchanged — still done for max_depth derivation; the strategy still writes those scoped files at Initialize, see §Interfaces below).

### Phase 6 spec untouched (R28, R85)

`docs/specs/2026-04-30-agent-workflows-phase-6/{requirements,design,tasks}.md` are **not edited**. They remain the v1 historical record. This spec's R14–R23 explicitly supersede the Phase 6 requirements they touch (Phase 6's R11 ledger fields, R17 absorb shape, R29 reconstruction, R35 reconstruction, R38 push-args, R41 push-args). Future readers cross-reference both specs to understand the shipped state.

### Backwards compatibility (R86)

`new-instance.sh` (read at `new-instance.sh:36–66`) copies `INSTRUCTIONS.md`, `dynamics/`, and `PROGRAM.md` at instance creation time, so each instance is self-contained. The Phase 6 refactor only touches `interpreters/3-search/a-tot/`; existing instances under `instances/` keep their own snapshot of pre-refactor dynamics and pre-refactor strategy and continue to run unchanged. No `instances/` wipe is needed — Phase 2b R43's analogue does **not** apply here. The Phase 6b spec records this explicitly (R86) so future maintainers don't infer one.

### Stack discipline (R12, R16, R33, R62, R76, R78, R80, R81)

The strategy is the only frame on the stack at rest; a single push to one of the four LATS dynamics raises stack depth to 2 for one cycle, after which the dynamic pops back to 1. **Effective stack depth never exceeds 2.** No dynamic pushes another dynamic (R12, R33, plus `evaluate.md` and `reflect.md`'s known leaf status). The visualizer-replayable history snapshots therefore satisfy `stack.length ≤ 2` at every cycle (R72.6).

The strategy never executes anything in parallel: each cycle dispatches at most one push (R80). The MCTS loop is bounded by `max_iterations` from `./scoped/max_iterations.md` (R61); there is no separate retry counter, restart loop, or timeout.

LATS does **not** include a Prune state (R78). UCT's exploration term naturally handles "this branch tends to fail" by lowering its UCT score relative to better-performing siblings; the `pruned` status value from Phase 6's enum is therefore absent from the LATS ledger (R41).

LATS does **not** touch `workspace/` (R76). Tree state, lesson state, scoped scratch all live under the strategy frame's `./scoped/`. Project-git-per-node integration remains deferred.

Pushed frames receive everything they need via `## Push-Args` (specifically `partial_state` and `task`, for the three LATS dynamics that take any args); the strategy frame's `./scoped/` is never reached into by a child frame (R81). The shell does not provide that affordance and Phase 6b adds no workaround.

### Termination (R63, R70)

Every LATS run that reaches state `done` emits **exactly one** of:

- `## Solution` — set when a rollout earns reward 1, contains the rollout's `terminal_state` text and the iteration count at which it was found (R56).
- `## No Solution Found` — set when `iter_count >= max_iterations` and no reward-1 rollout was observed, contains the iteration count and the count of `terminal_fail` nodes (R61).

The shell intercepts `state == done` at stack depth 1 and halts (R62). Both terminal sections leave a clear post-mortem in MEMORY for the visualizer and for `history/` snapshots.

### Source-spec mutation (R73, R74, R75)

`docs/agent-workflows/requirements.md` is updated as part of this phase:

**Dynamics table changes (R73).** Three modifications to the table at the top of the doc:

1. The `expand-node.md` row's "MEMORY in" column changes from `## Parent Thought` to `## Partial State`, `## Task`. Other columns unchanged.
2. The `score.md` row's "MEMORY in" column changes from `## Thought` to `## Partial State`, `## Task`. Other columns unchanged.
3. A new row is inserted between `score.md` (Phase 6) and `evaluate-workflow.md` (Phase 7): `rollout.md | 6b | ## Partial State, ## Task | ## Terminal State | 1`.

**Phase 6b prose update (R74).** The "Reuse (no new dynamics)" bullet inside `## Phase 6b — Search + refinement + meta: LATS …` is replaced with:

> **Reuse:**
>   - `expand-node.md` (Phase 6, generalised in this same phase) — for node expansion.
>   - `evaluate.md` (Phase 1b) — text-only mode, as the rollout reward signal.
>   - `reflect.md` (Phase 1c) — pushed on rollout failure to harvest a per-node lesson, propagated into future expansions of the same subtree via ancestor-walk concatenation into `partial_state`.
>
> **One new dynamic:** `rollout.md` — paper-faithful LLM-policy single-shot rollout. Receives `partial_state` and `task`; returns a `terminal_state` reached by playing forward in one LLM call. The earlier "no new dynamics" claim was aspirational: paper-faithful rollout has no honest implementation in the existing dynamic contracts (the rollout's job — "play forward to terminal in one shot, return only the endpoint" — is structurally distinct from `expand-node.md`'s "generate k siblings" and from `evaluate.md`'s "judge a complete attempt"); bundling rollout into either would distort their contracts and break their reuse by other interpreters. The deviation is the same shape as Phase 6's R4 deviation (split of `expand-node.md` / `score.md`) and is justified for the same reason: contract preservation over count minimisation.

**Phase 6 prose addition (R75).** A one-paragraph note is added to the Phase 6 section (after the existing 3a/b/c subsection list):

> **Generalised in Phase 6b.** As of `docs/specs/2026-05-01-implement-phase-6b/`, Phase 6's `expand-node.md` and `score.md` are domain-agnostic — push-args are the canonical pair `partial_state`/`task`; the strategy persists per-node partial states in `./scoped/state-<id>.md` files; the ledger no longer carries `op`/`left`. BFS semantics (k=5, b=5, max_depth, 3-sample scoring, weighted-sum aggregation, pruning, goal-checking) are unchanged.

### Demo (R69, R70)

`interpreters/3-search/b-lats/PROGRAM.md` is **byte-equal** with `interpreters/3-search/a-tot/PROGRAM.md`, so a LATS run is directly comparable to a ToT run on identical input. The interpreter contains zero domain knowledge — swapping in any other PROGRAM.md (maze, code-passing-tests, constraint puzzle) would Just Work without touching strategy or dynamics. (R83 enforces this absence of domain vocabulary; tested via the regex check in §Test strategy.)

## Data model

### LATS tree ledger — `./scoped/tree.md` (R37–R41)

A sequence of YAML-style blocks separated by `---` lines, one block per node, in append order. Field schema is **strictly fewer fields than Phase 6**:

```
---
id: n0
parent_id: -
depth: 0
q: 0
n: 0
status: live
---
id: n1
parent_id: n0
depth: 1
q: 0
n: 0
status: live
…
```

| Field | Type | Range | Semantics |
| ----- | ---- | ----- | --------- |
| `id` | string | `n0`, `n1`, … | monotonic node id (R40) |
| `parent_id` | string | `-` for root, otherwise existing `n<i>` | edge to parent |
| `depth` | int | `0..∞` | tree depth (no max_depth in LATS — terminal is dynamic-determined) |
| `q` | float | `[0, n]` | sum of rollout rewards back-propagated through this node |
| `n` | int | `0..∞` | visit count (number of rollouts whose path included this node) |
| `status` | enum | `live`, `terminal_pass`, `terminal_fail` | once leaving `live`, never returns; **no `pruned` value** (R41) |

**Append-only invariant** (R39): the only operation that adds bytes anywhere except at end-of-file is the awk-based surgical update of `q`, `n`, or `status` of an existing block; that update changes byte length only of the targeted lines. **No cycle wholesale-rewrites `tree.md` after Initialize.**

**Status transitions:**
- `live → terminal_pass` once and only once per run, at LATS Evaluate-absorb when reward = 1 (R56).
- `live → terminal_fail` only at LATS Expand-absorb's "zero well-formed children" branch (R50). Failed rollouts do **not** mark the chosen child as `terminal_fail` (R57); the node remains `live` and may be re-explored (UCT will deprioritise it as `q/n` accumulates).

### LATS scoped files — strategy frame's `./scoped/` (R34, R42, R43, R64, R65, R79)

| File | Lifetime | Content | Edit pattern |
| ---- | -------- | ------- | ------------ |
| `./scoped/tree.md` | whole run | YAML-block ledger above | append + awk-update only (R39) |
| `./scoped/task.md` | whole run | byte-equal copy of `../../PROGRAM.md` | wholesale-write at Initialize, never again |
| `./scoped/max_iterations.md` | whole run | one integer (`30`) | wholesale-write at Initialize, never again |
| `./scoped/uct_c.md` | whole run | one float (`1.41421356`) | wholesale-write at Initialize, never again |
| `./scoped/iter_count.md` | whole run | one integer | wholesale-write at Initialize (`0`); incremented per iteration via `echo $((…+1)) >` |
| `./scoped/cursor.md` | whole run | one node id (selection target) | wholesale-write each Select |
| `./scoped/chosen_child.md` | whole run | one node id (rollout origin for current iteration) | wholesale-write each Expand-absorb |
| `./scoped/last_terminal.md` | whole run | the latest rollout's `terminal_state` text | wholesale-write each Simulate-absorb |
| `./scoped/state-<id>.md` | whole run | per-node partial state text (block-scalar payload from expand-node.md, or empty for root) | **write-once** at node creation (R43); never modified |
| `./scoped/lessons-<id>.md` | whole run | per-node accumulated lessons (one bullet per failed-rollout reflection) | **lazy** (R64): created only on first append; **append-only** (R65) via `echo "- …" >>` |
| `./scoped/staged/{partial_state,task,attempt,criterion,verdict,feedback}.md` | per-dispatch | push-arg staging files | wholesale-write each push instruction |

R79 is satisfied structurally: `max_iterations`, `uct_c`, and the implicit `k=5` are written by the strategy at Initialize; `PROGRAM.md` declares none of them. Tuning knobs in `./scoped/` files mean a maintainer can edit `./scoped/uct_c.md` between cycles for an in-flight instance without touching INSTRUCTIONS.md.

### Phase 6 ledger post-refactor (R18, R19)

`interpreters/3-search/a-tot/`'s `./scoped/tree.md` schema after refactor:

```
---
id: n0
parent_id: -
depth: 0
value: 0
samples: 0
status: live
```

The `op` and `left` fields are removed (R18). Every per-node partial state lives in `./scoped/state-<id>.md` as a multi-line text blob (R19). Phase 6's `value`, `samples`, and `status ∈ {live, pruned, terminal_pass, terminal_fail}` semantics are **unchanged** (R84) — only the spatial location of partial-state data moves.

The Phase 6 strategy's other scoped files (`numbers.md`, `target.md`, `max_depth.md`, `current_depth.md`, `cursor.md`, `staged/*`) are **retained** (R84): Initialize still parses integers from PROGRAM.md to derive max_depth (= N − 1) and to record numbers/target for the goal-checking criterion synthesis. The scoped files Phase 6 needed for BFS bookkeeping are independent of the dynamic-arg shape.

### Phase 6 task.md addition (R17)

A new scoped file `./scoped/task.md` is added to the Phase 6 strategy (R17). Initialize copies `../../PROGRAM.md` to it once. Every push of `expand-node.md` and `score.md` reads `./scoped/task.md` for the `task` push-arg.

### MEMORY layout — LATS strategy (per-cycle)

Wholesale-rewritten each cycle:

```
## State
<empty | selecting | expanding | expanding_completed | simulating | simulating_completed
 | evaluating | evaluating_completed | reflecting | reflecting_completed | done>

## Matched Instruction
<instruction label>

## Last Action
<one short sentence>

## Result
<one short sentence>
```

Spliced sections appear transiently after a dynamic pop:

- After `expand-node.md` pop: `## Children` (consumed and dropped by Expand-absorb, R49.e).
- After `rollout.md` pop: `## Terminal State` (consumed and dropped by Simulate-absorb, R52.c).
- After `evaluate.md` pop: `## Verdict`, `## Feedback` (consumed and dropped by Evaluate-absorb).
- After `reflect.md` pop: `## Lesson` (consumed and dropped by Reflect-absorb, R59).

`## Pending Questions` is appended (never replaced) when malformed dynamic output is detected (R50, R53, R54-malformed-verdict, R60). The strategy never sets state to `waiting_for_user` (R36 — LATS has no analogue of Phase 6's R6).

## Interfaces / API

### LATS strategy state machine (overview)

```
empty                       → Initialize        → selecting (R34, R35)
selecting                   → Select            → expanding (R44, R45, R46)
expanding                   → Expand-push       → expanding (shell pop → expanding_completed) (R47)
expanding_completed         → Expand-absorb     → simulating | selecting (zero-children) (R49, R50)
simulating                  → Simulate-push     → simulating (shell pop → simulating_completed) (R51)
simulating_completed        → Simulate-absorb   → evaluating (R52, R53)
evaluating                  → Evaluate-push     → evaluating (shell pop → evaluating_completed)
evaluating_completed        → Evaluate-absorb   → done (reward=1) | reflecting (reward=0) (R54, R55, R56, R57)
reflecting                  → Reflect-push      → reflecting (shell pop → reflecting_completed) (R58)
reflecting_completed        → Reflect-absorb    → selecting | done (budget exhausted) (R59, R60, R61)
done                        → (shell halts) (R62)
```

(Note on push/absorb pairing: `Expand-push` and `Expand-absorb` together implement what the requirements call "the Expand-push contract" — `Expand-push` writes `## Push`; the shell pops the dynamic; the shell renames state to `expanding_completed`; `Expand-absorb` matches that suffix and consumes the spliced `## Children`. Same pattern for `Simulate-push`/`Simulate-absorb`, `Evaluate-push`/`Evaluate-absorb`, `Reflect-push`/`Reflect-absorb`. Eleven instructions total, one per row above.)

### Compose-partial-state primitive (R48, R66)

A bash helper invoked by Expand-push and Simulate-push. Input: a node id `X`. Output: the contents of a string suitable as the `partial_state` push-arg.

```bash
compose_partial_state() {
  local X="$1"

  # 1. Begin with the node's own state (write-once payload, R43)
  cat "./scoped/state-${X}.md"

  # 2. Walk parent chain root → X (in that order); for each ancestor (including X
  #    itself, R66) with a lessons file, emit the lessons.
  ANCESTORS=()
  CURRENT="$X"
  while [ -n "$CURRENT" ] && [ "$CURRENT" != "-" ]; do
    ANCESTORS=("$CURRENT" "${ANCESTORS[@]}")   # prepend → root-first order
    CURRENT=$(awk -v ID="$CURRENT" '
      /^---$/ { in_block=0; next }
      /^id:/  { in_block=($2==ID) }
      in_block && /^parent_id:/ { print $2; exit }
    ' ./scoped/tree.md)
  done

  HAS_LESSONS=0
  for A in "${ANCESTORS[@]}"; do
    if [ -s "./scoped/lessons-${A}.md" ]; then
      HAS_LESSONS=1
      break
    fi
  done

  if [ "$HAS_LESSONS" -eq 1 ]; then
    printf '\n\nLessons learned along this branch:\n'
    for A in "${ANCESTORS[@]}"; do
      [ -s "./scoped/lessons-${A}.md" ] && cat "./scoped/lessons-${A}.md"
    done
  fi
}
```

The `Lessons learned along this branch:` block is omitted when no ancestor has lessons (avoiding gratuitous prompt overhead in the 0-iteration case). Order is root-to-cursor (R48); within a single ancestor's file, original write order (= chronological reflection order) is preserved by the append-only invariant (R65).

### LATS Initialize (R34, R35, R36)

**Condition:** `state == empty`

**Action:** Persist scoped files, write root node to ledger, transition to `selecting`.

```bash
mkdir -p ./scoped/staged

cp ../../PROGRAM.md ./scoped/task.md
echo 30          > ./scoped/max_iterations.md
echo 1.41421356  > ./scoped/uct_c.md
echo 0           > ./scoped/iter_count.md

cat > ./scoped/tree.md << ROOT_EOF
---
id: n0
parent_id: -
depth: 0
q: 0
n: 0
status: live
ROOT_EOF

> ./scoped/state-n0.md   # empty file — semantically "no extensions applied yet"
```

Then wholesale-rewrite MEMORY with `state: selecting`. R36 is satisfied negatively: there is **no** "validate PROGRAM.md parsing" instruction; PROGRAM.md content is opaque to the strategy.

### LATS Select (R44, R45, R46)

**Condition:** `state == selecting`

**Action:** Descend the tree from root using UCT. At each non-leaf, choose the next child per:

- **R45 fast-path:** if any child has `n == 0`, pick the child with the lowest `id` among them (deterministic leftmost-unvisited tiebreak); skip UCT computation for that step.
- **R44 UCT:** otherwise compute `UCT(child) = q/n + c · sqrt(ln(n_parent) / n)` for each child via `bc -l` and pick the maximum (ties broken by lowest id, deterministic).

A leaf is a node with no children (no node in `tree.md` has `parent_id == this id`). When selection reaches a leaf, write its id to `./scoped/cursor.md` and transition to `expanding` (R46).

```bash
C=$(cat ./scoped/uct_c.md)
CURRENT="n0"

while true; do
  # Find children of CURRENT
  CHILDREN=$(awk -v P="$CURRENT" '/^---$/{id="";p=""} /^id:/{id=$2} /^parent_id:/{p=$2; if (p==P) print id}' ./scoped/tree.md)
  [ -z "$CHILDREN" ] && break   # leaf

  # R45: any child with n == 0?
  UNVISITED=$(for ID in $CHILDREN; do
    N=$(awk -v X="$ID" '/^---$/{ib=0;next} /^id:/{ib=($2==X)} ib && /^n:/{print $2; exit}' ./scoped/tree.md)
    [ "$N" = "0" ] && echo "$ID"
  done | sort | head -n 1)

  if [ -n "$UNVISITED" ]; then
    CURRENT="$UNVISITED"
    continue
  fi

  # R44: UCT among visited children
  N_PARENT=$(awk -v X="$CURRENT" '/^---$/{ib=0;next} /^id:/{ib=($2==X)} ib && /^n:/{print $2; exit}' ./scoped/tree.md)
  BEST_ID=""
  BEST_UCT=""
  for ID in $CHILDREN; do
    Q=$(awk -v X="$ID" '/^---$/{ib=0;next} /^id:/{ib=($2==X)} ib && /^q:/{print $2; exit}' ./scoped/tree.md)
    N=$(awk -v X="$ID" '/^---$/{ib=0;next} /^id:/{ib=($2==X)} ib && /^n:/{print $2; exit}' ./scoped/tree.md)
    UCT=$(echo "$Q/$N + $C * sqrt(l($N_PARENT)/$N)" | bc -l)
    if [ -z "$BEST_UCT" ] || [ "$(echo "$UCT > $BEST_UCT" | bc -l)" = "1" ]; then
      BEST_ID="$ID"; BEST_UCT="$UCT"
    fi
  done
  CURRENT="$BEST_ID"
done

echo "$CURRENT" > ./scoped/cursor.md
```

Then transition to `expanding`.

### LATS Expand-push (R47, R48)

**Condition:** `state == expanding`

**Action:** Stage push-args via Compose-partial-state primitive (R48); emit `## Push dynamics/expand-node.md`.

```bash
ID=$(cat ./scoped/cursor.md)
compose_partial_state "$ID" > ./scoped/staged/partial_state.md
cp ./scoped/task.md ./scoped/staged/task.md
```

Emit MEMORY:

```
## State
expanding
## Push
dynamics/expand-node.md
## Push-Args
partial_state: |
  <staged/partial_state.md content, two-space indented>
task: |
  <staged/task.md content, two-space indented>
```

The state value `expanding` is the returnState; on pop the shell sets state to `expanding_completed`.

### LATS Expand-absorb (R49, R50)

**Condition:** `state == expanding_completed AND ## Children present`

**Action:** Parse `## Children` (alternating `state:` block-scalar entries; k=5 expected). For each well-formed entry: allocate next monotonic id `n<index>` (using `grep -c '^id: n' ./scoped/tree.md`), append a node block `{parent_id: cursor, depth: cursor_depth+1, q: 0, n: 0, status: live}`, write the entry's payload to `./scoped/state-<new_id>.md`. Record the lowest-id newly created child to `./scoped/chosen_child.md`. Drop `## Children`. Transition to `simulating`.

**R50 malformed branch.** If fewer than k=5 well-formed entries parsed, append the well-formed entries that did parse, append a non-blocking `## Pending Questions` naming the missing count, and:
- If ≥1 entry parsed: set `chosen_child` to the leftmost successfully created child; transition to `simulating`.
- If 0 entries parsed: surgically update the cursor's `status` to `terminal_fail`, transition back to `selecting` (don't enter simulation). Never transition to `waiting_for_user`.

### LATS Simulate-push (R51)

**Condition:** `state == simulating`

**Action:** Stage push-args from `chosen_child` (not `cursor`); emit `## Push dynamics/rollout.md`.

```bash
CC=$(cat ./scoped/chosen_child.md)
compose_partial_state "$CC" > ./scoped/staged/partial_state.md
cp ./scoped/task.md ./scoped/staged/task.md
```

Emit MEMORY:

```
## State
simulating
## Push
dynamics/rollout.md
## Push-Args
partial_state: |
  <staged/partial_state.md content, two-space indented>
task: |
  <staged/task.md content, two-space indented>
```

The state value `simulating` is the returnState; on pop the shell sets state to `simulating_completed`.

### LATS Simulate-absorb (R52, R53)

**Condition:** `state == simulating_completed AND ## Terminal State present`

**Action:** Persist `## Terminal State` content to `./scoped/last_terminal.md`. Stage `attempt` and `criterion` push-args. Push `dynamics/evaluate.md`. Drop `## Terminal State` from MEMORY rewrite.

```bash
awk '/^## Terminal State$/{f=1; next} /^## /{f=0} f' ./MEMORY.md > ./scoped/last_terminal.md
cp ./scoped/last_terminal.md ./scoped/staged/attempt.md
cp ./scoped/task.md ./scoped/staged/criterion.md
```

Emit MEMORY:

```
## State
evaluating
## Push
dynamics/evaluate.md
## Push-Args
attempt: |
  <staged/attempt.md content, two-space indented>
criterion: |
  <staged/criterion.md content, two-space indented>
```

The state value `evaluating` is the returnState; on pop the shell sets state to `evaluating_completed`.

**R53 malformed branch.** If `## Terminal State` is absent or empty: skip the `evaluate.md` push, append a non-blocking `## Pending Questions` citing the malformation, write a synthetic `## Verdict\nfail\n## Feedback\nrollout returned malformed output\n` directly into MEMORY, and transition directly to `evaluating_completed` (the next-cycle Evaluate-absorb consumes the synthetic verdict as a fail). Never transition to `waiting_for_user`.

### LATS Evaluate-absorb (R54, R55, R56, R57)

**Condition:** `state == evaluating_completed AND ## Verdict present`

**Action:** Parse `## Verdict`. Map to reward: `pass → 1`, `fail → 0`, anything else → 0 (treated as fail per Phase 6 R33; non-blocking `## Pending Questions` appended). Back-propagate (Back-prop primitive below). Branch on reward.

```bash
CC=$(cat ./scoped/chosen_child.md)
VERDICT=$(awk '/^## Verdict$/{f=1; next} /^## /{f=0} f && /[a-z]/{print; exit}' ./MEMORY.md | tr -d ' ')

case "$VERDICT" in
  pass) REWARD=1 ;;
  fail) REWARD=0 ;;
  *)    REWARD=0; MALFORMED=1 ;;
esac

# Back-prop along path from CC up to and including root
backprop "$CC" "$REWARD"
```

If `REWARD == 1`:

```bash
# R56: terminal_pass + Solution + done; record-A: don't materialise rollout into tree
awk -v X="$CC" '
  /^---$/ { in_block = 0; print; next }
  /^id:/  { in_block = ($2 == X); print; next }
  in_block && /^status:/ { print "status: terminal_pass"; next }
  { print }
' ./scoped/tree.md > ./scoped/tree.md.tmp && mv ./scoped/tree.md.tmp ./scoped/tree.md

ITER=$(cat ./scoped/iter_count.md)
TERMINAL=$(cat ./scoped/last_terminal.md)
cat > ./MEMORY.md << SOLUTION_EOF
## State
done
## Matched Instruction
Evaluate-absorb (solved)
## Last Action
Reward 1 received from terminal state via chosen_child $CC at iteration $ITER.
## Result
Solution found.
## Solution
Iteration: $ITER
Terminal state:
$TERMINAL
SOLUTION_EOF
```

If `REWARD == 0`: transition to `reflecting`. **Do not** mark `chosen_child` as `terminal_fail` (R57) — it stays `live`; UCT will deprioritise it as `q/n` accumulates more failures. (The strategy *does* update `n` and `q` via back-prop.)

### Back-prop primitive (R55)

Walks the parent chain from a starting node up to and including the root, surgically incrementing `n` by 1 and adding `reward` to `q` at every node on the path.

```bash
backprop() {
  local START="$1"
  local REWARD="$2"
  local CURRENT="$START"
  while [ -n "$CURRENT" ] && [ "$CURRENT" != "-" ]; do
    # Read current values
    Q=$(awk -v X="$CURRENT" '/^---$/{ib=0;next} /^id:/{ib=($2==X)} ib && /^q:/{print $2; exit}' ./scoped/tree.md)
    N=$(awk -v X="$CURRENT" '/^---$/{ib=0;next} /^id:/{ib=($2==X)} ib && /^n:/{print $2; exit}' ./scoped/tree.md)
    NEW_Q=$(echo "$Q + $REWARD" | bc -l)
    NEW_N=$((N + 1))
    # Surgical update (R39)
    awk -v X="$CURRENT" -v V="$NEW_Q" '/^---$/{ib=0;print;next} /^id:/{ib=($2==X);print;next} ib && /^q:/{print "q: " V;next} {print}' ./scoped/tree.md > ./scoped/tree.md.tmp && mv ./scoped/tree.md.tmp ./scoped/tree.md
    awk -v X="$CURRENT" -v V="$NEW_N" '/^---$/{ib=0;print;next} /^id:/{ib=($2==X);print;next} ib && /^n:/{print "n: " V;next} {print}' ./scoped/tree.md > ./scoped/tree.md.tmp && mv ./scoped/tree.md.tmp ./scoped/tree.md
    # Step to parent
    CURRENT=$(awk -v X="$CURRENT" '/^---$/{ib=0;next} /^id:/{ib=($2==X)} ib && /^parent_id:/{print $2; exit}' ./scoped/tree.md)
  done
}
```

Result: a path of length L gets L back-prop updates per iteration, all by surgical edit. Phase 6's "no wholesale-rewrite after root" invariant (R39) is preserved.

### LATS Reflect-push (R58)

**Condition:** `state == reflecting`

**Action:** Stage push-args; emit `## Push dynamics/reflect.md`.

```bash
cp ./scoped/last_terminal.md ./scoped/staged/attempt.md
echo "fail" > ./scoped/staged/verdict.md
# Pull ## Feedback from MEMORY (set by evaluate.md), or synthesize
awk '/^## Feedback$/{f=1; next} /^## /{f=0} f' ./MEMORY.md > ./scoped/staged/feedback.md
[ -s ./scoped/staged/feedback.md ] || echo "rollout judged fail" > ./scoped/staged/feedback.md
```

Emit MEMORY:

```
## State
reflecting
## Push
dynamics/reflect.md
## Push-Args
attempt: |
  <staged/attempt.md content, two-space indented>
verdict: fail
feedback: |
  <staged/feedback.md content, two-space indented>
```

The state value `reflecting` is the returnState; on pop the shell sets state to `reflecting_completed`.

### LATS Reflect-absorb (R59, R60, R61)

**Condition:** `state == reflecting_completed`

**Action:** If `## Lesson` is present and non-empty, append it as a bullet to `./scoped/lessons-<chosen_child_id>.md` (creating the file lazily, R64); if not, append a non-blocking `## Pending Questions` and skip the append (R60). Drop `## Lesson` from MEMORY. Increment `iter_count`. Check budget: if exhausted, emit `## No Solution Found` and transition to `done`; else transition to `selecting`.

```bash
CC=$(cat ./scoped/chosen_child.md)

LESSON=$(awk '/^## Lesson$/{f=1; next} /^## /{f=0} f' ./MEMORY.md)
if [ -n "$(echo "$LESSON" | tr -d ' \n')" ]; then
  echo "- $(echo "$LESSON" | tr '\n' ' ' | sed 's/  */ /g')" >> "./scoped/lessons-${CC}.md"
else
  MALFORMED_REFLECT=1
fi

ITER=$(cat ./scoped/iter_count.md)
NEW_ITER=$((ITER + 1))
echo "$NEW_ITER" > ./scoped/iter_count.md

MAX=$(cat ./scoped/max_iterations.md)
if [ "$NEW_ITER" -ge "$MAX" ]; then
  FAILS=$(grep -c '^status: terminal_fail$' ./scoped/tree.md)
  cat > ./MEMORY.md << EXHAUSTED_EOF
## State
done
## Matched Instruction
Reflect-absorb (budget exhausted)
## Last Action
Iteration count $NEW_ITER reached max_iterations $MAX without finding reward 1.
## Result
Search exhausted.
## No Solution Found
Iterations: $NEW_ITER
terminal_fail nodes: $FAILS
EXHAUSTED_EOF
else
  # Transition to selecting; preserve any Pending Questions from reflect malformation
  ...
fi
```

R59 satisfies the append via `>>` (append-only, R65). R64 is satisfied by the file's lazy creation (the `>>` only creates when the first append fires).

### `expand-node.md` (post-refactor; canonical at `interpreters/3-search/a-tot/dynamics/expand-node.md`; byte-equal copy at `interpreters/3-search/b-lats/dynamics/expand-node.md`) (R6, R14, R30, R32, R33)

**Push-args declared** (R10-shape): `{{partial_state}}`, `{{task}}`. (No `{{target}}`, no `{{numbers_remaining}}`, no `{{parent_thought}}`.)

**Single instruction matching `state == empty`** (R33-shape, single-cycle): generates exactly k=5 candidate next states by extending `partial_state` per the rules implied by `task`.

```
# Dynamic: Expand Node

Receives push-args: {{partial_state}}, {{task}}.
Produces: ## State done + ## Return block with key `children`.

This dynamic is invoked by a search interpreter once per live unexpanded tree
node. One invocation generates exactly k=5 candidate next states by reading the
task definition in {{task}} and extending the partial state below by one
forward step per candidate.

## Instruction: Generate children
**Condition:** MEMORY state is "empty"
**Action:** Read the task definition in {{task}}. Generate exactly k=5
candidate next states that extend {{partial_state}} according to the task's
rules. Each candidate is a single forward step from {{partial_state}}; the
returned `state:` payload should describe the partial state *after* that step
applies (in the same prose form the task uses). Prefer diverse next steps;
avoid emitting five identical candidates.

Write ./MEMORY.md with this EXACT shape (the ## Return block MUST be in the
same heredoc as the state change):

cat > ./MEMORY.md << 'MEMEOF'
## State
done
## Matched Instruction
Generate children
## Last Action
Generated five candidate next states for the partial state.
## Result
Children produced.
## Return
children: |
  state: |
    <partial state after extension 1, every line indented four spaces>
  state: |
    <partial state after extension 2, every line indented four spaces>
  state: |
    <partial state after extension 3, every line indented four spaces>
  state: |
    <partial state after extension 4, every line indented four spaces>
  state: |
    <partial state after extension 5, every line indented four spaces>
MEMEOF

Task definition:
{{task}}

Partial state to extend:
{{partial_state}}
```

**Vocabulary check (R13, R32, R83):** the prose contains no occurrences of "Game of 24", "numbers", "arithmetic", "+", "−", "×", "÷", "left set", "moves remaining", "target", "maze", "code", "function", or any other domain vocabulary; only the abstract terms "task", "partial state", "extension", "next state", "candidate" appear.

**No further pushes** (R33): the body emits a single MEMORY heredoc with the `## Return` block; it never writes `## Push`. Stack depth from caller stays at 1 (R16, R33).

### `score.md` (post-refactor; at `interpreters/3-search/a-tot/dynamics/score.md`) (R15, R31, R32, R33)

**Push-args declared:** `{{partial_state}}`, `{{task}}`. (No `{{target}}`, no `{{thought}}`.)

**Single instruction matching `state == empty`:** one cycle, returns `## State done` and `## Return value: <label>` where label is one of `sure | likely | impossible`.

```
# Dynamic: Score

Receives push-args: {{partial_state}}, {{task}}.
Produces: ## State done + ## Return block with key `value` set to one of
`sure`, `likely`, or `impossible`.

This dynamic is invoked by a search interpreter to judge whether a partial
state can plausibly satisfy the task's success criterion. The strategy
typically aggregates multiple invocations.

## Instruction: Score state
**Condition:** MEMORY state is "empty"
**Action:** Read the task definition in {{task}}. Judge whether
{{partial_state}} can plausibly be extended into a state that satisfies the
task. Output exactly one label:

  - sure: the task can definitely be satisfied from this partial state (e.g.
    the partial state already satisfies the task, or one obvious extension
    away).
  - likely: feasible but not obvious (further extensions are needed and the
    path forward is plausible but uncertain).
  - impossible: commonsense rules out completion from this partial state.

Write ./MEMORY.md with this EXACT shape (the ## Return block MUST be in the
same heredoc as the state change):

cat > ./MEMORY.md << 'MEMEOF'
## State
done
## Matched Instruction
Score state
## Last Action
Scored partial state for task plausibility; popping.
## Result
Score produced.
## Return
value: <one of: sure, likely, impossible>
MEMEOF

Task definition:
{{task}}

Partial state to score:
{{partial_state}}
```

**Vocabulary check (R32, R83):** same as `expand-node.md` — no domain words.

**No further pushes** (R33).

### `rollout.md` (NEW; at `interpreters/3-search/b-lats/dynamics/rollout.md`) (R10, R11, R12, R13)

**Push-args declared** (R10): `{{partial_state}}`, `{{task}}`.

**Single instruction matching `state == empty`** (R11): one LLM call producing a complete terminal state.

```
# Dynamic: Rollout

Receives push-args: {{partial_state}}, {{task}}.
Produces: ## State done + ## Return block with key `terminal_state`.

This dynamic is invoked by a Monte Carlo Tree Search controller once per
selected leaf to estimate the leaf's value via a single committed playout.
The dynamic plays one trajectory forward from {{partial_state}} all the way
to a terminal state (per the task's terminal predicate) and returns only the
endpoint — intermediate steps are not tracked in the tree, so they need not
be returned.

## Instruction: Play forward
**Condition:** MEMORY state is "empty"
**Action:** Read the task definition in {{task}}. Starting from
{{partial_state}}, repeatedly apply one forward extension at a time per the
task's rules, committing to a single trajectory, until the task's terminal
predicate fires (i.e. the state cannot be extended further or the task's
acceptance criterion is decidable on it). Return only the terminal state
reached; do not return intermediate states.

Write ./MEMORY.md with this EXACT shape (the ## Return block MUST be in the
same heredoc as the state change):

cat > ./MEMORY.md << 'MEMEOF'
## State
done
## Matched Instruction
Play forward
## Last Action
Rolled forward from the partial state to a terminal state; popping.
## Result
Terminal state produced.
## Return
terminal_state: |
  <multi-line terminal state, every line indented two spaces>
MEMEOF

Task definition:
{{task}}

Starting partial state:
{{partial_state}}
```

**Vocabulary check (R13, R83):** no domain words; only abstract terms ("task", "partial state", "extension", "trajectory", "terminal state").

**No further pushes** (R12). Stack depth from caller stays at 1.

### `evaluate.md` (R7, R67, R68)

Byte-equal copy of `interpreters/1-iterative-refinement/b-evaluator-optimizer/dynamics/evaluate.md`. Push-args `{{attempt}}`, `{{criterion}}`. Returns `verdict` (`pass`/`fail`) and `feedback`. Identity is enforced by `phase-dynamics-identity.test.ts` extension (R9).

LATS invokes `evaluate.md` in **text-only mode** (R67): the criterion is `./scoped/task.md` content (= PROGRAM.md text), which has no `../../workspace/` paths, so the dynamic's mode-classification routes to text-only judgement. R68 is satisfied negatively: Phase 6b adds nothing to `evaluate.md`'s prose or contract.

### `reflect.md` (R8)

Byte-equal copy of `interpreters/1-iterative-refinement/c-reflexion/dynamics/reflect.md`. Push-args `{{attempt}}`, `{{verdict}}`, `{{feedback}}`. Returns `lesson`. Identity enforced by `phase-dynamics-identity.test.ts` extension (R9).

### Phase 6 Initialize delta (R17, R19)

The Phase 6 strategy's existing Initialize instruction gains two additions (preserving R6, R5, R7, R8, R9 of Phase 6's own spec):

```bash
# (existing Phase 6 logic unchanged: parse PROGRAM.md, derive max_depth,
#  write numbers/target/max_depth/current_depth scoped files)
…

# NEW (R17): copy PROGRAM.md to ./scoped/task.md for downstream pushes
cp ../../PROGRAM.md ./scoped/task.md

# Existing root-block append (modified per R18: no op/left fields)
cat > ./scoped/tree.md << ROOT_EOF
---
id: n0
parent_id: -
depth: 0
value: 0
samples: 0
status: live
ROOT_EOF

# NEW (R19): write root partial state — the LLM-facing form of the puzzle's
# starting state. We synthesise it from numbers/target so the first expand-node.md
# push has a meaningful partial state to extend.
cat > ./scoped/state-n0.md << INIT_STATE_EOF
Starting state for the task. Refer to the task definition for the rules.
Numbers in play: $(cat ./scoped/numbers.md)
Target: $(cat ./scoped/target.md)
Moves so far: (none)
INIT_STATE_EOF
```

**Note on root state form.** Phase 6's existing pre-refactor Initialize already extracts `numbers` and `target` from PROGRAM.md (this is unchanged per R84 — Phase 6 still needs them to derive `max_depth = N − 1`). Synthesising a small "starting state" prose into `state-n0.md` is a strategy-level convenience; it's still domain-agnostic in *form* (the prose mentions "Numbers in play" and "Target" but those are headers describing the bag of values, not Game-of-24 vocabulary), and the LLM-facing dynamics treat it as opaque text. The strategy is allowed to know about `numbers` and `target` because Phase 6's BFS uses them; the dynamics aren't.

### Phase 6 Expand-push delta (R20)

The Phase 6 strategy's Expand-push instruction is rewritten to use the new push-arg shape:

```bash
ID=$(<find first unexpanded live at DEPTH using primitive>)
echo "$ID" > ./scoped/cursor.md

# NEW: stage partial_state and task instead of parent_thought/target/numbers_remaining
cat ./scoped/state-${ID}.md > ./scoped/staged/partial_state.md
cp ./scoped/task.md ./scoped/staged/task.md
```

The `## Push` block is rewritten:

```
## Push
dynamics/expand-node.md
## Push-Args
partial_state: |
  <staged/partial_state.md content, two-space indented>
task: |
  <staged/task.md content, two-space indented>
```

### Phase 6 Score-push delta (R20)

Symmetrical with Expand-push delta. The `thought:`/`target:` push-args are replaced with `partial_state:`/`task:`; the Score-absorb logic (samples++, weighted sum, R44 malformed handling) is unchanged.

### Phase 6 Expand-absorb delta (R21)

Phase 6's existing Expand-absorb appends a node block per child entry. The change: each child's block carries only the schema fields from R18 (no `op` / `left`), and the strategy writes the entry's payload to `./scoped/state-<new_id>.md`:

```bash
# Parse `## Children` as alternating `state:` block-scalar entries (R30 refactored shape).
# For each well-formed entry:
NEW_ID="n$(grep -c '^id: n' ./scoped/tree.md)"
cat >> ./scoped/tree.md << CHILD_EOF
---
id: $NEW_ID
parent_id: $PARENT
depth: $NEXT_DEPTH
value: 0
samples: 0
status: live
CHILD_EOF
echo "<state payload>" > ./scoped/state-${NEW_ID}.md
```

Phase 6's existing R47 well-formed-count check, Pending Questions append, and Phase-router routing are unchanged (R84).

### Phase 6 Goal-push delta (R22)

The Phase 6 strategy's Goal-push currently reconstructs the leaf's expression by walking the parent chain and concatenating `op:` lines. After the refactor, every node's full expression-so-far lives in its `state-<id>.md` (the LLM populated it during expand-node.md). So Goal-push reads the leaf's state file directly:

```bash
ID=$(<find first live at depth MAX>)
echo "$ID" > ./scoped/cursor.md
cp ./scoped/state-${ID}.md ./scoped/staged/attempt.md
cp ./scoped/task.md ./scoped/staged/criterion.md
```

The criterion is now `./scoped/task.md` (= PROGRAM.md text) — `evaluate.md` text-only mode handles the judgement. **The synthesized "Expression must use each of … exactly once and evaluate to …" criterion is dropped** (the task description in PROGRAM.md already encodes the acceptance criterion). The parent-walk primitive is no longer needed and is deleted from INSTRUCTIONS.md.

### Phase 6 Solved delta (R23)

Phase 6's Solved instruction currently reconstructs the winning expression by parent-walk. After refactor, it reads the winning leaf's `state-<id>.md` directly:

```bash
PASS_ID=$(awk '/^---$/{id=""; s=""} /^id:/{id=$2} /^status:/{s=$2; if (s=="terminal_pass") {print id; exit}}' ./scoped/tree.md)
SOLUTION=$(cat ./scoped/state-${PASS_ID}.md)
TOTAL=$(grep -c '^id: n' ./scoped/tree.md)
PRUNED=$(grep -c '^status: pruned$' ./scoped/tree.md)

cat > ./MEMORY.md << SOLVED_EOF
## State
done
## Matched Instruction
Solved
## Last Action
Read winning state from state-${PASS_ID}.md.
## Result
Search complete with verified solution.
## Solution
$SOLUTION
Total nodes expanded: $TOTAL
Nodes pruned: $PRUNED
SOLVED_EOF
```

### Phase 6 strategy delta — what does NOT change (R84)

Out of scope for the refactor (preserved verbatim from Phase 6's shipped INSTRUCTIONS.md):

- **k=5** children per expand. Bash literal in INSTRUCTIONS.md.
- **b=5** retained per pruning. Bash literal in INSTRUCTIONS.md.
- **3-sample scoring** per child. Phase-router still gates pruning on `samples == 3` per child.
- **Weighted-sum aggregation** `sure → 20, likely → 1, impossible → 0.001`. Bash mapping in Score-absorb.
- **Pruning phase** — Phase 6 still has it; LATS doesn't (R78).
- **max_depth = N − 1** derivation at Initialize.
- **R6 PROGRAM.md validation** (insufficient input → `waiting_for_user`).
- **R44 malformed score label**, **R47 malformed expand output**, **R33 malformed verdict** — all handlers preserved.
- **Phase-router** logic (free interleaving of expand/score/prune per R23).
- **Goal-push exhaustion → No Solution Found** (R34).
- **Pruning → empty live frontier → No Solution Found** (R37).

The refactor is **strictly form-preserving for BFS semantics** (R84): only push-arg names, ledger fields, and the parent-walk primitive change.

## Error handling

| Trigger | Mitigation | R# |
| ------- | ---------- | -- |
| Phase 6 PROGRAM.md missing numbers/target | Phase 6's R6 path unchanged: append `## Pending Questions`, set `waiting_for_user` | (Phase 6 R6, preserved per R84) |
| LATS PROGRAM.md missing/garbage | No special handling — PROGRAM.md is opaque to the LATS strategy. The first push of `expand-node.md` will see whatever PROGRAM.md contains as `task`; if the LLM can't make sense of it, the rollout will fail and reflexion will surface a lesson. | R36 |
| `expand-node.md` returns < k=5 well-formed children | Append the well-formed children that did parse; non-blocking `## Pending Questions`; `chosen_child` set to leftmost successfully created. If 0 children parsed, mark cursor `terminal_fail` and re-enter `selecting`. Never `waiting_for_user`. | R50 |
| `score.md` returns label other than sure/likely/impossible | (Phase 6 only) treat as `impossible`, surgical update, non-blocking `## Pending Questions`. (LATS does not use `score.md`.) | (Phase 6 R44, preserved per R84) |
| `rollout.md` returns malformed `## Terminal State` (missing or empty) | Treat as failed rollout (reward 0), skip `evaluate.md` push, write synthetic `## Verdict\nfail\n## Feedback\nrollout returned malformed output\n` directly to MEMORY, transition straight to `evaluating_completed`, append non-blocking `## Pending Questions`. Never `waiting_for_user`. | R53 |
| `evaluate.md` returns Verdict other than pass/fail | LATS: treat as `fail` (reward 0), proceed normally with back-prop and reflect, non-blocking `## Pending Questions`. Phase 6: same Phase 6 R33 behaviour, preserved. | R54 (LATS), Phase 6 R33 (preserved) |
| `reflect.md` returns malformed/missing `## Lesson` | Skip the lesson append, non-blocking `## Pending Questions`, continue to `iter_count` increment + budget check. Never `waiting_for_user`. | R60 |
| Iteration budget exhausted (`iter_count >= max_iterations`) | Emit `## No Solution Found` with iteration count and `terminal_fail` count, set state `done`, halt | R61, R63 |
| Reward 1 received | Mark chosen_child `terminal_pass`; emit `## Solution`; set state `done`; halt. Don't materialise rollout into tree (record-A). | R56, R63, R82 |

The `## Pending Questions` non-blocking convention (matching Phase 6's malformed-handling policy) is what keeps the LATS loop progressing instead of stalling. The strategy never has a `user_responded` instruction (R36 — LATS has no R6 analogue), so transitioning to `waiting_for_user` for soft errors would deadlock.

## Test strategy

### `src/test/phase-6b-lats.test.ts` — NEW (R72)

Following the file-pattern style of `phase-6-tot.test.ts` (no live LLM execution; assertions are regexes against text artefacts and structural invariants on a recorded `history/` snapshot from a manual smoke-check run):

| Test group | Asserts | R# |
| ---------- | ------- | -- |
| Directory layout | `interpreters/3-search/b-lats/` exists with `INSTRUCTIONS.md`, `PROGRAM.md`, `README.md`, `dynamics/`; `dynamics/` contains exactly `expand-node.md`, `rollout.md`, `evaluate.md`, `reflect.md`; `dynamics/score.md` does **not** exist | R1, R4, R5, R77 |
| Group README | `interpreters/3-search/README.md` mentions LATS as Shipped (Phase 6b), Zhou et al. arXiv:2310.04406 cited | R2 |
| Leaf README | mentions Zhou et al. arXiv:2310.04406, contains state-machine summary, run instructions, "Notable behaviour" section with the deliberate-omission notes (no score.md, no pruning, ancestor-walk lessons, record-A) | R3 |
| Byte-equality (R6, R7, R8) | `b-lats/dynamics/expand-node.md` byte-equal `a-tot/dynamics/expand-node.md`; `b-lats/dynamics/evaluate.md` byte-equal `1b/dynamics/evaluate.md`; `b-lats/dynamics/reflect.md` byte-equal `1c/dynamics/reflect.md` | R6, R7, R8 |
| `rollout.md` contract | declares `{{partial_state}}`, `{{task}}`; single instruction matching `state == empty`; emits `## Return: terminal_state: \|`; no `## Push dynamics/`; no `## Push` at all | R10, R11, R12 |
| Vocabulary check — `rollout.md` | `b-lats/dynamics/rollout.md` does **not** contain any of: `Game of 24`, `numbers`, `arithmetic`, regex `[+−×÷]`, `target`, `maze`, `code`, `function` | R13, R83 |
| Strategy preamble | `# Strategy` / `# Sub-instructions` boundaries present; "VERBATIM into every update_instructions call" preamble present | structural |
| State machine completeness | INSTRUCTIONS.md declares all 11 LATS instructions: Initialize, Select, Expand-push, Expand-absorb, Simulate-push, Simulate-absorb, Evaluate-push, Evaluate-absorb, Reflect-push, Reflect-absorb | R34, R44, R47, R49, R51, R52, R54, R58, R59 |
| Initialize | references `../../PROGRAM.md`; copies to `./scoped/task.md`; writes `./scoped/max_iterations.md` (= 30); writes `./scoped/uct_c.md` (= 1.41421356); writes `./scoped/iter_count.md` (= 0); appends root id `n0` with `parent_id=-`, `depth=0`, `q=0`, `n=0`, `status=live`; creates `./scoped/state-n0.md` | R34, R35 |
| Tree ledger schema | INSTRUCTIONS.md mentions all six required keys (`id`, `parent_id`, `depth`, `q`, `n`, `status`) and `---` separator; INSTRUCTIONS.md does **not** mention any field name from {`op`, `left`, `value`, `samples`} | R37, R38 |
| Status enum | INSTRUCTIONS.md mentions `live`, `terminal_pass`, `terminal_fail`; does **not** mention `pruned` (status value) | R41, R78 |
| Surgical-edit primitive | INSTRUCTIONS.md uses `awk` for in-place updates of `q` and `n`; no wholesale `cat > ./scoped/tree.md` after Initialize | R39 |
| Monotonic IDs | INSTRUCTIONS.md computes new id via `grep -c '^id: n'` or equivalent monotonic counter | R40 |
| Per-node state files | INSTRUCTIONS.md references `./scoped/state-` (creating per-node state files at expansion absorb) | R42, R43 |
| Compose-partial-state | INSTRUCTIONS.md walks parent chain (`while … parent_id`) and concatenates lessons into `partial_state` push-arg; ancestor walk is root-first (lowest-depth ancestor first) | R48, R66 |
| Lesson plumbing | INSTRUCTIONS.md uses `>>` (append) — never `>` (clobber) — when writing lessons-<id>.md | R65 |
| Select | INSTRUCTIONS.md computes UCT via `bc -l`; declares the n=0 leftmost-tiebreak path; selects until childless leaf | R44, R45, R46 |
| Expand-push | references `dynamics/expand-node.md`; stages `partial_state` and `task` only (no `target`, no `numbers_remaining`); the `## Push-Args` block contains exactly two keys | R47 |
| Expand-absorb | parses `## Children`; appends node blocks with the R38 schema; writes per-node state files; sets `chosen_child` to leftmost; well-formed-count fallback declared (R50 path) | R49, R50 |
| Simulate-push | references `dynamics/rollout.md`; reads from `chosen_child` not `cursor`; stages `partial_state` and `task` | R51 |
| Simulate-absorb | parses `## Terminal State` to `./scoped/last_terminal.md`; pushes `evaluate.md` with `attempt` and `criterion`; declares R53 malformed path | R52, R53 |
| Evaluate-absorb | parses `## Verdict`; reward mapping `pass→1, fail→0, *→0`; back-propagates via parent-chain walk surgical updates of `q`/`n`; reward=1 → terminal_pass + `## Solution` + `done`; reward=0 → reflecting (no terminal_fail status update) | R54, R55, R56, R57 |
| Record-A | INSTRUCTIONS.md does **not** materialize rollout intermediate states into `tree.md` — the only places that append to `tree.md` are Initialize (root) and Expand-absorb (k=5 children per iteration) | R82 |
| Reflect-push | references `dynamics/reflect.md`; stages `attempt`, `verdict: fail`, `feedback` | R58 |
| Reflect-absorb | appends `## Lesson` to `./scoped/lessons-<chosen_child>.md`; increments `iter_count`; budget check emits `## No Solution Found` and `done` when exhausted | R59, R60, R61 |
| Termination | every code path that sets `## State done` emits exactly one of `## Solution` or `## No Solution Found` | R63 |
| `evaluate.md` text-only | `## Push-Args` `criterion` value is `./scoped/task.md` content; no `../../workspace/` paths in any criterion construction in INSTRUCTIONS.md | R67 |
| Demo PROGRAM.md byte-equal | `b-lats/PROGRAM.md` byte-equal `a-tot/PROGRAM.md` | R69 |
| Negative properties | INSTRUCTIONS.md never references `workspace/`; never references `git checkout`; never uses concurrency primitives (`xargs -P`, trailing `&`); never reads or writes `../../<otherframe>/scoped/`; no Game-of-24 vocabulary anywhere | R76, R80, R81, R83 |
| Hyperparameter location | INSTRUCTIONS.md does **not** parse PROGRAM.md for `max_iterations` / `uct_c` / `k`; these are bash literals at Initialize | R79 |

A live-execution run is **not** part of the unit-test file (consistent with `phase-6-tot.test.ts`'s structural-only convention; live LLM execution is the manual smoke-check). R70 (demo produces Solution or No Solution Found) and R71 (≥1 back-prop on path of length ≥2) are validated structurally:

- **R70 structural witness:** every code path that sets state `done` is surrounded by either `cat > ./MEMORY.md << SOLUTION_EOF` (containing `## Solution`) or `cat > ./MEMORY.md << EXHAUSTED_EOF` (containing `## No Solution Found`). The grep-based test asserts that every `state\ndone` write co-occurs with one of those two section headers.
- **R71 structural witness:** the back-prop primitive in INSTRUCTIONS.md walks the parent chain via `while … parent_id`; the loop body increments both `q` and `n` per visited node. The grep-based test asserts the loop is present and updates both fields.

(Live-run validation of R70/R71 lives in the leaf README's Run-it section as the manual smoke check.)

### `src/test/phase-6-tot.test.ts` — UPDATED (R24, R25, R26)

Existing tests for the Phase 6 directory, group README, evaluate.md byte-equality, and strategy preamble carry over. Tests updated for the refactor:

| Test group | Updates | R# |
| ---------- | ------- | -- |
| Tree ledger schema | Replace assertions about `op`, `left` ledger fields with assertions that those fields are **absent**. Assert the post-refactor schema (R18: id/parent_id/depth/value/samples/status). | R24 |
| Per-node state files | NEW: assert `INSTRUCTIONS.md` references `./scoped/state-` (creates per-node files at root and Expand-absorb). | R25 |
| Vocabulary — `expand-node.md` | NEW: assert `interpreters/3-search/a-tot/dynamics/expand-node.md` does not contain `Game of 24`, `numbers`, `arithmetic`, regex `[+−×÷]`, `target`, `numbers_remaining`, `parent_thought`. | R26, R32 |
| Vocabulary — `score.md` | NEW: same vocabulary check; also assert push-args are `partial_state`, `task` (regex match for `{{partial_state}}` and `{{task}}`). | R26, R32 |
| Goal-push reconstruction | UPDATED: replace assertion that Goal-push uses parent-walk with assertion that Goal-push reads `./scoped/state-${ID}.md` directly. | R22 |
| Solved reconstruction | UPDATED: replace assertion that Solved uses parent-walk with assertion that Solved reads `./scoped/state-${PASS_ID}.md` directly. | R23 |
| Phase 6 README delta | NEW: assert the leaf README's "Notable behaviour" section starts with the "Refactored in Phase 6b" bullet, citing `docs/specs/2026-05-01-implement-phase-6b/`. | R27, R29 |
| BFS semantics preservation | NEW: regression assertions that k=5, b=5, 3-sample-scoring, weight mapping (`sure → 20`, `likely → 1`, `impossible → 0.001`), Phase-router, R6/R34/R37/R44/R47 paths are all still present in INSTRUCTIONS.md. | R84 |

### `src/test/phase-dynamics-identity.test.ts` — EXTENDED (R9)

The existing `EVALUATE_PATHS` constant adds `interpreters/3-search/b-lats/dynamics/evaluate.md`. Two new identity blocks are appended for the LATS-reused dynamics:

```typescript
const EVALUATE_PATHS = [
  "interpreters/1-iterative-refinement/b-evaluator-optimizer/dynamics/evaluate.md",
  // …existing entries…
  "interpreters/3-search/a-tot/dynamics/evaluate.md",
  "interpreters/3-search/b-lats/dynamics/evaluate.md",   // NEW
];

const REFLECT_PATHS = [
  "interpreters/1-iterative-refinement/c-reflexion/dynamics/reflect.md",
  "interpreters/3-search/b-lats/dynamics/reflect.md",   // NEW
];

const EXPAND_NODE_PATHS = [
  "interpreters/3-search/a-tot/dynamics/expand-node.md",   // canonical (post-refactor)
  "interpreters/3-search/b-lats/dynamics/expand-node.md",  // copy
];

describe("reflect.md identity across phases", () => { /* same shape as evaluate */ });
describe("expand-node.md identity across phases (post-refactor)", () => { /* same shape */ });
```

R9 is satisfied by all three byte-equality assertion suites passing.

### Manual smoke-check (out of test suite)

A Run-it section in the LATS leaf README directs the user through:

1. `./new-instance.sh my-lats interpreters/3-search/b-lats`
2. `instances/my-lats/run.sh`
3. After completion, inspect `instances/my-lats/frames/f000-strategy/MEMORY.md` for `## Solution` (or `## No Solution Found` if the search exhausted) and `frames/f000-strategy/scoped/tree.md` for the full search ledger.

Cycle-cost expectation per puzzle: ~10–13 cycles per MCTS iteration (selection 1 + push/absorb pairs at 3 cycles each for expand/rollout/evaluate, plus 3 for reflect on failure), 3–4 LLM calls per iteration, 30 iterations max → ~300–390 cycles, ~90–120 LLM calls worst case. The leaf README records this number and cross-references the MAX_ITERATIONS constant.

A separate side-by-side comparison can be run by creating a Phase 6 instance against the same PROGRAM.md (`./new-instance.sh my-tot interpreters/3-search/a-tot`) and contrasting tree depth, branching factor, and final-cycle counts.

## Open questions

(none — every R# is addressed by a section above; the design preserves Phase 6's BFS semantics in full while shipping a paper-faithful LATS interpreter and generalising both interpreters' shared dynamics)
