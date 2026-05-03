# Design: agent-workflows-phase-1

## Overview

Three thin strategy files plus three small dynamics, all composed from the
shell primitives that already exist (`applyPush`, `applyPop`, fuzzy NL
condition matching, per-cycle MEMORY snapshots). No new production
TypeScript is planned — the interpreters are pure markdown plus supporting
demo `PROGRAM.md` files. The three interpreters differ only in *who
critiques* and *what is remembered*, so the architectural variation lives
entirely in the strategy state machines, not in the dynamics' contracts
nor in the shell. The core trade-off: we accept a byte-duplicated
`evaluate.md` across `b-evaluator-optimizer` and `c-reflexion` (enforced
by a unit test) instead of introducing a shared-dynamics-folder feature to
the shell — this keeps `new-instance.sh` unchanged and the directory
layout self-describing.

## Requirement coverage

| R#  | Summary                                                            | Addressed in                                              |
| --- | ------------------------------------------------------------------ | --------------------------------------------------------- |
| R1  | Three interpreter dirs under `1-iterative-refinement/`             | §Architecture, §File layout                               |
| R2  | Three dynamics placed under each interpreter's `operators/`         | §File layout, §Dynamics                                   |
| R3  | `self-critique.md` MEMORY contract                                 | §Dynamics → self-critique                                 |
| R4  | `evaluate.md` MEMORY contract                                      | §Dynamics → evaluate                                      |
| R5  | `reflect.md` MEMORY contract                                       | §Dynamics → reflect                                       |
| R6  | Dynamics return via `done` → shell sets `{caller_state}_completed` | §Architecture, §State machines (a/b/c)                 |
| R7  | Demo `PROGRAM.md` per interpreter                                  | §Demos                                                    |
| R8  | Demo halts at `done` on Claude Code provider                       | §Demos, §Test strategy → End-to-end                       |
| R9  | `history/` replays in visualizer                                   | §Test strategy → End-to-end                               |
| R10 | No hard iteration cap                                              | §State machines (loop on `fail` re-entering via strategy) |
| R11 | Reflexion demo accumulates ≥2 lessons                              | §Demos → c, §Test strategy → scripted tests              |
| R12 | Reflexion includes `## Lessons` before post-first attempts         | §State machines → c                                      |
| R13 | Shell fixes allowed within spec scope                              | §Shell-side changes (contingent)                          |
| R14 | Only non-breaking additive shell improvements permitted            | §Shell-side changes (contingent)                          |
| R15 | `interpreters/game-team/` unchanged                                | §File layout, §Out of scope (for layout)                  |
| R16 | Unit tests for new pure-function TS                                | §Test strategy → unit tests (vacuous unless R13 fires)    |
| R17 | Scripted push/pop integration test per interpreter                 | §Test strategy → integration tests                        |
| R18 | `npm test` passes                                                  | §Test strategy → CI gate                                  |
| R19 | Update dynamics table on any contract drift                        | §Open questions → OQ4 *(resolved: byte-equality test)*    |
| R20 | Update CLAUDE.md "Existing interpreters"                           | §Documentation deliverables                               |
| R21 | `phase-1-notes.md` written                                         | §Documentation deliverables                               |
| R22 | Retry-exhaustion uses existing code path                           | §Error handling                                           |
| R23 | Directory layout convention                                        | §File layout                                              |
| R24 | `game-team` exempt from R23                                        | §File layout                                              |

## Architecture

### Shape shared by all three interpreters

```
                  strategy (state machine)
                        │
             state transitions via LLM cycles
                        │
                 writes ## Push \n <path>
                        │   (shell reads)
                        ▼
                 shell applyPush:
                  ├─ save {state, instructions} to stack
                  ├─ load dynamic as new instructions
                  ├─ strip ## Push
                  └─ set state "empty"
                        │
                  dynamic runs ≥1 cycle
                  (state empty → … → done)
                        │
                  shell applyPop:
                  ├─ restore caller's instructions
                  └─ set state "{caller_state}_completed"
                        │
                  strategy reads results from MEMORY
                        │
                  decide: loop (re-enter trigger state)
                           or halt (set done)
```

