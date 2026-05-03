# b — Evaluator–Optimizer

*Anthropic, "Building Effective Agents", 2024. See
`docs/agent-workflows/patterns.md` §Group 1.*

## What's modeled

A producer/judge split. One role generates an attempt; a separate
role checks the attempt against an explicit, written acceptance
criterion and issues a pass/fail verdict plus structured feedback.
On fail, the producer tries again using that feedback. The
critical move (relative to self-refine, where producer and critic
collapse into one cycle) is that the **judge has its own context
and is given the criterion, not just the attempt**. This makes
the gate explicit and inspectable rather than implicit in the
producer's self-judgement.

## Two orchestrators, two contexts

| Driver | When it's active | What it can see | What it produces |
| --- | --- | --- | --- |
| **Strategy** (`f000-strategy`) | Initial attempt, between iterations, final accept | Its own MEMORY, the current attempt at `./scoped/attempt.md`, the criterion at `./scoped/criterion.md`, the user program at `../../PROGRAM.md` | A new push (request a verdict on the current attempt), or a state of `done` |
| **Evaluator** (`fNNN-evaluate`) | One judging pass, then it's gone | Only the attempt and criterion handed in via push-args; nothing about the strategy's history, prior verdicts, or how many iterations have passed | A `verdict` (literal `pass` or `fail`) and `feedback` text, spliced back to the strategy on pop |

A new evaluator context is created on every push and destroyed on
the matching pop. Stack depth is at most 2: `strategy →
evaluator`. Continuity across iterations lives only on disk:
`./scoped/attempt.md` (overwritten with each new attempt) and
`./scoped/criterion.md` (set once at startup, never rewritten).

## How an iteration works

A single iteration is three cycles in the simple case:

1. **(strategy)** *Request evaluation.* The strategy reads
   `./scoped/attempt.md` and `./scoped/criterion.md` and writes a
   `## Push` to the evaluator dynamic, handing both in via
   push-args.
2. **(evaluator)** *Judge.* The evaluator reads attempt and
   criterion, decides pass or fail, and writes both the verdict
   and the feedback into a `## Return` block paired with `state:
   done`. The shell pops; the strategy's MEMORY now has
   `## Verdict` and `## Feedback` spliced in.
3. **(strategy)** *Handle verdict.*
   - If `## Verdict` is literally `pass` → state `done`.
   - Otherwise → use `## Feedback` to rewrite
     `./scoped/attempt.md`, drop the `## Verdict`/`## Feedback`
     markers, set state back to `attempted`, loop.

## Where things live

- `./scoped/attempt.md` — the current attempt. Wholesale rewritten
  each iteration with the producer's response to feedback.
- `./scoped/criterion.md` — the acceptance criterion. Written
  once from PROGRAM.md and never touched again.
- `## Verdict` / `## Feedback` (in strategy MEMORY) — markers from
  the most recent evaluator, dropped before the next iteration.

There are no workspace files in this interpreter — the artefact
*is* the attempt.

## Dynamics in this interpreter

| File | Receives (push-args) | Returns | Stack depth from caller |
| --- | --- | --- | --- |
| `operators/evaluate.md` | `attempt`, `criterion` | `verdict`, `feedback` | leaf |

`operators/evaluate.md` is the **canonical** copy. Other consumers
in the repo (c-reflexion, a-metagpt, b-chatdev) ship a byte-equal
copy, pinned by `src/test/phase-dynamics-identity.test.ts`.

## Demo `PROGRAM.md`

Rewrite a technical paragraph about prompt caching in plain,
non-expert English. The acceptance criterion has three bullets:
≤ 5 sentences, no listed jargon terms, preserves three factual
claims.

## Run it

```bash
./new-instance.sh my-b interpreters/1-iterative-refinement/b-evaluator-optimizer
instances/my-b/run.sh
```

## Notable behaviour

- **Often passes on the first try.** Capable models can pass a
  "rewrite in plain English" criterion immediately; the bundled
  demo typically halts in around 4 cycles. Pick harsher criteria
  — or a harder task — if you want to visibly exercise the
  fail→retry path.
- **Malformed verdict handling.** If the evaluator returns
  anything other than literal `pass` or `fail`, the strategy
  treats it as `fail` (conservative) and appends a non-blocking
  `## Pending Questions` item. It deliberately does *not*
  transition to `waiting_for_user` — that would stall the loop
  because this strategy has no `user_responded` handler.
- **No iteration cap.** Convergence is the evaluator's
  judgement.

## Layout note

`INSTRUCTIONS.md` is a single-line marker pointing at the canonical operator file `operators/refine.md`. The strategy body lives in the canonical operator. This pattern lets the same operator be invoked standalone (via `.root-operator` bootstrap) AND as a library operator inside meta-frameworks like `aflow-lite`.

For this interpreter the canonical operator is `operators/refine.md`.
