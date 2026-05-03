# Design: agent-workflows Phase 3 + Phase 4

## Overview

This design delivers the five interpreters + two new shell tools specified
in the requirements, grouped by three orthogonal work streams:

- **Stream A (Phase 3).** One strategy, three leaf interpreters
  (`a-plan-execute`, `b-orchestrator-workers`, `c-deep-research`) with
  byte-identical `INSTRUCTIONS.md` + `dynamics/`. Three dynamics shared
  across the leaves: `plan.md`, `execute-step.md`, `synthesize.md`. A
  new identity test pins the byte-equality.
- **Stream B (Phase 4).** Two strategy-distinct leaf interpreters under
  `5-fixed-sop-teams/`: `a-metagpt` (role hand-off) with four `role-*.md`
  dynamics, `b-chatdev` (phase dialogue) with one `dialogue.md` dynamic
  + role descriptions under `b-chatdev/roles/`. Both ship a byte-equal
  copy of `evaluate.md` (reused from Phase 1b); the existing
  `phase-1-dynamics-identity.test.ts` is extended to a four-way
  identity assertion. Game-team is deleted in the same change set and
  the shell-level features it exercised are re-homed to Phase-4 leaves.
- **Stream C (Web tools).** Two new shell tools — `web_search` and
  `web_fetch` — added to `src/tools.ts` with backend-pluggable
  dispatch under `src/web-tools.ts`. The default search backend is
  DuckDuckGo's `html.duckduckgo.com` endpoint parsed with `cheerio`;
  `web_fetch` uses native `fetch` plus `cheerio` to strip markup.
  Tests stub `globalThis.fetch`.

The key trade-off is **duplication-plus-identity-test over
shared-location symlinks** for byte-equal files — it preserves the
`interpreter/` = self-contained-unit invariant and keeps
`new-instance.sh` trivial, at the cost of five byte-equal
`evaluate.md` copies (two from Phase 1, two new in Phase 4) enforced
by one test. OQ5 in requirements raised the question; this design
commits to keeping the copies.

All OQs from requirements.md are resolved in §Resolved open questions
at the end; §Open questions is `(none)`.

## Requirement coverage

Every R# from `requirements.md` appears in exactly one row.

| R#  | Summary                                                | Addressed in                                      |
| --- | ------------------------------------------------------ | ------------------------------------------------- |
| R1  | Three Phase-3 leaves introduced                        | §File layout                                      |
| R2  | Leaf contents (INSTRUCTIONS + PROGRAM + dynamics + README) | §File layout                                 |
| R3  | INSTRUCTIONS.md byte-identical across Phase-3 leaves   | §File layout, §Test strategy                      |
| R4  | dynamics byte-identical across Phase-3 leaves          | §File layout, §Test strategy                      |
| R5  | `phase-3-dynamics-identity.test.ts`                    | §Test strategy                                    |
| R6  | `plan.md` contract                                     | §Phase 3 dynamics → plan.md                       |
| R7  | `execute-step.md` contract                             | §Phase 3 dynamics → execute-step.md               |
| R8  | `synthesize.md` contract                               | §Phase 3 dynamics → synthesize.md                 |
| R9  | Every Phase-3 push uses `## Push-Args`                 | §Phase 3 strategy                                 |
| R10 | Phase-3 state machine                                  | §Phase 3 strategy                                 |
| R11 | Replan on step failure                                 | §Phase 3 strategy → `Route after step`            |
| R12 | "Strategy preserved verbatim" directive                | §Phase 3 strategy                                 |
| R13 | `a-plan-execute/PROGRAM.md` TS-project demo            | §Phase 3 demos → d1                               |
| R14 | `b-orchestrator-workers/PROGRAM.md` + 5 input files    | §Phase 3 demos → d2                               |
| R15 | `c-deep-research/PROGRAM.md` recursive question        | §Phase 3 demos → d3                               |
| R16 | Live demos halt at `done`                              | §Phase 3 demos, §Test strategy                    |
| R17 | a-plan-execute triggers ≥1 replan                      | §Phase 3 demos → d1 validation                    |
| R18 | b-orchestrator-workers pushes exactly 5 execute-steps  | §Phase 3 demos → d2 validation                    |
| R19 | c-deep-research triggers stack depth ≥2                | §Phase 3 demos → d3 validation                    |
| R20 | Two Phase-4 leaves under `5-fixed-sop-teams/`          | §File layout                                      |
| R21 | Leaf contents + `b-chatdev/roles/`                     | §File layout                                      |
| R22 | Phase-4 PROGRAM.md byte-identical across the two leaves | §File layout, §Test strategy                     |
| R23 | `a-metagpt/dynamics/` inventory                        | §Phase 4 dynamics → role dynamics                 |
| R24 | `role-*.md` contracts                                  | §Phase 4 dynamics → role dynamics                 |
| R25 | `role-qa.md` pushes `evaluate.md`                      | §Phase 4 dynamics → role-qa                       |
| R26 | `b-chatdev/dynamics/` inventory                        | §Phase 4 dynamics → dialogue.md                   |
| R27 | `dialogue.md` contract                                 | §Phase 4 dynamics → dialogue.md                   |
| R28 | Reviewer-pair dialogues push `evaluate.md`             | §Phase 4 strategy → b-chatdev                     |
| R29 | `evaluate.md` four-way byte identity                   | §File layout, §Test strategy                      |
| R30 | `a-metagpt` strategy walks PM→Architect→Engineer→QA    | §Phase 4 strategy → a-metagpt                     |
| R31 | `b-chatdev` strategy walks design→coding→testing→docs  | §Phase 4 strategy → b-chatdev                     |
| R32 | Phase-4 live demos halt at `done`                      | §Phase 4 demo, §Test strategy                     |
| R33 | Final MEMORY contains typed hand-off sections          | §Phase 4 strategy, §Resolved OQ1                  |
| R34 | Both Phase-4 demos produce working artefacts in `workspace/` | §Phase 4 demo                               |
| R35 | Delete `interpreters/game-team/`                       | §Game-team retirement                             |
| R36 | Update CLAUDE.md "Existing interpreters"               | §Game-team retirement                             |
| R37 | Remove "game-team exempt" language                     | §Game-team retirement                             |
| R38 | Update README.md game-team references                  | §Game-team retirement                             |
| R39 | Update `docs/agent-workflows/requirements.md`          | §Game-team retirement                             |
| R40 | Shell-level features stay exercised                    | §Shell-feature re-homing, §Test strategy          |
| R41 | Unit tests for any new pure TS helpers                 | §Test strategy                                    |
| R42 | Per-interpreter integration tests                      | §Test strategy                                    |
| R43 | Stack-depth-2 coverage for d3 & metagpt                | §Test strategy                                    |
| R44 | `npm test` green                                       | §Test strategy                                    |
| R45 | Phase-3 leaf READMEs name all four framings            | §Documentation                                    |
| R46 | Phase-3 group README lists all four framings + rationale | §Documentation                                  |
| R47 | Phase-4 leaf READMEs per Phase-1 convention            | §Documentation                                    |
| R48 | Phase-4 group README comparison                        | §Documentation                                    |
| R49 | `phase-3-4-notes.md`                                   | §Documentation                                    |
| R50 | Update plan's dynamics table if contracts diverge      | §Documentation                                    |
| R51 | Fix shell bugs in-spec                                 | §Error handling                                   |
| R52 | No gratuitous shell features (web tools exception)     | §Web tools architecture                           |
| R53 | Retry-budget exhaustion uses existing code path        | §Error handling                                   |
| R54 | `web_search` tool schema                               | §Web tools → tool schema                          |
| R55 | `web_fetch` tool schema                                | §Web tools → tool schema                          |
| R56 | Backend-pluggable with env var                         | §Web tools → dispatch                             |
| R57 | Default backend: DuckDuckGo keyless                    | §Web tools → DuckDuckGo backend                   |
| R58 | Empty/unreachable → diagnostic shape                   | §Web tools → error shape, §Error handling         |
| R59 | Non-2xx / non-HTML → diagnostic                        | §Web tools → error shape, §Error handling         |
| R60 | Per-call timeout configurable                          | §Web tools → dispatch                             |
| R61 | Tools surfaced per provider family                     | §Web tools → tool schema, §Web tools → CC path    |
| R62 | Add cheerio dependency                                 | §Web tools → dependencies                         |
| R63 | Web-tools unit tests with stubbed fetch + CC-arg test  | §Test strategy                                    |
| R64 | CLAUDE.md updates for web tools + env vars + CC note   | §Documentation                                    |
| R65 | "Name all collapsed patterns" convention               | §Documentation                                    |
| R66 | CC provider `--allowedTools` adds WebSearch + WebFetch | §Web tools → CC path                              |