All three reuse the shell's existing `applyPush` / `applyPop`
pop-on-`done`/set-`{caller_state}_completed` semantics from
`src/call-stack.ts`. Stack depth never exceeds 1. No new shell code is
required to deliver R1–R12.

### Why not a shared `evaluate.md` at the group level

A single canonical `evaluate.md` lives under `b-evaluator-optimizer/
operators/`. `c-reflexion/operators/` holds a byte-identical copy.
Justification: `new-instance.sh` copies only `$INTERP_DIR/operators/`
verbatim; reaching outside the interpreter directory would require
extending the bootstrap script (R14 territory, and the cost is not paid
back in Phase 1 since there is exactly one duplicated file). A unit test
asserts byte equality so drift is caught at `npm test` time (satisfies
R19 operationally). When Phase 2+ adds more reuse, the shared-folder
convention becomes worthwhile — documented in §Open questions for
follow-up.

## File layout

```
interpreters/
├── game-team/                          # R15, R24: unchanged, exempt from R23
└── 1-iterative-refinement/             # R23: group folder (patterns.md Group 1)
    ├── a-self-refine/                 # R1
    │   ├── INSTRUCTIONS.md             # strategy — §State machines → a
    │   ├── PROGRAM.md                  # R7: "write a concise docstring" demo
    │   └── operators/
    │       └── self-critique.md        # R2, R3
    ├── b-evaluator-optimizer/         # R1
    │   ├── INSTRUCTIONS.md             # §State machines → b
    │   ├── PROGRAM.md                  # R7: "rewrite paragraph to target register" demo
    │   └── operators/
    │       └── evaluate.md             # R2, R4 — canonical copy
    └── c-reflexion/                   # R1
        ├── INSTRUCTIONS.md             # §State machines → c
        ├── PROGRAM.md                  # R7: palindrome-function-with-hidden-tests demo
        └── operators/
            ├── evaluate.md             # byte-equal copy of b's — enforced by test
            └── reflect.md              # R2, R5
```

No files move. `new-instance.sh` needs no edit because it already accepts
arbitrary paths (`./new-instance.sh foo interpreters/1-iterative-refinement/a-self-refine`)
and `cp -r "$INTERP_DIR/dynamics"` operates on each leaf's own folder.

## Data model — MEMORY sections

| Section                | Producer           | Consumer                         | Notes                                             |
| ---------------------- | ------------------ | -------------------------------- | ------------------------------------------------- |
| `## State`             | shell + LLM        | shell (stack block, halt check)  | Existing.                                         |
| `## Push`              | LLM                | shell (`applyPush`)              | Existing; value = path to a dynamic `.md` file.   |
| `## Matched Instruction` | LLM              | shell (`handleNoMatch`)          | Existing. `none` ⇒ `waiting_for_user`.            |
| `## Pending Questions` | LLM                | shell                            | Existing.                                         |
| `## Answers`           | shell              | LLM                              | Existing.                                         |
| `## Draft`             | a strategy        | `self-critique.md`               | Satisfies R3. Free-form text.                     |
| `## Critique`          | `self-critique.md` | a strategy                      | R3 output A.                                      |
| `## Refined`           | `self-critique.md` | a strategy                      | R3 output B; promoted to `## Draft` on re-enter.  |
| `## Criterion`         | b/c strategy (init) | `evaluate.md`                 | Extracted from PROGRAM.md on first cycle.         |
| `## Attempt`           | b/c strategy     | `evaluate.md`, `reflect.md`      | Per-iteration.                                    |
| `## Verdict`           | `evaluate.md`      | b/c strategy, `reflect.md`     | Must be literal `pass` or `fail` (R4).            |
| `## Feedback`          | `evaluate.md`      | b/c strategy                   | Free-form text guiding next attempt.              |
| `## Lesson`            | `reflect.md`       | c strategy                      | Single lesson from the most recent failed attempt.|
| `## Lessons`           | c strategy        | c strategy (future attempts)    | Growing bullet list; R11, R12.                    |

No shell-side parser changes: every new section is produced by and
consumed by the LLM via `write_file`/`update_memory`. Consequently, R16
introduces **zero new production TypeScript** unless a shell fix fires
under R13.

## Interfaces

### Strategy state machines

All three follow the shell's fuzzy-NL-condition contract: `## Instruction:`
blocks with `**Condition:**` and `**Action:**`.

