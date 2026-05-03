# Requirements: agent-workflows-phase-1

## Context

The repository today ships a single interpreter (`interpreters/game-team/`)
on top of a shell that supports a cycle loop, dynamics (call stack), and
five providers. The plan in `docs/agent-workflows/requirements.md` organises
future interpreter work into phases grouped by the conceptual taxonomy in
`docs/agent-workflows/patterns.md`. This spec implements **Phase 1**: the
three *Iterative Refinement* interpreters (patterns.md Group 1) — the
minimal cases of the generic `generate → critique → revise` loop — and the
three reusable dynamics they share. It is the first phase to exercise the
shell's push/pop machinery with real interpreter code and therefore doubles
as a stress test for the existing stack implementation.

This spec also establishes a directory-layout convention that future phases
will follow: interpreters are grouped under
`interpreters/<group-number>-<group-slug>/` (matching the numbered groups
in patterns.md — the unnumbered "Building blocks — Prompting techniques"
preface is intentionally not represented in the filesystem) and
individually named `<exploration-letter>-<interpreter-slug>/` where
`<exploration-letter>` is the recommended exploration order within the
group (`a`, `b`, `c`, …). Legacy `interpreters/game-team/` stays where it
is — it is scheduled for deletion in Phase 4 and moving it would
contradict R15.

## User stories

- **US1**: As an agent-patterns researcher, I want three runnable
  iterative-refinement interpreters (self-refine, evaluator-optimizer,
  reflexion) so I can directly compare self-critique, external evaluation,
  and verbal-RL on identical programs.
- **US2**: As an interpreter author, I want a small library of reusable
  dynamics (`self-critique.md`, `evaluate.md`, `reflect.md`) with normative
  MEMORY contracts, so later phases can compose them without copy-paste.
- **US3**: As a repo maintainer, I want the shell's push/pop machinery
  exercised by at least one interpreter at stack depth 1, so regressions in
  the stack or `{state}_completed` return pattern surface early.
- **US4**: As a future Phase-2+ author, I want a short notes file that
  captures surprises from Phase 1 implementation, so I can avoid repeating
  the same pain.

## Acceptance criteria (EARS)

Each requirement has a stable ID. R# IDs do not get renumbered across
refinements — additions get the next free number; removals are
struck-through and kept for traceability.

### Interpreters and dynamics present

- **R1**: THE SYSTEM SHALL introduce three new interpreter directories
  under `interpreters/1-iterative-refinement/` (patterns.md Group 1):
  `a-self-refine/`, `b-evaluator-optimizer/`, and `c-reflexion/`, each
  containing at minimum an `INSTRUCTIONS.md` and a demo `PROGRAM.md`.
- **R2**: THE SYSTEM SHALL introduce three reusable dynamics —
  `self-critique.md`, `evaluate.md`, `reflect.md` — each placed under the
  owning interpreter's `operators/` directory (e.g.
  `interpreters/1-iterative-refinement/a-self-refine/operators/self-critique.md`)
  so that
  `./new-instance.sh foo interpreters/1-iterative-refinement/<exploration-letter>-<slug>`
  copies them verbatim into `instances/foo/operators/`.
- **R3**: THE SYSTEM SHALL make the `self-critique.md` dynamic consume
  MEMORY section `## Draft` and produce `## Critique` and `## Refined`
  before setting state `done`, matching the contract listed in
  `docs/agent-workflows/requirements.md`.
- **R4**: THE SYSTEM SHALL make the `evaluate.md` dynamic consume MEMORY
  sections `## Attempt` and `## Criterion` and produce `## Verdict`
  (pass|fail) and `## Feedback` before setting state `done`.
- **R5**: THE SYSTEM SHALL make the `reflect.md` dynamic consume MEMORY
  sections `## Attempt` and `## Verdict` and produce `## Lesson` before
  setting state `done`.
- **R6**: THE SYSTEM SHALL ensure every pushed Phase-1 dynamic returns
  control to its caller via MEMORY state `done`, relying on the shell to
  transition the caller into `{caller_state}_completed`.

### Demo programs and end-to-end execution

- **R7**: THE SYSTEM SHALL ship a demo `PROGRAM.md` in each new
  interpreter directory whose content exercises the interpreter's pattern:
  a short docstring-writing task for `self-refine`, a paragraph-rewriting
  task with an explicit acceptance criterion for `evaluator-optimizer`,
  and a task that genuinely benefits from retries (e.g. a riddle or a code
  task graded against a hidden check) for `reflexion`.
- **R8**: WHEN a user runs
  `./new-instance.sh foo interpreters/1-iterative-refinement/<exploration-letter>-<slug>`
  followed by `instances/foo/run.sh` with `TURING_PROVIDER=claude-code`
  and the default `CC_MODEL`, THE SYSTEM SHALL halt the machine with
  MEMORY state `done` on the shipped demo `PROGRAM.md` without manual
  intervention.
- **R9**: WHERE a demo run halts at `done`, THE SYSTEM SHALL leave
  `history/` containing a coherent snapshot sequence replayable via
  `./visualize.sh <instance>` without runtime error.

### Loop behaviour

- **R10**: THE SYSTEM SHALL NOT encode a hard iteration ceiling in any
  Phase-1 strategy or dynamic; termination of the refinement loop relies
  on the shell's existing retry-on-no-progress and the LLM's own judgment
  that the output is "accepted".
- **R11**: WHILE the `reflexion` demo is running, THE SYSTEM SHALL
  accumulate at least two non-empty entries in MEMORY section
  `## Lessons` across failed attempts before the final halt at `done`.
- **R12**: WHEN the `reflexion` strategy begins any attempt after the
  first, THE SYSTEM SHALL include `## Lessons` in the prompt so the
  accumulated verbal feedback influences the new attempt.