## Architecture

Three parallel work streams, each with a self-contained dependency tree:

```
┌── Stream A (Phase 3) ──────────────────────────────────────────────┐
│ interpreters/2-planning-decomposition/                             │
│ ├── README.md                     ← group README (R46, R65)        │
│ ├── a-plan-execute/               ← leaf d1                        │
│ │   ├── INSTRUCTIONS.md  ┐                                         │
│ │   ├── PROGRAM.md       │                                         │
│ │   ├── README.md        │                                         │
│ │   └── dynamics/        │                                         │
│ │       ├── plan.md      │ byte-equal across all three leaves      │
│ │       ├── execute-step.md                                        │
│ │       └── synthesize.md┘                                         │
│ ├── b-orchestrator-workers/       ← leaf d2                        │
│ │   ├── [same as above, byte-equal INSTRUCTIONS + dynamics]        │
│ │   ├── PROGRAM.md                                                 │
│ │   └── workspace/inputs/input-{1..5}.md                           │
│ └── c-deep-research/              ← leaf d3                        │
│     └── [same as above, byte-equal INSTRUCTIONS + dynamics]        │
└────────────────────────────────────────────────────────────────────┘

┌── Stream B (Phase 4) ──────────────────────────────────────────────┐
│ interpreters/5-fixed-sop-teams/                                    │
│ ├── README.md                     ← group README (R48)             │
│ ├── a-metagpt/                                                     │
│ │   ├── INSTRUCTIONS.md           ← strategy: PM→Arch→Eng→QA       │
│ │   ├── PROGRAM.md                ← byte-equal to b-chatdev/PROGRAM│
│ │   ├── README.md                                                  │
│ │   └── dynamics/                                                  │
│ │       ├── role-pm.md                                             │
│ │       ├── role-architect.md                                      │
│ │       ├── role-engineer.md                                       │
│ │       ├── role-qa.md            ← pushes evaluate.md             │
│ │       └── evaluate.md           ← byte-equal to Phase-1b/1c      │
│ └── b-chatdev/                                                     │
│     ├── INSTRUCTIONS.md           ← strategy: design→code→test→doc │
│     ├── PROGRAM.md                ← byte-equal to a-metagpt        │
│     ├── README.md                                                  │
│     ├── dynamics/                                                  │
│     │   ├── dialogue.md                                            │
│     │   └── evaluate.md           ← byte-equal to Phase-1b/1c/4a   │
│     └── roles/                                                     │
│         ├── ceo.md, cto.md, coder.md, reviewer.md, …               │
└────────────────────────────────────────────────────────────────────┘

┌── Stream C (Web tools) ────────────────────────────────────────────┐
│ Non-CC providers (Anthropic SDK, OpenAI, Ollama, local):           │
│   src/tools.ts            ← adds web_search, web_fetch schema +    │
│                             dispatch to src/web-tools.ts           │
│   src/web-tools.ts        ← webSearch(), webFetch() with timeout + │
│                             diagnostic return shape; dispatches to │
│                             backend module by WEB_SEARCH_BACKEND   │
│   src/web-backends/                                                │
│   └── duckduckgo.ts       ← default: html.duckduckgo.com + cheerio │
│   package.json            ← +cheerio runtime dep                   │
│                                                                    │
│ Claude Code provider:                                              │
│   src/providers/claude-code.ts ← `--allowedTools` list gains       │
│                             WebSearch and WebFetch; implementation │
│                             is CC's built-in (outside this repo)   │
│                                                                    │
│ System prompt:                                                     │
│   src/prompt.ts           ← API_TOOLS_SECTION documents snake_case │
│                             web_search/web_fetch; CC_TOOLS_SECTION │
│                             documents PascalCase WebSearch/WebFetch│
│   (OLLAMA_SYSTEM_PROMPT also updated for ollama case)              │
│                                                                    │
│ Tests:                                                             │
│   src/test/web-tools-search.test.ts  ← stubs fetch, our impl only  │
│   src/test/web-tools-fetch.test.ts   ← stubs fetch, our impl only  │
│   src/test/web-tools-cc-arg.test.ts  ← asserts --allowedTools has  │
│                                        WebSearch + WebFetch        │
└────────────────────────────────────────────────────────────────────┘

Deletions:  interpreters/game-team/  (all files, entire directory)
Updates:    CLAUDE.md, README.md, docs/agent-workflows/requirements.md,
            src/test/phase-1-dynamics-identity.test.ts
            (rename-in-place → phase-1-4-dynamics-identity.test.ts?
             No — rename to phase-operators-identity.test.ts for
             cross-phase semantics; see §Test strategy.)
```

