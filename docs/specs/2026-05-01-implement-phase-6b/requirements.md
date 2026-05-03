# Requirements: implement-phase-6b

## Context

Phase 6b of the agent-workflows roadmap (`docs/agent-workflows/requirements.md` § Phase 6b) calls for a Language Agent Tree Search (LATS) interpreter — a three-way crossover of Group 3 (Search), Group 1 (Iterative refinement), and Group 7 (Meta-frameworks) per `docs/agent-workflows/patterns.md` § "LATS — Language Agent Tree Search" (Zhou et al., arXiv:2310.04406). LATS is **MCTS over LLM-generated thoughts**, with reflexion-style verbal lessons harvested from failed rollouts and propagated into future expansions, and an evaluator that returns a reward signal grounded in the task's acceptance criterion.

Phase 6b also performs a **cross-cutting refactor of Phase 6's dynamics**: `expand-node.md` and `score.md` ship today with Game-of-24-specific prose and push-arg names, which violates the project-wide invariant that interpreters are domain-agnostic and PROGRAM.md is the sole locus of domain knowledge. Phase 6b generalises both dynamics in place, updates Phase 6's strategy and ledger to match, and ships its own LATS-specific `rollout.md` (a NEW general dynamic — the parent doc's "no new dynamics" claim was aspirational and is corrected here, with rationale).

The bundled demo PROGRAM.md is a byte-equal copy of Phase 6's Game of 24 puzzle, so a LATS run is directly comparable to a ToT run on identical input. The interpreter itself contains zero Game-of-24 knowledge — swapping in a maze or code-passing-tests PROGRAM.md would Just Work without touching strategy or dynamics.

## User stories

- **US1**: As a developer studying agent patterns, I want a working LATS interpreter at `interpreters/3-search/b-lats/`, so that I can run paper-faithful MCTS-over-thoughts against the Game of 24 demo and inspect the resulting search tree alongside Phase 6's BFS tree on the same input.
- **US2**: As an author of future Phase 7 (AFlow) work, I want Phase 6b's MCTS controller (selection / expansion / simulation / back-prop / reflect, all in strategy bash) to land as a documented and tested pattern, so that AFlow can adopt the same control flow against a workflow space instead of a thought space without reinventing the algorithm.
- **US3**: As a maintainer, I want the dynamics shipped under `interpreters/3-search/` (both Phase 6 ToT's and Phase 6b LATS's) to be **fully domain-agnostic** — receiving partial state and task description as push-args and inferring extension/scoring/rollout semantics from the task — so that the dynamics are genuinely reusable across demos and the "interpreter swaps demo via PROGRAM.md alone" property holds.
- **US4**: As a reader of the source-spec parent doc, I want `docs/agent-workflows/requirements.md` updated to reflect (a) the new `rollout.md` dynamic, (b) the refactored push-arg shapes for `expand-node.md` and `score.md`, and (c) the corrected "Reuse" claim in the Phase 6b section, so that the table and text remain normative rather than aspirational.
- **US5**: As a researcher, I want LATS's reward signal to come from a real evaluator (`evaluate.md` text-only mode against the task as criterion) and reflexion lessons to be harvested per-node and concatenated along the ancestor chain into future expansions of that subtree, so that the implementation faithfully mirrors Zhou et al.'s reflexion-aware MCTS rather than degrading into a "MCTS over LLM-generated thoughts with decorative reflection".

## Acceptance criteria (EARS)

### Directory layout and READMEs

- **R1**: THE INTERPRETER SHALL ship at `interpreters/3-search/b-lats/` containing at minimum `INSTRUCTIONS.md`, `PROGRAM.md`, `README.md`, and a `dynamics/` subdirectory.
- **R2**: THE GROUP-LEVEL `interpreters/3-search/README.md` SHALL be updated to list LATS as the second shipped variant under Group 3 (alongside ToT), with a one-line summary, a citation to Zhou et al. arXiv:2310.04406, and a note that GoT remains deferred.
- **R3**: THE INTERPRETER LEAF README SHALL include: a citation to Zhou et al. arXiv:2310.04406, a state-machine summary, the dynamics-and-contracts table, run instructions, the demo description, and a "Notable behaviour" section noting (a) the per-iteration cycle cost (~10–13 cycles, ~3–4 LLM calls per iteration), (b) the deliberate omission of `score.md` from LATS (UCT replaces graded-rank value), (c) the deliberate omission of a pruning phase (UCT handles exploration/exploitation implicitly), and (d) reflexion's per-node ancestor-walk lesson scope.

### Dynamics shipped (Phase 6b)

- **R4**: THE INTERPRETER SHALL ship `interpreters/3-search/b-lats/dynamics/` containing exactly four files: `expand-node.md`, `rollout.md`, `evaluate.md`, `reflect.md`.
- **R5**: THE INTERPRETER SHALL NOT ship `score.md` in `dynamics/` (deliberate omission — LATS uses UCT-driven exploration of rollout-derived statistics, not graded-rank value sampling).
- **R6**: THE FILE `interpreters/3-search/b-lats/dynamics/expand-node.md` SHALL be byte-equal to the refactored `interpreters/3-search/a-tot/dynamics/expand-node.md` (see R30–R33 below).
- **R7**: THE FILE `interpreters/3-search/b-lats/dynamics/evaluate.md` SHALL be byte-equal to the canonical `interpreters/1-iterative-refinement/b-evaluator-optimizer/dynamics/evaluate.md`.
- **R8**: THE FILE `interpreters/3-search/b-lats/dynamics/reflect.md` SHALL be byte-equal to the canonical `interpreters/1-iterative-refinement/c-reflexion/dynamics/reflect.md`.
- **R9**: `src/test/phase-operators-identity.test.ts` SHALL be extended to assert byte equality of all three reused dynamics (R6, R7, R8) between Phase 6b's `dynamics/` and their canonical sources.

### `rollout.md` dynamic contract (NEW)

- **R10**: THE FILE `interpreters/3-search/b-lats/dynamics/rollout.md` SHALL declare push-args `partial_state` and `task`, and SHALL fail the push with `unresolved-placeholder` if either is missing at push time.
- **R11**: WHEN invoked, `rollout.md` SHALL complete in a single cycle (state `empty` → `done`) and SHALL emit a `## Return` block with exactly one key, `terminal_state`, whose value is a literal block scalar containing the LLM's chosen terminal state — i.e. the result of playing forward from `partial_state` via repeated single-step extensions until the task's terminal predicate fires (per the task definition in `task`).
- **R12**: THE `rollout.md` DYNAMIC SHALL NOT push any further dynamic; the strategy's stack depth via rollout SHALL remain at 1 at all times.
- **R13**: THE PROSE OF `rollout.md` SHALL be domain-agnostic: it SHALL NOT mention "Game of 24", "numbers", "arithmetic operators", "maze", "code", or any other domain-specific vocabulary. The dynamic SHALL refer only to "partial state", "task", "extension", and "terminal state" as abstract concepts the LLM resolves by reading `task`.

### Phase 6 dynamics generalisation (cross-cutting refactor)

- **R14**: THE FILE `interpreters/3-search/a-tot/dynamics/expand-node.md` SHALL be rewritten so that (a) push-args are `partial_state` and `task` (replacing `parent_thought`, `target`, `numbers_remaining`); (b) prose is domain-agnostic per R13's vocabulary rule; (c) the `## Return` block contains a single `children` key whose value is a literal block scalar of exactly k=5 entries, each entry a `state:` line whose value is a block scalar containing the post-extension partial state.
- **R15**: THE FILE `interpreters/3-search/a-tot/dynamics/score.md` SHALL be rewritten so that (a) push-args are `partial_state` and `task` (replacing `thought`, `target`); (b) prose is domain-agnostic per R13's vocabulary rule; (c) the `## Return` block contains a single `value` key whose value is one of the literal strings `sure`, `likely`, `impossible` (enum unchanged from Phase 6).
- **R16**: THE REFACTORED `expand-node.md` AND `score.md` SHALL preserve their stack-depth invariant (no further pushes; depth 1 from caller).

### Phase 6 strategy and ledger refactor (cross-cutting)

- **R17**: THE FILE `interpreters/3-search/a-tot/INSTRUCTIONS.md` SHALL be updated so that at Initialize the strategy copies `../../PROGRAM.md` to `./scoped/task.md` and uses that copy as the `task` push-arg source for every push of `expand-node.md` and `score.md`.
- **R18**: THE PHASE 6 LEDGER (`./scoped/tree.md`) NODE BLOCK SCHEMA SHALL drop the `op` and `left` fields. After the refactor every node block SHALL contain exactly the keys `id`, `parent_id`, `depth`, `value`, `samples`, `status`.
- **R19**: WHEN a node is created (root at Initialize, or a child during Expand-absorb), THE PHASE 6 STRATEGY SHALL also write the node's partial state to `./scoped/state-<id>.md` as a sibling per-node file. The root node's state SHALL be the empty file (semantically: "starting state, no extensions applied yet").
- **R20**: WHEN PUSHING `expand-node.md` OR `score.md` for node X, THE PHASE 6 STRATEGY SHALL pass `partial_state` as the contents of `./scoped/state-<X>.md` and `task` as the contents of `./scoped/task.md`.
- **R21**: WHEN ABSORBING `## Children` from `expand-node.md`'s return, THE PHASE 6 STRATEGY SHALL parse each child's `state:` block scalar and write it verbatim to `./scoped/state-<new_id>.md`. THE LEDGER BLOCK FOR THE NEW NODE SHALL contain only the schema fields from R18 (no `op` / `left`).
- **R22**: WHEN GOAL-CHECKING (Phase 6's R28–R30 equivalent), THE PHASE 6 STRATEGY SHALL pass `attempt` to `evaluate.md` as the contents of the leaf's `./scoped/state-<id>.md` (which the LLM is expected to have populated with the full extension chain so far) and `criterion` as the contents of `./scoped/task.md`. THE PARENT-CHAIN-WALK reconstruction logic from Phase 6's R29 SHALL be replaced with a single-file read.
- **R23**: WHEN EMITTING `## Solution` (Phase 6's R35 equivalent), THE PHASE 6 STRATEGY SHALL emit the contents of the winning leaf's `./scoped/state-<id>.md` as the solution. THE PARENT-CHAIN-WALK reconstruction logic from Phase 6's R35 SHALL be replaced with a single-file read.

### Phase 6 test updates (cross-cutting)

- **R24**: THE TEST `src/test/phase-6-tot.test.ts` SHALL be updated so that ledger-shape assertions reference the post-refactor schema from R18, and `op`/`left`/`numbers_remaining` references are removed.
- **R25**: THE TEST `src/test/phase-6-tot.test.ts` SHALL gain a positive assertion that for every node created in a run, a corresponding `./scoped/state-<id>.md` file exists in the strategy frame's history snapshots.
- **R26**: THE TEST `src/test/phase-6-tot.test.ts` SHALL gain a positive assertion that the refactored `expand-node.md` and `score.md` files are domain-agnostic (regex-matched: SHALL NOT contain the literal substrings `Game of 24`, `numbers`, `arithmetic`, `+`, `−`, `×`, `÷`, `target` outside of generic-prose contexts; if naming-collision becomes an issue the assertion SHALL fall back to a positive check that the only push-arg names are `partial_state` and `task`).

### Phase 6 documentation (cross-cutting)

- **R27**: THE PHASE 6 LEAF README (`interpreters/3-search/a-tot/README.md`) SHALL be updated to reflect the refactored ledger schema (R18), the new `./scoped/state-<id>.md` per-node file convention (R19), and the new general-form push-args (R20).
- **R28**: THE PHASE 6 SPEC ARTEFACTS UNDER `docs/specs/2026-04-30-agent-workflows-phase-6/` SHALL NOT be edited as part of Phase 6b. They are treated as the v1 historical record. Phase 6b's spec (this document) supersedes the Phase 6 requirements affected by the refactor (Phase 6's R11, R17, R29, R35, R38–R44 are partially superseded by Phase 6b's R14–R23).
- **R29**: THE PHASE 6 LEAF README SHALL include a "Refactored in Phase 6b" note at the top of the "Notable behaviour" section, citing the present spec by date and slug.

### Refactored `expand-node.md` and `score.md` (Phase 6 path = canonical path)

- **R30**: AFTER REFACTOR, the file `interpreters/3-search/a-tot/dynamics/expand-node.md` SHALL satisfy: receives push-args `partial_state` and `task`; produces `## State done` + `## Return` block with key `children`; the `children` value is a literal block scalar of exactly k=5 entries; each entry is a `state:` line followed by a block-scalar value containing the post-extension partial state.
- **R31**: AFTER REFACTOR, the file `interpreters/3-search/a-tot/dynamics/score.md` SHALL satisfy: receives push-args `partial_state` and `task`; produces `## State done` + `## Return` block with key `value`; the `value` is one of the literal strings `sure`, `likely`, `impossible`.
- **R32**: AFTER REFACTOR, the prose of both `expand-node.md` and `score.md` at `interpreters/3-search/a-tot/dynamics/` SHALL pass the domain-agnostic vocabulary check from R13 (no "Game of 24", "numbers", "arithmetic", "+/−/×/÷", "left set", "moves remaining", etc.).
- **R33**: THE REFACTORED FILES SHALL preserve the existing single-cycle invariant (state `empty` → `done`, no further pushes, stack depth 1).

### LATS strategy — initialization

- **R34**: WHEN the strategy enters its first cycle (state == `empty`), THE SYSTEM SHALL: (a) copy `../../PROGRAM.md` to `./scoped/task.md`; (b) write `30` to `./scoped/max_iterations.md`; (c) write `1.41421356` to `./scoped/uct_c.md`; (d) write `0` to `./scoped/iter_count.md`; (e) append exactly one root node block to `./scoped/tree.md` with fields `id: n0`, `parent_id: -`, `depth: 0`, `q: 0`, `n: 0`, `status: live`; (f) create the empty file `./scoped/state-n0.md` (semantically: "starting state, no extensions applied yet").
- **R35**: WHEN initialization succeeds, THE SYSTEM SHALL transition to state `selecting`.
- **R36**: THE INTERPRETER SHALL NOT include a "validate PROGRAM.md parsing" step analogous to Phase 6's R6. PROGRAM.md content is opaque to the strategy; whether it parses meaningfully is the LLM dynamic's concern at first push.

### LATS tree ledger contract

- **R37**: THE SYSTEM SHALL persist every tree node ever created in `./scoped/tree.md` (in the strategy frame) as a sequence of YAML-style blocks separated by `---` delimiter lines, one block per node.
- **R38**: EVERY NODE BLOCK in `./scoped/tree.md` SHALL contain exactly the keys `id`, `parent_id`, `depth`, `q`, `n`, `status`.
- **R39**: THE SYSTEM SHALL update existing node entries in `./scoped/tree.md` exclusively by surgical edit (`sed -i` or `awk`); after the root node has been written, NO cycle SHALL wholesale-rewrite `./scoped/tree.md`.
- **R40**: NODE IDs SHALL be assigned monotonically as `n<index>` where `<index>` is a non-negative integer that increments by exactly 1 per node creation across the entire run; IDs once assigned SHALL NOT be reused or renumbered.
- **R41**: A NODE'S `status` field SHALL hold one of the literal values `live`, `terminal_pass`, or `terminal_fail`; once set to `terminal_pass` or `terminal_fail`, the status SHALL NOT revert to `live`. THE INTERPRETER SHALL NOT use a `pruned` status value (the Phase 6 enum's `pruned` member is intentionally absent in LATS).
- **R42**: WHEN A NODE IS CREATED, the strategy SHALL also write the node's partial state to `./scoped/state-<id>.md`. The root node's state file SHALL be the empty file.
- **R43**: PER-NODE STATE FILES (`./scoped/state-<id>.md`) SHALL be written exactly once at node creation and SHALL NOT be modified thereafter.

### LATS state machine — selection

- **R44**: WHILE state == `selecting`, THE SYSTEM SHALL descend the tree from root using the UCT rule: at each non-leaf, choose the child maximising `q/n + c · sqrt(ln(n_parent) / n)` where `c` is the contents of `./scoped/uct_c.md` interpreted as a float. THE COMPUTATION SHALL be performed in bash via `bc -l`.
- **R45**: AT ANY NODE WITH ONE OR MORE CHILDREN HAVING `n == 0`, THE SYSTEM SHALL select the lowest-`id` such child (deterministic leftmost-unvisited tiebreak), bypassing the UCT formula for that step (its exploration term is undefined under n=0).
- **R46**: A LEAF FOR SELECTION'S PURPOSES IS a tree node with no children (no node in `tree.md` has `parent_id == this node's id`). WHEN selection reaches a leaf, the strategy SHALL write the leaf's id to `./scoped/cursor.md` and transition to state `expanding`.

### LATS state machine — expansion

- **R47**: WHILE state == `expanding`, THE SYSTEM SHALL push `dynamics/expand-node.md` exactly once with push-args `partial_state` (computed per R48) and `task` (= contents of `./scoped/task.md`). The returnState SHALL be `expanding`, so on pop the shell sets state to `expanding_completed`.
- **R48**: THE `partial_state` PUSH-ARG VALUE for any expand or rollout push SHALL be the concatenation of (a) the contents of `./scoped/state-<cursor>.md`, then (b) if any ancestor of `cursor` (including `cursor` itself) has a non-empty `./scoped/lessons-<id>.md` file, a freshly-formatted `Lessons learned along this branch:` block containing those lessons (collected by walking the parent chain from cursor up to root). Order of lessons SHALL be root-to-cursor (oldest ancestor first); within a single ancestor's lessons file, original write order SHALL be preserved.
- **R49**: WHEN `expand-node.md` returns control (state == `expanding_completed` AND `## Children` is present in MEMORY), THE SYSTEM SHALL: (a) parse `## Children` as a sequence of `state:` block-scalar entries (k=5 expected); (b) for each well-formed entry, allocate the next monotonic id, append a node block to `./scoped/tree.md` with `parent_id == cursor`, `depth = (cursor depth) + 1`, `q: 0`, `n: 0`, `status: live`; (c) write the entry's block-scalar value verbatim to `./scoped/state-<new_id>.md`; (d) record the `id` of the **leftmost** (lowest-id) newly created child in `./scoped/chosen_child.md`; (e) remove `## Children` from MEMORY; (f) transition to state `simulating`.
- **R50**: IF `expand-node.md` returns fewer than k=5 well-formed `state:` entries, THEN THE SYSTEM SHALL append the well-formed entries that did parse, append a non-blocking `## Pending Questions` entry naming the count of missing or malformed entries, set `chosen_child` to the leftmost successfully created child (if any), and continue to `simulating`. IF ZERO entries parsed, THEN THE SYSTEM SHALL append a non-blocking `## Pending Questions`, mark the cursor's status as `terminal_fail` (treating the unexpandable leaf as a dead end), and transition back to `selecting` without entering simulation. THE SYSTEM SHALL NOT transition to `waiting_for_user` from this path.

### LATS state machine — simulation

- **R51**: WHILE state == `simulating`, THE SYSTEM SHALL push `dynamics/rollout.md` exactly once with push-args `partial_state` (computed per R48 against `chosen_child` instead of `cursor`) and `task`. The returnState SHALL be `simulating`, so on pop the shell sets state to `simulating_completed`.
- **R52**: WHEN `rollout.md` returns control (state == `simulating_completed` AND `## Terminal State` is present in MEMORY), THE SYSTEM SHALL: (a) persist `## Terminal State` verbatim to `./scoped/last_terminal.md`; (b) push `dynamics/evaluate.md` exactly once with `attempt` (= contents of `./scoped/last_terminal.md`) and `criterion` (= contents of `./scoped/task.md`); (c) remove `## Terminal State` from MEMORY; (d) the returnState SHALL be `evaluating`, so on pop the shell sets state to `evaluating_completed`.
- **R53**: IF `rollout.md` returns malformed output (no `## Terminal State` section, or empty value), THEN THE SYSTEM SHALL: (a) treat the rollout as a failed attempt with reward 0; (b) skip the `evaluate.md` push for this iteration; (c) write `fail` to a synthetic `## Verdict` and "rollout returned malformed output" to a synthetic `## Feedback` directly in MEMORY; (d) append a non-blocking `## Pending Questions` citing the malformed return; (e) transition directly to `evaluating_completed`. THE SYSTEM SHALL NOT transition to `waiting_for_user` from this path.

### LATS state machine — reward and back-propagation

- **R54**: WHEN state == `evaluating_completed` AND `## Verdict` is present in MEMORY, THE SYSTEM SHALL parse the verdict and assign reward as: `pass` → 1, `fail` → 0, anything else → 0 (treated as fail per the Phase 6 R33 conservative pattern; non-blocking `## Pending Questions` appended).
- **R55**: WHEN reward HAS BEEN ASSIGNED, THE SYSTEM SHALL back-propagate by walking the parent chain from `chosen_child` up to and including the root, surgically incrementing each node's `n` by 1 and adding the reward to each node's `q`. Both updates SHALL be performed by surgical edit (`awk`) in the same cycle.
- **R56**: WHEN reward == 1, THE SYSTEM SHALL: (a) update `chosen_child`'s `status` to `terminal_pass` via surgical edit; (b) emit a `## Solution` MEMORY section containing the contents of `./scoped/last_terminal.md` and the iteration count from `./scoped/iter_count.md`; (c) set state to `done`. THE SYSTEM SHALL NOT materialize the rollout's intermediate states into the tree (record-A: only deliberate UCT expansions grow `tree.md`).
- **R57**: WHEN reward == 0, THE SYSTEM SHALL transition to state `reflecting`. THE SYSTEM SHALL NOT update `chosen_child`'s `status` to `terminal_fail` based on a single failed rollout — the node remains `live` and may be re-explored (UCT will deprioritise it as `q/n` accumulates more failures).

### LATS state machine — reflection

- **R58**: WHILE state == `reflecting`, THE SYSTEM SHALL push `dynamics/reflect.md` exactly once with push-args `attempt` (= contents of `./scoped/last_terminal.md`), `verdict` (= the literal string `fail`), and `feedback` (= the contents of `## Feedback` from MEMORY, or a synthesized "rollout judged fail" if absent). The returnState SHALL be `reflecting`, so on pop the shell sets state to `reflecting_completed`.
- **R59**: WHEN `reflect.md` returns control (state == `reflecting_completed` AND `## Lesson` is present in MEMORY), THE SYSTEM SHALL append the lesson's content as a new bullet to `./scoped/lessons-<chosen_child_id>.md` (creating the file if it does not exist) via surgical append (`echo >>`), then remove `## Lesson` from MEMORY.
- **R60**: IF `reflect.md` returns malformed output (no `## Lesson` section, or empty value), THEN THE SYSTEM SHALL skip the lesson append, append a non-blocking `## Pending Questions` citing the malformed return, and continue. THE SYSTEM SHALL NOT transition to `waiting_for_user` from this path.
- **R61**: AFTER R59 OR R60 COMPLETES, THE SYSTEM SHALL increment `./scoped/iter_count.md` by 1 and check the budget: if `iter_count >= max_iterations`, emit a `## No Solution Found` MEMORY section noting the iteration count and the count of `terminal_fail` nodes in the tree, then set state to `done`; otherwise transition to `selecting` for the next iteration.

### Termination

- **R62**: WHEN state transitions to `done`, THE SYSTEM SHALL halt at stack depth 1 (only the strategy frame remains on the call stack). This is the standard well-known halt path inherited from the shell.
- **R63**: A SUCCESSFUL RUN SHALL emit `## Solution`. AN UNSUCCESSFUL (BUDGET-EXHAUSTED) RUN SHALL emit `## No Solution Found`. EVERY RUN THAT REACHES `done` SHALL emit exactly one of these two sections.

### Lesson plumbing

- **R64**: PER-NODE LESSON FILES (`./scoped/lessons-<id>.md`) SHALL be created lazily — the file SHALL exist only for nodes that have been a `chosen_child` in at least one failed rollout that produced a well-formed `## Lesson` from `reflect.md`.
- **R65**: PER-NODE LESSON FILES SHALL be append-only. Existing content SHALL NOT be rewritten or deleted by any cycle.
- **R66**: THE ANCESTOR-WALK CONCATENATION FROM R48 SHALL include the cursor's own lessons file (if it exists) — i.e. expanding node X sees lessons attached to X itself plus all of X's ancestors back to root, in root-to-X order.

### `evaluate.md` reuse and contract

- **R67**: THE INTERPRETER SHALL invoke `evaluate.md` in **text-only mode** (no `../../workspace/` paths in `criterion`). The criterion is the task description; the attempt is the rollout's terminal state. This is the standard text-only branch documented in `evaluate.md`'s preamble.
- **R68**: THE INTERPRETER SHALL NOT mutate or extend `evaluate.md`'s contract. R7 byte-equality is binding.

### Demo PROGRAM.md

- **R69**: THE INTERPRETER SHALL ship `interpreters/3-search/b-lats/PROGRAM.md` as a byte-equal copy of `interpreters/3-search/a-tot/PROGRAM.md` (Game of 24, "use 4, 5, 6, 10 → 24"), so that LATS and ToT are directly comparable on identical input.
- **R70**: WHEN run against the demo `PROGRAM.md` to completion, THE SYSTEM SHALL produce exactly one of: (a) a `## Solution` section containing a terminal state that `evaluate.md` verdicted `pass`, OR (b) a `## No Solution Found` section noting the iteration count reached `max_iterations` (= 30) without finding a passing rollout. Subject to LLM stochasticity, the bundled demo is a puzzle for which a solution exists, so a successful demo run SHALL produce `## Solution`.
- **R71**: WHEN run against the demo `PROGRAM.md` to completion, the run SHALL exhibit at least one back-propagation that updates `q` and `n` along a path of length ≥ 2 (proving non-trivial tree growth and back-prop arithmetic).

### Validation tests

- **R72**: THE PROJECT SHALL ship `src/test/phase-6b-lats.test.ts` covering at minimum:
  - (1) byte-equality of `expand-node.md`, `evaluate.md`, `reflect.md` between Phase 6b's `dynamics/` and their canonical sources (R6, R7, R8);
  - (2) the ledger schema invariant from R38 (after a complete run, every node block has exactly the keys `id, parent_id, depth, q, n, status`);
  - (3) the back-prop arithmetic invariant: for every node with `n > 0`, `0 ≤ q ≤ n`;
  - (4) per-node state files exist for every node ever created (R42);
  - (5) per-node lesson files exist only at `chosen_child` nodes from at least one failed-rollout iteration (R64);
  - (6) at every snapshot in `history/`, `.call-stack.json` shows `stack.length` ≤ 2;
  - (7) the iteration-budget cap (R61) is respected — at most `max_iterations` (30) rollout cycles in any run;
  - (8) the absence of "pruned" status values from any node ever recorded (R41);
  - (9) the absence of materialized rollout-trajectory nodes — total node count after a run equals (root) + 5 × (number of expansion iterations performed), no more (R56 record-A invariant).

### Source-spec parent doc updates

- **R73**: THE PROJECT SHALL update the dynamics table in `docs/agent-workflows/requirements.md` so that:
  - The `expand-node.md` row's "MEMORY in" column reads `## Partial State` and `## Task` (replacing `## Parent Thought`); the row's "MEMORY out" column remains `## Children`; the row's "Stack depth" column remains `1`.
  - The `score.md` row's "MEMORY in" column reads `## Partial State` and `## Task` (replacing `## Thought`); the row's "MEMORY out" column remains `## Value`; the row's "Stack depth" column remains `1`.
  - A new row is added: `rollout.md | 6b | ## Partial State, ## Task | ## Terminal State | 1`.
- **R74**: THE PROJECT SHALL edit the Phase 6b prose in `docs/agent-workflows/requirements.md` so that the "Reuse (no new dynamics)" line is replaced with an explicit acknowledgement that one new dynamic (`rollout.md`) ships, accompanied by a one-paragraph rationale: paper-faithful LLM-policy single-shot rollout has no honest implementation in the existing `expand-node.md` / `evaluate.md` / `reflect.md` contracts (the rollout's job — "play forward to terminal in one shot, return only the endpoint" — is structurally distinct from `expand-node.md`'s "generate k siblings" and from `evaluate.md`'s "judge a complete attempt"); bundling rollout into either would distort their contracts and break their reuse by other interpreters. The deviation from the parent doc's earlier "no new dynamics" claim is the same shape as Phase 6's R4 deviation (split of `expand-node.md` / `score.md`) and is justified for the same reason: contract preservation over count minimisation.
- **R75**: THE PROJECT SHALL add a one-paragraph note to the Phase 6 section of `docs/agent-workflows/requirements.md` recording that Phase 6's `expand-node.md` and `score.md` were generalised in place as part of Phase 6b's scope (see Phase 6b cross-cutting refactor), with a pointer to this spec (`docs/specs/2026-05-01-implement-phase-6b/`).

### Negative requirements (design choices captured)

- **R76**: THE INTERPRETER SHALL NOT use `workspace/` for tree state, frontier state, scoring state, or any per-branch git activity; project-git-per-node integration remains deferred.
- **R77**: THE INTERPRETER SHALL NOT ship a `score.md` dynamic file (R5). Future-LATS variants that want value-network-style priors can re-introduce `score.md` as an optional UCT-prior step, but v1 deliberately omits it to keep paper-faithful rollout-first MCTS as the core.
- **R78**: THE INTERPRETER SHALL NOT include a pruning phase analogous to Phase 6's R24. UCT handles exploration/exploitation implicitly; explicit pruning would conflate ToT and MCTS semantics.
- **R79**: THE INTERPRETER SHALL NOT make `max_iterations`, `uct_c`, `k` (children-per-expansion = 5), or any other search hyperparameter configurable via `PROGRAM.md`. PROGRAM.md is the task; tuning knobs live in `./scoped/` files (R34) so they can be edited by hand for an in-flight instance without touching INSTRUCTIONS.md.
- **R80**: THE INTERPRETER SHALL NOT introduce parallel rollouts, parallel expansion, or any concurrency primitive; the interpreter executes sequentially under the existing single-threaded shell.
- **R81**: THE INTERPRETER SHALL NOT expose any pushed-frame mechanism for accessing the strategy frame's `./scoped/` directory; all interaction between the strategy and pushed dynamics SHALL flow exclusively through `## Push-Args` (in) and `## Return` (out). Phase 6 R56 invariant carries forward.
- **R82**: THE INTERPRETER SHALL NOT materialize the moves of a successful rollout into `tree.md` (record-A per R56). The winning trajectory lives only in MEMORY's `## Solution` section and in `history/` snapshots of the relevant cycle.
- **R83**: THE INTERPRETER SHALL NOT include any Game-of-24 (or any other domain) vocabulary in `INSTRUCTIONS.md` or in any of the four shipped dynamics. All domain knowledge lives exclusively in `PROGRAM.md`. (The `task.md` scoped file is a verbatim copy of `PROGRAM.md`, not a domain rewrite.)
- **R84**: THE PHASE 6 REFACTOR SHALL NOT change Phase 6's BFS strategy semantics — k, b, max_depth, the 3-sample scoring per child, the weighted-sum aggregation, the pruning phase, and the goal-checking sequence all remain as Phase 6 shipped them. Only the dynamics' push-arg shapes and the ledger's `op`/`left` fields change.
- **R85**: PHASE 6'S SPEC ARTEFACTS UNDER `docs/specs/2026-04-30-agent-workflows-phase-6/` SHALL NOT be edited (R28 reaffirmed as a negative requirement).
- **R86**: EXISTING INSTANCES UNDER `instances/` (created from pre-refactor Phase 6 ToT) SHALL continue to work unchanged after the refactor lands. `new-instance.sh` copies dynamics and INSTRUCTIONS at creation time, so each instance is self-contained; the refactor only affects future instances. NO `instances/` wipe is performed.

## Out of scope

- A second LATS demo using the same interpreter against a different PROGRAM.md (e.g. maze, code-passing-tests). The general-dynamics architecture supports this in principle (just write a new PROGRAM.md), but no second demo leaf is shipped in this phase.
- Backporting Phase 6's spec artefacts to reflect the refactor — the Phase 6 spec is treated as the v1 historical record (R28, R85).
- A LATS-specific visualizer mode showing UCT statistics or the search frontier — the existing visualizer walks `history/` snapshots without LATS knowledge.
- Caching of rollout results across iterations (e.g. memoising `terminal_state` for identical `partial_state`+`lessons` push-arg pairs).
- Heterogeneous models per dynamic (e.g. cheaper model for `rollout.md`) — would require per-prompt model selection in the harness, which the shell does not provide.
- Parallel rollouts per expansion (R80), or any concurrent execution.
- Project-git-per-node branching in `workspace/` (R76).
- A `score.md`-as-UCT-prior variant (deliberately omitted per R77; flagged as a future variant).
- Refactoring Phase 6's strategy beyond the minimum needed to consume the generalised dynamics (R84).
- Adding any Game-of-24 logic to the strategy (R83).
- A full Graph-of-Thoughts (GoT) variant under `interpreters/3-search/c-got/` — remains deferred per Phase 6's out-of-scope list.

## Open questions

(none — all design decisions surfaced during brainstorming were resolved against Zhou et al. arXiv:2310.04406 and the corrected domain-agnostic-dynamics architecture)
