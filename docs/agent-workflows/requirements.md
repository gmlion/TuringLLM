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
3. **Phase 4 retired `interpreters/game-team`** per spec
   `docs/specs/2026-04-24-implement-phase-3-and-4/`. The directory has
   been deleted; its shell-level features (fuzzy NL conditions,
   non-blocking `## Pending Questions`, strategy-level `## Push`) are
   exercised by Phase 4's MetaGPT and ChatDev leaves.
4. **Every interpreter ships with a demo `PROGRAM.md`** so a user can run it
   via `./new-instance.sh foo interpreters/<name>`.
5. **No speculative dynamics.** If something would only be used by one
   interpreter, inline it. Promote to `dynamics/` only on second use.
6. **Every interpreter ships with a `README.md`** at its leaf directory
   summarising the pattern (with the `patterns.md` group + citation), the
   state machine, the dynamics it pushes, the demo program, how to run it,
   and known behaviour. Each conceptual group directory (e.g.
   `interpreters/1-iterative-refinement/`) **also ships a group-level
   `README.md`** framing the family, listing variants with a short
   comparison table, and pointing at shared dynamics.
   **When a single implementation subsumes two or more named patterns
   from `patterns.md` (a "collapsed pattern" — e.g. Phase 3a's strategy
   covers Plan-and-Execute, Orchestrator–Workers, Deep Research, and
   XAgent), every subsumed pattern MUST be named with a source
   citation in both the relevant leaf `README.md` files AND the
   group-level `README.md`, together with the collapse rationale (why
   one implementation suffices under the current shell). This
   prevents the taxonomy from becoming invisible in the filesystem: a
   reader landing on any leaf learns the full story without having to
   read `patterns.md` first.**
7. **Directory layout convention** (introduced in Phase 1): every new
   interpreter lives at
   `interpreters/<group-number>-<group-slug>/<exploration-letter>-<interpreter-slug>/`,
   where `<group-number>`/`<group-slug>` reference the numbered groups in
   `patterns.md` (the unnumbered "Building blocks — Prompting techniques"
   preface is intentionally not represented in the filesystem) and
   `<exploration-letter>` is the recommended exploration order within the
   group (`a`, `b`, `c`, …). Implementation order sorts lexically and the
   taxonomy is visible in the filesystem.

## Cross-cutting building blocks

Two pieces sit above the phase list. They are not bound to any group; every
phase can build on them.

### Skill library (Voyager-inspired)

A persistent archive of successful sub-computations that any interpreter can
draw from. Directly inspired by Voyager's skill library (see `patterns.md`
Group 2). **Not new shell infrastructure** — a convention layered on
primitives the shell already provides.

The mechanism already exists:

- The `write_file` and `update_instructions` tools let an LLM write new
  instruction content to any path at any time.
- `## Push <path>` loads *any* file, relative to the instance directory,
  as the new `INSTRUCTIONS.md`. The shell calls `resolve(BASE_DIR, path)`
  on the push target and reads whatever is there — there is no
  `dynamics/`-only restriction and no registration step. The path can
  point at a file the LLM just wrote this same cycle.
- Machine git auto-commits the instance tree every cycle, so any file
  the LLM writes under the instance directory is versioned without extra
  effort.

A "skill" is therefore just an LLM-authored dynamic file. An interpreter
opts in by:

1. **Saving.** After a successful sub-computation, the strategy (or a
   purpose-built dynamic it owns) writes the reusable instruction text to
   `dynamics/<name>.md` — the same directory that holds the human-authored
   dynamics shipped with the interpreter. The file is indistinguishable
   from a built-in dynamic once on disk; its provenance can live in a
   short front-matter header (`source: llm`, `produced-in-cycle: N`) or
   in a side file the strategy maintains (`dynamics/index.json`).
2. **Invoking.** On a later cycle, the strategy writes
   `## Push\ndynamics/<name>.md` in MEMORY. The shell's existing push
   machinery loads the file verbatim (or with `## Push-Args` substitution)
   and the skill runs exactly like a built-in dynamic.

No new shell code, no cross-cutting dynamics, no dedicated `invoke-skill`
or `install-skill` abstractions. Interpreters that want skill
accumulation write the save/lookup logic into their own strategy or into
per-interpreter dynamics. Whatever convention emerges from the first
consumer can be reused (or promoted to cross-cutting) by the second.

An interpreter that wants its skill library tracked *separately* from
the machine git (e.g. to let the LLM branch/rewind its skill library
independently of cycle history) can store skills under `workspace/`
instead — `workspace/` is the LLM-controlled project git. This is a
niche choice; `dynamics/` under the machine git is the natural default.

