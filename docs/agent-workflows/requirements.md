# Agentic workflow interpreters — implementation plan

What to build on top of the current shell (cycle loop + call stack) to cover
the agentic-pattern landscape surveyed in `research.md`.

This plan is intentionally incremental. Each phase produces an interpreter
that runs on its own, and each phase harvests reusable dynamics from prior
phases so later interpreters stay small.

## Guiding principles

1. **Dynamics are the reuse unit.** Anything that recurs across interpreters
   (self-critique, evaluation, verification, planning, role-play) lives as a
   dynamic and is copied into every instance. Interpreters orchestrate
   dynamics; they do not reimplement them.
2. **Start small, climb the L-axis.** Build L0 dynamics first, then L1
   interpreters that consume them, then L2–L5, and only then L6 meta-frameworks
   that compose earlier interpreters.
3. **Retire `interpreters/game-team` deliberately.** Its slot is covered by
   the L4 and L5 phases below. Deletion happens when at least one L4
   interpreter exists and the README no longer references game-team.
4. **Every interpreter ships with a demo PROGRAM.md** so a user can run it
   immediately via `./new-instance.sh foo interpreters/<name>`.
5. **No speculative features.** If a dynamic would only be used by one
   interpreter, inline it. Promote to `dynamics/` only on second use.

---

## Reusable dynamics library

Built up progressively. Each lives under `interpreters/<name>/dynamics/` and
is copied wholesale by `new-instance.sh`. Names and contracts below are
normative.

| Dynamic | Introduced in phase | MEMORY in | MEMORY out | Stack depth |
|---|---|---|---|---|
| `self-critique.md` | 1 | `## Draft` | `## Critique`, `## Refined` | 1 |
| `evaluate.md` | 2 | `## Attempt`, `## Criterion` | `## Verdict`, `## Feedback` | 1 |
| `reflect.md` | 2 | `## Attempt`, `## Verdict` | `## Lesson` | 1 |
| `verify.md` | 3 | `## Draft` | `## Verification Questions`, `## Revised` | 2 |
| `plan.md` | 4 | `## Goal` | `## Plan` (ordered steps) | 1 |
| `execute-step.md` | 4 | `## Current Step`, `## Context` | `## Step Result` | 1+ (may re-push plan) |
| `worker.md` | 6 | `## Current Subtask` | `## Subtask Result` | 1 |
| `role-<name>.md` | 5 | phase-specific doc section | next phase-specific doc section | 1 |
| `dialogue.md` | 5 | `## Topic`, `## Participants` | `## Conclusion` | 1 |
| `opine.md` | 6 | `## Question`, `## Round` | `## Opinion` (appended) | 1 |
| `investigate.md` | 6 | `## Sub-question` | `## Finding` | N (recursive) |
| `synthesize.md` | 6 | `## Findings` | `## Report` | 1 |
| `expand-node.md` | 7 | `## Parent Thought` | `## Children`, `## Value` | N (search depth) |
| `evaluate-workflow.md` | 8 | `## Candidate Workflow` | `## Score`, `## Trace` | 2 |

---

## Phase order

Phases 1–3 build foundation. Phase 4 is the first real useful interpreter.
Phase 5 retires game-team. Phases 6–7 cover the sweet spot. Phase 8 is the
ambitious finale.

### Phase 1 — Self-Refine (L0/L1 smoke test)

**Why first.** Minimal push/pop, 1-frame stack, validates the shell's dynamic
machinery end-to-end. If this doesn't work, nothing later will.

**Deliverable:** `interpreters/self-refine/`.

**What to implement:**
- `INSTRUCTIONS.md` with states `empty → drafted → refined → done`.
- `dynamics/self-critique.md` — pushed when state is `drafted`, returns
  `## Critique` and `## Refined` in MEMORY, sets state `done`.
