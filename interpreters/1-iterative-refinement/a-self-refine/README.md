# a — Self-Refine

*Madaan et al., NeurIPS 2023 — "Self-Refine: Iterative Refinement
with Self-Feedback". See
`docs/agent-workflows/patterns.md` §Group 1.*

## What's modeled

The simplest improvement loop: a single role drafts something, then
criticizes its own draft, then revises, then decides whether the
revision is good enough — looping until it is. The same underlying
model plays both producer and critic; the trick is that the critic
runs in a fresh execution context so it doesn't get to read the
producer's working notes or the running iteration count. The
"self" in self-critique is *honest* in the sense that the critic
isn't a continuation of the producer's train of thought.

## Two orchestrators, two contexts

| Driver | When it's active | What it can see | What it produces |
| --- | --- | --- | --- |
| **Strategy** (`f000-strategy`) | Initial draft, between iterations, final accept | Its own MEMORY (state, last-iteration markers `## Critique` and `## Refined`), the current draft on disk at `./scoped/draft.md`, the user program at `../../PROGRAM.md` | A new push (request a critique on the current draft), or a state of `done` |
| **Critic** (`fNNN-self-critique`) | One pass through critique-then-refine, then it's gone | Only the draft handed in via push-args; nothing about the strategy's iteration count, the user program, or any previous critic's output | A new draft (`refined`) and a critique of the original (`critique`), spliced back to the strategy on pop |

A new critic context is created on every push and destroyed on the
matching pop. **Nothing is preserved between two critic
contexts** — each iteration's critic is a clean slate. Stack depth
is at most 2: `strategy → critic`. Continuity across iterations
lives in two places only: the file `./scoped/draft.md` (which the
strategy overwrites with the accepted refinement) and the
strategy's own state machine.

## How an iteration works

A single iteration is four cycles:

1. **(strategy)** *Request critique.* The strategy reads the
   current `./scoped/draft.md` and writes a `## Push` to the
   self-critique dynamic, handing the draft body in via the
   `draft` push-arg.
2. **(critic, turn 1)** *Critique.* The critic reads the draft,
   writes a free-form critique into its own MEMORY as
   `## CritiqueScratch`, and parks at state `critiqued`.
3. **(critic, turn 2)** *Refine.* The critic reads its own scratch
   critique, produces an improved draft, and writes both the
   critique and the refined draft into a `## Return` block paired
   with `state: done`. The shell pops; the strategy's MEMORY now
   has `## Critique` and `## Refined` spliced in.
4. **(strategy)** *Evaluate refinement.* The strategy reads
   `## Refined` and decides whether it adequately addresses the
   user program. If yes → state `done`. If no → overwrite
   `./scoped/draft.md` with the refined version, drop the
   `## Critique`/`## Refined` markers, set state back to `drafted`,
   loop.

The critic's two cycles run in the same context (the critic frame
persists across them). Only when the critic's state reaches `done`
does the shell pop back to the strategy.

## Where things live

- `./scoped/draft.md` — the current draft. Wholesale rewritten
  each iteration with the accepted refinement.
- `## Critique` / `## Refined` (in strategy MEMORY) — markers from
  the most recent critic, dropped before the next iteration.

There are no workspace files in this interpreter — the artefact
*is* the draft.

## Dynamics in this interpreter

| File | Receives (push-args) | Returns | Stack depth from caller |
| --- | --- | --- | --- |
| `dynamics/self-critique.md` | `draft` | `critique`, `refined` | leaf |

## Demo `PROGRAM.md`

Write a concise JSDoc docstring (≤ 3 sentences) for `parseState`
in `src/memory.ts`.

## Run it

```bash
./new-instance.sh my-a interpreters/1-iterative-refinement/a-self-refine
instances/my-a/run.sh
```

## Notable behaviour

- **Self-critique tends to grow, not shrink.** The model usually
  *adds* material (examples, edge cases, qualifications) rather
  than trimming. Strategies whose acceptance criterion includes
  size constraints typically loop 3–5 times before converging.
  This is by design — the critic is encouraged to be thorough.
- **No iteration cap.** Convergence is the model's judgement.
  Ctrl-C is safe; state persists in `./scoped/draft.md` and the
  strategy's MEMORY, so re-running picks up at the next cycle.
