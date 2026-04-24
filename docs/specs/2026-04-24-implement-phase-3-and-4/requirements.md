# Requirements: agent-workflows Phase 3 + Phase 4

## Context

Phase 3 and Phase 4 of the agent-workflows roadmap (see
`docs/agent-workflows/requirements.md` §Phase 3 and §Phase 4). **Phase 3**
delivers the collapsed Plan-and-Execute family (patterns.md Group 2):
three canonical framings — Plan-and-Execute, Orchestrator–Workers, Deep
Research — that share a single state machine under the current
sequential shell, exposed as three separate leaf interpreters whose
`INSTRUCTIONS.md` and `dynamics/` are byte-identical but whose
`PROGRAM.md` differs. **Phase 4** delivers two Fixed-SOP Team
interpreters (patterns.md Group 5) — MetaGPT (document hand-off) and
ChatDev (phase dialogue) — running on the **same** PROGRAM.md so outputs
are directly comparable, and retires the legacy
`interpreters/game-team/` in the same change set.

Both phases together satisfy the plan's explicit "Phase 4 exists to
retire game-team" promise (Phase 1 §R15 guarded game-team until now) and
extend the reusable dynamics library: Phase 3 introduces `plan.md`,
`execute-step.md`, and `synthesize.md`; Phase 4 introduces four
`role-*.md` files (for MetaGPT) and `dialogue.md` (for ChatDev), and
re-uses `evaluate.md` from Phase 1b via byte-equal copies per
interpreter (matching the Phase-1 identity-test convention).

This spec also adds two new shell tools, `web_search` and `web_fetch`,
so the deep-research demo can ground its findings in current sources
rather than relying exclusively on training-data recall. The tools are
backend-pluggable (DuckDuckGo is the first backend; Brave, Tavily, and
SearxNG are natural follow-ups), picked up automatically by every
provider via `getTools()`, and depend on an established HTML-parsing
library rather than hand-rolled regex.

Pre-spec groundwork already landed in `docs/agent-workflows/requirements.md`
and `patterns.md`: the Group-2 collapse (Plan-and-Execute now subsumes
Orchestrator–Workers, Deep Research, and XAgent), the deletion of
speculative `worker.md` / `investigate.md` / `invoke-skill.md` /
`install-skill.md` from the dynamics table, the reframing of the Skill
library as a convention over existing primitives, and the relocation of
SPP to "Building blocks — Prompting techniques". Those edits are
pre-requisites for R39 and are not re-stated here.

## User stories

- **US1**: As an agent-patterns researcher, I want the plan-execute
  baseline runnable in three demos — Plan-and-Execute, sequential
  Orchestrator–Workers, and Deep Research — so that I can see all three
  framings produce distinct traces from the same strategy.
- **US2**: As an interpreter author, I want three new reusable dynamics
  (`plan.md`, `execute-step.md`, `synthesize.md`) with normative
  `## Push-Args` contracts, so later phases (Phase 5 Debate reviewer,
  Phase 7 AFlow operator) can compose them without copy-paste.
- **US3**: As an agent-patterns researcher, I want the two fixed-SOP
  team interpreters (MetaGPT document hand-off and ChatDev phase
  dialogue) runnable on an **identical** PROGRAM.md, so I can directly
  compare the two Group-5 framings on the same task.
- **US4**: As a repo maintainer, I want `interpreters/game-team/` retired
  in this spec (directory deleted, docs updated, shell features it
  exercised validated as still exercised by the new interpreters), so
  the shell's fuzzy-NL-condition / non-blocking-questions / strategy-push
  features do not silently regress when game-team leaves the tree.
- **US5**: As a future phase author, I want a short notes file capturing
  surprises discovered during Phase-3/4 implementation, continuing the
  `phase-N-notes.md` convention.
- **US6**: As someone running the deep-research demo, I want the shell
  to ship `web_search` and `web_fetch` tools (backed by a real search
  API, not hand-rolled HTML scraping) so the demo can actually ground
  its findings in current sources rather than training-data recall.

## Acceptance criteria (EARS)

Each requirement has a stable ID. R# IDs do not get renumbered across
refinements — additions get the next free number; removals are
struck-through and kept for traceability.