- A demo `PROGRAM.md` with a short writing/coding task (e.g. "write a
  concise function doc").

**Reuse:** none (it's the base).

**Validation:** the interpreter should loop drafted↔refined at least twice
before the critique says "accepted", then reach `done`.

---

### Phase 2 — Reflexion (L1)

**Why next.** Introduces the actor/evaluator/reflect triad that everything
higher up reuses. Also the first interpreter that keeps cross-attempt memory.

**Deliverable:** `interpreters/reflexion/`.

**What to implement:**
- Strategy: Actor loop that reads `## Lessons` before each attempt.
- `dynamics/evaluate.md` — generic, takes `## Attempt` and `## Criterion`,
  returns `## Verdict` (pass/fail) + `## Feedback`.
- `dynamics/reflect.md` — takes `## Attempt` and `## Verdict`, returns
  `## Lesson`, appended to `## Lessons`.
- Demo PROGRAM.md with a task that benefits from retries (e.g. "solve this
  riddle" or "write code passing these tests").

**Reuse:** `self-critique.md` is *not* reused — Reflexion's evaluator is a
distinct role from a self-critic, and collapsing them muddles the pattern.
They can share scaffolding code (prompt builder helpers) but live as
separate dynamic files.

**Validation:** at least two failed attempts in logs with distinct lessons
accumulated; third attempt should materially improve.

---

### Phase 3 — Chain-of-Verification (L0 with nesting)

**Why now.** First interpreter requiring **depth-2 stack** (verify.md pushes
answer-independently.md per question). Stress-tests the snapshot/restore of
nested frames.

**Deliverable:** `interpreters/cove/`.

**What to implement:**
- Strategy: drafter that produces a factual claim, then pushes `verify.md`.
- `dynamics/verify.md`: generates N verification questions, for each pushes
  `dynamics/answer-independently.md`, collects answers, revises the draft.
- Demo PROGRAM.md with a question where hallucination is likely (e.g. "list
  the authors of paper X").

**Reuse:** none.

**Validation:** snapshot a cycle mid-verify and confirm `.call-stack.json`
contains two frames.

---

### Phase 4 — Plan-and-Execute (L1, workhorse)

**Why now.** First general-purpose interpreter. This is what most users
actually want. Also the first one with recursion (execute-step may re-push
plan).

**Deliverable:** `interpreters/plan-execute/`.

**What to implement:**
- Strategy: planner/replanner holding `## Plan`.
- `dynamics/plan.md` — produces an ordered step list given `## Goal`.
- `dynamics/execute-step.md` — executes one step. May call `bash`,
  `write_file`, or push `plan.md` recursively if the step is too coarse
  (heuristic: "this step contains more than N sub-actions → decompose").
- Strategy logic: after each step result, decide advance vs. replan.
- Demo PROGRAM.md with a small engineering task (e.g. "set up a Python
  project with tests and CI config").

**Reuse:** `evaluate.md` from phase 2 is pushed before marking a step as
complete, reusing the evaluator as a step-acceptance gate.

**Validation:** log trace should show at least one replan triggered by a
step failure.

---

### Phase 5 — L4 team interpreters (**replace game-team**)

**Why now.** We have planning and evaluation; a fixed-SOP team interpreter
is now cheap to build. This phase explicitly retires game-team.

**Deliverable:** two interpreters.

#### 5a. `interpreters/metagpt/`

- Strategy: SOP sequencer walking PM → Architect → Engineer → QA.
- `dynamics/role-pm.md`, `role-architect.md`, `role-engineer.md`,
  `role-qa.md` — each reads the prior role's document section, writes its
  own.
- Typed hand-off via MEMORY sections: `## PRD`, `## Design`, `## Tasks`,
  `## Code Review`.
- Demo PROGRAM.md: build a small CLI tool.

#### 5b. `interpreters/chatdev/`

- Strategy: phase sequencer (design, coding, testing, documenting).
- `dynamics/dialogue.md` parameterised by `## Participants` and `## Topic`;
  pairs like CEO↔CTO, coder↔reviewer.
- Role descriptions in `roles/*.md` referenced from MEMORY.
- Demo PROGRAM.md: build the same CLI tool as MetaGPT — lets us compare
  outputs.

**Reuse:** `evaluate.md` (phase 2) used by the QA / reviewer roles.

**Retirement of game-team:**
- After both 5a and 5b run end-to-end on their demos, delete
  `interpreters/game-team/`.
- Update `CLAUDE.md`: remove the "Existing interpreters" entry for
  game-team, add entries for `metagpt` and `chatdev` with one-line
  descriptions.
- Update `README.md` examples that reference game-team.
- Keep the shell-level features that game-team exercised (fuzzy NL
  conditions, non-blocking questions, `## Push` from strategy) — these
  belong to the shell, not to game-team, and are reused by 5a/5b.

---

### Phase 6 — L5 dynamic-composition interpreters (sweet spot)

**Why now.** The shell's stack was designed for this shape. With dynamics
from phases 1–5 in hand, these are thin orchestrators.

**Deliverable:** three interpreters.

#### 6a. `interpreters/orchestrator-workers/`

- Strategy: orchestrator holds `## Subtasks` (decomposed on the fly per task)
  and `## Results`. Pushes `worker.md` per subtask, in sequence. Synthesises.
- `dynamics/worker.md`: generic, receives `## Current Subtask` and returns
  `## Subtask Result`. Uses `execute-step.md` internally if the subtask is
  executable (code/bash), otherwise runs a reasoning loop.
- Demo PROGRAM.md: a task that clearly benefits from fan-out (e.g. "analyse
  these 5 files and produce a unified summary").

#### 6b. `interpreters/debate/`

- Strategy: round coordinator. Runs R rounds, each round pushes
  `dynamics/opine.md` for each of N agents with distinct personas.
- Opinions accumulated into `## Opinions`, aggregated at end.
- Demo PROGRAM.md: an ambiguous-answer question (e.g. "should we use
  Postgres or SQLite for this use case?").

#### 6c. `interpreters/deep-research/`

- Strategy: researcher holds `## Open Questions` and `## Findings`.
- `dynamics/investigate.md` — may push itself recursively if the
  sub-question is too broad.
- `dynamics/synthesize.md` — final report into `workspace/report.md`.
- Demo PROGRAM.md: an open-ended research prompt.

**Reuse:** phase 4 `plan.md` / `execute-step.md` are pushed by `worker.md`
when a subtask itself needs a plan. Phase 2 `reflect.md` is pushed by the
debate coordinator between rounds to nudge agents off stuck points.

---

### Phase 7 — Tree of Thoughts (L2, stack-depth stress test)

**Why now.** Exercises deepest stack in the codebase and the first meaningful
use of the per-instance project git for parallel-branch snapshots.

**Deliverable:** `interpreters/tot/`.

**What to implement:**
- Strategy: search controller holding the frontier and visited set in MEMORY.
- `dynamics/expand-node.md` — generates k children, evaluates each, pops with
  scored children. Recursive per best child.
- Integration with `workspace/`'s project git: each ToT branch gets a git
  branch; the controller `checkout`s before expanding, so sibling branches
  don't see each other's state.
- Demo PROGRAM.md: the classic Game-of-24 or a small code-search problem.

**Reuse:** `evaluate.md` from phase 2.

---

### Phase 8 — Meta-framework (L6 finale)

**Why last.** Requires everything below to already work, since it composes
earlier interpreters as candidates.

**Deliverable:** `interpreters/aflow-lite/`.

**What to implement:**
- Strategy: MCTS controller over a library of Operators (Ensemble, Review,
  Revise, …). Tree persisted in MEMORY (`## MCTS Tree`).
- `dynamics/evaluate-workflow.md`: materialises a candidate workflow as a
  throwaway `INSTRUCTIONS.md` in `workspace/candidates/NNN/`, launches it
  via a nested shell invocation (same binary, different instance dir),
  collects the score from its final MEMORY.
- Baselines as Operator library seeds: phase 1 (self-refine), phase 2
  (reflexion), phase 6a (orchestrator-workers), phase 6b (debate).
- Demo PROGRAM.md: a small benchmark where we can automatically score
  answers (e.g. a set of GSM8K problems or HumanEval items).

**Optional follow-on (Phase 9):** ADAS-style meta-agent that writes new
interpreter `INSTRUCTIONS.md` in code rather than composing Operators. This
is the philosophically closest match to the Turing-machine premise
(machine-writes-its-own-program) and is the logical end-state of the
project.

**Reuse:** everything.

---

## Out of scope for this plan

- **AutoGen / Superpowers** (L7 libraries) — they are *not* interpreters.
  Superpowers' skill content (4-phase debugging, TDD methodology) can be
  cherry-picked as dynamics inside L1 / L4 interpreters, but we do not
  build a "Superpowers interpreter".
- **EvoAgentX, DyLAN** — covered in spirit by Phase 8 + optional Phase 9.
  No separate interpreter unless a specific research question requires it.
- **XAgents (plural, rule-based)** — low priority; its IF-THEN style clashes
  with the shell's fuzzy-NL-condition design.
- **Parallel worker execution.** Today the shell pops sequentially. Some
  phases (6a orchestrator, 6b debate, 7 ToT) would benefit from parallel
  frames. This is a **shell change**, not an interpreter change, and is
  tracked separately.

---

## Definition of done (per phase)

Each phase is considered complete when:

1. The interpreter runs its demo `PROGRAM.md` to `state: done` on a default
   provider (Claude Code or Anthropic API) without manual intervention.
2. `history/` contains a coherent snapshot sequence that can be replayed in
   the visualiser.
3. The `CLAUDE.md` "Existing interpreters" list is updated.
4. A one-paragraph README-style section is added to this file (or a
   sibling `notes.md`) describing anything surprising discovered during
   implementation — so phase N+1 can avoid repeating the pain.
