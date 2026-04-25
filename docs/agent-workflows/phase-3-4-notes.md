# Phase 3 + Phase 4 — notes

Captured at the end of the
`docs/specs/2026-04-24-implement-phase-3-and-4/` spec. Findings that
later phases can use to avoid the same pain.

## Live-demo validation deferred to the user

T12 Steps 2 and 3 prescribe live demos against the default provider
(claude-code, Haiku) for each new leaf. These runs invoke the LLM as a
real subprocess, take real time, and incur real cost; this T12 commit
was produced under auto-mode where executing them is out of policy.

Live-demo validation is **deferred to the user**. The exact commands
to run are:

    # Phase 3 — three leaves under interpreters/2-planning-decomposition/
    ./new-instance.sh demo-phase-3-a-plan-execute  interpreters/2-planning-decomposition/a-plan-execute
    instances/demo-phase-3-a-plan-execute/run.sh

    ./new-instance.sh demo-phase-3-b-orchestrator-workers  interpreters/2-planning-decomposition/b-orchestrator-workers
    instances/demo-phase-3-b-orchestrator-workers/run.sh

    ./new-instance.sh demo-phase-3-c-deep-research  interpreters/2-planning-decomposition/c-deep-research
    instances/demo-phase-3-c-deep-research/run.sh

    # Phase 4 — two leaves under interpreters/5-fixed-sop-teams/
    ./new-instance.sh demo-phase-4-a-metagpt  interpreters/5-fixed-sop-teams/a-metagpt
    instances/demo-phase-4-a-metagpt/run.sh

    ./new-instance.sh demo-phase-4-b-chatdev  interpreters/5-fixed-sop-teams/b-chatdev
    instances/demo-phase-4-b-chatdev/run.sh

Acceptance per leaf:
- Halts at `## State\ndone` in
  `instances/<name>/frames/f000-strategy/MEMORY.md` (R16).
- Phase 3 leaves: `a-plan-execute` log shows at least one replan
  triggered by a step failure; `c-deep-research` log shows at least
  one recursive re-push of `plan.md` from inside `execute-step.md`.
- Phase 4 leaves: final strategy MEMORY contains the four typed
  hand-off sections (`## PRD`, `## Design`, `## Tasks`,
  `## Code Review`) for `a-metagpt` and the equivalent sections for
  `b-chatdev` (R33), and `workspace/` contains a runnable `wc-plus`
  CLI (R34).

R16, R32, and R34 therefore require manual confirmation against the
above commands before this spec can be considered live-validated. The
scripted integration tests (`src/test/phase-3-{plan-execute,orchestrator-workers,deep-research}.test.ts`,
`src/test/phase-4-{metagpt,chatdev,shell-features}.test.ts`) and the
four-way evaluate-identity test (`src/test/phase-dynamics-identity.test.ts`)
cover the structural guarantees on every `npm test` run; what the live
demos add is end-to-end LLM-driven traversal of the state machine
without scripting.

## Plan dynamics-table sync (R50) — drifts found

Audit of the "Reusable dynamics library" table in
`docs/agent-workflows/requirements.md` against the dynamics actually
shipped by this spec uncovered three drifts. They are corrected in
the same commit as this notes file.

1. **`role-<name>.md` stack depth.** Table previously listed `1`. The
   PM/Architect/Engineer roles do run at depth 1, but **`role-qa.md`
   pushes `dynamics/evaluate.md` at depth 2** (the QA role's verdict
   is produced by the shared evaluator). The depth column now reads
   `1 (qa: 2)` to capture this.

2. **`dialogue.md` MEMORY-out section name.** Table previously named
   `## Conclusion`. The actual return key is `dialogue_output`, which
   splices into the caller's MEMORY as **`## Dialogue Output`** (per
   the shell's first-character-uppercase splicing rule). The table
   has been updated.

3. **`dialogue.md` stack depth.** Table previously listed `1`. When
   `{{acceptance}}` is `true`, dialogue.md pushes `evaluate.md` to
   judge consensus, taking the stack to depth 2. The ChatDev demo
   exercises this on the design and testing phases. The depth column
   now reads `1 (acceptance=true: 2)`.

The Phase 3 rows (`plan.md`, `execute-step.md`, `synthesize.md`) all
match the actual contracts; Phase 3 dynamics consume push-args rather
than caller-MEMORY sections, but the table's existing convention
already documents push-args as `## CapitalizedKey` (cf. `verify.md` /
`answer-independently.md` rows from Phase 2), so no change there.

## Spliced-section naming subtlety (`## Prd` vs. `## PRD`)

The shell's `spliceReturns` (in `src/memory.ts`) uppercases only the
first character of a return key — so `prd: ...` from a child becomes
`## Prd` in the caller, *not* `## PRD`. The MetaGPT strategy
(`interpreters/5-fixed-sop-teams/a-metagpt/INSTRUCTIONS.md`) is
written using the human spelling `## PRD`, both in the typed-hand-
off contract block and in the dispatch instructions (e.g. `## PRD is
present`).

This works in practice because:

- The strategy's `Condition:` clauses are interpreted by the LLM
  using fuzzy NL matching (R40), not literal regex. `## PRD is
  present` matches `## Prd` in MEMORY without trouble.
