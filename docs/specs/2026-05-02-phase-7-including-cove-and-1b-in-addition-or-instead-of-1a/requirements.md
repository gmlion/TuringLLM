# Requirements: phase-7-including-cove-and-1b-in-addition-or-instead-of-1a

## Context

Phase 7 of the agent-workflows roadmap (`docs/agent-workflows/requirements.md` § Phase 7) calls for an AFlow-lite meta-framework: an MCTS controller that searches over candidate workflows composed from a library of operators seeded from earlier phases. The parent doc's baseline operator list is `1a, 1c, 3a, 5, 5b`; this spec replaces `1a` with `1b` (per `interpreters/README.md`'s operator shortlist rationale: 1b's explicit-judge interface is uniformly reused across the codebase, making it the cleaner composition primitive) and adds `1d` CoVe (the only operator that does post-hoc independent verification — distinct capability not derivable from the others).

The user's specific design decisions for this phase, settled during brainstorming: (1) **GSM8K subset** as the demo benchmark; (2) **5 operators in v1** — refine (1b), reflexion (1c), cove (1d), plan-execute (2a), debate (4a); MoA (5b) deferred to its own future spec because it is not yet shipped; (3) **full project rename** — `dynamics/` → `operators/` everywhere on disk plus identifier rename in source; (4) **linear-sequence DSL** for workflow representation; (5) **operators ARE the existing interpreters' strategies, repackaged as pushable**, with no duplication — the canonical pushable file lives once and standalone interpreters become thin shells that depend on it; (6) **shell change**: a new "root-operator bootstrap" mechanism where the shell pushes a configured operator with PROGRAM.md content as a push-arg and writes the operator's `## Return` to `OUTPUT.md`; (7) **single Phase 7 spec** covering rename + shell change + per-interpreter migration + new aflow-lite leaf; (8) **no backward compatibility** for existing instances (they remain on disk for inspection but are not runnable under the new shell); (9) **LLM-driven workflow expansion** via a new `expand-workflow.md` operator; (10) **no meta-reflexion in v1** (deferred to a hypothetical higher-level future phase).

The cumulative scope is large — three interlocking refactors plus a new interpreter — but they share the same architectural insight (operator = canonical pushable unit) and the user's explicit preference is to land them as one coherent spec rather than three sequential ones.

## User stories

- **US1**: As a developer studying agent patterns, I want a working AFlow-lite meta-framework at `interpreters/7-meta-framework/a-aflow-lite/` that runs MCTS over candidate workflows on a GSM8K subset, so that I can observe the meta-search discovering compositions of operators that improve over single-operator baselines.
- **US2**: As a maintainer of the operator library, I want a single canonical implementation per pattern — the pushable operator file — and zero duplication, so that bug fixes and improvements made for AFlow-lite automatically benefit standalone interpreters and vice versa.
- **US3**: As an author of any new pattern in the future, I want a uniform "pushable operator" interface (`{{program}}` push-arg in, `## Return answer:` out) so that adding a new operator to the library is mechanical and the operator works identically standalone or inside a workflow.
- **US4**: As a reader of the codebase, I want consistent terminology — every pushable INSTRUCTIONS file is an "operator", `dynamics/` is gone — so that "operator" is unified across the meta-framework and the building blocks it composes.
- **US5**: As a researcher running the AFlow-lite demo, I want the GSM8K items to live in a separate fixture (`workspace/gsm8k.jsonl`) and the demo PROGRAM.md to be short prose pointing at the fixture, so that swapping in HumanEval or a different benchmark in the future requires only a fixture swap, not a strategy rewrite.

## Acceptance criteria (EARS)

### Top-level Phase 7 deliverable

