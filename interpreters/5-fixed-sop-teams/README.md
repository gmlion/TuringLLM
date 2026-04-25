# Fixed-SOP Teams — Group 5

*patterns.md §Group 5.*

This group ships two interpreters with structurally different
role-collaboration models, running on a shared `PROGRAM.md` so
outputs are directly comparable.

| Leaf           | Framing          | Source                          | Role-collaboration model    |
| -------------- | ---------------- | ------------------------------- | --------------------------- |
| `a-metagpt/`   | MetaGPT          | Hong et al., ICLR 2024          | Document hand-off: one role per phase; the contract is a typed document |
| `b-chatdev/`   | ChatDev          | Qian et al., 2023               | Phase dialogue: two roles per phase; the contract is a converged transcript |

## Why two interpreters (not a collapse)

Under the `interpreter + PROGRAM → instance` rule, comparing two
role-collaboration models requires two interpreters running the
same PROGRAM. Collapsing them into one interpreter would erase
the comparison this phase exists for. See the spec at
`docs/specs/2026-04-24-implement-phase-3-and-4/` §Phase 4 for
the full argument.

## Shared PROGRAM.md

Both leaves ship byte-identical `PROGRAM.md` — the `wc-plus`
CLI tool task (see `a-metagpt/PROGRAM.md`). Identity is pinned
by `src/test/phase-4-chatdev.test.ts`.

## Shared dynamic

Both leaves ship a byte-equal copy of `dynamics/evaluate.md`
(from Phase 1b). The four-way identity across `b-evaluator-
optimizer`, `c-reflexion`, `a-metagpt`, `b-chatdev` is pinned
by `src/test/phase-dynamics-identity.test.ts` (R29).

## Run them side-by-side

```bash
./new-instance.sh mg interpreters/5-fixed-sop-teams/a-metagpt
./new-instance.sh cd interpreters/5-fixed-sop-teams/b-chatdev
instances/mg/run.sh
instances/cd/run.sh
diff -u instances/mg/workspace/ instances/cd/workspace/
```

## See also

- `docs/agent-workflows/patterns.md` §Group 5.
- `docs/specs/2026-04-24-implement-phase-3-and-4/` — the
  spec that shipped this group and retired `game-team`.
