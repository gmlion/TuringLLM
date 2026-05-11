# Requirements: agent-workflows Phase 2 — Chain-of-Verification

## Context

Phase 2 of the agent-workflows roadmap (see
`docs/agent-workflows/requirements.md` §Phase 2). Introduces the fourth
variant in patterns.md Group 1 (iterative refinement): **Chain-of-
Verification** (Dhuliawala et al., Meta, 2023). This is the first
interpreter in the project that requires stack depth 2 — its
`verify.md` dynamic pushes `answer-independently.md` once per
verification question — so it also doubles as a stress test for the
shell's push/pop machinery.

Brainstorming surfaced that the project's existing conflation of
MEMORY-as-heap and MEMORY-as-call-payload is load-bearing only by
accident. Phase 2 resolves this by adding a first-class
**arguments-via-INSTRUCTIONS** mechanism: `## Push-Args` + `{{var}}`
substitution at push time. The new convention retires "prompt trust"
as a design primitive (the original Dhuliawala CoVe requires the
verifier to have no access to the draft; our shell had no structural
way to guarantee that). The convention is broadly useful, so Phase 2
also retrofits the existing `a`/`b`/`c` dynamics onto it — otherwise
we'd ship a one-off for CoVe.

The demo program is a four-person knights-and-knaves puzzle whose
first-pass reasoning genuinely drifts on frontier models, making the
decomposed critique visibly valuable in a live run.

## User stories

- **US1**: As a user of the project, I want Chain-of-Verification
  available as `interpreters/mas-papers/1-iterative-refinement/d-cove/`, so that
  all four Group 1 patterns from `patterns.md` are implemented.
- **US2**: As an interpreter author, I want the shell to support
  arguments-via-INSTRUCTIONS (`## Push-Args` + `{{var}}`), so that a
  dynamic can receive per-call inputs without depending on MEMORY
  sections that may leak caller state.
- **US3**: As a maintainer, I want the existing dynamics
  (`self-critique.md`, `evaluate.md`, `reflect.md`) refactored onto
  the new convention, so the arguments-vs-heap separation is
  consistent across Group 1 and there is no one-off special case.
- **US4**: As a user running the `d-cove` demo, I want the fan-out
  into independent verifications to actually exercise stack depth 2
  (N > 1 verification children) on a task where the draft is
  observably improved, so the pattern's value is visible end-to-end.
- **US5**: As a future interpreter author, I want `## Push-Args` and
  the substitution contract documented in `CLAUDE.md` alongside the
  existing `## Push` docs, so I can use the convention without
  reverse-engineering `call-stack.ts`.

## Acceptance criteria (EARS)

### Shell support for arguments-via-INSTRUCTIONS

- **R1**: THE SYSTEM SHALL parse an optional `## Push-Args` section in
  MEMORY that immediately follows `## Push`. Each non-empty line SHALL
  be a single `key: value` pair (YAML-style, no nesting, no quoting
  required). Values MAY span multiple lines via folded/literal
  indentation rules compatible with YAML 1.2 block scalars.
- **R2**: WHEN a push succeeds and `## Push-Args` is present, THE
  SYSTEM SHALL substitute every `{{key}}` occurrence in the loaded
  target file with the corresponding value before installing the
  result as the new `INSTRUCTIONS.md`.