- **Status.** Nothing to ship at the cross-cutting level. Phase 3's
  demos are single-shot and do not benefit from skill accumulation (see
  Phase 3 for the explicit reasoning). Phase 7 (AFlow) is the first
  phase where a library of LLM-authored dynamics is structurally
  required — AFlow's operator library is a skill library by another
  name, and under this framing its operators are simply LLM-materialised
  dynamics under `dynamics/` (or `workspace/operators/` if AFlow wants
  its own git history for them), not a separate abstraction.

### ReAct tool-calling convention

Every phase that invokes shell tools (bash, write_file, git) follows the
**ReAct** convention (`patterns.md` Building blocks — Prompting techniques): the LLM reasons in a
`Thought:` preamble, names the tool call as an `Action:`, and reads the
result as an `Observation:` before the next thought. The current shell
prompt already encourages this; the note here is to **not regress it**.
No dynamic required — it is a prompting standard, enforced through the
system prompt.

## Group order and prerequisites

| Group from patterns.md | Covered in | Needs |
|---|---|---|
| 1 — Iterative refinement | Phase 1, Phase 2 | — |
| 2 — Planning & decomposition | Phase 3 (plan-execute baseline with 3 demos + optional ReWOO variant; parallel Orchestrator–Workers deferred) | `evaluate.md` from Phase 1 |
| 5 — Fixed-SOP teams | Phase 4 (game-team retired; fixed-SOP teams delivered) | `evaluate.md` |
| 4 — Peer collaboration | Phase 5 (Debate), Phase 5b (MoA) | `reflect.md` from Phase 1 |
| 3 — Search | Phase 6 (ToT, optional GoT variant) | `evaluate.md` |
| 3 + 1 + 7 crossover | Phase 6b (LATS) | Phases 1c, 6, MCTS harness from Phase 7 |
| 7 — Meta-frameworks | Phase 7 (+ optional Phase 8) | everything |

Building blocks (prompting techniques), Group 6 (dynamic teams), and Group 8
(libraries) are **not built as interpreters** — see "Out of scope" at the bottom.

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
| `execute-step.md` | 3a | `## Current Step`, `## Context` | `## Step Result` (via `## Return`) | 1+ (may re-push plan) |
| `synthesize.md` | 3a (demo d3) | `## Results` | `## Report` | 1 |
| `execute-batch.md` | 3b (ReWOO) | `## Plan` with `#E` placeholders | `## Resolved Plan` | 1 |
| `role-<name>.md` | 4a | prior role's section | this role's section | 1 (qa: 2) |
| `dialogue.md` | 4b | `## Topic`, `## Participants` | `## Dialogue Output` | 1 (acceptance=true: 2) |
| `opine.md` | 5 | `## Question`, `## Round` | `## Opinion` (appended) | 1 |
| `propose.md` | 5b | `## Prompt`, `## Persona` | `## Proposal` (appended) | 1 |
| `expand-node.md` | 6 | `## Parent Thought` | `## Children`, `## Value` | N |
| `evaluate-workflow.md` | 7 | `## Candidate Workflow` | `## Score`, `## Trace` | 2 |

---

## Phase 1 — Iterative refinement (patterns.md Group 1)

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

## Phase 2 — Chain-of-Verification (patterns.md Group 1, nested variant)

Still iterative refinement, but the critique step is *decomposed* into independent verification Q&A. First interpreter that requires **stack depth 2**, so it doubles as a snapshot/restore stress test for the shell.

Phase 2 also introduces the **arguments-via-INSTRUCTIONS** shell convention (`## Push-Args` + `{{var}}` substitution) and retrofits the existing `a`/`b`/`c` dynamics onto it. The convention retires "prompt trust" as the isolation mechanism for `answer-independently.md` and cleanly separates per-frame arguments (INSTRUCTIONS) from the shared heap (MEMORY).

**Deliverables:**
- `interpreters/1-iterative-refinement/d-cove/`
- Shell extension to `applyPush` in `src/call-stack.ts`
- Refactored `a`/`b`/`c` dynamics

