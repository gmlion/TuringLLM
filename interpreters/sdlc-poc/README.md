# sdlc-poc

*SDLC POC interpreter — composes existing MAS operators to produce a full set of upstream SDLC artefacts (system summary, requirements, design, ADRs, backlog, tasks, dependency-graph + waves plan) for a POC that mocks a documented system.*

## What's modeled

Six sequential phases, each a real multi-role debate between named role-playing agents, with a user-approval gate between each phase. Inside each phase, work is delegated to existing operators from `interpreters/mas-papers/`:

- **Multi-role debate** via `dialogue.md` (ChatDev's N-role round-robin, generalised). Hard cap 10 turns; consensus signalled by `<SOLUTION>`.
- **Acceptance evaluation** via `evaluate.md` (Reflexion's evaluator), auto-pushed by `dialogue.md` when `acceptance: true`.
- **Recursive decomposition** via `plan-execute.md` / `tackle.md` / `plan.md` (Deep Research's recursive planner).
- **Chain-of-Verification** via `cove.md` / `verify.md` / `answer-independently.md` for fact-grounding artefact claims against source documents.

The six phases:

| #  | Phase         | Pattern                                                | Cast (roles)                                   | Artefact                                  |
| -- | ------------- | ------------------------------------------------------ | ---------------------------------------------- | ----------------------------------------- |
| 0  | Summarise     | Plan-Execute by section + CoVe against source docs     | (no debate — extraction)                       | `workspace/00-system-summary.md`          |
| 1  | Requirements  | `dialogue.md` (acceptance:true)                        | pm, qa, architect                              | `workspace/01-requirements.md`            |
| 2  | Design        | `dialogue.md` + CoVe (R# coverage)                     | architect, engineer, qa, pm                    | `workspace/02-design.md`                  |
| 2b | Per ADR       | `dialogue.md` (acceptance:true), pushed once per ADR   | architect, engineer, qa, devils-advocate       | `workspace/02-adr/ADR-NNN-<slug>.md`      |
| 3  | Backlog       | Plan-Execute (E#/F#/S# tree) + `dialogue.md`            | pm, qa, architect                              | `workspace/03-backlog.md`                 |
| 4  | Tasks         | Per-story `tackle.md` + assembled CoVe                  | engineer (drafts); CoVe verifies cross-cut     | `workspace/04-tasks.md`                   |
| 5  | Plan          | `tackle.md` (DAG + waves) + CoVe (per-edge verify)      | (no debate — mechanical from tasks)             | `workspace/05-plan.md`                    |

The artefact contract and ID conventions (R#, P#, ADR-###, E#/F#/S#, T#, W#) are locked in [`sdlc-poc-artefact-spec.md`](../../sdlc-poc-artefact-spec.md) at the repo root. The frame topology, gate semantics, and per-phase operator wiring are in [`sdlc-poc-interpreter-topology.md`](../../sdlc-poc-interpreter-topology.md).

## User-approval gates

After each phase pops, the orchestrator opens a gate by writing a question to `## Pending Questions` and setting state to `waiting_for_user`. The shell prompts the user (stdin or Telegram, depending on `.env`).

Gate verbs:
- `approve` — advance to next phase (or halt with success on the Plan gate).
- `refine: <note>` (or `refine <note>`) — re-run current phase with the note. The orchestrator writes the note to `workspace/.sdlc/<phase>-refinement-note.md`; the phase shim reads it and applies it.
- `cancel` — stop, preserve `workspace/` untouched, write OUTPUT.md diagnostic.
- Anything else — treated as implicit `refine: <verbatim text>`.

When a dialogue's auto-evaluator returns `verdict: fail`, the orchestrator surfaces the feedback in the gate question; the user can still `approve` to accept as-is.

### Unattended mode

The mode is encoded in PROGRAM.md as a `## Mode` section. Two values:

| Value         | Behaviour                                                                                          |
| ------------- | -------------------------------------------------------------------------------------------------- |
| `attended`    | Default. Every gate opens and waits for a user verb.                                              |
| `unattended`  | Every gate is auto-approved. The pipeline advances straight through to the final OUTPUT.md.       |

If the `## Mode` section is missing or holds anything else, the orchestrator treats it as `attended`. Whitespace and case are normalised, so `Unattended`, `UNATTENDED`, and `  unattended  ` are all the same.

Example PROGRAM.md:

```markdown
# POC: my-poc

## Mode
unattended

## Source documents
- workspace/inputs/spec.md — System spec
...
```

Every auto-approved gate appends one line to `workspace/.sdlc/unattended-log.md` with the gate name, the dialogue's internal verdict (`pass` or `fail`), and the artefact path. On `fail`, the next line records the evaluator's feedback verbatim so you can review what got auto-approved despite a failed consensus. The mode does NOT auto-retry on `fail` — it just records and continues; if you want quality control without staring at the screen, run attended at first and only switch to unattended for re-runs on the same PROGRAM.md.

`refine` and `cancel` are unreachable in unattended mode — the orchestrator never opens a real gate, so there's nothing to type at.

## Frame topology

```
f000-sdlc-orchestrator              (root)
└── per phase, in sequence:

    f-phase-summarise
    ├── f-plan-execute (by schema section)
    │   ├── f-plan
    │   └── f-tackle (recursive per section)
    └── f-cove (verify against workspace/inputs/)
        ├── f-verify
        └── f-answer-independently (per claim)

    f-phase-requirements
    └── f-dialogue (pm,qa,architect)
        └── f-evaluate

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
        └── f-tackle (story → tasks)
    └── f-cove (cross-cut + global T# renumbering)

    f-phase-plan
    ├── f-tackle (dep-table + waves draft)
    └── f-cove (per-edge verify)
```

Peak stack depth: 5 frames (orchestrator → phase → dialogue/plan-execute → tackle/critique → evaluate).

## Where artefacts live

All durable artefacts go to `workspace/` (the instance's project repo). The orchestrator stages cross-frame state under `workspace/.sdlc/`:

- `workspace/.sdlc/<phase>-refinement-note.md` — user note from a refine verb.
- `workspace/.sdlc/last-artefact.md` — path of the most recently completed artefact, used to compose the gate question.
- `workspace/.sdlc/last-verdict.md`, `workspace/.sdlc/last-feedback.md` — evaluator output, surfaced to the user when a dialogue failed to reach consensus.

Per-frame intermediate state lives in `frames/<frame>/scoped/` and is not promoted to `workspace/`.

## Roles

Five role personas under `roles/` (copied into the instance by `new-instance.sh`):

| File                | Used by phase(s)               |
| ------------------- | ------------------------------ |
| `pm.md`             | 1, 2, 3                        |
| `qa.md`             | 1, 2, 2b, 3, 4 (CoVe-evaluator) |
| `architect.md`      | 1, 2, 2b, 3                    |
| `engineer.md`       | 2, 2b, 4                       |
| `devils-advocate.md`| 2b (ADRs only)                 |

Personas are first-person and short (~30 lines). Each lists "I push back when…" triggers so the LLM has concrete per-turn checks when speaking in character.

## Run it

The interpreter ships a demo `PROGRAM.md` that targets a fictional User Service mock, with two source documents under `workspace/inputs/` (`user-service-overview.md`, `auth-flows.md`).

```bash
./new-instance.sh interpreters/sdlc-poc my-poc
# Optionally replace instances/my-poc/PROGRAM.md and instances/my-poc/workspace/inputs/ with your own
instances/my-poc/run.sh
```

To use your own source documents:

1. Drop them into `instances/my-poc/workspace/inputs/`.
2. Edit `instances/my-poc/PROGRAM.md` to list those files under `## Source documents` and to name your POC.

## Notable trade-offs vs. the topology spec

- **No per-story dialogue in Phase 4.** The locked topology spec says per-story Plan-Execute + per-story dialogue [engineer, qa]. The shipped shim does per-story `tackle.md` (engineer role) and then a single CoVe pass over the assembled tasks file. Trade-off: less per-story refinement; more dependence on the cross-cut CoVe verifier to catch missed details. The simpler shim avoids 2× LLM cycles per story (which for a 12-story backlog matters).
- **Wave grouping by LLM, not bash.** The locked topology says wave grouping should be a deterministic bash step in `phase-plan.md`. The shipped shim instead encodes Kahn's algorithm in the `tackle.md` topic and asks the LLM to compute waves, then CoVe verifies. Simpler shim; relies on the LLM doing the topo sort correctly, with CoVe per-edge verification as the safety net.

Both deviations are local to the phase shims involved; the artefact contract is unchanged.

## Layout

`INSTRUCTIONS.md` is a single-line marker pointing at `operators/sdlc-orchestrator.md` (the canonical root strategy). Phase shims and reused operators all live under `operators/`. Roles under `roles/`. Demo inputs under `workspace/inputs/`.
