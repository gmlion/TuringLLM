# Tasks: agent-workflows-phase-6

> **For executors:** use `kiro-flow:spec-execute` (it wraps `superpowers:subagent-driven-development` or `superpowers:executing-plans`). Each task below is TDD-shaped — write the failing test first, then minimal code, then verify, then commit. Commit messages must reference the task's `(satisfies: R#)` tag.

> **Note on shape:** this interpreter is delivered primarily as markdown artifacts (INSTRUCTIONS.md, dynamics/*.md, README.md, PROGRAM.md). The "failing test" in each task is a regex-pattern assertion against the (yet-to-be-written) markdown — the same shape `src/test/phase-5-debate.test.ts` uses. Tests pin the structural contract; the implementation step writes the markdown that satisfies the contract. All bash pseudocode bodies referenced below are specified in full in `docs/specs/2026-04-30-agent-workflows-phase-6/design.md`; executors should copy those bodies verbatim where this file says "the body specified in design.md §<section>".

> **Build/test commands:** the repo uses `npm test` (which runs `npm run build` first). To narrow output to phase-6 results during TDD: `npm test 2>&1 | grep -E "phase-6|FAIL|✘"`. After writing markdown, no rebuild is needed (tests load markdown via `readFileSync`), but `npm test` still rebuilds TypeScript — that's expected.

## Task index

| #   | Summary                                                          | Satisfies                                |
| --- | ---------------------------------------------------------------- | ---------------------------------------- |
| T1  | Bootstrap: directory layout + group README + test file skeleton  | R1, R2, R51                              |
| T2  | `evaluate.md` byte-equal copy + identity test extension          | R45, R46                                 |
| T3  | Strategy preamble + Initialize + scoped files                    | R5, R6, R7, R8, R9                       |
| T4  | Tree ledger contract: 8 keys, 4 status values, surgical edits    | R10, R11, R12, R13, R14                  |
| T5  | `expand-node.md` dynamic                                         | R38, R39, R40                            |
| T6  | Expand-push + Expand-absorb + Phase-router                       | R15, R16, R17, R18, R47                  |
| T7  | `score.md` dynamic                                               | R41, R42, R43                            |
| T8  | Score-push + Score-absorb (weight mapping, malformed labels)     | R19, R20, R21, R22, R23, R44             |
| T9  | Prune instruction (top-b, R37 dead-end)                          | R24, R25, R37                            |
| T10 | Advance instruction                                              | R26, R27                                 |
| T11 | Goal-push + Goal-absorb (parent-walk, terminal evaluation)       | R28, R29, R30, R31, R32, R33, R34        |
| T12 | Solved instruction                                               | R35, R36                                 |
| T13 | Demo `PROGRAM.md` (Game of 24)                                   | R48, R49                                 |
| T14 | Negative-requirement pins                                        | R52, R53, R54, R55, R56, R57             |
| T15 | Leaf README full content + smoke-check note                      | R3, R50                                  |
| T16 | Source-spec dynamics-table update                                | R4                                       |

---

## Task 1: Bootstrap directory layout, group README, test-file skeleton   (satisfies: R1, R2, R51)

**Files:**
- Create: `interpreters/mas-papers/3-search/README.md`
- Create: `interpreters/mas-papers/3-search/a-tot/INSTRUCTIONS.md` (skeleton — full body in T3)
- Create: `interpreters/mas-papers/3-search/a-tot/PROGRAM.md` (skeleton — full content in T13)
- Create: `interpreters/mas-papers/3-search/a-tot/README.md` (skeleton — full body in T15)
- Create: `interpreters/mas-papers/3-search/a-tot/dynamics/` (directory)
- Create: `src/test/phase-6-tot.test.ts`

- [ ] **Step 1: Write the failing test**

    Create `src/test/phase-6-tot.test.ts` with the directory/group-README assertions:

    ```typescript
    import { test, describe } from "node:test";
    import { strict as assert } from "node:assert";
    import { existsSync, readFileSync, readdirSync } from "fs";
    import { resolve, dirname } from "path";
    import { fileURLToPath } from "url";

    const __filename = fileURLToPath(import.meta.url);
    const __dirname = dirname(__filename);
    const REPO = resolve(__dirname, "../..");
    const GROUP = resolve(REPO, "interpreters/mas-papers/3-search");
    const INTERP = resolve(GROUP, "a-tot");

    describe("phase-6 a-tot: directory layout (R1)", () => {
      test("group dir interpreters/mas-papers/3-search/ exists", () => {
        assert.ok(existsSync(GROUP), "group directory missing");
      });
      test("interpreter dir interpreters/mas-papers/3-search/a-tot/ exists (R1)", () => {
        assert.ok(existsSync(INTERP), "interpreter directory missing");
      });
      test("interpreter has INSTRUCTIONS.md, PROGRAM.md, README.md, dynamics/ (R1)", () => {
        for (const f of ["INSTRUCTIONS.md", "PROGRAM.md", "README.md"]) {
          assert.ok(existsSync(resolve(INTERP, f)), `${f} missing`);
        }
        assert.ok(existsSync(resolve(INTERP, "dynamics")), "dynamics/ missing");
      });
    });

    describe("phase-6 a-tot: group README (R2)", () => {
      test("group README at interpreters/mas-papers/3-search/README.md exists", () => {
        assert.ok(existsSync(resolve(GROUP, "README.md")), "group README missing");
      });
      test("group README mentions ToT (shipped), GoT (deferred), LATS (Phase 6b)", () => {
        const s = readFileSync(resolve(GROUP, "README.md"), "utf-8");
        assert.match(s, /Tree of Thoughts|ToT/);
        assert.match(s, /Graph of Thoughts|GoT/);
        assert.match(s, /LATS/);
      });
      test("group README cites Yao et al. and Besta et al. and Zhou et al.", () => {
        const s = readFileSync(resolve(GROUP, "README.md"), "utf-8");
        assert.match(s, /Yao\s+et\s+al/i);
        assert.match(s, /Besta\s+et\s+al/i);
        assert.match(s, /Zhou\s+et\s+al/i);
      });
    });
    ```

- [ ] **Step 2: Run test to verify it fails**

    Run: `npm test 2>&1 | grep -E "phase-6|FAIL"`
    Expected: FAIL with substring `group directory missing` (or compile error if the test file references paths that don't exist; in either case, the test must visibly fail before implementation).

- [ ] **Step 3: Write minimal implementation**

    Create the directory `interpreters/mas-papers/3-search/a-tot/dynamics/` (empty for now). Create the group README:

    ```markdown
    # Group 3 — Search

    Pattern family: explicit exploration over alternative partial solutions, distinct from iterative refinement (Group 1) and decomposition (Group 2). See `docs/agent-workflows/patterns.md` § Group 3.

    ## Variants

    | Variant                      | Status              | Pattern                       | Source                                                  |
    | ---------------------------- | ------------------- | ----------------------------- | ------------------------------------------------------- |
    | `a-tot/`                     | Shipped (Phase 6)   | Tree of Thoughts              | Yao et al., NeurIPS 2023, arXiv:2305.10601              |
    | `b-got/`                     | Deferred            | Graph of Thoughts             | Besta et al., 2023, arXiv:2308.09687                    |
    | `interpreters/lats/` (out)   | Planned (Phase 6b)  | Language Agent Tree Search    | Zhou et al., 2023, arXiv:2310.04406                     |

    ## Shared dynamics

    `expand-node.md` and `score.md` (introduced by `a-tot/`) are normative for the Search group going forward. LATS (Phase 6b) is expected to import both unmodified.
    ```

    Create skeleton interpreter files (they will be filled in by later tasks):

    `interpreters/mas-papers/3-search/a-tot/INSTRUCTIONS.md`:

    ```markdown
    # Strategy: Tree of Thoughts

    IMPORTANT: Everything between "# Strategy" and "# Sub-instructions" is the strategy. It must be copied VERBATIM into every update_instructions call. Never modify, summarize, or omit any strategy instruction. Only the "# Sub-instructions" section below changes.

    (strategy body added in T3, T6, T8, T9, T10, T11, T12)

    # Sub-instructions

    (none — this interpreter needs none.)
    ```

    `interpreters/mas-papers/3-search/a-tot/PROGRAM.md`:

    ```markdown
    (puzzle prose added in T13)
    ```

    `interpreters/mas-papers/3-search/a-tot/README.md`:

    ```markdown
    # a — Tree of Thoughts

    *Yao et al., NeurIPS 2023, arXiv:2305.10601. See `docs/agent-workflows/patterns.md` §Group 3.*

    (full content added in T15)
    ```

- [ ] **Step 4: Run test to verify it passes**

    Run: `npm test 2>&1 | grep -E "phase-6|FAIL|✘"`
    Expected: PASS for all five tests added in Step 1; no FAIL output for phase-6.

- [ ] **Step 5: Commit**

    ```bash
    git add interpreters/mas-papers/3-search/ src/test/phase-6-tot.test.ts
    git commit -m "feat(phase-6): bootstrap interpreter dir + group README + test file (satisfies: R1, R2, R51)"
    ```

---

## Task 2: `evaluate.md` byte-equal copy + identity test extension   (satisfies: R45, R46)

**Files:**
- Create: `interpreters/mas-papers/3-search/a-tot/dynamics/evaluate.md` (byte-equal copy)
- Modify: `src/test/phase-operators-identity.test.ts`
- Modify: `src/test/phase-6-tot.test.ts` (append assertions)

- [ ] **Step 1: Write the failing test**

    First, extend `src/test/phase-operators-identity.test.ts` by appending one path to the `EVALUATE_PATHS` array:

    ```typescript
    // Replace the existing EVALUATE_PATHS array with:
    const EVALUATE_PATHS = [
      "interpreters/mas-papers/1-iterative-refinement/b-evaluator-optimizer/dynamics/evaluate.md",
      "interpreters/mas-papers/1-iterative-refinement/c-reflexion/dynamics/evaluate.md",
      "interpreters/mas-papers/5-fixed-sop-teams/a-metagpt/dynamics/evaluate.md",
      "interpreters/mas-papers/5-fixed-sop-teams/b-chatdev/dynamics/evaluate.md",
      "interpreters/mas-papers/3-search/a-tot/dynamics/evaluate.md",
    ];
    ```

    Then append to `src/test/phase-6-tot.test.ts`:

    ```typescript
    describe("phase-6 a-tot: evaluate.md reuse (R45)", () => {
      test("dynamics/evaluate.md exists in a-tot", () => {
        assert.ok(
          existsSync(resolve(INTERP, "dynamics/evaluate.md")),
          "evaluate.md missing in a-tot/dynamics/",
        );
      });
      test("dynamics/evaluate.md is byte-equal to canonical 1b copy (R45)", () => {
        const canon = readFileSync(
          resolve(REPO, "interpreters/mas-papers/1-iterative-refinement/b-evaluator-optimizer/dynamics/evaluate.md"),
        );
        const here = readFileSync(resolve(INTERP, "dynamics/evaluate.md"));
        assert.ok(canon.equals(here), "evaluate.md diverged from canonical");
      });
    });
    ```

- [ ] **Step 2: Run test to verify it fails**

    Run: `npm test 2>&1 | grep -E "phase-6|phase-operators-identity|FAIL"`
    Expected: FAIL with substring `evaluate.md missing in a-tot/dynamics/` and FAIL in the identity test for "evaluate.md diverged between … and interpreters/mas-papers/3-search/a-tot/dynamics/evaluate.md".

- [ ] **Step 3: Write minimal implementation**

    Copy the canonical `evaluate.md` byte-equal to the new path. From the repo root:

    ```bash
    cp interpreters/mas-papers/1-iterative-refinement/b-evaluator-optimizer/dynamics/evaluate.md \
       interpreters/mas-papers/3-search/a-tot/dynamics/evaluate.md
    ```

- [ ] **Step 4: Run test to verify it passes**

    Run: `npm test 2>&1 | grep -E "phase-6|phase-operators-identity|FAIL"`
    Expected: PASS for both `evaluate.md exists in a-tot` and the byte-equal assertions; no FAIL output.

- [ ] **Step 5: Commit**

    ```bash
    git add interpreters/mas-papers/3-search/a-tot/dynamics/evaluate.md \
            src/test/phase-operators-identity.test.ts \
            src/test/phase-6-tot.test.ts
    git commit -m "feat(phase-6): copy evaluate.md byte-equal + extend identity test (satisfies: R45, R46)"
    ```

---

## Task 3: Strategy preamble + Initialize instruction + scoped files   (satisfies: R5, R6, R7, R8, R9)

**Files:**
- Modify: `interpreters/mas-papers/3-search/a-tot/INSTRUCTIONS.md`
- Modify: `src/test/phase-6-tot.test.ts` (append assertions)

- [ ] **Step 1: Write the failing test**

    Append to `src/test/phase-6-tot.test.ts`:

    ```typescript
    function escapeRegExp(s: string) {
      return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    }

    function extractInstructionBody(src: string, name: string): string {
      const startRe = new RegExp(`^## Instruction:\\s*${escapeRegExp(name)}\\b`, "m");
      const m = src.match(startRe);
      if (!m) return "";
      const start = m.index! + m[0].length;
      const rest = src.slice(start);
      const endRe = /^(## Instruction:|# Sub-instructions)/m;
      const e = rest.match(endRe);
      return e ? rest.slice(0, e.index!) : rest;
    }

    describe("phase-6 a-tot: strategy preamble (structural)", () => {
      test("strategy is bounded by # Strategy / # Sub-instructions and is verbatim-required", () => {
        const s = readFileSync(resolve(INTERP, "INSTRUCTIONS.md"), "utf-8");
        assert.match(s, /^# Strategy/m);
        assert.match(s, /^# Sub-instructions/m);
        assert.match(s, /VERBATIM into every update_instructions call/);
      });
    });

    describe("phase-6 a-tot: Initialize instruction (R5–R9)", () => {
      test("Initialize matches state == empty (R5)", () => {
        const s = readFileSync(resolve(INTERP, "INSTRUCTIONS.md"), "utf-8");
        const init = extractInstructionBody(s, "Initialize");
        assert.ok(init.length > 0, "Initialize instruction missing");
        assert.match(init, /MEMORY state is "empty"/);
      });
      test("Initialize references PROGRAM.md (R5)", () => {
        const s = readFileSync(resolve(INTERP, "INSTRUCTIONS.md"), "utf-8");
        const init = extractInstructionBody(s, "Initialize");
        assert.match(init, /\.\.\/\.\.\/PROGRAM\.md/);
      });
      test("Initialize handles insufficient input via Pending Questions + waiting_for_user (R6)", () => {
        const s = readFileSync(resolve(INTERP, "INSTRUCTIONS.md"), "utf-8");
        const init = extractInstructionBody(s, "Initialize");
        assert.match(init, /## Pending Questions/);
        assert.match(init, /waiting_for_user/);
      });
      test("Initialize writes scoped/{numbers,target,max_depth,current_depth}.md (R7)", () => {
        const s = readFileSync(resolve(INTERP, "INSTRUCTIONS.md"), "utf-8");
        const init = extractInstructionBody(s, "Initialize");
        for (const f of ["numbers.md", "target.md", "max_depth.md", "current_depth.md"]) {
          assert.match(init, new RegExp(`scoped/${escapeRegExp(f)}`), `Initialize missing scoped/${f}`);
        }
      });
      test("Initialize derives max_depth = N − 1 (R7)", () => {
        const s = readFileSync(resolve(INTERP, "INSTRUCTIONS.md"), "utf-8");
        const init = extractInstructionBody(s, "Initialize");
        assert.match(init, /N\s*-\s*1|count\s*-\s*1|wc\s+-w/);
      });
      test("Initialize appends root node n0 with parent_id=- depth=0 status=live (R8)", () => {
        const s = readFileSync(resolve(INTERP, "INSTRUCTIONS.md"), "utf-8");
        const init = extractInstructionBody(s, "Initialize");
        assert.match(init, /id:\s*n0/);
        assert.match(init, /parent_id:\s*-/);
        assert.match(init, /depth:\s*0/);
        assert.match(init, /status:\s*live/);
      });
      test("Initialize transitions to expanding with current_depth 0 (R9)", () => {
        const s = readFileSync(resolve(INTERP, "INSTRUCTIONS.md"), "utf-8");
        const init = extractInstructionBody(s, "Initialize");
        assert.match(init, /## State\s*\n\s*expanding/);
      });
    });
    ```

- [ ] **Step 2: Run test to verify it fails**

    Run: `npm test 2>&1 | grep -E "phase-6|FAIL"`
    Expected: FAIL with substring `Initialize instruction missing` (and the related assertion failures).

- [ ] **Step 3: Write minimal implementation**

    Edit `interpreters/mas-papers/3-search/a-tot/INSTRUCTIONS.md`. Replace the placeholder line `(strategy body added in T3 …)` with the strategy overview prose followed by the `## Instruction: Initialize` block. The full Instruction body is specified verbatim in `design.md §Interfaces — Initialize`. Paste that body, ensuring all of the patterns the test asserts are present.

    The strategy overview prose to insert just below the IMPORTANT line:

    ```markdown
    This interpreter implements Tree of Thoughts (Yao et al., 2023; patterns.md Group 3 — Search). The strategy is a level-wise BFS controller over partial Game-of-24 states. At each depth it pushes `expand-node.md` for every live unexpanded node (k=5 children each), pushes `score.md` 3× per child (sure/likely/impossible labels weighted 20/1/0.001 and summed), prunes to top b=5 by summed value, advances depth. At depth = max_depth (= len(numbers) − 1), terminal candidates are pushed to `evaluate.md` for pass/fail goal-checking. The growing tree lives in `./scoped/tree.md` as an append-only YAML-block ledger; field updates use awk-based surgical edits.

    Scoped files (in this strategy frame's `./scoped/`):

    - `./scoped/numbers.md` — space-separated puzzle integers; written once at Initialize.
    - `./scoped/target.md` — single integer target; written once at Initialize.
    - `./scoped/max_depth.md` — single integer max_depth = N − 1; written once at Initialize.
    - `./scoped/current_depth.md` — single integer; bumped by Advance.
    - `./scoped/cursor.md` — id of the node being acted on this dispatch.
    - `./scoped/tree.md` — the YAML-block ledger (R10–R14).
    - `./scoped/staged/{parent_thought,numbers_remaining,thought,attempt,criterion}.md` — push-arg staging files.
    ```

    Then append the Initialize block (full bash body per design.md §Initialize):

    ```markdown
    ## Instruction: Initialize
    **Condition:** MEMORY state is "empty"
    **Action:** Read `../../PROGRAM.md` and parse integers from prose. The convention is "puzzle numbers, then target": the LAST integer encountered is the target; the rest are the puzzle numbers.

        mkdir -p ./scoped/staged

        NUMBERS_ALL=$(grep -oE '\b[0-9]+\b' ../../PROGRAM.md | head -n 5 | tr '\n' ' ')
        COUNT=$(echo $NUMBERS_ALL | wc -w)

    Validate: at least 2 puzzle numbers + 1 target ⇒ COUNT ≥ 3. If fewer, append a non-blocking `## Pending Questions` and pause (R6):

        cat > ./MEMORY.md << 'INIT_FAIL_EOF'
        ## State
        waiting_for_user
        ## Matched Instruction
        Initialize (insufficient input)
        ## Last Action
        PROGRAM.md does not contain at least 2 puzzle numbers and a target; pausing for input.
        ## Result
        Awaiting puzzle definition.
        ## Pending Questions
        - Q1: Please ensure PROGRAM.md states the puzzle numbers and the target as integers in prose (e.g. "Use 4, 5, 6, and 10 to make 24").
        INIT_FAIL_EOF

    Otherwise, persist parsed values, derive max_depth, write the root node:

        TARGET=$(echo $NUMBERS_ALL | awk '{print $NF}')
        PUZZLE=$(echo $NUMBERS_ALL | awk '{$NF=""; print}' | sed 's/ *$//')
        N=$(echo $PUZZLE | wc -w)
        MAX_DEPTH=$((N - 1))

        echo "$PUZZLE"    > ./scoped/numbers.md
        echo "$TARGET"    > ./scoped/target.md
        echo "$MAX_DEPTH" > ./scoped/max_depth.md
        echo 0            > ./scoped/current_depth.md

        cat > ./scoped/tree.md << ROOT_EOF
        ---
        id: n0
        parent_id: -
        depth: 0
        op: -
        left: $PUZZLE
        value: 0
        samples: 0
        status: live
        ROOT_EOF

    Then wholesale-rewrite MEMORY (R9):

        cat > ./MEMORY.md << 'INIT_OK_EOF'
        ## State
        expanding
        ## Matched Instruction
        Initialize
        ## Last Action
        Parsed PROGRAM.md; persisted scoped/{numbers,target,max_depth,current_depth}.md and seeded scoped/tree.md with root n0.
        ## Result
        Initialization complete; current_depth=0; ready to expand the root.
        INIT_OK_EOF
    ```

- [ ] **Step 4: Run test to verify it passes**

    Run: `npm test 2>&1 | grep -E "phase-6|FAIL"`
    Expected: PASS for all phase-6 strategy-preamble and Initialize tests.

- [ ] **Step 5: Commit**

    ```bash
    git add interpreters/mas-papers/3-search/a-tot/INSTRUCTIONS.md src/test/phase-6-tot.test.ts
    git commit -m "feat(phase-6): strategy preamble + Initialize instruction (satisfies: R5, R6, R7, R8, R9)"
    ```

---

## Task 4: Tree ledger contract — keys, status enum, surgical-edit primitives   (satisfies: R10, R11, R12, R13, R14)

**Files:**
- Modify: `src/test/phase-6-tot.test.ts` (append assertions)
- (No code change — the schema is enforced by the test as a structural contract that all subsequent instructions must observe.)

- [ ] **Step 1: Write the failing test**

    Append to `src/test/phase-6-tot.test.ts`:

    ```typescript
    describe("phase-6 a-tot: tree ledger contract (R10–R14)", () => {
      const s = readFileSync(resolve(INTERP, "INSTRUCTIONS.md"), "utf-8");

      test("INSTRUCTIONS.md declares all 8 required node-block keys (R11)", () => {
        for (const key of ["id:", "parent_id:", "depth:", "op:", "left:", "value:", "samples:", "status:"]) {
          assert.match(s, new RegExp(escapeRegExp(key)), `tree.md schema missing key ${key}`);
        }
      });

      test("INSTRUCTIONS.md declares the four status values (R14)", () => {
        for (const status of ["live", "pruned", "terminal_pass", "terminal_fail"]) {
          assert.match(s, new RegExp(`\\b${escapeRegExp(status)}\\b`), `status value ${status} not declared`);
        }
      });

      test("INSTRUCTIONS.md uses --- block separator in tree.md (R10)", () => {
        const init = extractInstructionBody(s, "Initialize");
        assert.match(init, /^---$/m, "Initialize must seed tree.md with a --- separator before the root block");
      });

      test("INSTRUCTIONS.md uses awk for surgical updates of tree.md after Initialize (R12)", () => {
        // Strategy outside Initialize must use awk (or sed) for in-place tree.md updates.
        // We assert at least one awk pipeline that writes back to ./scoped/tree.md.
        assert.match(s, /awk[^>]*\.\/scoped\/tree\.md[^|]*>\s*\.\/scoped\/tree\.md\.tmp/);
        assert.match(s, /mv\s+\.\/scoped\/tree\.md\.tmp\s+\.\/scoped\/tree\.md/);
      });

      test("INSTRUCTIONS.md computes monotonic n<index> ids (R13)", () => {
        // Look for the pattern that derives a new id from the count of existing ids.
        assert.match(s, /grep\s+-c\s+'?\^id:\s*n'?[^\n]*\.\/scoped\/tree\.md/);
        assert.match(s, /n"?\$/, "INSTRUCTIONS.md should construct new id as n<counter>");
      });
    });
    ```

- [ ] **Step 2: Run test to verify it fails**

    Run: `npm test 2>&1 | grep -E "phase-6|FAIL"`
    Expected: FAIL on at least the surgical-edit assertion (no awk pipeline writing tree.md exists yet — only the initial heredoc in Initialize) and the four status values (only `live` is mentioned so far).

- [ ] **Step 3: Write minimal implementation**

    Add a "Tree ledger primitives" preamble block to `INSTRUCTIONS.md`, immediately *before* `## Instruction: Initialize`. The full primitives are documented in `design.md §Interfaces — Update primitives` (Append a node block, Compute next monotonic id, Update a single field of a single node, Find first matching node by predicate, Walk parent chain). Paste this block into INSTRUCTIONS.md as a non-instruction reference section the strategy can quote when emitting bash:

    ```markdown
    ### Tree ledger primitives

    Every instruction below uses these bash idioms when reading or writing `./scoped/tree.md`. They are stated once here and referenced by name from each Instruction body.

    **Append a node block** (used by Initialize for n0, by Expand-absorb for children):

        cat >> ./scoped/tree.md << NODE_EOF
        ---
        id: $NEW_ID
        parent_id: $PARENT_ID
        depth: $DEPTH
        op: $OP
        left: $LEFT
        value: 0
        samples: 0
        status: live
        NODE_EOF

    **Next monotonic id** (R13):

        NEXT_INDEX=$(grep -c '^id: n' ./scoped/tree.md)
        NEW_ID="n$NEXT_INDEX"

    **Update one field of one node** (R12, surgical edit):

        # Args: $1 = id, $2 = field name, $3 = new value
        awk -v ID="$1" -v F="$2" -v V="$3" '
          /^---$/ { in_block = 0; print; next }
          /^id:/  { in_block = ($2 == ID); print; next }
          in_block && $1 == F":" { print F": " V; next }
          { print }
        ' ./scoped/tree.md > ./scoped/tree.md.tmp && mv ./scoped/tree.md.tmp ./scoped/tree.md

    **Status value enum** (R14): `live`, `pruned`, `terminal_pass`, `terminal_fail`. Once a node leaves `live`, it never returns.

    **Find first matching node** — see design.md §Interfaces — Update primitives. Two-pass awk (pass 1 collects parent_ids; pass 2 emits first id matching a depth/status/predicate filter).

    **Walk parent chain** — see design.md §Interfaces — Walk parents primitive. Iterates from a terminal id back to n0, concatenating `op:` lines.
    ```

    Verify `Initialize`'s root-block heredoc already contains `---` on its own line — it does after T3. No edit to Initialize is needed for this task.

- [ ] **Step 4: Run test to verify it passes**

    Run: `npm test 2>&1 | grep -E "phase-6|FAIL"`
    Expected: PASS for all R10–R14 assertions (the awk pipeline appears in the primitives block; status values are listed in the status-enum sentence).

- [ ] **Step 5: Commit**

    ```bash
    git add interpreters/mas-papers/3-search/a-tot/INSTRUCTIONS.md src/test/phase-6-tot.test.ts
    git commit -m "feat(phase-6): tree ledger contract + surgical-edit primitives (satisfies: R10, R11, R12, R13, R14)"
    ```

---

## Task 5: `expand-node.md` dynamic   (satisfies: R38, R39, R40)

**Files:**
- Create: `interpreters/mas-papers/3-search/a-tot/dynamics/expand-node.md`
- Modify: `src/test/phase-6-tot.test.ts` (append assertions)

- [ ] **Step 1: Write the failing test**

    Append to `src/test/phase-6-tot.test.ts`:

    ```typescript
    describe("phase-6 a-tot: expand-node.md dynamic (R38–R40)", () => {
      const path = resolve(INTERP, "dynamics/expand-node.md");

      test("dynamics/expand-node.md exists", () => {
        assert.ok(existsSync(path), "expand-node.md missing");
      });

      test("expand-node.md declares push-arg placeholders (R38)", () => {
        const s = readFileSync(path, "utf-8");
        for (const ph of ["{{parent_thought}}", "{{target}}", "{{numbers_remaining}}"]) {
          assert.match(s, new RegExp(escapeRegExp(ph)), `expand-node.md missing placeholder ${ph}`);
        }
      });

      test("expand-node.md is single-cycle empty -> done (R39)", () => {
        const s = readFileSync(path, "utf-8");
        const headers = (s.match(/^## Instruction:/gm) || []);
        assert.equal(headers.length, 1, "expand-node.md must have exactly one instruction");
        assert.match(s, /MEMORY state is "empty"/);
        assert.match(s, /## State\s*\n\s*done/);
      });

      test("expand-node.md returns one key 'children' via ## Return (R39)", () => {
        const s = readFileSync(path, "utf-8");
        assert.match(s, /## Return\s*\n\s*children:\s*\|/);
      });

      test("expand-node.md prompts for exactly k=5 child entries (R39)", () => {
        const s = readFileSync(path, "utf-8");
        assert.match(s, /\b5\b.*candidates|exactly\s+(?:k\s*=\s*)?5/i);
      });

      test("expand-node.md does not push further dynamics (R40)", () => {
        const s = readFileSync(path, "utf-8");
        assert.doesNotMatch(s, /^## Push\s*\ndynamics\//m);
      });
    });
    ```

- [ ] **Step 2: Run test to verify it fails**

    Run: `npm test 2>&1 | grep -E "phase-6|FAIL"`
    Expected: FAIL with substring `expand-node.md missing`.

- [ ] **Step 3: Write minimal implementation**

    Create `interpreters/mas-papers/3-search/a-tot/dynamics/expand-node.md`:

    ```markdown
    # Dynamic: Expand Node

    Receives push-args: `{{parent_thought}}`, `{{target}}`, `{{numbers_remaining}}`.
    Produces: `## State done` + `## Return` block with key `children`.

    This dynamic is invoked by the ToT strategy once per live unexpanded tree node. One invocation generates exactly k=5 candidate next moves, each consuming two of `{{numbers_remaining}}` and producing one new number from a binary op (`+`, `−`, `×`, `÷`). The resulting `left` set is the remaining numbers plus the new number.

    ## Instruction: Generate children
    **Condition:** MEMORY state is "empty"
    **Action:** Generate exactly 5 candidate next moves for the parent state below, targeting `{{target}}`. For each move:

    - Pick two distinct numbers from `{{numbers_remaining}}`.
    - Apply one of `+`, `−`, `×`, `÷`.
    - The new `left` set is the unused numbers plus the new result.
    - Avoid producing five identical entries; prefer diverse operations.

    Write `./MEMORY.md` with this EXACT single-heredoc shape (the `## Return` block MUST be in the same heredoc as the state change — without it the shell pops with no return value, breaking the caller):

    ```
    cat > ./MEMORY.md << 'MEMEOF'
    ## State
    done
    ## Matched Instruction
    Generate children
    ## Last Action
    Generated five candidate next moves for parent state {{parent_thought}}; popping back to controller.
    ## Result
    Children produced.
    ## Return
    children: |
      op: <a> <op> <b> = <result>
      left: <space-separated remaining numbers + result>
      op: <a> <op> <b> = <result>
      left: <space-separated remaining numbers + result>
      op: <a> <op> <b> = <result>
      left: <space-separated remaining numbers + result>
      op: <a> <op> <b> = <result>
      left: <space-separated remaining numbers + result>
      op: <a> <op> <b> = <result>
      left: <space-separated remaining numbers + result>
    MEMEOF
    ```

    Parent state:
    {{parent_thought}}

    Numbers remaining:
    {{numbers_remaining}}

    Target:
    {{target}}
    ```

- [ ] **Step 4: Run test to verify it passes**

    Run: `npm test 2>&1 | grep -E "phase-6|FAIL"`
    Expected: PASS for all R38–R40 assertions; no FAIL output for phase-6.

- [ ] **Step 5: Commit**

    ```bash
    git add interpreters/mas-papers/3-search/a-tot/dynamics/expand-node.md src/test/phase-6-tot.test.ts
    git commit -m "feat(phase-6): expand-node.md dynamic (k=5 children, single-cycle) (satisfies: R38, R39, R40)"
    ```

---

## Task 6: Expand-push + Expand-absorb + Phase-router   (satisfies: R15, R16, R17, R18, R47)

**Files:**
- Modify: `interpreters/mas-papers/3-search/a-tot/INSTRUCTIONS.md`
- Modify: `src/test/phase-6-tot.test.ts` (append assertions)

- [ ] **Step 1: Write the failing test**

    Append to `src/test/phase-6-tot.test.ts`:

    ```typescript
    describe("phase-6 a-tot: Expand-push + Expand-absorb + Phase-router (R15–R18, R47)", () => {
      const s = readFileSync(resolve(INTERP, "INSTRUCTIONS.md"), "utf-8");

      test("Expand-push instruction exists and matches state == expanding (R15)", () => {
        const ep = extractInstructionBody(s, "Expand-push");
        assert.ok(ep.length > 0, "Expand-push missing");
        assert.match(ep, /MEMORY state is "expanding"/);
      });

      test("Expand-push pushes dynamics/expand-node.md with the three push-args (R16)", () => {
        const ep = extractInstructionBody(s, "Expand-push");
        assert.match(ep, /## Push\s*\ndynamics\/expand-node\.md/);
        for (const a of ["parent_thought", "target", "numbers_remaining"]) {
          assert.match(ep, new RegExp(`^\\s*${a}:`, "m"), `Expand-push missing arg ${a}`);
        }
      });

      test("Expand-push selects unexpanded live node at current_depth (R15)", () => {
        const ep = extractInstructionBody(s, "Expand-push");
        // Must reference the current_depth file and the no-children predicate
        assert.match(ep, /scoped\/current_depth\.md/);
        assert.match(ep, /parent_id/);  // parent-of-children check
      });

      test("Expand-absorb matches state == expanding_completed with ## Children present (R17)", () => {
        const ea = extractInstructionBody(s, "Expand-absorb");
        assert.ok(ea.length > 0, "Expand-absorb missing");
        assert.match(ea, /expanding_completed/);
        assert.match(ea, /## Children/);
      });

      test("Expand-absorb appends children with value 0, samples 0, status live (R17)", () => {
        const ea = extractInstructionBody(s, "Expand-absorb");
        assert.match(ea, /value:\s*0/);
        assert.match(ea, /samples:\s*0/);
        assert.match(ea, /status:\s*live/);
      });

      test("Expand-absorb appends Pending Questions on malformed children (R47)", () => {
        const ea = extractInstructionBody(s, "Expand-absorb");
        assert.match(ea, /## Pending Questions/);
        // Must NOT transition to waiting_for_user from this path
        assert.doesNotMatch(ea, /## State\s*\n\s*waiting_for_user/);
      });

      test("Phase-router routes to expanding | scoring | pruning (R18)", () => {
        const ea = extractInstructionBody(s, "Expand-absorb");
        for (const target of ["expanding", "scoring", "pruning"]) {
          assert.match(ea, new RegExp(`\\b${target}\\b`), `Expand-absorb router missing target ${target}`);
        }
      });
    });
    ```

- [ ] **Step 2: Run test to verify it fails**

    Run: `npm test 2>&1 | grep -E "phase-6|FAIL"`
    Expected: FAIL with `Expand-push missing` and `Expand-absorb missing`.

- [ ] **Step 3: Write minimal implementation**

    Append two `## Instruction:` blocks to the strategy section of `INSTRUCTIONS.md`. Full bash bodies are in `design.md §Interfaces — Expand-push` and `§Interfaces — Expand-absorb`. The Phase-router decision is inlined inside Expand-absorb (and re-used in Score-absorb in T8). Concrete content to paste, in order:

    ```markdown
    ## Instruction: Expand-push
    **Condition:** MEMORY state is "expanding"
    **Action:** Find the first unexpanded live node at `current_depth` using the "Find first matching node" primitive (depth == current_depth, status == live, has zero children). If none exists, route via Phase-router (below) without emitting a push.

        DEPTH=$(cat ./scoped/current_depth.md)
        TARGET=$(cat ./scoped/target.md)

        HAS_CHILD=$(awk '/^parent_id:/ {print $2}' ./scoped/tree.md | sort -u)

        ID=$(awk -v D="$DEPTH" -v EXCL="$HAS_CHILD" '
          BEGIN { n=split(EXCL, arr, "\n"); for (i=1; i<=n; i++) excl[arr[i]] = 1 }
          /^---$/ {
            if (id != "" && d == D && s == "live" && !(id in excl)) { print id; exit }
            id=""; d=""; s=""; next
          }
          /^id:/      { id = $2 }
          /^depth:/   { d = $2 }
          /^status:/  { s = $2 }
        ' ./scoped/tree.md)

    If `$ID` is empty, defer to Phase-router via the absorb cycle (skip emitting `## Push`). Otherwise:

        echo "$ID" > ./scoped/cursor.md
        OP=$(awk -v ID="$ID" '/^---$/{in_block=0;next} /^id:/{in_block=($2==ID)} in_block && /^op:/{sub(/^op: /,""); print; exit}' ./scoped/tree.md)
        LEFT=$(awk -v ID="$ID" '/^---$/{in_block=0;next} /^id:/{in_block=($2==ID)} in_block && /^left:/{sub(/^left: /,""); print; exit}' ./scoped/tree.md)
        printf 'op: %s\nleft: %s\n' "$OP" "$LEFT" > ./scoped/staged/parent_thought.md
        echo "$LEFT" > ./scoped/staged/numbers_remaining.md

    Then emit MEMORY:

        PT=$(sed 's/^/  /' ./scoped/staged/parent_thought.md)
        NR=$(cat ./scoped/staged/numbers_remaining.md)

        cat > ./MEMORY.md << MEM_EOF
        ## State
        expanding
        ## Matched Instruction
        Expand-push
        ## Last Action
        Pushed expand-node.md for $ID at depth $DEPTH.
        ## Result
        Push queued.
        ## Push
        dynamics/expand-node.md
        ## Push-Args
        parent_thought: |
        $PT
        target: $TARGET
        numbers_remaining: $NR
        MEM_EOF

    The state value `expanding` is the returnState; on pop the shell sets state to `expanding_completed`, which `Expand-absorb` matches.

    ## Instruction: Expand-absorb
    **Condition:** MEMORY state is "expanding_completed" and `## Children` is present in MEMORY
    **Action:** Parse the spliced `## Children` block as alternating `op:` / `left:` lines. For each well-formed pair, append a node block to `./scoped/tree.md` using the "Append a node block" primitive with `parent_id = $(cat ./scoped/cursor.md)`, `depth = current_depth + 1`, `value: 0`, `samples: 0`, `status: live`, and `op`/`left` parsed from the pair.

        DEPTH=$(cat ./scoped/current_depth.md)
        NEXT_DEPTH=$((DEPTH + 1))
        PARENT=$(cat ./scoped/cursor.md)

        # Extract body of ## Children (between header and next ## ALL CAPS)
        awk '/^## Children$/{f=1; next} /^## [A-Z]/ && f {exit} f' ./MEMORY.md > ./scoped/_children.txt

        # Pair up op/left lines; ignore malformed remainder.
        WELL_FORMED=0
        MALFORMED=0
        op=""
        while IFS= read -r line; do
          if [[ "$line" =~ ^op:\ (.+)$ ]]; then
            op="${BASH_REMATCH[1]}"
          elif [[ "$line" =~ ^left:\ (.+)$ ]] && [ -n "$op" ]; then
            left="${BASH_REMATCH[1]}"
            NEXT_INDEX=$(grep -c '^id: n' ./scoped/tree.md)
            NEW_ID="n$NEXT_INDEX"
            cat >> ./scoped/tree.md << NODE_EOF
        ---
        id: $NEW_ID
        parent_id: $PARENT
        depth: $NEXT_DEPTH
        op: $op
        left: $left
        value: 0
        samples: 0
        status: live
        NODE_EOF
            WELL_FORMED=$((WELL_FORMED + 1))
            op=""
          fi
        done < ./scoped/_children.txt

        MISSING=$((5 - WELL_FORMED))

    Decide next state via Phase-router (R18):

        UNEXPANDED=$(awk -v D="$DEPTH" '... <Find first unexpanded live at DEPTH>' ./scoped/tree.md)
        UNSCORED=$(awk -v D="$NEXT_DEPTH" '... <Find first live at NEXT_DEPTH with samples<3>' ./scoped/tree.md)

        if [ -n "$UNEXPANDED" ]; then
          [ -n "$UNSCORED" ] && NEXT_STATE=scoring || NEXT_STATE=expanding
        elif [ -n "$UNSCORED" ]; then
          NEXT_STATE=scoring
        else
          NEXT_STATE=pruning
        fi

    Then wholesale-rewrite MEMORY (drop `## Children`, optionally append `## Pending Questions` on malformed):

        if [ "$MISSING" -gt 0 ]; then
          PQ_BLOCK=$(printf '\n## Pending Questions\n- Q: expand-node.md returned %d well-formed children (expected 5); %d entries malformed for parent %s.' "$WELL_FORMED" "$MISSING" "$PARENT")
        else
          PQ_BLOCK=""
        fi

        cat > ./MEMORY.md << MEM_EOF
        ## State
        $NEXT_STATE
        ## Matched Instruction
        Expand-absorb
        ## Last Action
        Absorbed $WELL_FORMED children for $PARENT at depth $NEXT_DEPTH; routing to $NEXT_STATE.
        ## Result
        Children appended to scoped/tree.md.$PQ_BLOCK
        MEM_EOF

    The R47 path: `## Pending Questions` is appended; state is NEVER `waiting_for_user` here — the loop must keep progressing.
    ```

- [ ] **Step 4: Run test to verify it passes**

    Run: `npm test 2>&1 | grep -E "phase-6|FAIL"`
    Expected: PASS for all R15–R18, R47 assertions.

- [ ] **Step 5: Commit**

    ```bash
    git add interpreters/mas-papers/3-search/a-tot/INSTRUCTIONS.md src/test/phase-6-tot.test.ts
    git commit -m "feat(phase-6): Expand-push + Expand-absorb with Phase-router (satisfies: R15, R16, R17, R18, R47)"
    ```

---

## Task 7: `score.md` dynamic   (satisfies: R41, R42, R43)

**Files:**
- Create: `interpreters/mas-papers/3-search/a-tot/dynamics/score.md`
- Modify: `src/test/phase-6-tot.test.ts` (append assertions)

- [ ] **Step 1: Write the failing test**

    Append to `src/test/phase-6-tot.test.ts`:

    ```typescript
    describe("phase-6 a-tot: score.md dynamic (R41–R43)", () => {
      const path = resolve(INTERP, "dynamics/score.md");

      test("dynamics/score.md exists", () => {
        assert.ok(existsSync(path), "score.md missing");
      });

      test("score.md declares two push-arg placeholders (R41)", () => {
        const s = readFileSync(path, "utf-8");
        for (const ph of ["{{thought}}", "{{target}}"]) {
          assert.match(s, new RegExp(escapeRegExp(ph)), `score.md missing placeholder ${ph}`);
        }
      });

      test("score.md is single-cycle empty -> done (R42)", () => {
        const s = readFileSync(path, "utf-8");
        const headers = (s.match(/^## Instruction:/gm) || []);
        assert.equal(headers.length, 1, "score.md must have exactly one instruction");
        assert.match(s, /MEMORY state is "empty"/);
        assert.match(s, /## State\s*\n\s*done/);
      });

      test("score.md returns one key 'value' via ## Return (R42)", () => {
        const s = readFileSync(path, "utf-8");
        assert.match(s, /## Return\s*\n\s*value:/);
      });

      test("score.md prompts for one of sure/likely/impossible (R42)", () => {
        const s = readFileSync(path, "utf-8");
        assert.match(s, /\bsure\b/);
        assert.match(s, /\blikely\b/);
        assert.match(s, /\bimpossible\b/);
      });

      test("score.md does not push further dynamics (R43)", () => {
        const s = readFileSync(path, "utf-8");
        assert.doesNotMatch(s, /^## Push\s*\ndynamics\//m);
      });
    });
    ```

- [ ] **Step 2: Run test to verify it fails**

    Run: `npm test 2>&1 | grep -E "phase-6|FAIL"`
    Expected: FAIL with `score.md missing`.

- [ ] **Step 3: Write minimal implementation**

    Create `interpreters/mas-papers/3-search/a-tot/dynamics/score.md`:

    ```markdown
    # Dynamic: Score

    Receives push-args: `{{thought}}`, `{{target}}`.
    Produces: `## State done` + `## Return` block with key `value` set to one of `sure`, `likely`, or `impossible`.

    This dynamic is invoked by the ToT strategy three times per child node. The strategy aggregates the three labels by weighted sum (sure=20, likely=1, impossible=0.001) per Yao et al. 2023.

    ## Instruction: Score thought
    **Condition:** MEMORY state is "empty"
    **Action:** Judge whether the partial Game-of-24 state below can reach the target. Output exactly one label:

    - `sure` — the remaining numbers can definitely combine to make `{{target}}` (e.g. one number already equals the target, or two numbers obviously combine to it).
    - `likely` — feasible but not obvious (one small operation away from a known-good intermediate).
    - `impossible` — too-big-or-too-small commonsense rules it out (e.g. `{1, 1, 1}` cannot reach `{{target}}` if target ≫ 3).

    Write `./MEMORY.md` with this EXACT single-heredoc shape (the `## Return` block MUST be in the same heredoc as the state change):

    ```
    cat > ./MEMORY.md << 'MEMEOF'
    ## State
    done
    ## Matched Instruction
    Score thought
    ## Last Action
    Scored partial state {{thought}} for target {{target}}; popping.
    ## Result
    Score produced.
    ## Return
    value: <one of: sure, likely, impossible>
    MEMEOF
    ```

    Partial state to score:
    {{thought}}

    Target:
    {{target}}
    ```

- [ ] **Step 4: Run test to verify it passes**

    Run: `npm test 2>&1 | grep -E "phase-6|FAIL"`
    Expected: PASS for all R41–R43 assertions.

- [ ] **Step 5: Commit**

    ```bash
    git add interpreters/mas-papers/3-search/a-tot/dynamics/score.md src/test/phase-6-tot.test.ts
    git commit -m "feat(phase-6): score.md dynamic (sure/likely/impossible labels) (satisfies: R41, R42, R43)"
    ```

---

## Task 8: Score-push + Score-absorb (weight mapping, malformed labels)   (satisfies: R19, R20, R21, R22, R23, R44)

**Files:**
- Modify: `interpreters/mas-papers/3-search/a-tot/INSTRUCTIONS.md`
- Modify: `src/test/phase-6-tot.test.ts` (append assertions)

- [ ] **Step 1: Write the failing test**

    Append to `src/test/phase-6-tot.test.ts`:

    ```typescript
    describe("phase-6 a-tot: Score-push + Score-absorb (R19–R23, R44)", () => {
      const s = readFileSync(resolve(INTERP, "INSTRUCTIONS.md"), "utf-8");

      test("Score-push matches state == scoring (R19)", () => {
        const sp = extractInstructionBody(s, "Score-push");
        assert.ok(sp.length > 0, "Score-push missing");
        assert.match(sp, /MEMORY state is "scoring"/);
      });

      test("Score-push selects child at current_depth+1 with samples<3 (R19)", () => {
        const sp = extractInstructionBody(s, "Score-push");
        assert.match(sp, /samples\s*<\s*3|samples\s*<\s*"3"|samples<3/);
      });

      test("Score-push pushes dynamics/score.md with thought + target (R20)", () => {
        const sp = extractInstructionBody(s, "Score-push");
        assert.match(sp, /## Push\s*\ndynamics\/score\.md/);
        for (const a of ["thought", "target"]) {
          assert.match(sp, new RegExp(`^\\s*${a}:`, "m"), `Score-push missing arg ${a}`);
        }
      });

      test("Score-absorb matches state == scoring_completed with ## Value present (R21)", () => {
        const sa = extractInstructionBody(s, "Score-absorb");
        assert.ok(sa.length > 0, "Score-absorb missing");
        assert.match(sa, /scoring_completed/);
        assert.match(sa, /## Value/);
      });

      test("Score-absorb declares the weight mapping sure=20 likely=1 impossible=0.001 (R21)", () => {
        const sa = extractInstructionBody(s, "Score-absorb");
        assert.match(sa, /sure[^=]*=?[^0-9]*20\b/);
        assert.match(sa, /likely[^=]*=?[^0-9]*1\b/);
        assert.match(sa, /impossible[^=]*=?[^0-9]*0\.001/);
      });

      test("Score-absorb increments samples by 1 and adds weight to value (R21)", () => {
        const sa = extractInstructionBody(s, "Score-absorb");
        assert.match(sa, /samples\s*\+\s*1|\$\(\(\s*\$?CURRENT_SAMPLES\s*\+\s*1\s*\)\)|new_samples=/i);
        assert.match(sa, /bc\b|awk.*\+/);  // floating-point arithmetic for value sum
      });

      test("Score-absorb treats malformed label as impossible (R44)", () => {
        const sa = extractInstructionBody(s, "Score-absorb");
        assert.match(sa, /\bimpossible\b/);
        assert.match(sa, /## Pending Questions/);
        assert.doesNotMatch(sa, /## State\s*\n\s*waiting_for_user/);
      });

      test("Score-absorb routes via Phase-router (scoring | expanding | pruning) (R22, R23)", () => {
        const sa = extractInstructionBody(s, "Score-absorb");
        for (const target of ["scoring", "expanding", "pruning"]) {
          assert.match(sa, new RegExp(`\\b${target}\\b`), `Score-absorb router missing target ${target}`);
        }
      });
    });
    ```

- [ ] **Step 2: Run test to verify it fails**

    Run: `npm test 2>&1 | grep -E "phase-6|FAIL"`
    Expected: FAIL with `Score-push missing` and `Score-absorb missing`.

- [ ] **Step 3: Write minimal implementation**

    Append two more `## Instruction:` blocks to `INSTRUCTIONS.md`. Full bash bodies are in `design.md §Interfaces — Score-push` and `§Interfaces — Score-absorb`. Concrete content:

    ```markdown
    ## Instruction: Score-push
    **Condition:** MEMORY state is "scoring"
    **Action:** Find the first live unscored child (`depth == current_depth + 1` AND `status == live` AND `samples < 3`) using the "Find first matching node" primitive variant. If none, defer to Phase-router (no push this cycle).

        DEPTH=$(cat ./scoped/current_depth.md)
        NEXT_DEPTH=$((DEPTH + 1))
        TARGET=$(cat ./scoped/target.md)

        ID=$(awk -v D="$NEXT_DEPTH" '
          /^---$/ {
            if (id != "" && d == D && s == "live" && samp < 3) { print id; exit }
            id=""; d=""; s=""; samp=0; next
          }
          /^id:/      { id = $2 }
          /^depth:/   { d = $2 }
          /^status:/  { s = $2 }
          /^samples:/ { samp = $2 }
        ' ./scoped/tree.md)

    If `$ID` is empty, route via Phase-router (next cycle's job — emit a no-push absorb-style state transition). Otherwise stage the thought and emit `## Push`:

        echo "$ID" > ./scoped/cursor.md
        OP=$(awk -v ID="$ID" '/^---$/{in_block=0;next} /^id:/{in_block=($2==ID)} in_block && /^op:/{sub(/^op: /,""); print; exit}' ./scoped/tree.md)
        LEFT=$(awk -v ID="$ID" '/^---$/{in_block=0;next} /^id:/{in_block=($2==ID)} in_block && /^left:/{sub(/^left: /,""); print; exit}' ./scoped/tree.md)
        printf 'op: %s\nleft: %s\n' "$OP" "$LEFT" > ./scoped/staged/thought.md

        TH=$(sed 's/^/  /' ./scoped/staged/thought.md)

        cat > ./MEMORY.md << MEM_EOF
        ## State
        scoring
        ## Matched Instruction
        Score-push
        ## Last Action
        Pushed score.md for $ID (sample $((SAMP + 1)) of 3).
        ## Result
        Push queued.
        ## Push
        dynamics/score.md
        ## Push-Args
        thought: |
        $TH
        target: $TARGET
        MEM_EOF

    ## Instruction: Score-absorb
    **Condition:** MEMORY state is "scoring_completed" and `## Value` is present in MEMORY
    **Action:** Read the cursor id and the returned label. Map label → weight per `{sure: 20, likely: 1, impossible: 0.001}` (R21). On malformed label, treat as `impossible` (R44) and append non-blocking `## Pending Questions`. Surgically increment samples and add weight to value. Drop `## Value`. Route via Phase-router.

        ID=$(cat ./scoped/cursor.md)
        LABEL=$(awk '/^## Value$/{f=1; next} /^## /{f=0} f && /[a-z]/{print; exit}' ./MEMORY.md | tr -d ' ')

        case "$LABEL" in
          sure)       WEIGHT=20      ;;
          likely)     WEIGHT=1       ;;
          impossible) WEIGHT=0.001   ;;
          *)          WEIGHT=0.001
                      MALFORMED=1   ;;
        esac

        CURRENT_VALUE=$(awk -v ID="$ID" '/^---$/{in_block=0;next} /^id:/{in_block=($2==ID)} in_block && /^value:/{print $2; exit}' ./scoped/tree.md)
        NEW_VALUE=$(echo "$CURRENT_VALUE + $WEIGHT" | bc -l)
        CURRENT_SAMPLES=$(awk -v ID="$ID" '/^---$/{in_block=0;next} /^id:/{in_block=($2==ID)} in_block && /^samples:/{print $2; exit}' ./scoped/tree.md)
        NEW_SAMPLES=$((CURRENT_SAMPLES + 1))

        # Surgical update: value
        awk -v ID="$ID" -v V="$NEW_VALUE" '
          /^---$/ { in_block = 0; print; next }
          /^id:/  { in_block = ($2 == ID); print; next }
          in_block && /^value:/ { print "value: " V; next }
          { print }
        ' ./scoped/tree.md > ./scoped/tree.md.tmp && mv ./scoped/tree.md.tmp ./scoped/tree.md

        # Surgical update: samples
        awk -v ID="$ID" -v S="$NEW_SAMPLES" '
          /^---$/ { in_block = 0; print; next }
          /^id:/  { in_block = ($2 == ID); print; next }
          in_block && /^samples:/ { print "samples: " S; next }
          { print }
        ' ./scoped/tree.md > ./scoped/tree.md.tmp && mv ./scoped/tree.md.tmp ./scoped/tree.md

    Decide next state via Phase-router (mirrors Expand-absorb's logic — see that instruction). Then wholesale-rewrite MEMORY:

        DEPTH=$(cat ./scoped/current_depth.md)
        NEXT_DEPTH=$((DEPTH + 1))
        UNEXPANDED=$(awk -v D="$DEPTH" '... <Find first unexpanded live at DEPTH>' ./scoped/tree.md)
        UNSCORED=$(awk -v D="$NEXT_DEPTH" '... <Find first live at NEXT_DEPTH with samples<3>' ./scoped/tree.md)

        if [ -n "$UNEXPANDED" ]; then
          [ -n "$UNSCORED" ] && NEXT_STATE=scoring || NEXT_STATE=expanding
        elif [ -n "$UNSCORED" ]; then
          NEXT_STATE=scoring
        else
          NEXT_STATE=pruning
        fi

        if [ -n "$MALFORMED" ]; then
          PQ_BLOCK=$(printf '\n## Pending Questions\n- Q: score.md returned label "%s" not in {sure, likely, impossible}; treated as impossible.' "$LABEL")
        else
          PQ_BLOCK=""
        fi

        cat > ./MEMORY.md << MEM_EOF
        ## State
        $NEXT_STATE
        ## Matched Instruction
        Score-absorb
        ## Last Action
        Updated $ID: samples=$NEW_SAMPLES, value=$NEW_VALUE; routing to $NEXT_STATE.
        ## Result
        Score absorbed.$PQ_BLOCK
        MEM_EOF
    ```

- [ ] **Step 4: Run test to verify it passes**

    Run: `npm test 2>&1 | grep -E "phase-6|FAIL"`
    Expected: PASS for all R19–R23, R44 assertions.

- [ ] **Step 5: Commit**

    ```bash
    git add interpreters/mas-papers/3-search/a-tot/INSTRUCTIONS.md src/test/phase-6-tot.test.ts
    git commit -m "feat(phase-6): Score-push + Score-absorb (sure/likely/impossible weighted sum) (satisfies: R19, R20, R21, R22, R23, R44)"
    ```

---

## Task 9: Prune instruction (top-b retention, R37 dead-end)   (satisfies: R24, R25, R37)

**Files:**
- Modify: `interpreters/mas-papers/3-search/a-tot/INSTRUCTIONS.md`
- Modify: `src/test/phase-6-tot.test.ts` (append assertions)

- [ ] **Step 1: Write the failing test**

    Append to `src/test/phase-6-tot.test.ts`:

    ```typescript
    describe("phase-6 a-tot: Prune instruction (R24, R25, R37)", () => {
      const s = readFileSync(resolve(INTERP, "INSTRUCTIONS.md"), "utf-8");

      test("Prune instruction exists and matches state == pruning", () => {
        const p = extractInstructionBody(s, "Prune");
        assert.ok(p.length > 0, "Prune missing");
        assert.match(p, /MEMORY state is "pruning"/);
      });

      test("Prune sorts by value desc, id asc, retains top 5 (R24)", () => {
        const p = extractInstructionBody(s, "Prune");
        assert.match(p, /sort.*-k1,1nr.*-k2,2|sort.*-rn|sort.*--reverse/);
        assert.match(p, /tail\s+-n\s+\+6|tail\s+-n6\b|head\s+-n\s+5/);
      });

      test("Prune marks losers as status: pruned (R24)", () => {
        const p = extractInstructionBody(s, "Prune");
        assert.match(p, /status:?\s*pruned|"pruned"/);
      });

      test("Prune transitions to advancing on success (R25)", () => {
        const p = extractInstructionBody(s, "Prune");
        assert.match(p, /## State\s*\n\s*advancing/);
      });

      test("Prune emits ## No Solution Found on empty frontier dead-end (R37)", () => {
        const p = extractInstructionBody(s, "Prune");
        assert.match(p, /## No Solution Found/);
        assert.match(p, /## State\s*\n\s*done/);
      });
    });
    ```

- [ ] **Step 2: Run test to verify it fails**

    Run: `npm test 2>&1 | grep -E "phase-6|FAIL"`
    Expected: FAIL with `Prune missing`.

- [ ] **Step 3: Write minimal implementation**

    Append to `INSTRUCTIONS.md`:

    ```markdown
    ## Instruction: Prune
    **Condition:** MEMORY state is "pruning"
    **Action:** Select all `live` nodes at `current_depth + 1`, sort by `value` descending then `id` ascending, retain top b=5, mark every other as `status: pruned`. If no live nodes exist at `current_depth + 1`, write `## No Solution Found` and halt (R37).

        DEPTH=$(cat ./scoped/current_depth.md)
        NEXT_DEPTH=$((DEPTH + 1))

        LIVE_NODES=$(awk -v D="$NEXT_DEPTH" '
          /^---$/ { id=""; d=""; v=""; s=""; next }
          /^id:/      { id=$2 }
          /^depth:/   { d=$2 }
          /^value:/   { v=$2 }
          /^status:/  { s=$2; if (id != "" && d == D && s == "live") printf "%s %s\n", v, id }
        ' ./scoped/tree.md)

        if [ -z "$LIVE_NODES" ]; then
          # R37: dead-end
          cat > ./MEMORY.md << 'DEAD_EOF'
        ## State
        done
        ## Matched Instruction
        Prune (dead-end)
        ## Last Action
        No live nodes at depth $NEXT_DEPTH; halting.
        ## Result
        Search exhausted without solution.
        ## No Solution Found
        Pruning at depth $NEXT_DEPTH found zero live candidates; aborting BFS.
        DEAD_EOF
          exit 0
        fi

        LOSERS=$(echo "$LIVE_NODES" | sort -k1,1nr -k2,2 | tail -n +6 | awk '{print $2}')

        for L in $LOSERS; do
          awk -v ID="$L" '
            /^---$/ { in_block = 0; print; next }
            /^id:/  { in_block = ($2 == ID); print; next }
            in_block && /^status:/ { print "status: pruned"; next }
            { print }
          ' ./scoped/tree.md > ./scoped/tree.md.tmp && mv ./scoped/tree.md.tmp ./scoped/tree.md
        done

        KEPT=$(echo "$LIVE_NODES" | sort -k1,1nr -k2,2 | head -n 5 | wc -l)
        TOTAL_LIVE=$(echo "$LIVE_NODES" | wc -l)

        cat > ./MEMORY.md << MEM_EOF
        ## State
        advancing
        ## Matched Instruction
        Prune
        ## Last Action
        Pruned depth $NEXT_DEPTH from $TOTAL_LIVE live nodes to top $KEPT.
        ## Result
        Frontier reduced.
        MEM_EOF
    ```

- [ ] **Step 4: Run test to verify it passes**

    Run: `npm test 2>&1 | grep -E "phase-6|FAIL"`
    Expected: PASS for all R24, R25, R37 assertions.

- [ ] **Step 5: Commit**

    ```bash
    git add interpreters/mas-papers/3-search/a-tot/INSTRUCTIONS.md src/test/phase-6-tot.test.ts
    git commit -m "feat(phase-6): Prune instruction (top-b=5 + R37 dead-end) (satisfies: R24, R25, R37)"
    ```

---

## Task 10: Advance instruction   (satisfies: R26, R27)

**Files:**
- Modify: `interpreters/mas-papers/3-search/a-tot/INSTRUCTIONS.md`
- Modify: `src/test/phase-6-tot.test.ts` (append assertions)

- [ ] **Step 1: Write the failing test**

    Append to `src/test/phase-6-tot.test.ts`:

    ```typescript
    describe("phase-6 a-tot: Advance instruction (R26, R27)", () => {
      const s = readFileSync(resolve(INTERP, "INSTRUCTIONS.md"), "utf-8");

      test("Advance instruction exists and matches state == advancing", () => {
        const a = extractInstructionBody(s, "Advance");
        assert.ok(a.length > 0, "Advance missing");
        assert.match(a, /MEMORY state is "advancing"/);
      });

      test("Advance increments current_depth when next ≤ max_depth (R26)", () => {
        const a = extractInstructionBody(s, "Advance");
        assert.match(a, /scoped\/current_depth\.md/);
        assert.match(a, /-le|-lt|<=/);
        assert.match(a, /\bexpanding\b/);
      });

      test("Advance routes to goal_checking when next > max_depth (R27)", () => {
        const a = extractInstructionBody(s, "Advance");
        assert.match(a, /\bgoal_checking\b/);
      });
    });
    ```

- [ ] **Step 2: Run test to verify it fails**

    Run: `npm test 2>&1 | grep -E "phase-6|FAIL"`
    Expected: FAIL with `Advance missing`.

- [ ] **Step 3: Write minimal implementation**

    Append to `INSTRUCTIONS.md`:

    ```markdown
    ## Instruction: Advance
    **Condition:** MEMORY state is "advancing"
    **Action:** Read current_depth and max_depth. If `current_depth + 1 ≤ max_depth`, increment and re-enter expanding (R26). Else, transition to goal_checking (R27).

        DEPTH=$(cat ./scoped/current_depth.md)
        MAX=$(cat ./scoped/max_depth.md)
        NEXT=$((DEPTH + 1))

        if [ "$NEXT" -le "$MAX" ]; then
          echo "$NEXT" > ./scoped/current_depth.md
          NEXT_STATE=expanding
        else
          NEXT_STATE=goal_checking
        fi

        cat > ./MEMORY.md << MEM_EOF
        ## State
        $NEXT_STATE
        ## Matched Instruction
        Advance
        ## Last Action
        Advanced from depth $DEPTH; routing to $NEXT_STATE.
        ## Result
        Depth advanced.
        MEM_EOF
    ```

- [ ] **Step 4: Run test to verify it passes**

    Run: `npm test 2>&1 | grep -E "phase-6|FAIL"`
    Expected: PASS for all R26, R27 assertions.

- [ ] **Step 5: Commit**

    ```bash
    git add interpreters/mas-papers/3-search/a-tot/INSTRUCTIONS.md src/test/phase-6-tot.test.ts
    git commit -m "feat(phase-6): Advance instruction (depth+1 or goal_checking) (satisfies: R26, R27)"
    ```

---

## Task 11: Goal-push + Goal-absorb (parent-walk, terminal evaluation)   (satisfies: R28, R29, R30, R31, R32, R33, R34)

**Files:**
- Modify: `interpreters/mas-papers/3-search/a-tot/INSTRUCTIONS.md`
- Modify: `src/test/phase-6-tot.test.ts` (append assertions)

- [ ] **Step 1: Write the failing test**

    Append to `src/test/phase-6-tot.test.ts`:

    ```typescript
    describe("phase-6 a-tot: Goal-push + Goal-absorb (R28–R34)", () => {
      const s = readFileSync(resolve(INTERP, "INSTRUCTIONS.md"), "utf-8");

      test("Goal-push matches state == goal_checking (R28)", () => {
        const gp = extractInstructionBody(s, "Goal-push");
        assert.ok(gp.length > 0, "Goal-push missing");
        assert.match(gp, /MEMORY state is "goal_checking"/);
      });

      test("Goal-push selects live node at depth == max_depth (R28)", () => {
        const gp = extractInstructionBody(s, "Goal-push");
        assert.match(gp, /scoped\/max_depth\.md/);
        assert.match(gp, /\blive\b/);
      });

      test("Goal-push reconstructs expression by walking parent_id chain (R29)", () => {
        const gp = extractInstructionBody(s, "Goal-push");
        assert.match(gp, /parent_id|walk/i);
        assert.match(gp, /scoped\/staged\/attempt\.md/);
      });

      test("Goal-push pushes dynamics/evaluate.md with attempt + criterion (R30)", () => {
        const gp = extractInstructionBody(s, "Goal-push");
        assert.match(gp, /## Push\s*\ndynamics\/evaluate\.md/);
        for (const a of ["attempt", "criterion"]) {
          assert.match(gp, new RegExp(`^\\s*${a}:`, "m"), `Goal-push missing arg ${a}`);
        }
      });

      test("Goal-push criterion text mentions 'use each of' and 'evaluate to' (R30)", () => {
        const gp = extractInstructionBody(s, "Goal-push");
        assert.match(gp, /use each of/i);
        assert.match(gp, /evaluate(?:s)? to/i);
      });

      test("Goal-absorb matches state == goal_checking_completed with ## Verdict (R31, R32)", () => {
        const ga = extractInstructionBody(s, "Goal-absorb");
        assert.ok(ga.length > 0, "Goal-absorb missing");
        assert.match(ga, /goal_checking_completed/);
        assert.match(ga, /## Verdict/);
      });

      test("Goal-absorb maps pass → terminal_pass and routes to solved (R31)", () => {
        const ga = extractInstructionBody(s, "Goal-absorb");
        assert.match(ga, /\bterminal_pass\b/);
        assert.match(ga, /\bsolved\b/);
      });

      test("Goal-absorb maps fail → terminal_fail and stays in goal_checking (R32)", () => {
        const ga = extractInstructionBody(s, "Goal-absorb");
        assert.match(ga, /\bterminal_fail\b/);
        assert.match(ga, /\bgoal_checking\b/);
      });

      test("Goal-absorb treats malformed verdict as fail with Pending Questions (R33)", () => {
        const ga = extractInstructionBody(s, "Goal-absorb");
        assert.match(ga, /## Pending Questions/);
        assert.doesNotMatch(ga, /## State\s*\n\s*waiting_for_user/);
      });

      test("Exhaustion path emits ## No Solution Found and sets state done (R34)", () => {
        // R34's emission can live in either Goal-push (when no live terminal exists) or Goal-absorb (after the last fail).
        const gp = extractInstructionBody(s, "Goal-push");
        const ga = extractInstructionBody(s, "Goal-absorb");
        const combined = gp + "\n" + ga;
        assert.match(combined, /## No Solution Found/);
      });
    });
    ```

- [ ] **Step 2: Run test to verify it fails**

    Run: `npm test 2>&1 | grep -E "phase-6|FAIL"`
    Expected: FAIL with `Goal-push missing` and `Goal-absorb missing`.

- [ ] **Step 3: Write minimal implementation**

    Append two more `## Instruction:` blocks to `INSTRUCTIONS.md`. Full bash bodies are in `design.md §Interfaces — Goal-push`, `§Interfaces — Goal-absorb`, and `§Interfaces — Walk-parents primitive`. Concrete content:

    ```markdown
    ## Instruction: Goal-push
    **Condition:** MEMORY state is "goal_checking"
    **Action:** Find first live terminal (`depth == max_depth` AND `status == live`). If none, emit `## No Solution Found` (R34). Otherwise reconstruct expression via parent-walk, synthesize criterion, push evaluate.md.

        MAX=$(cat ./scoped/max_depth.md)

        ID=$(awk -v D="$MAX" '
          /^---$/ {
            if (id != "" && d == D && s == "live") { print id; exit }
            id=""; d=""; s=""; next
          }
          /^id:/      { id = $2 }
          /^depth:/   { d = $2 }
          /^status:/  { s = $2 }
        ' ./scoped/tree.md)

        if [ -z "$ID" ]; then
          # R34 exhaustion (also handled in Goal-absorb after the last fail).
          FAILS=$(grep -c '^status: terminal_fail$' ./scoped/tree.md)
          cat > ./MEMORY.md << EXH_EOF
        ## State
        done
        ## Matched Instruction
        Goal-push (exhausted)
        ## Last Action
        No live terminals remain; halting.
        ## Result
        Search exhausted without solution.
        ## No Solution Found
        $FAILS terminal candidates evaluated; none satisfied the criterion.
        EXH_EOF
          exit 0
        fi

        echo "$ID" > ./scoped/cursor.md

        # Walk parent chain back to root, concatenating op: lines.
        EXPR=""
        CURRENT="$ID"
        while [ "$CURRENT" != "n0" ] && [ -n "$CURRENT" ]; do
          OP=$(awk -v X="$CURRENT" '/^---$/{in_block=0;next} /^id:/{in_block=($2==X)} in_block && /^op:/{sub(/^op: /,""); print; exit}' ./scoped/tree.md)
          PARENT=$(awk -v X="$CURRENT" '/^---$/{in_block=0;next} /^id:/{in_block=($2==X)} in_block && /^parent_id:/{print $2; exit}' ./scoped/tree.md)
          if [ -z "$EXPR" ]; then EXPR="($OP)"; else EXPR="($OP); $EXPR"; fi
          CURRENT="$PARENT"
        done

        echo "$EXPR" > ./scoped/staged/attempt.md

        NUMBERS=$(cat ./scoped/numbers.md)
        TARGET=$(cat ./scoped/target.md)
        printf 'Expression must use each of %s exactly once and evaluate to %s.\n' "$NUMBERS" "$TARGET" > ./scoped/staged/criterion.md

        ATT=$(sed 's/^/  /' ./scoped/staged/attempt.md)
        CRIT=$(sed 's/^/  /' ./scoped/staged/criterion.md)

        cat > ./MEMORY.md << MEM_EOF
        ## State
        goal_checking
        ## Matched Instruction
        Goal-push
        ## Last Action
        Pushed evaluate.md for terminal $ID with attempt and criterion.
        ## Result
        Push queued.
        ## Push
        dynamics/evaluate.md
        ## Push-Args
        attempt: |
        $ATT
        criterion: |
        $CRIT
        MEM_EOF

    ## Instruction: Goal-absorb
    **Condition:** MEMORY state is "goal_checking_completed" and `## Verdict` is present in MEMORY
    **Action:** Read cursor id and `## Verdict`. On `pass` → status `terminal_pass`, route `solved` (R31). On `fail` → status `terminal_fail`, route `goal_checking` (R32). On malformed verdict → treat as fail, append non-blocking `## Pending Questions` (R33).

        ID=$(cat ./scoped/cursor.md)
        VERDICT=$(awk '/^## Verdict$/{f=1; next} /^## /{f=0} f && /[a-z]/{print; exit}' ./MEMORY.md | tr -d ' ')

        case "$VERDICT" in
          pass)
            NEW_STATUS=terminal_pass
            NEXT_STATE=solved
            ;;
          fail)
            NEW_STATUS=terminal_fail
            NEXT_STATE=goal_checking
            ;;
          *)
            NEW_STATUS=terminal_fail
            NEXT_STATE=goal_checking
            MALFORMED=1
            ;;
        esac

        # Surgical update: status
        awk -v X="$ID" -v NS="$NEW_STATUS" '
          /^---$/ { in_block = 0; print; next }
          /^id:/  { in_block = ($2 == X); print; next }
          in_block && /^status:/ { print "status: " NS; next }
          { print }
        ' ./scoped/tree.md > ./scoped/tree.md.tmp && mv ./scoped/tree.md.tmp ./scoped/tree.md

        if [ -n "$MALFORMED" ]; then
          PQ_BLOCK=$(printf '\n## Pending Questions\n- Q: evaluate.md returned verdict "%s" not in {pass, fail}; treated as fail.' "$VERDICT")
        else
          PQ_BLOCK=""
        fi

        cat > ./MEMORY.md << MEM_EOF
        ## State
        $NEXT_STATE
        ## Matched Instruction
        Goal-absorb
        ## Last Action
        Marked $ID as $NEW_STATUS; routing to $NEXT_STATE.
        ## Result
        Verdict absorbed.$PQ_BLOCK
        MEM_EOF
    ```

- [ ] **Step 4: Run test to verify it passes**

    Run: `npm test 2>&1 | grep -E "phase-6|FAIL"`
    Expected: PASS for all R28–R34 assertions.

- [ ] **Step 5: Commit**

    ```bash
    git add interpreters/mas-papers/3-search/a-tot/INSTRUCTIONS.md src/test/phase-6-tot.test.ts
    git commit -m "feat(phase-6): Goal-push + Goal-absorb (terminal eval pipeline) (satisfies: R28, R29, R30, R31, R32, R33, R34)"
    ```

---

## Task 12: Solved instruction   (satisfies: R35, R36)

**Files:**
- Modify: `interpreters/mas-papers/3-search/a-tot/INSTRUCTIONS.md`
- Modify: `src/test/phase-6-tot.test.ts` (append assertions)

- [ ] **Step 1: Write the failing test**

    Append to `src/test/phase-6-tot.test.ts`:

    ```typescript
    describe("phase-6 a-tot: Solved instruction (R35, R36)", () => {
      const s = readFileSync(resolve(INTERP, "INSTRUCTIONS.md"), "utf-8");

      test("Solved instruction exists and matches state == solved", () => {
        const sv = extractInstructionBody(s, "Solved");
        assert.ok(sv.length > 0, "Solved missing");
        assert.match(sv, /MEMORY state is "solved"/);
      });

      test("Solved emits ## Solution containing winning expression and counts (R35)", () => {
        const sv = extractInstructionBody(s, "Solved");
        assert.match(sv, /## Solution/);
        // Counts: total nodes and pruned nodes
        assert.match(sv, /grep\s+-c\s+'?\^id:\s*n'?/);
        assert.match(sv, /grep\s+-c\s+'?\^status:\s*pruned'?/);
      });

      test("Solved sets state done (R35, R36)", () => {
        const sv = extractInstructionBody(s, "Solved");
        assert.match(sv, /## State\s*\n\s*done/);
      });

      test("All eleven instructions are present (full state machine)", () => {
        const expected = [
          "Initialize", "Expand-push", "Expand-absorb",
          "Score-push", "Score-absorb", "Prune", "Advance",
          "Goal-push", "Goal-absorb", "Solved",
        ];
        for (const inst of expected) {
          assert.match(s, new RegExp(`^## Instruction:\\s*${escapeRegExp(inst)}\\b`, "m"), `missing instruction: ${inst}`);
        }
      });
    });
    ```

- [ ] **Step 2: Run test to verify it fails**

    Run: `npm test 2>&1 | grep -E "phase-6|FAIL"`
    Expected: FAIL with `Solved missing` and "missing instruction: Solved".

- [ ] **Step 3: Write minimal implementation**

    Append to `INSTRUCTIONS.md`:

    ```markdown
    ## Instruction: Solved
    **Condition:** MEMORY state is "solved"
    **Action:** Find the (single) terminal_pass node. Reconstruct its expression via parent-walk. Count total nodes and pruned nodes. Emit `## Solution` and set state `done` (R35).

        PASS_ID=$(awk '/^---$/{id=""; s=""; next} /^id:/{id=$2} /^status:/{s=$2; if (s=="terminal_pass") {print id; exit}}' ./scoped/tree.md)

        EXPR=""
        CURRENT="$PASS_ID"
        while [ "$CURRENT" != "n0" ] && [ -n "$CURRENT" ]; do
          OP=$(awk -v X="$CURRENT" '/^---$/{in_block=0;next} /^id:/{in_block=($2==X)} in_block && /^op:/{sub(/^op: /,""); print; exit}' ./scoped/tree.md)
          PARENT=$(awk -v X="$CURRENT" '/^---$/{in_block=0;next} /^id:/{in_block=($2==X)} in_block && /^parent_id:/{print $2; exit}' ./scoped/tree.md)
          if [ -z "$EXPR" ]; then EXPR="($OP)"; else EXPR="($OP); $EXPR"; fi
          CURRENT="$PARENT"
        done

        TOTAL=$(grep -c '^id: n' ./scoped/tree.md)
        PRUNED=$(grep -c '^status: pruned$' ./scoped/tree.md)

        cat > ./MEMORY.md << MEM_EOF
        ## State
        done
        ## Matched Instruction
        Solved
        ## Last Action
        Reconstructed winning expression for $PASS_ID (total=$TOTAL nodes, pruned=$PRUNED).
        ## Result
        Search complete with verified solution.
        ## Solution
        Expression: $EXPR
        Total nodes expanded: $TOTAL
        Nodes pruned: $PRUNED
        MEM_EOF

    The shell intercepts `state == done` at stack depth 1 (R36) and halts.
    ```

- [ ] **Step 4: Run test to verify it passes**

    Run: `npm test 2>&1 | grep -E "phase-6|FAIL"`
    Expected: PASS for R35, R36 and the eleven-instructions assertion.

- [ ] **Step 5: Commit**

    ```bash
    git add interpreters/mas-papers/3-search/a-tot/INSTRUCTIONS.md src/test/phase-6-tot.test.ts
    git commit -m "feat(phase-6): Solved instruction (## Solution + done) (satisfies: R35, R36)"
    ```

---

## Task 13: Demo `PROGRAM.md` (Game of 24)   (satisfies: R48, R49)

**Files:**
- Modify: `interpreters/mas-papers/3-search/a-tot/PROGRAM.md`
- Modify: `src/test/phase-6-tot.test.ts` (append assertions)

- [ ] **Step 1: Write the failing test**

    Append to `src/test/phase-6-tot.test.ts`:

    ```typescript
    describe("phase-6 a-tot: demo PROGRAM.md (R48, R49)", () => {
      test("PROGRAM.md exists", () => {
        assert.ok(existsSync(resolve(INTERP, "PROGRAM.md")), "PROGRAM.md missing");
      });
      test("PROGRAM.md contains exactly four puzzle integers + the target 24 (R48)", () => {
        const s = readFileSync(resolve(INTERP, "PROGRAM.md"), "utf-8");
        const nums = (s.match(/\b\d+\b/g) || []).map(Number);
        // Per R48: 4 puzzle numbers + the target 24 (= 5 integers in prose; the LAST is target).
        assert.equal(nums.length, 5, `expected 5 integers in PROGRAM.md prose, got ${nums.length}: ${nums.join(",")}`);
        assert.equal(nums[nums.length - 1], 24, `last integer (target) must be 24, got ${nums[nums.length - 1]}`);
      });
      test("PROGRAM.md mentions Game of 24 or 'evaluates to 24' (R49)", () => {
        const s = readFileSync(resolve(INTERP, "PROGRAM.md"), "utf-8");
        assert.match(s, /Game of 24|evaluate(?:s)? to 24|equal(?:s)? 24/i);
      });
    });
    ```

- [ ] **Step 2: Run test to verify it fails**

    Run: `npm test 2>&1 | grep -E "phase-6|FAIL"`
    Expected: FAIL — current PROGRAM.md is the placeholder from T1; integer count is 0.

- [ ] **Step 3: Write minimal implementation**

    Replace `interpreters/mas-papers/3-search/a-tot/PROGRAM.md` content with:

    ```markdown
    # Game of 24

    Find an arithmetic expression using **4, 5, 6, and 10** exactly once that evaluates to **24** using only `+`, `−`, `×`, `÷` and parentheses.

    The numbers must each be used exactly once. Intermediate results may be combined freely. The final result must equal 24.

    A solution exists for this puzzle. Your job is to find one via Tree-of-Thoughts BFS over partial states.
    ```

    (Verify integer extraction: `4`, `5`, `6`, `10`, `24` — five integers, last is 24.)

    Confirm at least one solution exists for `4 5 6 10 → 24`. Sample solution: `(10 − 6) × (5 + 4 − ?)` — actually a clean one is `4 × (10 − 6 + ?)`. Computing: `(10 − 4) × (6 − 5 + ...) `. One valid expression: `6 ÷ (5 − 4) × (10 − ...)` — let's verify by hand: `6 / (5 - 4) = 6`; we still have 10 left, so `6 × ? + 10 = 24` ⇒ `6 × ? = 14`, no. Try: `(10 − 4) × 5 − 6 = 30 − 6 = 24`. ✓ So the puzzle is solvable; the demo's correctness is a textbook fact and does not need to be hand-verified by every executor.

- [ ] **Step 4: Run test to verify it passes**

    Run: `npm test 2>&1 | grep -E "phase-6|FAIL"`
    Expected: PASS for all R48, R49 assertions.

- [ ] **Step 5: Commit**

    ```bash
    git add interpreters/mas-papers/3-search/a-tot/PROGRAM.md src/test/phase-6-tot.test.ts
    git commit -m "feat(phase-6): demo PROGRAM.md (Game of 24, 4 5 6 10 -> 24) (satisfies: R48, R49)"
    ```

---

## Task 14: Negative-requirement pins   (satisfies: R52, R53, R54, R55, R56, R57)

**Files:**
- Modify: `src/test/phase-6-tot.test.ts` (append assertions)
- (No code change — the pins fail-fast if a future PR introduces forbidden patterns.)

- [ ] **Step 1: Write the failing test**

    Append to `src/test/phase-6-tot.test.ts`:

    ```typescript
    describe("phase-6 a-tot: negative requirements (R52–R57)", () => {
      const sInst = readFileSync(resolve(INTERP, "INSTRUCTIONS.md"), "utf-8");

      test("strategy never references workspace/ for tree state (R52)", () => {
        // Must not write tree.md or any tree state to workspace/
        assert.doesNotMatch(sInst, /workspace\/(tree|frontier|nodes|search)/);
        // Must not run git checkout in workspace/ (per-branch git is deferred)
        assert.doesNotMatch(sInst, /git\s+(checkout|branch).*workspace/);
      });

      test("k=5 and b=5 are bash literals, not parsed from PROGRAM.md (R53)", () => {
        // The constants must appear as literal 5s in INSTRUCTIONS.md.
        // PROGRAM.md must not declare k or b.
        assert.match(sInst, /\bk\s*=\s*5\b|\b5\b.*candidates|exactly\s+5/i);
        const sProg = readFileSync(resolve(INTERP, "PROGRAM.md"), "utf-8");
        assert.doesNotMatch(sProg, /\bk\s*[=:]\s*\d|\bb\s*[=:]\s*\d/i);
      });

      test("no Graph-of-Thoughts variant in dynamics/ (R54)", () => {
        const dyns = readdirSync(resolve(INTERP, "dynamics"));
        for (const d of dyns) {
          assert.doesNotMatch(d, /aggregate|graph|merge/i, `unexpected GoT-style dynamic ${d}`);
        }
      });

      test("no retry/budget/restart/early-termination beyond BFS schedule (R55)", () => {
        // No retry counters, no max_iterations, no time budgets in INSTRUCTIONS.md
        assert.doesNotMatch(sInst, /\b(retry|attempts_left|budget|max_iterations|time_limit)\b/i);
      });

      test("dynamics never reach into parent scoped/ (R56)", () => {
        for (const dyn of ["expand-node.md", "score.md", "score.md"]) {
          const s = readFileSync(resolve(INTERP, "dynamics", dyn), "utf-8");
          // No paths like ../../frames/f000-strategy/scoped/ or ../scoped/ from a dynamic frame
          assert.doesNotMatch(s, /\.\.\/scoped\//);
          assert.doesNotMatch(s, /frames\/f000-strategy\/scoped/);
        }
      });

      test("no concurrency primitives in INSTRUCTIONS.md or dynamics (R57)", () => {
        const allFiles = [
          sInst,
          readFileSync(resolve(INTERP, "dynamics/expand-node.md"), "utf-8"),
          readFileSync(resolve(INTERP, "dynamics/score.md"), "utf-8"),
          readFileSync(resolve(INTERP, "dynamics/evaluate.md"), "utf-8"),
        ];
        for (const f of allFiles) {
          assert.doesNotMatch(f, /xargs\s+-P\b/);
          assert.doesNotMatch(f, /parallel\s+--/);
          assert.doesNotMatch(f, /\&\s*$/m);  // bash-background suffix
        }
      });
    });
    ```

- [ ] **Step 2: Run test to verify it fails**

    Run: `npm test 2>&1 | grep -E "phase-6|FAIL"`
    Expected: ALL PASS — the implementation tasks (T3–T13) already conform; this task pins the conformance so future PRs can't regress. (If any assertion fails, fix the offending instruction or dynamic before continuing.)

- [ ] **Step 3: Write minimal implementation**

    No code change required. If Step 2 surfaced any failure, fix the offending file by removing the forbidden pattern, then re-run.

- [ ] **Step 4: Run test to verify it passes**

    Run: `npm test 2>&1 | grep -E "phase-6|FAIL"`
    Expected: PASS for R52–R57 pins.

- [ ] **Step 5: Commit**

    ```bash
    git add src/test/phase-6-tot.test.ts
    git commit -m "test(phase-6): negative-requirement pins (no workspace, k/b literal, no concurrency, etc.) (satisfies: R52, R53, R54, R55, R56, R57)"
    ```

---

## Task 15: Leaf README full content + smoke-check note   (satisfies: R3, R50)

**Files:**
- Modify: `interpreters/mas-papers/3-search/a-tot/README.md`
- Modify: `src/test/phase-6-tot.test.ts` (append assertions)

- [ ] **Step 1: Write the failing test**

    Append to `src/test/phase-6-tot.test.ts`:

    ```typescript
    describe("phase-6 a-tot: leaf README content (R3, R50)", () => {
      const path = resolve(INTERP, "README.md");
      test("leaf README cites Yao et al. arXiv:2305.10601 (R3)", () => {
        const s = readFileSync(path, "utf-8");
        assert.match(s, /Yao\s+et\s+al/i);
        assert.match(s, /2305\.10601/);
      });
      test("leaf README contains a state-machine summary (R3)", () => {
        const s = readFileSync(path, "utf-8");
        assert.match(s, /Initialize/);
        assert.match(s, /Expand-push|expanding/);
        assert.match(s, /Score-push|scoring/);
        assert.match(s, /Prune|pruning/);
        assert.match(s, /Advance|advancing/);
        assert.match(s, /Goal-push|goal_checking/);
        assert.match(s, /Solved|solved/);
      });
      test("leaf README contains the dynamics-and-contracts table (R3)", () => {
        const s = readFileSync(path, "utf-8");
        assert.match(s, /expand-node\.md/);
        assert.match(s, /score\.md/);
        assert.match(s, /evaluate\.md/);
      });
      test("leaf README contains run instructions (R3)", () => {
        const s = readFileSync(path, "utf-8");
        assert.match(s, /new-instance\.sh/);
        assert.match(s, /run\.sh/);
      });
      test("leaf README has Notable behaviour section with cycle-cost note (R3)", () => {
        const s = readFileSync(path, "utf-8");
        assert.match(s, /Notable behaviour/i);
        assert.match(s, /cycle|dispatch/);
      });
      test("leaf README mentions 3× sampling fidelity choice and the weight mapping (R3)", () => {
        const s = readFileSync(path, "utf-8");
        assert.match(s, /3[× ]\s*sampl|3\s*samples?|three samples/i);
        assert.match(s, /sure\s*=\s*20|sure.*20/);
      });
      test("leaf README includes Run-it smoke check covering R50 demo end-state shape", () => {
        const s = readFileSync(path, "utf-8");
        assert.match(s, /## Solution|## No Solution Found/);
        assert.match(s, /scoped\/tree\.md/);
      });
    });
    ```

- [ ] **Step 2: Run test to verify it fails**

    Run: `npm test 2>&1 | grep -E "phase-6|FAIL"`
    Expected: FAIL — leaf README is still the T1 skeleton.

- [ ] **Step 3: Write minimal implementation**

    Replace `interpreters/mas-papers/3-search/a-tot/README.md` with:

    ```markdown
    # a — Tree of Thoughts

    *Yao et al., NeurIPS 2023, arXiv:2305.10601. See `docs/agent-workflows/patterns.md` §Group 3 — Search.*

    ## What's modeled

    Explicit BFS over partial Game-of-24 states. At each depth the strategy expands every live node into k=5 candidates (`expand-node.md`), scores each candidate 3× with discrete `sure | likely | impossible` labels (`score.md`), aggregates by Yao et al.'s weighted sum (sure=20, likely=1, impossible=0.001), keeps the top b=5 per level, and at depth = N − 1 (= 3 for the bundled 4-number puzzle) checks each surviving terminal expression with `evaluate.md` for pass/fail.

    The defining contrast with Group 1 (refinement) is that Group 3 explores *alternatives* rather than iterating on one solution — the tree is the artefact, not a single best draft.

    ## State machine

    Eleven instructions. Two-cycle push/absorb pattern per dispatch (push instruction emits `## Push`, dynamic runs and pops with `## Return`, absorb instruction consumes the spliced result and routes via the Phase-router):

    ```
    empty                  → Initialize    → expanding
    expanding              → Expand-push   → expanding (shell pop → expanding_completed)
    expanding_completed    → Expand-absorb → expanding | scoring | pruning   (Phase-router)
    scoring                → Score-push    → scoring (shell pop → scoring_completed)
    scoring_completed      → Score-absorb  → scoring | expanding | pruning   (Phase-router)
    pruning                → Prune         → advancing | done (R37 dead-end)
    advancing              → Advance       → expanding | goal_checking
    goal_checking          → Goal-push     → goal_checking (shell pop → goal_checking_completed)
    goal_checking_completed→ Goal-absorb   → goal_checking | solved | done (R34)
    solved                 → Solved        → done
    done                   → (shell halts at stack depth 1)
    ```

    Tree state lives in the strategy frame's `./scoped/tree.md` as an append-only YAML-block ledger; every field update is an awk-based surgical edit (R12).

    ## Dynamics

    | File | Push-args | Returns | Stack depth from caller |
    | ---- | --------- | ------- | ----------------------- |
    | `dynamics/expand-node.md` | `parent_thought`, `target`, `numbers_remaining` | `children` (5 op/left pairs) | 1 |
    | `dynamics/score.md` | `thought`, `target` | `value` ∈ {`sure`, `likely`, `impossible`} | 1 (pushed 3× per child) |
    | `dynamics/evaluate.md` | `attempt`, `criterion` | `verdict` ∈ {`pass`, `fail`}, `feedback` | 1 |

    `evaluate.md` is the canonical 1b copy, byte-equal — pinned by `src/test/phase-operators-identity.test.ts`.

    ## Demo `PROGRAM.md`

    "Find an arithmetic expression using 4, 5, 6, and 10 exactly once that evaluates to 24 using only `+`, `−`, `×`, `÷` and parentheses." A solution exists (e.g. `(10 − 4) × 5 − 6 = 24`).

    ## Run it

    ```bash
    ./new-instance.sh my-tot interpreters/mas-papers/3-search/a-tot
    instances/my-tot/run.sh
    ```

    After completion, inspect:

    - `instances/my-tot/frames/f000-strategy/MEMORY.md` for `## Solution` (or `## No Solution Found` if the search exhausted).
    - `instances/my-tot/frames/f000-strategy/scoped/tree.md` for the full search ledger — depth-coverage, b=5 cap, samples-per-node invariants are all visible there.

    ## Notable behaviour

    - **Cycle cost (~540 LLM cycles per puzzle worst case).** The bounded BFS schedule is k=5 children, b=5 retained, depth=N−1, plus 3 score samples per child and the two-cycle push/absorb dispatch pattern. Worst case: ~11 expand dispatches + ~165 score dispatches + ≤5 evaluate dispatches ≈ 181 dispatches × 3 LLM cycles each ≈ 540 cycles. The "~200" figure cited in spec requirement R3 refers to *dispatches*, not LLM cycles — both numbers are stated here so the discrepancy doesn't bite later readers.
    - **3× value-sampling fidelity** per Yao et al. 2023. Each child node is scored three times by `score.md`; the three label outputs are aggregated by weighted sum (`sure=20`, `likely=1`, `impossible=0.001`). Range: `[0.003, 60]`. This matches the reference implementation at github.com/princeton-nlp/tree-of-thought-llm verbatim.
    - **No retry, no early termination beyond BFS.** A failed puzzle just halts with `## No Solution Found`. The bounded depth means there is no infinite-loop risk; conversely, there is no second-pass, no tree restart, no temperature ramp.
    - **Malformed dynamic outputs are non-blocking.** Bad `expand-node` children, malformed `score.md` labels, or unexpected `evaluate.md` verdicts append a `## Pending Questions` entry and otherwise progress (treated as `impossible` / `fail` respectively). The strategy never transitions to `waiting_for_user` for soft errors — only at Initialize when PROGRAM.md is genuinely missing input.
    - **Project-git per branch is deferred.** The source spec mentions per-branch `workspace/` git as a future integration; Game of 24 has no per-branch artefacts, so the integration is out of scope here. Phase 6b (LATS) or a future code-search demo is the natural place to introduce it.
    ```

- [ ] **Step 4: Run test to verify it passes**

    Run: `npm test 2>&1 | grep -E "phase-6|FAIL"`
    Expected: PASS for all R3 and R50 README assertions.

- [ ] **Step 5: Commit**

    ```bash
    git add interpreters/mas-papers/3-search/a-tot/README.md src/test/phase-6-tot.test.ts
    git commit -m "docs(phase-6): leaf README with state machine, dynamics, run-it + Notable behaviour (satisfies: R3, R50)"
    ```

---

## Task 16: Source-spec dynamics-table update   (satisfies: R4)

**Files:**
- Modify: `docs/agent-workflows/requirements.md`
- Create: `src/test/phase-6-source-spec.test.ts` (or extend phase-6-tot.test.ts; new file is cleaner)

- [ ] **Step 1: Write the failing test**

    Append to `src/test/phase-6-tot.test.ts` (alternative to a separate file):

    ```typescript
    describe("phase-6 source-spec dynamics-table (R4)", () => {
      const SOURCE = resolve(REPO, "docs/agent-workflows/requirements.md");
      test("source spec dynamics table has a row for expand-node.md returning ## Children only (R4)", () => {
        const s = readFileSync(SOURCE, "utf-8");
        // Match a table row: | `expand-node.md` | 6 | ... | ## Children | 1 |
        assert.match(s, /\|\s*`expand-node\.md`\s*\|\s*6\s*\|[^|]*\|\s*`?##\s*Children`?\s*\|\s*1\s*\|/);
      });
      test("source spec dynamics table has a row for score.md returning ## Value (R4)", () => {
        const s = readFileSync(SOURCE, "utf-8");
        assert.match(s, /\|\s*`score\.md`\s*\|\s*6\s*\|[^|]*\|\s*`?##\s*Value`?\s*\|\s*1\s*\|/);
      });
      test("source spec no longer has the deprecated combined row 'expand-node.md … ## Children, ## Value … N' (R4)", () => {
        const s = readFileSync(SOURCE, "utf-8");
        assert.doesNotMatch(s, /\|\s*`expand-node\.md`\s*\|[^|]*\|[^|]*\|\s*`?##\s*Children`?\s*,\s*`?##\s*Value`?\s*\|/);
      });
      test("source spec includes a rationale paragraph mentioning evaluate.md and graded ranking (R4)", () => {
        const s = readFileSync(SOURCE, "utf-8");
        // Locate Phase-6 section, look for rationale near the dynamics table mention
        assert.match(s, /graded\s+ranking|grading.*pass\/fail|two\s+(?:single-purpose\s+)?dynamics/i);
      });
    });
    ```

- [ ] **Step 2: Run test to verify it fails**

    Run: `npm test 2>&1 | grep -E "phase-6|FAIL"`
    Expected: FAIL — source spec still has the original combined row.

- [ ] **Step 3: Write minimal implementation**

    Edit `docs/agent-workflows/requirements.md`. In the "Reusable dynamics library" table near the top of the file, locate the line:

    ```
    | `expand-node.md` | 6 | `## Parent Thought` | `## Children`, `## Value` | N |
    ```

    Replace it with two rows:

    ```
    | `expand-node.md` | 6 | `## Parent Thought` | `## Children` | 1 |
    | `score.md`       | 6 | `## Thought`        | `## Value`    | 1 |
    ```

    Then locate the `## Phase 6 — Search: Tree of Thoughts` section and append a paragraph after the deliverable line and before "Optional variant — GoT":

    ```markdown
    **Why two dynamics, not one.** An earlier draft of the Phase 6 dynamics table conflated child-generation with graded ranking inside `expand-node.md`. During Phase 6 spec work the contracts were split: `expand-node.md` returns only `## Children`, and a new `score.md` returns `## Value` ∈ {sure, likely, impossible}. The split honours `evaluate.md`'s pass/fail contract (used by 1b, 1c, 4a, 4b — multiple consumers), avoids coercing a graded-ranking signal through a pass/fail-shaped channel, and exposes `score.md` as a candidate second-consumer surface for Phase 6b (LATS). Deviates deliberately from guiding principle 5 ("no speculative dynamics — promote only on second use"); LATS is expected to validate the deviation by adopting `score.md` for its rollout-value role.
    ```

- [ ] **Step 4: Run test to verify it passes**

    Run: `npm test 2>&1 | grep -E "phase-6|FAIL"`
    Expected: PASS for all R4 assertions.

- [ ] **Step 5: Commit**

    ```bash
    git add docs/agent-workflows/requirements.md src/test/phase-6-tot.test.ts
    git commit -m "docs(phase-6): split expand-node.md / score.md in dynamics table + rationale (satisfies: R4)"
    ```

---

## Self-review checklist (for the executor before declaring Phase 4 done)

- [ ] Every R# from `requirements.md` (R1–R57) appears in at least one task's `(satisfies: …)` tag.
- [ ] Every task heading ends with `(satisfies: R#, …)`.
- [ ] No `// TODO`, `// fill in`, or "see other task" placeholders in any code step.
- [ ] All commit messages reference the task's R# tag.
- [ ] After T16, `npm test` runs green end-to-end, including `phase-operators-identity.test.ts` and the new `phase-6-tot.test.ts`.
- [ ] After T16, the smoke-check in T15's "Run it" section is *manually* executed once on a default provider (Claude Code or Anthropic API) and produces either `## Solution` (preferred) or `## No Solution Found` for the demo PROGRAM.md. R50's full end-state assertions are validated here, not in `npm test`.
