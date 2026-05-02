# Requirements: agent-workflows-phase-6

## Context

Phase 6 of the agent-workflows roadmap (`docs/agent-workflows/requirements.md` § Phase 6) calls for a Tree-of-Thoughts interpreter implementing the Yao et al. 2023 protocol (`docs/agent-workflows/patterns.md` Group 3 — Search). The repo already ships interpreters for Group 1 (refinement), Group 2 (planning), Group 4 (peer collaboration), and Group 5 (fixed-SOP teams); ToT is the first Group-3 entry and the first interpreter that performs explicit search over alternative partial solutions rather than iterating on a single solution.

The defining property of ToT is **breadth-first deliberation with discrete value labels**: at each depth the strategy generates k=5 candidate "thoughts" per live node, scores each thought 3 times against a graded `sure | likely | impossible` rubric, sums weighted scores, and keeps only the top b=5 candidates. The cycle cost (~200 cycles per Game of 24 puzzle) is bounded by construction (k=5, b=5, depth derived from input size) and is the deliberate price of paper-faithful fidelity.

Phase 6 establishes scaffolding that Phase 6b (LATS) imports verbatim — `expand-node.md`, the score-and-prune machinery, and the BFS state machine — so contracts here are normative for the Search group going forward.

## User stories

- **US1**: As a developer studying agent patterns, I want a working Tree-of-Thoughts interpreter at `interpreters/3-search/a-tot/`, so that I can run the canonical Yao et al. 2023 protocol against a Game of 24 puzzle and inspect the resulting search tree.
- **US2**: As an author of the future Phase 6b (LATS) interpreter, I want `expand-node.md` and the BFS state machine to ship as reusable, testable components, so that LATS's MCTS controller can compose them without reinvention.
- **US3**: As a reader of `history/` snapshots, I want the search tree to live in an append-only ledger that grows monotonically, so that scrubbing through the snapshot sequence in the visualiser produces a watchable animation of expansion and pruning.
- **US4**: As a researcher, I want the interpreter's value-scoring step to faithfully reproduce Yao et al.'s 3-sample weighted-sum scheme (sure=20, likely=1, impossible=0.001), so that benchmark comparisons against the paper are meaningful.
- **US5**: As a maintainer of the agent-workflows source spec, I want the dynamics-table entry for `expand-node.md` corrected to reflect the actual contract (children-only, no inline values), so that the table remains normative rather than aspirational.

## Acceptance criteria (EARS)

### Directory layout and READMEs

- **R1**: THE INTERPRETER SHALL ship at `interpreters/3-search/a-tot/` containing at minimum `INSTRUCTIONS.md`, `PROGRAM.md`, `README.md`, and a `dynamics/` subdirectory.
- **R2**: THE PROJECT SHALL ship a group-level `interpreters/3-search/README.md` framing Group 3 — Search, listing ToT as the only currently shipped variant, and naming GoT (deferred) and LATS (Phase 6b) as planned siblings with one-line summaries and source citations.
- **R3**: THE INTERPRETER LEAF README SHALL include: a citation to Yao et al. arXiv:2305.10601, a state-machine summary, the dynamics-and-contracts table, run instructions, the demo description, and a "Notable behaviour" section noting (a) the ~200-cycle worst-case cost per Game of 24 puzzle and (b) the 3× value-sampling fidelity choice with its weight mapping.

### Source-spec dynamics-table update

