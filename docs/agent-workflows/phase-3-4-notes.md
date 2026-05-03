# Phase 3 + Phase 4 — notes

Captured at the end of the
`docs/specs/2026-04-24-implement-phase-3-and-4/` spec. Findings that
later phases can use to avoid the same pain.

## Live-demo validation outcomes

All five live demos were executed under default provider
(claude-code, Haiku) after the spec landed. **All five halted at
`## State\ndone`** (R16, R32 satisfied for every new leaf). Per-leaf
detail and caveats below. Outcomes recorded against
`instances/<demo-name>/`.

### demo3a3 (a-plan-execute, demo d1: TypeScript project setup)
- Halted at `done` after 40 cycles, 9 pushes total.
- `workspace/` contains the full TypeScript project: `package.json`,
  `tsconfig.json`, `src/index.ts` + `src/index.test.ts`, `dist/` (compiled),
  `node_modules/`, `.github/workflows/ci.yml`, `report.md`.
  R13 deliverable satisfied.
- **R17 not exercised by this run.** R17 expected at least one replan
  triggered by a step failure; the LLM completed all 7 plan steps
  successfully on first attempt without needing to replan. The
  *structural* replan path is in place (`Route after step` →
  needs_replan branch → `## Push operators/plan.md`); whether a given
  live run actually exercises it depends on the LLM's per-cycle
  judgement of step acceptability. Same caveat as Phase-1 R11
  (Reflexion lessons quantitative gate). Re-run if R17 is needed in
  this specific instance.

### demo3b2 (b-orchestrator-workers, demo d2: 5-file summarisation)
- Halted at `done` after 47 cycles, 11 pushes total.
- `workspace/` contains all expected deliverables: `inputs/` (the 5
  copied input files), `per-file-summaries.md`, `summary.md`, plus
  extras the LLM chose to produce (`common-threads.md`, `report.md`,
  `summaries/` directory).
- **R18 (exactly 5 execute-step pushes) not literally satisfied.**
  The actual run had 9 execute-step pushes — the LLM emitted a plan
  with more steps than 5 (likely combining file-reading, summarising,
  and synthesis as separate steps). The "exactly 5" prediction was a
  per-input-file count, but the LLM is free to choose a finer-grained
  decomposition. R18 should probably be relaxed to "at least 5
  execute-step pushes corresponding to the inputs" in a future spec.

### demo3c2 (c-deep-research, demo d3: Raft/Paxos/Multi-Paxos)
- Halted at `done` after 48 cycles, 18 pushes total.
- `workspace/report.md` produced (R15 deliverable).
- **R19 + R43 satisfied.** Multiple history snapshots reach stack
  depth 3 (root strategy + execute-step + plan child) — recursive
  `plan.md` re-push from inside `execute-step.md` fired at cycles
  6, 11, 18, 23, 28 (and possibly more). The recursion pattern
  worked as designed.

### demo4a (a-metagpt, demo: wc-plus CLI)
- Halted at `done` after 12 cycles, 5 pushes total.
- `workspace/` contains the `wc-plus` CLI: `bin/`, `src/`, `dist/`,
  `package.json`, `tsconfig.json`. R34 deliverable satisfied.
- **R33 partially satisfied — caveat from C4 fix.** Final MEMORY
  contains `## Code_review` only (verdict and feedback present), not
  the full `## Prd / ## Design / ## Tasks / ## Code_review` set.
  Cause: the original C4 fix to a-metagpt INSTRUCTIONS instructed
  each Dispatch to remove the consumed input section after
  forwarding (to avoid `empty_completed` aliasing across the four
  push sites). With the C6 fix using meaningful state names
  (`pm_active` / `architect_active` / `engineer_active` /
  `qa_active`) the section-removal became unnecessary. The
  INSTRUCTIONS were updated post-demo to leave the sections in
  MEMORY. **Re-running demo4a against the corrected INSTRUCTIONS
  will satisfy R33 literally.**

### demo4b (b-chatdev, demo: wc-plus CLI, same PROGRAM as demo4a)
- Halted at `done` after 28 cycles, 6 pushes total.
- **R33 satisfied.** Final MEMORY contains all four phase-outcome
  sections: `## Design Doc`, `## Code`, `## Test Report`,
  `## Documentation`.
- **R34 caveat — workspace empty.** The dialogue.md operator produced
  text artefacts (the `## Code` section's body contains the wc-plus
  source) but did not write code files to `workspace/`. The dialogue
  pattern emphasizes converged transcripts over file emission; if
  R34 requires actual files in `workspace/`, the dialogue's "Return"
  step would need to also write the consensus artefact via
  `write_file`. Documented for future-spec adjustment.

## Bugs surfaced by the live demos (post-merge fixes)

The final whole-branch code-reviewer subagent and the live demos
together surfaced seven runtime bugs that the file-content-only
integration tests missed. All fixed in commits between the original
T12 commit and these live runs. Listed in order of discovery:

- **C1**: `plan.md` `{{results_so_far}}` placeholder unresolved on
  first push from Initialize. Fixed by Initialize always passing
  `results_so_far: |\n  (no prior results)`. Re-byte-copied across
  the three Phase-3 leaves.
- **C2**: `dialogue.md` `{{input}}` placeholder unresolved when the
  b-chatdev strategy pushed without it. Fixed by every dialogue push
  in `b-chatdev` strategy passing `input:` (with `(none — first phase)`
  for Initialize, prior phase output for the rest).
