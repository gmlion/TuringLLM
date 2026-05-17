# SDLC POC Interpreter — Topology (locked)

Companion to `sdlc-poc-artefact-spec.md`. Locks the frame topology,
operator reuse, role personas, orchestrator state machine, and gate
semantics for the SDLC POC interpreter.

## In plain terms — what this interpreter does

You drop some documents describing a system into a folder and tell the
interpreter "build me a POC that mocks this". The interpreter then walks
through six phases of software-development paperwork — the kind a small
team would do on a whiteboard before writing code — and at every phase
boundary it stops and asks you to approve, refine, or cancel.

Inside each phase, the interpreter does not just "ask the LLM nicely". It
runs a real debate between role-playing agents. For requirements, a PM, a
QA engineer, and an architect take turns arguing about a draft until they
all agree (or the round cap is hit). For each architecture decision, a
Devil's Advocate is added to the cast to defend the alternatives that
were rejected, so nothing gets through unchallenged. For tasks, an
engineer and a QA argue over whether each step is concretely executable.

Wherever the artefact has claims that need to be true about the source
material (the summary's facts, the design's coverage of requirements, the
plan's dependency edges), the interpreter additionally runs a verification
pass that breaks the artefact into atomic claims and checks each one
independently against the upstream documents.

When the dust settles, the workspace contains seven durable artefacts
(system summary, requirements, design, ADRs, backlog tree, tasks, and a
dependency-graph plan with execution waves) — every artefact threaded
together by stable IDs, every important decision recorded with the
debate transcript that produced it. A downstream implementer can pick up
the workspace cold and execute it task by task.

## Design principle

Every MAS pattern needed by this interpreter already exists in
`interpreters/mas-papers/`. Phase shims are thin orchestration layers that
configure existing operators with the right roles, criteria, and grounding
files. No new general-purpose operator is introduced; the only additions
are phase shims and role personas.

## Operator reuse (copied verbatim into `interpreters/sdlc-poc/operators/`)

| Operator                                  | Source                                                          | Used by                                          |
| ----------------------------------------- | --------------------------------------------------------------- | ------------------------------------------------ |
| `plan-execute.md`, `tackle.md`, `plan.md` | `mas-papers/2-planning-decomposition/c-deep-research/operators` | Phase 0 (summarise), 3 (backlog), 4 (tasks), 5 (plan) |
| `dialogue.md`                             | `mas-papers/5-fixed-sop-teams/b-chatdev/operators`              | Phases 1, 2, 2b, 3, 4                            |
| `evaluate.md`                             | `mas-papers/1-iterative-refinement/c-reflexion/operators`       | Final acceptance gate after every `dialogue.md`  |
| `cove.md`, `verify.md`, `answer-independently.md` | `mas-papers/1-iterative-refinement/d-cove/operators`    | Phases 0, 2, 4, 5                                |

`dialogue.md` already supports N participants — the round-robin uses
`participants[N % len(participants)]`. Two-agent isolation still holds at
N>2: each turn's speaker reads only its own persona; the shared transcript
is interpreted as chat history from the speaker's POV. Hard cap is 10
turns (ChatDev paper §3.2); we keep it as-is and rely on the user-gate
refine verb for extension.

## Phase shims (new, thin)

| File                                | Job                                                            |
| ----------------------------------- | -------------------------------------------------------------- |
| `operators/sdlc-orchestrator.md`    | Root. Drives the phase sequence, opens user gates, dispatches gate verbs. |
| `operators/phase-summarise.md`      | Pushes `plan-execute.md` to decompose summary by schema section, then `cove.md` to fact-check claims against `workspace/inputs/`. Writes `00-system-summary.md`. |
| `operators/phase-requirements.md`   | Pushes `dialogue.md` with `pm,qa,architect`, `acceptance: true`. Writes `01-requirements.md`. |
| `operators/phase-design.md`         | Pushes `dialogue.md` with `architect,engineer,qa,pm`, `acceptance: true`. Then pushes `cove.md` for R# coverage + Test-matrix grounding. After body is locked, identifies non-trivial choices and pushes `phase-adr.md` once per choice. Writes `02-design.md`. |
| `operators/phase-adr.md`            | Pushes `dialogue.md` with `architect,engineer,qa,devils-advocate`, `acceptance: true`. Writes one `02-adr/ADR-NNN-<slug>.md`. |
| `operators/phase-backlog.md`        | Pushes `plan-execute.md` to decompose the tree (epics → features → stories), then `dialogue.md` with `pm,qa,architect`, `acceptance: true` over the assembled tree. Writes `03-backlog.md`. |
| `operators/phase-tasks.md`          | Iterates over stories in `03-backlog.md`. For each S#, pushes `tackle.md` (Plan-Execute decomposition into tasks) then `dialogue.md` with `engineer,qa`, `acceptance: true` over that story's task block. After all stories, pushes `cove.md` over the assembled `04-tasks.md` for cross-cut consistency (no T# orphans, every test-matrix row expanded). |
| `operators/phase-plan.md`           | Pushes `tackle.md` for the dep-table draft, then `cove.md` with one verification per edge ("is this dependency real?"), then runs deterministic topological wave grouping in bash inside the shim. Writes `05-plan.md`. |

Phase shims own only:
- their phase's allowed input set
- the role cast and `acceptance` flag for any `dialogue.md` push
- the output path for the artefact
- the post-debate verification configuration (CoVe ground files, edge claims)

They do not themselves draft, critique, or evaluate.

## Role personas (new, at `interpreters/sdlc-poc/roles/`)

Copied to `instances/<name>/roles/` by `new-instance.sh`. `dialogue.md`
reads `../../roles/<name>.md` from each frame, so the path resolves
correctly.

| File                       | Used in                              | Pushes back on                                                                                |
| -------------------------- | ------------------------------------ | --------------------------------------------------------------------------------------------- |
| `roles/pm.md`              | Phases 1, 2, 3                       | R# coverage of every behaviour in 00-system-summary; user-observable AC; scope creep flags    |
| `roles/qa.md`              | Phases 1, 2, 2b, 3, 4                | Every R# testable; EARS shape; every P# tied to a real test; red/green commit discipline       |
| `roles/architect.md`       | Phases 1, 2, 2b, 3                   | No R# implementation-locked; cross-cut concerns; ADR-worthy choices flagged; component seams real |
| `roles/engineer.md`        | Phases 2, 2b, 4                      | Feasibility; task command/file paths real; deps between tasks correct; story sized for one sitting |
| `roles/devils-advocate.md` | Phase 2b only                        | Steelmans every rejected alternative; forces Architect to justify choice on each axis          |

Each persona is first-person, under ~30 lines, with explicit "I push back
when…" bullets to give the LLM concrete per-turn triggers.

Devil's Advocate is spun up only for ADRs. In Design (Phase 2) the
Engineer + QA + PM cast already covers the angles; adding Devil's Advocate
there would slow consensus without adding new pressure.

## Frame topology

```
f000-sdlc-orchestrator                       (root)
└── per phase, in sequence, with user gate between each:

    f-phase-summarise
    ├── f-plan-execute (decompose by schema section)
    │   ├── f-plan
    │   └── f-tackle (recursive per section)
    └── f-cove (verify claims against workspace/inputs/)
        ├── f-verify
        └── f-answer-independently (per claim)

    f-phase-requirements
    └── f-dialogue (pm,qa,architect)
        └── f-evaluate (final acceptance)

    f-phase-design
    ├── f-dialogue (architect,engineer,qa,pm)
    │   └── f-evaluate
    ├── f-cove (R# coverage + Test matrix)
    └── per non-trivial choice:
        f-phase-adr
        └── f-dialogue (architect,engineer,qa,devils-advocate)
            └── f-evaluate

    f-phase-backlog
    ├── f-plan-execute (tree decomposition)
    └── f-dialogue (pm,qa,architect)
        └── f-evaluate

    f-phase-tasks (per-story orchestrator)
    └── per S#:
        ├── f-tackle (Plan-Execute story → tasks)
        └── f-dialogue (engineer,qa)
            └── f-evaluate
    └── f-cove (cross-cut on assembled 04-tasks.md)

    f-phase-plan
    ├── f-tackle (dep-table draft)
    ├── f-cove (per-edge verify)
    └── (deterministic wave grouping in-shim, no push)
```

Peak stack depth: 5 frames
(orchestrator → phase → dialogue/plan-execute → tackle/role-turn → evaluate).
Within `dialogue.md`'s 10-turn cap.

## Orchestrator state machine

All state lives in the root frame's MEMORY plus `./scoped/gate.md`
(a single-token file naming the current phase: `summarise`,
`requirements`, `design`, `backlog`, `tasks`, `plan`).

| State                  | Trigger                            | Action                                                                                                                                                                       |
| ---------------------- | ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `empty`                | First cycle                        | Read PROGRAM.md, validate every listed input doc exists. Write `summarise` to `./scoped/gate.md`. Push `phase-summarise.md`. returnState: `phase-running`.                    |
| `phase-running_completed` | Pop from a phase                | Read `./scoped/gate.md` to know which phase just completed. Write gate question to `## Pending Questions`. Set state `waiting_for_user`.                                      |
| `user_responded`       | Shell completed gate              | Read `## Answers` and `./scoped/gate.md`. Dispatch by gate verb:                                                                                                              |
|                        | • `approve`                       | Advance gate token; push next phase shim with the prior artefacts as push-args. returnState: `phase-running`.                                                                 |
|                        | • `refine: <note>` / `refine <note>` | Re-push the current phase shim with `refinement_note: <note>`. returnState: `phase-running`. Resets any downstream stale artefacts (see staleness rule below).             |
|                        | • `cancel`                        | Set state `done`. Write OUTPUT.md naming the cancelled phase and the last completed artefact path. Preserve `workspace/`.                                                     |
|                        | • anything else                   | Treat as implicit `refine: <verbatim text>` (kiro-flow convention).                                                                                                          |
| `done` after plan-approval | Final pop                       | Write OUTPUT.md with `## Return answer: <one-paragraph success summary + workspace path>`. Stack collapses, shell halts.                                                     |

Staleness rule (refine cascades):

Refining phase N invalidates artefacts for phases > N. The orchestrator
silently re-runs phases N+1..current with their previous inputs, so the
user reaches the same gate they were at before. Exception: tasks-refine
auto-invalidates plan and re-runs Phase 5 silently (locked in the artefact
spec).

## Gate verbs (free-form text in `## Answers`)

| Pattern                                  | Meaning                                                       |
| ---------------------------------------- | ------------------------------------------------------------- |
| `approve`                                | Advance to next phase.                                        |
| `refine: <note>` or `refine <note>`      | Re-run current phase with the note. Cascades staleness.       |
| `cancel`                                 | Stop; preserve `workspace/`; write diagnostic to OUTPUT.md.   |
| Anything else                            | Implicit `refine: <verbatim text>`.                            |

Fuzzy match on the first whitespace-separated token, case-insensitive.

## Cancellation semantics

- `cancel` is only available at phase gates (after Summarise, Requirements,
  Design, Backlog, Tasks, Plan). No inline mid-phase interrupt.
- On cancel: `workspace/` is preserved untouched. OUTPUT.md gets a
  diagnostic naming the cancelled phase and pointing at the last completed
  artefact.
- Partial artefacts from an in-flight phase that hadn't reached its gate
  yet remain in their scoped frame dirs but are not promoted to
  `workspace/`.

## Input ingestion

PROGRAM.md lists input docs explicitly (locked answer). The Summarise
phase shim globs the listed paths and passes them as `ground_files` to the
CoVe step.

```markdown
# POC: <name>

## Source documents
- <path or url> — <one-line description>
- <path or url> — <one-line description>

## Constraints
- <e.g. "the mock must be runnable under Node 20">

## Out of scope (hints)
- <optional pre-declared exclusions>
```

If the path list is empty or any listed path is unreachable,
`phase-summarise.md` fails fast and the orchestrator surfaces the error
via OUTPUT and halts.

## `dialogue.md` configuration per phase

| Phase           | participants                       | scribe                       | acceptance |
| --------------- | ---------------------------------- | ---------------------------- | ---------- |
| 1 Requirements  | pm,qa,architect                    | pm (first speaker)           | true       |
| 2 Design body   | architect,engineer,qa,pm           | architect (first speaker)    | true       |
| 2b Per ADR      | architect,engineer,qa,devils-advocate | architect (first speaker)  | true       |
| 3 Backlog       | pm,qa,architect                    | pm (first speaker)           | true       |
| 4 Tasks/story   | engineer,qa                        | engineer (first speaker)     | true       |

`dialogue.md` makes `participants[0]` the first speaker (the de facto
scribe — they propose v0; consensus is reached when any speaker emits
`<SOLUTION>` with the agreed artefact body). All debates end with a final
`evaluate.md` push (`acceptance: true`) that judges the consensus against
the phase's criterion.

Hard cap: 10 turns per `dialogue.md` invocation (paper-anchored). No
override. Use the user-gate `refine` verb to extend.

## Resolved decisions (recap)

| # | Question                                                       | Resolution                                  |
| - | -------------------------------------------------------------- | ------------------------------------------- |
| 1 | Auto-refine inside each phase?                                  | Yes — built into `dialogue.md` rounds and `cove.md` per-claim verification |
| 2 | Gate I/O channel                                                | Runtime config (`.env`); orchestrator agnostic |
| 3 | Cancel preserves workspace                                      | Yes; cancel verb at any gate                |
| 4 | Tasks refine auto-invalidates plan                              | Yes (option a from prior round)             |
| 5 | Input doc list                                                  | PROGRAM.md enumerates explicit paths        |
| 6 | `max_rounds` per phase                                          | Keep `dialogue.md`'s 10-turn cap            |
| 7 | Ground files accessible to roles in debate                      | Yes — `dialogue.md` allows `bash cat`       |
| 8 | Devil's Advocate scope                                          | ADRs only                                   |
| 9 | No-consensus behaviour                                          | Surface to user gate with note              |
| 10 | Transcript persistence                                          | Persist debate transcripts under `workspace/.debate-transcripts/<phase>.md` |

## Deferred for implementation

- Exact wording of each phase shim's `topic` and `evaluate.md` criterion.
- Concrete role-persona contents under `interpreters/sdlc-poc/roles/`.
- How `phase-design.md` extracts the list of non-trivial choices from the
  consensus design before fanning out per-ADR pushes.
- How `phase-tasks.md` parses S#s from `03-backlog.md` to drive its
  per-story loop.
- Bash recipe for topological wave grouping in `phase-plan.md`.
- Persistence path/format for debate transcripts under
  `workspace/.debate-transcripts/`.