### Shell scope

- **R13**: WHERE implementation surfaces a shell bug that blocks any
  Phase-1 interpreter or dynamic from meeting R1–R12, THE SYSTEM SHALL
  fix the bug within this spec.
- **R14**: THE SYSTEM SHALL defer shell-level refactors and new shell
  features that are not required by R1–R13 to a separate spec; only
  non-breaking, additive improvements (e.g. clearer error messages on a
  missing push target) SHALL be permitted inside this spec.
- **R15**: THE SYSTEM SHALL leave `interpreters/game-team/` functionally
  unchanged: a fresh instance built from it SHALL still run end-to-end as
  it does on the current main branch.

### Tests

- **R16**: THE SYSTEM SHALL add `node:test` unit tests under `src/test/`
  for every new pure-function TypeScript helper introduced by this spec
  (e.g. MEMORY-section parsers or transforms for `## Lessons`,
  `## Verdict`, etc.), mirroring the style of existing tests for
  `memory.ts` and `call-stack.ts`.
- **R17**: THE SYSTEM SHALL add one lightweight integration test per
  Phase-1 interpreter that scripts a MEMORY sequence through the relevant
  push/pop transitions without calling an LLM, asserting that the
  resulting `{caller_state, instructions, stack}` matches the intended
  flow.
- **R18**: WHEN `npm test` is run from the repo root on a clean
  checkout, THE SYSTEM SHALL build and execute the full suite — existing
  and new tests — with zero failures.

### Documentation and consistency

- **R19**: IF the implemented MEMORY contract of `self-critique.md`,
  `evaluate.md`, or `reflect.md` differs from the row listed in the
  dynamics table at the top of `docs/agent-workflows/requirements.md`,
  THEN THE SYSTEM SHALL update that table in the same change set.
- **R20**: THE SYSTEM SHALL update `CLAUDE.md`'s "Existing interpreters"
  subsection to list `self-refine`, `evaluator-optimizer`, and
  `reflexion` with a one-line description each pointing at
  `docs/agent-workflows/patterns.md` Group 1.
- **R21**: THE SYSTEM SHALL add `docs/agent-workflows/phase-1-notes.md`
  summarising anything surprising discovered during implementation; if
  nothing was surprising, the file SHALL state that explicitly in one
  line, so future phases can still locate the note.

### Error handling

- **R22**: IF a Phase-1 demo run exhausts the shell's retry budget
  without advancing state, THEN THE SYSTEM SHALL exit via the existing
  retry-exhaustion code path (no new error surface introduced by this
  spec), leaving MEMORY and `history/` inspectable for debugging.

### Directory layout convention

- **R23**: THE SYSTEM SHALL place every new interpreter introduced by
  this spec (and, by precedent, every future phase) under
  `interpreters/<group-number>-<group-slug>/<exploration-letter>-<interpreter-slug>/`,
  where `<group-number>`/`<group-slug>` reference the numbered groups in
  `docs/agent-workflows/patterns.md` (the unnumbered "Building blocks —
  Prompting techniques" preface is intentionally not represented in the
  filesystem) and `<exploration-letter>` is the recommended exploration
  order within the group (`a`, `b`, `c`, …), so that implementation order
  sorts lexically and the taxonomy is visible in the filesystem.
- **R24**: WHERE `interpreters/game-team/` exists at the repository root
  outside the convention defined by R23, THE SYSTEM SHALL leave it at
  that path (exempt from R23) because it is scheduled for deletion in
  Phase 4 — see R15.

## Out of scope

- **Chain-of-Verification (CoVe)** and any interpreter requiring stack
  depth ≥ 2 — covered by Phase 2 (`interpreters/cove/`).
- **Skill library** (`invoke-skill.md`, `install-skill.md`,
  `workspace/skills/`) — introduced in Phase 3a per the plan.
- **Any interpreter from Phases 3–8** (plan-execute, orchestrator-workers,
  deep-research, metagpt, chatdev, debate, moa, tot, lats, aflow-lite,
  adas-lite) and their associated dynamics.
- **Retirement of `interpreters/game-team/`** — handled in Phase 4.
- **Hard iteration caps** in strategies or dynamics (explicitly rejected
  above — see R10).
- **Providers other than Claude Code** for demo acceptance. Phase 1
  demos SHOULD remain readable / runnable on other providers but those
  are not acceptance gates.
- **MemGPT-style memory, curated ACI tool surface, DSPy-style prompt
  compilation, parallel stack frames** — listed as "Open questions /
  future shell work" in `docs/agent-workflows/requirements.md`, not part
  of any current phase.
- **New providers, new shell features beyond R14**, refactors of
  `src/main.ts` that are not strictly necessary for R1–R22.

## Open questions

- **OQ1**: What exact content goes in the `reflexion` demo `PROGRAM.md`?
  Several credible options (a riddle graded by the evaluator; a Python
  function graded against a hidden `workspace/tests/` suite; a small
  maze-routing program with a deterministic scorer). The choice affects
  how the evaluator's `## Criterion` is phrased and where the pass/fail
  signal comes from. Deferred to Phase 2 (Design).
- **OQ2**: Where does `evaluator-optimizer`'s acceptance criterion
  physically live — in `PROGRAM.md`, parsed into `## Criterion` by the
  strategy on first cycle, or embedded in the evaluator dynamic's prompt?
  Either works; pick one in Design so the three demos stay consistent.
- **OQ3**: Should the three interpreters share a common TypeScript
  helper for parsing their strategy-level MEMORY sections (e.g. a
  `parseLessons` analogue to `parsePush`), or should each interpreter
  reuse the generic `parseState` / `parseSection` helpers already in
  `src/memory.ts`? Affects what counts as "new pure-function TS" under
  R16. Deferred to Phase 2 (Design).
