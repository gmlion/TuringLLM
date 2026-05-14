# Patterns — implementer's notes

Companion to [`patterns.md`](patterns.md). `patterns.md` surveys the
agentic-pattern literature on its own terms; this file collects
observations from putting many of those patterns on the TuringLLM
shell. Strictly additive — nothing here contradicts the survey, and
no reader should need this file to understand the patterns.

The observations fall into three buckets:

1. **Empirical confirmations.** Where the implementation has gone
   far enough to verify a claim `patterns.md` made.
2. **Cross-cutting concerns.** Structural patterns that recur across
   `interpreters/` and that the survey doesn't yet name.
3. **Gaps and minor caveats.** Slots in `patterns.md` that the
   implementation surfaced as missing, plus framings that don't
   carry over to every execution model.

---

## 1. Empirical confirmations

### Sequential-collapse of Plan-and-Execute / Orchestrator-Workers / Deep Research

`patterns.md` §Group 2 asserts that under sequential execution, the
four published framings (Plan-and-Execute, Orchestrator-Workers,
Deep Research, XAgent) "collapse to prompting and output-channel
choices." The implementation makes this concrete: the three sibling
interpreters
`interpreters/mas-papers/2-planning-decomposition/{a-plan-execute,
b-orchestrator-workers, c-deep-research}/` ship **byte-equal**
`operators/plan-execute.md`, `operators/plan.md`, and
`operators/tackle.md`. The only file that differs between them is
`PROGRAM.md`. The byte-equality is enforced by
`src/test/phase-3-operators-identity.test.ts`, so accidental drift
would be caught.

This is the strongest possible form of the prediction — not just
"could be implemented the same way" but "*is* implemented the same
way, and the test suite refuses to let it diverge."

### Evaluator as a reusable component

`patterns.md`'s "Cross-cutting patterns worth naming" section flags
the separate-role evaluator as a pluggable sub-pattern. In
implementation, this turns out to be byte-level true:
`operators/evaluate.md` is **byte-equal across eight interpreters**:

- `1-iterative-refinement/b-evaluator-optimizer`
- `1-iterative-refinement/c-reflexion`
- `3-search/a-tot`
- `3-search/b-lats`
- `5-fixed-sop-teams/a-metagpt`
- `5-fixed-sop-teams/b-chatdev`
- `7-meta-framework/a-aflow-lite`
- `7-meta-framework/b-adas-lite`

Eight independent patterns, one evaluator implementation. The
survey called this out as a sub-pattern; the implementation shows
it's effectively a piece of shared infrastructure.

---

## 2. Cross-cutting concerns `patterns.md` doesn't yet name

### The call stack as a primitive

`patterns.md` describes each pattern as a flat shape. Every
non-trivial implementation in `interpreters/` uses **push/pop**:
the strategy frame loads a child operator with `## Push`, the child
runs its own state machine, returns via `## Return`, and the shell
splices the return into the caller's MEMORY. Implementation makes
push/pop a structural primitive in its own right, not an
implementation detail of any one pattern.

Concrete consequences:

- **Operators compose.** `evaluate.md` is reusable precisely because
  it runs as a pushed frame with no awareness of which strategy
  pushed it. Same for `plan.md`, `dialogue.md`, etc.
- **The asking frame is structurally distinct from the active
  frame.** This becomes load-bearing under HITL — see §3 below.
- **Peak frame count as a complexity index.** Counting how many
  frames sit on the call stack at peak gives a useful first-pass
  sort. Self-Refine lives at one frame (the strategy iterates on
  itself); Evaluator–Optimizer and Reflexion add a second frame by
  pushing a separate evaluator; Chain-of-Verification reaches three
  (strategy → verifier → per-claim answerer); ChatDev reaches three
  on its gated phases (strategy → dialogue → evaluator); AFlow-lite
  reaches four when its library operator happens to be CoVe
  (`aflow-lite → CoVe → verify → answer-independently`); Plan-and-
  Execute / Orchestrator-Workers / Deep Research are recursive and
  reach an arbitrary depth proportional to the recursion tree.

  This isn't a substitute for `patterns.md`'s taxonomy, but it's a
  useful first-pass sort when reading a new interpreter — and it
  surfaces the genuinely simpler patterns (one or two frames) from
  the genuinely deeper ones.

  *Note on counting:* the per-interpreter READMEs aren't fully
  consistent — some count pushes beyond the root, others count
  total frames. The numbers above use total-frames-at-peak as the
  convention.

### Atomic-vs-composite is the operative knob for Plan-and-Execute