- **R1**: THE PROJECT SHALL ship a new interpreter at `interpreters/7-meta-framework/a-aflow-lite/` containing at minimum `INSTRUCTIONS.md` (a one-line marker pointing at the canonical operator), `PROGRAM.md` (the GSM8K demo), `README.md`, and `operators/` directory.
- **R2**: THE PROJECT SHALL ship a group-level `interpreters/7-meta-framework/README.md` framing Group 7 — Meta-frameworks, listing AFlow-lite as the only currently shipped variant, and citing the AFlow paper (Zhang et al., 2024, arXiv:2410.10762).
- **R3**: THE INTERPRETER LEAF README (`interpreters/7-meta-framework/a-aflow-lite/README.md`) SHALL include: a citation to Zhang et al. arXiv:2410.10762, an architectural overview, the operator library list (with rationale for inclusion of 1b/1c/1d/2a/4a and exclusion of 1a/5a/5b/6a/6b), the MCTS state machine summary, the demo description, run instructions, and a "Notable behaviour" section noting (a) the per-iteration cycle cost, (b) the deliberate omission of MoA pending a future spec, (c) the deliberate omission of meta-reflexion (also pending a future higher-meta-level spec).

### Rename: `dynamics/` → `operators/`

- **R4**: EVERY interpreter directory currently containing a `dynamics/` subdirectory SHALL have that subdirectory renamed to `operators/`. Affected paths include all of `interpreters/1-iterative-refinement/{a-self-refine,b-evaluator-optimizer,c-reflexion,d-cove}/dynamics/`, `interpreters/2-planning-decomposition/{a-plan-execute,b-orchestrator-workers,c-deep-research}/dynamics/`, `interpreters/3-search/{a-tot,b-lats}/dynamics/`, `interpreters/4-peer-collaboration/a-debate/dynamics/`, `interpreters/5-fixed-sop-teams/{a-metagpt,b-chatdev}/dynamics/`.
- **R5**: EVERY occurrence of the literal string `dynamics/` inside an interpreter's `INSTRUCTIONS.md` (used in `## Push <path>` directives) SHALL be replaced with `operators/`.
- **R6**: EVERY occurrence of `dynamics/` in markdown documentation under `interpreters/`, `docs/agent-workflows/`, and `CLAUDE.md` SHALL be replaced with `operators/`. Exception: spec artefacts under `docs/specs/<earlier-than-this-spec>/` are frozen historical records and SHALL NOT be edited (Phase 6b R28/R85 model carries forward).
- **R7**: EVERY occurrence of the identifier or comment word "dynamic" used in the "pushable INSTRUCTIONS file" sense SHALL be renamed to "operator" in all source files under `src/` (e.g. function names, comment lines, type aliases). Identifiers that use "dynamic" in unrelated senses (e.g. "dynamically allocated") SHALL be left alone.
- **R8**: `new-instance.sh` SHALL be updated to copy `operators/` instead of `dynamics/` from the interpreter to the instance.
- **R9**: ALL test files under `src/test/` that reference `dynamics/` paths SHALL be updated. The file `src/test/phase-operators-identity.test.ts` SHALL be renamed to `src/test/phase-operators-identity.test.ts` and its referenced paths updated accordingly.
- **R10**: AFTER the rename, no file under the repo root SHALL contain the literal substring `dynamics/` except inside the spec-frozen `docs/specs/<earlier-than-this-spec>/` directories.

### Shell change: root-operator bootstrap and OUTPUT.md emission

- **R11**: THE SHELL SHALL support a new instance-level configuration file at the instance root, `instances/<name>/.root-operator`, containing a single relative path (e.g. `operators/refine.md`) that names the canonical operator the shell pushes at instance startup.
- **R12**: WHEN an instance starts AND `.root-operator` is present, THE SHELL SHALL push the named operator as the initial root frame, with `{{program}}` substituted from the instance root's `PROGRAM.md` content.
- **R13**: WHEN the root operator (state at depth 1) transitions to `state == done`, THE SHELL SHALL write each entry from its `## Return` block to `instances/<name>/OUTPUT.md`. Each `## Return` key becomes a `## <CapitalizedKey>` section in `OUTPUT.md`. THE SHELL SHALL THEN halt.
- **R14**: WHEN an instance starts AND `.root-operator` is ABSENT, THE SHELL SHALL exit with a clear error message (e.g. "no root-operator configured for this instance"). It SHALL NOT fall back to the previous "load `frames/f000-strategy/INSTRUCTIONS.md`" behaviour.
- **R15**: `new-instance.sh` SHALL write `.root-operator` to the new instance, populated from the chosen interpreter's `INSTRUCTIONS.md` (which becomes a single-line marker — see R16) or from a metadata file if that exists.
- **R16**: EVERY interpreter's `INSTRUCTIONS.md` (post-refactor) SHALL be a single-line marker file containing the relative path to the canonical operator that implements the interpreter's pattern. Example for 1b: `operators/refine.md`. The shell uses this content to populate the new instance's `.root-operator`.
- **R17**: THE SHELL'S call-stack state file (`.call-stack.json`) SHALL be initialized with the root operator's frame already pushed at startup. That is: at cycle 0, the stack contains exactly one frame whose `frameDir` is `frames/f000-<operator-slug>` and whose INSTRUCTIONS.md is the named operator's body with `{{program}}` substituted.
- **R18**: THE SHELL SHALL halt cleanly (exit 0) after writing OUTPUT.md, leaving the instance directory in a state suitable for inspection (history snapshots intact, MEMORY.md, scoped/ files preserved).
- **R19**: IF the root operator's `## Return` block is missing or empty when state transitions to `done`, THEN THE SHELL SHALL write a short diagnostic to OUTPUT.md (e.g. `# OUTPUT (no return values)\nThe root operator halted without a ## Return block.`) and exit 0.