- **R4**: THE PROJECT SHALL update the dynamics table in `docs/agent-workflows/requirements.md` so the Phase 6 row currently reading `expand-node.md … ## Children, ## Value … N` is replaced by two rows: `expand-node.md … ## Children … 1` and `score.md … ## Value … 1`. The replacement SHALL accompany a one-paragraph rationale in the same document explaining why two dynamics replace one (graded ranking is structurally distinct from terminal pass/fail and would mangle `evaluate.md`'s contract).

### Initialization

- **R5**: WHEN the strategy enters its first cycle (state == `empty`), THE SYSTEM SHALL read `../../PROGRAM.md` and parse from its free-form prose a list of N integer numbers and one integer target.
- **R6**: IF `PROGRAM.md` parsing yields fewer than 2 integer numbers or no integer target, THEN THE SYSTEM SHALL append a non-blocking `## Pending Questions` entry naming the missing field, set state to `waiting_for_user`, and stop progressing until the user responds.
- **R7**: WHEN initialization succeeds, THE SYSTEM SHALL persist `numbers`, `target`, and `max_depth = N − 1` to a scoped file or MEMORY section such that subsequent cycles read them by path or section name without re-parsing `PROGRAM.md`.
- **R8**: WHEN initialization succeeds, THE SYSTEM SHALL append exactly one root node block to `./scoped/tree.md` with fields `id: n0`, `parent_id: -`, `depth: 0`, `op: -`, `left: <numbers space-separated>`, `value: 0`, `samples: 0`, `status: live`.
- **R9**: WHEN the root node has been written, THE SYSTEM SHALL transition to state `expanding` with `## Current Depth` set to 0.

### Tree ledger contract

- **R10**: THE SYSTEM SHALL persist every tree node ever created in `./scoped/tree.md` (in the strategy frame) as a sequence of YAML-style blocks separated by `---` delimiter lines, one block per node.
- **R11**: EVERY NODE BLOCK in `./scoped/tree.md` SHALL contain the keys `id`, `parent_id`, `depth`, `op`, `left`, `value`, `samples`, and `status`.
- **R12**: THE SYSTEM SHALL update existing node entries in `./scoped/tree.md` exclusively by surgical edit (`sed -i` or `awk`); after the root node has been written, NO cycle SHALL wholesale-rewrite `./scoped/tree.md`.
- **R13**: NODE IDs SHALL be assigned monotonically as `n<index>` where `<index>` is a non-negative integer that increments by exactly 1 per node creation across the entire run; IDs once assigned SHALL NOT be reused or renumbered.
- **R14**: A NODE'S `status` field SHALL hold one of the literal values `live`, `pruned`, `terminal_pass`, or `terminal_fail`; once set to any of `pruned`, `terminal_pass`, or `terminal_fail`, the status SHALL NOT revert to `live`.

### BFS execution — expanding

- **R15**: WHILE state == `expanding`, THE SYSTEM SHALL select exactly one node from `./scoped/tree.md` matching the predicate `depth == current_depth AND status == live AND has zero children` (where "child" means any node whose `parent_id` equals this node's `id`).
- **R16**: WHEN such a node is found, THE SYSTEM SHALL push `dynamics/expand-node.md` exactly once with push-args `parent_thought` (a textual serialization of the node's `op` and `left`), `target` (the integer target), and `numbers_remaining` (the node's `left` field).
- **R17**: WHEN `expand-node.md` returns control (state suffix `_completed` with `## Children` present), THE SYSTEM SHALL append exactly one new node block to `./scoped/tree.md` per child entry returned, with `parent_id` set to the just-expanded node's id, `depth = current_depth + 1`, `value: 0`, `samples: 0`, `status: live`, and `op`/`left` parsed from the corresponding child entry. THE `## Children` MEMORY section SHALL be removed from MEMORY in the same cycle.
- **R18**: WHEN no nodes match the R15 predicate at `current_depth`, THE SYSTEM SHALL transition out of `expanding` — to `scoring` if any `live` node at `current_depth + 1` has `samples < 3`, or to `pruning` if every `live` node at `current_depth + 1` has `samples == 3`.

### BFS execution — scoring (3 samples per child)

- **R19**: WHILE state == `scoring`, THE SYSTEM SHALL select exactly one node from `./scoped/tree.md` matching the predicate `depth == current_depth + 1 AND status == live AND samples < 3`.
- **R20**: WHEN such a child is found, THE SYSTEM SHALL push `dynamics/score.md` exactly once with push-args `thought` (the child's `op`+`left` serialization) and `target`.
- **R21**: WHEN `score.md` returns control with `## Value` present, THE SYSTEM SHALL increment that child's `samples` field by exactly 1 and add to its `value` field the numeric weight of the returned label, where the mapping is `sure → 20`, `likely → 1`, `impossible → 0.001`. Both updates SHALL be performed by surgical edit in the same cycle. THE `## Value` MEMORY section SHALL be removed from MEMORY in the same cycle.
- **R22**: WHEN every `live` child at `current_depth + 1` has `samples == 3` AND no nodes at `current_depth` match the R15 predicate, THE SYSTEM SHALL transition to state `pruning`.
- **R23**: WHILE both unexpanded `live` nodes exist at `current_depth` AND unscored (`samples < 3`) `live` nodes exist at `current_depth + 1`, THE SYSTEM SHALL be free to interleave further `expanding` and `scoring` cycles in any order; ordering between expansion and scoring is unspecified provided no node is scored more than 3 times and no `live` node is left with `samples < 3` at the time of pruning.

### Pruning

- **R24**: WHEN state == `pruning`, THE SYSTEM SHALL select all nodes at `depth == current_depth + 1` with `status == live`, sort them by `value` descending (ties broken by `id` ascending), retain the top b=5, and update every other node's `status` to `pruned` via surgical edit of `./scoped/tree.md`.
- **R25**: WHEN pruning has updated the ledger, THE SYSTEM SHALL transition to state `advancing`.

### Advancing

- **R26**: WHEN state == `advancing` AND `current_depth + 1 ≤ max_depth`, THE SYSTEM SHALL increment `current_depth` by 1 and transition to state `expanding`.
- **R27**: WHEN state == `advancing` AND `current_depth + 1 > max_depth`, THE SYSTEM SHALL transition to state `goal_checking`.

### Goal checking and terminal evaluation

- **R28**: WHILE state == `goal_checking`, THE SYSTEM SHALL select exactly one node from `./scoped/tree.md` matching the predicate `depth == max_depth AND status == live`.
- **R29**: WHEN such a terminal candidate is found, THE SYSTEM SHALL reconstruct the candidate's full arithmetic expression by walking the `parent_id` chain from the terminal back to the root and assembling the chain of `op` strings into a single expression.
- **R30**: WHEN the expression has been reconstructed, THE SYSTEM SHALL push `dynamics/evaluate.md` exactly once with push-args `attempt` (the reconstructed expression) and `criterion` (a synthesized text of the form "Expression must use each of <numbers> exactly once and evaluate to <target>").
- **R31**: WHEN `evaluate.md` returns `## Verdict: pass`, THE SYSTEM SHALL update the candidate node's `status` to `terminal_pass` in `./scoped/tree.md` via surgical edit and transition to state `solved`.
- **R32**: WHEN `evaluate.md` returns `## Verdict: fail`, THE SYSTEM SHALL update the candidate node's `status` to `terminal_fail` in `./scoped/tree.md` via surgical edit and remain in state `goal_checking`.
- **R33**: IF `evaluate.md` returns a `## Verdict` value that is neither literally `pass` nor literally `fail`, THEN THE SYSTEM SHALL treat the verdict as `fail` (conservative), append a non-blocking `## Pending Questions` entry citing the malformed verdict, and SHALL NOT transition to `waiting_for_user`.
- **R34**: WHEN no nodes match the R28 predicate at `depth == max_depth` AND no node in `./scoped/tree.md` has `status: terminal_pass`, THE SYSTEM SHALL write a `## No Solution Found` MEMORY section listing the count of `terminal_fail` entries and transition state to `done`.

### Termination

- **R35**: WHEN state == `solved`, THE SYSTEM SHALL write a `## Solution` MEMORY section containing (a) the winning arithmetic expression, (b) the total count of nodes ever appended to `./scoped/tree.md`, and (c) the count of nodes whose final `status` is `pruned`. THE SYSTEM SHALL then set state to `done`.
- **R36**: WHEN state transitions to `done`, THE SYSTEM SHALL halt at stack depth 1 (only the strategy frame remains on the call stack).
- **R37**: IF at any point a `pruning` cycle produces zero nodes with `status == live` at `current_depth + 1` (every freshly-generated child failed to enter the top-b for any reason), THEN THE SYSTEM SHALL write a `## No Solution Found` MEMORY section noting the depth at which the dead-end occurred and transition state to `done`.

### `expand-node.md` dynamic contract

- **R38**: THE `expand-node.md` DYNAMIC SHALL declare push-args `parent_thought`, `target`, and `numbers_remaining`, and SHALL fail the push with `unresolved-placeholder` if any are missing at push time.
- **R39**: WHEN invoked, `expand-node.md` SHALL complete in a single cycle (state `empty` → `done`) and SHALL emit a `## Return` block with exactly one key, `children`, whose value is a literal block containing exactly k=5 child entries, each entry consisting of two consecutive lines `op: <expression>` and `left: <space-separated numbers>`.
- **R40**: THE `expand-node.md` DYNAMIC SHALL NOT push any further dynamic; the strategy's stack depth via expand-node SHALL remain at 1 at all times.

### `score.md` dynamic contract

- **R41**: THE `score.md` DYNAMIC SHALL declare push-args `thought` and `target`, and SHALL fail the push with `unresolved-placeholder` if either is missing at push time.
- **R42**: WHEN invoked, `score.md` SHALL complete in a single cycle and SHALL emit a `## Return` block with exactly one key, `value`, whose content is one of the literal strings `sure`, `likely`, or `impossible`.
- **R43**: THE `score.md` DYNAMIC SHALL NOT push any further dynamic; the strategy's stack depth via score SHALL remain at 1 at all times.
- **R44**: IF `score.md` returns a label other than `sure`, `likely`, or `impossible`, THEN THE SYSTEM SHALL treat the label as `impossible` (numeric weight 0.001) when updating the child's value, append a non-blocking `## Pending Questions` entry citing the malformed label, and SHALL NOT transition to `waiting_for_user`.

### `evaluate.md` reuse

- **R45**: THE INTERPRETER SHALL ship `interpreters/3-search/a-tot/dynamics/evaluate.md` as a byte-equal copy of the canonical `interpreters/1-iterative-refinement/b-evaluator-optimizer/dynamics/evaluate.md`.
- **R46**: `src/test/phase-dynamics-identity.test.ts` SHALL be extended to assert byte equality of `evaluate.md` between the canonical location and `interpreters/3-search/a-tot/dynamics/evaluate.md`.

### Robustness — malformed `expand-node.md` output

- **R47**: IF `expand-node.md` returns fewer than 5 well-formed child entries (each having both `op:` and `left:` lines), THEN THE SYSTEM SHALL append the well-formed entries that did parse, append a non-blocking `## Pending Questions` entry naming the count of missing or malformed entries, and continue (treating the parent as having effectively fewer than k=5 children for that expansion). It SHALL NOT transition to `waiting_for_user`.

### Demo PROGRAM.md

- **R48**: THE INTERPRETER SHALL ship a `PROGRAM.md` written as free-form prose describing one Game of 24 puzzle (e.g. "Find an arithmetic expression using 4, 5, 6, and 10 exactly once that evaluates to 24"), from which the strategy SHALL parse exactly four integer numbers and the integer target 24.
- **R49**: THE DEMO `PROGRAM.md` SHALL specify a puzzle for which at least one valid solution exists at `depth == max_depth` (= 3 for four numbers) using only the binary operations `+`, `−`, `×`, `÷` and parentheses.
- **R50**: WHEN run against the demo `PROGRAM.md` to completion, THE SYSTEM SHALL produce all of the following: (a) `./scoped/tree.md` contains at least one block at each of depths 0, 1, 2, and 3; (b) every node at depths 1, 2, and 3 with `status` ≠ `pruned` has `samples == 3`; (c) at each of depths 1, 2, and 3, the count of nodes with `status` in `{live, terminal_pass, terminal_fail}` is at most b=5; and (d) the final MEMORY contains either a `## Solution` section with a valid arithmetic expression evaluating to 24 or a `## No Solution Found` section. Subject to LLM stochasticity, the bundled demo SHALL be a puzzle for which a solution exists, so a successful demo run SHALL produce `## Solution`.

### Validation tests

- **R51**: THE PROJECT SHALL ship `src/test/phase-6-tot.test.ts` covering at minimum: (1) the depth-coverage assertion of R50(a); (2) the b=5 cap of R50(c); (3) the 3-samples-per-scored-node invariant of R50(b); and (4) the assertion that across every snapshot in `history/`, `.call-stack.json` shows `stack.length` ≤ 2.

### Negative requirements (design choices captured)

- **R52**: THE INTERPRETER SHALL NOT use `workspace/` for tree state, frontier state, scoring state, or any per-branch git activity; project-git-per-node integration is explicitly deferred to a later phase (likely Phase 6b LATS or a future code-search demo).
- **R53**: THE INTERPRETER SHALL NOT make k or b configurable in `PROGRAM.md` (both are hardcoded at 5); only `max_depth` is derived dynamically (= len(numbers) − 1).
- **R54**: THE INTERPRETER SHALL NOT introduce a Graph-of-Thoughts variant or any aggregate-edge mechanism; the GoT optional variant from `docs/agent-workflows/requirements.md` § Phase 6 remains out of scope.
- **R55**: THE INTERPRETER SHALL NOT introduce a budget, retry, restart, or early-termination mechanism beyond the BFS schedule defined by k=5, b=5, and max_depth.
- **R56**: THE INTERPRETER SHALL NOT expose any pushed-frame mechanism for accessing the strategy frame's `./scoped/` directory; all interaction between the strategy and pushed dynamics SHALL flow exclusively through `## Push-Args` (in) and `## Return` (out).
- **R57**: THE INTERPRETER SHALL NOT introduce parallel scoring, parallel expansion, or any concurrency primitive; the interpreter executes sequentially under the existing single-threaded shell.

## Out of scope

- Graph of Thoughts (GoT) — flagged as a future sibling under `interpreters/3-search/`; not built here.
- LATS (Phase 6b) — depends on Phase 6 + an MCTS harness that does not yet exist.
- Project-git-per-node branching in `workspace/` — the demo (Game of 24) has no per-branch workspace artefacts, so the integration is speculative until a code-search variant lands.
- Configurability of k or b via PROGRAM.md — both fixed at the paper's values.
- Code-search or test-passing demo — Game of 24 is the only demo in v1.
- Heterogeneous models per dynamic (e.g. cheaper model for `score.md`) — would require per-prompt model selection in the harness, which the shell does not provide.
- Majority-vote (mode) aggregation of value labels — the paper uses weighted sum, and we follow the paper.
- Caching of `score.md` outputs across identical thoughts — the strategy re-pushes 3× per child unconditionally even if the same `left` set has been scored before in a different branch.
- A web-visualiser-specific tree-rendering mode — the existing visualiser walks `history/` snapshots; no ToT-specific UI work in this phase.

## Open questions

(none — all questions surfaced during brainstorming were resolved against the Yao et al. paper and the reference implementation at github.com/princeton-nlp/tree-of-thought-llm)
