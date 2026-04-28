# a-metagpt

*MetaGPT (Hong et al., ICLR 2024). See
`docs/agent-workflows/patterns.md` §Group 5.*

## What's modeled

A small simulated software team running a fixed Standard
Operating Procedure (SOP): **PM → Architect → Engineer → QA**.
Each role acts once, in sequence, and produces a *typed
document* that becomes the input to the next role. The
contract between phases is the document itself — there is no
back-and-forth conversation, no negotiation, and (unlike
b-chatdev) no acceptance gate that loops back. The PM's PRD
flows to the Architect, who produces a Design; the Design
flows to the Engineer, who produces Tasks plus actual source
files in `workspace/`; the Tasks flow to the QA, who produces a
Code Review by inspecting the engineered code.

The pattern's value is *role specialization with linear
hand-off*: each role gets the previous role's output as its
single, well-typed input, and contributes one well-typed
artefact of its own.

## Six orchestrators across the run, two contexts active at most

| Driver | When it's active | What it can see | What it produces |
| --- | --- | --- | --- |
| **Strategy** (`f000-strategy`) | Initial dispatch, after each role's pop, final | Its own MEMORY (which **accumulates** the typed sections `## Prd`, `## Design`, `## Tasks`, `## Review` as the SOP progresses), the user program | A push of the next role, or `done` |
| **PM role** (`fNNN-role-pm`) | One PRD draft | Only the user program (`{{program}}`) handed in via push-args | A `prd` (≤ 400 words: user stories, acceptance criteria, non-goals) |
| **Architect role** (`fNNN-role-architect`) | One design pass | Only the PRD (`{{prd}}`) handed in via push-args | A `design` |
| **Engineer role** (`fNNN-role-engineer`) | One implementation pass | Only the design (`{{design}}`) handed in via push-args; uses the toolset (bash, write) to write source files into `workspace/` | A `tasks` document describing what was implemented; **the actual source files live in `workspace/`** as the side effect |
| **QA role** (`fNNN-role-qa`) | One review pass; pushes `evaluate.md` for the verdict | The Tasks (`{{tasks}}`) and the code location (`{{code_location}}`) handed in via push-args; reads the engineered code via `bash cat` from `workspace/` | A `review` (= verdict + feedback), passing through the evaluator |
| **Evaluator** (`fNNN-evaluate`) | One pass/fail decision inside the QA role | The QA's review attempt and its criterion handed in via push-args; can list `workspace/` and read files there | `verdict` + `feedback` |

A role context is created on each push and destroyed on the
matching pop. **Roles never see each other's working state** —
they only see what was explicitly handed in via push-args.
There's no shared "scratchpad" between roles. The only state
that persists across the entire SOP is what the strategy
accumulates in its own MEMORY (the typed sections) and what the
Engineer writes to `workspace/`.

Stack depth reaches 2 only inside the QA role (when it pushes
`evaluate.md`); every other role is a leaf at depth 1.

## How a run works

A complete run is six strategy cycles plus each role's internal
work:

1. **(strategy)** *Initialize.* Read PROGRAM.md, push
   `role-pm.md` with the program text. State → `pm_active`.
2. **(PM)** *Draft PRD.* Read the program; emit a PRD as `prd`.
   Pop.
3. **(strategy)** *Dispatch Architect.* `## Prd` is now in
   strategy MEMORY (spliced from the PM's pop). Push
   `role-architect.md` with the PRD body. State →
   `architect_active`. The `## Prd` section is left in place;
   it accumulates as part of the final hand-off record.
4. **(Architect)** Read PRD; emit `design`. Pop.
5. **(strategy)** *Dispatch Engineer.* Push `role-engineer.md`
   with the design. State → `engineer_active`.
6. **(Engineer)** Read the design; use the Bash / Write tools
   to create source files in `workspace/`; emit a `tasks`
   document describing what was built. Pop.
7. **(strategy)** *Dispatch QA.* Push `role-qa.md` with the
   tasks and `code_location: ../../workspace/`. State →
   `qa_active`.
8. **(QA, cycle 1)** *Review.* Read the engineered code from
   `workspace/`; synthesize a review attempt and pick a
   criterion from the PRD; push `evaluate.md` with both. State
   → `awaiting_verdict`.
9. **(Evaluator)** Issue `verdict` (`pass`/`fail`) + `feedback`.
   Pop.
10. **(QA, cycle 2)** *Return verdict.* Wrap verdict and
    feedback into a structured `review` and return it on pop.
11. **(strategy)** *Finish.* `## Review` is now in strategy
    MEMORY. State → `done`. Shell halts.

## Where things live

- **Strategy MEMORY** accumulates `## Prd`, `## Design`,
  `## Tasks`, `## Review` as roles complete. By the end, the
  strategy's MEMORY is a complete linear record of every role's
  output.
- **`workspace/`** holds the source files written by the
  Engineer via the Bash / Write tools. This is the only
  artefact that survives the run as code.

There are no `./scoped/` files in this interpreter — each role
runs to completion in a single push and uses MEMORY-only state
internally.

## Dynamics in this interpreter

| File | Receives (push-args) | Returns | Stack depth from caller |
| --- | --- | --- | --- |
| `dynamics/role-pm.md` | `program` | `prd` | leaf |
| `dynamics/role-architect.md` | `prd` | `design` | leaf |
| `dynamics/role-engineer.md` | `design` | `tasks` (+ side effect: source files in `workspace/`) | leaf |
| `dynamics/role-qa.md` | `tasks`, `code_location` | `review` (= verdict + feedback) | 2 (pushes `evaluate.md`) |
| `dynamics/evaluate.md` | `attempt`, `criterion` | `verdict`, `feedback` | leaf (byte-equal copy of the shared evaluator) |

## Demo `PROGRAM.md`

Build `wc-plus`: a small CLI tool that counts lines/words/bytes
with `--json` and `--help` flags. Shared byte-for-byte with
`../b-chatdev/PROGRAM.md` so the two interpreters' outputs are
directly comparable on the same task.

## Run it

```bash
./new-instance.sh my-metagpt interpreters/5-fixed-sop-teams/a-metagpt
instances/my-metagpt/run.sh
```

## Notable behaviour

- **Strictly linear; no retry.** If QA returns `fail`, the
  machine still halts. The failed review is recorded in MEMORY,
  and a non-blocking `## Pending Questions` entry is added so
  the user can act on it. Compare with `../b-chatdev/`, which
  does loop on `fail`.
- **No iteration cap is meaningful** — the SOP is a fixed
  sequence of four role pushes.
- **Stack depth 2 only inside QA.** Every other role is a leaf
  push at depth 1.