#### a — `self-refine` `INSTRUCTIONS.md`

```
# Strategy: Self-Refine
IMPORTANT: Everything between "# Strategy" and "# Sub-instructions" …

## Instruction: Initialize                   // satisfies R1
**Condition:** MEMORY state is "empty"
**Action:** Read PROGRAM.md. Produce an initial draft and write it to
  ## Draft. Set state to "drafted".

## Instruction: Request critique              // satisfies R2, R3, R6
**Condition:** state is "drafted" and ## Draft is present
**Action:** Write ## Push = operators/self-critique.md (shell pushes on
  the next cycle).

## Instruction: Evaluate refinement           // satisfies R10 (loop)
**Condition:** state is "drafted_completed" and ## Critique and ## Refined
  are present
**Action:** Decide whether ## Refined adequately addresses the task per
  PROGRAM.md. If accepted, set state "done". If not accepted, promote
  ## Refined to ## Draft (replacing), clear ## Critique and ## Refined,
  set state "drafted" (which re-enters "Request critique").

## Instruction: Finish
**Condition:** state is "done"
**Action:** Summarise the final draft and halt.

# Sub-instructions
(none — this interpreter needs none.)
```

State graph:
```
empty ─► drafted ─(push)─► [self-critique dynamic] ─(pop)─► drafted_completed
                                                                 │
                                                  accepted ──► done
                                                  rejected ──► drafted (loop)
```

#### b — `evaluator-optimizer` `INSTRUCTIONS.md`

```
## Instruction: Initialize
**Condition:** state is "empty"
**Action:** Read PROGRAM.md. Copy its acceptance criterion into
  ## Criterion (verbatim). Produce an initial attempt and write it to
  ## Attempt. Set state "attempted".

## Instruction: Request evaluation            // R2, R4, R6
**Condition:** state is "attempted" and ## Attempt and ## Criterion are present
**Action:** Write ## Push = operators/evaluate.md.

## Instruction: Handle verdict                // R10
**Condition:** state is "attempted_completed" and ## Verdict is present
**Action:** If ## Verdict is "pass", set state "done". If "fail", use
  ## Feedback to rewrite ## Attempt, clear ## Verdict and ## Feedback,
  set state "attempted".

## Instruction: Finish
**Condition:** state is "done"
**Action:** Halt with the final ## Attempt.
```

#### c — `reflexion` `INSTRUCTIONS.md`

```
## Instruction: Initialize
**Condition:** state is "empty"
**Action:** Read PROGRAM.md. Copy acceptance criterion into ## Criterion.
  Initialize an empty ## Lessons section. Set state "attempting".

## Instruction: Attempt                       // R12
**Condition:** state is "attempting"
**Action:** Read ## Lessons (if any) and ## Criterion. Produce an attempt
  that reflects the accumulated lessons; write it to ## Attempt. Set
  state "attempted".

## Instruction: Request evaluation            // R2, R4, R6
**Condition:** state is "attempted" and ## Attempt is present
**Action:** Write ## Push = operators/evaluate.md.

## Instruction: Route on verdict
**Condition:** state is "attempted_completed"
**Action:** If ## Verdict is "pass", set state "done". Otherwise set
  state "failed_attempt".

## Instruction: Reflect                       // R2, R5, R6, R11
**Condition:** state is "failed_attempt" and ## Attempt and ## Verdict
  are present
**Action:** Write ## Push = operators/reflect.md.

## Instruction: Accumulate lesson              // R11
**Condition:** state is "failed_attempt_completed" and ## Lesson is present
**Action:** Append ## Lesson (with a numbered prefix) to ## Lessons.
  Clear ## Attempt, ## Verdict, ## Feedback, ## Lesson. Set state
  "attempting".

## Instruction: Finish
**Condition:** state is "done"
**Action:** Halt with the final ## Attempt and a summary of lessons used.
```

State graph (abbrev.):
```
empty ─► attempting ─► attempted ─(push eval)─► attempted_completed
                                                      │
                                       pass ──────► done
                                       fail ──► failed_attempt
                                                      │
                                                (push reflect)
                                                      │
                                           failed_attempt_completed
                                                      │
                                           append ## Lesson; reset → attempting
```

