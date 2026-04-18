# Agentic workflow interpreters — implementation plan

What to build on top of the current shell (cycle loop + call stack) to cover
the agentic-pattern landscape. Read `patterns.md` first for the conceptual
taxonomy — this document is the implementation projection of that taxonomy
onto the repo.

The plan is organised **by conceptual group**, with phases within a group
ordered from simplest to most nested. Each phase produces one or more
interpreters that run on their own, and each group harvests its dynamics for
reuse by later groups.

## Guiding principles

1. **Dynamics are the reuse unit.** Anything that recurs across interpreters
   (critique, evaluation, reflection, verification, planning, role-play)
   lives as a dynamic and is copied into every instance. Interpreters
   orchestrate dynamics; they do not reimplement them.
2. **Group-first, phase-second.** Build an entire conceptual group before
   moving to the next one. Within a group, start with the variant that needs
   the fewest new dynamics.
3. **Retire `interpreters/game-team` deliberately** in Phase 4. That phase
   exists for this purpose.
4. **Every interpreter ships with a demo `PROGRAM.md`** so a user can run it
   via `./new-instance.sh foo interpreters/<name>`.
5. **No speculative dynamics.** If something would only be used by one
   interpreter, inline it. Promote to `dynamics/` only on second use.

## Group order and prerequisites

| Group from patterns.md | Covered in | Needs |
|---|---|---|
| 2 — Iterative refinement | Phase 1, Phase 2 | — |
| 3 — Planning & decomposition | Phase 3 | `evaluate.md` from Phase 1 |
| 6 — Fixed-SOP teams | Phase 4 (game-team retirement) | `evaluate.md` |
| 5 — Peer collaboration | Phase 5 | `reflect.md` from Phase 1 |
| 4 — Search | Phase 6 | `evaluate.md` |
| 8 — Meta-frameworks | Phase 7 (+ optional Phase 8) | everything |

Groups 1 (prompting techniques), 7 (dynamic teams), and 9 (libraries) are
**not built as interpreters** — see "Out of scope" at the bottom.

## Reusable dynamics library

Built up progressively. Each lives under `interpreters/<name>/dynamics/` and
is copied wholesale by `new-instance.sh`. Names and contracts are normative.

| Dynamic | Introduced in | MEMORY in | MEMORY out | Stack depth |
|---|---|---|---|---|
| `self-critique.md` | 1a | `## Draft` | `## Critique`, `## Refined` | 1 |
| `evaluate.md` | 1b | `## Attempt`, `## Criterion` | `## Verdict`, `## Feedback` | 1 |
| `reflect.md` | 1c | `## Attempt`, `## Verdict` | `## Lesson` | 1 |
| `verify.md` | 2 | `## Draft` | `## Verification Questions`, `## Revised` | 2 |
| `answer-independently.md` | 2 | `## Question` | `## Answer` | 1 |
| `plan.md` | 3a | `## Goal` | `## Plan` | 1 |
| `execute-step.md` | 3a | `## Current Step`, `## Context` | `## Step Result` | 1+ (may re-push plan) |
| `worker.md` | 3b | `## Current Subtask` | `## Subtask Result` | 1 |
| `investigate.md` | 3c | `## Sub-question` | `## Finding` | N (recursive) |
| `synthesize.md` | 3c | `## Findings` | `## Report` | 1 |
| `role-<name>.md` | 4a | prior role's section | this role's section | 1 |
| `dialogue.md` | 4b | `## Topic`, `## Participants` | `## Conclusion` | 1 |
| `opine.md` | 5 | `## Question`, `## Round` | `## Opinion` (appended) | 1 |
| `expand-node.md` | 6 | `## Parent Thought` | `## Children`, `## Value` | N |
| `evaluate-workflow.md` | 7 | `## Candidate Workflow` | `## Score`, `## Trace` | 2 |

---

## Phase 1 — Iterative refinement (patterns.md Group 2)