- **R3**: IF, after substitution, the resulting INSTRUCTIONS string
  still contains any unresolved `{{<identifier>}}` placeholder, THEN
  THE SYSTEM SHALL treat the push as failed: strip `## Push` and
  `## Push-Args` from MEMORY, log the error, leave the caller's stack
  and INSTRUCTIONS unchanged (same failure semantics as missing-target
  today, per `applyPush`'s `missing-target` branch).
- **R4**: WHEN a push succeeds, THE SYSTEM SHALL strip both `## Push`
  and `## Push-Args` from MEMORY (aligning `## Push-Args`'s lifecycle
  with `## Push`'s today).
- **R5**: WHEN `## Push` is present without `## Push-Args`, THE SYSTEM
  SHALL load the target file verbatim with no substitution attempted,
  preserving today's behaviour exactly.
- **R6**: THE push-args parsing, substitution, and failure semantics
  of R1–R5 SHALL live as pure transforms in `src/call-stack.ts` and
  be unit-tested independently of the shell's main loop, matching the
  style of the existing `applyPush` / `applyPop` tests.

### Retrofit of a/b/c dynamics onto the new convention

- **R7**: THE `self-critique.md` dynamic at
  `interpreters/mas-papers/1-iterative-refinement/a-self-refine/operators/` SHALL
  be refactored to receive the draft as `{{draft}}` (not by reading
  `## Draft` from MEMORY), and SHALL continue to emit `## Critique`
  and `## Refined` to MEMORY with the same contract the caller reads.
- **R8**: THE `evaluate.md` dynamic SHALL be refactored to receive
  `{{attempt}}` and `{{criterion}}` as arguments, and SHALL continue
  to emit `## Verdict` (literal `pass` or `fail`) and `## Feedback` to
  MEMORY with the same contract the caller reads.
- **R9**: THE `reflect.md` dynamic at
  `interpreters/mas-papers/1-iterative-refinement/c-reflexion/operators/` SHALL be
  refactored to receive `{{attempt}}`, `{{verdict}}`, and `{{feedback}}`
  as arguments, and SHALL continue to emit `## Lesson` to MEMORY with
  the same contract the caller reads.
- **R10**: WHEN the `a`/`b`/`c` strategies push a refactored dynamic,
  they SHALL emit a `## Push-Args` section containing every argument
  the dynamic declares, populated from the caller's current MEMORY
  state (e.g. `a` reads its own `## Draft` heap section and forwards
  its value as `draft: …` in `## Push-Args`).
- **R11**: THE byte-equality invariant between
  `b-evaluator-optimizer/operators/evaluate.md` and
  `c-reflexion/operators/evaluate.md` SHALL be preserved after the
  retrofit; `src/test/phase-1-dynamics-identity.test.ts` SHALL
  continue to pass without modification to its assertions.
- **R12**: THE existing Phase-1 integration tests
  (`src/test/phase-1-self-refine.test.ts`,
  `phase-1-evaluator-optimizer.test.ts`,
  `phase-1-reflexion.test.ts`) SHALL be updated to match the new push
  payload shape (emitting `## Push-Args` alongside the synthesised
  `## Push`), SHALL continue to cover every pattern behaviour they
  cover today, and SHALL pass under `npm test`.
- **R13**: THE retrofit SHALL NOT modify the MEMORY contract of any
  output section produced by a dynamic (`## Critique`, `## Refined`,
  `## Verdict`, `## Feedback`, `## Lesson`). Only per-call *inputs*
  migrate from MEMORY sections to `## Push-Args` arguments.

### New CoVe interpreter: `d-cove`

- **R14**: THE SYSTEM SHALL deliver the Chain-of-Verification
  interpreter at `interpreters/mas-papers/1-iterative-refinement/d-cove/` with
  `INSTRUCTIONS.md`, `PROGRAM.md`, a `operators/` directory containing
  `verify.md` and `answer-independently.md`, and a `README.md` in the
  same format as the sibling `a`/`b`/`c` leaf READMEs (literature
  citation, state machine, dynamics table, demo description, run-it
  instructions, known behaviour).
- **R15**: THE `d-cove` strategy SHALL be **one-shot**: Initialize →
  produce draft → push `verify.md` → on pop, emit the final revised
  answer → halt. THERE SHALL BE no iteration loop that re-enters the
  verification step against the same or a revised draft. (Iteration
  is scope for a future hybrid pattern, not Phase 2.)
- **R16**: `verify.md` SHALL generate **N > 1** verification
  questions from the draft, SHALL push `answer-independently.md` once
  per question with `## Push-Args` containing exactly the per-question
  inputs needed for independent re-derivation, SHALL collect each
  child's `## Answer` from MEMORY after pop, and SHALL emit a
  `## Revised` section in MEMORY based on the aggregated answers
  before setting state to `done`.
- **R17**: `verify.md`'s `## Push-Args` payload SHALL NOT contain the
  draft's prose or the draft's chain of reasoning. Only the specific
  inference step under verification and the minimum premise context
  required to evaluate it independently SHALL be passed. (Premises
  that live in PROGRAM.md — which is shared public context — do not
  need to be duplicated into arguments.)
- **R18**: `answer-independently.md` SHALL be a single-instruction
  dynamic. Its Action SHALL direct the LLM to answer the passed
  question using only its arguments and PROGRAM.md, write the result
  to `## Answer` in MEMORY, and set state to `done`. Its instruction
  text SHALL NOT reference or read any MEMORY section produced by the
  caller (no `## Draft`, `## Verifications`, etc.).
- **R19**: THE `d-cove` `PROGRAM.md` SHALL pose the four-person
  knights-and-knaves puzzle whose premises are:
  - Alice: "Bob and I are of different types."
  - Bob: "Carol is a knave."
  - Carol: "Dan is a knight."
  - Dan: "Alice is a knave."
  and whose unique solution is Alice=knave, Bob=knave, Carol=knight,
  Dan=knight.
- **R20**: WHILE `verify.md` has pushed an `answer-independently.md`
  child but has not yet popped it, `.call-stack.json` SHALL contain
  exactly two frames. A scripted test SHALL assert this invariant
  using `applyPush` in isolation (no live LLM required).

### Documentation

- **R21**: `CLAUDE.md` SHALL document `## Push-Args` and the `{{var}}`
  substitution convention in its "Dynamics (Call Stack)" section,
  covering the parse format, the failure mode for unresolved
  placeholders, and the rule that no-args behaviour is unchanged from
  today.
- **R22**: `interpreters/mas-papers/1-iterative-refinement/README.md` SHALL be
  updated to list `d-cove` as the fourth entry in its comparison
  table, to remove the "coming next" placeholder for Phase 2, and to
  describe the arguments-via-INSTRUCTIONS convention at the group
  level (since it governs how all four dynamics in the group exchange
  data).
- **R23**: `docs/agent-workflows/requirements.md` §Phase 2 SHALL be
  updated to reference the final path
  (`interpreters/mas-papers/1-iterative-refinement/d-cove/`), to replace the
  "Reuse: none" note with a description of the arguments-via-
  INSTRUCTIONS convention as the cross-cutting deliverable introduced
  by this phase, and to list the a/b/c retrofit as part of the phase.
- **R24**: THE SYSTEM SHALL add `docs/agent-workflows/phase-2-notes.md`
  summarising anything surprising discovered during implementation; if
  nothing was surprising, the file SHALL state that explicitly in one
  line, matching the convention established by `phase-1-notes.md`.

### Validation and regression

- **R25**: WHEN `npm test` runs after Phase 2, all 82 pre-existing
  Phase-1 tests SHALL pass, AND the test suite SHALL gain scripted
  coverage for: (a) R2–R5 push-args parsing and substitution, (b) R3
  unresolved-placeholder failure path, (c) R20 stack-depth-2
  invariant, and (d) a scripted end-to-end `d-cove` integration test
  analogous to the existing `phase-1-*.test.ts` style.
- **R26**: WHEN the `d-cove` live demo runs end-to-end against the
  default provider (claude-code with Haiku), the machine SHALL halt
  at `## State: done` with a `## Revised` section present in MEMORY
  and the `history/` directory SHALL contain at least one snapshot
  whose `.call-stack.json` has two frames, evidencing the depth-2
  execution path.
- **R27**: IF a Phase-2 demo run exhausts the shell's retry budget
  without advancing state, THEN THE SYSTEM SHALL exit via the
  existing retry-exhaustion code path (no new error surface
  introduced), leaving MEMORY and `history/` inspectable for
  debugging — matching Phase 1's R22 behaviour.

## Out of scope

- **Iteration on `d-cove`**. If `## Revised` is still wrong after one
  verification pass, the run halts with that output. A future hybrid
  pattern (CoVe + Evaluator–Optimizer, tentatively "Phase 2b") would
  add an acceptance loop; Phase 2 does not.
- **Shell-level memory isolation** (e.g. `## Push-Expose` allow-lists,
  hiding caller MEMORY sections from children). Obsoleted by
  arguments-via-INSTRUCTIONS: the child's code doesn't reference the
  caller's sections, so there is nothing to hide.
- **Migration of existing instances under `instances/`**. Existing
  instances carry their strategy text and dynamics verbatim as
  snapshots from the time they were created; the retrofit is a
  source-tree change only.
- **Changes to any existing directory name or to the interpreter
  layout convention** established in Phase 1.
- **Promotion of `evaluate.md` (or any other dynamic) to a
  shared-dynamics folder**. The arguments-via-INSTRUCTIONS convention
  reduces the cost of duplication (byte-equal copies are still
  acceptable), so the shared-folder refactor remains deferred to
  whenever a fourth consumer emerges. (See Phase-1 `design.md` OQ4.)
- **Any change to PROGRAM.md semantics or the strategy-section
  preservation rule** (`IMPORTANT: …`). Strategies continue to copy
  their strategy section verbatim on every `update_instructions`
  call.

## Open questions

(none — the brainstorming resolved iteration shape, reuse mechanism,
isolation mechanism, and demo content. Any remaining ambiguity is
design-level, not requirements-level, and will be resolved in Phase
2's design document.)