The three streams share no code; they can be implemented and tested
independently. Game-team retirement blocks on nothing in the other
streams.

## Data model

### New MEMORY sections

Introduced by this spec; every section follows the "`## SectionName`
header + plain prose body" format parsed by `parseSection` helpers in
`src/memory.ts`. No parser changes.

| Section           | Written by                         | Read by                                                |
| ----------------- | ---------------------------------- | ------------------------------------------------------ |
| `## Plan`         | `plan.md` (via `## Return`)        | Phase-3 strategy to iterate steps                      |
| `## Results`      | Phase-3 strategy (accumulates)     | Phase-3 strategy; passed to `synthesize.md` as arg     |
| `## Step Result`  | `execute-step.md` (via `## Return`) | Phase-3 strategy merges into `## Results`             |
| `## Report`       | `synthesize.md` (via `## Return`)  | Phase-3 strategy (final MEMORY artefact)               |
| `## PRD`          | `role-pm.md` (via `## Return`)     | 4a strategy forwards to `role-architect` push-args     |
| `## Design`       | `role-architect.md` (via Return)   | 4a strategy forwards to `role-engineer`                |
| `## Tasks`        | `role-engineer.md` (via Return)    | 4a strategy forwards to `role-qa`                      |
| `## Code Review`  | `role-qa.md` (via Return)          | 4a strategy; final MEMORY artefact for R33             |
| `## Design Doc`   | `dialogue.md` (design phase)       | 4b strategy forwards to coding-phase dialogue          |
| `## Code`         | `dialogue.md` (coding phase)       | 4b strategy forwards to testing-phase dialogue         |
| `## Test Report`  | `dialogue.md` (testing phase)      | 4b strategy forwards to documenting-phase dialogue     |
| `## Documentation` | `dialogue.md` (documenting phase) | 4b final MEMORY artefact for R33                       |

All sections are plain text; no structured YAML beyond what the
existing `## Push-Args` / `## Return` grammars already parse.

### Scoped files per frame

| Frame                    | Scoped file             | Purpose                                      |
| ------------------------ | ----------------------- | -------------------------------------------- |
| Phase-3 strategy         | `./scoped/plan.md`      | Copy of `## Plan` on receipt, authoritative during iteration |
| Phase-3 strategy         | `./scoped/results.md`   | Append-only results log; one `- R<N>: …` bullet per step; **surgical `echo >>` appends only** (Phase-2b convention) |
| Phase-3 strategy         | `./scoped/cursor.md`    | Integer — index of the step currently executing |
| `execute-step.md` frame  | `./scoped/attempt.md`   | Optional — when the step itself benefits from a sub-draft |
| `synthesize.md` frame    | `./scoped/report.md`    | Wholesale-writable draft of the final report |
| 4a strategy              | (none)                  | Hand-off flows purely through MEMORY sections |
| 4b strategy              | `./scoped/phase.md`     | Current phase name (`design` / `coding` / `testing` / `documenting`) |
| `dialogue.md` frame      | `./scoped/transcript.md` | Surgical-append transcript of the dialogue turns |

### Web tools — return shapes

```ts
// web_search
type WebSearchSuccess = { results: Array<{ title: string; url: string; snippet: string }>; note?: string };
type WebSearchFailure = { results: []; note: string };                        // satisfies: R58
type WebSearchResult  = WebSearchSuccess | WebSearchFailure;                  // always JSON.stringify'd before return

// web_fetch
type WebFetchSuccess = { url: string; contentType: "text/html"; text: string }; // satisfies: R55
type WebFetchFailure = { url: string; error: string };                          // satisfies: R59
type WebFetchResult  = WebFetchSuccess | WebFetchFailure;                       // always JSON.stringify'd before return
```

Tool `output` is `JSON.stringify(result)` so the LLM gets structured,
machine-readable text.

## Interfaces / API

### Phase 3 dynamics

**`plan.md`**  — satisfies: R6, R9, R65

```
Input (## Push-Args):
  goal: string                    — the high-level objective from PROGRAM.md
  results_so_far: string (opt.)   — markdown bullet list of prior step results (replanning only)

State machine:
  empty  →  (single instruction: produce the plan)  →  done

Output (## Return, on state=done):
  plan: |
    - S1: <step 1>
    - S2: <step 2>
    ...
```

The dynamic's prompt directs the LLM to emit a numbered bullet list.
When `results_so_far` is present, the prompt says "update the plan in
light of these results; prefer minimal edits". The shell splices the
returned `plan` into the caller's MEMORY as `## Plan`.

**`execute-step.md`**  — satisfies: R7, R9

```
Input (## Push-Args):
  current_step: string            — the step text (e.g. "S3: write the unit test")
  context:      string            — digest of prior results relevant to this step

State machine:
  empty → executing → (acceptable|needs_replan) → done

Sub-instruction "Execute": use bash/write_file/git/web_search/web_fetch as
  appropriate; write artefacts to ../../workspace/; append a status to
  ./scoped/attempt.md; set state=executing_completed.

Sub-instruction "Self-check": determine whether the step produced the
  intended artefact. If YES and no broader plan adjustment is needed, set
  state to "acceptable". If NO, or if new information warrants replan,
  set state to "needs_replan".

Sub-instruction "Return acceptable" (state=acceptable):
  append ## Return with:
    step_result: |
      status: success
      output: <prose summary>
  set state=done.

Sub-instruction "Return needs_replan" (state=needs_replan):
  append ## Return with:
    step_result: |
      status: needs_replan
      output: <prose summary of why>
  set state=done.
```

