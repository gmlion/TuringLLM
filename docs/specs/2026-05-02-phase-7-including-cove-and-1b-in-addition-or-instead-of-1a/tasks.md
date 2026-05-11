# Tasks: phase-7-including-cove-and-1b-in-addition-or-instead-of-1a

> **For executors:** use `kiro-flow:spec-execute` (it wraps `superpowers:subagent-driven-development` or `superpowers:executing-plans`). Each task below is TDD-shaped — write the failing test first, then minimal code, then verify, then commit. Commit messages must reference the task's `(satisfies: R#)` tag.

> **Note on shape:** this phase delivers four interlocking refactors plus a new interpreter — see `docs/specs/2026-05-02-phase-7-including-cove-and-1b-in-addition-or-instead-of-1a/design.md` for the full architectural picture. Bash bodies for the AFlow-lite operator and the migrated interpreters are heavy; this file points at design.md sections rather than re-listing them. The per-interpreter migration tasks (T12–T23) all follow the same template and differ only in which strategy file they migrate.

> **Build/test commands:** `npm test` (which runs `npm run build` first). To narrow output during TDD: `npm test 2>&1 | grep -E "phase-7|FAIL|✘"`. After writing markdown, no rebuild is needed (tests load markdown via `readFileSync`); `npm test` still rebuilds TypeScript — that's expected.

> **Ordering rule:** Phase A (rename foundation, T1–T5) MUST land before Phase B (shell change, T6–T10) — the shell needs `operators/` paths. Phase B MUST land before Phase C (per-interpreter migration, T11–T23) — the migration depends on the new bootstrap. Phase C MUST land before Phase D (AFlow-lite, T24–T34) — AFlow-lite copies migrated operator files byte-equal. Phase E (docs, T35–T38) lands last.

## Task index

| #   | Summary                                                                  | Satisfies                                          |
| --- | ------------------------------------------------------------------------ | -------------------------------------------------- |
| T1  | git mv: rename `dynamics/` → `operators/` in all 12 leaves               | R4                                                 |
| T2  | sed: update `## Push dynamics/...` → `operators/...` in INSTRUCTIONS.md  | R5                                                 |
| T3  | sed/manual: rename "dynamic" → "operator" in `src/` identifiers          | R7                                                 |
| T4  | git mv + sed: rename identity test + update existing test paths          | R9, R54                                            |
| T5  | sed: update markdown docs (interpreters/, docs/agent-workflows/, CLAUDE.md) for the rename | R6, R10                                |
| T6  | Shell change: `.root-operator` reading at startup + slug derivation      | R11, R12, R17                                      |
| T7  | Shell change: `{{program}}` substitution + initial frame creation        | R12, R17                                           |
| T8  | Shell change: OUTPUT.md emission on done@depth1 + diagnostic for empty Return | R13, R18, R19                                 |
| T9  | Shell change: error-out when `.root-operator` is absent                  | R14                                                |
| T10 | `new-instance.sh` overhaul: write `.root-operator`, drop frames creation, copy operators/+workspace | R8, R15, R51                  |
| T11 | New test `phase-7-shell-bootstrap.test.ts` (end-to-end shell exercise)   | R55                                                |
| T12 | Migrate 1a self-refine to canonical operator + marker INSTRUCTIONS       | R20, R21, R22, R23, R24, R25, R27, R45, R46, R47   |
| T13 | Migrate 1b evaluator-optimizer to canonical `operators/refine.md`        | R20, R21, R22, R23, R24, R25, R27, R45, R46, R47   |
| T14 | Migrate 1c reflexion to canonical `operators/reflexion.md`               | R20, R21, R22, R23, R24, R25, R27, R45, R46, R47   |
| T15 | Migrate 1d cove to canonical `operators/cove.md`                         | R20, R21, R22, R23, R24, R25, R27, R45, R46, R47   |
| T16 | Migrate 2a plan-execute + sync byte-equal copies in 2b/2c                | R20, R21, R22, R23, R24, R25, R26, R27, R45, R46, R47 |
| T17 | Migrate 3a tot to canonical `operators/tot.md`                           | R20, R21, R22, R23, R24, R25, R27, R45, R46, R47   |
| T18 | Migrate 3b lats to canonical `operators/lats.md`                         | R20, R21, R22, R23, R24, R25, R27, R45, R46, R47   |
| T19 | Migrate 4a debate to canonical `operators/debate.md`                     | R20, R21, R22, R23, R24, R25, R27, R45, R46, R47   |
| T20 | Migrate 5a metagpt to canonical `operators/metagpt.md`                   | R20, R21, R22, R23, R24, R25, R27, R45, R46, R47   |
| T21 | Migrate 5b chatdev to canonical `operators/chatdev.md`                   | R20, R21, R22, R23, R24, R25, R27, R45, R46, R47   |
| T22 | Bootstrap aflow-lite dir + group README delta + leaf README skeleton + test file | R1, R2, R3, R34                            |
| T23 | Copy reused operators byte-equal (5 library + 7 sub-operators)           | R26, R34                                           |
| T24 | Identity test extension for new operator copies                          | R26, R53                                           |
| T25 | Demo PROGRAM.md + workspace/gsm8k.jsonl fixture (20 items)               | R48, R49                                           |
| T26 | aflow-lite.md preamble + Initialize (incl. fixture loading + sampling)   | R28, R29, R30, R31, R36, R50                       |
| T27 | aflow-lite.md tree ledger primitives + scoped files                      | R29                                                |
| T28 | aflow-lite.md Compose-partial-state (recent_scores composition)          | R32 (push-args), R33                               |
| T29 | aflow-lite.md Select instruction + UCT                                   | R29                                                |
| T30 | aflow-lite.md Expand-push + Expand-absorb                                | R32                                                |
| T31 | New `expand-workflow.md` operator                                        | R41, R42, R43, R44                                 |
| T32 | aflow-lite.md Simulate-push + per-item workflow execution loop           | R33, R35                                           |
| T33 | aflow-lite.md Evaluate-absorb + back-prop + termination                  | R37, R38, R39, R40, R65, R66, R72                  |
| T34 | aflow-lite.md negative-requirement pins (no MoA, no 1a, no search/SOP, no concurrency, vocabulary) | R31, R39, R40, R61, R62, R63, R64, R65, R66, R70, R71, R72 |
| T35 | aflow-lite leaf README full content + group README full content + smoke check | R2, R3                                       |
| T36 | Source-spec parent doc updates (renamed table heading, new row, Phase 7 section) | R56                                       |
| T37 | `interpreters/README.md` updates                                         | R57                                                |
| T38 | `CLAUDE.md` updates                                                      | R58                                                |
| T39 | Per-leaf README delta for each migrated interpreter                      | R59                                                |
| T40 | Per-group README updates (rename only)                                   | R60                                                |
| T41 | Backwards-compat pin (R67 enforced; R68 instances stay; R69 frozen specs unchanged) | R67, R68, R69                            |
| T42 | Behavior regression assertions for migrated interpreters                 | R27                                                |

---

## Phase A — Rename foundation (T1–T5)

## Task 1: git mv `dynamics/` → `operators/` in all 12 leaves   (satisfies: R4)