Three interpreters that are **variants of the same architectural pattern**:
`generate → critique → revise`. Built together because they share dynamics
by design.

### 1a. `interpreters/self-refine/`

The minimal case. One role critiques its own output.

- States: `empty → drafted → refined → done`.
- Dynamic: `self-critique.md` — pushed when `drafted`, returns `## Critique`
  and `## Refined`, sets state `done`.
- Demo `PROGRAM.md`: write a concise function docstring.
- **Validation:** loops drafted↔refined at least twice before critique says
  "accepted".

### 1b. `interpreters/evaluator-optimizer/`

Two roles, no memory across iterations.

- States: `empty → drafted → evaluated → (revise|done)`.
- Dynamic: `evaluate.md` — generic, takes `## Attempt` and `## Criterion`,
  returns `## Verdict` (pass/fail) + `## Feedback`.
- **Reuse:** strategy-level only; no dynamic is shared with 1a because the
  critic/self-critic framing genuinely differs (external feedback vs.
  self-edit). They do share scaffolding helpers at the source level.
- Demo `PROGRAM.md`: translate a paragraph to a target register (e.g.
  technical → plain language) with a clear acceptance criterion.

### 1c. `interpreters/reflexion/`

Evaluator–Optimizer **plus** episodic memory of verbal lessons. This is the
key upgrade.

- States: `empty → attempting → evaluated → reflecting → attempting → … → done`.
- **Reuses:** `evaluate.md` from 1b verbatim.
- New dynamic: `reflect.md` — takes `## Attempt` and `## Verdict`, returns
  `## Lesson`, appended to `## Lessons` (persisted across attempts).
- Strategy reads `## Lessons` before each attempt.
- Demo `PROGRAM.md`: a task that genuinely benefits from retries (a riddle;
  code that must pass a hidden test suite).
- **Validation:** at least two failed attempts with distinct lessons
  accumulated; third attempt shows material improvement referencing a
  prior lesson.

### Why the three together

Building 1b before 1c is what lets 1c reuse `evaluate.md`. Building 1a first
validates push/pop at depth 1 before anything else is attempted.

---

## Phase 2 — Chain-of-Verification (patterns.md Group 2, nested variant)

Still iterative refinement, but the critique step is *decomposed* into
independent verification Q&A. First interpreter that requires **stack depth
2**, so it doubles as a snapshot/restore stress test for the shell.

**Deliverable:** `interpreters/cove/`.

- Strategy: drafter emits a factual claim, pushes `verify.md`.
- New dynamic: `verify.md` — generates N verification questions, for each
  pushes `answer-independently.md`, collects answers, emits `## Revised`.
- New dynamic: `answer-independently.md` — answers one question with no
  access to the draft.