- Acronym-style hand-off keys (`## PRD`, `## QA`) are visually
  preferred in human-authored prose; mechanical
  `## CapitalizedFirstLetter` would yield awkward `## Prd`-shaped
  sections.

The deviation is noted here so future authors are not surprised when
they grep MEMORY for `## PRD` and find `## Prd` in the on-disk file.
Two ways to tighten in a later phase if literal matches are ever
required:

1. Use lowercase-acronym return keys (`pRD: …` would yield `## PRD`,
   but breaks JSON/YAML readability).
2. Extend `spliceReturns` to honour an optional caller-side rename
   table for return keys (`prd → PRD`, `qa → QA`). Out of scope for
   this spec.

## Phase 3a — three leaves, byte-equal `INSTRUCTIONS.md` and `dynamics/`

The collapse rationale ("four named patterns, one implementation")
held up cleanly across the three leaves. The byte-equal invariant is
asserted by `src/test/phase-3-dynamics-identity.test.ts` and held
without any ad-hoc fixup once T6 lifted the canonical files into
`a-plan-execute/`. No accidental drift between the three trees during
this spec.

The `b-orchestrator-workers` demo PROGRAM ships **five inputs**
(`workspace/inputs/input-{1..5}.md`), and the strategy's planner is
expected to emit exactly five `S<N>` steps — one per note. The
exactly-5-steps invariant is checked structurally by
`src/test/phase-3-orchestrator-workers.test.ts` via the synthesised
plan, not by running the LLM. Live-demo confirmation that the LLM
actually emits exactly five (and not four or six) is left to the
manual run.

The `c-deep-research` recursion demo (`execute-step.md` re-pushing
`plan.md`) is asserted at the integration-test level by inducing the
recursion programmatically. The live-demo signature (a `## Push:
dynamics/plan.md` block written from inside an `execute-step.md`
frame, captured in `history/`) requires the manual run.

## Phase 4 — shared `PROGRAM.md` between MetaGPT and ChatDev

R22 mandates that `b-chatdev/PROGRAM.md` is a byte-equal copy of
`a-metagpt/PROGRAM.md` so that the two outputs are directly
comparable. The PROGRAM byte-equal invariant is enforced by
`src/test/phase-4-chatdev.test.ts` (the `cmp` against the a-metagpt
copy). The four-way `evaluate.md` byte-equal invariant
(b-evaluator-optimizer / c-reflexion / a-metagpt / b-chatdev) is
enforced by `src/test/phase-dynamics-identity.test.ts`. No drift
observed during T8 / T9 / T10.

## Phase 4 — dialogue turn cap

`dialogue.md`'s "Turn limit" instruction caps the dialogue at **6
turns** (`./scoped/turns.md` containing 6 or more triggers a forced
transition to `decide_accept`). The ChatDev demo PROGRAM is small
enough that this cap is rarely hit in live runs of competent models,
but the cap exists to prevent infinite-dialogue stalls when a model
fails to emit a `FINAL:` consensus token. Future phases that adopt
`dialogue.md` for harder topics may want to raise the cap (a
push-arg `{{turn_cap}}` would be a natural extension).

## Phase 4 — phase-rename around the QA / review fork

The QA dispatch in `a-metagpt`'s strategy (`Dispatch QA` instruction)
sets the local push-time state to `awaiting_verdict`, and the role's
return path matches on `awaiting_verdict_completed` after the shell
suffixes `_completed` on pop. The same `_completed` suffix convention
applies to ChatDev's `dialogue.md` when it pushes `evaluate.md` —
its return-after-evaluate matcher is `decide_accept_completed`.
These are normal applications of the Phase-2b shell convention; no
edge case discovered.

## Web tools (T1–T3) — no surprises beyond the unit tests

`src/web-tools.ts` (DuckDuckGo backend, custom HTML-only fetch,
`stripHtml` internal helper) is covered by 19 dedicated tests across
`web-tools-search.test.ts` and `web-tools-fetch.test.ts`. The CC
provider's allow-list addition for `WebSearch` and `WebFetch` (T3)
went in cleanly. No timeout or content-type pathology observed in
unit tests; live behaviour against the public DDG endpoint is
implicitly tested every time the LLM uses `web_search` in a leaf
demo.

`stripHtml` is exercised indirectly by every `web_fetch` happy-path
test; a direct unit test for it would only re-cover the same lines.
Per T12 Step 5, no new test is added.

## Cross-cutting

1. **No T0 shell fix was needed.** The contingent T0 task (a shell
   bug to fix before Phase 3) was scoped but not triggered: no
   regression surfaced during T1–T11 implementation.

2. **`game-team` retirement landed cleanly.** T11 deleted
   `interpreters/game-team/` and updated `CLAUDE.md`, the root
   `README.md`, this plan doc, and Phase 4 group READMEs. The
   shell features previously exercised by game-team (fuzzy NL
   conditions, non-blocking `## Pending Questions`, strategy-level
   `## Push`) are pinned by `src/test/phase-4-shell-features.test.ts`
   so they cannot regress. R35–R39 satisfied.

3. **Test suite size after Phase 4.** 301 tests, all green. No tests
   were skipped or disabled across this spec.

4. **Windows line-ending CRLF/LF warnings still cosmetic** (carried
   over from Phase 1 notes; no action taken).
