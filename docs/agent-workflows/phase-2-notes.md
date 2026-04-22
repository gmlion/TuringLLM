# Phase 2 — Implementation notes

Captured at the end of the agent-workflows-phase-2 spec. Findings that future phases can use to avoid the same pain.

## Push-args parser

The YAML-ish parser (`parsePushArgs` in `src/memory.ts`) handles the
two cases documented in the design — single-line `key: value` and
`key: |` block scalars with 2-space indentation. No surprises during
implementation or live run:

- The parser is permissive: malformed lines (missing `: `, non-identifier
  key) are silently skipped. Missing values then surface downstream as
  `unresolved-placeholder` failures in `applyPush`, which is the right
  place for them — the caller sees a structured failure rather than
  silent data loss.
- Block scalars are parsed by collecting lines that start with `"  "`
  (two spaces) or that are empty, then trimming trailing empty lines.
  This matches standard YAML 1.2 literal-block (`|`) semantics closely
  enough that readers who know YAML aren't surprised.
- The parser deliberately does NOT support: nested structures, flow
  style (`{a: 1, b: 2}`), quoted strings, comments, multiple indent
  widths. Adding any of those would cost clarity; none are needed by
  any current consumer.
- Trailing empty lines inside a block scalar are trimmed but internal
  blank lines are preserved. This matches the common case of "I just
  want my multi-line text as-is" without special escape syntax.

## Retrofit of a/b/c

The refactor went through cleanly. Three tasks, three commits (T4, T5,
T6). Observations:

- **Test updates were the bulk of the work.** The dynamic-file changes
  are small (swap MEMORY section references for `{{placeholders}}` in
  the prose); the strategy Action text edits are mostly one line. The
  tests had to be updated at every push site to synthesise a
  `## Push-Args` section alongside `## Push`, plus new assertions
  confirming substitution happened (`Attempt:` present, `{{attempt}}`
  absent). c-reflexion's test file grew a small `extractSection`
  helper to programmatically build the reflect push-args from an
  existing MEMORY string, which was cleaner than hand-constructing
  the multi-line literal.

- **The byte-equal invariant between b's and c's `evaluate.md` held
  through the refactor.** T5 intentionally left the identity test
  failing at its boundary (b refactored, c not yet synced), and T6
  restored it by `cp`ing b's refactored evaluate.md over c's copy.
  This is the smallest clean split of that work.

- **Strategy callsites grew meaningfully.** Where an old Request-X
  instruction said `Write \`## Push\` with the value X on its own
  line`, the new version specifies a full multi-line block the LLM
  must emit (`## Push\n<path>\n## Push-Args\nkey: |\n  <content>`).
  That's four new lines of text per push site in INSTRUCTIONS.md. The
  LLM follows it reliably in the demo — no observed cases where it
  forgot the `## Push-Args` section or got the indentation wrong.

- **Output contracts are unchanged**, as the design required. Every
  refactored dynamic still writes `## Critique`/`## Refined`/
  `## Verdict`/`## Feedback`/`## Lesson` to MEMORY with the same
  shape the callers were already reading. No caller-side changes
  beyond the new `## Push-Args` emission.

## d-cove live demo

- **Run**: `instances/p2-cove/` with default provider (claude-code,
  Haiku). Halted cleanly at `## State: done` after **9 cycles**, exit
  code 0.

- **Depth-2 invariant (R20, R26) satisfied**: `history/0004-*` and
  `history/0007-*` each contain `.call-stack.json` with length 2 —
  evidence that `verify.md` successfully pushed `answer-independently.md`
  at depth 2 and the shell saved both frames during that cycle.

- **Final `## Revised` content**: matches the unique solution exactly.
  Alice=knave, Bob=knave, Carol=knight, Dan=knight. The revised answer
  correctly reconstructs both the Case 1 contradiction (assuming
  Alice=knight leads to Alice=knave, contradiction) and the Case 2
  consistent assignment.

- **Surprising behaviour — verify.md short-circuited the ask loop.**
  verify.md's `Pose questions` instruction generated **eight**
  verification bullets (V1 through V8, covering both case branches and
  each individual statement-to-role consistency check). The `Ask next`
  / `Record answer` loop then ran only **twice** (V1 and V2 were
  answered independently at depth 2), after which the Haiku-powered
  verify dynamic transitioned directly to `revising` and wrote
  `## Revised` — despite V3–V8 still being marked `pending`. The
  final cycle's `## Last Action` even claimed "verifications section
  was empty" (it wasn't — it had six pending bullets).

  This is a model-judgment deviation from the strategy text
  ("If any bullet ends in `pending`, set state to asking; otherwise
  revising"). The model interpreted the pattern's intent ("verify
  enough to convince yourself") rather than the literal state rule.
  Because the draft was already correct, the shortcut produced the
  right final answer — but the pattern's full structural guarantee
  (every claim verified in isolation) was not exercised end-to-end
  in this run. It was exercised at the scripted test level (see
  `src/test/phase-2-cove.test.ts`).

  Options for future tightening, if we want the live demo to cover
  all V_i:
  1. Add a literal check to `Ask next`'s condition (e.g. "count the
     `pending` bullets; if > 0 you MUST push"), or
  2. Move the terminal transition to a shell-level check rather than
     leaving it to the LLM's judgment, or
  3. Accept the deviation as pattern-preserving-in-spirit and document
     it (this option, for now — the pattern worked, the test suite
     covers the unshortened path).

- **Informal isolation (R18) held in practice.** answer-independently's
  instruction text names no caller MEMORY section. Spot-checked the
  two depth-2 cycles' log output — the model answered each question
  on its own merits without referencing the draft's reasoning chain.

## Cross-cutting

1. **`## Push-Args` parsing performs well on multi-line block
   scalars.** The knights-and-knaves demo pushes a draft of ~20 lines
   as `{{draft}}` without any parser anomalies. Round-trip
   (parse → substitute → read from LLM → LLM follows) was smooth
   across all retrofit interpreters and d-cove.

2. **`unresolved-placeholder` failure path was not exercised live.**
   All strategy callsites populate the args they declare, so no
   runtime unresolved-placeholder ever occurred. The shell-level
   mechanism (R3) is covered by `src/test/push-args.test.ts`'s two
   unresolved-placeholder tests. Worth watching for in future phases
   when the callsite → dynamic contract is written by less experienced
   authors.

3. **Model choice of question count (N) in verify.md is
   unpredictable.** The task's instruction said "N >= 2 atomic
   claims", and the demo emitted N=8 — fine as a ceiling, but the
   subsequent `Ask next`/`Record answer` loop only completed 2 before
   short-circuiting. If the pattern's value depends on N being
   bounded AND all answered, the strategy needs to be more prescriptive
   about the stop condition.

4. **No `.env` needed**: the demo ran cleanly against the default
   `claude-code` provider (Haiku) with no per-instance configuration.

5. **Test suite after Phase 2**: 110 tests (up from 82 at Phase 1
   end). Breakdown:
   - Phase-1 retained: 82 (a/b/c integration, stack integration,
     memory parsers, quota detection, provider specifics,
     dynamics identity)
   - Push-args unit: +10 (memory.test.ts)
   - Push-args integration + substitutePlaceholders: +11
     (push-args.test.ts)
   - Phase-2 d-cove scripted integration: +7 (phase-2-cove.test.ts)