### Dynamics

All three obey the shell contract: entry condition on state `empty`;
terminal instruction sets state `done` (triggers pop).

#### `self-critique.md` (R3)

```
## Instruction: Critique
**Condition:** state is "empty" and ## Draft is present
**Action:** Read ## Draft. Write ## Critique noting concrete strengths
  and weaknesses. Set state "critiqued".

## Instruction: Refine
**Condition:** state is "critiqued"
**Action:** Read ## Draft and ## Critique. Produce an improved version
  and write it to ## Refined. Set state "done".
```

#### `evaluate.md` (R4)

```
## Instruction: Judge
**Condition:** state is "empty" and ## Attempt and ## Criterion are present
**Action:** Judge whether ## Attempt meets ## Criterion. Write ## Verdict
  as literally "pass" or "fail". Write ## Feedback describing what was
  right or wrong, concretely. Set state "done".
```

#### `reflect.md` (R5)

```
## Instruction: Distil lesson
**Condition:** state is "empty" and ## Attempt and ## Verdict are present
**Action:** Read ## Attempt and ## Verdict (and ## Feedback if present).
  Write ## Lesson as one short verbal rule the *next* attempt should
  apply (one or two sentences, not a restatement of feedback). Set
  state "done".
```

## Demos

Locked by this spec to keep R8 test-runnable; OQ1/OQ2 from
`requirements.md` are resolved here.

- **a `PROGRAM.md`**: Ask the machine to write a concise, one-paragraph
  docstring for the existing `parseState` function in `src/memory.ts`.
  Acceptance is qualitative — the self-critique dynamic judges its own
  refinement. No explicit `## Criterion` because a has no external
  evaluator.
- **b `PROGRAM.md`**: A short technical paragraph (provided in the file)
  that the machine must rewrite in plain, non-expert English.
  `## Acceptance Criterion` in PROGRAM.md lists three bullet rules
  (length ≤ 5 sentences, no jargon terms from a listed set, preserves
  factual claims). The strategy copies these verbatim into
  `## Criterion` on the first cycle.
- **c `PROGRAM.md`**: Write a Python function `is_palindrome(s: str) ->
  bool` that returns True for palindromes ignoring case and
  non-alphanumeric characters. `## Acceptance Criterion` specifies: the
  function must pass hidden tests that live at
  `workspace/tests/test_palindrome.py` (shipped by the strategy's
  "Initialize" instruction — see next bullet). The `evaluate.md` dynamic
  runs `python workspace/tests/test_palindrome.py` via the `bash` tool,
  reads the exit code, and writes `pass` or `fail` accordingly. Tests
  include tricky edge cases (empty string, single char, mixed case,
  numeric palindromes, embedded punctuation) so an under-thought first
  attempt fails, producing the ≥2 failed-attempt sequence R11 requires.
- **Where does the initial Criterion live?** (OQ2 resolved.) In each
  demo `PROGRAM.md` under a `## Acceptance Criterion` section. The
  strategy's "Initialize" instruction copies this section verbatim into
  `## Criterion` in MEMORY. This keeps PROGRAM.md authoritative and
  strategy logic uniform.

## Error handling

| Unwanted / error condition                                  | Handling                                                                                                                                             | R#       |
| ----------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| Push target missing or empty                                | Existing shell behaviour (`applyPush` returns `missing-target`, shell strips `## Push` and logs) — not regressed by Phase 1. Tests cover.            | —        |
| `## Verdict` absent when strategy expects it                | "Handle verdict" / "Route on verdict" condition fails to match → shell sets `waiting_for_user` via `handleNoMatch`, asking user what to do.          | (shell)  |
| `## Verdict` malformed (neither `pass` nor `fail`)          | Strategy treats as `fail` (conservative); additionally appends a `## Pending Questions` item flagging the malformed verdict for user inspection.     | —        |
| Retry budget exhausted mid-demo                             | Existing `withBackoff` + per-provider retry caps. Machine exits cleanly with MEMORY + `history/` inspectable.                                        | R22      |
| `evaluate.md` divergence between b and c                  | Unit test asserts byte equality on every `npm test`; divergence fails CI.                                                                            | R19      |
| Shell bug blocks progress                                   | In-scope per R13; fix lands in the same spec.                                                                                                        | R13, R14 |