**Files:**
- Rename: `interpreters/mas-papers/1-iterative-refinement/{a-self-refine,b-evaluator-optimizer,c-reflexion,d-cove}/dynamics/` → `operators/`
- Rename: `interpreters/mas-papers/2-planning-decomposition/{a-plan-execute,b-orchestrator-workers,c-deep-research}/dynamics/` → `operators/`
- Rename: `interpreters/mas-papers/3-search/{a-tot,b-lats}/dynamics/` → `operators/`
- Rename: `interpreters/mas-papers/4-peer-collaboration/a-debate/dynamics/` → `operators/`
- Rename: `interpreters/mas-papers/5-fixed-sop-teams/{a-metagpt,b-chatdev}/dynamics/` → `operators/`
- Modify: `src/test/phase-7-aflow-lite.test.ts` (created in T22; for now this task just creates a tiny scratch test in `src/test/_phase-7-rename.test.ts` that's deleted later)

- [ ] **Step 1: Write the failing test**

    Create `src/test/_phase-7-rename.test.ts`:

    ```typescript
    import { test, describe } from "node:test";
    import { strict as assert } from "node:assert";
    import { existsSync } from "fs";
    import { resolve, dirname } from "path";
    import { fileURLToPath } from "url";

    const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

    describe("R4: dynamics/ → operators/ rename across all leaves", () => {
      const leaves = [
        "interpreters/mas-papers/1-iterative-refinement/a-self-refine",
        "interpreters/mas-papers/1-iterative-refinement/b-evaluator-optimizer",
        "interpreters/mas-papers/1-iterative-refinement/c-reflexion",
        "interpreters/mas-papers/1-iterative-refinement/d-cove",
        "interpreters/mas-papers/2-planning-decomposition/a-plan-execute",
        "interpreters/mas-papers/2-planning-decomposition/b-orchestrator-workers",
        "interpreters/mas-papers/2-planning-decomposition/c-deep-research",
        "interpreters/mas-papers/3-search/a-tot",
        "interpreters/mas-papers/3-search/b-lats",
        "interpreters/mas-papers/4-peer-collaboration/a-debate",
        "interpreters/mas-papers/5-fixed-sop-teams/a-metagpt",
        "interpreters/mas-papers/5-fixed-sop-teams/b-chatdev",
      ];
      for (const leaf of leaves) {
        test(`${leaf}/operators/ exists`, () => {
          assert.ok(existsSync(resolve(REPO, leaf, "operators")), `${leaf}/operators/ missing`);
        });
        test(`${leaf}/dynamics/ does NOT exist`, () => {
          assert.ok(!existsSync(resolve(REPO, leaf, "dynamics")), `${leaf}/dynamics/ should be gone`);
        });
      }
    });
    ```

- [ ] **Step 2: Run test to verify it fails**

    Run: `npm test 2>&1 | grep -E "_phase-7-rename|FAIL"`
    Expected: FAIL — every `${leaf}/operators/ exists` assertion fails.

- [ ] **Step 3: Write minimal implementation**

    Run from repo root:

    ```bash
    for leaf in \
      interpreters/mas-papers/1-iterative-refinement/a-self-refine \
      interpreters/mas-papers/1-iterative-refinement/b-evaluator-optimizer \
      interpreters/mas-papers/1-iterative-refinement/c-reflexion \
      interpreters/mas-papers/1-iterative-refinement/d-cove \
      interpreters/mas-papers/2-planning-decomposition/a-plan-execute \
      interpreters/mas-papers/2-planning-decomposition/b-orchestrator-workers \
      interpreters/mas-papers/2-planning-decomposition/c-deep-research \
      interpreters/mas-papers/3-search/a-tot \
      interpreters/mas-papers/3-search/b-lats \
      interpreters/mas-papers/4-peer-collaboration/a-debate \
      interpreters/mas-papers/5-fixed-sop-teams/a-metagpt \
      interpreters/mas-papers/5-fixed-sop-teams/b-chatdev; do
      git mv "$leaf/dynamics" "$leaf/operators"
    done
    ```

- [ ] **Step 4: Run test to verify it passes**

    Run: `npm test 2>&1 | grep -E "_phase-7-rename|FAIL"`
    Expected: PASS for all 24 assertions.

    Other phase-N tests are now broken because they reference `dynamics/` paths; this is expected and addressed in T4.

- [ ] **Step 5: Commit**

    ```bash
    git add interpreters/ src/test/_phase-7-rename.test.ts
    git commit -m "refactor(phase-7): git mv dynamics/ → operators/ in all 12 leaves (satisfies: R4)"
    ```

---

## Task 2: Update `## Push dynamics/...` → `operators/...` in every INSTRUCTIONS.md   (satisfies: R5)

**Files:**
- Modify: every `interpreters/*/*/INSTRUCTIONS.md` that contains `dynamics/` substrings (use grep to find them)
- Modify: every `interpreters/*/*/operators/*.md` that contains `dynamics/` substrings (sub-operators that push other sub-operators)

- [ ] **Step 1: Write the failing test**

    Append to `src/test/_phase-7-rename.test.ts`:

    ```typescript
    import { readFileSync } from "fs";
    import { execSync } from "child_process";

    describe("R5: no `dynamics/` substring in INSTRUCTIONS.md or operator files", () => {
      test("no dynamics/ in any interpreter markdown", () => {
        const out = execSync(
          'git grep -l "dynamics/" -- "interpreters/**/*.md"',
          { cwd: REPO, encoding: "utf-8" }
        ).trim();
        assert.equal(out, "", `unexpected 'dynamics/' references in: ${out}`);
      });
    });
    ```

- [ ] **Step 2: Run test to verify it fails**

    Run: `npm test 2>&1 | grep -E "_phase-7-rename|FAIL"`
    Expected: FAIL — multiple INSTRUCTIONS.md files still contain `dynamics/<file>.md` push targets.

- [ ] **Step 3: Write minimal implementation**

    ```bash
    cd interpreters
    grep -rl 'dynamics/' . --include='*.md' | while read f; do
      sed -i 's|dynamics/|operators/|g' "$f"
    done
    cd ..
    ```

- [ ] **Step 4: Run test to verify it passes**

    Run: `npm test 2>&1 | grep -E "_phase-7-rename|FAIL"`
    Expected: PASS for the new R5 assertion.

- [ ] **Step 5: Commit**

    ```bash
    git add interpreters/ src/test/_phase-7-rename.test.ts
    git commit -m "refactor(phase-7): update ## Push paths in all INSTRUCTIONS.md and operator files (satisfies: R5)"
    ```

---

## Task 3: Rename "dynamic" → "operator" in `src/` source identifiers   (satisfies: R7)

**Files:**
- Modify: `src/main.ts`, `src/call-stack.ts`, `src/memory.ts`, `src/prompt.ts`, `src/tools.ts`, `src/providers/*.ts` — function names, comments, type aliases that use "dynamic" in the "pushable INSTRUCTIONS file" sense.

- [ ] **Step 1: Write the failing test**

    Append to `src/test/_phase-7-rename.test.ts`:

    ```typescript
    describe("R7: source identifiers use 'operator' not 'dynamic' (where it means a pushable file)", () => {
      test("call-stack.ts: ROOT_FRAME_DIR comment mentions 'operator' not 'dynamic'", () => {
        const s = readFileSync(resolve(REPO, "src/call-stack.ts"), "utf-8");
        // Permissive: just check that "dynamic" doesn't appear with "INSTRUCTIONS file" semantics.
        // We pin specific load-bearing identifiers.
        assert.doesNotMatch(s, /dynamic file|dynamic INSTRUCTIONS|dynamic frame/i);
      });
      test("main.ts: no `pushedDynamic` or similar", () => {
        const s = readFileSync(resolve(REPO, "src/main.ts"), "utf-8");
        assert.doesNotMatch(s, /pushedDynamic|childDynamic|dynamicFrame/);
      });
      test("prompt.ts: prose uses 'operator' for pushable sense", () => {
        const s = readFileSync(resolve(REPO, "src/prompt.ts"), "utf-8");
        // Should refer to operators in the system prompt where it explains push/pop
        assert.match(s, /operator/i);
      });
    });
    ```

- [ ] **Step 2: Run test to verify it fails**

    Run: `npm test 2>&1 | grep -E "_phase-7-rename|FAIL"`
    Expected: FAIL on prose-rename assertions.

- [ ] **Step 3: Write minimal implementation**

    Manual review per file; rename load-bearing identifiers:
    - `src/main.ts`: any `pushedDynamic` → `pushedOperator`, comments referring to "the dynamic" in push/pop sense → "the operator".
    - `src/call-stack.ts`: doc comment at the top about Phase 2b types → update terminology; identifiers like `applyPush` keep their names (the function pushes an operator now); comments mentioning "dynamic" in pushable-file sense → "operator".
    - `src/memory.ts`: comment text only; no functional change.
    - `src/prompt.ts`: the system prompt text where it explains push/pop semantics — update from "dynamic" to "operator".
    - `src/tools.ts`, `src/providers/*.ts`: search and update comment occurrences.

    Use the build (`npm run build`) to catch any identifier rename that broke imports.

- [ ] **Step 4: Run test to verify it passes**

    Run: `npm test 2>&1 | grep -E "_phase-7-rename|FAIL"`
    Expected: PASS for the three R7 assertions; existing tests still green except for those that reference renamed test files (addressed in T4).

- [ ] **Step 5: Commit**

    ```bash
    git add src/
    git commit -m "refactor(phase-7): rename 'dynamic' → 'operator' in src/ identifiers and prose (satisfies: R7)"
    ```

---

## Task 4: Rename identity test + update existing tests for the rename   (satisfies: R9, R54)

**Files:**
- Rename: `src/test/phase-operators-identity.test.ts` → `src/test/phase-operators-identity.test.ts`
- Modify: every `src/test/phase-N-X.test.ts` (12 phase-N test files) for `dynamics/` → `operators/` and any other rename consequences
- Modify: `src/test/phase-3-dynamics-identity.test.ts` (note: separate from the canonical identity test) — also rename to `phase-3-operators-identity.test.ts` if it exists

- [ ] **Step 1: Write the failing test**

    Append to `src/test/_phase-7-rename.test.ts`:

    ```typescript
    describe("R9: phase-operators-identity.test.ts exists; phase-operators-identity.test.ts is gone", () => {
      test("phase-operators-identity.test.ts exists", () => {
        assert.ok(existsSync(resolve(REPO, "src/test/phase-operators-identity.test.ts")));
      });
      test("phase-operators-identity.test.ts does NOT exist", () => {
        assert.ok(!existsSync(resolve(REPO, "src/test/phase-operators-identity.test.ts")));
      });
    });

    describe("R54: existing tests don't reference dynamics/", () => {
      test("no dynamics/ in src/test/*.ts files", () => {
        const out = execSync(
          'git grep -l "dynamics/" -- "src/test/*.ts"',
          { cwd: REPO, encoding: "utf-8" }
        ).trim();
        assert.equal(out, "", `unexpected dynamics/ in: ${out}`);
      });
    });
    ```

- [ ] **Step 2: Run test to verify it fails**

    Run: `npm test 2>&1 | grep -E "_phase-7-rename|FAIL"`
    Expected: FAIL on identity-test rename and on dynamics/ references in test files.

- [ ] **Step 3: Write minimal implementation**

    ```bash
    git mv src/test/phase-operators-identity.test.ts src/test/phase-operators-identity.test.ts
    # If phase-3-dynamics-identity.test.ts exists, do the same:
    [ -f src/test/phase-3-dynamics-identity.test.ts ] && git mv src/test/phase-3-dynamics-identity.test.ts src/test/phase-3-operators-identity.test.ts

    # Update all references
    grep -rl 'dynamics/' src/test/ | while read f; do
      sed -i 's|dynamics/|operators/|g' "$f"
    done
    # Also update any reference to the old test filename in CI configs or imports:
    grep -rl 'phase-operators-identity' src/ docs/ 2>/dev/null | while read f; do
      sed -i 's|phase-operators-identity|phase-operators-identity|g' "$f"
    done
    ```

- [ ] **Step 4: Run test to verify it passes**

    Run: `npm test 2>&1 | grep -E "_phase-7-rename|FAIL"`
    Expected: PASS for R9, R54. Other tests now have all their `dynamics/` references replaced; they should pass against the new layout (operator files exist post-T1).

- [ ] **Step 5: Commit**

    ```bash
    git add src/test/
    git commit -m "refactor(phase-7): rename identity test, update all phase-N tests for dynamics→operators (satisfies: R9, R54)"
    ```

---

## Task 5: Update markdown docs for the rename + rename-completeness pin   (satisfies: R6, R10)

**Files:**
- Modify: `interpreters/README.md`, `interpreters/*/README.md` (group READMEs), `interpreters/*/*/README.md` (per-leaf READMEs)
- Modify: `docs/agent-workflows/requirements.md`, `docs/agent-workflows/patterns.md`
- Modify: `CLAUDE.md`
- Delete: `src/test/_phase-7-rename.test.ts` (scratch tests get folded into `phase-7-aflow-lite.test.ts` later; the load-bearing R10 pin moves there)

- [ ] **Step 1: Write the failing test**

    Append the R10 pin to `src/test/_phase-7-rename.test.ts`:

    ```typescript
    describe("R10: no 'dynamics/' substring outside frozen spec dirs", () => {
      test("git grep returns nothing", () => {
        const excludes = [
          ":!docs/specs/2026-04-23-agent-workflows-phase-2b-push-returns/",
          ":!docs/specs/2026-04-24-implement-phase-3-and-4/",
          ":!docs/specs/2026-04-30-agent-workflows-phase-6/",
          ":!docs/specs/2026-05-01-implement-phase-6b/",
        ].join(" ");
        let out = "";
        try {
          out = execSync(`git grep -l "dynamics/" -- ${excludes}`, { cwd: REPO, encoding: "utf-8" }).trim();
        } catch (e: any) {
          // git grep exits 1 when no matches; that's success
          out = "";
        }
        assert.equal(out, "", `unexpected 'dynamics/' references: ${out}`);
      });
    });
    ```

- [ ] **Step 2: Run test to verify it fails**

    Run: `npm test 2>&1 | grep -E "_phase-7-rename|FAIL"`
    Expected: FAIL — many `interpreters/**/*.md`, `docs/agent-workflows/*.md`, and `CLAUDE.md` still mention `dynamics/`.

- [ ] **Step 3: Write minimal implementation**

    ```bash
    grep -rl 'dynamics/' interpreters/ docs/agent-workflows/ CLAUDE.md 2>/dev/null \
      | grep -v '^docs/specs/2026-04-' \
      | grep -v '^docs/specs/2026-05-01-' \
      | while read f; do
        sed -i 's|dynamics/|operators/|g' "$f"
      done
    ```

    Manually inspect the diffs for any prose that needs more than a path swap (e.g., "Each dynamic is..." → "Each operator is..."). Update such prose by hand. The R10 grep test pins only the literal `dynamics/` substring; prose-level "dynamic" word usage is the source-identifier rename's job (T3) for code, and per-doc judgement for prose.

    Move the rename-completeness pin to `phase-7-aflow-lite.test.ts` (which T22 creates):

    Actually for this task, keep the pin in `_phase-7-rename.test.ts` for now. T22 will fold it into the proper file and delete the scratch.

- [ ] **Step 4: Run test to verify it passes**

    Run: `npm test 2>&1 | grep -E "_phase-7-rename|FAIL"`
    Expected: PASS for R10.

- [ ] **Step 5: Commit**

    ```bash
    git add interpreters/ docs/agent-workflows/ CLAUDE.md src/test/_phase-7-rename.test.ts
    git commit -m "docs(phase-7): rename 'dynamics/' → 'operators/' in all live docs + pin rename completeness (satisfies: R6, R10)"
    ```

---

## Phase B — Shell change: root-operator bootstrap (T6–T11)

## Task 6: Shell reads `.root-operator` at startup; derives frame slug   (satisfies: R11, R12, R17)

**Files:**
- Modify: `src/main.ts` (the cycle loop's startup)
- Modify: `src/call-stack.ts` (drop the hardcoded `ROOT_FRAME_DIR` constant; the slug is now per-instance)

- [ ] **Step 1: Write the failing test**

    Create `src/test/phase-7-shell-bootstrap.test.ts`:

    ```typescript
    import { test, describe } from "node:test";
    import { strict as assert } from "node:assert";
    import { existsSync, readFileSync, writeFileSync, mkdirSync, mkdtempSync, rmSync } from "fs";
    import { join, resolve, dirname } from "path";
    import { fileURLToPath } from "url";
    import { execFileSync, execSync } from "child_process";
    import { tmpdir } from "os";

    const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
    const SHELL_BIN = resolve(REPO, "dist/main.js");

    function makeTmpInstance(rootOperatorContent: string, programContent: string, operatorBody: string): string {
      const dir = mkdtempSync(join(tmpdir(), "turing-bootstrap-"));
      writeFileSync(join(dir, ".root-operator"), rootOperatorContent);
      writeFileSync(join(dir, "PROGRAM.md"), programContent);
      mkdirSync(join(dir, "operators"));
      writeFileSync(join(dir, "operators", "test-op.md"), operatorBody);
      return dir;
    }

    describe("R11/R12/R17: shell bootstrap reads .root-operator and creates frame f000-<slug>", () => {
      test("instance with .root-operator gets frames/f000-<slug>/INSTRUCTIONS.md created with {{program}} substituted", () => {
        const dir = makeTmpInstance(
          "operators/test-op.md\n",
          "Hello world.",
          "# Operator\nProgram is: {{program}}\n## Instruction: Halt\n**Condition:** state empty\n**Action:** ...\n",
        );
        try {
          // Run the shell briefly (it needs to do bootstrap then we can kill).
          // For test purposes, we'll just check the bootstrap side-effects.
          // A separate subagent test invokes the shell directly; here we test the bootstrap function in isolation.
          const { startupBootstrap } = require(resolve(REPO, "dist/main.js")); // exposed for testing
          const result = startupBootstrap(dir);
          assert.ok(existsSync(join(dir, "frames/f000-test-op/INSTRUCTIONS.md")));
          const inst = readFileSync(join(dir, "frames/f000-test-op/INSTRUCTIONS.md"), "utf-8");
          assert.match(inst, /Program is: Hello world\./);
        } finally {
          rmSync(dir, { recursive: true, force: true });
        }
      });
    });
    ```

    Note: this test imports an exported `startupBootstrap` function from main.ts. The implementation must export it.

- [ ] **Step 2: Run test to verify it fails**

    Run: `npm run build && npm test 2>&1 | grep -E "phase-7-shell-bootstrap|FAIL"`
    Expected: FAIL — `startupBootstrap` not exported; no `.root-operator` handling exists.

- [ ] **Step 3: Write minimal implementation**

    Edit `src/main.ts` to add the exported `startupBootstrap` function per design.md §Interfaces — Shell bootstrap delta. The function:
    1. Reads `.root-operator` from baseDir.
    2. Errors with the specified message if absent (R14 — handled in T9; for now T6 just makes the success path work).
    3. Derives slug from operator path basename.
    4. Reads operator file content; substitutes `{{program}}` with PROGRAM.md content via the existing `substitutePlaceholders` helper from `src/memory.ts`.
    5. Creates `frames/f000-<slug>/` with INSTRUCTIONS.md (substituted) and MEMORY.md (`## State\nempty\n`).
    6. Initializes call stack with one entry pointing at the new frame.

    Drop or repurpose `ROOT_FRAME_DIR` in `src/call-stack.ts` since the slug is now per-instance. The `freshCallStack()` function may be removed entirely — `loadCallStack` falls back to a fresh-empty when no `.call-stack.json` exists, but bootstrap initializes it first.

    Wire the bootstrap call into `src/main.ts`'s top of the cycle loop, before the first cycle.

- [ ] **Step 4: Run test to verify it passes**

    Run: `npm run build && npm test 2>&1 | grep -E "phase-7-shell-bootstrap|FAIL"`
    Expected: PASS.

- [ ] **Step 5: Commit**

    ```bash
    git add src/main.ts src/call-stack.ts src/test/phase-7-shell-bootstrap.test.ts
    git commit -m "feat(phase-7): shell .root-operator bootstrap with frame slug derivation (satisfies: R11, R12, R17)"
    ```

---

## Task 7: Shell `{{program}}` substitution wired through bootstrap   (satisfies: R12, R17)

(Mostly subsumed by T6's implementation. T7 adds focused tests for substitution edge cases.)

**Files:**
- Modify: `src/test/phase-7-shell-bootstrap.test.ts` (additional assertions)

- [ ] **Step 1: Write the failing test**

    Append to `src/test/phase-7-shell-bootstrap.test.ts`:

    ```typescript
    describe("R12: {{program}} substitution at bootstrap", () => {
      test("multi-line PROGRAM.md substitutes correctly", () => {
        const dir = makeTmpInstance(
          "operators/test-op.md\n",
          "Line one\nLine two\nLine three",
          "# Op\nThe program is:\n{{program}}\n",
        );
        try {
          const { startupBootstrap } = require(resolve(REPO, "dist/main.js"));
          startupBootstrap(dir);
          const inst = readFileSync(join(dir, "frames/f000-test-op/INSTRUCTIONS.md"), "utf-8");
          assert.match(inst, /Line one\nLine two\nLine three/);
        } finally {
          rmSync(dir, { recursive: true, force: true });
        }
      });
      test("operator file with no {{program}} placeholder is left intact", () => {
        const dir = makeTmpInstance(
          "operators/test-op.md\n",
          "anything",
          "# Op\nNo placeholder here.\n",
        );
        try {
          const { startupBootstrap } = require(resolve(REPO, "dist/main.js"));
          startupBootstrap(dir);
          const inst = readFileSync(join(dir, "frames/f000-test-op/INSTRUCTIONS.md"), "utf-8");
          assert.match(inst, /No placeholder here\./);
          assert.doesNotMatch(inst, /\{\{program\}\}/);  // no leftover (R12: substitution leaves nothing if no placeholder)
        } finally {
          rmSync(dir, { recursive: true, force: true });
        }
      });
    });
    ```

- [ ] **Step 2: Run test to verify it fails**

    Run: `npm run build && npm test 2>&1 | grep -E "phase-7-shell-bootstrap|FAIL"`
    Expected: PASS for the multi-line test (T6's implementation already handles it). The "no placeholder" test should also pass under `substitutePlaceholders`'s semantics — verify.

- [ ] **Step 3: Write minimal implementation**

    None needed if T6 was thorough. If a test fails, fix `substitutePlaceholders` semantics (in `src/memory.ts`) to match.

- [ ] **Step 4: Run test to verify it passes**

    Run: `npm run build && npm test 2>&1 | grep -E "phase-7-shell-bootstrap|FAIL"`
    Expected: PASS.

- [ ] **Step 5: Commit**

    ```bash
    git add src/test/phase-7-shell-bootstrap.test.ts
    git commit -m "test(phase-7): {{program}} substitution edge cases at bootstrap (satisfies: R12, R17)"
    ```

---

## Task 8: Shell writes OUTPUT.md on done@depth1 + diagnostic for empty Return   (satisfies: R13, R18, R19)

**Files:**
- Modify: `src/main.ts` (the halt branch in the cycle loop)
- Modify: `src/test/phase-7-shell-bootstrap.test.ts` (assertions)

- [ ] **Step 1: Write the failing test**

    Append to `src/test/phase-7-shell-bootstrap.test.ts`:

    ```typescript
    describe("R13/R18/R19: OUTPUT.md emission on halt", () => {
      test("done@depth1 with ## Return\\nanswer: writes ## Answer to OUTPUT.md", () => {
        const dir = makeTmpInstance(
          "operators/test-op.md\n",
          "compute 6 * 7",
          [
            "# Op",
            "## Instruction: Halt",
            "**Condition:** MEMORY state is \"empty\"",
            "**Action:**",
            "    cat > ./MEMORY.md << 'MEMEOF'",
            "    ## State",
            "    done",
            "    ## Matched Instruction",
            "    Halt",
            "    ## Last Action",
            "    Computed.",
            "    ## Result",
            "    OK.",
            "    ## Return",
            "    answer: 42",
            "    MEMEOF",
            "",
          ].join("\n"),
        );
        try {
          // Run shell binary as a subprocess
          const env = { ...process.env, TURING_PROVIDER: "claude-code" };  // or a stub provider for testing
          // For unit-test purposes call emitOutputMd directly:
          const { emitOutputMd } = require(resolve(REPO, "dist/main.js"));
          const fakeMemory = "## State\ndone\n## Return\nanswer: 42\n";
          emitOutputMd(dir, fakeMemory);
          const out = readFileSync(join(dir, "OUTPUT.md"), "utf-8");
          assert.match(out, /## Answer\n42/);
        } finally {
          rmSync(dir, { recursive: true, force: true });
        }
      });

      test("done@depth1 with no ## Return writes diagnostic", () => {
        const dir = mkdtempSync(join(tmpdir(), "turing-bootstrap-"));
        try {
          const { emitOutputMd } = require(resolve(REPO, "dist/main.js"));
          const fakeMemory = "## State\ndone\n## Last Action\nfoo\n";
          emitOutputMd(dir, fakeMemory);
          const out = readFileSync(join(dir, "OUTPUT.md"), "utf-8");
          assert.match(out, /# OUTPUT \(no return values\)/);
          assert.match(out, /halted without a ## Return/);
        } finally {
          rmSync(dir, { recursive: true, force: true });
        }
      });
    });
    ```

- [ ] **Step 2: Run test to verify it fails**

    Run: `npm run build && npm test 2>&1 | grep -E "phase-7-shell-bootstrap|FAIL"`
    Expected: FAIL — `emitOutputMd` not exported.

- [ ] **Step 3: Write minimal implementation**

    In `src/main.ts`, add and export `emitOutputMd(baseDir, rootMemory)` per design.md §Interfaces — Shell halt delta:

    ```typescript
    export function emitOutputMd(baseDir: string, rootMemory: string): void {
      const returnEntries = parseReturn(rootMemory);  // existing in src/memory.ts
      let outputBody: string;
      if (returnEntries.size === 0) {
        outputBody =
          "# OUTPUT (no return values)\n\n" +
          "The root operator halted without a ## Return block. " +
          "Inspect frames/f000-<slug>/MEMORY.md for terminal state.\n";
      } else {
        outputBody = "";
        for (const [key, value] of returnEntries) {
          const sectionTitle = key.charAt(0).toUpperCase() + key.slice(1);
          outputBody += `## ${sectionTitle}\n${value}\n\n`;
        }
      }
      writeFileSync(join(baseDir, "OUTPUT.md"), outputBody);
    }
    ```

    Wire `emitOutputMd` into the existing halt branch in the cycle loop (around `src/main.ts:541`'s `state === "done"` check). It runs before `process.exit(0)`. Ensure exit code is 0 (R18).

- [ ] **Step 4: Run test to verify it passes**

    Run: `npm run build && npm test 2>&1 | grep -E "phase-7-shell-bootstrap|FAIL"`
    Expected: PASS.

- [ ] **Step 5: Commit**

    ```bash
    git add src/main.ts src/test/phase-7-shell-bootstrap.test.ts
    git commit -m "feat(phase-7): OUTPUT.md emission on done@depth1, diagnostic for empty Return (satisfies: R13, R18, R19)"
    ```

---

## Task 9: Shell errors out cleanly when `.root-operator` is absent   (satisfies: R14)

**Files:**
- Modify: `src/main.ts` (the bootstrap function from T6)
- Modify: `src/test/phase-7-shell-bootstrap.test.ts` (assertions)

- [ ] **Step 1: Write the failing test**

    Append to `src/test/phase-7-shell-bootstrap.test.ts`:

    ```typescript
    describe("R14: absent .root-operator → clean error", () => {
      test("startupBootstrap throws with the canonical message when .root-operator is missing", () => {
        const dir = mkdtempSync(join(tmpdir(), "turing-bootstrap-"));
        writeFileSync(join(dir, "PROGRAM.md"), "anything");
        try {
          const { startupBootstrap } = require(resolve(REPO, "dist/main.js"));
          assert.throws(
            () => startupBootstrap(dir),
            (err: Error) => /no \.root-operator configured/i.test(err.message),
          );
        } finally {
          rmSync(dir, { recursive: true, force: true });
        }
      });
    });
    ```

- [ ] **Step 2: Run test to verify it fails**

    Run: `npm run build && npm test 2>&1 | grep -E "phase-7-shell-bootstrap|FAIL"`
    Expected: FAIL or unexpected behaviour (T6 already added the throw if absent; if T6 did not, this is the addition).

- [ ] **Step 3: Write minimal implementation**

    In `startupBootstrap`, if `.root-operator` content is absent or empty, throw:

    ```typescript
    throw new Error(
      "no .root-operator configured for this instance — pre-Phase-7 instances " +
      "are read-only artefacts; create a new instance via new-instance.sh"
    );
    ```

    The shell's main entry point catches this and exits non-zero with the message printed.

- [ ] **Step 4: Run test to verify it passes**

    Run: `npm run build && npm test 2>&1 | grep -E "phase-7-shell-bootstrap|FAIL"`
    Expected: PASS.

- [ ] **Step 5: Commit**

    ```bash
    git add src/main.ts src/test/phase-7-shell-bootstrap.test.ts
    git commit -m "feat(phase-7): shell errors cleanly when .root-operator absent (satisfies: R14)"
    ```

---

## Task 10: `new-instance.sh` overhaul   (satisfies: R8, R15, R51)

**Files:**
- Modify: `new-instance.sh`

- [ ] **Step 1: Write the failing test**

    Create or extend `src/test/phase-7-shell-bootstrap.test.ts`:

    ```typescript
    describe("R8/R15/R51: new-instance.sh creates .root-operator and copies operators/+workspace/", () => {
      test("invoking new-instance.sh on b-evaluator-optimizer creates expected layout", () => {
        const instanceName = `_phase7_test_${Date.now()}`;
        try {
          execSync(
            `bash new-instance.sh ${instanceName} interpreters/mas-papers/1-iterative-refinement/b-evaluator-optimizer`,
            { cwd: REPO, encoding: "utf-8" }
          );
          const dir = resolve(REPO, "instances", instanceName);
          // .root-operator exists and contains marker content
          assert.ok(existsSync(join(dir, ".root-operator")), ".root-operator missing");
          const root = readFileSync(join(dir, ".root-operator"), "utf-8").trim();
          assert.match(root, /^operators\/refine\.md$/);
          // operators/ copied
          assert.ok(existsSync(join(dir, "operators", "refine.md")), "operators/refine.md missing");
          assert.ok(existsSync(join(dir, "operators", "evaluate.md")), "operators/evaluate.md missing");
          // PROGRAM.md copied
          assert.ok(existsSync(join(dir, "PROGRAM.md")), "PROGRAM.md missing");
          // No frames/f000-strategy/ created (the shell does this at startup)
          assert.ok(!existsSync(join(dir, "frames", "f000-strategy")), "frames/f000-strategy/ should NOT be pre-created");
          // No .call-stack.json pre-created (the shell creates it at startup)
          assert.ok(!existsSync(join(dir, ".call-stack.json")), ".call-stack.json should NOT be pre-created");
        } finally {
          execSync(`rm -rf instances/${instanceName}`, { cwd: REPO });
        }
      });
    });
    ```

- [ ] **Step 2: Run test to verify it fails**

    Run: `npm run build && npm test 2>&1 | grep -E "phase-7-shell-bootstrap|FAIL"`
    Expected: FAIL — `new-instance.sh` still creates `frames/f000-strategy/` and `.call-stack.json`.

- [ ] **Step 3: Write minimal implementation**

    Edit `new-instance.sh`:
    - Drop the lines that create `frames/f000-strategy/` and copy `INSTRUCTIONS.md` to it (lines 27, 36).
    - Drop the line that initializes `.call-stack.json` (line 133).
    - Add logic that reads `interpreters/<X>/INSTRUCTIONS.md` (now a marker file) and writes its content as `instances/<name>/.root-operator`.
    - Keep the `operators/` copy (rename from `dynamics/` per R8 — already done in T1, but `new-instance.sh` itself references `dynamics/` on line 49 — update).
    - Keep the `workspace/` copy (R51, already supported).
    - Keep the `roles/` copy (existing for ChatDev — no change).

    Concrete diff (illustrative; refer to design.md §Interfaces — `new-instance.sh` delta):

    ```bash
    # Replace these blocks:
    mkdir -p "$DIR/frames/f000-strategy/scoped"
    cp "$INTERP_DIR/INSTRUCTIONS.md" "$DIR/frames/f000-strategy/INSTRUCTIONS.md"

    # With:
    cp "$INTERP_DIR/INSTRUCTIONS.md" "$DIR/.root-operator"

    # Replace:
    if [ -d "$INTERP_DIR/dynamics" ]; then
      cp -r "$INTERP_DIR/dynamics" "$DIR/dynamics"
    fi

    # With:
    if [ -d "$INTERP_DIR/operators" ]; then
      cp -r "$INTERP_DIR/operators" "$DIR/operators"
    fi

    # Drop entirely:
    echo '{"nextCounter":1,"stack":[...]}' > "$DIR/.call-stack.json"
    ```

- [ ] **Step 4: Run test to verify it passes**

    Run: `npm run build && npm test 2>&1 | grep -E "phase-7-shell-bootstrap|FAIL"`
    Expected: PASS for the new R8/R15/R51 assertion.

- [ ] **Step 5: Commit**

    ```bash
    git add new-instance.sh src/test/phase-7-shell-bootstrap.test.ts
    git commit -m "feat(phase-7): new-instance.sh writes .root-operator, copies operators/+workspace, no pre-frames (satisfies: R8, R15, R51)"
    ```

---

## Task 11: Shell-bootstrap test rounding-out   (satisfies: R55)

(Mostly already done across T6–T10 cumulatively. T11 is the cap that asserts the file `phase-7-shell-bootstrap.test.ts` covers all of R11-R19 collectively.)

**Files:**
- Modify: `src/test/phase-7-shell-bootstrap.test.ts` (cap with a discoverability check)

- [ ] **Step 1: Write the failing test**

    Append:

    ```typescript
    describe("R55: phase-7-shell-bootstrap.test.ts covers all bootstrap requirements", () => {
      test("file exists and has assertions for R11-R19", () => {
        const path = resolve(REPO, "src/test/phase-7-shell-bootstrap.test.ts");
        assert.ok(existsSync(path));
        const s = readFileSync(path, "utf-8");
        // Discoverability: each R# from 11-19 mentioned at least once in a describe/test description
        for (const r of [11, 12, 13, 14, 17, 18, 19]) {
          assert.match(s, new RegExp(`R${r}`), `R${r} not pinned in test descriptions`);
        }
      });
    });
    ```

- [ ] **Step 2: Run test to verify it fails / passes**

    Run: `npm test 2>&1 | grep -E "phase-7-shell-bootstrap|FAIL"`
    Expected: PASS if T6-T10 each used the conventional `R<N>:` prefix in their describe blocks. If any R# is missing from the test descriptions, FAIL.

- [ ] **Step 3: Write minimal implementation**

    None needed — fix any test descriptions in earlier tasks if they didn't include the R# prefix.

- [ ] **Step 4: Run test to verify it passes**

    Run: `npm test 2>&1 | grep -E "phase-7-shell-bootstrap|FAIL"`
    Expected: PASS.

- [ ] **Step 5: Commit**

    ```bash
    git add src/test/phase-7-shell-bootstrap.test.ts
    git commit -m "test(phase-7): cap phase-7-shell-bootstrap.test.ts with R# discoverability pin (satisfies: R55)"
    ```

---

## Phase C — Per-interpreter migration (T12–T23)

**Common shape for T12–T23.** All twelve migration tasks follow the same five-step template. Per leaf:

1. **Write a failing test** in the leaf's existing `src/test/phase-N-X.test.ts`:
   - `INSTRUCTIONS.md` is a single-line marker file (R16, R21).
   - `operators/<canonical>.md` exists (R20, R22).
   - The canonical operator has both standalone (`{{program}}`) and AFlow-lite (`{{task}}` + `{{prior_answer}}`) push-arg detection (R47).
   - The canonical operator emits `## Return\nanswer:` at done state (R23).
   - Existing terminal-output sections (`## Refined`, `## Solution`, etc.) are preserved (R24).
   - Internal sub-pushes use `operators/`-relative paths (R25 — already done by T2, just pin).

2. **Run test, expect FAIL.**

3. **Implementation:**
   - `git mv interpreters/<G>/<L>/INSTRUCTIONS.md interpreters/<G>/<L>/operators/<canonical>.md`
   - Edit the canonical operator: add bimodal Initialize prelude (detect `{{program}}` vs `{{task}}` literal-token presence per design.md §Interfaces — Operator file contract — bimodal Initialize); add `## Return\nanswer:` block in the terminal-cycle's MEMORY heredoc.
   - Create new `interpreters/<G>/<L>/INSTRUCTIONS.md` containing exactly `operators/<canonical>.md\n`.

4. **Run test, expect PASS.** Also run the leaf's other tests (e.g. `phase-N-X.test.ts`) and confirm no regressions (R27).

5. **Commit:** `refactor(phase-7): migrate <leaf> to canonical operator + marker INSTRUCTIONS.md (satisfies: R20, R21, R22, R23, R24, R25, R27, R45, R46, R47)`

The per-leaf canonical names are listed in design.md §Architecture — Per-interpreter migration shape (table). The bash bodies for the bimodal Initialize and the `## Return` emission live in design.md §Interfaces — Operator file contract.

The per-leaf tasks (T12 through T23 below) are deliberately terse; each invokes the template above on the named leaf.

---

## Task 12: Migrate 1a self-refine   (satisfies: R20, R21, R22, R23, R24, R25, R27, R45, R46, R47)

Apply the per-interpreter migration template (see Phase C header above) on `interpreters/mas-papers/1-iterative-refinement/a-self-refine/`. Canonical operator: `operators/self-refine.md`. Existing terminal output preserved: `## Refined`. Test file: `src/test/phase-1-self-refine.test.ts`.

Commit: `refactor(phase-7): migrate 1a self-refine to canonical operator + marker INSTRUCTIONS.md (satisfies: R20, R21, R22, R23, R24, R25, R27, R45, R46, R47)`

## Task 13: Migrate 1b evaluator-optimizer   (satisfies: same R#s)

Per-interpreter migration template on `interpreters/mas-papers/1-iterative-refinement/b-evaluator-optimizer/`. Canonical: `operators/refine.md`. Terminal output preserved: `## Refined`, `## Verdict`, `## Feedback`. Test: `src/test/phase-1-evaluator-optimizer.test.ts`.

## Task 14: Migrate 1c reflexion   (satisfies: same R#s)

Template on `interpreters/mas-papers/1-iterative-refinement/c-reflexion/`. Canonical: `operators/reflexion.md`. Terminal output preserved: `## Refined`, `## Verdict`, `## Feedback`, `## Lessons`. Test: `src/test/phase-1-reflexion.test.ts`.

## Task 15: Migrate 1d cove   (satisfies: same R#s)

Template on `interpreters/mas-papers/1-iterative-refinement/d-cove/`. Canonical: `operators/cove.md`. Terminal output preserved: `## Revised`. Test: `src/test/phase-2-cove.test.ts`.

## Task 16: Migrate 2a plan-execute (+ sync 2b/2c byte-equal copies)   (satisfies: R20, R21, R22, R23, R24, R25, R26, R27, R45, R46, R47)

Template on `interpreters/mas-papers/2-planning-decomposition/a-plan-execute/`. Canonical: `operators/plan-execute.md`. Terminal output preserved: `## Result` (and side-effect outputs in `workspace/`). Test: `src/test/phase-3-plan-execute.test.ts`.

**Additional step:** after migrating 2a, propagate the canonical to 2b and 2c byte-equal:

```bash
cp interpreters/mas-papers/2-planning-decomposition/a-plan-execute/operators/plan-execute.md \
   interpreters/mas-papers/2-planning-decomposition/b-orchestrator-workers/operators/plan-execute.md
cp interpreters/mas-papers/2-planning-decomposition/a-plan-execute/operators/plan-execute.md \
   interpreters/mas-papers/2-planning-decomposition/c-deep-research/operators/plan-execute.md
```

(2b's `tackle.md` and `plan.md` already are byte-equal copies; the new canonical operator is `plan-execute.md` which becomes the strategy. Update `INSTRUCTIONS.md` in 2b and 2c to be marker files pointing at `operators/plan-execute.md`.)

Tests `src/test/phase-3-plan-execute.test.ts`, `src/test/phase-3-orchestrator-workers.test.ts`, `src/test/phase-3-deep-research.test.ts` all updated for the marker pattern.

Identity test (renamed `phase-operators-identity.test.ts`) extended to enforce byte-equal `plan-execute.md` across the three leaves.

## Task 17: Migrate 3a tot   (satisfies: same R#s as T12)

Template on `interpreters/mas-papers/3-search/a-tot/`. Canonical: `operators/tot.md`. Terminal output preserved: `## Solution`, `## No Solution Found`. Test: `src/test/phase-6-tot.test.ts`.

## Task 18: Migrate 3b lats   (satisfies: same R#s)

Template on `interpreters/mas-papers/3-search/b-lats/`. Canonical: `operators/lats.md`. Terminal output preserved: `## Solution`, `## No Solution Found`. Test: `src/test/phase-6b-lats.test.ts`.

## Task 19: Migrate 4a debate   (satisfies: same R#s)

Template on `interpreters/mas-papers/4-peer-collaboration/a-debate/`. Canonical: `operators/debate.md`. Terminal output preserved: per debate's existing strategy (`## Final` or `## Transcript`). Test: `src/test/phase-5-debate.test.ts`.

## Task 20: Migrate 5a metagpt   (satisfies: same R#s)

Template on `interpreters/mas-papers/5-fixed-sop-teams/a-metagpt/`. Canonical: `operators/metagpt.md`. Terminal output preserved: `## PRD`, `## Design`, `## Tasks`, `## Code Review`, plus side effects under `workspace/.chatdev/`. Test: `src/test/phase-4-metagpt.test.ts`.

## Task 21: Migrate 5b chatdev   (satisfies: same R#s)

Template on `interpreters/mas-papers/5-fixed-sop-teams/b-chatdev/`. Canonical: `operators/chatdev.md`. Terminal output preserved: existing chatdev outputs + `workspace/` artefacts. Test: `src/test/phase-4-chatdev.test.ts`.

## Task 22 (placeholder — slot reserved; combined with T23 below)

Slot reserved for any per-leaf migration follow-up that surfaces during execution.

## Task 23: AFlow-lite scaffolding (group + leaf dirs, README skeleton, test-file skeleton)   (satisfies: R1, R2, R3, R34)

**Files:**
- Create: `interpreters/mas-papers/7-meta-framework/README.md` (group-level)
- Create: `interpreters/mas-papers/7-meta-framework/a-aflow-lite/INSTRUCTIONS.md` (single-line marker)
- Create: `interpreters/mas-papers/7-meta-framework/a-aflow-lite/PROGRAM.md` (skeleton; full content in T26)
- Create: `interpreters/mas-papers/7-meta-framework/a-aflow-lite/README.md` (skeleton; full content in T35)
- Create: `interpreters/mas-papers/7-meta-framework/a-aflow-lite/operators/` (directory)
- Create: `src/test/phase-7-aflow-lite.test.ts`

- [ ] **Step 1: Write the failing test**

    Create `src/test/phase-7-aflow-lite.test.ts` with directory-layout assertions per design.md §Test strategy — Directory layout. Move the rename-completeness pin (R10) from `_phase-7-rename.test.ts` here, and delete the scratch test file at the end.

- [ ] **Step 2-5: standard TDD cycle**

    Run, expect FAIL on directory existence; create the directories + skeleton files; verify PASS; commit:

    ```
    git commit -m "feat(phase-7): bootstrap aflow-lite dir + group README + test file (satisfies: R1, R2, R3, R34)"
    ```

---

## Phase D — AFlow-lite (T24–T35)

## Task 24: Copy reused operators byte-equal into aflow-lite   (satisfies: R26, R34)

**Files:**
- Create: `interpreters/mas-papers/7-meta-framework/a-aflow-lite/operators/{refine.md,reflexion.md,cove.md,plan-execute.md,debate.md,evaluate.md,reflect.md,verify.md,answer-independently.md,tackle.md,plan.md,opine.md}` (byte-equal copies of canonical sources)

Standard cp pattern (analogous to Phase 6b T8). Add byte-equality assertions to `phase-7-aflow-lite.test.ts`. Commit: `feat(phase-7): copy 12 reused operators byte-equal into aflow-lite (satisfies: R26, R34)`.

## Task 25: Identity test extension for new aflow-lite copies   (satisfies: R26, R53)

**Files:**
- Modify: `src/test/phase-operators-identity.test.ts`

Extend the existing `EVALUATE_PATHS`, `REFLECT_PATHS`, `EXPAND_NODE_PATHS`, `PLAN_EXECUTE_PATHS` arrays with aflow-lite paths; add new `REFINE_PATHS`, `REFLEXION_PATHS`, `COVE_PATHS`, `DEBATE_PATHS`, `TACKLE_PATHS`, `PLAN_PATHS`, `VERIFY_PATHS`, `ANSWER_INDEPENDENTLY_PATHS`, `OPINE_PATHS` arrays with describe blocks per the pattern in design.md §Test strategy — `src/test/phase-operators-identity.test.ts`. Commit: `test(phase-7): identity tests cover aflow-lite operator copies (satisfies: R26, R53)`.

## Task 26: Demo PROGRAM.md + workspace/gsm8k.jsonl fixture   (satisfies: R48, R49)

**Files:**
- Create: `interpreters/mas-papers/7-meta-framework/a-aflow-lite/PROGRAM.md` (full content per design.md)
- Create: `interpreters/mas-papers/7-meta-framework/a-aflow-lite/workspace/gsm8k.jsonl` (20 items)

The 20 items are hand-curated from the GSM8K test split. Each line is `{"question": "...", "answer": <integer>}`. Cite the dataset source (Cobbe et al. 2021, arXiv:2110.14168) in the leaf README. Add fixture-format assertions to `phase-7-aflow-lite.test.ts`. Commit: `feat(phase-7): GSM8K demo PROGRAM.md + 20-item fixture (satisfies: R48, R49)`.

## Task 27: aflow-lite.md preamble + Initialize (incl. fixture loading + sampling)   (satisfies: R28, R29, R30, R31, R36, R50)

**Files:**
- Create: `interpreters/mas-papers/7-meta-framework/a-aflow-lite/operators/aflow-lite.md`

Body: strategy preamble (scoped files list, library hardcoded as `LIBRARY="refine,reflexion,cove,plan-execute,debate"`, tree ledger schema), then Initialize instruction that:
- Copies `../../PROGRAM.md` to `./scoped/task.md`.
- Writes `max_iterations.md` (10), `uct_c.md` (1.41421356), `iter_count.md` (0).
- Loads `../../workspace/gsm8k.jsonl`, samples 3 items deterministically (seed = first character codepoint of fixture file's first line, or similar reproducible scheme), persists to `./scoped/benchmark_items.md`.
- Appends root n0 to `./scoped/tree.md` and creates empty `./scoped/state-n0.md` (root workflow is the empty list).
- Transitions to `selecting`.

Add Initialize-specific assertions to `phase-7-aflow-lite.test.ts`. Commit: `feat(phase-7): aflow-lite preamble + Initialize (fixture loading, deterministic sampling) (satisfies: R28, R29, R30, R31, R36, R50)`.

## Task 28: aflow-lite.md tree ledger primitives   (satisfies: R29)

Inherit verbatim from Phase 6b LATS (post-rename). Same Append-node, Update-field, Walk-parents primitives. Commit: `feat(phase-7): aflow-lite tree ledger primitives (Phase 6b reuse) (satisfies: R29)`.

## Task 29: aflow-lite.md Compose-partial-state (recent_scores composition)   (satisfies: R32)

Adapt Phase 6b's compose_partial_state to assemble: `current_workflow_recipe + library + recent_scores`. The result is the `partial_state` push-arg for `expand-workflow.md`. Commit.

## Task 30: aflow-lite.md Select instruction + UCT   (satisfies: R29)

Verbatim Phase 6b LATS Select instruction. Commit.

## Task 31: aflow-lite.md Expand-push + Expand-absorb (workflow children)   (satisfies: R32)

Expand-push: push `expand-workflow.md`. Expand-absorb: parse the returned `## Children` (5 single-line workflow recipes), append nodes, write per-node `state-<id>.md` files containing each child's recipe. Set `chosen_child` to leftmost. R50-pattern fallback for malformed expansions. Commit.

## Task 32: New `expand-workflow.md` operator   (satisfies: R41, R42, R43, R44)

Create `interpreters/mas-papers/7-meta-framework/a-aflow-lite/operators/expand-workflow.md` with the body specified in design.md §Interfaces — `expand-workflow.md` contract. Test assertions: push-args, single-cycle, no further pushes, `## Return: children: |` shape, domain-agnostic vocabulary (R43). Commit.

## Task 33: aflow-lite.md Simulate-push + per-item workflow execution loop   (satisfies: R33, R35)

Simulate-push: for each of 3 benchmark items, sequentially push each operator in the candidate workflow's recipe with `{{task}}` (item's question) + `{{prior_answer}}` (previous operator's `## Answer`, empty for first). After the last operator pops, capture `## Answer` and extract integer via `[-+]?\d+` regex (last match). Compare to expected; record per-item score. After all 3 items, mean reward. Commit.

## Task 34: aflow-lite.md Evaluate-absorb + back-prop + termination   (satisfies: R37, R38, R39, R40, R65, R66, R72)

Verdict mapping (per-item score → 0/1 → mean reward 0-1). Back-prop using Phase 6b's primitive. On reward == 1.0 → emit `## Solution` (best workflow + its score) + `## Return\nanswer:` + `done`. Else iter_count++; if `iter_count >= max_iterations` → `## No Solution Found` + `## Return\nanswer:` + `done`. Else → `selecting`. No reflect.md push (R39). No nested shell instances (R66). No `## Aflow Answer` tag (R72 — just standard `## Return\nanswer:`). Commit.

## Task 35: aflow-lite negative-requirement pins   (satisfies: R31, R39, R40, R61, R62, R63, R64, R65, R66, R70, R71, R72)

Append a describe block `phase-7-aflow-lite.test.ts: negative pins (R61–R72)` with assertions:
- `aflow-lite.md` library is exactly `refine,reflexion,cove,plan-execute,debate` (no MoA, no self-refine, no tot, no lats, no metagpt, no chatdev).
- `aflow-lite.md` does not contain `## Push.*reflect.md` (no meta-reflexion).
- `aflow-lite.md` does not spawn child processes (no `node`, `spawn`, `execFile` references).
- `aflow-lite.md` does not contain `xargs -P`, `parallel`, trailing `&` (no concurrency).
- `aflow-lite.md` does not contain `GSM8K`, `math`, etc. except in a single explicit "demo-specific" comment block.
- `aflow-lite.md` does not contain `## Aflow Answer` (just the canonical `## Return\nanswer:`).
- Aflow-lite's `operators/` does not contain `score.md`, `expand-node.md`, `rollout.md`, `tot.md`, `lats.md`, `metagpt.md`, `chatdev.md`, `self-refine.md`.

Commit: `test(phase-7): negative-requirement pins for aflow-lite (no MoA, no meta-reflexion, no concurrency, no domain vocab, etc.) (satisfies: R31, R39, R40, R61, R62, R63, R64, R65, R66, R70, R71, R72)`.

## Task 36: aflow-lite + group READMEs full content + smoke check   (satisfies: R2, R3)

**Files:**
- Modify: `interpreters/mas-papers/7-meta-framework/README.md` (group)
- Modify: `interpreters/mas-papers/7-meta-framework/a-aflow-lite/README.md` (leaf)

Replace skeleton READMEs with full content. Group README: cite Zhang et al. arXiv:2410.10762, list AFlow-lite as the only currently shipped variant. Leaf README: full content per requirements R3 (citation, architectural overview, operator library list with rationale, MCTS state machine summary, demo description, run-it section, Notable behaviour). Test assertions for content. Commit: `docs(phase-7): aflow-lite + group READMEs full content + smoke check (satisfies: R2, R3)`.

---

## Phase E — Documentation polish (T37–T42)

## Task 37: Source-spec parent doc updates   (satisfies: R56)

**Files:**
- Modify: `docs/agent-workflows/requirements.md`

Updates:
1. Section heading "Reusable dynamics library" → "Reusable operators library".
2. New row in the table: `expand-workflow.md | 7 | ## Partial State, ## Task | ## Children | 1`.
3. Phase 7 section rewrite per design.md §Architecture — Source-spec mutation.

Test: regex assertions on the updated parent doc. Commit: `docs(phase-7): parent doc updates — operators library heading, expand-workflow row, Phase 7 section rewrite (satisfies: R56)`.

## Task 38: `interpreters/README.md` updates   (satisfies: R57)

Modify `interpreters/README.md`:
- Replace "dynamics" → "operators" terminology.
- Operator-shortlist updated to list the actual five v1 operators; mention MoA as future scope.
- New "Phase 7 — Meta-frameworks" section in the family tour.
- Execution-context section gains a paragraph about root-operator bootstrap.

Test: regex assertions. Commit.

## Task 39: `CLAUDE.md` updates   (satisfies: R58)

Updates per design.md §Architecture — CLAUDE.md delta:
- "Dynamics (Call Stack)" → "Operators (Call Stack)" + prose.
- New "Root-operator bootstrap" section.
- Instance Layout diagram updated.
- Code-block examples updated.

Test: regex assertions. Commit.

## Task 40: Per-leaf README delta for migrated interpreters   (satisfies: R59)

For each of the 12 migrated leaves (1a, 1b, 1c, 1d, 2a/b/c, 3a, 3b, 4a, 5a, 5b), update the per-leaf README:
- Path references rename.
- Strategy-living-in-INSTRUCTIONS.md note updated to mention the marker pattern + canonical operator location.
- No semantic changes to behaviour descriptions.

Test: regex assertions per leaf. Single commit covering all 12 updates: `docs(phase-7): per-leaf README rename + marker pattern note (satisfies: R59)`.

## Task 41: Per-group README updates   (satisfies: R60)

For the 5 group READMEs (`interpreters/<group>/README.md`), apply the rename and any post-refactor tweaks. Single commit: `docs(phase-7): per-group README rename (satisfies: R60)`.

## Task 42: Backwards-compat pins   (satisfies: R67, R68, R69)

**Files:**
- Modify: `src/test/phase-7-aflow-lite.test.ts`

Add a describe block:
- R67 pin: `src/main.ts` does NOT contain a fallback path that loads `frames/f000-strategy/INSTRUCTIONS.md` when `.root-operator` is absent.
- R68 pin: pre-existing instances under `instances/` are not deleted by anything in this spec (test by checking that `instances/` exists post-build if it did pre-build; soft test — describe-skip if fresh checkout).
- R69 pin: Phase 1, 2, 2b, 3+4, 6, 6b spec dirs still exist with their key R# IDs intact (analogous to Phase 6b R28/R85 pattern from `phase-6b-lats.test.ts`).

Commit: `test(phase-7): backwards-compat pins (no shell fallback, instances preserved, frozen specs unchanged) (satisfies: R67, R68, R69)`.

## Task 43: Behaviour regression smoke checks   (satisfies: R27)

**Files:**
- Modify: leaf READMEs' Run-it sections (already done in T40); the runner script is what's covered here.

For each migrated standalone interpreter, ensure its existing per-phase test (`phase-N-X.test.ts`) was updated in Phase A's T4 to assert against the new layout (marker INSTRUCTIONS.md + operator under `operators/`). The behaviour assertions in those tests (which already pin the strategy's structural contract) carry the regression burden. R27 is satisfied if all phase-N-X.test.ts files pass after the migration, with no semantic drift.

This task adds one cross-cutting assertion to `phase-7-aflow-lite.test.ts`:

```typescript
test("R27: every migrated interpreter's INSTRUCTIONS.md is a marker file pointing at operators/<x>.md", () => {
  const leaves = [
    "1-iterative-refinement/a-self-refine",
    "1-iterative-refinement/b-evaluator-optimizer",
    "1-iterative-refinement/c-reflexion",
    "1-iterative-refinement/d-cove",
    "2-planning-decomposition/a-plan-execute",
    "2-planning-decomposition/b-orchestrator-workers",
    "2-planning-decomposition/c-deep-research",
    "3-search/a-tot",
    "3-search/b-lats",
    "4-peer-collaboration/a-debate",
    "5-fixed-sop-teams/a-metagpt",
    "5-fixed-sop-teams/b-chatdev",
    "7-meta-framework/a-aflow-lite",
  ];
  for (const leaf of leaves) {
    const inst = readFileSync(resolve(REPO, "interpreters", leaf, "INSTRUCTIONS.md"), "utf-8");
    assert.match(inst.trim(), /^operators\/[a-z0-9_-]+\.md$/, `${leaf}/INSTRUCTIONS.md is not a marker file: ${inst}`);
  }
});
```

Commit: `test(phase-7): cross-cutting marker-file pin for all migrated leaves (satisfies: R27)`.