`patterns.md` distinguishes Plan-and-Execute variants by whether the
decomposition is materialised up-front or emitted subtask-by-subtask
(the planner/executor split). In implementation, every recursion
level of `tackle.md` faces a different decision: **"perform this
sub-goal with one tool call, or split it into independent
sub-tasks?"** That's the actual operative knob — it decides whether
the recursion stops or deepens at each node, and it's framed
explicitly in `tackle.md` as a professional-judgement question
("would the role produce this now, or split it?").

The planner/executor split is still real, but it's mostly upstream
of this decision. Once the recursion is running, the per-node
atomic-vs-composite call is what shapes the tree.

---

## 3. HITL — missing as a cross-cutting concern

`patterns.md` names LangGraph's "human-in-the-loop pauses" and
nWave's between-wave human reviews, but doesn't elevate HITL into
its own cross-cutting concern. After shipping `c-deep-research-hitl`
and the supporting shell work, HITL reads like one. Three sub-rules
are worth naming:

- **Blocking HITL** (the LLM sets `state: waiting_for_user` and
  parks). Easy; covered by every framework.
- **Non-blocking HITL.** The LLM adds questions to a pending-queue
  without changing state, the harness delivers them, and the LLM
  *keeps cycling* on whatever it can do that doesn't depend on the
  answer. The answer is spliced in when it arrives, possibly many
  cycles later.
- **Frame-aware answer routing.** Once non-blocking HITL exists, a
  new problem appears: in a recursive call stack the asking frame
  is usually *dormant* while child frames execute. An answer
  arriving at start-of-cycle has no business landing in whichever
  frame is on top. TuringLLM's `src/question-router.ts` persists a
  `(qid → frameDir)` map so the answer reaches the asker; popped
  askers' answers go to a per-instance `orphaned-answers.md`. This
  feels like a generic concern, not specific to our shell.

The combination of the three is what enables a planner to ask "what
scope did you mean?" and *continue researching the parts of the
question it already understands*, then incorporate the answer when
it arrives. `interpreters/mas-papers/2-planning-decomposition/c-deep-research-hitl/`
is the demo.

---

## 4. Gaps and caveats

### `recursive-reviewer` — code-walking harness, uncategorised

`interpreters/coding-harnesses/recursive-reviewer/` is a BFS over
the import graph from an entry file, applying a two-stage review
(reviewer → refiner) plus verification and a regression-fix loop
per file, with a curated long-term refactor log. It maps cleanly
onto none of the eight `patterns.md` groups. It isn't iterative
refinement (it walks a graph, not one artefact), isn't planning &
decomposition (the structure is the source-import graph, not a
plan), isn't search (no branching exploration), isn't a fixed-SOP
team or a dynamic team.

A natural addition would be **"Group 9 — Code-walking / artefact-
walking harnesses"**: patterns where the unit of work is "walk an
external structure (a codebase, a directory tree, a list of
tickets) and apply a sub-pattern at each node." SWE-agent and
OpenHands sit here too once you squint past the tool-surface
framing — their main contribution is precisely the ACI, but they
also implement a walk-and-act loop over a working tree.

This is the only category gap the implementation has surfaced so
far. Worth naming, even if just to flag "we know we don't have a
slot for this."

### ReAct as "foundational substrate" — caveated

`patterns.md` frames ReAct as the foundational substrate "that made
modern agents possible." Under TuringLLM the reason↔act interleave
lives **across cycles**, not within a single prompt — every cycle is
one reasoning step that may invoke tools, and the next cycle
re-reads MEMORY to see what happened. ReAct's specific
`Thought: → Action: → Observation:` template never appears.

This isn't a contradiction (ReAct is implemented at the
tool-protocol level inside Claude/OpenAI/etc. when a cycle uses
tools), just a note that "foundational substrate" doesn't carry
through to all execution models — under a cycle-loop shell, ReAct
is implicit infrastructure rather than a visible pattern, and
patterns that build on it (Plan-and-Execute, AutoGPT, SWE-agent)
look structurally identical to non-ReAct patterns on the same
shell.

---

## What's deliberately *not* here

- A revised taxonomy. `patterns.md` is the survey; this file is
  notes. If the cross-cutting concerns in §2–3 are eventually
  promoted into the taxonomy proper, that's an edit to
  `patterns.md`, not a competing top-level structure here.
- Implementation-specific advice (how to write an operator, the
  shape of a state machine, surgical-append conventions). That
  lives in `CLAUDE.md` and the per-interpreter READMEs.
- A scorecard of which patterns we've implemented vs. not. Open
  `interpreters/README.md` for that.