## Shell-side changes (contingent)

Expected: **none**. The Phase 1 state machines and dynamics compose
existing primitives only. If implementation surfaces a blocker, R13
permits fixing it inside this spec (with a unit test under R16). R14
bounds any non-blocking improvements to non-breaking, additive changes
(e.g. adding a clearer `[push] ERROR:` message already produced by
`runStackBlock` — already present; no change expected).

## Test strategy

### Unit tests (R16)

Vacuous for Phase 1 unless R13 fires. Deliverable gate: if any new pure
TS is added, it lands with a companion test in `src/test/<name>.test.ts`
mirroring `src/test/call-stack.test.ts` style (tiny, pure, no I/O).

### Integration tests (R17) — scripted push/pop without LLM

One new test file per interpreter:

- `src/test/phase-1-self-refine.test.ts`
- `src/test/phase-1-evaluator-optimizer.test.ts`
- `src/test/phase-1-reflexion.test.ts`

Each reuses the `runStackBlock` helper pattern from
`src/test/stack-integration.test.ts` (local top-of-file helper, same
signature). Each scripts the MEMORY mutations the LLM *would* produce
across a few cycles, then asserts:

- **Self-refine**: one push (`drafted` → self-critique), dynamic sets
  `done`, pop lands at `drafted_completed`; a second loop
  (`drafted` → push → `drafted_completed` → `done`) also succeeds,
  proving R10's loop.
- **Evaluator-optimizer**: one push (`attempted` → evaluate),
  `## Verdict=fail` leads back to `attempted`, a second push leads to
  `## Verdict=pass` and `done`.
- **Reflexion**: full loop — two failed attempts (evaluate + reflect
  each time) accumulate two entries in `## Lessons` (R11), attempt three
  passes. Final assertions: `parseState` ends at `done`; MEMORY
  `## Lessons` contains ≥ 2 bullets; at each `attempting` re-entry the
  MEMORY written by the strategy simulation contains `## Lessons` in
  scope (proxy for R12 since the actual prompt inclusion happens inside
  the LLM cycle).

Plus one small additional test file:

- `src/test/phase-1-dynamics-identity.test.ts` — reads the two
  `evaluate.md` copies, asserts byte equality (satisfies R19
  operationally).

### End-to-end (R8, R9, R18)

Non-automated: the implementer runs each demo via
`./new-instance.sh foo2a interpreters/1-iterative-refinement/a-self-refine`
(and peers) + `instances/foo2a/run.sh` with `TURING_PROVIDER=claude-code`
and confirms:

- Machine halts at `done`.
- `history/` has a contiguous snapshot sequence.
- `./visualize.sh foo2a` launches and paints all snapshots without error.

Results are attached to the PR description (cycle count, pass/fail). No
CI changes — end-to-end verification is out of the automated gate
because it costs real LLM calls.

### CI gate (R18)

`npm test` at the repo root builds (`tsc → dist/`) and runs the full
`node:test` suite — existing + new files listed above — with zero
failures. The `npm test` script already exists; no wiring change.

## Documentation deliverables

- **`docs/agent-workflows/phase-1-notes.md`** (R21): written during
  implementation with one paragraph per surprising finding, or a
  one-line "nothing surprising" sentinel.
- **`CLAUDE.md` "Existing interpreters" subsection** (R20): three new
  bullet entries (one per interpreter) with a one-line summary pointing
  at `docs/agent-workflows/patterns.md` Group 1. `game-team` bullet is
  left intact (R15).
- **Dynamics table at the top of `docs/agent-workflows/requirements.md`**
  (R19): updated only if MEMORY contracts drift from R3–R5. If the
  implementation matches this design byte-for-byte, the table is already
  correct and no edit is needed.

## Open questions

*(Open questions OQ1/OQ2/OQ3 from requirements.md are resolved above.)*

- **OQ4** *(new, carried forward, does not block approval)*: When
  Phase 2 adds another duplicated dynamic (likely `evaluate.md` being
  reused again by `2-cove`), revisit the "canonical copy + identity
  test" convention vs. introducing a group-level shared-dynamics folder
  in `new-instance.sh`. Not resolved in Phase 1 by design.
