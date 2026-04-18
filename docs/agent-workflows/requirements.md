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

## Cross-cutting building blocks

Two pieces sit above the phase list. They are not bound to any group; every
phase can build on them.

### Skill library (Voyager-inspired)

A persistent archive of successful sub-computations that any interpreter can
draw from. Directly inspired by Voyager's skill library (see `patterns.md`
Group 3). Orthogonal to the stack — it is *data* the dynamics consume, not
a new control-flow primitive.

- **Convention:** `workspace/skills/<name>.md` files, each a standalone
  prompt + metadata header (trigger conditions, expected MEMORY in/out,
  provenance: which interpreter+instance produced it).
- **Index:** `workspace/skills/index.json` for fast lookup by trigger
  keyword or semantic tag.
- **New dynamic `invoke-skill.md`:** given a skill name and input MEMORY
  sections, loads the skill and runs it as if it were a dynamic.
- **New dynamic `install-skill.md`:** pushed at the end of a successful
  sub-computation to generalise it into a skill and append to the index.
- **First consumers:** Phase 3 (plan-execute may save high-utility plans),
  Phase 5 (debate may save strong opinion patterns), Phase 7 (AFlow's
  operator library is a skill library by another name).
- **Implementation order:** introduce the convention + `invoke-skill.md`
  in the same change that introduces the first consumer (Phase 3a).
  `install-skill.md` can follow when a second phase wants to contribute
  skills.

### ReAct tool-calling convention

Every phase that invokes shell tools (bash, write_file, git) follows the
**ReAct** convention (`patterns.md` Group 1): the LLM reasons in a
`Thought:` preamble, names the tool call as an `Action:`, and reads the
result as an `Observation:` before the next thought. The current shell
prompt already encourages this; the note here is to **not regress it**.
No dynamic required — it is a prompting standard, enforced through the
system prompt.

## Group order and prerequisites

| Group from patterns.md | Covered in | Needs |
|---|---|---|
| 2 — Iterative refinement | Phase 1, Phase 2 | — |
| 3 — Planning & decomposition | Phase 3 (+ optional ReWOO variant) | `evaluate.md` from Phase 1 |
| 6 — Fixed-SOP teams | Phase 4 (game-team retirement) | `evaluate.md` |
| 5 — Peer collaboration | Phase 5 (Debate), Phase 5b (MoA) | `reflect.md` from Phase 1 |
| 4 — Search | Phase 6 (ToT, optional GoT variant) | `evaluate.md` |
| 4 + 2 + 8 crossover | Phase 6b (LATS) | Phases 1c, 6, MCTS harness from Phase 7 |
| 8 — Meta-frameworks | Phase 7 (+ optional Phase 8) | everything |

Groups 1 (prompting techniques), 7 (dynamic teams), and 9 (libraries) are
**not built as interpreters** — see "Out of scope" at the bottom.

## Reusable dynamics library

Built up progressively. Each lives under `interpreters/<name>/dynamics/` and
is copied wholesale by `new-instance.sh`. Names and contracts are normative.

| Dynamic | Introduced in | MEMORY in | MEMORY out | Stack depth |
|---|---|---|---|---|
| `invoke-skill.md` | cross-cutting | `## Skill Name`, `## Skill Inputs` | `## Skill Output` | 1 |
| `install-skill.md` | cross-cutting | `## Skill Name`, `## Skill Body`, `## Metadata` | (writes to `workspace/skills/`) | 0 |
| `self-critique.md` | 1a | `## Draft` | `## Critique`, `## Refined` | 1 |
| `evaluate.md` | 1b | `## Attempt`, `## Criterion` | `## Verdict`, `## Feedback` | 1 |
| `reflect.md` | 1c | `## Attempt`, `## Verdict` | `## Lesson` | 1 |
| `verify.md` | 2 | `## Draft` | `## Verification Questions`, `## Revised` | 2 |
| `answer-independently.md` | 2 | `## Question` | `## Answer` | 1 |
| `plan.md` | 3a | `## Goal` | `## Plan` | 1 |
| `execute-step.md` | 3a | `## Current Step`, `## Context` | `## Step Result` | 1+ (may re-push plan) |
| `execute-batch.md` | 3a (ReWOO variant) | `## Plan` with `#E` placeholders | `## Resolved Plan` | 1 |
| `worker.md` | 3b | `## Current Subtask` | `## Subtask Result` | 1 |
| `investigate.md` | 3c | `## Sub-question` | `## Finding` | N (recursive) |
| `synthesize.md` | 3c | `## Findings` | `## Report` | 1 |
| `role-<name>.md` | 4a | prior role's section | this role's section | 1 |
| `dialogue.md` | 4b | `## Topic`, `## Participants` | `## Conclusion` | 1 |
| `opine.md` | 5 | `## Question`, `## Round` | `## Opinion` (appended) | 1 |
| `propose.md` | 5b | `## Prompt`, `## Persona` | `## Proposal` (appended) | 1 |
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
- **Optional second demo — ReWOO variant** (`patterns.md` Group 3). Same
  `plan.md` but different executor: `plan.md` emits a full plan with
  `#E1, #E2, …` placeholders for tool outputs; a new dynamic
  `execute-batch.md` runs all tools in one pass and substitutes results
  before a final synthesis. Same interpreter shell, different strategy
  prompt and one extra dynamic. Shows the interleaved-vs-batched trade-off
  cheaply. Build only after the interleaved path is solid.

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

