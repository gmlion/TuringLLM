# Phase 1 — Implementation notes

Captured at the end of the agent-workflows-phase-1 spec. Findings that
Phase 2 (CoVe) and later phases can use to avoid the same pain.

## a self-refine

The live demo ran 17 cycles, **four** full critique/refine loops, and
halted at `done` on cycle 17. The `parseState` docstring PROGRAM asked for
a docstring of *at most three sentences*; the LLM repeatedly produced
elaborate JSDoc with usage examples, throws annotations, and multi-paragraph
descriptions. The strategy correctly rejected four times and looped,
eventually accepting a concise 3-sentence version on the 4th pass. Lesson
for later phases: an LLM's instinct under self-critique is to *add
material*, not *remove it*. If a strategy's acceptance criterion includes
size constraints, the strategy prose should explicitly remind the
"Evaluate refinement" step to privilege brevity over completeness, or the
loop wastes cycles hill-climbing toward elaboration.

## b evaluator-optimizer

The live demo ran just 4 cycles and halted at `done` — the evaluator
returned `pass` on the first attempt. This is the happy path: the LLM's
first attempt at the prompt-caching rewrite met all three acceptance
bullets. The fail→retry loop was not exercised in this run; it *is*
exercised by the scripted integration test. Finding: a "rewrite a
paragraph in plain English" task with a clear criterion is often solved
in one shot by a capable model. Demonstrating the loop mechanic end-to-end
requires either a harder task or adversarial constraints (e.g. "no
sentence longer than 8 words" on top of the existing three bullets).
Worth considering if a future phase wants a visibly iterative demo.

## c reflexion

The live demo ran 13 cycles and halted at `done` with **one** lesson
accumulated (L1: "Remove all non-alphanumeric characters (not just
spaces) before comparing"), one failed attempt, and one successful
second attempt. R11 called for **at least two** lessons before halting at
`done`. That requirement is still satisfied at the test-suite level by
`src/test/phase-1-reflexion.test.ts` (which scripts two forced failures
and asserts `lessonLines.length >= 2`), but it was *not* satisfied by
the live demo — a real gap between spec text and observable behaviour.
The palindrome demo's 11 hidden cases did not force two distinct failure
modes on Claude Haiku 4.5: the naive "strip spaces" attempt fails, the
canonical "strip all non-alphanumerics" attempt passes. The T3 code
reviewer flagged this risk ahead of time (see review M2); the live run
confirmed it. Options for Phase 2 or a follow-up tweak:

1. Make the hidden test harder — add Unicode palindromes (diacritics,
   combining characters) so a naive `[^a-zA-Z0-9]` regex fails, forcing
   a second lesson.
2. Pick a different demo PROGRAM where genuine multi-failure learning is
   easier to elicit (e.g. a non-trivial maze or a constraint-solving
   task whose first plausible solution usually misses a subtle case).
3. Relax R11 from "≥ 2 lessons in the live demo" to "≥ 2 lessons in the
   scripted test + ≥ 1 in the live demo", acknowledging that the
   strength of modern LLMs on canonical problems is at odds with
   deterministic multi-failure demos.

The Reflexion *pattern* executed correctly end-to-end: evaluate failed,
reflect produced a useful lesson, the next attempt applied the lesson,
evaluate passed. Only the quantitative gate differs.

## Cross-cutting

1. **Shell bug surfaced and fixed (commit bf27544):** the
   `claude-code` provider's quota-detection regex `/529/` matched `529`
   as a substring inside `"cache_read_input_tokens":97595` in the JSON
   result blob. Every cycle that returned a token count containing
   `529` was misclassified as a quota error, triggering a 60s back-off
   and a retry. Without the fix, no Phase-1 demo could progress past
   the second cycle. The fix uses `\b529\b` and is covered by
   `src/test/quota-detection.test.ts`. Lesson for Phase 2+: any regex
   that matches a short literal digit string in an LLM response blob
   is a time bomb — require word boundaries or parse the JSON.
2. **Evaluator–Optimizer malformed-verdict path had a `user_responded`
   gap** that the T2 code review caught before the live run. The design
   prescribes "treat malformed as fail, append a non-blocking Pending
   Questions item"; the tasks.md draft mistakenly said "set state to
   `waiting_for_user`", which would have live-stalled because the
   strategy has no `user_responded` handler. Fixed in commit 1c9dd0a.
   Lesson: when writing tasks, cross-check every `waiting_for_user`
   transition against the existence of a `user_responded` handler in
   the same strategy.
3. **`new-instance.sh` copies every `*.md` file** in the interpreter
   directory, which intentionally overwrites the default template
   `PROGRAM.md`. This is correct but worth documenting explicitly in
   CLAUDE.md if a future interpreter wants *not* to ship a PROGRAM.
4. **`cd` inside Bash tool calls persists across invocations** in this
   harness. A stray `cd instances/...` once caused subsequent relative
   paths to resolve from the wrong base. Not an issue for anyone
   scripting paths absolutely.
5. **Windows line-ending warnings (LF → CRLF) fire on every commit.**
   Cosmetic; Node reads identical bytes. Left unaddressed to avoid
   `.gitattributes` churn.
6. **`evaluate.md` byte-equality test (R19)** is passing. The canonical
   copy lives in `b-evaluator-optimizer/operators/` and `c-reflexion`'s copy is
   enforced identical via `src/test/phase-operators-identity.test.ts`.
   Phase 2's CoVe will reuse `evaluate.md` a third time — consider
   promoting to a shared-operators convention in `new-instance.sh` at
   that point (see design.md OQ4).
