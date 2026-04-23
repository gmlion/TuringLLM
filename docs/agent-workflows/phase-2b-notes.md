# Phase 2b — Implementation notes

Captured at the end of the agent-workflows-phase-2b spec. Findings that future phases can use to avoid the same pain.

## Per-frame directory layout

The cwd handoff (shell sets cwd to the active frame before each LLM cycle) is the load-bearing simplification. Once cwd is per-frame, the invariants `./MEMORY.md`, `./INSTRUCTIONS.md`, `./scoped/`, `../../PROGRAM.md`, `../../workspace/` resolve uniformly regardless of stack depth — no `{{scope_dir}}` substitution, no caller-aware path computation in dynamics. This eliminated the entire substitution machinery from the Phase-2 design.

Frame naming `f<NNN>-<slug>` (zero-padded, monotonic counter, slug from push-target filename) was robust across the d-cove run that climbed to f006 with siblings appearing/disappearing on push/pop. The root frame is always `f000-strategy`. The counter is persisted in `.call-stack.json.nextCounter` so it survives restarts.

`new-instance.sh` rewrite was the largest contained change in the spec — it now bootstraps `frames/f000-strategy/{INSTRUCTIONS.md,MEMORY.md,scoped/}` directly from the interpreter directory rather than placing those files at the instance root. No surprises during the rewrite.

## ## Return parsing and splicing

Reusing the `## Push-Args` block-scalar grammar for `## Return` was the right call: one parser (`parseKeyedSection` in `src/memory.ts`) handles both, and dynamic authors don't need to learn a second syntax. The shared helper landed in commit 5a1bfa0 after the code-quality reviewer flagged the duplication.

Splice semantics: each `## Return` key becomes a top-level `## <Capitalized>` section in the caller's MEMORY. If the section already exists, replace in place; otherwise append. The d-cove demo exercised this: the verify dynamic returned `revised`, `verified_analysis`, `final_answer` — all three appeared as fresh sections in the strategy frame's MEMORY post-pop.

**Edge case that surprised us:** the verify dynamic's spec said "returns `revised`" but the LLM produced three keys (`revised`, `verified_analysis`, `final_answer`). The shell accepted them all silently. We did not implement declared-return validation (it was discussed in Phase-2b brainstorming and explicitly deferred): undeclared returns are a soft signal, not a hard error. This is a future Phase 2c candidate — a `## Returns:` directive at the top of a dynamic that the shell can validate against.

**Cosmetic finding:** when a child returns `verdict` and `feedback` and the caller's strategy then halts on `done`, those return sections are still present in the final MEMORY (see p2b-c). Strategies that want a clean final state should clear residual return sections explicitly.

## Interpreter retrofits

The four iterative-refinement dynamics (`self-critique.md`, `evaluate.md`, `reflect.md`, `verify.md`, `answer-independently.md`) all migrated cleanly to:
- Per-frame scoped files under `./scoped/` (caller writes `./scoped/draft.md`, dynamic reads it via cwd-relative path)
- `## Return` blocks instead of shared-MEMORY side effects

LLMs followed the surgical-edit convention (`sed -i`, `echo >>`, `awk`) reliably for `lessons.md` (c-reflexion) — across 19 cycles of p2b-c, both lessons accumulated correctly via append, no wholesale rewrites. The system-prompt subsection "Mutating other files" appears to be the load-bearing instruction here; without it, providers default to `Write` (full rewrite).

**One regression to flag** — `verify.md` in d-cove: the LLM updated `verifications.md` with a non-anchored `sed` pattern that matched all four remaining `pending` bullets at once. V5–V8 all got the same answer text (V5's). Despite the bug, the puzzle was solved correctly because the draft was already correct and the strategy reasoned over the original analysis, not the corrupted bullets. The fix is to tighten verify.md's instruction to anchor sed to the FIRST pending bullet (the file already says this, but the model interpreted it as the only one to update — meaning the global modifier was a model error, not a spec ambiguity). Worth a hard-coded `sed` example in the prompt for the next iteration.

## d-cove live demo

`instances/p2b-d`: 19 cycles, halted `done`, correct answer (P1–P3, P11, P12–P17 = knaves; P4–P10, P18–P20 = knights).

- **Depth-2 push verified (R27).** Snapshots `0005-54c63ff` and `0008-52cac1e` show stack length 3: `[<root>, drafted, asking]` with frames `[f000-strategy, f001-verify, f002-answer-independently]`.
- **Per-frame isolation verified (R6).** Each frame had its own `MEMORY.md`, `INSTRUCTIONS.md`, and `scoped/` subtree. The strategy's `scoped/draft.md` was untouched while verify.md's `scoped/verifications.md` accumulated 8 bullets and answer-independently.md's frames carried per-question MEMORY.
- **Splice works at depth 2.** Each `[pop]` event followed by `## Answer` appearing in the verify frame confirmed the pop-then-splice pipeline. Verify also successfully spliced multi-key returns (`revised`, `verified_analysis`, `final_answer`) into the strategy frame at depth 1.
- **History snapshots include frames/ subtree (R29).** Inspected `history/0005-54c63ff/frames/` — all three active frame directories present at the time of the snapshot, with their MEMORY/INSTRUCTIONS/scoped trees intact.

## a/b/c live demos

| instance | interpreter | cycles | outcome |
| -------- | ----------- | ------ | ------- |
| `instances/p2b-a` | a-self-refine | 9 | halted done; `scoped/draft.md` contains accepted JSDoc rewrite |
| `instances/p2b-b` | b-evaluator-optimizer | 4 | halted done; first-pass accept of plain-language explainer |
| `instances/p2b-c` | c-reflexion | 19 | halted done; `scoped/lessons.md` accumulated 2 lessons via surgical append |

p2b-c is the strongest evidence for the surgical-edit convention: the L1 → L2 transition required appending to an existing file without losing L1, and across two evaluate→reflect→regenerate cycles the file ended with both bullets intact. The lessons were specifically about the LLM forgetting to actually write `is_palindrome.py` to disk before claiming completion — a real PROGRAM.md execution failure that Reflexion correctly turned into transferable feedback.

## Cross-cutting

Total Phase-2b implementation: 18 tasks, 175 tests passing, no regressions in pre-existing test suites.

The chroot pivot (mid-spec) was the right call. The original Phase-2b design — substitute `{{scope_dir}}` into dynamic instruction text — would have required dynamic authors to know about that placeholder and would have left "scope" as an explicit concept callers had to manage. Cwd-based isolation makes scope implicit and correct-by-default. Worth the requirements rewrite cost.

**Breaking change (R43):** The Phase-2b layout (`frames/f<NNN>-<slug>/`) is incompatible with the pre-2b layout (flat `INSTRUCTIONS.md` + `MEMORY.md` at instance root). Pre-2b instances cannot resume under the Phase-2b shell. Wipe `instances/` and recreate with `new-instance.sh`. This is a one-time migration cost; no further breaking layout changes are anticipated before Phase 3.

**Candidate Phase 2c work** suggested by these demos:
- Declared-return validation (`## Returns: revised, verdict` directive at top of dynamic; shell warns or errors on undeclared keys).
- Tighter sed-anchoring guidance in verify.md / similar dynamics that surgically edit list files.
- Strategy-frame "clear residual return sections" hook on halt for cosmetic tidiness.
