# Group 3 — Search

Pattern family: explicit exploration over alternative partial solutions, distinct from iterative refinement (Group 1) and decomposition (Group 2). See `docs/agent-workflows/patterns.md` § Group 3.

## Variants

| Variant                      | Status              | Pattern                       | Source                                                  |
| ---------------------------- | ------------------- | ----------------------------- | ------------------------------------------------------- |
| `a-tot/`                     | Shipped (Phase 6)   | Tree of Thoughts              | Yao et al., NeurIPS 2023, arXiv:2305.10601              |
| `b-got/`                     | Deferred            | Graph of Thoughts             | Besta et al., 2023, arXiv:2308.09687                    |
| `interpreters/lats/` (out)   | Planned (Phase 6b)  | Language Agent Tree Search    | Zhou et al., 2023, arXiv:2310.04406                     |

## Shared dynamics

`expand-node.md` and `score.md` (introduced by `a-tot/`) are normative for the Search group going forward. LATS (Phase 6b) is expected to import both unmodified.