Recursive sub-planning (R19's depth-2 invariant) is triggered by
`execute-step.md` itself pushing `plan.md` when the step reads as
"here is a broad area, plan it". That sub-push happens mid-execution
within an `execute-step.md` frame — it does not go through the
top-level strategy. See the state-machine diagram below for where the
sub-push lives.

**`synthesize.md`**  — satisfies: R8, R9

```
Input (## Push-Args):
  results: string                 — the full ## Results section from the strategy

State machine:
  empty → (single instruction: produce the report) → done

Sub-instruction: If `results` contains multiple per-step or per-question
  outcomes, aggregate them into a structured report and ALSO write it to
  workspace/report.md (so d2/d3 leave a durable artefact). If `results`
  is thin (d1 — mostly state-change "built X" entries), produce a short
  summary of what was built and do NOT write workspace/report.md.

Output (## Return, on state=done):
  report: |
    <final report or short summary>
```

### Phase 3 strategy

Byte-equal INSTRUCTIONS.md across all three leaves. State machine — satisfies: R10, R11, R12:

```
empty ─► (Initialize: read ../../PROGRAM.md, write ./scoped/{results.md=empty, cursor.md=0}, push plan.md)─► planning
                                                                                                              │
                                                                             planning_completed ─(splice ## Plan)► ready
                                                                                                              │
                                              ┌─(pick step at cursor, push execute-step.md with {{current_step}} + {{context}})
ready ─►──┤                                                                                                   │
          └─ cursor == length(plan) ──────────────────────────────────────────────────────────────────► synthesising
                                                                                                              │
                                                                                   synthesising_completed ─► done
                                                                                                              │
                                          ┌─ step_result.status == success ──► advance cursor; → ready
executing_completed ─►─┤                  │
                       │─ step_result.status == needs_replan ── (set `results_so_far` from results.md, push plan.md) ──► planning
                       └─ (malformed) ─── append to ## Pending Questions (non-blocking); → ready with cursor unchanged
```

Strategy instructions (exact labels):

1. **Initialize** — condition `empty`. Read `../../PROGRAM.md`; create
   `./scoped/results.md` (empty), `./scoped/cursor.md` with `0`.
   Append `## Push\ndynamics/plan.md\n## Push-Args\ngoal: |\n  <PROGRAM body>`.
2. **Absorb plan** — condition `planning_completed` AND `## Plan` present.
   Write `## Plan` section's body to `./scoped/plan.md` (wholesale OK,
   initial creation). Drop `## Plan` from MEMORY (consumed). Set state
   `ready`. Satisfies: R45's "collapse story visible" because leaf
   READMEs cite the framing-specific interpretation of "step".
3. **Dispatch step** — condition `ready` AND cursor < plan length.
   Read step `S<cursor>` from `./scoped/plan.md`. Build a short context
   digest from `./scoped/results.md` (last N bullets). Append
   `## Push\ndynamics/execute-step.md\n## Push-Args\ncurrent_step: |\n  …\ncontext: |\n  …`.
4. **Route after step** — condition `executing_completed` AND
   `## Step Result` present. Parse the step_result body. If
   `status: success`: surgically `echo "- R<cursor+1>: <output>" >>
   ./scoped/results.md`, increment cursor. If `status: needs_replan`:
   append `## Push\ndynamics/plan.md\n## Push-Args\ngoal: |\n  <goal>\nresults_so_far: |\n  <dump of results.md>`; cursor unchanged. If malformed:
   append a non-blocking `## Pending Questions` item and advance
   cursor to avoid a stuck loop. Satisfies: R11, R40(a/b/c).
5. **Ready to synthesise** — condition `ready` AND cursor == plan length.
   Append `## Push\ndynamics/synthesize.md\n## Push-Args\nresults: |\n  <dump of results.md>`. Set state `synthesising`.
6. **Finish** — condition `synthesising_completed` AND `## Report` present.
   Set state `done`.

Every `## Push` in the strategy is accompanied by `## Push-Args`,
satisfying R9.

### Phase 4 dynamics

**`role-pm.md`**  — satisfies: R24

```
Input (## Push-Args):
  program: string                 — verbatim PROGRAM.md body

State machine:
  empty → drafting → done

Sub-instruction: Produce a short PRD from {{program}}: user stories,
  acceptance criteria, non-goals. Append ## Return with:
    prd: |
      <PRD prose>
  set state=done.
```

**`role-architect.md`** — satisfies: R24. Same shape, input `prd`, returns `design`.

**`role-engineer.md`** — satisfies: R24. Input `design`, returns `tasks` AND writes code under `workspace/` using `write_file`/`bash`.

**`role-qa.md`** — satisfies: R24, R25.

```
Input (## Push-Args):
  tasks: string                   — the Tasks hand-off from Engineer
  code_location: string           — relative path under workspace/

State machine:
  empty → reviewing → awaiting_verdict → done

Sub-instruction "Review": Read code at {{code_location}}. Synthesise an
  acceptance criterion (from {{tasks}}) and the current `## Attempt`
  (a short description of the reviewed code). Append
  ## Push\ndynamics/evaluate.md\n## Push-Args\nattempt: |…\ncriterion: |…`;
  set state=awaiting_verdict.

Sub-instruction "Return": condition state=reviewing_completed AND
  ## Verdict present. Append ## Return with:
    code_review: |
      verdict: <pass|fail>
      feedback: <verbatim from ## Feedback>
  set state=done.