- **C3**: `roles/` subdirectory of an interpreter never reached the
  instance. `new-instance.sh` only copied top-level `*.md`, `operators/`,
  and `PROGRAM.md`. Fixed by adding `cp -r $INTERP_DIR/roles $DIR/roles`
  and updating `dialogue.md` to use `../../roles/<name>.md` (instance
  root, two `..` from a frame dir).
- **C4 (initial)**: a-metagpt's four Dispatch instructions all matched
  on `empty_completed`, so after PM returned with `## Prd`, the
  Architect dispatch fired correctly, but after Architect returned
  with `## Design`, the LLM had to fuzzy-match (since both `## Prd`
  and `## Design` were present and the conditions overlapped). C4
  fix added per-Dispatch section-removal. Then C6 (below)
  superseded it with state-name disambiguation; the post-C6 strategy
  no longer needs section-removal.
- **C5**: `execute-step.md` had no `empty_completed` handler for the
  recursive `plan.md` push case (the recursion path the d3 deep-
  research demo exercises). Fixed by adding an "Absorb sub-plan"
  instruction that consumes the spliced `## Plan` and routes to
  `acceptable`.
- **C6**: All three new strategies (a-plan-execute, a-metagpt,
  b-chatdev) used post-pop conditions (`planning_completed`,
  `executing_completed`, `synthesising_completed`,
  `empty_completed`) but the actual returnState was whatever the
  LLM had MEMORY.state set to at push time — which was *not* those
  meaningful names, because the original instructions said "do not
  change state when pushing." Fixed by setting state to a meaningful
  label BEFORE the push so the post-pop returnState matches.
- **C7**: `new-instance.sh` did not copy the interpreter's
  `workspace/` subdirectory, so b-orchestrator-workers' five input
  files (shipped under `interpreters/.../workspace/inputs/`) never
  reached the instance. Fixed by adding `cp -r $INTERP_DIR/workspace
  $DIR/workspace`.

A separate flake in C6's first round: even with state-name pre-push,
the LLM occasionally rewrote MEMORY with the new state but skipped
the `## Push` block (the "set state then append push" pattern was
two operations the LLM treated as separable). Fixed in Phase 3 by
moving to a **single-bash-heredoc atomic write** that includes both
the canonical sections AND the push block in one
`cat > MEMORY.md << 'MEMEOF' ... MEMEOF`. This made the push and
state change atomic from the LLM's perspective. The atomic-write
pattern is documented in the strategy file under the "ATOMIC PUSH
RULE" header.

## Lessons for future phases

1. **File-content-only integration tests are insufficient for
   strategy correctness.** Phase-1 tests drive `applyPush` /
   `applyPop` to exercise actual state-machine round-trips; the
   Phase-3/4 tests degraded to `readFileSync` + regex matches and
   missed all seven bugs above. Future strategy specs should require
   at least one `applyPush`-driven smoke test per leaf.
2. **Strategy state names must match the shell's pop convention.**
   The shell sets caller state to `<returnState_at_push>_completed`
   on pop. If the strategy's absorber instruction expects
   `planning_completed`, the caller MUST be in state `planning` at
   push time. Document this prominently in the operators/strategy
   guide.
3. **Push + state-change in one cycle needs atomic-heredoc syntax.**
   When an instruction must both set MEMORY state AND emit a
   `## Push` block, the LLM is liable to drop one of the two if they
   are described as separate operations. Use a single
   `cat > MEMORY.md << 'MEMEOF'` that includes the push block to
   force atomicity.
4. **Interpreter-shipped subdirectories beyond `operators/` need
   explicit copy-into-instance support.** `roles/` (b-chatdev) and
   `workspace/` (b-orchestrator-workers) both surfaced this. The
   fix in `new-instance.sh` is small and additive.
5. **R18-style "exactly N pushes" predictions are LLM-behaviour-
   dependent.** Soften to "at least N" or "approximately N" for
   future quantitative R#s.

## Plan operators-table sync (R50) — drifts found

Audit of the "Reusable operators library" table in
`docs/agent-workflows/requirements.md` against the operators actually
shipped by this spec uncovered three drifts. They are corrected in
the same commit as this notes file.

1. **`role-<name>.md` stack depth.** Table previously listed `1`. The
   PM/Architect/Engineer roles do run at depth 1, but **`role-qa.md`
   pushes `operators/evaluate.md` at depth 2** (the QA role's verdict
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
match the actual contracts; Phase 3 operators consume push-args rather
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

## Phase 3a — three leaves, byte-equal `INSTRUCTIONS.md` and `operators/`

The collapse rationale ("four named patterns, one implementation")
held up cleanly across the three leaves. The byte-equal invariant is
asserted by `src/test/phase-operators-identity.test.ts` and held
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
operators/plan.md` block written from inside an `execute-step.md`
frame, captured in `history/`) requires the manual run.

## Phase 4 — shared `PROGRAM.md` between MetaGPT and ChatDev

R22 mandates that `b-chatdev/PROGRAM.md` is a byte-equal copy of
`a-metagpt/PROGRAM.md` so that the two outputs are directly
comparable. The PROGRAM byte-equal invariant is enforced by
`src/test/phase-4-chatdev.test.ts` (the `cmp` against the a-metagpt
copy). The four-way `evaluate.md` byte-equal invariant
(b-evaluator-optimizer / c-reflexion / a-metagpt / b-chatdev) is
enforced by `src/test/phase-operators-identity.test.ts`. No drift
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