- Strategy: drafter emits a candidate answer, pushes `verify.md` with `{{draft}}` as a push-arg.
- New dynamic: `verify.md` — generates N >= 2 verification questions from the draft, for each pushes `answer-independently.md` with `{{question}}`, collects answers from MEMORY, emits `## Revised`.
- New dynamic: `answer-independently.md` — answers one question using PROGRAM.md and general knowledge; references no caller MEMORY section.
- Demo `PROGRAM.md`: a four-person knights-and-knaves puzzle where first-pass reasoning commonly drifts.
- **Reuse:** the arguments-via-INSTRUCTIONS convention introduced by this phase is used by all four dynamics in Group 1 from this phase onward.
- **Validation:** mid-verify, `.call-stack.json` contains two frames (asserted by `src/test/phase-2-cove.test.ts`).

---

## Phase 2b — Per-frame directories and ## Return splicing

Shipped on top of Phase 2 without adding new interpreters. A structural upgrade to the shell and all four Group-1 interpreters.

**Deliverables:**
- Per-frame directory layout: `instances/<name>/frames/f<NNN>-<slug>/` containing each frame's `INSTRUCTIONS.md`, `MEMORY.md`, and `scoped/`.
- New `StackEntry` shape: `{ returnState, frameDir }` — no more `instructions` field; INSTRUCTIONS.md lives on disk per frame.
- `activeFramePaths(callStack)` in `src/config.ts`; cwd handoff per cycle.
- Root frame `frames/f000-strategy` is always `stack[0]` with `returnState: "<root>"`. Halt: `state === "done"` AND `stack.length === 1`.
- `## Return` splicing: child writes `## Return\nkey: value`; on pop the shell splices into the caller's MEMORY as `## <CapitalizedKey>` sections.
- Surgical-edit convention in system prompt: `sed -i`, `awk`, `echo >>` for files other than `MEMORY.md`/`INSTRUCTIONS.md`/`PROGRAM.md`.
- All four interpreters (`a-self-refine`, `b-evaluator-optimizer`, `c-reflexion`, `d-cove`) migrated to `./scoped/` files for heap state and `## Return` for outputs.
- **Breaking change (R43):** pre-2b instances cannot resume; `instances/` was wiped and the new layout is mandatory.

Spec: `docs/specs/2026-04-23-agent-workflows-phase-2b-push-returns/`.

---

## Phase 3 — Planning & decomposition (patterns.md Group 2) — **shipped**

Shipped per spec `docs/specs/2026-04-24-implement-phase-3-and-4/` as
three sibling leaves under `interpreters/2-planning-decomposition/`
sharing byte-equal `INSTRUCTIONS.md` and `dynamics/`, distinguished
only by their `PROGRAM.md` demo (the canonical framings that the
original plan called "demos d1/d2/d3" became three separate leaves
because each demo wants its own runnable instance directory).
Parallel Orchestrator–Workers and the ReWOO variant remain deferred
(see Open questions).

**Why one interpreter and not four.** Plan-and-Execute, Orchestrator–
Workers, Deep Research, and XAgent collapse to the same state machine
under the current sequential shell (see `patterns.md` Group 2 —
"Plan-and-Execute (includes Orchestrator–Workers, Deep Research, XAgent)").
Under sequential execution, fan-out to generic workers is indistinguishable
from a single executor, on-the-fly decomposition produces the same trace
as upfront planning with replans, recursive sub-question investigation is
a special case of `execute-step.md` re-pushing `plan.md`, and XAgent's
"planner rewrites at any time" is just a replanner prompted to fire every
cycle. Four named patterns, one implementation — violating "no speculative
dynamics" would mean shipping four interpreters that do the same thing.
The canonical framings live as distinct **demos** on the same strategy.

### 3a. `interpreters/2-planning-decomposition/a-plan-execute/`, `.../b-orchestrator-workers/`, `.../c-deep-research/`

Baseline decomposition: plan, execute steps sequentially, optionally
synthesise. The three leaves share byte-equal `INSTRUCTIONS.md` and
`dynamics/`; only their `PROGRAM.md` differs.

- Strategy: planner/replanner holding `## Plan` and accumulated `## Results`.
- New dynamics:
  - `plan.md` — produces an ordered step list for `## Goal`.
  - `execute-step.md` — executes one step. May re-push `plan.md` if the
    step is too coarse (recursion), or push `evaluate.md` as a step-
    acceptance gate. Returns `## Step Result` via `## Return`.
  - `synthesize.md` — optional terminal step that aggregates accumulated
    `## Results` into a final artefact (e.g. `workspace/report.md`).
    Omitted for demos whose output already lives in `workspace/`.