### Phase 3 directory layout

- **R1**: THE SYSTEM SHALL introduce three leaf interpreter directories
  under `interpreters/2-planning-decomposition/`: `a-plan-execute/`,
  `b-orchestrator-workers/`, and `c-deep-research/`.
- **R2**: EACH leaf SHALL contain, at minimum, `INSTRUCTIONS.md`,
  `PROGRAM.md`, a `dynamics/` directory, and `README.md`.
- **R3**: THE `INSTRUCTIONS.md` files of the three leaves SHALL be
  byte-identical.
- **R4**: THE `dynamics/` directories of the three leaves SHALL each
  contain byte-identical copies of `plan.md`, `execute-step.md`, and
  `synthesize.md`.
- **R5**: THE SYSTEM SHALL add `src/test/phase-3-dynamics-identity.test.ts`
  asserting the byte-equality invariants of R3 and R4.

### Phase 3 dynamics (contracts)

- **R6**: `plan.md` SHALL consume `{{goal}}` via `## Push-Args` and, when
  re-pushed for replanning, `{{results_so_far}}`; SHALL emit `## Plan` to
  MEMORY; SHALL return `## Plan` via `## Return`; SHALL set state `done`.
- **R7**: `execute-step.md` SHALL consume `{{current_step}}` and
  `{{context}}` via `## Push-Args`; SHALL emit `## Step Result` via
  `## Return`; SHALL set state `done`. It MAY re-push `plan.md` within
  its frame for recursive sub-planning, and MAY push `evaluate.md` as a
  step-acceptance gate.
- **R8**: `synthesize.md` SHALL consume `{{results}}` via `## Push-Args`;
  SHALL produce an aggregated artefact appropriate to the task (a short
  wrap-up when there is nothing to aggregate, a report when there is);
  SHALL emit `## Report` via `## Return`; SHALL set state `done`. Its
  instruction text SHALL handle both terminal-summary and full-report
  cases so the same dynamic works across all three demos.
- **R9**: EVERY Phase-3 push SHALL pass all required inputs via
  `## Push-Args` (no dynamic SHALL read MEMORY sections produced by the
  caller), matching the Phase-2b arguments-via-INSTRUCTIONS convention.

### Phase 3 strategy

- **R10**: THE Phase-3 strategy SHALL follow a state machine that
  (a) on state `empty`, reads PROGRAM.md and initialises `## Goal`;
  (b) pushes `plan.md` with `{{goal}}` to produce `## Plan`;
  (c) iterates, pushing `execute-step.md` for each plan step with
  `{{current_step}}` + `{{context}}`, and accumulating each return into
  `## Results`;
  (d) pushes `synthesize.md` with `{{results}}` as a terminal step;
  (e) sets state `done`.
- **R11**: WHEN an `execute-step.md` return indicates failure or a
  materially new context, THE strategy SHALL re-push `plan.md` with
  `{{results_so_far}}` populated to trigger a replan.
- **R12**: THE strategy section of each Phase-3 `INSTRUCTIONS.md` SHALL
  declare the "copied verbatim on every `update_instructions`"
  convention (matching the opening directive established by Phase 1's
  interpreters).

### Phase 3 demos (live runs)

- **R13**: `a-plan-execute/PROGRAM.md` SHALL specify a TypeScript
  project-setup demo (exact content deferred to Design — OQ2).
- **R14**: `b-orchestrator-workers/PROGRAM.md` SHALL instruct the
  interpreter to analyse the files under `workspace/inputs/` and
  produce a unified summary. THE leaf directory SHALL ship exactly five
  input files under `workspace/inputs/` (exact content deferred to
  Design — OQ2).
- **R15**: `c-deep-research/PROGRAM.md` SHALL pose an open research
  question whose unambiguous answer requires decomposing into at least
  one sub-question that itself requires further decomposition (exact
  question deferred to Design — OQ2). THE LLM MAY use the `web_search`
  and `web_fetch` tools introduced by R54–R55 to ground its findings;
  the demo's structural validation (R19) does not depend on web
  availability.
