# a-metagpt

*MetaGPT (Hong et al., ICLR 2024). See
`docs/agent-workflows/patterns.md` §Group 5.*

This interpreter implements MetaGPT's fixed Software-Engineering
SOP: **PM → Architect → Engineer → QA**, each role consuming the
prior role's typed document and producing the next. Document
hand-off is the contract; there is no dialogue between roles.

## State machine

```
empty ─(push role-pm)─► empty_completed & ## PRD present ─(push role-architect)─► empty_completed & ## Design present
                                                                                             │
                                        ─(push role-engineer)─► empty_completed & ## Tasks present
                                                                                             │
                                        ─(push role-qa)─► empty_completed & ## Code Review present ─► done
```

Five strategy instructions: `Initialize`, `Dispatch Architect`,
`Dispatch Engineer`, `Dispatch QA`, `Finish`.

## Dynamics

| File                        | Consumes                             | Produces                                     | Stack depth                |
| --------------------------- | ------------------------------------ | -------------------------------------------- | -------------------------- |
| `dynamics/role-pm.md`       | `{{program}}`                        | `prd`                                        | 1                          |
| `dynamics/role-architect.md`| `{{prd}}`                            | `design`                                     | 1                          |
| `dynamics/role-engineer.md` | `{{design}}`                         | `tasks` (+ side-effect: code in workspace/)  | 1                          |
| `dynamics/role-qa.md`       | `{{tasks}}`, `{{code_location}}`     | `code_review`                                | 2 (pushes `evaluate.md`)   |
| `dynamics/evaluate.md`      | `{{attempt}}`, `{{criterion}}`       | `verdict`, `feedback`                        | leaf (byte-equal copy from Phase 1b) |

## Demo `PROGRAM.md`

Build `wc-plus`: a small CLI tool that counts lines/words/bytes
with `--json` and `--help` flags. Shared byte-for-byte with
`../b-chatdev/PROGRAM.md` so outputs are directly comparable.

## Run it

```bash
./new-instance.sh my-metagpt interpreters/5-fixed-sop-teams/a-metagpt
instances/my-metagpt/run.sh
```

## Known behaviour

- Linear: no loops, no retry. If QA returns `fail`, the machine
  still halts; the failed review is recorded in MEMORY + a
  non-blocking `## Pending Questions` entry.
- Stack depth reaches 2 during the QA phase (role-qa pushes
  evaluate.md). Validated by `src/test/phase-4-metagpt.test.ts`.
