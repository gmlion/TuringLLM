# d — Chain-of-Verification (CoVe)

*Dhuliawala et al., Meta, 2023 — "Chain-of-Verification Reduces
Hallucination in Large Language Models" (arXiv:2309.11495). See
`docs/agent-workflows/patterns.md` §Group 1.*

## What's modeled

Decomposed self-checking. The drafter writes a candidate answer.
A separate verifier breaks that answer into N atomic claims and,
for each one, asks an *independent* third party to answer the same
sub-question from scratch — without ever showing them the draft.
Then the verifier reconciles each independent answer with the
original claim and emits a corrected draft. The pattern's value
is the structural separation: the claim-checker doesn't know what
the drafter wrote, so it can't anchor on the draft's mistakes.

This interpreter is **one-shot**: there is no acceptance loop. If
the revised answer is still wrong, the run halts with that
output. CoVe's value is the structural separation, not iteration.

## Three orchestrators, three contexts

| Driver | When it's active | What it can see | What it produces |
| --- | --- | --- | --- |
| **Strategy** (`f000-strategy`) | Initial draft, after the verifier pops | Its own MEMORY, the draft at `./scoped/draft.md`, the user program | A push of `verify.md` with the draft, then `done` |
| **Verifier** (`fNNN-verify`) | One full verification run | The draft handed in via push-args, its own scoped file `./scoped/verifications.md` (the per-claim status sheet) | One push of `answer-independently.md` per pending claim; finally a `revised` draft, spliced back to the strategy on pop |
| **Independent answerer** (`fNNN-answer-independently`) | One question, then it's gone | **Only** the single question handed in via push-args, plus the user program for shared premises | A single `answer`, spliced back to the verifier on pop |

This is the first interpreter that exercises **stack depth 2**.
Mid-verification, `.call-stack.json` contains three frames:
strategy, verifier, and the answerer for the question currently
being checked. Each `answer-independently.md` push is a fresh
context that knows nothing about prior questions, prior answers,
the draft, or even how many other claims exist. That structural
ignorance is the whole point.

## How a run works

A complete run is `1 + 2 + 2N + 1` cycles, where N is the number
of claims the verifier extracts:

1. **(strategy)** *Initialize.* Read PROGRAM.md, write an initial
   draft to `./scoped/draft.md`, set state to `drafted`.
2. **(strategy)** *Request verification.* Push `verify.md` with
   the draft as a push-arg.
3. **(verifier, cycle 1)** *Pose questions.* Decompose the draft
   into atomic verification questions; write them to
   `./scoped/verifications.md` as bullets like
   `- V1: <question>; pending`. Each question must be
   self-contained (the answerer will only see the question, not
   the draft). State → `asking`.
4. **(verifier, repeated)** *Ask next.* For the first bullet still
   marked `pending`, push `answer-independently.md` with that
   question as a push-arg.
5. **(answerer)** *Answer in isolation.* Answer the one question
   using only PROGRAM.md and world knowledge. Return on pop.
6. **(verifier, repeated)** *Record answer.* Surgically update
   the matching bullet in `./scoped/verifications.md` from
   `pending` to `answered: <answer text>`. If pending bullets
   remain, set state back to `asking` (loop to step 4). If all
   bullets are answered, synthesize a corrected draft by
   comparing each verified claim against the original, and emit
   it as `revised` in `## Return` paired with `state: done`.
7. **(strategy)** *Finalize.* The verifier popped; `## Revised`
   is in MEMORY. State → `done`.

## What enforces independence

Two things, both prompting-level:

- The push to `answer-independently.md` only includes the
  `question` push-arg. The dynamic's instruction text references
  no caller MEMORY section, so a compliant model has no instructed
  reason to read the draft.
- The dynamic's instruction explicitly tells the answerer they
  have "no draft, no prior reasoning, and no access to any other
  context from the caller."

A misbehaving model could still `cat ../f<NNN>-verify/MEMORY.md`
or read `./scoped/draft.md` from the strategy frame; we accept
this trade-off rather than build shell-level memory isolation.
The instruction-following gradient is doing the work.

## Where things live

- `./scoped/draft.md` (strategy frame) — initial draft. Single
  blob, wholesale-write OK.
- `./scoped/verifications.md` (verifier frame) — the per-claim
  status sheet. **Surgical `sed -i` updates only** — wholesale
  rewriting it would discard prior answered claims and break the
  verification loop.

## Dynamics in this interpreter

| File | Receives (push-args) | Returns | Stack depth from caller |
| --- | --- | --- | --- |
| `operators/verify.md` | `draft` | `revised` | 2 (pushes `answer-independently.md` per claim) |
| `operators/answer-independently.md` | `question` | `answer` | leaf |

## Demo `PROGRAM.md`

A twenty-person knights-and-knaves puzzle (P1 through P20) with
a unique solution. The puzzle composes a three-person anchor
forced by a "different types" + cross-assertion triple, plus a
17-person chain of single-person assertions in deterministic
alternating blocks. N = 20 claims for the verifier to decompose,
giving the depth-2 verification fan-out a realistic workout.

An earlier four-person variant of the puzzle was too easy —
Haiku's first draft was already correct and the revise step had
nothing to fix. The twenty-person version increases the chance
that at least one claim in the first draft is wrong, so CoVe can
demonstrate *value* (correction), not just *mechanics* (depth-2
stack reach).

## Run it

```bash
./new-instance.sh my-d interpreters/1-iterative-refinement/d-cove
instances/my-d/run.sh
```

## Notable behaviour

- **First interpreter at stack depth 2.** Mid-verification you
  can `cat .call-stack.json` to see three frames present
  simultaneously.
- **One-shot — no retry.** If the revised answer is still wrong,
  the run halts with that output. A future hybrid (CoVe +
  Evaluator) would add an acceptance loop.
- **No iteration cap** on the inner question loop — the verifier
  keeps asking until every bullet is `answered`.