- **R16**: WHEN each Phase-3 demo is run via
  `./new-instance.sh <name> interpreters/2-planning-decomposition/<leaf>`
  followed by `instances/<name>/run.sh` under the default provider
  (`TURING_PROVIDER=claude-code`, default `CC_MODEL`), THE SYSTEM SHALL
  halt at MEMORY `## State\ndone` without manual intervention.
- **R17**: THE live `a-plan-execute` run SHALL trigger at least one
  `plan.md` re-push (replan), evidenced by at least two `plan.md`
  frames in the snapshot sequence under `history/`.
- **R18**: THE live `b-orchestrator-workers` run SHALL push
  `execute-step.md` exactly once per input file under `workspace/inputs/`
  (five pushes for R14's five inputs).
- **R19**: THE live `c-deep-research` run SHALL trigger at least one
  recursive `plan.md` push from inside an `execute-step.md` frame
  (stack depth 2), evidenced by at least one snapshot in `history/`
  whose `.call-stack.json` contains an `execute-step` frame followed by
  a `plan` child frame.

### Phase 4 directory layout

- **R20**: THE SYSTEM SHALL introduce two leaf interpreter directories
  under `interpreters/5-fixed-sop-teams/`: `a-metagpt/` and `b-chatdev/`.
- **R21**: EACH leaf SHALL contain `INSTRUCTIONS.md`, `PROGRAM.md`,
  a `dynamics/` directory, and `README.md`. `b-chatdev/` SHALL
  additionally contain a `roles/` directory with one `.md` file per
  participant referenced by `dialogue.md` push-args (e.g. `roles/ceo.md`,
  `roles/cto.md`, `roles/coder.md`, `roles/reviewer.md`).
- **R22**: `a-metagpt/PROGRAM.md` AND `b-chatdev/PROGRAM.md` SHALL be
  byte-identical (the comparability of outputs is the whole purpose of
  Phase 4's structure).

### Phase 4 dynamics (contracts)

- **R23**: `a-metagpt/dynamics/` SHALL contain `role-pm.md`,
  `role-architect.md`, `role-engineer.md`, `role-qa.md`, and a
  byte-equal copy of `evaluate.md`.
- **R24**: EACH `role-*.md` dynamic SHALL consume the prior role's
  typed hand-off via `## Push-Args` (`role-architect.md` receives
  `{{prd}}`; `role-engineer.md` receives `{{design}}`; `role-qa.md`
  receives `{{code_tasks}}`); SHALL emit its own typed hand-off via
  `## Return` — respectively `## PRD`, `## Design`, `## Tasks`,
  `## Code Review`; SHALL set state `done`.
- **R25**: `role-qa.md` SHALL push `evaluate.md` to gate its Code Review
  before returning, re-using the Phase-1b dynamic verbatim.
- **R26**: `b-chatdev/dynamics/` SHALL contain `dialogue.md` and a
  byte-equal copy of `evaluate.md`.
- **R27**: `dialogue.md` SHALL consume `{{participants}}` (a comma-
  separated list of role names matching files under `../roles/`) and
  `{{topic}}` via `## Push-Args`; SHALL read the named role files to
  populate participant personas; SHALL emit the phase's typed output
  (content depending on the phase — design/coding/testing/documenting)
  via `## Return`; SHALL set state `done`.
- **R28**: IN `b-chatdev`, REVIEWER-containing dialogues (coding review,
  testing, documentation review) SHALL push `evaluate.md` as an
  acceptance gate before returning.
- **R29**: THE `evaluate.md` files at
  `a-metagpt/dynamics/evaluate.md`,
  `b-chatdev/dynamics/evaluate.md`,
  `b-evaluator-optimizer/dynamics/evaluate.md`, and
  `c-reflexion/dynamics/evaluate.md`
  SHALL be byte-identical. THE SYSTEM SHALL extend the existing
  `src/test/phase-1-dynamics-identity.test.ts` (or add a replacement)
  to assert the four-way identity.

### Phase 4 strategy

- **R30**: THE `a-metagpt` strategy SHALL walk the phases
  PM → Architect → Engineer → QA in order, pushing one role dynamic per
  phase and forwarding the prior role's return section as the next
  push's `## Push-Args`.
- **R31**: THE `b-chatdev` strategy SHALL walk the phases
  design → coding → testing → documenting in order, pushing
  `dialogue.md` per phase with role pairs (e.g. CEO↔CTO for design,
  coder↔reviewer for coding) and forwarding prior phases' outputs as
  needed via `## Push-Args`.

### Phase 4 demos (live runs)

- **R32**: WHEN either Phase-4 demo is run via
  `./new-instance.sh <name> interpreters/5-fixed-sop-teams/<leaf>`
  followed by `instances/<name>/run.sh` under the default provider,
  THE SYSTEM SHALL halt at `## State\ndone` without manual
  intervention.
- **R33**: THE final MEMORY of each Phase-4 demo run SHALL contain the
  full typed hand-off sections: for 4a the four sections `## PRD`,
  `## Design`, `## Tasks`, `## Code Review`; for 4b the four
  phase-outcome sections (exact names deferred to Design — OQ1).
- **R34**: THE two Phase-4 demos (running on the same PROGRAM.md) SHALL
  each produce working artefacts in `workspace/` that satisfy the
  `evaluate.md` acceptance gate pushed by their respective review
  steps.

### Game-team retirement

- **R35**: THE SYSTEM SHALL delete `interpreters/game-team/` in its
  entirety (directory and all files).
- **R36**: THE SYSTEM SHALL update `CLAUDE.md`'s "Existing interpreters"
  section: remove the `game-team` entry; add entries for the three
  Phase-3 leaves and the two Phase-4 leaves, each with a one-line
  description pointing at its `patterns.md` group.
- **R37**: THE SYSTEM SHALL remove the "game-team exempt" language
  wherever it appears in `CLAUDE.md`, `docs/agent-workflows/requirements.md`
  (guiding principle 3, directory-layout convention exemption, and
  the "Existing interpreters" game-team line in patterns coverage),
  and `interpreters/<group>/README.md` files — game-team is gone, so
  the exemptions are moot.
- **R38**: THE SYSTEM SHALL update `README.md` (repo root) to remove
  or replace any example that references `game-team` as a runnable
  interpreter.
- **R39**: THE SYSTEM SHALL update `docs/agent-workflows/requirements.md`
  §Phase 3 and §Phase 4 to reference the final paths of the five new
  interpreters (`interpreters/2-planning-decomposition/a-plan-execute/`,
  `.../b-orchestrator-workers/`, `.../c-deep-research/`,
  `interpreters/5-fixed-sop-teams/a-metagpt/`, `.../b-chatdev/`) and to
  state the phases as complete.
- **R40**: THE shell-level features that `game-team` exercised SHALL
  continue to be exercised by at least one of the new interpreters,
  validated as follows:
  (a) **fuzzy NL condition matching** — at least one Phase-3 or Phase-4
      `INSTRUCTIONS.md` SHALL use fuzzy natural-language conditions
      (e.g. "state suggests the plan is complete") rather than
      exact-string matching;
  (b) **non-blocking `## Pending Questions`** — at least one Phase-4
      role dynamic or `dialogue.md` SHALL be capable of appending to
      `## Pending Questions` without changing state (blocking on
      answers only if all remaining work is blocked);
  (c) **strategy-level `## Push`** — every Phase-3 and Phase-4
      interpreter pushes dynamics from the strategy, so (c) is trivially
      exercised.
  An integration test SHALL script a MEMORY sequence demonstrating (a)
  and (b) on one of the new interpreters without calling an LLM.

### Tests

- **R41**: IF the implementation introduces any new pure-function
  TypeScript helper under `src/`, THEN unit tests covering it SHALL be
  added under `src/test/`, matching the style of existing tests for
  `memory.ts` and `call-stack.ts`.
- **R42**: THE SYSTEM SHALL add per-interpreter integration tests
  (`src/test/phase-3-plan-execute.test.ts`,
  `phase-3-orchestrator-workers.test.ts`,
  `phase-3-deep-research.test.ts`,
  `phase-4-metagpt.test.ts`,
  `phase-4-chatdev.test.ts`) that script a MEMORY sequence through each
  interpreter's push/pop transitions without calling an LLM, asserting
  the resulting `{call_stack, frame_dirs, memory}` matches the
  intended flow.
- **R43**: THE integration tests of R42 SHALL together demonstrate
  stack depth ≥ 2 for `phase-3-deep-research.test.ts` (recursive
  `plan.md` inside `execute-step.md` — see R19) and stack depth ≥ 2
  for `phase-4-metagpt.test.ts` (QA pushing `evaluate.md` — see R25).
- **R44**: WHEN `npm test` runs from the repo root on a clean checkout,
  all existing and new tests SHALL pass with zero failures.

### Documentation

- **R45**: EACH Phase-3 leaf SHALL ship a `README.md` matching the
  Phase-1 leaf convention (literature citation, state machine,
  dynamics table, demo description, run-it instructions, known
  behaviour). Per R65, because the Phase-3 strategy collapses four
  published patterns, each leaf's `README.md` SHALL:
  (a) state up front which specific framing the leaf demonstrates
      (`a-plan-execute` → Plan-and-Execute, Wang et al. 2023;
      `b-orchestrator-workers` → Orchestrator–Workers, Anthropic
      2024; `c-deep-research` → Deep Research, product pattern with
      Self-Ask ancestry, Press et al.);
  (b) additionally name the other three framings the shared strategy
      subsumes, with a one-line citation for each, so a reader
      arriving at any single leaf learns the full collapse story
      without hunting;
  (c) reference the `patterns.md` Group-2 consolidated entry
      ("Plan-and-Execute (includes Orchestrator–Workers, Deep
      Research, XAgent)");
  (d) link to the sibling leaves and to the group-level README.
- **R46**: THE SYSTEM SHALL add
  `interpreters/2-planning-decomposition/README.md` framing the three
  leaves as the same strategy with three demos. Per R65, the group
  README SHALL explicitly name and cite every published pattern the
  strategy subsumes: **Plan-and-Execute** (Wang et al. 2023,
  "Plan-and-Solve", arXiv:2305.04091), **Orchestrator–Workers**
  (Anthropic 2024, "Building Effective Agents"), **Deep Research**
  (product pattern; academically Self-Ask — Press et al.,
  arXiv:2210.03350), and **XAgent** (OpenBMB / Tsinghua, tech report
  2023). The README SHALL explain the collapse rationale in its own
  words (why one implementation suffices under the current sequential
  shell), reference `patterns.md` Group 2, explain the byte-equality
  enforcement (R5), list the shared dynamics, and clarify which
  framings have dedicated demo leaves (PE / OW / DR) and which are
  subsumed without a dedicated leaf (XAgent — a prompt-level
  variant of Plan-and-Execute).
- **R47**: EACH Phase-4 leaf SHALL ship a `README.md` matching the
  Phase-1 leaf convention.
- **R48**: THE SYSTEM SHALL add
  `interpreters/5-fixed-sop-teams/README.md` framing MetaGPT (document
  hand-off) and ChatDev (phase dialogue) as two framings of fixed-SOP
  teams sharing a demo PROGRAM.md, with a comparison table.
- **R49**: THE SYSTEM SHALL add `docs/agent-workflows/phase-3-4-notes.md`
  summarising anything surprising discovered during implementation;
  if nothing was surprising the file SHALL state that explicitly in
  one line, matching `phase-1-notes.md` / `phase-2-notes.md`.
- **R50**: IF any dynamic's MEMORY contract diverges from the row in
  the dynamics table at the top of `docs/agent-workflows/requirements.md`,
  THEN the table SHALL be updated in the same change set.
- **R65**: WHEREVER this spec (or any future spec that inherits this
  convention) implements a single strategy that subsumes two or more
  named patterns from `patterns.md` (a "collapsed pattern"), the
  corresponding leaf `README.md` files AND the corresponding
  group-level `README.md` SHALL name every subsumed pattern with a
  brief source citation, AND SHALL state the collapse rationale (why
  one implementation suffices under the current shell). This prevents
  the taxonomy from becoming invisible in the filesystem: a reader
  who finds `a-plan-execute/` should still learn that it also
  demonstrates Orchestrator–Workers, Deep Research, and XAgent
  without having to read `patterns.md` first. Applies concretely in
  this spec to the three Phase-3 leaf READMEs (R45) and
  `interpreters/2-planning-decomposition/README.md` (R46); Phase 4's
  two leaves (`a-metagpt`, `b-chatdev`) are **not** a collapse —
  they are distinct patterns sharing a demo — so R65 does not
  additionally constrain their READMEs beyond the Phase-1
  convention.

### Web-capability tools (shell extension for deep-research demo)

- **R54**: THE SYSTEM SHALL add a new `web_search` tool to the shell's
  tool set in `src/tools.ts`. Input schema: one required string
  parameter `query`. Output: a JSON-encoded string containing an array
  of result objects of shape `{ title: string, url: string, snippet:
  string }`, up to a maximum of N=10 results per call (exact cap
  chosen in Design — OQ6).
- **R55**: THE SYSTEM SHALL add a new `web_fetch` tool to
  `src/tools.ts`. Input schema: one required string parameter `url`.
  Output: the page's visible text content extracted from its HTML via
  an established HTML-parsing library (`cheerio` or equivalent named
  in Design — OQ6). `<script>`, `<style>`, and other non-content
  elements SHALL be removed before extraction. Whitespace SHALL be
  collapsed for token-efficient output. No hand-rolled regex HTML
  parsing.
- **R56**: BOTH tools SHALL be backend-pluggable. `web_search` SHALL
  dispatch to a backend module (default: DuckDuckGo; additional
  backends such as Brave, Tavily, SearxNG, Wikipedia MAY be added in
  future specs without changing the tool schema). The backend SHALL be
  selectable via an environment variable (exact name chosen in
  Design — OQ6) with DuckDuckGo as default.
- **R57**: THE default `web_search` backend SHALL use DuckDuckGo via
  an established npm client library or DuckDuckGo's published API
  endpoint — NOT hand-rolled HTML scraping. The specific library or
  endpoint choice SHALL be made in Design (OQ6) with the constraint
  that it requires no API key and has an MIT-compatible licence.
- **R58**: WHEN a web_search call returns no results, or the backend
  is unreachable or times out, THE tool SHALL return a JSON-encoded
  empty array `[]` together with a diagnostic `note` field describing
  the condition (e.g. `{ "results": [], "note": "backend timeout" }`).
  THE tool SHALL NOT throw an unhandled error in these cases.
- **R59**: WHEN a web_fetch call encounters a non-2xx HTTP status, a
  timeout, or a non-HTML content type (e.g. PDF, image), THE tool
  SHALL return a diagnostic string describing the condition (status
  code, timeout, content-type) rather than throwing. Binary content
  types SHALL NOT be forwarded verbatim.
- **R60**: BOTH tools SHALL enforce a per-call timeout (exact value
  chosen in Design — OQ6). The timeout SHALL be configurable via an
  environment variable, matching the pattern established by
  `BASH_TIMEOUT`.
- **R61**: THE web tools SHALL be surfaced to every provider this
  repository supports, with per-provider-family paths reflecting how
  each provider dispatches tools:
  (a) For providers that read their tool schema from `getTools()` in
      `src/tools.ts` — Anthropic SDK, OpenAI, Ollama, local — adding
      the tools to `getTools()` + `executeTool()` SHALL be sufficient.
      The custom implementation in `src/web-tools.ts` (per R56–R60)
      services these providers.
  (b) For the Claude Code provider — which invokes `claude -p` as a
      subprocess with its own `--allowedTools` list and does NOT read
      `getTools()` — the enabling requirements live in R66.
  BOTH paths SHALL be implemented in this spec.
- **R62**: THE SYSTEM SHALL add `cheerio` (or the equivalent
  HTML-parsing library chosen in Design — OQ6) as a runtime
  dependency in `package.json` with a pinned version. IF Design
  chooses an npm DuckDuckGo client library, that library SHALL also be
  added as a pinned runtime dependency.
- **R63**: THE SYSTEM SHALL add unit tests for both tools under
  `src/test/web-tools.test.ts` (or per-tool files) covering:
  (a) successful search with a known query returning well-formed
      results;
  (b) successful fetch of an HTML page with text extraction;
  (c) empty / unreachable backend returning the diagnostic shape from
      R58;
  (d) non-2xx HTTP / non-HTML content type returning the diagnostic
      shape from R59;
  (e) timeout enforcement from R60;
  (f) under a separate test file for the Claude Code provider path
      (R66), assert that the `--allowedTools` arg array constructed
      by `src/providers/claude-code.ts` includes `WebSearch` and
      `WebFetch`. This is a static / arg-construction test; no
      `claude` subprocess is invoked during `npm test`.
  Network traffic during `npm test` SHALL be stubbed (no outbound
  calls to real DuckDuckGo / real URLs).
- **R64**: CLAUDE.md SHALL be updated to list `web_search` and
  `web_fetch` in its discussion of shell-provided tools, alongside
  `bash`, `write_file`, `git`, `update_instructions`. CLAUDE.md's
  "Shared Configuration" section SHALL document the environment
  variables introduced by R56 and R60. THE Claude-Code-provider
  section of CLAUDE.md SHALL separately mention that the CC provider
  uses CC's native `WebSearch` and `WebFetch` tools (not our custom
  implementation), per R66.
- **R66**: THE Claude Code provider's `claude -p` subprocess
  invocation in `src/providers/claude-code.ts` SHALL add Claude Code's
  native `WebSearch` and `WebFetch` tools to its `--allowedTools`
  list. The `CC_TOOLS_SECTION` of the system prompt in
  `src/prompt.ts` SHALL document these two tools alongside the
  existing `Bash`, `Write`, `Edit` documentation, using Claude Code's
  native (PascalCase) tool names. Under the CC provider the web
  tools are served by Claude Code's built-in implementations
  (outside this repository's control); the custom implementation in
  `src/web-tools.ts` (R56–R60) is NOT exercised under CC. Test
  coverage under CC is therefore limited to asserting that the
  `--allowedTools` argument construction includes `WebSearch` and
  `WebFetch` — no unit tests for CC's native backends are in scope.

### Shell scope

- **R51**: WHERE implementation surfaces a shell bug that blocks any
  Phase-3 or Phase-4 requirement above, THE SYSTEM SHALL fix the bug
  within this spec.
- **R52**: THE SYSTEM SHALL defer shell-level refactors and new shell
  features not required by R1–R66 to a separate spec; only
  non-breaking, additive improvements SHALL be permitted inside this
  spec. The web tools (R54–R66) are the deliberate and only exception
  to the "no new shell features" rule in this spec: they are
  additive, non-CC providers pick them up via `getTools()` with no
  dispatch changes (R61a), CC picks them up via its `--allowedTools`
  list (R66), and they are required by the deep-research demo (R15).
- **R53**: IF a Phase-3 or Phase-4 demo run exhausts the shell's retry
  budget without advancing state, THEN THE SYSTEM SHALL exit via the
  existing retry-exhaustion code path — no new error surface
  introduced — matching Phase 1's R22 and Phase 2's R27.

## Out of scope

- **`b-rewoo` interpreter** — Phase 3's optional ReWOO variant is
  deferred to a future spec; ReWOO has a genuinely distinct executor
  shape (batched `#E1, #E2, …` placeholder resolution) that does not
  collapse onto the `a-plan-execute` strategy. Build when a demo
  demands batched execution.
- **Parallel Orchestrator–Workers** — genuine parallel fan-out
  requires parallel stack frames, a shell-level change listed under
  "Open questions / future shell work" in the plan. Deferred.
- **Skill library infrastructure** — no `invoke-skill.md`, no
  `install-skill.md`, no `workspace/skills/` dedicated layout. The
  convention (LLM-authored dynamics under `dynamics/` + `## Push`)
  is already documented in the plan as a convention over existing
  primitives; no shell or cross-cutting deliverable belongs to this
  spec.
- **Any Phase 5, 5b, 6, 6b, 7, or 8 interpreter or dynamic** —
  Debate, MoA, ToT, LATS, AFlow-lite, ADAS-lite. Explicit sequential
  phase order in the plan.
- **CAMEL** — skipped per plan (two-role conversation adds little
  over 4b's `dialogue.md`).
- **SPP (Solo Performance Prompting)** — relocated in the plan to
  "Out of scope → Building blocks (Prompting techniques)" because
  under the sequential shell it is a single-cycle prompt pattern and
  does not exercise the stack. Not an interpreter.
- **Promoting `evaluate.md` to a shared location** — Phase 2's
  `notes.md` deferred promotion to a fourth consumer. R29 adds
  `a-metagpt` and `b-chatdev` as consumers 3 and 4 via byte-equal
  copies + a four-way identity assertion, deliberately continuing the
  duplication-plus-test pattern. Whether to promote to a shared
  `dynamics/shared/evaluate.md` is re-deferred (see OQ5); this spec
  keeps byte-equality.
- **Migration of existing instances under `instances/`** — existing
  instances snapshot their INSTRUCTIONS and dynamics at creation
  time; retirement of `interpreters/game-team/` does not touch any
  instance that was created from it. Existing game-team instances
  continue to run until their current run completes (or are wiped
  by the user).
- **Additional web-search backends** beyond the DuckDuckGo default:
  Brave, Tavily, SearxNG, Wikipedia, etc. are deliberately architected
  for (R56 — backend-pluggable) but only the DuckDuckGo default is
  shipped by this spec. A future spec adds other backends.
- **API-keyed search providers** (Brave, Tavily, Serper, etc.) — their
  API-key management is a separate scope; this spec's default backend
  SHALL be keyless (R57).
- **New providers (Anthropic SDK / Claude Code / OpenAI / Ollama /
  local), new shell features beyond R51–R66, or `src/main.ts`
  refactors not required for R1–R66.**

## Open questions

- **OQ1**: Exact typed hand-off section names for `b-chatdev`'s four
  phases (design/coding/testing/documenting). Needed to finalise R33.
  Deferred to Design.
- **OQ2**: Exact content of the three Phase-3 PROGRAM.md files and
  of the five `b-orchestrator-workers/workspace/inputs/` files.
  Shape is chosen to exercise the validation in R17–R19; the concrete
  artefacts that best hit those targets are design-level choices.
  Deferred to Design.
- **OQ3**: How `synthesize.md` decides between short wrap-up and full
  report — driven by PROGRAM cues, handled inside `synthesize.md`'s
  prompt, or the strategy chooses which of two paths to push. Affects
  R8's wording and whether one dynamic suffices for all three demos.
  Deferred to Design.
- **OQ4**: Whether `role-*.md` dynamics in 4a and `dialogue.md` in 4b
  share a common "read a `roles/*.md` file" scaffolding helper, or
  each is fully self-contained for clarity. Affects dynamic authoring
  style and the Phase-4 leaf READMEs. Deferred to Design.
- **OQ5**: Whether the four byte-equal `evaluate.md` copies
  (`b-evaluator-optimizer`, `c-reflexion`, `a-metagpt`, `b-chatdev`)
  should be promoted to a shared location (e.g.
  `interpreters/shared/dynamics/evaluate.md`) with each leaf's
  `dynamics/evaluate.md` replaced by a symlink or a copy produced at
  `new-instance.sh` time. Phase-2 `notes.md` deferred promotion to
  the "fourth consumer"; this spec creates consumers 3 and 4. The
  default (R29) keeps byte-equal copies + a four-way identity test;
  Design decides whether to change that default.
- **OQ6**: Backend library / endpoint choices for the web tools:
  (a) which DuckDuckGo client to use for `web_search` — DDG's
      Instant Answer JSON endpoint (limited but keyless and stable),
      an npm wrapper, or a small list of public SearxNG instances;
  (b) which HTML-parsing library for `web_fetch` — `cheerio`
      (jQuery-like, heavier), `node-html-parser` (lighter, fast), or
      another;
  (c) default result cap for `web_search` (R54) — expected 5–10;
  (d) default per-call timeout (R60) — expected 10–30 seconds;
  (e) environment variable names for backend selection (R56) and
      timeout (R60).
  Design picks concrete values/libraries and pins versions.
- **OQ7**: Fallback behaviour when the default DuckDuckGo backend
  returns no useful results or is unreachable: stay silent with the
  R58 diagnostic shape, or attempt a configured fallback backend
  automatically. R58 commits to the silent-diagnostic behaviour;
  Design confirms whether a fallback chain is in-scope for this spec
  or deferred to a future backend-expansion spec.