```

**`dialogue.md`** — satisfies: R27, R28.

```
Input (## Push-Args):
  participants: string            — comma-separated role names ("coder,reviewer")
  topic:        string            — the phase topic
  input:        string (opt.)     — prior-phase output (e.g. ## Design Doc for coding)
  acceptance:   bool (opt.)       — if "true", push evaluate.md before returning

State machine:
  empty → turning → (decide_accept | done)

Sub-instruction "Turn": Read ../roles/<name>.md for each participant.
  Pick the next speaker (alternates, starting with participants[0]).
  Write one turn to ./scoped/transcript.md via surgical `echo >>`.
  Increment a turn counter (./scoped/turns.md). If the transcript
  contains a convergence signal ("AGREED:", "FINAL:") or 6 turns, set
  state=decide_accept. Otherwise stay in turning.

Sub-instruction "Accept via evaluate" (state=decide_accept AND
  acceptance==true): derive `attempt` from transcript tail and
  `criterion` from topic; push dynamics/evaluate.md.

Sub-instruction "Return" (state=decide_accept AND either
  acceptance!=true OR ## Verdict present):
  extract the consensus artefact from ./scoped/transcript.md; append
  ## Return with the single key matching the phase output section
  (`design_doc`, `code`, `test_report`, `documentation`). Set state=done.
```

Per R65's "collapse convention" note, `dialogue.md` is **not** a
collapse — it is the single dynamic that distinguishes 4b from 4a.
No cross-framing citations required beyond its Phase-1-leaf-style
README.

### Phase 4 strategies

**`a-metagpt` strategy** — satisfies: R30, R33.

```
empty →(Initialize: read ../../PROGRAM.md; push role-pm.md with {{program}})→ pm_active
pm_active_completed & ## PRD present →(push role-architect.md with {{prd}})→ architect_active
architect_active_completed & ## Design present →(push role-engineer.md with {{design}})→ engineer_active
engineer_active_completed & ## Tasks present →(push role-qa.md with {{tasks}}, {{code_location}}="workspace/")→ qa_active
qa_active_completed & ## Code Review present →(verdict=pass? done : pending-question + done)→ done
```

Final MEMORY contains `## PRD`, `## Design`, `## Tasks`, `## Code
Review` — satisfies R33's 4a clause.

**`b-chatdev` strategy** — satisfies: R31, R33.

```
empty →(Initialize: read ../../PROGRAM.md; set scoped/phase.md="design";
        push dialogue.md with participants="ceo,cto", topic="<PROGRAM>", acceptance=false)→ design_active
design_active_completed & ## Design Doc present →(set phase="coding";
        push dialogue.md with participants="coder,reviewer", topic=<design-derived>,
        input={{design_doc}}, acceptance=true)→ coding_active
coding_active_completed & ## Code present →(set phase="testing";
        push dialogue.md with participants="tester,reviewer", topic=<code-derived>,
        input={{code}}, acceptance=true)→ testing_active
testing_active_completed & ## Test Report present →(set phase="documenting";
        push dialogue.md with participants="writer,reviewer", topic=<code-derived>,
        input={{code}}, acceptance=true)→ doc_active
doc_active_completed & ## Documentation present → done
```

Satisfies: R28 (reviewer-pair dialogues set `acceptance=true`),
R33's 4b clause (final MEMORY contains `## Design Doc`, `## Code`,
`## Test Report`, `## Documentation`).

### Web tools — non-CC provider path (tool schema additions)

For the Anthropic SDK, OpenAI, Ollama, and local providers — which read
their tool schema from `getTools()` — the custom tools are added here:

```ts
// src/tools.ts additions in getTools()
{
  name: "web_search",               // satisfies: R54, R61(a)
  description: "Search the web for <query>. Returns a JSON-encoded list of up to 10 results {title, url, snippet}. Non-deterministic across runs.",
  input_schema: {
    type: "object" as const,
    properties: { query: { type: "string", description: "Search query string" } },
    required: ["query"],
  },
},
{
  name: "web_fetch",                // satisfies: R55, R61(a)
  description: "Fetch <url> and return its visible text (HTML stripped to plain text). Non-HTML content types return a diagnostic.",
  input_schema: {
    type: "object" as const,
    properties: { url: { type: "string", description: "Absolute HTTP(S) URL to fetch" } },
    required: ["url"],
  },
},

// src/tools.ts additions in executeTool() switch
case "web_search": {
  const { webSearch } = await import("./web-tools.js");
  const out = await webSearch(String(input.query ?? ""));
  return { output: JSON.stringify(out), error: false };
}
case "web_fetch": {
  const { webFetch } = await import("./web-tools.js");
  const out = await webFetch(String(input.url ?? ""));
  return { output: JSON.stringify(out), error: false };
}
```

### Web tools — dispatch

```ts
// src/web-tools.ts                                            // satisfies: R56, R60
const BACKEND   = process.env.WEB_SEARCH_BACKEND || "duckduckgo";
const TIMEOUT_S = parseInt(process.env.WEB_TIMEOUT || "15", 10);

export async function webSearch(query: string): Promise<WebSearchResult> {
  if (!query) return { results: [], note: "empty query" };
  switch (BACKEND) {
    case "duckduckgo": {
      const { searchDuckDuckGo } = await import("./web-backends/duckduckgo.js");
      return searchDuckDuckGo(query, TIMEOUT_S * 1000);
    }
    default:
      return { results: [], note: `unknown backend: ${BACKEND}` };
  }
}

export async function webFetch(url: string): Promise<WebFetchResult> {
  if (!url) return { url: "", error: "empty url" };
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_S * 1000);
    const resp = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);
    if (!resp.ok) return { url, error: `http ${resp.status}` };                 // satisfies: R59
    const contentType = resp.headers.get("content-type") || "";
    if (!contentType.includes("html")) return { url, error: `non-html: ${contentType}` };
    const html = await resp.text();
    const text = stripHtml(html);                                               // cheerio-based
    return { url, contentType: "text/html", text };                             // satisfies: R55
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { url, error: msg };                                                 // satisfies: R59
  }
}
```

### DuckDuckGo backend

```ts
// src/web-backends/duckduckgo.ts                              // satisfies: R57
import * as cheerio from "cheerio";

const DDG_HTML_URL = "https://html.duckduckgo.com/html/";
const MAX_RESULTS = 10;                                                         // Resolved OQ6 (c)

export async function searchDuckDuckGo(query: string, timeoutMs: number): Promise<WebSearchResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const resp = await fetch(DDG_HTML_URL + "?q=" + encodeURIComponent(query), {
      headers: { "User-Agent": "turing-agent-workflows/0.1 (+research)" },
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!resp.ok) return { results: [], note: `duckduckgo http ${resp.status}` };
    const html = await resp.text();
    const $ = cheerio.load(html);
    const results: Array<{title: string; url: string; snippet: string}> = [];
    $(".result").each((_, el) => {
      if (results.length >= MAX_RESULTS) return false;
      const title = $(el).find(".result__title").text().trim();
      const url = $(el).find(".result__url").attr("href") || $(el).find(".result__title a").attr("href") || "";
      const snippet = $(el).find(".result__snippet").text().trim();
      if (title && url) results.push({ title, url, snippet });
    });
    if (results.length === 0) return { results: [], note: "no results" };      // satisfies: R58
    return { results };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { results: [], note: `duckduckgo error: ${msg}` };                  // satisfies: R58
  }
}
```