### Per-interpreter migration

- **R20**: EVERY existing interpreter's strategy SHALL be repackaged as a pushable operator file under that interpreter's `operators/` directory. The new file SHALL accept push-args `{{program}}` (the user's task description, equivalent to the previous `cat ../../PROGRAM.md`) and SHALL emit `## Return\nanswer: <text>` at its `state == done` cycle.
- **R21**: EACH affected interpreter's `INSTRUCTIONS.md` SHALL become a single-line marker file (per R16) pointing to the canonical operator file under `operators/`.
- **R22**: THE INTERPRETERS SHALL be migrated, one canonical operator per leaf:
  - `interpreters/1-iterative-refinement/a-self-refine/operators/self-refine.md`
  - `interpreters/1-iterative-refinement/b-evaluator-optimizer/operators/refine.md`
  - `interpreters/1-iterative-refinement/c-reflexion/operators/reflexion.md`
  - `interpreters/1-iterative-refinement/d-cove/operators/cove.md`
  - `interpreters/2-planning-decomposition/a-plan-execute/operators/plan-execute.md`
  - `interpreters/2-planning-decomposition/b-orchestrator-workers/operators/plan-execute.md` (byte-equal to a-plan-execute's)
  - `interpreters/2-planning-decomposition/c-deep-research/operators/plan-execute.md` (byte-equal to a-plan-execute's)
  - `interpreters/3-search/a-tot/operators/tot.md`
  - `interpreters/3-search/b-lats/operators/lats.md`
  - `interpreters/4-peer-collaboration/a-debate/operators/debate.md`
  - `interpreters/5-fixed-sop-teams/a-metagpt/operators/metagpt.md`
  - `interpreters/5-fixed-sop-teams/b-chatdev/operators/chatdev.md`
- **R23**: EACH migrated operator's body SHALL be the previous strategy's body with: (a) the `Initialize` instruction reading `{{program}}` instead of `cat ../../PROGRAM.md`; (b) a final transformation that, on completion (when the strategy would previously emit its terminal output section like `## Solution`, `## Refined`, `## Result`, or `## Revised`), additionally writes `## Return\nanswer: <final text>` so the shell pop machinery can splice it into the caller (or write it to OUTPUT.md if at root).
- **R24**: EXISTING terminal-output sections (e.g. `## Solution` for ToT/LATS, `## Refined` for refine, `## Result` for plan-execute, `## Revised` for cove) SHALL be preserved alongside the new `## Return\nanswer:` block. They remain useful for human inspection of MEMORY.md and for compatibility with existing per-leaf README "where to look" sections.
- **R25**: EACH migrated operator's internal sub-pushes (e.g. the refine operator pushing `evaluate.md`) SHALL continue to use the same operator-relative paths under `operators/` (the pre-rename `dynamics/` paths are simply renamed per R5).
- **R26**: BYTE-EQUAL identity SHALL be enforced between operator files that exist in multiple leaves' `operators/` directories. The identity test (renamed to `phase-operators-identity.test.ts` per R9) SHALL be extended to cover at minimum: `evaluate.md` across all consumers; `reflect.md` across `c-reflexion`, `b-lats`, and aflow-lite; `expand-node.md` across `a-tot` and `b-lats`; `plan-execute.md` across `a-plan-execute`, `b-orchestrator-workers`, `c-deep-research`, and aflow-lite; the canonical operator files (refine, reflexion, cove, debate) across their standalone leaf and aflow-lite.
- **R27**: NO interpreter's behavior SHALL change as a result of migration. The migrated standalone interpreters MUST produce the same final answers (modulo LLM stochasticity) as the pre-migration versions, on their existing demo PROGRAM.md inputs.

### AFlow-lite meta-framework

- **R28**: THE FILE `interpreters/7-meta-framework/a-aflow-lite/operators/aflow-lite.md` SHALL be the canonical aflow-lite operator (Phase 7's MCTS meta-strategy, repackaged as pushable). It accepts push-arg `{{program}}` (the GSM8K task pack — see R66) and emits `## Return\nanswer: <text>` at done state, where the answer is a brief textual summary of the best workflow discovered + its score.
- **R29**: THE AFLOW-LITE OPERATOR SHALL run an MCTS controller imported verbatim from Phase 6b's `b-lats/operators/lats.md` machinery: the same UCT formula, the same selection / expansion / simulation / back-prop primitives, the same tree-ledger schema (`./scoped/tree.md` with `id, parent_id, depth, q, n, status` fields).
- **R30**: THE AFLOW-LITE OPERATOR'S TREE NODES SHALL each store a candidate workflow as a comma-separated list of operator names (e.g. `refine,cove`) in `./scoped/state-<id>.md` (analogous to LATS's per-node state files). The root node n0 stores the empty workflow `` (no operators).
- **R31**: THE AFLOW-LITE OPERATOR LIBRARY SHALL be hardcoded as exactly five operator names: `refine`, `reflexion`, `cove`, `plan-execute`, `debate`. These names map to the canonical operator files under aflow-lite's `operators/` directory (R34). MoA is intentionally absent (deferred to its own spec); 1a's self-refine is intentionally absent (1b's refine subsumes it).
- **R32**: WHEN aflow-lite expands a tree node (selection picked a leaf), THE STRATEGY SHALL push `operators/expand-workflow.md` with push-args `{{current_workflow}}` (the leaf's stored comma-separated list), `{{library}}` (the five available operator names), and `{{recent_scores}}` (a short summary of recently-evaluated workflows and their scores, drawn from the past N MCTS iterations). The dynamic SHALL emit `## Return\nchildren:` as a literal block scalar of exactly k=5 entries, each entry one new candidate workflow.
- **R33**: WHEN aflow-lite simulates (rolls out) a candidate workflow on a benchmark item, THE STRATEGY SHALL execute the workflow by sequentially pushing each operator named in the candidate's recipe with push-args `{{task}}` (the benchmark item's question) and `{{prior_answer}}` (empty string for the first operator, otherwise the previous operator's `## Answer`). After the last operator pops, the candidate's final answer is the most recent `## Answer` spliced into aflow-lite's MEMORY.
- **R34**: THE AFLOW-LITE INTERPRETER'S `operators/` DIRECTORY SHALL contain at minimum: `aflow-lite.md` (R28), `expand-workflow.md` (R32), `refine.md` (byte-equal copy of `b-evaluator-optimizer/operators/refine.md`), `reflexion.md` (byte-equal copy of `c-reflexion/operators/reflexion.md`), `cove.md` (byte-equal copy of `d-cove/operators/cove.md`), `plan-execute.md` (byte-equal copy of `a-plan-execute/operators/plan-execute.md`), `debate.md` (byte-equal copy of `a-debate/operators/debate.md`), and all transitively-required sub-operators (e.g. `evaluate.md`, `reflect.md`, `verify.md`, `answer-independently.md`, `tackle.md`, `plan.md`, `opine.md`).
- **R35**: WHEN a candidate workflow finishes executing on a single benchmark item, THE STRATEGY SHALL extract a final integer answer from the last `## Answer` content using a regex that takes the LAST occurrence of `[-+]?\d+` in the text. The extracted integer SHALL be compared via exact-equality with the benchmark item's expected answer (loaded per R66). The per-item score SHALL be 1 if equal, else 0.
- **R36**: THE AFLOW-LITE STRATEGY SHALL evaluate each candidate workflow on exactly 3 benchmark items, sampled deterministically at Initialize (random subset from the fixture per R66, written to `./scoped/benchmark_items.md`). The same 3 items SHALL be used across all MCTS iterations of a single run (no per-iteration resampling).
- **R37**: THE WORKFLOW-LEVEL REWARD that is back-propagated SHALL be the mean per-item score: `(items_correct / items_total)` ∈ [0, 1]. With 3 items the reward is in {0, 0.333, 0.667, 1.0}.
- **R38**: THE AFLOW-LITE STRATEGY SHALL halt when EITHER (a) any candidate workflow scores 1.0 (perfect on all 3 items), OR (b) `iter_count >= max_iterations` (default 10, persisted to `./scoped/max_iterations.md` for runtime tuning). On halt, THE STRATEGY SHALL emit `## Return\nanswer: <best workflow + its best score>` (e.g. `[refine, cove] scored 0.667`).
- **R39**: THE AFLOW-LITE STRATEGY SHALL NOT use meta-reflexion (i.e. SHALL NOT push `reflect.md` at the meta level when a workflow scores poorly). The meta-search relies entirely on UCT + LLM-driven expansion (with `recent_scores` in expand-workflow.md's push-args) for learning. Meta-reflexion is deferred to a future higher-level meta-meta-spec.
- **R40**: THE AFLOW-LITE STRATEGY SHALL NOT spawn nested shell instances. All workflow execution happens via push/pop within the same instance. Stack depth temporarily grows during operator execution (depth 2 for the operator itself; depth 3+ for sub-operators it pushes internally) and shrinks back when the operator pops.

### `expand-workflow.md` operator (NEW)

- **R41**: THE FILE `interpreters/7-meta-framework/a-aflow-lite/operators/expand-workflow.md` SHALL declare push-args `partial_state` (containing the current workflow recipe and the available library and recent scores, per R32; named `partial_state` for symmetry with Phase 6b's expand-node.md), and `task` (the GSM8K demo PROGRAM content, threaded through for context). It SHALL fail the push with `unresolved-placeholder` if either is missing.
- **R42**: WHEN invoked, `expand-workflow.md` SHALL complete in a single cycle (state `empty` → `done`) and SHALL emit a `## Return` block with exactly one key, `children`, whose value is a literal block scalar of exactly k=5 candidate workflows. Each candidate is a single-line comma-separated list of operator names drawn from the library.
- **R43**: THE `expand-workflow.md` OPERATOR SHALL be domain-agnostic in prose (no "GSM8K", "math", "Game of 24", etc.); the LLM is given the available library and current workflow as data and asked to propose mutations.
- **R44**: THE `expand-workflow.md` OPERATOR SHALL NOT push any further operator; the strategy's stack depth via expand-workflow SHALL remain at 1 at all times.

### Existing operator adaptation for AFlow-lite use

- **R45**: WHEN any of the five library operators (refine, reflexion, cove, plan-execute, debate) is invoked by aflow-lite (with `{{task}}` + `{{prior_answer}}` push-args), it SHALL adapt its behavior:
  - If `{{prior_answer}}` is non-empty, treat it as a draft to operate on (e.g. refine refines it; cove verifies its claims; reflexion attempts again learning from it).
  - If `{{prior_answer}}` is empty, treat the task as fresh (e.g. plan-execute decomposes from scratch; refine produces a first draft).
- **R46**: WHEN any of the five library operators is invoked standalone (with `{{program}}` push-arg only, no `{{prior_answer}}`), it SHALL behave as the current pre-migration interpreter does. This is the standalone-instance use case via `.root-operator` bootstrap.
- **R47**: EACH library operator's INSTRUCTIONS body SHALL accept BOTH push-arg shapes: `{{program}}` only (standalone), or `{{task}}` + `{{prior_answer}}` (AFlow-lite). When invoked with `{{task}}` set and `{{program}}` absent (or vice versa), the operator's Initialize SHALL detect which arg is present and adapt its parsing accordingly. (Implementation note: a placeholder substitution that left a literal `{{program}}` token unsubstituted indicates the AFlow-lite invocation; a literal `{{task}}` token unsubstituted indicates standalone. Each operator's Initialize uses simple string detection.)

### GSM8K demo

- **R48**: THE PROJECT SHALL ship `interpreters/7-meta-framework/a-aflow-lite/workspace/gsm8k.jsonl` containing exactly 20 GSM8K items. Each line is a JSON object with at minimum the keys `question` (the math word problem text) and `answer` (the integer expected answer). Items SHALL be drawn from the GSM8K test split, citing the dataset source in the leaf README.
- **R49**: THE INTERPRETER SHALL ship a demo `PROGRAM.md` at `interpreters/7-meta-framework/a-aflow-lite/PROGRAM.md` containing short prose describing the task ("Solve the GSM8K math word problems found in `workspace/gsm8k.jsonl`. Each item is a JSON object with a `question` and an integer `answer`. Your goal is to discover, via meta-search over operator compositions, a workflow that maximises the fraction of items answered correctly.") and noting where the items come from.
- **R50**: WHEN the aflow-lite operator's Initialize parses PROGRAM.md, it SHALL load the fixture file from `../../workspace/gsm8k.jsonl`, sample 3 items deterministically (seeded by Initialize so each run on the same fixture picks the same 3), and persist their `question` + `answer` pairs to `./scoped/benchmark_items.md`.
- **R51**: `new-instance.sh` SHALL copy the `workspace/` directory from `interpreters/7-meta-framework/a-aflow-lite/` to the instance's `workspace/` so that the GSM8K fixture lives alongside the running instance (the existing `new-instance.sh` already supports this — see `interpreters/2-planning-decomposition/b-orchestrator-workers/workspace/`; behavior preserved post-rename).

### Tests

- **R52**: THE PROJECT SHALL ship `src/test/phase-7-aflow-lite.test.ts` covering at minimum:
  - (1) Directory layout: `interpreters/7-meta-framework/a-aflow-lite/` exists with `INSTRUCTIONS.md`, `PROGRAM.md`, `README.md`, `operators/`, and `workspace/gsm8k.jsonl`.
  - (2) Group README at `interpreters/7-meta-framework/README.md` exists and cites Zhang et al. arXiv:2410.10762.
  - (3) Operator library: aflow-lite's `operators/` contains exactly the operators required by R34 (no `score.md`, no MoA-related operators in v1).
  - (4) Byte-equality of all reused operators per R26 (refine, reflexion, cove, plan-execute, debate, plus their sub-operators).
  - (5) `expand-workflow.md` contract: push-args, single-cycle, k=5 children, no further pushes, domain-agnostic vocabulary check.
  - (6) Aflow-lite operator structural checks: imports MCTS primitives (UCT, back-prop), uses comma-separated workflow representation in `./scoped/state-<id>.md`, hardcodes the five library operator names, hardcodes k=5 expansion and 3 benchmark items, sample-fixed-at-init pattern.
  - (7) Termination invariants: every `state == done` cycle produces a `## Return\nanswer:` block; halts on first 1.0 score OR iteration budget exhaustion.
  - (8) GSM8K fixture: file exists, contains 20 lines, each line is parseable JSON with `question` and `answer` keys.
  - (9) Stack-depth invariant: at every snapshot in `history/`, `stack.length` ≤ 4 (root + AFlow operator + library operator + library operator's sub-push).

- **R53**: `src/test/phase-operators-identity.test.ts` (renamed from `phase-operators-identity.test.ts` per R9) SHALL be extended to enforce byte-equality across:
  - `evaluate.md` across `b-evaluator-optimizer`, `c-reflexion`, `a-tot`, `b-lats`, `a-metagpt`, `b-chatdev`, and aflow-lite.
  - `reflect.md` across `c-reflexion`, `b-lats`, and aflow-lite.
  - `expand-node.md` across `a-tot`, `b-lats`, and aflow-lite (if used).
  - `plan-execute.md` across `a-plan-execute`, `b-orchestrator-workers`, `c-deep-research`, and aflow-lite.
  - `refine.md`, `reflexion.md`, `cove.md`, `debate.md` each across their canonical leaf and aflow-lite.

- **R54**: ALL existing `src/test/phase-N-X.test.ts` files SHALL be updated for the rename: any assertion referencing `dynamics/` is rewritten to reference `operators/`; any assertion referencing `frames/f000-strategy/INSTRUCTIONS.md` as the strategy source is updated to assert the new marker-file shape (R16) or to reach into the canonical operator under `operators/`.

- **R55**: A NEW TEST `src/test/phase-7-shell-bootstrap.test.ts` SHALL exercise the root-operator bootstrap mechanism: (1) `.root-operator` config is read and the operator is loaded into the root frame; (2) `{{program}}` substitution happens at startup; (3) when state goes done at depth 1, `OUTPUT.md` is written with the spliced `## Return` keys; (4) absent `.root-operator` produces a clean error.

### Documentation updates

- **R56**: `docs/agent-workflows/requirements.md` SHALL be updated:
  - The "Reusable dynamics library" section heading SHALL be renamed to "Reusable operators library".
  - The dynamics table's column "MEMORY in" / "MEMORY out" entries SHALL remain unchanged (they still describe contracts).
  - A new row SHALL be added for `expand-workflow.md` (Phase 7, push-args `## Partial State`+`## Task`, returns `## Children`, stack depth 1).
  - The Phase 7 section SHALL be updated to reflect the actual deliverables: the operator library list (refine, reflexion, cove, plan-execute, debate), the rename, the shell change, the per-interpreter migration scope, the deferred MoA, the deferred meta-reflexion.

- **R57**: `interpreters/README.md` SHALL be updated post-refactor:
  - References to "dynamics" SHALL become "operators".
  - The operator-shortlist section SHALL be updated to reflect the actual five v1 operators (refine, reflexion, cove, plan-execute, debate), no longer hedging about MoA's "shipped pending" status (MoA is now formally future scope).
  - A new "Phase 7 — Meta-frameworks" section SHALL describe the aflow-lite leaf in the same shape as the other groups.
  - The "execution context" section SHALL be updated to mention the new root-operator bootstrap mechanism.

- **R58**: `CLAUDE.md` SHALL be updated:
  - The "Dynamics (Call Stack)" section SHALL be renamed to "Operators (Call Stack)" and its prose updated to use "operator" throughout.
  - A NEW SECTION SHALL document the root-operator bootstrap: how `.root-operator` works, what gets substituted, what gets written to `OUTPUT.md`.
  - The "Instance Layout" section SHALL be updated to show `.root-operator` and `OUTPUT.md` at the instance root, and `frames/f000-<operator-slug>/` instead of `frames/f000-strategy/`.
  - Existing references to `dynamics/` in code-block examples SHALL be updated to `operators/`.

- **R59**: EVERY per-leaf README under `interpreters/<group>/<leaf>/README.md` SHALL be updated:
  - Path references (`dynamics/<file>` → `operators/<file>`).
  - Where the README explains the strategy living in `INSTRUCTIONS.md`, the explanation SHALL be updated to mention that `INSTRUCTIONS.md` is now a marker file pointing at the canonical operator under `operators/`.
  - Cycle counts and behaviour sections remain unchanged (they still describe what the operator does).

- **R60**: EVERY group-level README under `interpreters/<group>/README.md` SHALL be updated for the rename and any references to the post-refactor structure.

### Negative requirements (design choices captured)

- **R61**: THE V1 OPERATOR LIBRARY SHALL NOT include `1a self-refine` as a separate operator. Its capability is subsumed by `refine` (1b) per the operator-shortlist rationale in `interpreters/README.md`.
- **R62**: THE V1 OPERATOR LIBRARY SHALL NOT include `5b MoA` because MoA is not yet shipped (blocked on per-prompt model selection in the harness). MoA SHALL be added to the library in a future spec when it becomes available; that future spec is out of scope here.
- **R63**: THE V1 OPERATOR LIBRARY SHALL NOT include the search interpreters (`a-tot`, `b-lats`). Phase 7 IS itself a search; including search operators in its library would create searches over searches and produce intractable behaviour.
- **R64**: THE V1 OPERATOR LIBRARY SHALL NOT include the fixed-SOP team interpreters (`a-metagpt`, `b-chatdev`). Their internal SOPs are tied to "build a software project" and are not composable building blocks for arbitrary tasks.
- **R65**: PHASE 7 SHALL NOT implement meta-reflexion (workflow-level lessons accumulated across MCTS iterations and threaded into expand-workflow.md). This belongs to a higher-level future phase. The OPERATOR `reflexion.md` is in the library and runs INSIDE workflows, but Phase 7's own meta-search does not push reflect.md.
- **R66**: PHASE 7 SHALL NOT spawn nested shell instances. The original Phase 7 plan in `docs/agent-workflows/requirements.md` mentioned "launches it via a nested shell invocation" — this is superseded. With operators repackaged as pushable, all workflow execution happens via push/pop inside one instance.
- **R67**: THE NEW SHELL SHALL NOT support the previous "load `frames/f000-strategy/INSTRUCTIONS.md`" bootstrap. There is no backward-compatibility path for existing instances. (Per Q8 wipe choice: existing instances stay on disk for inspection but cannot be runnable.)
- **R68**: PRE-EXISTING INSTANCES UNDER `instances/` (created with the old layout) SHALL NOT be deleted or mutated as part of this spec. They remain on disk for inspection and history-snapshot replay via the visualizer, but attempting to run them under the new shell SHALL fail with the clean error from R14.
- **R69**: SPEC ARTEFACTS UNDER `docs/specs/<earlier-than-this-spec>/` SHALL NOT be edited. Earlier specs (Phase 1, 2, 2b, 3+4, 6, 6b) remain frozen historical records (Phase 6b R28/R85 model carries forward).
- **R70**: NO new shell-level concurrency primitives SHALL be introduced. AFlow-lite executes sequentially under the existing single-threaded shell, exactly like Phase 6b LATS.
- **R71**: AFLOW-LITE'S `aflow-lite.md` OPERATOR SHALL NOT contain GSM8K-specific vocabulary. The operator is domain-agnostic; GSM8K-specific assumptions (integer answers, regex extraction) live ONLY in the per-item scoring code path and are documented as "demo-specific" in comments. Swapping in HumanEval would replace the fixture format and the scoring regex — nothing else.
- **R72**: AFLOW-LITE SHALL NOT introduce a new "## Aflow Answer" or similar custom MEMORY tag. The push/pop `## Return\nanswer:` mechanism is the canonical way to pass values between operators; introducing additional tags would fragment the contract.

## Out of scope

- MoA (Mixture of Agents) as an operator in the v1 library — deferred to its own future spec when the per-prompt model-selection harness work lands.
- Meta-reflexion (workflow-level lessons across MCTS iterations) — deferred to a hypothetical higher-level meta-meta-spec; v1 relies entirely on UCT + LLM-driven expansion.
- HumanEval (or any non-GSM8K) demo — deferred to a follow-up spec; v1 ships GSM8K only.
- Backwards compatibility for pre-existing instances — they remain on disk but are intentionally non-runnable under the new shell (per Q8 wipe choice).
- A "Phase 8" ADAS-style meta-agent that writes new operator INSTRUCTIONS files in code — flagged in `docs/agent-workflows/requirements.md` § Phase 8 (optional) but not addressed here.
- Search interpreters (a-tot, b-lats) as Phase 7 library operators — excluded by the no-recursion principle (R63); Phase 7 is itself a search.
- Fixed-SOP teams (a-metagpt, b-chatdev) as Phase 7 library operators — excluded as end-to-end pipelines (R64).
- Backporting the rename or shell change to earlier specs' artefacts (Phase 1, 2, 2b, 3+4, 6, 6b) — they are frozen historical records (R69).
- Renaming "dynamic" in unrelated contexts (e.g. "dynamically allocated", "dynamic programming" in comments) — only the "pushable INSTRUCTIONS file" sense is renamed (R7).
- Adding meta-search hyperparameter tuning UI or a configuration framework — `max_iterations` and `uct_c` are simple per-instance scoped files, edited by hand if needed.
- A web-visualiser-specific Phase 7 rendering mode — the existing visualiser walks `history/` snapshots without Phase 7 awareness.
- Per-operator timeouts or cycle budgets within aflow-lite (e.g. "kill an operator if it takes >100 cycles") — operators self-terminate via their own done-state instructions; no kill switch.

## Open questions

(none — all design decisions were settled in brainstorming Q1–Q11)