## Phase 5 — Peer collaboration: Debate (patterns.md Group 5)

First of two Group-5 interpreters. CAMEL is skipped (two-role conversation
adds little over 4b's dialogue dynamic).

**Deliverable:** `interpreters/debate/`.

- Strategy: round coordinator. Runs R rounds; each round pushes `opine.md`
  for each of N agents with distinct personas.
- New dynamic: `opine.md` — appends to `## Opinions` list.
- **Reuse:** between rounds, coordinator may push `reflect.md` from 1c to
  nudge agents off stuck points.
- Demo `PROGRAM.md`: an ambiguous-answer question ("Postgres or SQLite for
  use case U?").
- **Cheap fallback — SPP** (`patterns.md` Group 5). For cost-constrained
  runs, a single LLM cycles through personas in one context window. No new
  dynamic: strategy pushes `opine.md` N times against the same worker with
  different persona headers. Same interpreter can expose both modes via a
  config switch.

---

## Phase 5b — Peer collaboration: Mixture of Agents (patterns.md Group 5)

Layered ensembling, genuinely distinct from Debate. N proposers answer
**independently** (no cross-visibility), an aggregator synthesises; layers
can stack.

**Deliverable:** `interpreters/moa/`.

- Strategy: layer coordinator. For each layer, pushes `propose.md` N times
  with distinct system prompts; collects proposals; runs an aggregator
  prompt inline (no dynamic needed) to produce the layer output; feeds it
  as the prompt to the next layer.
- New dynamic: `propose.md` — receives `## Prompt` and `## Persona`,
  returns `## Proposal`. Distinct from `opine.md` because proposers must
  *not* see each other's output within a layer.
- **Reuse:** none. `opine.md` is deliberately not reused — the access
  pattern is opposite (opine shares the list, propose must not).
- Demo `PROGRAM.md`: the same question as Phase 5, so outputs are
  directly comparable between Debate and MoA on identical inputs.
- **Validation:** per-proposer contexts verified to contain no sibling
  proposals in that layer.

---

## Phase 6 — Search: Tree of Thoughts (patterns.md Group 4)

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
- **Optional variant — GoT** (`patterns.md` Group 4). Swap the tree-shaped
  frontier for a DAG: `expand-node.md` can additionally emit `aggregate`
  edges merging two existing thoughts into a new one. Same dynamic,
  different strategy bookkeeping. Worth building only if a demo requires
  cross-branch join (ToT's tree is usually enough).

---

## Phase 6b — Search + refinement + meta: LATS (patterns.md Group 4 × 2 × 8)

Language Agent Tree Search: MCTS over ToT-style thoughts, Reflexion-style
lessons at evaluation time, environment feedback as reward. This phase
is **the natural bridge between Phase 6 and Phase 7** — it reuses ToT's
dynamic and Reflexion's memory, and introduces MCTS machinery that
Phase 7 also needs.

**Deliverable:** `interpreters/lats/`.

- Strategy: MCTS controller (selection / expansion / simulation /
  back-prop). Persists the tree + per-node statistics in MEMORY
  (`## Search Tree`, `## N / Q / V`).
- **Reuse (no new dynamics):**
  - `expand-node.md` (Phase 6) — unchanged, for node expansion.
  - `evaluate.md` (Phase 1b) — as the simulation/rollout value.
  - `reflect.md` (Phase 1c) — pushed on simulation failure to harvest a
    lesson propagated into the tree's `## Lessons` section, consumed on
    future expansions at the same node.
- **New infrastructure:** MCTS helper code in the strategy (not a
  dynamic) — reusable by Phase 7.
- Demo `PROGRAM.md`: a task with executable feedback (write a function
  that passes a given test suite; route a small maze).
- **Why this ordering:** building LATS before Phase 7 lets Phase 7 import
  the MCTS helper verbatim, rather than inventing it inside AFlow.

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
  3b (orchestrator-workers), 5 (debate), 5b (MoA). MCTS helper imported
  from Phase 6b.
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

## Open questions / future shell work

Items outside the interpreter plan that would multiply the value of the
interpreters. Each is a **shell-level change**, not a phase.

- **MemGPT-style memory architecture** (`patterns.md` Addenda). Today
  MEMORY.md is append-then-concatenate. A MemGPT-style paging system
  (`recall` / `save` / `page-in` / `page-out` as explicit operations
  against a tiered store) would upgrade every long-running interpreter.
  Biggest win: Phase 3c (Deep Research's `## Findings` grows unboundedly)
  and Phase 7 (AFlow's MCTS tree spills out of context). Flagged as
  the single most impactful shell change.
- **Curated tool surface (SWE-agent ACI)** (`patterns.md` Group 3). For
  coding-heavy programs, the current generic `bash` + `write_file` pair
  underperforms an LLM-ergonomic set: file viewer with scroll,
  edit-at-line, directory search. Worth prototyping as an opt-in tool
  layer selected per instance via `.env`. Scope: shell change, not a new
  interpreter.
- **DSPy-style prompt compilation** (`patterns.md` Group 9). Auto-
  optimising prompts against a metric on a training set. Would multiply
  Phase 7's value — AFlow searches the workflow space, but each node's
  prompt is hand-written; a compiler would search prompt space inside
  each node. Requires a metric harness the shell doesn't have yet.
- **Parallel stack frames** (already noted previously). Several phases
  (3b, 5, 5b, 6) would benefit from concurrent pops. Shell change.

---

## Out of scope for this plan

- **Group 1 (Prompting techniques)** — CoT, Self-Consistency, ReAct,
  Self-Discover. Prompting affordances available to any interpreter.
  ReAct specifically is a **shell-level convention** (see "Cross-cutting
  building blocks" above), not a phase.
- **Group 7 (Dynamic teams)** — AgentVerse, AutoAgents, XAgents (plural).
  AgentVerse and AutoAgents are covered **in spirit** by Phase 3b + Phase 7
  (dynamic decomposition + operator library). XAgents (plural, rule-based
  IF-THEN) clashes with the shell's fuzzy-NL-condition design and is not
  pursued.
- **Group 9 (Libraries)** — AutoGen, Superpowers, DSPy, LangGraph, CrewAI.
  Infrastructure, not interpreters. Superpowers' skill *content* (4-phase
  systematic debugging, TDD methodology) is a good source to mine when
  building dynamics for Phase 4b. DSPy's compiler concept is listed under
  "Open questions" above.
- **Voyager as its own interpreter** — absorbed into the skill-library
  building block above. Voyager's skill-library idea is the contribution
  worth adopting; its Minecraft curriculum loop is too domain-specific.
- **AutoGPT / BabyAGI** — historical ancestors of Phase 3a. Nothing to
  build separately.
- **Generative Agents** (`patterns.md` Group 5) — simulation, not task
  solving. Out of scope.
- **GPTSwarm** (`patterns.md` Group 8) — gradient-based workflow
  optimisation. Different paradigm from AFlow's MCTS. Out of scope
  unless a training-loop harness is added.
- **EvoAgentX, DyLAN** — supersets of Phase 7/8 in scope; revisit only if a
  specific research question requires them.
- **Computer Use / Operator** (`patterns.md` Addenda) — modality, not a
  pattern. Requires a screenshot+mouse tool layer the shell does not
  have. Out of scope.

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