### `stripHtml` helper

```ts
// src/web-tools.ts (internal)                                // satisfies: R55 (no hand-rolled regex)
import * as cheerio from "cheerio";
function stripHtml(html: string): string {
  const $ = cheerio.load(html);
  $("script, style, noscript, iframe, svg").remove();
  return $.root().text().replace(/\s+/g, " ").trim();
}
```

### Web tools — Claude Code provider path

CC invokes the `claude -p` subprocess with its own `--allowedTools`
list and does NOT consult `getTools()`. The LLM running inside the CC
subprocess therefore sees Claude Code's **native** tools
(`WebSearch`, `WebFetch`), not our custom ones. Under the CC provider
our `src/web-tools.ts` code is never exercised; the search and fetch
implementations are Claude Code's built-ins (outside this
repository's control).

Concrete changes in `src/providers/claude-code.ts` — satisfies: R66:

```ts
// before (today):
const args = [
  "-p", prompt,
  "--system-prompt", systemPrompt,
  "--model", process.env.CC_MODEL || "haiku",
  "--output-format", "json",
  "--allowedTools", "Bash(*)", "Write(*)", "Edit(*)",
  "--dangerously-skip-permissions",
];

// after (this spec):
const args = [
  "-p", prompt,
  "--system-prompt", systemPrompt,
  "--model", process.env.CC_MODEL || "haiku",
  "--output-format", "json",
  "--allowedTools", "Bash(*)", "Write(*)", "Edit(*)", "WebSearch", "WebFetch",
  "--dangerously-skip-permissions",
];
```

And in `src/prompt.ts`, `CC_TOOLS_SECTION` gains two bullets
describing Claude Code's native web tools using their PascalCase
names — satisfies: R64, R66. The API_TOOLS_SECTION and
OLLAMA_SYSTEM_PROMPT documentation gain the snake_case `web_search`
and `web_fetch` bullets instead — satisfies: R64 for non-CC providers.

Interpreter INSTRUCTIONS reference tools in a provider-agnostic way
("use web_search for research", lowercase). At runtime the LLM sees
the correct tool names from its per-provider system prompt and
disambiguates naturally. The two implementations' return shapes
differ slightly — CC's WebSearch returns a structured result set in
CC's own schema; our DuckDuckGo backend returns the shape defined in
§Data model — but both satisfy the strategy's needs because the
LLM interprets the returned data, not a code path.

**Boundary.** This spec's unit tests (§Test strategy) cover only
the custom `src/web-tools.ts` code (the non-CC path). CC's native
implementations are out of our control and untested here; the one
test we DO add for CC (`src/test/web-tools-cc-arg.test.ts`) is a
pure arg-construction assertion with no `claude` subprocess call.

### Dependencies

```jsonc
// package.json additions                                      // satisfies: R62
"dependencies": {
  "@anthropic-ai/sdk": "^0.39.0",
  "cheerio":          "^1.0.0",        // pinned by the version range at install time
  "dotenv":           "^17.4.1",
  "node-llama-cpp":   "^3.18.1",
  "openai":           "^6.33.0"
}
```

No npm DuckDuckGo client library is needed; native `fetch` + `cheerio`
cover both search and fetch. Resolved OQ6 (a).

## Error handling

| Class                                        | Trigger                                                                           | Behaviour                                                                                                     | R#   |
| -------------------------------------------- | --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | ---- |
| Malformed step-result from `execute-step.md` | `## Step Result` body not parseable as `status: <value>`                          | Strategy appends to `## Pending Questions` (non-blocking), advances cursor to avoid stall                     | R11, R40(b) |
| Malformed `## Verdict` from `evaluate.md`    | Verdict is neither literal `pass` nor `fail`                                      | Caller appends to `## Pending Questions`, proceeds as `fail` by convention                                    | R40(b)      |
| Phase-3 or Phase-4 retry-budget exhaustion   | Shell's existing retry-on-no-progress loop hits its cap                           | Shell's current exit code path; no new error surface introduced                                               | R53         |
| Web-search: backend timeout / unreachable    | `fetch` throws or `AbortController` fires                                         | Return `{ results: [], note: "…" }`; tool output is successful-looking string; LLM sees the note              | R58         |
| Web-search: backend returns 0 results        | Parser finds no `.result` nodes                                                   | Return `{ results: [], note: "no results" }`                                                                  | R58         |
| Web-search: unknown backend                  | `WEB_SEARCH_BACKEND` is not `duckduckgo`                                          | Return `{ results: [], note: "unknown backend: <x>" }`                                                        | R58         |
| Web-fetch: non-2xx HTTP                      | `resp.ok === false`                                                               | Return `{ url, error: "http <status>" }`                                                                      | R59         |
| Web-fetch: non-HTML content type             | `content-type` header excludes `"html"`                                           | Return `{ url, error: "non-html: <ct>" }`; binary bytes NOT forwarded                                         | R59         |
| Web-fetch: timeout                           | `AbortController` fires                                                           | Return `{ url, error: "<abort message>" }`                                                                    | R59, R60    |
| Unknown shell bug found during implementation | Any shell regression blocking an R#                                              | Fix in this spec per R51; documented in `phase-3-4-notes.md`                                                  | R51         |

Both web tools **always return a successful `ToolResult`** (`error: false`)
regardless of backend status — the failure is encoded in the JSON body,
not the tool-level `error` flag. This keeps provider tool loops simple
and lets the LLM decide whether a missing result warrants retry. The
statement applies only to our custom `src/web-tools.ts` implementation
served to non-CC providers. Under the CC provider, Claude Code's
native `WebSearch` and `WebFetch` define their own success/failure
semantics, which we neither intercept nor translate — that is CC's
concern, not ours (see §Web tools → Claude Code provider path and
R66).