- **Reuse:** `evaluate.md` from 1b.
- **Three leaves**, one canonical framing each:
  - **`a-plan-execute` — Plan-and-Execute** (Wang et al. framing). Demo
    d1: minimal TypeScript Node.js project setup. Output lives in
    `workspace/`; no `synthesize.md`. **Validation:** log shows at
    least one replan triggered by a step failure.
  - **`b-orchestrator-workers` — Orchestrator–Workers** (Anthropic,
    Building Effective Agents — sequential framing). Demo d2:
    summarise five technical notes. `plan.md` emits one subtask per
    note; `execute-step.md` processes each; `synthesize.md`
    aggregates. Demonstrates that sequential fan-out is the same
    shape as Plan-and-Execute — the distinction only shows up once
    frames run in parallel (deferred below).
  - **`c-deep-research` — Deep Research** (product framing, Self-Ask
    ancestry). Demo d3: Raft/Paxos/Multi-Paxos comparison. `plan.md`
    emits sub-questions; `execute-step.md` answers each and may
    recursively re-push `plan.md` when a sub-question is still too
    broad; `synthesize.md` writes `workspace/report.md`.
    **Validation:** log shows at least one recursive re-push of
    `plan.md` from inside `execute-step.md`.

### 3b. `interpreters/2-planning-decomposition/b-rewoo/` (optional)

Structurally distinct variant, worth a separate interpreter because the
executor shape genuinely differs.

- Strategy: planner emits a complete plan up-front with `#E1, #E2, …`
  placeholder tokens for tool outputs; `execute-batch.md` runs all tools
  in one pass and substitutes the results; a final inline synthesis uses
  the resolved plan. No interleaved reasoning/observation loop.
- New dynamic: `execute-batch.md` — resolves all `#E_k` placeholders in
  `## Plan` against a batch of tool calls, emits `## Resolved Plan`.
