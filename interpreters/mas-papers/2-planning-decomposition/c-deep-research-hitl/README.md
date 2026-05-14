# c-deep-research-hitl

*Variant of [`c-deep-research`](../c-deep-research/) demonstrating
non-blocking human-in-the-loop. The strategy frame asks the user a
small number of clarifying questions up-front, gathers background
context while waiting for the answers, then refines the goal and
hands off to the same recursive `tackle.md` solver.*

## What's modeled

The Deep Research pattern is great at decomposing a question into
sub-questions and recursing — but it bites whenever the original
question is genuinely ambiguous, because the planner has to *guess*
the intended scope. This variant adds a clarification preamble:
before the recursion starts, the strategy frame writes 2–4 concrete
questions to `## Pending Questions`, lets the shell deliver them via
the user's channel (Telegram or stdin), and *keeps working on
background research* in the meantime. The user answers when they
can; the strategy splices the answers into the refined goal and
only then pushes `tackle.md`.

This exercises three properties of the shell that no other
interpreter in the catalogue currently exercises end-to-end:

1. **Non-blocking `## Pending Questions`** — the strategy adds
   questions without setting state to `waiting_for_user`. The shell
   sends them immediately and the cycle loop continues.
2. **Frame-aware answer routing** — the strategy never pushes
   children during the clarify loop, so it stays the active frame
   for many cycles, but the question-router would route answers
   back to it even if it didn't (see `src/question-router.ts`).
3. **Graceful fallback to blocking** — if the strategy exhausts
   useful background work before the answers arrive, it transitions
   to `waiting_for_user` to actually block, then resumes via
   `user_responded` once a reply lands.

## Three orchestrators, three context types

| Driver | When it's active | What it can see | What it produces |
| --- | --- | --- | --- |
| **Strategy** (`f000-plan-execute-clarify`) | Cycle 1 through the end of clarification (typically 3–8 cycles); then again at the very end | The user program, `## Answers` (filled in over time by the shell), `./scoped/background.md` (its own accumulating notes) | A refined goal pushed via `tackle.md`; on pop, the final `answer` returned via `## Return` |
| **Tackle** (`fNNN-tackle`) | Once per goal at every recursion level | Only `goal` handed in via push-args; on the composite path also the spliced `## Plan` and per-child `## Result` | A `result` (atomic case — single tool call done) or a synthesized `result` over its sub-tackles |
| **Plan** (`fNNN-plan`) | Once per composite goal | Only `goal` handed in via push-args | A `plan` (3–7 sub-goal bullets) |

`tackle.md` and `plan.md` are byte-equal to the originals in
`c-deep-research/`. The clarify preamble is the only new
machinery.

## What the clarify preamble does

The strategy frame's state machine, cycle by cycle:

```
empty
  └─ Initialize: identify 2-4 ambiguities, write ## Pending Questions,
     do one preliminary web_search, append summary to ./scoped/background.md
     → state: gathering

gathering | user_responded                 ┐
  ├─ All answers in + background sufficient → state: refining
  ├─ Background gap remaining → another web_search, surgical append → state: gathering
  └─ Background sufficient + answers missing → state: waiting_for_user
       (shell blocks; resumes as user_responded once reply lands)

refining
  └─ Synthesize refined goal from PROGRAM + ## Answers + ./scoped/background.md
     into ./scoped/refined_goal.md, push tackle.md → state: tackling

tackling_completed
  └─ Finish: read ## Result, ## Return answer → state: done (halt)
```

The strategy never pushes a child during `gathering` /
`user_responded`. That keeps the routing trivial and keeps the
clarify loop legible in the visualizer (one swimlane row, multiple
boxes in chronological order).

## Why this works without breaking the routing

In the broader case (an interpreter where any frame at any depth
might ask a question and then push children), the shell's
question-router maps each question id to the frame that asked it
and writes the answer back to that frame's MEMORY when it
arrives — see `src/question-router.ts`. This demo doesn't *need*
that machinery because the strategy stays active throughout
clarification, but it relies on the same shell behaviour: the
answer goes to the asking frame, period.

## Demo `PROGRAM.md`

"Recommend a TypeScript HTTP framework for a small SaaS API I'm
starting." Deliberately under-specified: many trade-offs collapse
to a single answer once the strategy knows team size, latency
budget, deployment target, and library-vs-build preference. Those
are the natural clarifying questions.

## Run it

```bash
./new-instance.sh interpreters/mas-papers/2-planning-decomposition/c-deep-research-hitl my-cdr-hitl
```

For the full HITL experience, configure Telegram on the instance
so questions arrive as push notifications and you can reply from
anywhere:

```bash
./setup-telegram.sh <BOT_TOKEN> instances/my-cdr-hitl
instances/my-cdr-hitl/run.sh
```

Stdin works too — the cycle prints `Q1 > ` and accepts your typed
reply asynchronously while the strategy keeps gathering. Telegram
is recommended because the LLM's cycle logs and your prompt won't
share one terminal.

## Notable trade-offs vs. `c-deep-research`

- **One extra cycle of overhead per run minimum.** The clarify
  preamble always runs at least one cycle even if the user
  pre-fills the questions or the goal turns out unambiguous.
  Acceptable cost for the HITL demonstration.
- **No clarification inside the recursion.** Only the root
  strategy asks questions. A more aggressive variant would let
  `tackle.md` ask clarifying questions mid-recursion (and rely on
  the question-router to route answers back to deep frames), but
  that's out of scope for this demo.
- **Background work is bounded.** The clarify loop caps itself at
  ~5 background cycles; beyond that it transitions to
  `waiting_for_user` rather than spinning indefinitely on
  preliminary research.

## Layout note

`INSTRUCTIONS.md` is a single-line marker pointing at the canonical
operator file `operators/plan-execute-clarify.md`. The strategy
body lives in the canonical operator. `tackle.md` and `plan.md` are
byte-equal copies from `c-deep-research/operators/`.