## Shell-feature re-homing (R40)

Game-team exercised three shell features that must not silently regress:

| Feature                                  | Re-home                                                                                                                                                    | R# |
| ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | -- |
| Fuzzy natural-language condition matching | Phase-3 strategy's "Route after step" uses a fuzzy condition on `## Step Result` body ("status field indicates success" rather than exact-string match)    | R40(a) |
| Non-blocking `## Pending Questions`       | Phase-3 strategy's malformed-step-result branch; Phase-4 dialogue.md's ambiguous-turn branch                                                               | R40(b) |
| Strategy-level `## Push`                  | Every Phase-3 and Phase-4 strategy push is from the strategy frame                                                                                         | R40(c) |

An integration test scripts (a) and (b) against a synthetic MEMORY
sequence; (c) is trivially covered by every per-interpreter integration
test because each pushes dynamics from the strategy.

## Game-team retirement (step order)

1. Create the five new interpreters + group READMEs (Streams A, B
   content written but not yet committed).
2. Run the existing `phase-1-*.test.ts` suite — no regression.
3. Delete `interpreters/game-team/` (`git rm -r`).                                  — R35
4. Update `CLAUDE.md`: "Existing interpreters" list (remove game-team,
   add 5 new entries with patterns.md group refs); remove every
   mention of "game-team exempt" from the directory-layout convention
   and from the guiding principles.                                                 — R36, R37
5. Update `README.md` at the repo root: replace any example that
   referenced `./new-instance.sh foo interpreters/game-team` with a
   new-phase example (e.g. `a-plan-execute`).                                       — R38
6. Update `docs/agent-workflows/requirements.md` §Phase 3 and §Phase 4
   to reference the final paths of the five new interpreters.                       — R39