- **Reuse:** `plan.md` from 3a (different prompting, same contract).
- Demo `PROGRAM.md`: a task with multiple independent lookups (e.g.
  "summarise the current status of projects A, B, and C from their
  READMEs and open-issues pages"), chosen so batching matters.
- **Validation:** per-cycle logs show one-shot tool resolution — no
  interleaved observation-triggered reasoning between placeholder
  expansions.
- Build only after 3a is solid.

### Deferred: parallel Orchestrator–Workers

Once the shell supports parallel stack frames (see Open questions
below), genuine fan-out to generic workers in parallel becomes
structurally distinct from sequential 3a d2. At that point, add
`interpreters/2-planning-decomposition/c-orchestrator-workers/` with a
new `worker.md` dynamic executed in concurrent frames, reusing `plan.md`
(or replacing it with on-the-fly dispatch). Until then, sequential
Orchestrator–Workers is demo d2 on 3a and is not a separate interpreter.

---

## Phase 4 — Fixed-SOP teams (patterns.md Group 5) — **shipped; game-team retired**

Shipped per spec `docs/specs/2026-04-24-implement-phase-3-and-4/`.
Two interpreters share a single demo `PROGRAM.md` so outputs are
directly comparable. `interpreters/game-team/` was deleted as part
of this phase.

### 4a. `interpreters/5-fixed-sop-teams/a-metagpt/`

Document hand-off between roles (MetaGPT — Hong et al., ICLR 2024).

- Strategy: SOP sequencer walking PM → Architect → Engineer → QA.
- New dynamics: `role-pm.md`, `role-architect.md`, `role-engineer.md`,
  `role-qa.md` — each reads the prior role's MEMORY section, writes its own.
- Typed hand-off sections: `## PRD`, `## Design`, `## Tasks`, `## Code Review`.
- **Reuse:** QA role pushes `evaluate.md` from 1b.
- Demo `PROGRAM.md`: build a small CLI tool. Shared with 4b.

### 4b. `interpreters/5-fixed-sop-teams/b-chatdev/`

Phase-dialogue between role pairs (ChatDev — Qian et al., 2023).

- Strategy: phase sequencer (design, coding, testing, documenting).
- New dynamic: `dialogue.md` — parameterised by `## Participants` and
  `## Topic`; pairs like CEO↔CTO, coder↔reviewer.
- Role descriptions in `roles/*.md` referenced from MEMORY.
- **Reuse:** reviewer pairs push `evaluate.md`.
- Demo `PROGRAM.md`: the **same** CLI tool as 4a.

### Retirement (completed)

1. 4a and 4b shipped against their shared demo.
2. `interpreters/game-team/` has been deleted from the repo.
3. `CLAUDE.md` "Existing interpreters" lists `a-metagpt` and `b-chatdev`
   in place of `game-team`.
4. `README.md` examples no longer reference `game-team`.
5. Shell features previously exercised by game-team — fuzzy NL
   conditions, non-blocking `## Pending Questions`, strategy-level
   `## Push` — are exercised by 4a/4b and pinned by
   `src/test/phase-4-shell-features.test.ts` (R40). These belong to
   the shell, not to any interpreter, and must not regress.

---

## Phase 5 — Peer collaboration: Debate (patterns.md Group 4)

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

---

## Phase 5b — Peer collaboration: Mixture of Agents (patterns.md Group 4)

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

## Phase 6 — Search: Tree of Thoughts (patterns.md Group 3)

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
- **Optional variant — GoT** (`patterns.md` Group 3). Swap the tree-shaped
  frontier for a DAG: `expand-node.md` can additionally emit `aggregate`
  edges merging two existing thoughts into a new one. Same dynamic,
  different strategy bookkeeping. Worth building only if a demo requires
  cross-branch join (ToT's tree is usually enough).

---

## Phase 6b — Search + refinement + meta: LATS (patterns.md Group 3 × 1 × 7)

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

## Phase 7 — Meta-framework (patterns.md Group 7)

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
  3a (plan-execute, covering the Orchestrator–Workers and Deep Research
  framings as demos), 5 (debate), 5b (MoA). MCTS helper imported from
  Phase 6b.
- Demo `PROGRAM.md`: a small automatically-scorable benchmark (a subset of
  GSM8K or HumanEval).

---

## Phase 8 (optional) — Meta-agent (patterns.md Group 7, ADAS flavour)

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
- **Curated tool surface (SWE-agent ACI)** (`patterns.md` Group 2). For
  coding-heavy programs, the current generic `bash` + `write_file` pair
  underperforms an LLM-ergonomic set: file viewer with scroll,
  edit-at-line, directory search. Worth prototyping as an opt-in tool
  layer selected per instance via `.env`. Scope: shell change, not a new
  interpreter.
- **DSPy-style prompt compilation** (`patterns.md` Group 8). Auto-
  optimising prompts against a metric on a training set. Would multiply
  Phase 7's value — AFlow searches the workflow space, but each node's
  prompt is hand-written; a compiler would search prompt space inside
  each node. Requires a metric harness the shell doesn't have yet.
- **Parallel stack frames** (already noted previously). Several phases
  would benefit from concurrent pops: Phase 3's deferred parallel
  Orchestrator–Workers variant (3c) requires this to be structurally
  distinct from the sequential 3a d2 demo; Phases 5, 5b, and 6 would
  also gain from it. Shell change.

---

## Out of scope for this plan

- **Building blocks — Prompting techniques** — CoT, Self-Consistency, ReAct,
  Self-Discover, SPP (Solo Performance Prompting). Prompting affordances
  available to any interpreter. ReAct specifically is a **shell-level
  convention** (see "Cross-cutting building blocks" above), not a phase.
  SPP (`patterns.md` Group 4) lives here rather than under Phase 5 because
  it is a single-cycle multi-persona prompt: it does not push and does
  not exercise the stack, so an "SPP interpreter" would be a prompt-only
  instance with no dynamics. The technique can still be used *inside* any
  opine-like dynamic of Phase 5 when a caller wants multi-persona
  reasoning within one frame.
- **Group 6 (Dynamic teams)** — AgentVerse, AutoAgents, XAgents (plural).
  AgentVerse and AutoAgents are covered **in spirit** by Phase 3a's
  Orchestrator–Workers demo (d2) plus Phase 7 (dynamic decomposition +
  operator library). XAgents (plural, rule-based IF-THEN) clashes with
  the shell's fuzzy-NL-condition design and is not pursued.
- **Group 8 (Libraries)** — AutoGen, Superpowers, DSPy, LangGraph, CrewAI.
  Infrastructure, not interpreters. Superpowers' skill *content* (4-phase
  systematic debugging, TDD methodology) is a good source to mine when
  building dynamics for Phase 4b. DSPy's compiler concept is listed under
  "Open questions" above.
- **Voyager as its own interpreter** — absorbed into the skill-library
  building block above. Voyager's skill-library idea is the contribution
  worth adopting; its Minecraft curriculum loop is too domain-specific.
- **AutoGPT / BabyAGI** — historical ancestors of Phase 3a. Nothing to
  build separately.
- **Generative Agents** (`patterns.md` Group 4) — simulation, not task
  solving. Out of scope.
- **GPTSwarm** (`patterns.md` Group 7) — gradient-based workflow
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
