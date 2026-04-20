# 1a — Self-Refine

*Madaan et al., NeurIPS 2023 — "Self-Refine: Iterative Refinement with
Self-Feedback". See `docs/agent-workflows/patterns.md` §Group 2.*

The minimal case of the `generate → critique → revise` family. A single
role drafts, critiques its own draft via the `self-critique.md`
dynamic, then decides whether to accept or loop. No memory carries
across iterations beyond the current `## Draft`.

## State machine

```
empty ─► drafted ─(push self-critique)─► [dynamic] ─(pop)─► drafted_completed
                                                                 │
                                                  accepted ──► done
                                                  rejected ──► drafted (loop)
```

Four strategy instructions: `Initialize`, `Request critique`,
`Evaluate refinement`, `Finish`.

## Dynamic: `self-critique.md`

| | |
| --- | --- |
| Consumes | `## Draft` |
| Produces | `## Critique`, `## Refined` |
| Internal states | `empty` → `critiqued` → `done` |

## Demo `PROGRAM.md`

Write a concise JSDoc docstring (≤ 3 sentences) for `parseState` in
`src/memory.ts`.

## Run it

```bash
./new-instance.sh my-1a interpreters/2-iterative-refinement/1a-self-refine
instances/my-1a/run.sh
```

## Known behaviour

- Under self-critique, the LLM often *adds* material (examples,
  `@throws` annotations, edge-case discussion) rather than trimming.
  Strategies whose acceptance criterion includes size constraints will
  typically loop 3–5 times before converging. This is working as
  designed, not a bug — see the Phase-1 demo note at
  `docs/agent-workflows/phase-1-notes.md` §1a.
- No iteration cap (R10). Ctrl-C is safe; state persists in
  `instances/<name>/MEMORY.md` and re-running resumes from the next
  cycle.