7. Update `interpreters/<group>/README.md` files that mention
   game-team exemptions (from Phase 1's principle 7): remove the
   exemption text.                                                                   — R37

No workspace artefacts from previous game-team runs are touched;
existing `instances/` are untouched.

## Test strategy

| Test file                                                         | Purpose                                                                                                                                                                                                                                                       | R#       |
| ----------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| `src/test/phase-3-dynamics-identity.test.ts`                      | Assert byte-equality of `INSTRUCTIONS.md`, `dynamics/plan.md`, `dynamics/execute-step.md`, `dynamics/synthesize.md` across the three Phase-3 leaves                                                                                                            | R3, R4, R5 |
| `src/test/phase-3-plan-execute.test.ts`                           | Script a MEMORY sequence through `a-plan-execute`: push plan.md → splice `## Plan` → iterate execute-step.md → splice step results into `./scoped/results.md` → push synthesize.md → halt at `done`. Include at least one replan (R17) via mocked step result | R10, R11, R17, R42 |
| `src/test/phase-3-orchestrator-workers.test.ts`                   | Same shape as above, with the plan containing exactly 5 steps corresponding to 5 input files; assert exactly 5 `execute-step.md` pushes                                                                                                                        | R18, R42 |
| `src/test/phase-3-deep-research.test.ts`                          | Same shape; one `execute-step.md` branch re-pushes `plan.md` within its frame; assert `.call-stack.json` reaches `{stack.length: 3}` (strategy + execute-step + plan) at that point                                                                            | R19, R43, R42 |
| `src/test/phase-4-metagpt.test.ts`                                | Script a MEMORY sequence through 4a: PM → Architect → Engineer → QA; QA pushes evaluate.md (depth 2); assert `.call-stack.json` reaches depth 2 and final MEMORY has all four typed hand-off sections                                                        | R33, R43, R42 |
| `src/test/phase-4-chatdev.test.ts`                                | Script a sequence through 4b: design → coding → testing → documenting; coding/testing/doc pushes dialogue.md; reviewer-pair dialogues further push evaluate.md; assert final MEMORY has all four phase-outcome sections                                       | R33, R28, R42 |
| `src/test/phase-operators-identity.test.ts` (rename of phase-1-*)  | Four-way byte-equality of `evaluate.md` across `b-evaluator-optimizer`, `c-reflexion`, `a-metagpt`, `b-chatdev`. Rename from `phase-1-dynamics-identity.test.ts` (Phase-2 notes already flagged this for the fourth consumer)                                  | R29      |
| `src/test/phase-4-shell-features.test.ts`                         | Synthesise a MEMORY sequence exercising R40(a) fuzzy NL conditions and R40(b) non-blocking `## Pending Questions` against either 4a or 4b; (c) strategy-level push is already exercised by all per-interpreter tests                                          | R40      |
| `src/test/web-tools-search.test.ts`                               | Stub `globalThis.fetch`; assert happy path parses DuckDuckGo HTML into `{results}`; assert `results: []` shape on (i) empty-body, (ii) non-200, (iii) abort/timeout, (iv) unknown backend env var                                                            | R54, R57, R58, R60, R63 |
| `src/test/web-tools-fetch.test.ts`                                | Stub `globalThis.fetch`; assert happy path extracts text via cheerio; assert diagnostic shape on (i) non-2xx, (ii) non-HTML content-type, (iii) timeout                                                                                                       | R55, R59, R60, R63 |
| `src/test/web-tools-cc-arg.test.ts`                               | Extract / reconstruct the `--allowedTools` arg array from `src/providers/claude-code.ts` and assert it contains `"WebSearch"` and `"WebFetch"` alongside the existing `"Bash(*)"`, `"Write(*)"`, `"Edit(*)"`. No `claude` subprocess invoked.                | R63(f), R66 |
| *(integration)* `npm test` after all changes                      | All existing tests + all new tests pass                                                                                                                                                                                                                       | R44      |

**Live demo validations** (R16, R32) are manual — run each new
interpreter once via claude-code + default Haiku and confirm halt at
`done`. Not automated in `npm test` (no LLM call at test time).

**No new pure-function TS helpers** are expected from Phase 3/4
strategies; they lean entirely on existing `parsePush`, `parsePushArgs`,
`parseReturn`, `spliceReturns`, `applyPush`, `applyPop`. If Design-time
implementation work surfaces a helper, R41 requires a unit test — one
additional test file added as needed.

## Documentation

- **Phase-3 leaf READMEs** (`a-plan-execute/README.md`,
  `b-orchestrator-workers/README.md`, `c-deep-research/README.md`).
  Each follows the Phase-1-leaf template (pattern/citation, state
  machine, dynamics table, demo description, run-it, known behaviour)
  AND, per R65, names all four subsumed framings (Plan-and-Execute,
  Orchestrator–Workers, Deep Research, XAgent) with one-line source
  citations, flags which framing this specific leaf primarily
  demonstrates, and links to siblings + group README.                                — R45, R65
- **Phase-3 group README** (`interpreters/2-planning-decomposition/README.md`).
  Explicit list of all four subsumed patterns with full citations, the
  collapse rationale (why sequential execution collapses them), a
  comparison table of the three demos, a note about the byte-equality
  identity test, and a pointer to `patterns.md` Group 2.                             — R46, R65
- **Phase-4 leaf READMEs** per Phase-1 convention, no R65 additions
  (not a collapse).                                                                  — R47
- **Phase-4 group README** (`interpreters/5-fixed-sop-teams/README.md`).
  Frames document-handoff vs phase-dialogue as two framings with a
  shared demo PROGRAM.md; comparison table.                                          — R48
- **`docs/agent-workflows/phase-3-4-notes.md`**. Post-implementation
  note. If nothing surprising: one-line file matching Phase-1/2
  convention.                                                                        — R49
- **Plan dynamics table**
  (`docs/agent-workflows/requirements.md`).
  If any dynamic's MEMORY contract diverges from the table on merge,
  update in same PR.                                                                 — R50
- **CLAUDE.md** updates:
  - "Existing interpreters" — remove game-team, add five new entries
    with patterns.md group refs (R36).
  - "Tools" coverage — add `web_search` and `web_fetch` rows with
    descriptions, signatures, and error-shape notes (R64). These
    apply to the Anthropic SDK / OpenAI / Ollama / local providers
    (R61(a)).
  - "Providers" → "Claude Code provider" — add a note that CC uses
    its native `WebSearch` and `WebFetch` tools (allowed via
    `--allowedTools`), not our custom implementations (R64, R66).
  - "Shared Configuration" — add `WEB_SEARCH_BACKEND` (default
    `duckduckgo`) and `WEB_TIMEOUT` (default `15` seconds), noting
    they affect the custom implementation only (R64).
  - Remove "game-team exempt" language (R37).

## Resolved open questions

All requirements-level OQs committed to concrete choices here.

- **OQ1 (4b phase-output section names)**: `## Design Doc`, `## Code`,
  `## Test Report`, `## Documentation`. (Confirmed in §Data model.)
- **OQ2 (Phase-3 PROGRAM.md content)**:
  - **d1 (`a-plan-execute`)**: "Set up a minimal TypeScript Node.js
    project under `workspace/` with: `src/index.ts` that exports
    `add(a, b)` and logs `add(2, 3)` on run; `src/index.test.ts` using
    `node:test`; `tsconfig.json` targeting ES2022 → `dist/`;
    `package.json` with scripts `build` (tsc) and `test` (tsc && node
    --test dist/\*\*/\*.test.js); `.github/workflows/ci.yml` running
    `npm ci && npm test` on push. Verify `npm ci && npm test` passes."
    Replan trigger: intentionally under-specify the test name so the
    first execute-step's acceptance fails ("file not found when
    running tests"), causing `needs_replan`.                                         — R13, R17
  - **d2 (`b-orchestrator-workers`)**: Five short technical paragraphs
    under `workspace/inputs/input-{1..5}.md` — each covering one
    distributed-systems topic (CAP theorem, eventual consistency,
    consensus via Paxos, sharding, replication). PROGRAM.md: "Summarise
    each file under `workspace/inputs/` in one bullet; then write a
    unified summary to `workspace/summary.md` highlighting common
    themes across the five."                                                        — R14, R18
  - **d3 (`c-deep-research`)**: "Compare trade-offs among Raft, Paxos,
    and Multi-Paxos for distributed consensus. Cover: (1) leader
    election, (2) log replication guarantees, (3) fault tolerance,
    (4) implementation complexity and real-world deployments. Produce
    a structured report at `workspace/report.md`." The question's
    breadth invites the first plan to emit a top-level step like
    "analyse leader election across all three"; inside that step the
    execute-step dynamic re-pushes `plan.md` to decompose into
    per-algorithm sub-questions.                                                    — R15, R19
- **OQ3 (`synthesize.md` wrap-up vs report)**: Single dynamic, single
  instruction text with two prose branches. The LLM inspects
  `{{results}}`: if it contains multiple distinct information blocks
  → structured report AND write to `workspace/report.md`; otherwise
  → short "here is what was built" summary and no file write.
  Committed in §Phase 3 dynamics → synthesize.md.
- **OQ4 (role/dialogue scaffolding sharing)**: No shared helper. Each
  dynamic is self-contained; the repetition is deliberate because
  `role-*.md` files differ in per-role prompting far more than they
  share scaffolding. Committed.
- **OQ5 (evaluate.md promotion)**: Keep four byte-equal copies; extend
  the Phase-1 identity test to a four-way assertion; rename the test
  file to `phase-operators-identity.test.ts` to reflect cross-phase
  semantics. Promotion to a shared location stays deferred to a
  dedicated future spec. Committed.
- **OQ6 (web-tool library / endpoints / caps / timeouts / env vars)**:
  (a) **Library**: `cheerio` only. No npm DuckDuckGo client.
  (b) **Endpoint**: `https://html.duckduckgo.com/html/?q=…`, parsed
  with cheerio against the `.result` / `.result__title` /
  `.result__url` / `.result__snippet` selectors.
  (c) **Max results**: 10.
  (d) **Default timeout**: 15 seconds.
  (e) **Env vars**: `WEB_SEARCH_BACKEND` (default `duckduckgo`),
  `WEB_TIMEOUT` (seconds; default 15). Committed.
- **OQ7 (fallback behaviour)**: This spec commits to silent diagnostic
  shape (R58). No multi-backend fallback chain. A future
  backend-expansion spec may add one. Committed.

## Open questions

(none — all requirements-level OQs resolved above; any remaining
ambiguity is implementation-level and will be absorbed during Phase 3
tasks.)
