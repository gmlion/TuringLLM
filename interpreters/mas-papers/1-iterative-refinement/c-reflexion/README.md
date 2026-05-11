# c — Reflexion

*Shinn et al., NeurIPS 2023 — "Reflexion: Language Agents with
Verbal Reinforcement Learning". See
`docs/agent-workflows/patterns.md` §Group 1.*

## What's modeled

Evaluator–Optimizer (variant b) plus an explicit **reflection
step** after every failed attempt. The reflection distils each
failure into a short verbal rule ("avoid X", "always do Y"), and
those rules accumulate. Each retry's producer reads the full list
of accumulated lessons before drafting, so the loop has *episodic
memory* rather than just feedback-passing. The paper frames this
as RL where the policy is updated through prose rather than
gradients.

## Three orchestrators, three contexts

| Driver | When it's active | What it can see | What it produces |
| --- | --- | --- | --- |
| **Strategy** (`f000-strategy`) | Initial attempt, between iterations, after each evaluator/reflect pop | Its own MEMORY, the current attempt at `./scoped/attempt.md`, the criterion at `./scoped/criterion.md`, the **accumulating** lessons at `./scoped/lessons.md`, the user program | A new push (request a verdict, or request a reflection on a failed attempt), or a state of `done` |
| **Evaluator** (`fNNN-evaluate`) | One judging pass after each attempt | Only the attempt and criterion handed in via push-args | A `verdict` (`pass`/`fail`) and `feedback`, spliced back to the strategy on pop |
| **Reflector** (`fNNN-reflect`) | One distillation pass after each failed verdict | Only the failed attempt + verdict + feedback handed in via push-args; **no view of prior lessons or prior attempts** | A single `lesson` directive, spliced back to the strategy on pop |

A new evaluator or reflector context is created on every push and
destroyed on the matching pop. Stack depth is at most 2:
`strategy → {evaluator | reflector}`. The two child contexts
never see each other; the strategy is the only thing that
threads them. Continuity across iterations lives entirely on
disk in `./scoped/`.

## How an iteration works

A pass→fail cycle is up to seven cycles:

1. **(strategy)** *Attempt.* Read the criterion and the current
   list of lessons; produce an attempt that respects every
   lesson; write it to `./scoped/attempt.md`.
2. **(strategy)** *Request evaluation.* Push `evaluate.md` with
   the attempt and criterion as push-args.
3. **(evaluator)** *Judge.* Returns `verdict` + `feedback` on pop.
4. **(strategy)** *Route on verdict.* If `pass` → `done`. If
   `fail` (or malformed) → state `failed_attempt`, retain the
   verdict and feedback so the reflector can read them.
5. **(strategy)** *Reflect.* Push `reflect.md` with the failed
   attempt, the verdict, and the feedback.
6. **(reflector)** *Distil lesson.* Returns one `lesson`
   directive on pop.
7. **(strategy)** *Accumulate lesson.* Append the new lesson
   surgically to `./scoped/lessons.md` as
   `- L<N>: <lesson text>`, drop the `## Verdict` / `## Feedback`
   / `## Lesson` markers, set state to `attempting`, loop. The
   next iteration's *Attempt* step will read the updated lessons
   list before drafting.

A pass cycle stops at step 4.

## Where things live

- `./scoped/attempt.md` — current attempt. Wholesale rewritten
  each iteration.
- `./scoped/criterion.md` — set once at startup, never rewritten.
- `./scoped/lessons.md` — the accumulating verbal-RL "policy".
  **Surgical append only** (`echo "- L<N>: …" >> …`). Wholesale
  rewriting it would silently drop accumulated rules.
- `## Verdict` / `## Feedback` / `## Lesson` (in strategy MEMORY)
  — markers from the most recent child, dropped after each
  iteration.

There are no workspace files in this interpreter — the artefact
*is* the attempt. (The palindrome demo writes a hidden test
harness to `workspace/` once at startup, but that's setup, not
output.)

## Dynamics in this interpreter

| File | Receives (push-args) | Returns | Stack depth from caller |
| --- | --- | --- | --- |
| `operators/evaluate.md` | `attempt`, `criterion` | `verdict`, `feedback` | leaf (byte-equal copy of the shared evaluator) |
| `operators/reflect.md` | `attempt`, `verdict`, `feedback` | `lesson` | leaf |

## Demo `PROGRAM.md`

Write `is_palindrome(s: str) -> bool` in Python — case-insensitive,
ignoring non-alphanumerics — graded by a hidden test harness
(`workspace/tests/test_palindrome.py`). The harness ships as a
fenced Python block inside `test_palindrome.md` at the interpreter
root; the strategy's `Initialize` instruction extracts it on the
first cycle.

## Run it

```bash
./new-instance.sh interpreters/mas-papers/1-iterative-refinement/c-reflexion my-c
instances/my-c/run.sh
```

## Notable behaviour

- **Lesson accumulation in practice.** The integration test
  exercises a path where ≥ 2 lessons accumulate before halt. The
  live demo with Claude Haiku 4.5 typically accumulates only 1
  lesson because the palindrome task is too canonical — the first
  naive attempt fails once (strips spaces only), the second
  applies the lesson and passes. The Reflexion *pattern* runs
  correctly; the demo just doesn't need many iterations.
- **What carries across iterations** is `./scoped/lessons.md` and
  `./scoped/criterion.md`. Every other piece of working state is
  cleared.
- **No iteration cap.** Convergence is the evaluator's
  judgement.

## Layout note

`INSTRUCTIONS.md` is a single-line marker pointing at the canonical operator file `operators/reflexion.md`. The strategy body lives in the canonical operator. This pattern lets the same operator be invoked standalone (via `.root-operator` bootstrap) AND as a library operator inside meta-frameworks like `aflow-lite`.

For this interpreter the canonical operator is `operators/reflexion.md`.