- Demo `PROGRAM.md`: a question where hallucination is likely ("list the
  authors of paper X and their affiliations").
- **Reuse:** none. Both dynamics are new.
- **Validation:** mid-verify, `.call-stack.json` contains two frames.

---

## Phase 3 — Planning & decomposition (patterns.md Group 3)

Three interpreters. Built together because Plan-and-Execute's dynamics
(`plan.md`, `execute-step.md`) are consumed by Orchestrator–Workers and
Deep Research.

### 3a. `interpreters/plan-execute/`

Linear plan, sequential execution, replanning on failure.

- Strategy: planner/replanner holding `## Plan`.
- New dynamic: `plan.md` — produces an ordered step list for `## Goal`.
- New dynamic: `execute-step.md` — executes one step. May re-push `plan.md`
  if the step is too coarse (recursion) or push `evaluate.md` as a step-
  acceptance gate.
- **Reuse:** `evaluate.md` from 1b.
- Demo `PROGRAM.md`: set up a Python project with tests and CI config.
- **Validation:** log shows at least one replan triggered by a step failure.

### 3b. `interpreters/orchestrator-workers/`

Dynamic fan-out with generic workers.

- Strategy: orchestrator holds `## Subtasks` (decomposed on the fly per
  task) and `## Results`. Pushes `worker.md` per subtask in sequence,
  synthesises.
- New dynamic: `worker.md` — receives `## Current Subtask`, returns
  `## Subtask Result`. Internally pushes `execute-step.md` for executable
  subtasks, otherwise runs a reasoning loop.
- **Reuse:** `execute-step.md` from 3a.
- Demo `PROGRAM.md`: analyse 5 files in `workspace/inputs/` and produce a
  unified summary.

### 3c. `interpreters/deep-research/`

Recursive decomposition producing a report.

- Strategy: researcher holds `## Open Questions` and `## Findings`.
- New dynamic: `investigate.md` — may push itself recursively when a
  sub-question is still too broad.
- New dynamic: `synthesize.md` — writes the final report to
  `workspace/report.md`.
- **Reuse:** none directly from 3a/3b (the questions are not plans).
- Demo `PROGRAM.md`: an open research prompt ("compare approaches X, Y, Z
  for problem P").

---

## Phase 4 — Fixed-SOP teams (patterns.md Group 6) — **replaces game-team**

Two interpreters, one task. The same demo `PROGRAM.md` should run on both so
outputs are comparable. This phase exists specifically to retire
`interpreters/game-team`.

### 4a. `interpreters/metagpt/`

Document hand-off between roles.

- Strategy: SOP sequencer walking PM → Architect → Engineer → QA.
- New dynamics: `role-pm.md`, `role-architect.md`, `role-engineer.md`,
  `role-qa.md` — each reads the prior role's MEMORY section, writes its own.
- Typed hand-off sections: `## PRD`, `## Design`, `## Tasks`, `## Code Review`.
- **Reuse:** QA role pushes `evaluate.md` from 1b.
- Demo `PROGRAM.md`: build a small CLI tool.

### 4b. `interpreters/chatdev/`

Phase-dialogue between role pairs.

- Strategy: phase sequencer (design, coding, testing, documenting).
- New dynamic: `dialogue.md` — parameterised by `## Participants` and
  `## Topic`; pairs like CEO↔CTO, coder↔reviewer.
- Role descriptions in `roles/*.md` referenced from MEMORY.
- **Reuse:** reviewer pairs push `evaluate.md`.
- Demo `PROGRAM.md`: the **same** CLI tool as 4a.

### Retirement checklist

1. Run both 4a and 4b end-to-end on their shared demo.
2. Delete `interpreters/game-team/`.
3. Update `CLAUDE.md` "Existing interpreters": remove game-team, add entries
   for `metagpt` and `chatdev` describing the document-hand-off vs.
   phase-dialogue distinction.
4. Update `README.md` examples that reference game-team.
5. Confirm the shell-level features game-team exercised — fuzzy NL
   conditions, non-blocking `## Pending Questions`, `## Push` from
   strategy — are still exercised by 4a/4b. These belong to the shell, not
   to any interpreter, and must not regress.

---

## Phase 5 — Peer collaboration (patterns.md Group 5)

Single interpreter. CAMEL is skipped (two-role conversation adds little over
4b's dialogue dynamic).

**Deliverable:** `interpreters/debate/`.

- Strategy: round coordinator. Runs R rounds; each round pushes `opine.md`
  for each of N agents with distinct personas.
- New dynamic: `opine.md` — appends to `## Opinions` list.
- **Reuse:** between rounds, coordinator may push `reflect.md` from 1c to
  nudge agents off stuck points.
- Demo `PROGRAM.md`: an ambiguous-answer question ("Postgres or SQLite for
  use case U?").

---

## Phase 6 — Search (patterns.md Group 4)

Deepest stack in the codebase before the meta-framework. First meaningful
use of the per-instance project git for parallel-branch snapshots.

**Deliverable:** `interpreters/tot/` (Tree of Thoughts).

- Strategy: search controller holding the frontier and visited set in MEMORY.
- New dynamic: `expand-node.md` — generates k children, evaluates each,
  pops with scored children. Recursive per best child (BFS or DFS).
- Project-git integration: each ToT branch gets a git branch in
  `workspace/`; the controller `checkout`s before expanding so siblings
  don't share state.
- **Reuse:** `evaluate.md` from 1b.
- Demo `PROGRAM.md`: Game of 24 or a small code-search problem.

---

## Phase 7 — Meta-framework (patterns.md Group 8)

The framework composes earlier interpreters as candidate workflows. Requires
everything below to already work.

**Deliverable:** `interpreters/aflow-lite/`.

- Strategy: MCTS controller over a library of Operators (Ensemble, Review,
  Revise, …) seeded from earlier phases. Tree persisted in MEMORY
  (`## MCTS Tree`).
- New dynamic: `evaluate-workflow.md` — materialises a candidate workflow
  as a throwaway `INSTRUCTIONS.md` in `workspace/candidates/NNN/`, launches
  it via a nested shell invocation (same binary, different instance dir),
  collects the score from its final MEMORY.
- **Reuse:** operator library seeded from 1a (self-refine), 1c (reflexion),
  3b (orchestrator-workers), 5 (debate).
- Demo `PROGRAM.md`: a small automatically-scorable benchmark (a subset of
  GSM8K or HumanEval).

---

## Phase 8 (optional) — Meta-agent (patterns.md Group 8, ADAS flavour)

A meta-interpreter that **writes new interpreter `INSTRUCTIONS.md` files** in
code, tests them, archives the strong ones. Philosophically the closest match
to the Turing-machine premise (machine writes its own program) and the
logical end-state of the project.

**Deliverable:** `interpreters/adas-lite/`. Only attempted after Phase 7 is
running cleanly on at least one benchmark.

---

## Out of scope for this plan

- **Group 1 (Prompting techniques)** — CoT and Self-Consistency are single
  LLM calls, not agent designs. They are prompt affordances available to any
  interpreter and do not warrant their own.
- **Group 7 (Dynamic teams)** — AgentVerse, AutoAgents, XAgents (plural).
  AgentVerse and AutoAgents are covered **in spirit** by Phase 3b + Phase 7
  (dynamic decomposition + operator library). XAgents (plural, rule-based
  IF-THEN) clashes with the shell's fuzzy-NL-condition design and is not
  pursued.
- **Group 9 (Libraries)** — AutoGen and Superpowers are infrastructure, not
  interpreters. Superpowers' skill *content* (4-phase systematic debugging,
  TDD methodology) is a good source to mine when building dynamics for
  Phase 4b (ChatDev coder↔reviewer pair) — but no "Superpowers interpreter"
  will be built.
- **EvoAgentX, DyLAN** — supersets of Phase 7/8 in scope; revisit only if a
  specific research question requires them.
- **Parallel worker execution.** Today the shell pops sequentially. Several
  phases (3b orchestrator, 5 debate, 6 ToT) would benefit from parallel
  frames. This is a **shell change**, not an interpreter change, and is
  tracked separately.

---

## Definition of done (per phase)

Each phase is complete when:

1. Every interpreter in the phase runs its demo `PROGRAM.md` to
   `state: done` on a default provider (Claude Code or Anthropic API)
   without manual intervention.
2. `history/` contains a coherent snapshot sequence that replays in the
   visualiser.
3. `CLAUDE.md` "Existing interpreters" is updated to list the new
   interpreters with one-line descriptions pointing at their conceptual
   group in `patterns.md`.
4. Any new dynamic introduced in the phase has an entry in the table at
   the top of this document, matching its actual MEMORY contract.
5. A one-paragraph note is added to a sibling `notes.md` describing
   anything surprising discovered during implementation, so the next
   phase can avoid the same pain.
