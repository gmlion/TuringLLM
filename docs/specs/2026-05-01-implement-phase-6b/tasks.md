# Tasks: implement-phase-6b

> **For executors:** use `kiro-flow:spec-execute` (it wraps `superpowers:subagent-driven-development` or `superpowers:executing-plans`). Each task below is TDD-shaped — write the failing test first, then minimal code, then verify, then commit. Commit messages must reference the task's `(satisfies: R#)` tag.

> **Note on shape:** this phase delivers two things at once — (a) an in-place refactor of Phase 6's dynamics + strategy + ledger to drop Game-of-24 vocabulary and move per-node state into per-node files; (b) a new LATS interpreter at `interpreters/mas-papers/3-search/b-lats/` that reuses the refactored dynamics byte-equal and adds a single new dynamic (`rollout.md`). Both are delivered primarily as markdown artefacts; the "failing test" in each task is a regex-pattern assertion against the markdown — same shape as `src/test/phase-6-tot.test.ts`. Bash pseudocode bodies referenced below are specified in full in `docs/specs/2026-05-01-implement-phase-6b/design.md`; executors should copy those bodies verbatim where this file says "the body specified in design.md §<section>".

> **Build/test commands:** the repo uses `npm test` (which runs `npm run build` first). To narrow output during TDD: `npm test 2>&1 | grep -E "phase-6|FAIL|✘"`. After writing markdown, no rebuild is needed (tests load markdown via `readFileSync`), but `npm test` still rebuilds TypeScript — that's expected.

> **Ordering rule:** Phase 6 dynamics (T1, T2) MUST be refactored before LATS copies them byte-equal (T8). Phase 6 strategy/ledger (T3–T5) MUST be refactored before the Phase 6 README delta (T6) lands. The LATS interpreter is built bottom-up: scaffold (T7–T11) → strategy (T12–T19) → finalisation (T20–T23).

## Task index

| #   | Summary                                                                | Satisfies                                          |
| --- | ---------------------------------------------------------------------- | -------------------------------------------------- |
| T1  | Refactor `expand-node.md` to domain-agnostic                            | R14, R16, R30, R32, R33                            |
| T2  | Refactor `score.md` to domain-agnostic                                  | R15, R16, R31, R32, R33                            |
| T3  | Phase 6 Initialize delta + ledger schema (root)                         | R17, R18, R19, R24, R25                            |
| T4  | Phase 6 Expand-push + Expand-absorb + Score-push (push-arg shape, per-node state files) | R19, R20, R21, R26                  |
| T5  | Phase 6 Goal-push + Solved deltas (drop parent-walk)                    | R22, R23                                           |
| T6  | Phase 6 leaf README delta + BFS-preservation regression test            | R27, R29, R84                                      |
| T7  | Bootstrap LATS dir + group README delta + test-file skeleton            | R1, R2, R4, R5, R72                                |
| T8  | Copy three reused dynamics into `b-lats/dynamics/`                      | R6, R7, R8                                         |
| T9  | Extend `phase-operators-identity.test.ts` for the three reused copies    | R9                                                 |
| T10 | LATS demo `PROGRAM.md` (byte-equal Phase 6)                             | R69                                                |
| T11 | New `rollout.md` dynamic                                                | R10, R11, R12, R13                                 |
| T12 | LATS strategy preamble + Initialize                                     | R34, R35, R36                                      |
| T13 | LATS tree ledger primitives + per-node state files + lessons convention | R37, R38, R39, R40, R41, R42, R43                  |
| T14 | LATS Compose-partial-state primitive + ancestor walk                    | R48, R64, R65, R66                                 |
| T15 | LATS Select instruction + UCT formula                                   | R44, R45, R46                                      |
| T16 | LATS Expand-push + Expand-absorb (chosen_child, R50 fallback)           | R47, R49, R50                                      |
| T17 | LATS Simulate-push + Simulate-absorb (rollout + evaluate dispatch)      | R51, R52, R53                                      |
| T18 | LATS Evaluate-absorb + Back-prop primitive + solve termination          | R54, R55, R56, R57, R67, R68, R82                  |
| T19 | LATS Reflect-push + Reflect-absorb + budget exhaustion                  | R58, R59, R60, R61, R62, R63                       |
| T20 | LATS leaf README full content + smoke-check                             | R3, R70, R71                                       |
| T21 | LATS negative-requirement pins                                          | R76, R77, R78, R79, R80, R81, R83                  |
| T22 | Source-spec parent doc updates                                          | R73, R74, R75                                      |
| T23 | Backwards-compatibility pins (Phase 6 spec untouched, instances)        | R28, R85, R86                                      |

---

## Task 1: Refactor `expand-node.md` to domain-agnostic   (satisfies: R14, R16, R30, R32, R33)

**Files:**
- Modify: `interpreters/mas-papers/3-search/a-tot/dynamics/expand-node.md`
- Modify: `src/test/phase-6-tot.test.ts`

- [ ] **Step 1: Write the failing test**

    In `src/test/phase-6-tot.test.ts`, find the existing `describe("phase-6 a-tot: expand-node.md dynamic …")` block (or its equivalent — search for `dynamics/expand-node.md`) and **replace** it with the post-refactor assertions:

    ```typescript
    describe("phase-6 a-tot: expand-node.md dynamic (post-refactor R14, R30)", () => {
      const path = resolve(INTERP, "dynamics/expand-node.md");

      test("dynamics/expand-node.md exists", () => {
        assert.ok(existsSync(path), "expand-node.md missing");
      });

      test("expand-node.md declares only {{partial_state}} and {{task}} push-args (R14, R30)", () => {
        const s = readFileSync(path, "utf-8");
        assert.match(s, /\{\{partial_state\}\}/);
        assert.match(s, /\{\{task\}\}/);
        // Must NOT contain pre-refactor placeholders
        assert.doesNotMatch(s, /\{\{parent_thought\}\}/);
        assert.doesNotMatch(s, /\{\{target\}\}/);
        assert.doesNotMatch(s, /\{\{numbers_remaining\}\}/);
      });

      test("expand-node.md returns ## Return children: | with state: entries (R30)", () => {
        const s = readFileSync(path, "utf-8");
        assert.match(s, /## Return\s*\n\s*children:\s*\|/);
        assert.match(s, /state:\s*\|/);
        // Must NOT contain pre-refactor return shape
        assert.doesNotMatch(s, /^op:\s/m);
        assert.doesNotMatch(s, /^left:\s/m);
      });

      test("expand-node.md is single-cycle and pushes nothing further (R33)", () => {
        const s = readFileSync(path, "utf-8");
        // single ## Instruction matching "Generate children" or similar
        const matches = s.match(/^## Instruction:/gm) || [];
        assert.equal(matches.length, 1, "expand-node.md must have exactly one instruction");
        // No further push
        assert.doesNotMatch(s, /^## Push\s*$/m);
      });

      test("expand-node.md prose is domain-agnostic (R32)", () => {
        const s = readFileSync(path, "utf-8");
        for (const banned of ["Game of 24", "arithmetic", "numbers_remaining", "parent_thought"]) {
          assert.ok(!s.includes(banned), `expand-node.md contains banned domain word: "${banned}"`);
        }
        // The Game-of-24 op symbols must not appear as bullet items / rule statements
        for (const sym of ["+", "−", "×", "÷"]) {
          // permissive: allow these in surrounding markdown noise (none expected); strict check elsewhere
          assert.ok(!s.includes(`Apply one of`), "expand-node.md must not enumerate operators");
        }
      });
    });
    ```

- [ ] **Step 2: Run test to verify it fails**

    Run: `npm test 2>&1 | grep -E "phase-6|FAIL"`
    Expected: FAIL with `expand-node.md contains banned domain word` (because the file currently contains "Game of 24", "arithmetic", "numbers_remaining", `parent_thought`); also FAIL on placeholder assertions because `{{parent_thought}}` is still present.

- [ ] **Step 3: Write minimal implementation**

    **Replace** the entire contents of `interpreters/mas-papers/3-search/a-tot/dynamics/expand-node.md` with the body specified in `design.md §Interfaces — `expand-node.md` (post-refactor)`. Reproduced here for completeness:

    ````markdown
    # Dynamic: Expand Node

    Receives push-args: {{partial_state}}, {{task}}.
    Produces: ## State done + ## Return block with key `children`.

    This dynamic is invoked by a search interpreter once per live unexpanded tree
    node. One invocation generates exactly k=5 candidate next states by reading the
    task definition in {{task}} and extending the partial state below by one
    forward step per candidate.

    ## Instruction: Generate children
    **Condition:** MEMORY state is "empty"
    **Action:** Read the task definition in {{task}}. Generate exactly k=5
    candidate next states that extend {{partial_state}} according to the task's
    rules. Each candidate is a single forward step from {{partial_state}}; the
    returned `state:` payload should describe the partial state *after* that step
    applies (in the same prose form the task uses). Prefer diverse next steps;
    avoid emitting five identical candidates.

    Write ./MEMORY.md with this EXACT shape (the ## Return block MUST be in the
    same heredoc as the state change):

    ```
    cat > ./MEMORY.md << 'MEMEOF'
    ## State
    done
    ## Matched Instruction
    Generate children
    ## Last Action
    Generated five candidate next states for the partial state.
    ## Result
    Children produced.
    ## Return
    children: |
      state: |
        <partial state after extension 1, every line indented four spaces>
      state: |
        <partial state after extension 2, every line indented four spaces>
      state: |
        <partial state after extension 3, every line indented four spaces>
      state: |
        <partial state after extension 4, every line indented four spaces>
      state: |
        <partial state after extension 5, every line indented four spaces>
    MEMEOF
    ```

    Task definition:
    {{task}}

    Partial state to extend:
    {{partial_state}}
    ````

- [ ] **Step 4: Run test to verify it passes**

    Run: `npm test 2>&1 | grep -E "phase-6|FAIL"`
    Expected: PASS for the four R14/R30/R32/R33 assertions added in Step 1; no FAIL output.

- [ ] **Step 5: Commit**

    ```bash
    git add interpreters/mas-papers/3-search/a-tot/dynamics/expand-node.md src/test/phase-6-tot.test.ts
    git commit -m "refactor(phase-6): expand-node.md domain-agnostic; partial_state/task push-args (satisfies: R14, R16, R30, R32, R33)"
    ```

---

## Task 2: Refactor `score.md` to domain-agnostic   (satisfies: R15, R16, R31, R32, R33)

**Files:**
- Modify: `interpreters/mas-papers/3-search/a-tot/dynamics/score.md`
- Modify: `src/test/phase-6-tot.test.ts`

- [ ] **Step 1: Write the failing test**

    In `src/test/phase-6-tot.test.ts`, find the existing `describe("phase-6 a-tot: score.md dynamic …")` block and **replace** it:

    ```typescript
    describe("phase-6 a-tot: score.md dynamic (post-refactor R15, R31)", () => {
      const path = resolve(INTERP, "dynamics/score.md");

      test("dynamics/score.md exists", () => {
        assert.ok(existsSync(path), "score.md missing");
      });

      test("score.md declares only {{partial_state}} and {{task}} push-args (R15, R31)", () => {
        const s = readFileSync(path, "utf-8");
        assert.match(s, /\{\{partial_state\}\}/);
        assert.match(s, /\{\{task\}\}/);
        assert.doesNotMatch(s, /\{\{thought\}\}/);
        assert.doesNotMatch(s, /\{\{target\}\}/);
      });

      test("score.md returns ## Return value: with sure/likely/impossible enum (R31)", () => {
        const s = readFileSync(path, "utf-8");
        assert.match(s, /## Return\s*\n\s*value:/);
        for (const lbl of ["sure", "likely", "impossible"]) {
          assert.ok(s.includes(lbl), `score.md missing label: ${lbl}`);
        }
      });

      test("score.md is single-cycle and pushes nothing further (R33)", () => {
        const s = readFileSync(path, "utf-8");
        const matches = s.match(/^## Instruction:/gm) || [];
        assert.equal(matches.length, 1);
        assert.doesNotMatch(s, /^## Push\s*$/m);
      });

      test("score.md prose is domain-agnostic (R32)", () => {
        const s = readFileSync(path, "utf-8");
        for (const banned of ["Game of 24", "arithmetic", "thought", "{1, 1, 1}", "{12, 2}"]) {
          assert.ok(!s.includes(banned), `score.md contains banned domain word: "${banned}"`);
        }
      });
    });
    ```

- [ ] **Step 2: Run test to verify it fails**

    Run: `npm test 2>&1 | grep -E "phase-6|FAIL"`
    Expected: FAIL with `score.md contains banned domain word` (current file mentions Game of 24, "thought" placeholder, etc.).

- [ ] **Step 3: Write minimal implementation**

    **Replace** the entire contents of `interpreters/mas-papers/3-search/a-tot/dynamics/score.md` with the body specified in `design.md §Interfaces — `score.md` (post-refactor)`. Reproduced:

    ````markdown
    # Dynamic: Score

    Receives push-args: {{partial_state}}, {{task}}.
    Produces: ## State done + ## Return block with key `value` set to one of
    `sure`, `likely`, or `impossible`.

    This dynamic is invoked by a search interpreter to judge whether a partial
    state can plausibly satisfy the task's success criterion. The strategy
    typically aggregates multiple invocations.

    ## Instruction: Score state
    **Condition:** MEMORY state is "empty"
    **Action:** Read the task definition in {{task}}. Judge whether
    {{partial_state}} can plausibly be extended into a state that satisfies the
    task. Output exactly one label:

      - sure: the task can definitely be satisfied from this partial state (e.g.
        the partial state already satisfies the task, or one obvious extension
        away).
      - likely: feasible but not obvious (further extensions are needed and the
        path forward is plausible but uncertain).
      - impossible: commonsense rules out completion from this partial state.

    Write ./MEMORY.md with this EXACT shape (the ## Return block MUST be in the
    same heredoc as the state change):

    ```
    cat > ./MEMORY.md << 'MEMEOF'
    ## State
    done
    ## Matched Instruction
    Score state
    ## Last Action
    Scored partial state for task plausibility; popping.
    ## Result
    Score produced.
    ## Return
    value: <one of: sure, likely, impossible>
    MEMEOF
    ```

    Task definition:
    {{task}}

    Partial state to score:
    {{partial_state}}
    ````

- [ ] **Step 4: Run test to verify it passes**

    Run: `npm test 2>&1 | grep -E "phase-6|FAIL"`
    Expected: PASS for the five R15/R31/R32/R33 assertions; no FAIL output.

- [ ] **Step 5: Commit**

    ```bash
    git add interpreters/mas-papers/3-search/a-tot/dynamics/score.md src/test/phase-6-tot.test.ts
    git commit -m "refactor(phase-6): score.md domain-agnostic; partial_state/task push-args (satisfies: R15, R16, R31, R32, R33)"
    ```

---

## Task 3: Phase 6 Initialize delta + ledger schema (root)   (satisfies: R17, R18, R19, R24, R25)

**Files:**
- Modify: `interpreters/mas-papers/3-search/a-tot/INSTRUCTIONS.md`
- Modify: `src/test/phase-6-tot.test.ts`

- [ ] **Step 1: Write the failing test**

    In `src/test/phase-6-tot.test.ts`, find the existing `describe("phase-6 a-tot: Initialize …")` block and **replace** it (and any tree-ledger schema describe block) with:

    ```typescript
    describe("phase-6 a-tot: Initialize post-refactor (R17, R18, R19)", () => {
      const path = resolve(INTERP, "INSTRUCTIONS.md");
      const s = readFileSync(path, "utf-8");
      const init = extractInstructionBody(s, "Initialize");

      test("Initialize copies PROGRAM.md to ./scoped/task.md (R17)", () => {
        assert.match(init, /cp\s+\.\.\/\.\.\/PROGRAM\.md\s+\.\/scoped\/task\.md/);
      });

      test("Initialize root node block has only post-refactor schema fields (R18)", () => {
        // Look at the heredoc that writes the root node — must have id, parent_id,
        // depth, value, samples, status, but NOT op or left.
        // Extract the ROOT_EOF heredoc body
        const m = init.match(/<< ROOT_EOF([\s\S]+?)ROOT_EOF/);
        assert.ok(m, "Initialize must contain a ROOT_EOF heredoc for tree.md root block");
        const body = m[1];
        for (const k of ["id:", "parent_id:", "depth:", "value:", "samples:", "status:"]) {
          assert.ok(body.includes(k), `root block missing field: ${k}`);
        }
        for (const k of ["op:", "left:"]) {
          assert.ok(!body.includes(k), `root block must NOT contain pre-refactor field: ${k}`);
        }
      });

      test("Initialize creates ./scoped/state-n0.md (R19)", () => {
        assert.match(init, /\.\/scoped\/state-n0\.md/);
      });
    });

    describe("phase-6 a-tot: tree ledger schema post-refactor (R24)", () => {
      const path = resolve(INTERP, "INSTRUCTIONS.md");
      const s = readFileSync(path, "utf-8");

      test("INSTRUCTIONS.md does not mention `op:` or `left:` as ledger fields anywhere (R18, R24)", () => {
        // Scope: ledger-related contexts. We assert the bare regexes don't appear
        // as field-name lines (left of colon at start of line).
        assert.doesNotMatch(s, /^\s*op:\s/m);
        assert.doesNotMatch(s, /^\s*left:\s/m);
      });

      test("INSTRUCTIONS.md references ./scoped/state-<id> per-node files (R25)", () => {
        assert.match(s, /\.\/scoped\/state-/);
      });
    });
    ```

    (`extractInstructionBody` is the existing helper at the top of the test file.)

- [ ] **Step 2: Run test to verify it fails**

    Run: `npm test 2>&1 | grep -E "phase-6|FAIL"`
    Expected: FAIL on `Initialize copies PROGRAM.md to ./scoped/task.md` (current Initialize doesn't), and FAIL on `root block must NOT contain pre-refactor field: op:` (current root block has op/left).

- [ ] **Step 3: Write minimal implementation**

    Edit `interpreters/mas-papers/3-search/a-tot/INSTRUCTIONS.md`:

    1. **In the strategy preamble** (the prose between `# Strategy` and the first `## Instruction`), add a sentence to the "Scoped files" list documenting the new entries — `task.md` and `state-<id>.md`.

    2. **Replace the Initialize instruction body** so that:
       - After parsing numbers/target and writing existing scoped files, add: `cp ../../PROGRAM.md ./scoped/task.md`.
       - The root-block heredoc drops `op: -` and `left: $PUZZLE` lines.
       - After writing `tree.md`, add `> ./scoped/state-n0.md` (creates an empty file; this is the LLM-facing partial state for the root, see design.md §Interfaces — Phase 6 Initialize delta).

    The exact post-refactor Initialize body is the design.md §Interfaces — Phase 6 Initialize delta sketch, applied on top of the existing Phase-6 Initialize. The minimum diff is: insert `cp` and `> ./scoped/state-n0.md` lines, and remove `op:` / `left:` lines from the root heredoc.

    For clarity here is the resulting Initialize success path (the `INIT_FAIL_EOF` waiting_for_user branch from Phase 6 R6 stays unchanged):

    ```bash
        TARGET=$(echo $NUMBERS_ALL | awk '{print $NF}')
        PUZZLE=$(echo $NUMBERS_ALL | awk '{$NF=""; print}' | sed 's/ *$//')
        N=$(echo $PUZZLE | wc -w)
        MAX_DEPTH=$((N - 1))

        echo "$PUZZLE"    > ./scoped/numbers.md
        echo "$TARGET"    > ./scoped/target.md
        echo "$MAX_DEPTH" > ./scoped/max_depth.md
        echo 0            > ./scoped/current_depth.md

        cp ../../PROGRAM.md ./scoped/task.md

        cat > ./scoped/tree.md << ROOT_EOF
        ---
        id: n0
        parent_id: -
        depth: 0
        value: 0
        samples: 0
        status: live
        ROOT_EOF

        > ./scoped/state-n0.md
    ```

    The MEMORY heredoc (`INIT_OK_EOF`) is unchanged.

- [ ] **Step 4: Run test to verify it passes**

    Run: `npm test 2>&1 | grep -E "phase-6|FAIL"`
    Expected: PASS for all R17/R18/R19/R24/R25 assertions added in Step 1.

- [ ] **Step 5: Commit**

    ```bash
    git add interpreters/mas-papers/3-search/a-tot/INSTRUCTIONS.md src/test/phase-6-tot.test.ts
    git commit -m "refactor(phase-6): Initialize copies PROGRAM.md to task.md; ledger drops op/left at root (satisfies: R17, R18, R19, R24, R25)"
    ```

---

## Task 4: Phase 6 Expand-push + Expand-absorb + Score-push deltas   (satisfies: R19, R20, R21, R26)

**Files:**
- Modify: `interpreters/mas-papers/3-search/a-tot/INSTRUCTIONS.md`
- Modify: `src/test/phase-6-tot.test.ts`

- [ ] **Step 1: Write the failing test**

    In `src/test/phase-6-tot.test.ts`, replace the existing `Expand-push`/`Expand-absorb`/`Score-push` describe blocks with the post-refactor ones:

    ```typescript
    describe("phase-6 a-tot: Expand-push post-refactor (R20)", () => {
      const path = resolve(INTERP, "INSTRUCTIONS.md");
      const s = readFileSync(path, "utf-8");
      const ep = extractInstructionBody(s, "Expand-push");

      test("Expand-push push-args are partial_state and task only (R20)", () => {
        assert.match(ep, /partial_state:\s*\|/);
        assert.match(ep, /task:\s*\|/);
        // No pre-refactor push-args
        assert.doesNotMatch(ep, /parent_thought:/);
        assert.doesNotMatch(ep, /numbers_remaining:/);
        assert.doesNotMatch(ep, /^\s*target:\s/m);
      });

      test("Expand-push reads partial_state from ./scoped/state-${ID}.md (R20)", () => {
        assert.match(ep, /\.\/scoped\/state-\$\{?ID\}?\.md/);
      });

      test("Expand-push reads task from ./scoped/task.md (R20)", () => {
        assert.match(ep, /\.\/scoped\/task\.md/);
      });
    });

    describe("phase-6 a-tot: Expand-absorb post-refactor (R21)", () => {
      const path = resolve(INTERP, "INSTRUCTIONS.md");
      const s = readFileSync(path, "utf-8");
      const ea = extractInstructionBody(s, "Expand-absorb");

      test("Expand-absorb parses ## Children as state: entries (R21)", () => {
        assert.match(ea, /state:/);
        // Pre-refactor parsed alternating op:/left: pairs; that path must be gone
        assert.doesNotMatch(ea, /op:/);
        assert.doesNotMatch(ea, /left:/);
      });

      test("Expand-absorb writes per-node state files for each child (R19, R21)", () => {
        assert.match(ea, /\.\/scoped\/state-/);
      });

      test("Expand-absorb appends ledger blocks without op/left fields (R18, R21)", () => {
        // Find the CHILD heredoc inside the loop
        const m = ea.match(/<< NODE_EOF([\s\S]+?)NODE_EOF/);
        assert.ok(m, "Expand-absorb must contain a NODE_EOF heredoc");
        const body = m[1];
        for (const k of ["id:", "parent_id:", "depth:", "value:", "samples:", "status:"]) {
          assert.ok(body.includes(k), `child block missing field: ${k}`);
        }
        for (const k of ["op:", "left:"]) {
          assert.ok(!body.includes(k), `child block must NOT contain pre-refactor field: ${k}`);
        }
      });

      test("Expand-absorb still appends ## Pending Questions on malformed (R47, preserved per R84)", () => {
        assert.match(ea, /## Pending Questions/);
        assert.doesNotMatch(ea, /## State\s*\n\s*waiting_for_user/);
      });
    });

    describe("phase-6 a-tot: Score-push post-refactor (R20)", () => {
      const path = resolve(INTERP, "INSTRUCTIONS.md");
      const s = readFileSync(path, "utf-8");
      const sp = extractInstructionBody(s, "Score-push");

      test("Score-push push-args are partial_state and task only (R20)", () => {
        assert.match(sp, /partial_state:\s*\|/);
        assert.match(sp, /task:\s*\|/);
        assert.doesNotMatch(sp, /thought:/);
        assert.doesNotMatch(sp, /^\s*target:\s/m);
      });
    });

    describe("phase-6 a-tot: refactored dynamics vocabulary check (R26)", () => {
      test("expand-node.md prose has no Game-of-24 vocabulary (R26)", () => {
        const s = readFileSync(resolve(INTERP, "dynamics/expand-node.md"), "utf-8");
        for (const banned of ["Game of 24", "arithmetic", "numbers_remaining", "parent_thought", "target"]) {
          assert.ok(!s.includes(banned), `expand-node.md contains: ${banned}`);
        }
      });

      test("score.md prose has no Game-of-24 vocabulary (R26)", () => {
        const s = readFileSync(resolve(INTERP, "dynamics/score.md"), "utf-8");
        for (const banned of ["Game of 24", "arithmetic", "thought", "target"]) {
          assert.ok(!s.includes(banned), `score.md contains: ${banned}`);
        }
      });
    });
    ```

- [ ] **Step 2: Run test to verify it fails**

    Run: `npm test 2>&1 | grep -E "phase-6|FAIL"`
    Expected: FAIL on `Expand-push push-args are partial_state and task only` (current Expand-push uses `parent_thought`/`target`/`numbers_remaining`).

- [ ] **Step 3: Write minimal implementation**

    Edit `interpreters/mas-papers/3-search/a-tot/INSTRUCTIONS.md`:

    **Replace the Expand-push instruction body** with the form specified in `design.md §Interfaces — Phase 6 Expand-push delta`. The minimum diff: replace the `printf 'op: %s\nleft: %s\n' "$OP" "$LEFT" > ./scoped/staged/parent_thought.md` and `echo "$LEFT" > ./scoped/staged/numbers_remaining.md` lines with:

    ```bash
        cat ./scoped/state-${ID}.md > ./scoped/staged/partial_state.md
        cp ./scoped/task.md ./scoped/staged/task.md
    ```

    And replace the `## Push-Args` block in the MEMORY heredoc:

    ```
        ## Push-Args
        partial_state: |
        $PS
        task: |
        $TK
    ```

    (where `PS` and `TK` are the two-space-indented contents of the staged files.)

    **Replace the Expand-absorb instruction body** so:
    - The `awk … ./scoped/_children.txt` block parses `state:` entries instead of alternating `op:`/`left:` lines.
    - The per-child loop writes `./scoped/state-${NEW_ID}.md` from the entry payload.
    - The `cat >> ./scoped/tree.md << NODE_EOF` heredoc drops the `op:` and `left:` lines.

    The exact post-refactor Expand-absorb body is in `design.md §Interfaces — Phase 6 Expand-absorb delta`. The Phase-router routing logic and the malformed-children `## Pending Questions` append are preserved verbatim from Phase 6 (R84).

    **Replace the Score-push instruction body** symmetrically: replace `thought:`/`target:` push-args with `partial_state:`/`task:`, reading from `./scoped/state-${ID}.md` and `./scoped/task.md`. The Score-absorb logic (samples++, weighted sum, R44 malformed handling) is unchanged.

- [ ] **Step 4: Run test to verify it passes**

    Run: `npm test 2>&1 | grep -E "phase-6|FAIL"`
    Expected: PASS for all R20/R21/R26 assertions; the existing Phase 6 R47 / Phase-router structural assertions also stay green.

- [ ] **Step 5: Commit**

    ```bash
    git add interpreters/mas-papers/3-search/a-tot/INSTRUCTIONS.md src/test/phase-6-tot.test.ts
    git commit -m "refactor(phase-6): Expand/Score push partial_state+task; per-node state files; ledger drops op/left in children (satisfies: R19, R20, R21, R26)"
    ```

---

## Task 5: Phase 6 Goal-push + Solved deltas (drop parent-walk)   (satisfies: R22, R23)

**Files:**
- Modify: `interpreters/mas-papers/3-search/a-tot/INSTRUCTIONS.md`
- Modify: `src/test/phase-6-tot.test.ts`

- [ ] **Step 1: Write the failing test**

    In `src/test/phase-6-tot.test.ts`, replace the `Goal-push`/`Solved` describe blocks:

    ```typescript
    describe("phase-6 a-tot: Goal-push post-refactor (R22)", () => {
      const path = resolve(INTERP, "INSTRUCTIONS.md");
      const s = readFileSync(path, "utf-8");
      const gp = extractInstructionBody(s, "Goal-push");

      test("Goal-push reads attempt from leaf state file (R22)", () => {
        // The pre-refactor body walked parent chain; post-refactor is a single cp/cat
        assert.match(gp, /\.\/scoped\/state-/);
      });

      test("Goal-push criterion is ./scoped/task.md (R22)", () => {
        assert.match(gp, /\.\/scoped\/task\.md/);
      });

      test("Goal-push has no parent-walk while loop (R22)", () => {
        // The walk-parents primitive is removed
        assert.doesNotMatch(gp, /while\s+\[\s+"\$CURRENT"\s+!=\s+"n0"/);
      });
    });

    describe("phase-6 a-tot: Solved post-refactor (R23)", () => {
      const path = resolve(INTERP, "INSTRUCTIONS.md");
      const s = readFileSync(path, "utf-8");
      const so = extractInstructionBody(s, "Solved");

      test("Solved reads solution from terminal_pass leaf state file (R23)", () => {
        assert.match(so, /\.\/scoped\/state-/);
      });

      test("Solved has no parent-walk while loop (R23)", () => {
        assert.doesNotMatch(so, /while\s+\[\s+"\$CURRENT"\s+!=\s+"n0"/);
      });

      test("Solved still emits ## Solution with node counts (R35, preserved per R84)", () => {
        assert.match(so, /## Solution/);
        assert.match(so, /Total nodes expanded:/);
        assert.match(so, /Nodes pruned:/);
      });
    });
    ```

- [ ] **Step 2: Run test to verify it fails**

    Run: `npm test 2>&1 | grep -E "phase-6|FAIL"`
    Expected: FAIL on the parent-walk assertions (current Goal-push and Solved both contain the `while [ "$CURRENT" != "n0" ]` loop).

- [ ] **Step 3: Write minimal implementation**

    Edit `interpreters/mas-papers/3-search/a-tot/INSTRUCTIONS.md`:

    **Replace the Goal-push instruction body** so that, after finding the live terminal `$ID`, instead of walking the parent chain:

    ```bash
        echo "$ID" > ./scoped/cursor.md
        cp ./scoped/state-${ID}.md ./scoped/staged/attempt.md
        cp ./scoped/task.md ./scoped/staged/criterion.md
    ```

    The MEMORY heredoc with `## Push dynamics/evaluate.md` and `## Push-Args attempt: |` / `criterion: |` is otherwise unchanged. The parent-walk primitive previously inlined here is **deleted** from INSTRUCTIONS.md.

    Drop the synthesized "Expression must use each of … exactly once and evaluate to …" prose; the criterion is now `task.md` (= PROGRAM.md), which is sufficient for `evaluate.md` text-only mode (R67-equivalent for Phase 6).

    **Replace the Solved instruction body** symmetrically:

    ```bash
        PASS_ID=$(awk '/^---$/{id=""; s=""} /^id:/{id=$2} /^status:/{s=$2; if (s=="terminal_pass") {print id; exit}}' ./scoped/tree.md)
        SOLUTION=$(cat ./scoped/state-${PASS_ID}.md)
        TOTAL=$(grep -c '^id: n' ./scoped/tree.md)
        PRUNED=$(grep -c '^status: pruned$' ./scoped/tree.md)

        cat > ./MEMORY.md << SOLVED_EOF
        ## State
        done
        ## Matched Instruction
        Solved
        ## Last Action
        Read winning state from state-${PASS_ID}.md.
        ## Result
        Search complete with verified solution.
        ## Solution
        $SOLUTION
        Total nodes expanded: $TOTAL
        Nodes pruned: $PRUNED
        SOLVED_EOF
    ```

    The parent-walk loop is **deleted**. The `## Solution` content shape is preserved (R35, R84) — `Total nodes expanded:` and `Nodes pruned:` lines remain.

    The strategy preamble's "Walk parent chain" primitive section, if present, is also deleted (no consumer remains).

- [ ] **Step 4: Run test to verify it passes**

    Run: `npm test 2>&1 | grep -E "phase-6|FAIL"`
    Expected: PASS for all R22/R23 assertions; existing R35 (`## Solution` shape) assertion stays green.

- [ ] **Step 5: Commit**

    ```bash
    git add interpreters/mas-papers/3-search/a-tot/INSTRUCTIONS.md src/test/phase-6-tot.test.ts
    git commit -m "refactor(phase-6): Goal-push + Solved read state-<id>.md; drop parent-walk primitive (satisfies: R22, R23)"
    ```

---

## Task 6: Phase 6 leaf README delta + BFS-preservation regression test   (satisfies: R27, R29, R84)

**Files:**
- Modify: `interpreters/mas-papers/3-search/a-tot/README.md`
- Modify: `src/test/phase-6-tot.test.ts`

- [ ] **Step 1: Write the failing test**

    Append to `src/test/phase-6-tot.test.ts`:

    ```typescript
    describe("phase-6 a-tot: README post-refactor delta (R27, R29)", () => {
      const readme = readFileSync(resolve(INTERP, "README.md"), "utf-8");

      test("README has 'Refactored in Phase 6b' bullet (R29)", () => {
        assert.match(readme, /Refactored in Phase 6b/);
        assert.match(readme, /docs\/specs\/2026-05-01-implement-phase-6b/);
      });

      test("README dynamics table uses post-refactor push-arg names (R27)", () => {
        assert.match(readme, /partial_state/);
        assert.match(readme, /task/);
        assert.doesNotMatch(readme, /numbers_remaining/);
        assert.doesNotMatch(readme, /parent_thought/);
      });
    });

    describe("phase-6 a-tot: BFS semantics preserved (R84 regression)", () => {
      const path = resolve(INTERP, "INSTRUCTIONS.md");
      const s = readFileSync(path, "utf-8");

      test("k=5 still hardcoded in expand-node related logic (R84)", () => {
        // The strategy still references k=5 either via comment, "exactly 5", or 5
        // appearing in the well-formed-count check
        assert.match(s, /\b5\b/);
      });

      test("b=5 still in pruning logic (R84)", () => {
        const pr = extractInstructionBody(s, "Prune");
        assert.match(pr, /tail\s+-n\s+\+6/);   // top-5 retention idiom
      });

      test("3-sample scoring still in Phase-router routing (R84)", () => {
        assert.match(s, /samples\s*<\s*3/);
      });

      test("weighted sum (sure=20, likely=1, impossible=0.001) preserved (R84)", () => {
        const sa = extractInstructionBody(s, "Score-absorb");
        assert.match(sa, /WEIGHT=20/);
        assert.match(sa, /WEIGHT=1\b/);
        assert.match(sa, /WEIGHT=0\.001/);
      });

      test("R6 (PROGRAM.md insufficient input → waiting_for_user) preserved (R84)", () => {
        const init = extractInstructionBody(s, "Initialize");
        assert.match(init, /waiting_for_user/);
      });

      test("R37 dead-end branch preserved in Prune (R84)", () => {
        const pr = extractInstructionBody(s, "Prune");
        assert.match(pr, /## No Solution Found/);
      });

      test("R34 exhaustion branch preserved in Goal-push (R84)", () => {
        const gp = extractInstructionBody(s, "Goal-push");
        assert.match(gp, /## No Solution Found/);
      });
    });
    ```

- [ ] **Step 2: Run test to verify it fails**

    Run: `npm test 2>&1 | grep -E "phase-6|FAIL"`
    Expected: FAIL on `Refactored in Phase 6b` (README not yet updated). The R84 regression block should already PASS if T3–T5 were faithful; if any FAILs surface there, fix the corresponding earlier task before proceeding.

- [ ] **Step 3: Write minimal implementation**

    Edit `interpreters/mas-papers/3-search/a-tot/README.md`:

    1. **Update the dynamics table** — replace the `parent_thought, target, numbers_remaining` and `thought, target` push-arg cells with `partial_state, task` for both `expand-node.md` and `score.md`.

    2. **At the top of the "Notable behaviour" section**, insert a new bullet (the very first one):

       ```markdown
       - **Refactored in Phase 6b** (`docs/specs/2026-05-01-implement-phase-6b/`). Dynamics' push-args changed from `parent_thought`/`target`/`numbers_remaining` (and `thought`/`target`) to the canonical pair `partial_state`/`task`. The ledger no longer carries `op`/`left` fields — partial states live in `./scoped/state-<id>.md` instead. BFS semantics (k=5, b=5, max_depth, 3-sample scoring, weighted-sum aggregation, pruning, goal-checking) are unchanged.
       ```

    3. The "PROGRAM.md prose constraint" bullet from the existing README is preserved verbatim — Initialize still parses integers from PROGRAM.md to derive `max_depth`.

- [ ] **Step 4: Run test to verify it passes**

    Run: `npm test 2>&1 | grep -E "phase-6|FAIL"`
    Expected: PASS for all R27/R29/R84 assertions.

- [ ] **Step 5: Commit**

    ```bash
    git add interpreters/mas-papers/3-search/a-tot/README.md src/test/phase-6-tot.test.ts
    git commit -m "docs(phase-6): README reflects 6b refactor; BFS-preservation regression pinned (satisfies: R27, R29, R84)"
    ```

---

## Task 7: Bootstrap LATS dir + group README delta + test-file skeleton   (satisfies: R1, R2, R4, R5, R72)

**Files:**
- Create: `interpreters/mas-papers/3-search/b-lats/INSTRUCTIONS.md` (skeleton — full body in T12–T19)
- Create: `interpreters/mas-papers/3-search/b-lats/PROGRAM.md` (skeleton — full content in T10)
- Create: `interpreters/mas-papers/3-search/b-lats/README.md` (skeleton — full body in T20)
- Create: `interpreters/mas-papers/3-search/b-lats/dynamics/` (directory)
- Modify: `interpreters/mas-papers/3-search/README.md` (group README — add LATS row)
- Create: `src/test/phase-6b-lats.test.ts`

- [ ] **Step 1: Write the failing test**

    Create `src/test/phase-6b-lats.test.ts`:

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
    const INTERP = resolve(GROUP, "b-lats");

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

    describe("phase-6b b-lats: directory layout (R1, R4, R5)", () => {
      test("interpreter dir interpreters/mas-papers/3-search/b-lats/ exists (R1)", () => {
        assert.ok(existsSync(INTERP), "interpreter directory missing");
      });
      test("interpreter has INSTRUCTIONS.md, PROGRAM.md, README.md, dynamics/ (R1)", () => {
        for (const f of ["INSTRUCTIONS.md", "PROGRAM.md", "README.md"]) {
          assert.ok(existsSync(resolve(INTERP, f)), `${f} missing`);
        }
        assert.ok(existsSync(resolve(INTERP, "dynamics")), "dynamics/ missing");
      });
      test("dynamics/ does NOT contain score.md (R5, R77)", () => {
        assert.ok(!existsSync(resolve(INTERP, "dynamics/score.md")),
          "score.md must NOT be shipped in b-lats/dynamics/");
      });
    });

    describe("phase-6b b-lats: group README delta (R2)", () => {
      const groupReadme = readFileSync(resolve(GROUP, "README.md"), "utf-8");
      test("group README lists b-lats as Shipped (R2)", () => {
        assert.match(groupReadme, /b-lats/);
        assert.match(groupReadme, /Shipped\s*\(Phase\s*6b\)/);
      });
      test("group README cites Zhou et al. arXiv:2310.04406 (R2)", () => {
        assert.match(groupReadme, /Zhou\s+et\s+al/i);
        assert.match(groupReadme, /2310\.04406/);
      });
    });
    ```

- [ ] **Step 2: Run test to verify it fails**

    Run: `npm test 2>&1 | grep -E "phase-6b|FAIL"`
    Expected: FAIL with `interpreter directory missing` (or compile error if the test file references paths that don't exist; in either case, the test must visibly fail before implementation).

- [ ] **Step 3: Write minimal implementation**

    Create the directory `interpreters/mas-papers/3-search/b-lats/dynamics/` (empty for now).

    **Update** `interpreters/mas-papers/3-search/README.md`'s "Variants" table — replace the existing rows with:

    ```markdown
    | `a-tot/`  | Shipped (Phase 6)   | Tree of Thoughts            | Yao et al., NeurIPS 2023, arXiv:2305.10601 |
    | `b-lats/` | Shipped (Phase 6b)  | Language Agent Tree Search  | Zhou et al., 2023, arXiv:2310.04406        |
    | `b-got/`  | Deferred            | Graph of Thoughts           | Besta et al., 2023, arXiv:2308.09687       |
    ```

    (the previous `interpreters/lats/ (out)` placeholder row is removed.)

    The "Shared dynamics" prose at the bottom of the group README is preserved (`expand-node.md` and `score.md` remain "normative for the Search group going forward"; LATS does not import `score.md` but still imports `expand-node.md` byte-equal).

    Create skeleton interpreter files (filled in later):

    `interpreters/mas-papers/3-search/b-lats/INSTRUCTIONS.md`:

    ```markdown
    # Strategy: Language Agent Tree Search

    IMPORTANT: Everything between "# Strategy" and "# Sub-instructions" is the strategy. It must be copied VERBATIM into every update_instructions call. Never modify, summarize, or omit any strategy instruction. Only the "# Sub-instructions" section below changes.

    (strategy body added in T12, T13, T14, T15, T16, T17, T18, T19)

    # Sub-instructions

    (none — this interpreter needs none.)
    ```

    `interpreters/mas-papers/3-search/b-lats/PROGRAM.md`:

    ```markdown
    (puzzle prose added in T10 — byte-equal copy of a-tot/PROGRAM.md)
    ```

    `interpreters/mas-papers/3-search/b-lats/README.md`:

    ```markdown
    # b — Language Agent Tree Search

    *Zhou et al., 2023, arXiv:2310.04406. See `docs/agent-workflows/patterns.md` §Group 3.*

    (full content added in T20)
    ```

- [ ] **Step 4: Run test to verify it passes**

    Run: `npm test 2>&1 | grep -E "phase-6b|FAIL"`
    Expected: PASS for the five R1/R2/R4/R5 assertions; no FAIL output for phase-6b.

- [ ] **Step 5: Commit**

    ```bash
    git add interpreters/mas-papers/3-search/b-lats/ interpreters/mas-papers/3-search/README.md src/test/phase-6b-lats.test.ts
    git commit -m "feat(phase-6b): bootstrap LATS dir + group README + test file (satisfies: R1, R2, R4, R5, R72)"
    ```

---

## Task 8: Copy three reused dynamics into `b-lats/dynamics/`   (satisfies: R6, R7, R8)

**Files:**
- Create: `interpreters/mas-papers/3-search/b-lats/dynamics/expand-node.md` (byte-equal copy of `a-tot/dynamics/expand-node.md`)
- Create: `interpreters/mas-papers/3-search/b-lats/dynamics/evaluate.md` (byte-equal copy of `1b/dynamics/evaluate.md`)
- Create: `interpreters/mas-papers/3-search/b-lats/dynamics/reflect.md` (byte-equal copy of `1c/dynamics/reflect.md`)
- Modify: `src/test/phase-6b-lats.test.ts`

- [ ] **Step 1: Write the failing test**

    Append to `src/test/phase-6b-lats.test.ts`:

    ```typescript
    describe("phase-6b b-lats: reused dynamics byte-equality (R6, R7, R8)", () => {
      test("dynamics/expand-node.md is byte-equal to a-tot post-refactor copy (R6)", () => {
        const canon = readFileSync(resolve(REPO, "interpreters/mas-papers/3-search/a-tot/dynamics/expand-node.md"));
        const here = readFileSync(resolve(INTERP, "dynamics/expand-node.md"));
        assert.ok(canon.equals(here), "expand-node.md diverged from a-tot canonical");
      });
      test("dynamics/evaluate.md is byte-equal to canonical 1b copy (R7)", () => {
        const canon = readFileSync(resolve(REPO, "interpreters/mas-papers/1-iterative-refinement/b-evaluator-optimizer/dynamics/evaluate.md"));
        const here = readFileSync(resolve(INTERP, "dynamics/evaluate.md"));
        assert.ok(canon.equals(here), "evaluate.md diverged from canonical");
      });
      test("dynamics/reflect.md is byte-equal to canonical 1c copy (R8)", () => {
        const canon = readFileSync(resolve(REPO, "interpreters/mas-papers/1-iterative-refinement/c-reflexion/dynamics/reflect.md"));
        const here = readFileSync(resolve(INTERP, "dynamics/reflect.md"));
        assert.ok(canon.equals(here), "reflect.md diverged from canonical");
      });
    });
    ```

- [ ] **Step 2: Run test to verify it fails**

    Run: `npm test 2>&1 | grep -E "phase-6b|FAIL"`
    Expected: FAIL — files don't exist yet.

- [ ] **Step 3: Write minimal implementation**

    Run, from the repo root:

    ```bash
    cp interpreters/mas-papers/3-search/a-tot/dynamics/expand-node.md \
       interpreters/mas-papers/3-search/b-lats/dynamics/expand-node.md
    cp interpreters/mas-papers/1-iterative-refinement/b-evaluator-optimizer/dynamics/evaluate.md \
       interpreters/mas-papers/3-search/b-lats/dynamics/evaluate.md
    cp interpreters/mas-papers/1-iterative-refinement/c-reflexion/dynamics/reflect.md \
       interpreters/mas-papers/3-search/b-lats/dynamics/reflect.md
    ```

- [ ] **Step 4: Run test to verify it passes**

    Run: `npm test 2>&1 | grep -E "phase-6b|FAIL"`
    Expected: PASS for the three byte-equality assertions.

- [ ] **Step 5: Commit**

    ```bash
    git add interpreters/mas-papers/3-search/b-lats/dynamics/
    git commit -m "feat(phase-6b): byte-equal copies of expand-node/evaluate/reflect dynamics (satisfies: R6, R7, R8)"
    ```

---

## Task 9: Extend `phase-operators-identity.test.ts` for the three reused copies   (satisfies: R9)

**Files:**
- Modify: `src/test/phase-operators-identity.test.ts`

- [ ] **Step 1: Write the failing test**

    Edit `src/test/phase-operators-identity.test.ts`. Append `interpreters/mas-papers/3-search/b-lats/dynamics/evaluate.md` to the existing `EVALUATE_PATHS` array (last entry). Add two new identity blocks below the `evaluate.md` describe:

    ```typescript
    const EVALUATE_PATHS = [
      "interpreters/mas-papers/1-iterative-refinement/b-evaluator-optimizer/dynamics/evaluate.md",
      "interpreters/mas-papers/1-iterative-refinement/c-reflexion/dynamics/evaluate.md",
      "interpreters/mas-papers/5-fixed-sop-teams/a-metagpt/dynamics/evaluate.md",
      "interpreters/mas-papers/5-fixed-sop-teams/b-chatdev/dynamics/evaluate.md",
      "interpreters/mas-papers/3-search/a-tot/dynamics/evaluate.md",
      "interpreters/mas-papers/3-search/b-lats/dynamics/evaluate.md",
    ];

    const REFLECT_PATHS = [
      "interpreters/mas-papers/1-iterative-refinement/c-reflexion/dynamics/reflect.md",
      "interpreters/mas-papers/3-search/b-lats/dynamics/reflect.md",
    ];

    const EXPAND_NODE_PATHS = [
      "interpreters/mas-papers/3-search/a-tot/dynamics/expand-node.md",
      "interpreters/mas-papers/3-search/b-lats/dynamics/expand-node.md",
    ];

    describe("reflect.md identity across phases", () => {
      test("reflect.md is byte-equal across all consumers", () => {
        const contents = REFLECT_PATHS.map((p) => readFileSync(resolve(REPO, p)));
        for (let i = 1; i < contents.length; i++) {
          assert.ok(
            contents[0].equals(contents[i]),
            `reflect.md diverged between ${REFLECT_PATHS[0]} and ${REFLECT_PATHS[i]}`,
          );
        }
      });
    });

    describe("expand-node.md identity across phases (post-refactor)", () => {
      test("expand-node.md is byte-equal across all consumers", () => {
        const contents = EXPAND_NODE_PATHS.map((p) => readFileSync(resolve(REPO, p)));
        for (let i = 1; i < contents.length; i++) {
          assert.ok(
            contents[0].equals(contents[i]),
            `expand-node.md diverged between ${EXPAND_NODE_PATHS[0]} and ${EXPAND_NODE_PATHS[i]}`,
          );
        }
      });
    });
    ```

- [ ] **Step 2: Run test to verify it fails**

    If T8 was completed correctly, the byte-equality should already hold and all three assertions PASS immediately. To verify the tests are actually wired up: temporarily flip one byte in `b-lats/dynamics/evaluate.md`, re-run, expect FAIL, then revert.

    Run: `npm test 2>&1 | grep -E "identity|FAIL"`
    Expected: PASS (all three identity blocks).

- [ ] **Step 3: Write minimal implementation**

    None needed — T8 already created the byte-equal files; this task is a test-only extension.

- [ ] **Step 4: Run test to verify it passes**

    Run: `npm test 2>&1 | grep -E "identity|FAIL"`
    Expected: PASS for `evaluate.md identity`, `reflect.md identity`, `expand-node.md identity`.

- [ ] **Step 5: Commit**

    ```bash
    git add src/test/phase-operators-identity.test.ts
    git commit -m "test(phase-6b): identity test covers reused expand-node/evaluate/reflect (satisfies: R9)"
    ```

---

## Task 10: LATS demo `PROGRAM.md` (byte-equal Phase 6)   (satisfies: R69)

**Files:**
- Modify: `interpreters/mas-papers/3-search/b-lats/PROGRAM.md`
- Modify: `src/test/phase-6b-lats.test.ts`

- [ ] **Step 1: Write the failing test**

    Append to `src/test/phase-6b-lats.test.ts`:

    ```typescript
    describe("phase-6b b-lats: demo PROGRAM.md (R69)", () => {
      test("b-lats/PROGRAM.md is byte-equal to a-tot/PROGRAM.md (R69)", () => {
        const canon = readFileSync(resolve(REPO, "interpreters/mas-papers/3-search/a-tot/PROGRAM.md"));
        const here  = readFileSync(resolve(INTERP, "PROGRAM.md"));
        assert.ok(canon.equals(here), "PROGRAM.md diverged from a-tot");
      });
    });
    ```

- [ ] **Step 2: Run test to verify it fails**

    Run: `npm test 2>&1 | grep -E "phase-6b|FAIL"`
    Expected: FAIL — the skeleton PROGRAM.md from T7 (`(puzzle prose added in T10 …)`) is not byte-equal.

- [ ] **Step 3: Write minimal implementation**

    Run from the repo root:

    ```bash
    cp interpreters/mas-papers/3-search/a-tot/PROGRAM.md interpreters/mas-papers/3-search/b-lats/PROGRAM.md
    ```

- [ ] **Step 4: Run test to verify it passes**

    Run: `npm test 2>&1 | grep -E "phase-6b|FAIL"`
    Expected: PASS.

- [ ] **Step 5: Commit**

    ```bash
    git add interpreters/mas-papers/3-search/b-lats/PROGRAM.md
    git commit -m "feat(phase-6b): demo PROGRAM.md byte-equal w/ Phase 6 ToT for A/B comparison (satisfies: R69)"
    ```

---

## Task 11: New `rollout.md` dynamic   (satisfies: R10, R11, R12, R13)

**Files:**
- Create: `interpreters/mas-papers/3-search/b-lats/dynamics/rollout.md`
- Modify: `src/test/phase-6b-lats.test.ts`

- [ ] **Step 1: Write the failing test**

    Append to `src/test/phase-6b-lats.test.ts`:

    ```typescript
    describe("phase-6b b-lats: rollout.md dynamic (R10, R11, R12, R13)", () => {
      const path = resolve(INTERP, "dynamics/rollout.md");

      test("dynamics/rollout.md exists", () => {
        assert.ok(existsSync(path), "rollout.md missing");
      });

      test("rollout.md declares only {{partial_state}} and {{task}} push-args (R10)", () => {
        const s = readFileSync(path, "utf-8");
        assert.match(s, /\{\{partial_state\}\}/);
        assert.match(s, /\{\{task\}\}/);
        // No domain-specific placeholders
        assert.doesNotMatch(s, /\{\{target\}\}/);
        assert.doesNotMatch(s, /\{\{numbers_remaining\}\}/);
        assert.doesNotMatch(s, /\{\{thought\}\}/);
        assert.doesNotMatch(s, /\{\{parent_thought\}\}/);
      });

      test("rollout.md is single-cycle (## Instruction count == 1) (R11)", () => {
        const s = readFileSync(path, "utf-8");
        const matches = s.match(/^## Instruction:/gm) || [];
        assert.equal(matches.length, 1);
      });

      test("rollout.md returns ## State done + ## Return terminal_state: | (R11)", () => {
        const s = readFileSync(path, "utf-8");
        assert.match(s, /## State\s*\n\s*done/);
        assert.match(s, /## Return\s*\n\s*terminal_state:\s*\|/);
      });

      test("rollout.md does not push any further dynamic (R12)", () => {
        const s = readFileSync(path, "utf-8");
        assert.doesNotMatch(s, /^## Push\s*$/m);
      });

      test("rollout.md prose is domain-agnostic (R13)", () => {
        const s = readFileSync(path, "utf-8");
        for (const banned of [
          "Game of 24", "arithmetic", "numbers", "target",
          "maze", "code", "function", "test suite",
          "parent_thought", "numbers_remaining", "thought",
        ]) {
          assert.ok(!s.includes(banned), `rollout.md contains banned domain word: "${banned}"`);
        }
      });
    });
    ```

- [ ] **Step 2: Run test to verify it fails**

    Run: `npm test 2>&1 | grep -E "phase-6b|FAIL"`
    Expected: FAIL — `rollout.md missing`.

- [ ] **Step 3: Write minimal implementation**

    Create `interpreters/mas-papers/3-search/b-lats/dynamics/rollout.md` with the body specified in `design.md §Interfaces — `rollout.md``:

    ````markdown
    # Dynamic: Rollout

    Receives push-args: {{partial_state}}, {{task}}.
    Produces: ## State done + ## Return block with key `terminal_state`.

    This dynamic is invoked by a Monte Carlo Tree Search controller once per
    selected leaf to estimate the leaf's value via a single committed playout.
    The dynamic plays one trajectory forward from {{partial_state}} all the way
    to a terminal state (per the task's terminal predicate) and returns only the
    endpoint — intermediate steps are not tracked in the tree, so they need not
    be returned.

    ## Instruction: Play forward
    **Condition:** MEMORY state is "empty"
    **Action:** Read the task definition in {{task}}. Starting from
    {{partial_state}}, repeatedly apply one forward extension at a time per the
    task's rules, committing to a single trajectory, until the task's terminal
    predicate fires (i.e. the state cannot be extended further or the task's
    acceptance criterion is decidable on it). Return only the terminal state
    reached; do not return intermediate states.

    Write ./MEMORY.md with this EXACT shape (the ## Return block MUST be in the
    same heredoc as the state change):

    ```
    cat > ./MEMORY.md << 'MEMEOF'
    ## State
    done
    ## Matched Instruction
    Play forward
    ## Last Action
    Rolled forward from the partial state to a terminal state; popping.
    ## Result
    Terminal state produced.
    ## Return
    terminal_state: |
      <multi-line terminal state, every line indented two spaces>
    MEMEOF
    ```

    Task definition:
    {{task}}

    Starting partial state:
    {{partial_state}}
    ````

- [ ] **Step 4: Run test to verify it passes**

    Run: `npm test 2>&1 | grep -E "phase-6b|FAIL"`
    Expected: PASS for all R10/R11/R12/R13 assertions.

- [ ] **Step 5: Commit**

    ```bash
    git add interpreters/mas-papers/3-search/b-lats/dynamics/rollout.md src/test/phase-6b-lats.test.ts
    git commit -m "feat(phase-6b): rollout.md (LLM-policy single-shot, domain-agnostic) (satisfies: R10, R11, R12, R13)"
    ```

---

## Task 12: LATS strategy preamble + Initialize   (satisfies: R34, R35, R36)

**Files:**
- Modify: `interpreters/mas-papers/3-search/b-lats/INSTRUCTIONS.md`
- Modify: `src/test/phase-6b-lats.test.ts`

- [ ] **Step 1: Write the failing test**

    Append to `src/test/phase-6b-lats.test.ts`:

    ```typescript
    describe("phase-6b b-lats: strategy preamble (structural)", () => {
      const s = readFileSync(resolve(INTERP, "INSTRUCTIONS.md"), "utf-8");
      test("strategy is bounded by # Strategy / # Sub-instructions and is verbatim-required", () => {
        assert.match(s, /^# Strategy/m);
        assert.match(s, /^# Sub-instructions/m);
        assert.match(s, /VERBATIM/);
      });
    });

    describe("phase-6b b-lats: Initialize (R34, R35, R36)", () => {
      const s = readFileSync(resolve(INTERP, "INSTRUCTIONS.md"), "utf-8");
      const init = extractInstructionBody(s, "Initialize");

      test("Initialize copies PROGRAM.md to ./scoped/task.md (R34)", () => {
        assert.match(init, /cp\s+\.\.\/\.\.\/PROGRAM\.md\s+\.\/scoped\/task\.md/);
      });

      test("Initialize writes max_iterations=30, uct_c=1.41421356, iter_count=0 (R34)", () => {
        assert.match(init, /echo\s+30\b[^\n]*max_iterations\.md/);
        assert.match(init, /echo\s+1\.41421356\b[^\n]*uct_c\.md/);
        assert.match(init, /echo\s+0\b[^\n]*iter_count\.md/);
      });

      test("Initialize appends root n0 with q=0, n=0, status=live (R34)", () => {
        const m = init.match(/<< ROOT_EOF([\s\S]+?)ROOT_EOF/);
        assert.ok(m, "Initialize must contain a ROOT_EOF heredoc");
        const body = m[1];
        for (const line of [
          /id:\s*n0/,
          /parent_id:\s*-/,
          /depth:\s*0/,
          /q:\s*0/,
          /n:\s*0/,
          /status:\s*live/,
        ]) {
          assert.match(body, line);
        }
      });

      test("Initialize creates empty ./scoped/state-n0.md (R34)", () => {
        assert.match(init, />\s*\.\/scoped\/state-n0\.md/);
      });

      test("Initialize transitions to selecting (R35)", () => {
        assert.match(init, /## State\s*\n\s*selecting/);
      });

      test("Initialize does NOT validate PROGRAM.md (R36)", () => {
        // No reference to integer parsing, no waiting_for_user fallback for missing input.
        assert.doesNotMatch(init, /grep\s+-oE\s+'\\b\[0-9\]/);
        assert.doesNotMatch(init, /waiting_for_user/);
      });
    });
    ```

- [ ] **Step 2: Run test to verify it fails**

    Run: `npm test 2>&1 | grep -E "phase-6b|FAIL"`
    Expected: FAIL on the Initialize block (instruction not present yet — `extractInstructionBody` returns empty).

- [ ] **Step 3: Write minimal implementation**

    Edit `interpreters/mas-papers/3-search/b-lats/INSTRUCTIONS.md`. Replace the placeholder `(strategy body added in T12, …)` with:

    ````markdown
    This interpreter implements Language Agent Tree Search (Zhou et al., 2023; patterns.md Group 3 — Search). The strategy is a single-frame MCTS controller running selection → expansion → simulation → evaluation → back-prop → reflection in a loop bounded by `max_iterations`. The growing tree lives in the strategy frame's `./scoped/tree.md` as an append-only YAML-block ledger; per-node partial states live in `./scoped/state-<id>.md` files (write-once); per-node accumulated lessons live in `./scoped/lessons-<id>.md` files (lazy + append-only). All MCTS arithmetic (UCT selection, back-prop) runs in bash; the dynamics are LLM-faceting only.

    Scoped files (in this strategy frame's `./scoped/`):

    - `./scoped/tree.md` — the YAML-block ledger (R37–R41).
    - `./scoped/task.md` — byte-equal copy of `../../PROGRAM.md` written once at Initialize.
    - `./scoped/max_iterations.md` — single integer; written once at Initialize, default 30.
    - `./scoped/uct_c.md` — single float (UCT exploration constant); written once at Initialize, default 1.41421356.
    - `./scoped/iter_count.md` — single integer; bumped after each back-prop.
    - `./scoped/cursor.md` — id of the leaf currently selected.
    - `./scoped/chosen_child.md` — id of the new child being rolled out this iteration.
    - `./scoped/last_terminal.md` — text of the latest rollout's terminal state.
    - `./scoped/state-<id>.md` — per-node partial state, write-once at node creation.
    - `./scoped/lessons-<id>.md` — per-node accumulated lessons, lazy + append-only.
    - `./scoped/staged/{partial_state,task,attempt,criterion,verdict,feedback}.md` — push-arg staging files.

    ## Instruction: Initialize
    **Condition:** MEMORY state is "empty"
    **Action:** Persist scoped files, write the root node, transition to `selecting`.

        mkdir -p ./scoped/staged

        cp ../../PROGRAM.md ./scoped/task.md
        echo 30          > ./scoped/max_iterations.md
        echo 1.41421356  > ./scoped/uct_c.md
        echo 0           > ./scoped/iter_count.md

        cat > ./scoped/tree.md << ROOT_EOF
        ---
        id: n0
        parent_id: -
        depth: 0
        q: 0
        n: 0
        status: live
        ROOT_EOF

        > ./scoped/state-n0.md

    Then wholesale-rewrite MEMORY:

        cat > ./MEMORY.md << 'INIT_OK_EOF'
        ## State
        selecting
        ## Matched Instruction
        Initialize
        ## Last Action
        Persisted scoped files; seeded scoped/tree.md with root n0; created empty state-n0.md.
        ## Result
        Initialization complete; ready to select.
        INIT_OK_EOF
    ````

- [ ] **Step 4: Run test to verify it passes**

    Run: `npm test 2>&1 | grep -E "phase-6b|FAIL"`
    Expected: PASS for all R34/R35/R36 assertions and the strategy preamble assertions.

- [ ] **Step 5: Commit**

    ```bash
    git add interpreters/mas-papers/3-search/b-lats/INSTRUCTIONS.md src/test/phase-6b-lats.test.ts
    git commit -m "feat(phase-6b): strategy preamble + Initialize (scoped files, root node, no PROGRAM validation) (satisfies: R34, R35, R36)"
    ```

---

## Task 13: LATS tree ledger primitives + per-node state files + lessons convention   (satisfies: R37, R38, R39, R40, R41, R42, R43)

**Files:**
- Modify: `interpreters/mas-papers/3-search/b-lats/INSTRUCTIONS.md`
- Modify: `src/test/phase-6b-lats.test.ts`

- [ ] **Step 1: Write the failing test**

    Append to `src/test/phase-6b-lats.test.ts`:

    ```typescript
    describe("phase-6b b-lats: tree ledger primitives (R37, R38, R39, R40, R41)", () => {
      const s = readFileSync(resolve(INTERP, "INSTRUCTIONS.md"), "utf-8");

      test("strategy preamble documents the six required ledger keys (R38)", () => {
        for (const k of ["id", "parent_id", "depth", "q", "n", "status"]) {
          assert.match(s, new RegExp(`\\b${k}\\b`));
        }
      });

      test("status enum is {live, terminal_pass, terminal_fail} — no 'pruned' (R41, R78)", () => {
        // The status enum should be documented in the preamble; assert all three
        // appear and that 'pruned' as a status value does not.
        for (const v of ["live", "terminal_pass", "terminal_fail"]) {
          assert.match(s, new RegExp(`\\b${v}\\b`));
        }
        // 'status: pruned' must not appear anywhere
        assert.doesNotMatch(s, /status:\s*pruned/);
      });

      test("monotonic id primitive uses grep -c '^id: n' (R40)", () => {
        assert.match(s, /grep\s+-c\s+'\^id:\s*n'/);
      });

      test("INSTRUCTIONS.md uses awk-based surgical edits (R39)", () => {
        // No wholesale `cat > ./scoped/tree.md` outside Initialize
        const initBody = extractInstructionBody(s, "Initialize");
        const sWithoutInit = s.replace(initBody, "");
        assert.doesNotMatch(sWithoutInit, /cat\s*>\s*\.\/scoped\/tree\.md\b/);
        // At least one awk-based update primitive
        assert.match(s, /awk[^\n]*tree\.md\.tmp/);
      });

      test("per-node state files referenced (R42, R43)", () => {
        assert.match(s, /\.\/scoped\/state-/);
        // Strategy preamble or comment notes write-once invariant somewhere.
        // (Soft check; the binding test is structural — there must be no `> ./scoped/state-${ID}.md`
        //  outside of node-creation contexts; that's pinned later in T16/T18 by absence.)
      });
    });
    ```

- [ ] **Step 2: Run test to verify it fails**

    Run: `npm test 2>&1 | grep -E "phase-6b|FAIL"`
    Expected: FAIL — preamble doesn't yet document all the keys / enum values / primitives.

- [ ] **Step 3: Write minimal implementation**

    The ledger primitives section is added to the strategy preamble (between the scoped-files list from T12 and the first `## Instruction`). Insert:

    ````markdown
    ### Tree ledger schema (R37, R38, R41)

    Every node block in `./scoped/tree.md` contains exactly the keys: `id`, `parent_id`, `depth`, `q`, `n`, `status`. Status enum: `live`, `terminal_pass`, `terminal_fail` — once a node leaves `live`, it never returns. There is no `pruned` status (LATS uses UCT for exploration/exploitation; explicit pruning would conflate ToT and MCTS semantics).

    ### Tree ledger primitives

    Every instruction below uses these bash idioms when reading or writing `./scoped/tree.md`. They are stated once here and referenced by name from each Instruction body.

    **Append a node block** (used by Initialize for n0, by Expand-absorb for children):

        cat >> ./scoped/tree.md << NODE_EOF
        ---
        id: $NEW_ID
        parent_id: $PARENT_ID
        depth: $DEPTH
        q: 0
        n: 0
        status: live
        NODE_EOF

    **Next monotonic id** (R40):

        NEXT_INDEX=$(grep -c '^id: n' ./scoped/tree.md)
        NEW_ID="n$NEXT_INDEX"

    **Update one field of one node** (R39, surgical edit):

        # Args: $1 = id, $2 = field name, $3 = new value
        awk -v ID="$1" -v F="$2" -v V="$3" '
          /^---$/ { in_block = 0; print; next }
          /^id:/  { in_block = ($2 == ID); print; next }
          in_block && $1 == F":" { print F": " V; next }
          { print }
        ' ./scoped/tree.md > ./scoped/tree.md.tmp && mv ./scoped/tree.md.tmp ./scoped/tree.md

    **Per-node state file** (R42, R43): created at node-creation time as `./scoped/state-<id>.md`; **write-once**, never modified after creation. Read whenever the strategy needs to push that node's state into a dynamic.

    **Per-node lessons file** (R64, R65): `./scoped/lessons-<id>.md` is **lazy** (created only on first append) and **append-only** (always `>>`, never `>`). Used by the Compose-partial-state primitive (below) to thread accumulated lessons into expansion and rollout.
    ````

- [ ] **Step 4: Run test to verify it passes**

    Run: `npm test 2>&1 | grep -E "phase-6b|FAIL"`
    Expected: PASS for R37/R38/R39/R40/R41/R42/R43 assertions.

- [ ] **Step 5: Commit**

    ```bash
    git add interpreters/mas-papers/3-search/b-lats/INSTRUCTIONS.md src/test/phase-6b-lats.test.ts
    git commit -m "feat(phase-6b): tree ledger schema + primitives + per-node state/lessons file conventions (satisfies: R37, R38, R39, R40, R41, R42, R43)"
    ```

---

## Task 14: LATS Compose-partial-state primitive + ancestor walk   (satisfies: R48, R64, R65, R66)

**Files:**
- Modify: `interpreters/mas-papers/3-search/b-lats/INSTRUCTIONS.md`
- Modify: `src/test/phase-6b-lats.test.ts`

- [ ] **Step 1: Write the failing test**

    Append to `src/test/phase-6b-lats.test.ts`:

    ```typescript
    describe("phase-6b b-lats: Compose-partial-state primitive (R48, R66)", () => {
      const s = readFileSync(resolve(INTERP, "INSTRUCTIONS.md"), "utf-8");

      test("preamble defines a compose_partial_state function or primitive (R48)", () => {
        assert.match(s, /compose_partial_state/);
      });

      test("primitive walks parent chain (while … parent_id) (R48, R66)", () => {
        assert.match(s, /while[\s\S]+parent_id/);
      });

      test("primitive concatenates lessons from all ancestors including cursor (R66)", () => {
        // Look for a per-ancestor cat or for-loop that includes the starting node.
        assert.match(s, /lessons-\$\{?[A-Z_]+\}?\.md/);
      });

      test("primitive emits 'Lessons learned along this branch' header (R48)", () => {
        assert.match(s, /Lessons learned along this branch/);
      });
    });

    describe("phase-6b b-lats: lessons append-only convention (R64, R65)", () => {
      const s = readFileSync(resolve(INTERP, "INSTRUCTIONS.md"), "utf-8");

      test("lessons files are written with >> (append) anywhere they're touched (R65)", () => {
        // Any line that writes to lessons-<id>.md must use >> not single >
        const lessonWriteLines = s.split("\n").filter((l) => l.includes("lessons-"));
        for (const l of lessonWriteLines) {
          if (/>\s*[\.\$]/.test(l) && !/>>\s*[\.\$]/.test(l) && !l.trim().startsWith("#")) {
            // Allow read-side `<` operations; only reject single `>`.
            assert.ok(!/^[^#]*\s>\s*['"]?[\.\$]/.test(l),
              `lessons file written with single > (clobber): ${l}`);
          }
        }
      });
    });
    ```

- [ ] **Step 2: Run test to verify it fails**

    Run: `npm test 2>&1 | grep -E "phase-6b|FAIL"`
    Expected: FAIL — the primitive isn't yet defined.

- [ ] **Step 3: Write minimal implementation**

    Append to the strategy preamble (after the ledger primitives section from T13):

    ````markdown
    ### Compose-partial-state primitive (R48, R66)

    A bash helper invoked by Expand-push and Simulate-push. Input: a node id `X`. Output: the contents of a string suitable as the `partial_state` push-arg.

        compose_partial_state() {
          local X="$1"

          # 1. Begin with the node's own state (write-once payload, R43)
          cat "./scoped/state-${X}.md"

          # 2. Walk parent chain root → X; for each ancestor (including X
          #    itself, R66) with a lessons file, emit the lessons.
          ANCESTORS=()
          CURRENT="$X"
          while [ -n "$CURRENT" ] && [ "$CURRENT" != "-" ]; do
            ANCESTORS=("$CURRENT" "${ANCESTORS[@]}")   # prepend → root-first order
            CURRENT=$(awk -v ID="$CURRENT" '
              /^---$/ { in_block=0; next }
              /^id:/  { in_block=($2==ID) }
              in_block && /^parent_id:/ { print $2; exit }
            ' ./scoped/tree.md)
          done

          HAS_LESSONS=0
          for A in "${ANCESTORS[@]}"; do
            if [ -s "./scoped/lessons-${A}.md" ]; then
              HAS_LESSONS=1
              break
            fi
          done

          if [ "$HAS_LESSONS" -eq 1 ]; then
            printf '\n\nLessons learned along this branch:\n'
            for A in "${ANCESTORS[@]}"; do
              [ -s "./scoped/lessons-${A}.md" ] && cat "./scoped/lessons-${A}.md"
            done
          fi
        }

    Order is root-to-cursor (R48); within a single ancestor's file, original write order (= chronological reflection order) is preserved by the append-only invariant (R65). The "Lessons learned along this branch:" header is omitted when no ancestor has lessons (avoiding gratuitous prompt overhead in the 0-failure case).
    ````

- [ ] **Step 4: Run test to verify it passes**

    Run: `npm test 2>&1 | grep -E "phase-6b|FAIL"`
    Expected: PASS for R48/R64/R65/R66 assertions.

- [ ] **Step 5: Commit**

    ```bash
    git add interpreters/mas-papers/3-search/b-lats/INSTRUCTIONS.md src/test/phase-6b-lats.test.ts
    git commit -m "feat(phase-6b): compose_partial_state primitive (root-first ancestor lesson walk) (satisfies: R48, R64, R65, R66)"
    ```

---

## Task 15: LATS Select instruction + UCT formula   (satisfies: R44, R45, R46)

**Files:**
- Modify: `interpreters/mas-papers/3-search/b-lats/INSTRUCTIONS.md`
- Modify: `src/test/phase-6b-lats.test.ts`

- [ ] **Step 1: Write the failing test**

    Append to `src/test/phase-6b-lats.test.ts`:

    ```typescript
    describe("phase-6b b-lats: Select (R44, R45, R46)", () => {
      const s = readFileSync(resolve(INTERP, "INSTRUCTIONS.md"), "utf-8");
      const sel = extractInstructionBody(s, "Select");

      test("Select declares condition state == selecting (R44)", () => {
        assert.match(s, /## Instruction:\s*Select\b[\s\S]+?\*\*Condition:\*\*[^\n]*"selecting"/);
      });

      test("Select reads uct_c from ./scoped/uct_c.md (R44)", () => {
        assert.match(sel, /\.\/scoped\/uct_c\.md/);
      });

      test("Select uses bc -l for UCT computation (R44)", () => {
        assert.match(sel, /bc\s+-l/);
      });

      test("Select picks leftmost unvisited (n == 0) child first (R45)", () => {
        // Look for an n == 0 / sort | head -n 1 / lowest-id pick
        assert.match(sel, /\bn\s*=\s*0\b|\bn\s*==\s*0\b|\bN\s*=\s*"?0"?/);
        assert.match(sel, /sort[^\n]*head\s+-n\s+1/);
      });

      test("Select terminates at childless leaf and writes ./scoped/cursor.md (R46)", () => {
        assert.match(sel, /\.\/scoped\/cursor\.md/);
        // The descend loop reads children, breaks when none.
        assert.match(sel, /while\s+true|while\s+\[/);
      });

      test("Select transitions to expanding (R46)", () => {
        assert.match(sel, /## State\s*\n\s*expanding/);
      });
    });
    ```

- [ ] **Step 2: Run test to verify it fails**

    Run: `npm test 2>&1 | grep -E "phase-6b|FAIL"`
    Expected: FAIL — Select instruction not yet present.

- [ ] **Step 3: Write minimal implementation**

    Append to `interpreters/mas-papers/3-search/b-lats/INSTRUCTIONS.md` (in the strategy section, after the preamble and before `# Sub-instructions`):

    ````markdown
    ## Instruction: Select
    **Condition:** MEMORY state is "selecting"
    **Action:** Descend the tree from root using UCT. At each non-leaf, choose the next child by the n=0 fast-path or by UCT formula (R44, R45). When a leaf is reached (no node has `parent_id == this id`), write the leaf id to `./scoped/cursor.md` and transition to `expanding` (R46).

        C=$(cat ./scoped/uct_c.md)
        CURRENT="n0"

        while true; do
          CHILDREN=$(awk -v P="$CURRENT" '/^---$/{id="";p=""} /^id:/{id=$2} /^parent_id:/{p=$2; if (p==P) print id}' ./scoped/tree.md)
          [ -z "$CHILDREN" ] && break

          # R45: leftmost unvisited (n == 0)
          UNVISITED=$(for ID in $CHILDREN; do
            N=$(awk -v X="$ID" '/^---$/{ib=0;next} /^id:/{ib=($2==X)} ib && /^n:/{print $2; exit}' ./scoped/tree.md)
            [ "$N" = "0" ] && echo "$ID"
          done | sort | head -n 1)
          if [ -n "$UNVISITED" ]; then
            CURRENT="$UNVISITED"
            continue
          fi

          # R44: UCT among visited children
          N_PARENT=$(awk -v X="$CURRENT" '/^---$/{ib=0;next} /^id:/{ib=($2==X)} ib && /^n:/{print $2; exit}' ./scoped/tree.md)
          BEST_ID=""
          BEST_UCT=""
          for ID in $CHILDREN; do
            Q=$(awk -v X="$ID" '/^---$/{ib=0;next} /^id:/{ib=($2==X)} ib && /^q:/{print $2; exit}' ./scoped/tree.md)
            N=$(awk -v X="$ID" '/^---$/{ib=0;next} /^id:/{ib=($2==X)} ib && /^n:/{print $2; exit}' ./scoped/tree.md)
            UCT=$(echo "$Q/$N + $C * sqrt(l($N_PARENT)/$N)" | bc -l)
            if [ -z "$BEST_UCT" ] || [ "$(echo "$UCT > $BEST_UCT" | bc -l)" = "1" ]; then
              BEST_ID="$ID"; BEST_UCT="$UCT"
            fi
          done
          CURRENT="$BEST_ID"
        done

        echo "$CURRENT" > ./scoped/cursor.md

    Then wholesale-rewrite MEMORY:

        cat > ./MEMORY.md << SEL_EOF
        ## State
        expanding
        ## Matched Instruction
        Select
        ## Last Action
        Descended via UCT to leaf $CURRENT.
        ## Result
        Cursor set; ready to expand.
        SEL_EOF
    ````

- [ ] **Step 4: Run test to verify it passes**

    Run: `npm test 2>&1 | grep -E "phase-6b|FAIL"`
    Expected: PASS for R44/R45/R46 assertions.

- [ ] **Step 5: Commit**

    ```bash
    git add interpreters/mas-papers/3-search/b-lats/INSTRUCTIONS.md src/test/phase-6b-lats.test.ts
    git commit -m "feat(phase-6b): Select instruction (UCT descent + leftmost-unvisited tiebreak) (satisfies: R44, R45, R46)"
    ```

---

## Task 16: LATS Expand-push + Expand-absorb (chosen_child, R50 fallback)   (satisfies: R47, R49, R50)

**Files:**
- Modify: `interpreters/mas-papers/3-search/b-lats/INSTRUCTIONS.md`
- Modify: `src/test/phase-6b-lats.test.ts`

- [ ] **Step 1: Write the failing test**

    Append to `src/test/phase-6b-lats.test.ts`:

    ```typescript
    describe("phase-6b b-lats: Expand-push (R47)", () => {
      const s = readFileSync(resolve(INTERP, "INSTRUCTIONS.md"), "utf-8");
      const ep = extractInstructionBody(s, "Expand-push");

      test("Expand-push pushes dynamics/expand-node.md (R47)", () => {
        assert.match(ep, /## Push\s*\n\s*dynamics\/expand-node\.md/);
      });

      test("Expand-push push-args are partial_state and task only (R47)", () => {
        assert.match(ep, /partial_state:\s*\|/);
        assert.match(ep, /task:\s*\|/);
        assert.doesNotMatch(ep, /target:/);
        assert.doesNotMatch(ep, /numbers_remaining:/);
      });

      test("Expand-push uses compose_partial_state primitive (R47, R48)", () => {
        assert.match(ep, /compose_partial_state\b/);
      });
    });

    describe("phase-6b b-lats: Expand-absorb (R49, R50)", () => {
      const s = readFileSync(resolve(INTERP, "INSTRUCTIONS.md"), "utf-8");
      const ea = extractInstructionBody(s, "Expand-absorb");

      test("Expand-absorb writes ./scoped/state-${NEW_ID}.md per child (R49)", () => {
        assert.match(ea, /\.\/scoped\/state-\$\{?[A-Z_]+\}?\.md/);
      });

      test("Expand-absorb appends ledger blocks with q=0, n=0, status=live (R49)", () => {
        const m = ea.match(/<< NODE_EOF([\s\S]+?)NODE_EOF/);
        assert.ok(m, "Expand-absorb must contain NODE_EOF heredoc");
        const body = m[1];
        for (const line of [/q:\s*0/, /n:\s*0/, /status:\s*live/]) {
          assert.match(body, line);
        }
      });

      test("Expand-absorb sets chosen_child to leftmost new child (R49)", () => {
        assert.match(ea, /\.\/scoped\/chosen_child\.md/);
      });

      test("Expand-absorb transitions to simulating on success (R49)", () => {
        assert.match(ea, /## State\s*\n\s*simulating/);
      });

      test("Expand-absorb R50 zero-children fallback marks cursor terminal_fail and re-enters selecting", () => {
        assert.match(ea, /terminal_fail/);
        assert.match(ea, /## State\s*\n\s*selecting/);
      });

      test("Expand-absorb appends ## Pending Questions on malformed (R50)", () => {
        assert.match(ea, /## Pending Questions/);
        assert.doesNotMatch(ea, /## State\s*\n\s*waiting_for_user/);
      });
    });
    ```

- [ ] **Step 2: Run test to verify it fails**

    Run: `npm test 2>&1 | grep -E "phase-6b|FAIL"`
    Expected: FAIL — Expand-push/absorb not yet present.

- [ ] **Step 3: Write minimal implementation**

    Append two `## Instruction:` blocks to `interpreters/mas-papers/3-search/b-lats/INSTRUCTIONS.md` (in the strategy section, after Select). Bodies follow `design.md §Interfaces — LATS Expand-push` and `LATS Expand-absorb`. Concrete content:

    ````markdown
    ## Instruction: Expand-push
    **Condition:** MEMORY state is "expanding"
    **Action:** Stage push-args via the Compose-partial-state primitive; emit `## Push dynamics/expand-node.md`.

        ID=$(cat ./scoped/cursor.md)
        compose_partial_state "$ID" > ./scoped/staged/partial_state.md
        cp ./scoped/task.md ./scoped/staged/task.md

    Then emit MEMORY:

        PS=$(sed 's/^/  /' ./scoped/staged/partial_state.md)
        TK=$(sed 's/^/  /' ./scoped/staged/task.md)

        cat > ./MEMORY.md << EXP_EOF
        ## State
        expanding
        ## Matched Instruction
        Expand-push
        ## Last Action
        Pushed expand-node.md for $ID.
        ## Result
        Push queued.
        ## Push
        dynamics/expand-node.md
        ## Push-Args
        partial_state: |
        $PS
        task: |
        $TK
        EXP_EOF

    The state value `expanding` is the returnState; on pop the shell sets state to `expanding_completed`, which `Expand-absorb` matches.

    ## Instruction: Expand-absorb
    **Condition:** MEMORY state is "expanding_completed" and `## Children` is present in MEMORY
    **Action:** Parse the spliced `## Children` block as a sequence of `state:` block-scalar entries (k=5 expected). For each well-formed entry, allocate the next monotonic id, append a node block to `./scoped/tree.md` with `parent_id = cursor`, `depth = cursor_depth + 1`, `q: 0, n: 0, status: live`, and write the entry's payload verbatim to `./scoped/state-<new_id>.md`. Record the lowest-id newly created child to `./scoped/chosen_child.md`. Drop `## Children`. Transition to `simulating`.

        CURSOR=$(cat ./scoped/cursor.md)
        CURSOR_DEPTH=$(awk -v X="$CURSOR" '/^---$/{ib=0;next} /^id:/{ib=($2==X)} ib && /^depth:/{print $2; exit}' ./scoped/tree.md)
        NEXT_DEPTH=$((CURSOR_DEPTH + 1))

        # Extract body of ## Children
        awk '/^## Children$/{f=1; next} /^## [A-Z]/ && f {exit} f' ./MEMORY.md > ./scoped/_children.txt

        WELL_FORMED=0
        FIRST_NEW=""
        # Parser: each child entry is `  state: |` followed by 4-space-indented block scalar.
        # Split on top-level `state: |` lines; the payload of each is everything until the
        # next top-level `state: |` or end of file.
        awk '
          /^  state:[[:space:]]*\|[[:space:]]*$/ {
            if (buf != "") print "<<<NEXT>>>" buf;
            buf = ""; next
          }
          /^    / { sub(/^    /, ""); buf = buf $0 "\n"; next }
        ' ./scoped/_children.txt > ./scoped/_children_split.txt
        echo "<<<NEXT>>>$(cat ./scoped/_children_split.txt | awk '/^<<<NEXT>>>/{exit} {print}')" > /dev/null  # finalize trailing buf

        # Re-parse with a state-machine-friendly loop:
        ENTRIES=$(awk 'BEGIN{state=0; buf=""} 
          /^  state:[[:space:]]*\|[[:space:]]*$/ { if (state==1) print "<<<EOE>>>" buf; buf=""; state=1; next }
          state==1 && /^    / { sub(/^    /, ""); buf=buf $0 "\n"; next }
          END { if (state==1) print "<<<EOE>>>" buf }
        ' ./scoped/_children.txt)

        OLD_IFS="$IFS"; IFS="$(printf '\n')"
        for ENTRY in $ENTRIES; do
          [ -z "$ENTRY" ] && continue
          PAYLOAD=$(echo "$ENTRY" | sed 's/^<<<EOE>>>//')
          NEW_ID="n$(grep -c '^id: n' ./scoped/tree.md)"
          cat >> ./scoped/tree.md << CHILD_EOF
        ---
        id: $NEW_ID
        parent_id: $CURSOR
        depth: $NEXT_DEPTH
        q: 0
        n: 0
        status: live
        CHILD_EOF
          printf '%s' "$PAYLOAD" > "./scoped/state-${NEW_ID}.md"
          [ -z "$FIRST_NEW" ] && FIRST_NEW="$NEW_ID"
          WELL_FORMED=$((WELL_FORMED + 1))
        done
        IFS="$OLD_IFS"

        MISSING=$((5 - WELL_FORMED))

    R50 routing:

        if [ "$WELL_FORMED" -eq 0 ]; then
          # All malformed: mark cursor terminal_fail and re-enter selecting.
          awk -v X="$CURSOR" '
            /^---$/ { in_block = 0; print; next }
            /^id:/  { in_block = ($2 == X); print; next }
            in_block && /^status:/ { print "status: terminal_fail"; next }
            { print }
          ' ./scoped/tree.md > ./scoped/tree.md.tmp && mv ./scoped/tree.md.tmp ./scoped/tree.md
          NEXT_STATE=selecting
          PQ=$(printf '\n## Pending Questions\n- Q: expand-node.md returned zero well-formed state entries for cursor %s; marked terminal_fail.' "$CURSOR")
        else
          echo "$FIRST_NEW" > ./scoped/chosen_child.md
          NEXT_STATE=simulating
          if [ "$MISSING" -gt 0 ]; then
            PQ=$(printf '\n## Pending Questions\n- Q: expand-node.md returned %d well-formed state entries (expected 5).' "$WELL_FORMED")
          else
            PQ=""
          fi
        fi

        cat > ./MEMORY.md << ABSORB_EOF
        ## State
        $NEXT_STATE
        ## Matched Instruction
        Expand-absorb
        ## Last Action
        Absorbed $WELL_FORMED children for $CURSOR; routing to $NEXT_STATE.
        ## Result
        Children appended to scoped/tree.md.$PQ
        ABSORB_EOF

    R50: `## Pending Questions` is appended; state is NEVER `waiting_for_user` here — the loop must keep progressing.
    ````

- [ ] **Step 4: Run test to verify it passes**

    Run: `npm test 2>&1 | grep -E "phase-6b|FAIL"`
    Expected: PASS for R47/R49/R50 assertions.

- [ ] **Step 5: Commit**

    ```bash
    git add interpreters/mas-papers/3-search/b-lats/INSTRUCTIONS.md src/test/phase-6b-lats.test.ts
    git commit -m "feat(phase-6b): Expand-push + Expand-absorb (chosen_child, R50 fallback) (satisfies: R47, R49, R50)"
    ```

---

## Task 17: LATS Simulate-push + Simulate-absorb (rollout + evaluate dispatch)   (satisfies: R51, R52, R53)

**Files:**
- Modify: `interpreters/mas-papers/3-search/b-lats/INSTRUCTIONS.md`
- Modify: `src/test/phase-6b-lats.test.ts`

- [ ] **Step 1: Write the failing test**

    Append to `src/test/phase-6b-lats.test.ts`:

    ```typescript
    describe("phase-6b b-lats: Simulate-push (R51)", () => {
      const s = readFileSync(resolve(INTERP, "INSTRUCTIONS.md"), "utf-8");
      const sp = extractInstructionBody(s, "Simulate-push");

      test("Simulate-push pushes dynamics/rollout.md (R51)", () => {
        assert.match(sp, /## Push\s*\n\s*dynamics\/rollout\.md/);
      });

      test("Simulate-push reads from chosen_child not cursor (R51)", () => {
        assert.match(sp, /\.\/scoped\/chosen_child\.md/);
      });

      test("Simulate-push push-args are partial_state and task only (R51)", () => {
        assert.match(sp, /partial_state:\s*\|/);
        assert.match(sp, /task:\s*\|/);
      });
    });

    describe("phase-6b b-lats: Simulate-absorb (R52, R53)", () => {
      const s = readFileSync(resolve(INTERP, "INSTRUCTIONS.md"), "utf-8");
      const sa = extractInstructionBody(s, "Simulate-absorb");

      test("Simulate-absorb persists ## Terminal State to ./scoped/last_terminal.md (R52)", () => {
        assert.match(sa, /\.\/scoped\/last_terminal\.md/);
      });

      test("Simulate-absorb pushes evaluate.md with attempt and criterion (R52)", () => {
        assert.match(sa, /## Push\s*\n\s*dynamics\/evaluate\.md/);
        assert.match(sa, /attempt:\s*\|/);
        assert.match(sa, /criterion:\s*\|/);
      });

      test("Simulate-absorb criterion is ./scoped/task.md (R67)", () => {
        assert.match(sa, /\.\/scoped\/task\.md/);
        // No workspace path constructed
        assert.doesNotMatch(sa, /\.\.\/\.\.\/workspace/);
      });

      test("Simulate-absorb R53 malformed branch synthesises fail verdict + Pending Questions", () => {
        // Some path that handles missing/empty Terminal State by writing a synthetic verdict
        // and skipping the evaluate push. We accept multiple shapes; key markers:
        assert.match(sa, /## Pending Questions/);
        assert.doesNotMatch(sa, /## State\s*\n\s*waiting_for_user/);
      });
    });
    ```

- [ ] **Step 2: Run test to verify it fails**

    Run: `npm test 2>&1 | grep -E "phase-6b|FAIL"`
    Expected: FAIL — Simulate-push/absorb not yet present.

- [ ] **Step 3: Write minimal implementation**

    Append to `interpreters/mas-papers/3-search/b-lats/INSTRUCTIONS.md`:

    ````markdown
    ## Instruction: Simulate-push
    **Condition:** MEMORY state is "simulating"
    **Action:** Stage push-args from chosen_child (not cursor); emit `## Push dynamics/rollout.md`.

        CC=$(cat ./scoped/chosen_child.md)
        compose_partial_state "$CC" > ./scoped/staged/partial_state.md
        cp ./scoped/task.md ./scoped/staged/task.md

    Then emit MEMORY:

        PS=$(sed 's/^/  /' ./scoped/staged/partial_state.md)
        TK=$(sed 's/^/  /' ./scoped/staged/task.md)

        cat > ./MEMORY.md << SIM_EOF
        ## State
        simulating
        ## Matched Instruction
        Simulate-push
        ## Last Action
        Pushed rollout.md for $CC.
        ## Result
        Push queued.
        ## Push
        dynamics/rollout.md
        ## Push-Args
        partial_state: |
        $PS
        task: |
        $TK
        SIM_EOF

    The state value `simulating` is the returnState; on pop the shell sets state to `simulating_completed`.

    ## Instruction: Simulate-absorb
    **Condition:** MEMORY state is "simulating_completed"
    **Action:** Persist `## Terminal State` to `./scoped/last_terminal.md`. If non-empty, push `dynamics/evaluate.md` with `attempt` = last_terminal and `criterion` = task. If empty/missing, synthesise a `fail` verdict directly and route to `evaluating_completed` (R53).

        # Extract body of ## Terminal State (or empty if missing)
        awk '/^## Terminal State$/{f=1; next} /^## /{f=0} f' ./MEMORY.md > ./scoped/last_terminal.md

        if [ ! -s ./scoped/last_terminal.md ]; then
          # R53 malformed branch: synthesize fail verdict, skip evaluate push
          PQ=$(printf '\n## Pending Questions\n- Q: rollout.md returned empty or missing ## Terminal State; treating as failed rollout.')
          cat > ./MEMORY.md << SYN_EOF
        ## State
        evaluating_completed
        ## Matched Instruction
        Simulate-absorb (malformed)
        ## Last Action
        rollout.md returned malformed output; synthesising fail verdict.
        ## Result
        Synthetic verdict written.
        ## Verdict
        fail
        ## Feedback
        rollout returned malformed output$PQ
        SYN_EOF
        else
          cp ./scoped/last_terminal.md ./scoped/staged/attempt.md
          cp ./scoped/task.md ./scoped/staged/criterion.md
          AT=$(sed 's/^/  /' ./scoped/staged/attempt.md)
          CR=$(sed 's/^/  /' ./scoped/staged/criterion.md)
          cat > ./MEMORY.md << EVAL_EOF
        ## State
        evaluating
        ## Matched Instruction
        Simulate-absorb
        ## Last Action
        Persisted terminal state; pushing evaluate.md.
        ## Result
        Push queued.
        ## Push
        dynamics/evaluate.md
        ## Push-Args
        attempt: |
        $AT
        criterion: |
        $CR
        EVAL_EOF
        fi
    ````

- [ ] **Step 4: Run test to verify it passes**

    Run: `npm test 2>&1 | grep -E "phase-6b|FAIL"`
    Expected: PASS for R51/R52/R53/R67 assertions.

- [ ] **Step 5: Commit**

    ```bash
    git add interpreters/mas-papers/3-search/b-lats/INSTRUCTIONS.md src/test/phase-6b-lats.test.ts
    git commit -m "feat(phase-6b): Simulate-push + Simulate-absorb (rollout dispatch + R53 malformed) (satisfies: R51, R52, R53)"
    ```

---

## Task 18: LATS Evaluate-absorb + Back-prop primitive + solve termination   (satisfies: R54, R55, R56, R57, R67, R68, R82)

**Files:**
- Modify: `interpreters/mas-papers/3-search/b-lats/INSTRUCTIONS.md`
- Modify: `src/test/phase-6b-lats.test.ts`

- [ ] **Step 1: Write the failing test**

    Append to `src/test/phase-6b-lats.test.ts`:

    ```typescript
    describe("phase-6b b-lats: Back-prop primitive (R55)", () => {
      const s = readFileSync(resolve(INTERP, "INSTRUCTIONS.md"), "utf-8");

      test("preamble defines a backprop function (R55)", () => {
        assert.match(s, /\bbackprop\b/);
      });

      test("backprop walks parent chain (while … parent_id) (R55)", () => {
        // The function body must contain a while loop touching parent_id
        const m = s.match(/backprop\s*\(\)\s*\{[\s\S]+?\n\}/);
        assert.ok(m, "backprop function body missing");
        assert.match(m[0], /while/);
        assert.match(m[0], /parent_id/);
      });

      test("backprop increments n and adds reward to q (R55)", () => {
        const m = s.match(/backprop\s*\(\)\s*\{[\s\S]+?\n\}/);
        assert.match(m[0], /N\s*\+\s*1|n\s*=\s*N\s*\+\s*1|\$\(\(\s*N\s*\+\s*1\s*\)\)/);
        assert.match(m[0], /Q\s*\+\s*\$REWARD|\$Q\s*\+\s*\$REWARD/);
      });
    });

    describe("phase-6b b-lats: Evaluate-absorb (R54, R56, R57, R82)", () => {
      const s = readFileSync(resolve(INTERP, "INSTRUCTIONS.md"), "utf-8");
      const ea = extractInstructionBody(s, "Evaluate-absorb");

      test("Evaluate-absorb maps verdict to reward 0/1 (R54)", () => {
        assert.match(ea, /pass\)\s+REWARD=1/);
        assert.match(ea, /fail\)\s+REWARD=0/);
      });

      test("Evaluate-absorb invokes backprop with chosen_child (R55)", () => {
        assert.match(ea, /backprop\s+"\$CC"\s+"\$REWARD"|backprop\s+\$CC\s+\$REWARD/);
      });

      test("reward=1 marks chosen_child terminal_pass and emits ## Solution + done (R56)", () => {
        assert.match(ea, /terminal_pass/);
        assert.match(ea, /## Solution/);
        assert.match(ea, /## State\s*\n\s*done/);
      });

      test("reward=0 transitions to reflecting and does NOT mark terminal_fail (R57)", () => {
        // Look at the failure branch — it should set NEXT_STATE=reflecting and
        // there must NOT be a terminal_fail status update conditioned on reward=0.
        assert.match(ea, /reflecting/);
        // A terminal_fail path may exist in R50 (Expand-absorb), but not in Evaluate-absorb.
        // Soft check: the word terminal_fail does not appear under the reward=0 branch.
        // (We accept presence elsewhere; the regex below pins the failure path is "NEXT_STATE=reflecting".)
        assert.match(ea, /NEXT_STATE\s*=\s*reflecting|state\s*\n\s*reflecting/);
      });

      test("Record-A: no rollout intermediate states are appended to tree.md (R82)", () => {
        // tree.md should only be appended to in Initialize (root) and Expand-absorb (children).
        // Evaluate-absorb body must NOT contain any `cat >> ./scoped/tree.md` or similar.
        assert.doesNotMatch(ea, /cat\s*>>\s*\.\/scoped\/tree\.md/);
        assert.doesNotMatch(ea, />>\s*\.\/scoped\/tree\.md/);
      });
    });
    ```

- [ ] **Step 2: Run test to verify it fails**

    Run: `npm test 2>&1 | grep -E "phase-6b|FAIL"`
    Expected: FAIL — Evaluate-absorb and Back-prop not yet present.

- [ ] **Step 3: Write minimal implementation**

    Insert the **Back-prop primitive** into the strategy preamble (after Compose-partial-state from T14):

    ````markdown
    ### Back-prop primitive (R55)

    Walks the parent chain from a starting node up to and including the root, surgically incrementing `n` by 1 and adding `reward` to `q` at every node on the path.

        backprop() {
          local START="$1"
          local REWARD="$2"
          local CURRENT="$START"
          while [ -n "$CURRENT" ] && [ "$CURRENT" != "-" ]; do
            Q=$(awk -v X="$CURRENT" '/^---$/{ib=0;next} /^id:/{ib=($2==X)} ib && /^q:/{print $2; exit}' ./scoped/tree.md)
            N=$(awk -v X="$CURRENT" '/^---$/{ib=0;next} /^id:/{ib=($2==X)} ib && /^n:/{print $2; exit}' ./scoped/tree.md)
            NEW_Q=$(echo "$Q + $REWARD" | bc -l)
            NEW_N=$((N + 1))
            awk -v X="$CURRENT" -v V="$NEW_Q" '/^---$/{ib=0;print;next} /^id:/{ib=($2==X);print;next} ib && /^q:/{print "q: " V;next} {print}' ./scoped/tree.md > ./scoped/tree.md.tmp && mv ./scoped/tree.md.tmp ./scoped/tree.md
            awk -v X="$CURRENT" -v V="$NEW_N" '/^---$/{ib=0;print;next} /^id:/{ib=($2==X);print;next} ib && /^n:/{print "n: " V;next} {print}' ./scoped/tree.md > ./scoped/tree.md.tmp && mv ./scoped/tree.md.tmp ./scoped/tree.md
            CURRENT=$(awk -v X="$CURRENT" '/^---$/{ib=0;next} /^id:/{ib=($2==X)} ib && /^parent_id:/{print $2; exit}' ./scoped/tree.md)
          done
        }
    ````

    Append the **Evaluate-absorb instruction**:

    ````markdown
    ## Instruction: Evaluate-absorb
    **Condition:** MEMORY state is "evaluating_completed" and `## Verdict` is present in MEMORY
    **Action:** Parse verdict; map to reward (R54). Back-propagate (R55). On reward=1: mark chosen_child terminal_pass (record-A: no intermediate materialisation, R82), emit `## Solution`, set state `done` (R56). On reward=0: transition to `reflecting` (R57; do NOT mark terminal_fail here).

        CC=$(cat ./scoped/chosen_child.md)
        VERDICT=$(awk '/^## Verdict$/{f=1; next} /^## /{f=0} f && /[a-z]/{print; exit}' ./MEMORY.md | tr -d ' ')

        case "$VERDICT" in
          pass) REWARD=1 ;;
          fail) REWARD=0 ;;
          *)    REWARD=0; MALFORMED=1 ;;
        esac

        backprop "$CC" "$REWARD"

        if [ "$REWARD" = "1" ]; then
          awk -v X="$CC" '
            /^---$/ { in_block = 0; print; next }
            /^id:/  { in_block = ($2 == X); print; next }
            in_block && /^status:/ { print "status: terminal_pass"; next }
            { print }
          ' ./scoped/tree.md > ./scoped/tree.md.tmp && mv ./scoped/tree.md.tmp ./scoped/tree.md

          ITER=$(cat ./scoped/iter_count.md)
          TERMINAL=$(cat ./scoped/last_terminal.md)
          cat > ./MEMORY.md << SOLUTION_EOF
        ## State
        done
        ## Matched Instruction
        Evaluate-absorb (solved)
        ## Last Action
        Reward 1 from chosen_child $CC at iteration $ITER.
        ## Result
        Solution found.
        ## Solution
        Iteration: $ITER
        Terminal state:
        $TERMINAL
        SOLUTION_EOF
        else
          if [ -n "$MALFORMED" ]; then
            PQ=$(printf '\n## Pending Questions\n- Q: evaluate.md returned verdict "%s" not in {pass, fail}; treated as fail.' "$VERDICT")
          else
            PQ=""
          fi
          cat > ./MEMORY.md << REFLECT_EOF
        ## State
        reflecting
        ## Matched Instruction
        Evaluate-absorb
        ## Last Action
        Reward 0; back-propagated; routing to reflecting.
        ## Result
        Failure registered.$PQ
        REFLECT_EOF
        fi
    ````

    R67 (text-only mode) and R68 (evaluate.md contract not mutated) are satisfied implicitly: criterion is `./scoped/task.md` (no workspace paths) and Evaluate-absorb does not touch `interpreters/mas-papers/3-search/b-lats/dynamics/evaluate.md`.

- [ ] **Step 4: Run test to verify it passes**

    Run: `npm test 2>&1 | grep -E "phase-6b|FAIL"`
    Expected: PASS for R54/R55/R56/R57/R82 assertions.

- [ ] **Step 5: Commit**

    ```bash
    git add interpreters/mas-papers/3-search/b-lats/INSTRUCTIONS.md src/test/phase-6b-lats.test.ts
    git commit -m "feat(phase-6b): Evaluate-absorb + back-prop + solve termination (record-A) (satisfies: R54, R55, R56, R57, R67, R68, R82)"
    ```

---

## Task 19: LATS Reflect-push + Reflect-absorb + budget exhaustion   (satisfies: R58, R59, R60, R61, R62, R63)

**Files:**
- Modify: `interpreters/mas-papers/3-search/b-lats/INSTRUCTIONS.md`
- Modify: `src/test/phase-6b-lats.test.ts`

- [ ] **Step 1: Write the failing test**

    Append to `src/test/phase-6b-lats.test.ts`:

    ```typescript
    describe("phase-6b b-lats: Reflect-push (R58)", () => {
      const s = readFileSync(resolve(INTERP, "INSTRUCTIONS.md"), "utf-8");
      const rp = extractInstructionBody(s, "Reflect-push");

      test("Reflect-push pushes dynamics/reflect.md (R58)", () => {
        assert.match(rp, /## Push\s*\n\s*dynamics\/reflect\.md/);
      });

      test("Reflect-push push-args attempt + verdict=fail + feedback (R58)", () => {
        assert.match(rp, /attempt:\s*\|/);
        assert.match(rp, /verdict:\s*fail/);
        assert.match(rp, /feedback:\s*\|/);
      });
    });

    describe("phase-6b b-lats: Reflect-absorb (R59, R60, R61, R63)", () => {
      const s = readFileSync(resolve(INTERP, "INSTRUCTIONS.md"), "utf-8");
      const ra = extractInstructionBody(s, "Reflect-absorb");

      test("Reflect-absorb appends to ./scoped/lessons-${CC}.md with >> (R59, R65)", () => {
        assert.match(ra, />>\s*"?\.\/scoped\/lessons-/);
      });

      test("Reflect-absorb increments iter_count and writes back (R61)", () => {
        assert.match(ra, /\.\/scoped\/iter_count\.md/);
        assert.match(ra, /ITER\s*\+\s*1|\$\(\(\s*ITER\s*\+\s*1\s*\)\)/);
      });

      test("Reflect-absorb compares iter_count vs max_iterations (R61)", () => {
        assert.match(ra, /\.\/scoped\/max_iterations\.md/);
        assert.match(ra, /-ge\s+"\$MAX"|\bge\b/);
      });

      test("Budget exhaustion emits ## No Solution Found and done (R61, R63)", () => {
        assert.match(ra, /## No Solution Found/);
        assert.match(ra, /## State\s*\n\s*done/);
      });

      test("Non-exhausted path transitions to selecting for next iteration (R61)", () => {
        assert.match(ra, /## State\s*\n\s*selecting/);
      });

      test("Malformed Lesson handling: Pending Questions, no waiting_for_user (R60)", () => {
        assert.match(ra, /## Pending Questions/);
        assert.doesNotMatch(ra, /## State\s*\n\s*waiting_for_user/);
      });
    });

    describe("phase-6b b-lats: termination invariants (R62, R63)", () => {
      const s = readFileSync(resolve(INTERP, "INSTRUCTIONS.md"), "utf-8");

      test("every state==done write co-occurs with Solution or No Solution Found (R63)", () => {
        // Find each occurrence of `## State\n done` in INSTRUCTIONS.md and verify the
        // surrounding heredoc body contains either ## Solution or ## No Solution Found.
        const heredocs = s.match(/cat\s*>\s*\.\/MEMORY\.md\s*<<\s*[A-Z_]+_EOF[\s\S]+?[A-Z_]+_EOF/g) || [];
        for (const h of heredocs) {
          if (/## State\s*\n\s*done/.test(h)) {
            assert.ok(
              /## Solution/.test(h) || /## No Solution Found/.test(h),
              "found state==done heredoc without Solution/No-Solution-Found: " + h.slice(0, 200),
            );
          }
        }
      });
    });
    ```

- [ ] **Step 2: Run test to verify it fails**

    Run: `npm test 2>&1 | grep -E "phase-6b|FAIL"`
    Expected: FAIL — Reflect-push/absorb not yet present.

- [ ] **Step 3: Write minimal implementation**

    Append two `## Instruction:` blocks to `interpreters/mas-papers/3-search/b-lats/INSTRUCTIONS.md`:

    ````markdown
    ## Instruction: Reflect-push
    **Condition:** MEMORY state is "reflecting"
    **Action:** Stage push-args; emit `## Push dynamics/reflect.md`.

        cp ./scoped/last_terminal.md ./scoped/staged/attempt.md
        echo "fail" > ./scoped/staged/verdict.md
        awk '/^## Feedback$/{f=1; next} /^## /{f=0} f' ./MEMORY.md > ./scoped/staged/feedback.md
        [ -s ./scoped/staged/feedback.md ] || echo "rollout judged fail" > ./scoped/staged/feedback.md

    Then emit MEMORY:

        AT=$(sed 's/^/  /' ./scoped/staged/attempt.md)
        FB=$(sed 's/^/  /' ./scoped/staged/feedback.md)

        cat > ./MEMORY.md << REF_EOF
        ## State
        reflecting
        ## Matched Instruction
        Reflect-push
        ## Last Action
        Pushed reflect.md for failed rollout.
        ## Result
        Push queued.
        ## Push
        dynamics/reflect.md
        ## Push-Args
        attempt: |
        $AT
        verdict: fail
        feedback: |
        $FB
        REF_EOF

    The state value `reflecting` is the returnState; on pop the shell sets state to `reflecting_completed`.

    ## Instruction: Reflect-absorb
    **Condition:** MEMORY state is "reflecting_completed"
    **Action:** Append `## Lesson` (if non-empty, R59) to `./scoped/lessons-<chosen_child>.md` lazily and append-only (R64, R65). Increment iter_count. Budget check: if exhausted, emit `## No Solution Found` and set state `done` (R61, R63); else transition to `selecting`.

        CC=$(cat ./scoped/chosen_child.md)

        LESSON=$(awk '/^## Lesson$/{f=1; next} /^## /{f=0} f' ./MEMORY.md)
        if [ -n "$(echo "$LESSON" | tr -d ' \n')" ]; then
          # Compress multi-line lesson into a single bullet line
          LESSON_FLAT=$(echo "$LESSON" | tr '\n' ' ' | sed 's/  */ /g; s/^ *//; s/ *$//')
          echo "- $LESSON_FLAT" >> "./scoped/lessons-${CC}.md"
          PQ=""
        else
          PQ=$(printf '\n## Pending Questions\n- Q: reflect.md returned empty or missing ## Lesson; no lesson recorded for chosen_child %s.' "$CC")
        fi

        ITER=$(cat ./scoped/iter_count.md)
        NEW_ITER=$((ITER + 1))
        echo "$NEW_ITER" > ./scoped/iter_count.md

        MAX=$(cat ./scoped/max_iterations.md)
        if [ "$NEW_ITER" -ge "$MAX" ]; then
          FAILS=$(grep -c '^status: terminal_fail$' ./scoped/tree.md)
          cat > ./MEMORY.md << EXH_EOF
        ## State
        done
        ## Matched Instruction
        Reflect-absorb (budget exhausted)
        ## Last Action
        Iteration $NEW_ITER reached max_iterations $MAX without reward 1.
        ## Result
        Search exhausted.
        ## No Solution Found
        Iterations: $NEW_ITER
        terminal_fail nodes: $FAILS$PQ
        EXH_EOF
        else
          cat > ./MEMORY.md << SEL_EOF
        ## State
        selecting
        ## Matched Instruction
        Reflect-absorb
        ## Last Action
        Lesson appended; iter_count=$NEW_ITER; routing to selecting.
        ## Result
        Iteration complete.$PQ
        SEL_EOF
        fi
    ````

    R62 (halt at stack depth 1) is satisfied by the shell's well-known halt path: the strategy frame is the only frame on the stack, so `state == done` triggers shell halt.

- [ ] **Step 4: Run test to verify it passes**

    Run: `npm test 2>&1 | grep -E "phase-6b|FAIL"`
    Expected: PASS for R58/R59/R60/R61/R62/R63 assertions.

- [ ] **Step 5: Commit**

    ```bash
    git add interpreters/mas-papers/3-search/b-lats/INSTRUCTIONS.md src/test/phase-6b-lats.test.ts
    git commit -m "feat(phase-6b): Reflect-push + Reflect-absorb + budget exhaustion (satisfies: R58, R59, R60, R61, R62, R63)"
    ```

---

## Task 20: LATS leaf README full content + smoke-check   (satisfies: R3, R70, R71)

**Files:**
- Modify: `interpreters/mas-papers/3-search/b-lats/README.md`
- Modify: `src/test/phase-6b-lats.test.ts`

- [ ] **Step 1: Write the failing test**

    Append to `src/test/phase-6b-lats.test.ts`:

    ```typescript
    describe("phase-6b b-lats: leaf README content (R3)", () => {
      const readme = readFileSync(resolve(INTERP, "README.md"), "utf-8");

      test("README cites Zhou et al. arXiv:2310.04406 (R3)", () => {
        assert.match(readme, /Zhou\s+et\s+al/i);
        assert.match(readme, /2310\.04406/);
      });

      test("README has state-machine summary (R3)", () => {
        // Mentions selecting, expanding, simulating, evaluating, reflecting, done
        for (const st of ["selecting", "expanding", "simulating", "evaluating", "reflecting", "done"]) {
          assert.match(readme, new RegExp(`\\b${st}\\b`));
        }
      });

      test("README has dynamics-and-contracts table (R3)", () => {
        for (const dy of ["expand-node.md", "rollout.md", "evaluate.md", "reflect.md"]) {
          assert.match(readme, new RegExp(escapeRegExp(dy)));
        }
      });

      test("README has Run-it section with new-instance.sh and run.sh (R3)", () => {
        assert.match(readme, /new-instance\.sh.*b-lats/);
        assert.match(readme, /run\.sh/);
      });

      test("README has Notable behaviour section (R3)", () => {
        assert.match(readme, /## Notable behaviour/);
        // Specific notes
        assert.match(readme, /score\.md/i);    // deliberate omission
        assert.match(readme, /pruning/i);      // deliberate omission
        assert.match(readme, /ancestor/i);     // lesson scope
        assert.match(readme, /record-A|materiali[sz]e/i);   // record-A
      });

      test("README mentions Solution / No Solution Found terminal sections (R70 witness)", () => {
        assert.match(readme, /## Solution/);
        assert.match(readme, /## No Solution Found/);
      });
    });
    ```

- [ ] **Step 2: Run test to verify it fails**

    Run: `npm test 2>&1 | grep -E "phase-6b|FAIL"`
    Expected: FAIL — README is still the T7 skeleton.

- [ ] **Step 3: Write minimal implementation**

    Replace `interpreters/mas-papers/3-search/b-lats/README.md` with:

    ````markdown
    # b — Language Agent Tree Search

    *Zhou et al., 2023, arXiv:2310.04406. See `docs/agent-workflows/patterns.md` §Group 3 — Search.*

    ## What's modeled

    Paper-faithful Monte Carlo Tree Search over LLM-generated thoughts. The strategy frame runs an MCTS loop (selection → expansion → simulation → evaluation → back-prop → reflection) bounded by `max_iterations` (default 30). The four dynamics are domain-agnostic: domain knowledge lives exclusively in `PROGRAM.md`. The bundled demo is a byte-equal copy of Phase 6's Game of 24 puzzle, so a LATS run is directly comparable to a ToT run on identical input.

    ## State machine

    Eleven instructions. Two-cycle push/absorb pattern per dynamic dispatch:

    ```
    empty                    → Initialize       → selecting
    selecting                → Select           → expanding (UCT descent picks leaf cursor)
    expanding                → Expand-push      → expanding (shell pop → expanding_completed)
    expanding_completed      → Expand-absorb    → simulating | selecting (R50 zero-children fallback)
    simulating               → Simulate-push    → simulating (shell pop → simulating_completed)
    simulating_completed     → Simulate-absorb  → evaluating
    evaluating               → (push evaluate)  → evaluating (shell pop → evaluating_completed)
    evaluating_completed     → Evaluate-absorb  → done (reward=1, ## Solution)
                                                | reflecting (reward=0)
    reflecting               → Reflect-push     → reflecting (shell pop → reflecting_completed)
    reflecting_completed     → Reflect-absorb   → selecting (next iter)
                                                | done (budget exhausted, ## No Solution Found)
    done                     → (shell halts at stack depth 1)
    ```

    Tree state lives in the strategy frame's `./scoped/tree.md` as an append-only YAML-block ledger; per-node partial states live in `./scoped/state-<id>.md` files (write-once); per-node accumulated lessons live in `./scoped/lessons-<id>.md` files (lazy + append-only). Every field update of `tree.md` is an awk-based surgical edit (R39).

    ## Dynamics

    | File | Push-args | Returns | Stack depth from caller |
    | ---- | --------- | ------- | ----------------------- |
    | `dynamics/expand-node.md` | `partial_state`, `task` | `children` (5 state: entries) | 1 |
    | `dynamics/rollout.md` | `partial_state`, `task` | `terminal_state` (single endpoint) | 1 |
    | `dynamics/evaluate.md` | `attempt`, `criterion` | `verdict` ∈ {`pass`, `fail`}, `feedback` | 1 |
    | `dynamics/reflect.md` | `attempt`, `verdict`, `feedback` | `lesson` | 1 |

    `expand-node.md`, `evaluate.md`, and `reflect.md` are byte-equal copies pinned by `src/test/phase-operators-identity.test.ts`. `rollout.md` is new in this phase.

    ## Demo `PROGRAM.md`

    Byte-equal with `interpreters/mas-papers/3-search/a-tot/PROGRAM.md`: "Find an arithmetic expression using 4, 5, 6, and 10 exactly once that evaluates to 24 using only `+`, `−`, `×`, `÷` and parentheses." Same puzzle as ToT, enabling A/B comparison.

    ## Run it

    ```bash
    ./new-instance.sh my-lats interpreters/mas-papers/3-search/b-lats
    instances/my-lats/run.sh
    ```

    After completion, inspect:

    - `instances/my-lats/frames/f000-strategy/MEMORY.md` for `## Solution` (terminal state + iteration count) or `## No Solution Found` (iteration count + terminal_fail count).
    - `instances/my-lats/frames/f000-strategy/scoped/tree.md` for the full search ledger (q/n statistics per node).
    - `instances/my-lats/frames/f000-strategy/scoped/state-*.md` for per-node partial states.
    - `instances/my-lats/frames/f000-strategy/scoped/lessons-*.md` (if any) for harvested per-node reflections.

    For A/B comparison against Phase 6 ToT on the same puzzle:

    ```bash
    ./new-instance.sh my-tot interpreters/mas-papers/3-search/a-tot
    instances/my-tot/run.sh
    ```

    Contrast the resulting trees: ToT grows breadth-first to fixed `max_depth = N − 1` with 3-sample scoring; LATS grows depth-first via UCT with 1 rollout per iteration.

    ## Notable behaviour

    - **Cycle cost (~10–13 cycles per MCTS iteration, ~30 iterations max)**. Per iteration: selection (1 strategy cycle, no LLM) + expand push/absorb (3 cycles, 1 LLM) + rollout push/absorb (3 cycles, 1 LLM) + evaluate push/absorb (3 cycles, 1 LLM) + on failure reflect push/absorb (3 cycles, 1 LLM). Worst case at `max_iterations=30`: ~390 cycles, ~120 LLM calls. Single-shot LLM-policy rollout (the new `rollout.md`) keeps the per-iteration cost roughly comparable to one Phase 6 score sample.
    - **Deliberate omission of `score.md`.** UCT-driven exploration of rollout-derived statistics replaces graded-rank value sampling. The Phase 6 ToT artefact is intentionally not shipped in `b-lats/dynamics/`. A future LATS variant that wants score-as-UCT-prior can re-introduce it without contract change.
    - **Deliberate omission of pruning.** UCT handles exploration/exploitation implicitly via the second term of the UCT formula. No explicit prune phase exists; the `pruned` status value from Phase 6's enum is absent from the LATS ledger.
    - **Per-node ancestor-walk lesson scope.** A failed rollout from chosen_child C produces a `## Lesson` that is appended to `./scoped/lessons-<C>.md`. Future expansions of any descendant of C see the lesson concatenated into `partial_state` via the Compose-partial-state primitive (root-to-cursor order). Siblings of C don't inherit; this is paper-faithful per-subtree reflexion.
    - **Record-A: failed rollouts do NOT materialise into the tree.** The tree only grows by deliberate UCT expansions (k=5 children per iteration). Winning rollouts are recorded only in MEMORY's `## Solution` section (and in `history/` snapshots). This matches the LATS paper's distinction between deliberate tree growth and throwaway rollouts.
    - **Malformed dynamic outputs are non-blocking.** Bad `expand-node` children (R50), missing `rollout` terminal state (R53), unexpected `evaluate` verdicts (R54), missing `reflect` lessons (R60) all append `## Pending Questions` and progress (treated as fail / fall-through). The strategy never transitions to `waiting_for_user`.
    - **Phase 6 dynamics generalisation landed alongside this interpreter.** As of `docs/specs/2026-05-01-implement-phase-6b/`, `expand-node.md` and `score.md` (Phase 6) are domain-agnostic — same `partial_state` / `task` push-arg shape that LATS uses. The LATS leaf adopts the canonical (post-refactor) `expand-node.md` byte-equal.
    ````

- [ ] **Step 4: Run test to verify it passes**

    Run: `npm test 2>&1 | grep -E "phase-6b|FAIL"`
    Expected: PASS for all R3/R70/R71 README assertions. (R71's structural witness is satisfied by the back-prop primitive's existence pinned in T18; the README mention of q/n statistics in tree.md is the human-readable witness.)

- [ ] **Step 5: Commit**

    ```bash
    git add interpreters/mas-papers/3-search/b-lats/README.md src/test/phase-6b-lats.test.ts
    git commit -m "docs(phase-6b): leaf README full content (state machine, dynamics, smoke check, notable behaviour) (satisfies: R3, R70, R71)"
    ```

---

## Task 21: LATS negative-requirement pins   (satisfies: R76, R77, R78, R79, R80, R81, R83)

**Files:**
- Modify: `src/test/phase-6b-lats.test.ts`

- [ ] **Step 1: Write the failing test**

    Append to `src/test/phase-6b-lats.test.ts`:

    ```typescript
    describe("phase-6b b-lats: negative-requirement pins (R76–R83)", () => {
      const inst = readFileSync(resolve(INTERP, "INSTRUCTIONS.md"), "utf-8");

      test("strategy never references workspace/ (R76)", () => {
        assert.doesNotMatch(inst, /\.\.\/\.\.\/workspace/);
        assert.doesNotMatch(inst, /\bworkspace\//);
      });

      test("dynamics/ does not contain score.md (R77)", () => {
        assert.ok(!existsSync(resolve(INTERP, "dynamics/score.md")));
      });

      test("strategy declares no Prune instruction (R78)", () => {
        assert.doesNotMatch(inst, /^## Instruction:\s*Prune\b/m);
      });

      test("strategy never uses 'pruning' as a state (R78)", () => {
        assert.doesNotMatch(inst, /## State\s*\n\s*pruning/);
      });

      test("hyperparameters not parsed from PROGRAM.md (R79)", () => {
        // Initialize writes max_iterations / uct_c / k as bash literals; doesn't grep PROGRAM.md for them.
        const init = extractInstructionBody(inst, "Initialize");
        assert.doesNotMatch(init, /grep[^\n]*max_iterations[^\n]*PROGRAM\.md/);
        assert.doesNotMatch(init, /grep[^\n]*uct_c[^\n]*PROGRAM\.md/);
        // PROGRAM.md is only touched as a `cp` source for task.md
        const lines = init.split("\n").filter((l) => l.includes("PROGRAM.md"));
        for (const l of lines) {
          assert.ok(/cp\s+\.\.\/\.\.\/PROGRAM\.md/.test(l) || l.trim().startsWith("#"),
            `PROGRAM.md touched by non-cp instruction: ${l}`);
        }
      });

      test("strategy uses no concurrency primitives (R80)", () => {
        // No xargs -P, no trailing &, no parallel
        assert.doesNotMatch(inst, /xargs\s+-P\b/);
        assert.doesNotMatch(inst, /\sparallel\b/);
        // Trailing & at end of bash command (loose check; allow `&&` and `if`/`while` braces)
        const lines = inst.split("\n");
        for (const l of lines) {
          if (/\s&\s*$/.test(l) && !/&&\s*$/.test(l)) {
            assert.fail(`Line ends with backgrounding &: ${l}`);
          }
        }
      });

      test("strategy never reads/writes ../scoped or ../../scoped (R81)", () => {
        // Cross-frame scoped/ access is forbidden — only ./scoped/ (same frame) is allowed.
        assert.doesNotMatch(inst, /\.\.\/scoped/);
        assert.doesNotMatch(inst, /\.\.\/\.\.\/scoped/);
        // Cross-frame frames/ access also forbidden
        assert.doesNotMatch(inst, /frames\/f\d+/);
      });

      test("INSTRUCTIONS.md vocabulary check (R83)", () => {
        const banned = [
          "Game of 24", "arithmetic", "+", "−", "×", "÷",
          "maze", "code", "function", "test suite", "puzzle numbers",
        ];
        for (const word of banned) {
          // Allow these in commit messages or comments? No — INSTRUCTIONS.md is the strategy
          // and it must be domain-agnostic. The comment exception is too loose; we apply strict.
          // Single-character symbols are very common in bash; restrict to specific patterns:
          if (word.length > 1) {
            assert.ok(!inst.includes(word), `INSTRUCTIONS.md contains banned domain word: "${word}"`);
          }
        }
      });

      test("dynamics/ vocabulary check — none of the four contains domain vocab (R83)", () => {
        const dyns = ["expand-node.md", "rollout.md", "evaluate.md", "reflect.md"];
        const banned = ["Game of 24", "Game-of-24", "arithmetic", "maze", "function", "test suite"];
        for (const dy of dyns) {
          const s = readFileSync(resolve(INTERP, "dynamics", dy), "utf-8");
          for (const word of banned) {
            assert.ok(!s.includes(word), `${dy} contains banned domain word: "${word}"`);
          }
        }
      });
    });
    ```

- [ ] **Step 2: Run test to verify it fails**

    Run: `npm test 2>&1 | grep -E "phase-6b|FAIL"`
    Expected: PASS for all assertions if T7–T20 were faithful — these are pin tests that should already hold given the implementation. If any FAIL, fix the underlying violation in the corresponding earlier task before proceeding.

- [ ] **Step 3: Write minimal implementation**

    No implementation needed — these tests pin invariants the design already satisfies. If a test fails, it indicates a regression in an earlier task: go back and fix that task's implementation rather than adding workarounds here.

- [ ] **Step 4: Run test to verify it passes**

    Run: `npm test 2>&1 | grep -E "phase-6b|FAIL"`
    Expected: PASS for all R76–R83 assertions.

- [ ] **Step 5: Commit**

    ```bash
    git add src/test/phase-6b-lats.test.ts
    git commit -m "test(phase-6b): negative-requirement pins (no workspace, no pruning, no domain vocab, etc.) (satisfies: R76, R77, R78, R79, R80, R81, R83)"
    ```

---

## Task 22: Source-spec parent doc updates   (satisfies: R73, R74, R75)

**Files:**
- Modify: `docs/agent-workflows/requirements.md`

- [ ] **Step 1: Write the failing test**

    Append to `src/test/phase-6b-lats.test.ts`:

    ```typescript
    describe("phase-6b: parent doc updates (R73, R74, R75)", () => {
      const parent = readFileSync(resolve(REPO, "docs/agent-workflows/requirements.md"), "utf-8");

      test("dynamics table has expand-node.md row with Partial State and Task (R73)", () => {
        // Expect a table row mentioning expand-node.md with the new push-arg names
        assert.match(parent, /\|\s*`expand-node\.md`\s*\|\s*6\s*\|\s*## Partial State[^|]*## Task/);
      });

      test("dynamics table has score.md row with Partial State and Task (R73)", () => {
        assert.match(parent, /\|\s*`score\.md`\s*\|\s*6\s*\|\s*## Partial State[^|]*## Task/);
      });

      test("dynamics table has rollout.md row at Phase 6b (R73)", () => {
        assert.match(parent, /\|\s*`rollout\.md`\s*\|\s*6b\s*\|\s*## Partial State[^|]*## Task[^|]*\|\s*## Terminal State/);
      });

      test("Phase 6b section mentions rollout.md as a new dynamic (R74)", () => {
        // Find the Phase 6b heading and the surrounding text
        const m6b = parent.match(/## Phase 6b[^]+?(?=^## Phase 7|\z)/m);
        assert.ok(m6b, "Phase 6b section missing");
        assert.match(m6b[0], /rollout\.md/);
        assert.match(m6b[0], /one new dynamic/i);
      });

      test("Phase 6b section no longer claims 'no new dynamics' (R74)", () => {
        const m6b = parent.match(/## Phase 6b[^]+?(?=^## Phase 7|\z)/m);
        assert.doesNotMatch(m6b[0], /no new dynamics/i);
      });

      test("Phase 6 section mentions generalisation in Phase 6b (R75)", () => {
        const m6 = parent.match(/## Phase 3 — Planning[^]*?## Phase 6 —[^]+?(?=^## Phase 6b|\z)/m);
        assert.ok(m6, "Phase 6 section missing");
        assert.match(m6[0], /Generalised in Phase 6b|generalised in Phase 6b/i);
      });
    });
    ```

- [ ] **Step 2: Run test to verify it fails**

    Run: `npm test 2>&1 | grep -E "phase-6b|FAIL"`
    Expected: FAIL — parent doc not yet updated.

- [ ] **Step 3: Write minimal implementation**

    Edit `docs/agent-workflows/requirements.md`:

    1. **In the "Reusable dynamics library" table** (around line 149), update the Phase 6 rows and add a Phase 6b row:

    ```markdown
    | `expand-node.md` | 6 | `## Partial State`, `## Task` | `## Children` | 1 |
    | `score.md`       | 6 | `## Partial State`, `## Task` | `## Value`    | 1 |
    | `rollout.md`     | 6b | `## Partial State`, `## Task` | `## Terminal State` | 1 |
    ```

    (The `evaluate-workflow.md` row from Phase 7 stays where it is, after the new `rollout.md` row.)

    2. **In the `## Phase 6b — Search + refinement + meta: LATS …` section**, replace the bullet/paragraph that begins "**Reuse (no new dynamics):**" with:

    ```markdown
    - **Reuse:**
      - `expand-node.md` (Phase 6, generalised in this same phase) — for node expansion.
      - `evaluate.md` (Phase 1b) — text-only mode, as the rollout reward signal.
      - `reflect.md` (Phase 1c) — pushed on rollout failure to harvest a per-node lesson, propagated into future expansions of the same subtree via ancestor-walk concatenation into `partial_state`.
    - **One new dynamic:** `rollout.md` — paper-faithful LLM-policy single-shot rollout. Receives `partial_state` and `task`; returns a `terminal_state` reached by playing forward in one LLM call. The earlier "no new dynamics" claim was aspirational: paper-faithful rollout has no honest implementation in the existing dynamic contracts (the rollout's job — "play forward to terminal in one shot, return only the endpoint" — is structurally distinct from `expand-node.md`'s "generate k siblings" and from `evaluate.md`'s "judge a complete attempt"); bundling rollout into either would distort their contracts and break their reuse by other interpreters. The deviation is the same shape as Phase 6's R4 deviation (split of `expand-node.md` / `score.md`) and is justified for the same reason: contract preservation over count minimisation.
    ```

    3. **In the Phase 6 section**, add a new paragraph after the existing 3a/b/c subsection list (just before the `---` separator that ends Phase 6):

    ```markdown
    **Generalised in Phase 6b.** As of `docs/specs/2026-05-01-implement-phase-6b/`, Phase 6's `expand-node.md` and `score.md` are domain-agnostic — push-args are the canonical pair `partial_state`/`task`; the strategy persists per-node partial states in `./scoped/state-<id>.md` files; the ledger no longer carries `op`/`left`. BFS semantics (k=5, b=5, max_depth, 3-sample scoring, weighted-sum aggregation, pruning, goal-checking) are unchanged.
    ```

- [ ] **Step 4: Run test to verify it passes**

    Run: `npm test 2>&1 | grep -E "phase-6b|FAIL"`
    Expected: PASS for all R73/R74/R75 assertions.

- [ ] **Step 5: Commit**

    ```bash
    git add docs/agent-workflows/requirements.md src/test/phase-6b-lats.test.ts
    git commit -m "docs(phase-6b): parent doc — dynamics table + Phase 6b prose + Phase 6 generalisation note (satisfies: R73, R74, R75)"
    ```

---

## Task 23: Backwards-compatibility pins (Phase 6 spec untouched, instances)   (satisfies: R28, R85, R86)

**Files:**
- Modify: `src/test/phase-6b-lats.test.ts`

- [ ] **Step 1: Write the failing test**

    Append to `src/test/phase-6b-lats.test.ts`:

    ```typescript
    describe("phase-6b: backwards compatibility (R28, R85, R86)", () => {
      const PHASE6_SPEC = resolve(REPO, "docs/specs/2026-04-30-agent-workflows-phase-6");

      test("Phase 6 spec dir still has all three artefacts (R28, R85)", () => {
        for (const f of ["requirements.md", "design.md", "tasks.md"]) {
          assert.ok(existsSync(resolve(PHASE6_SPEC, f)), `Phase 6 spec ${f} missing`);
        }
      });

      test("Phase 6 spec requirements.md still mentions its own R IDs unchanged (R28, R85)", () => {
        const s = readFileSync(resolve(PHASE6_SPEC, "requirements.md"), "utf-8");
        // Phase 6's own requirements should still be discoverable; key ones:
        assert.match(s, /\*\*R11\*\*/);
        assert.match(s, /\*\*R29\*\*/);
        assert.match(s, /\*\*R35\*\*/);
        assert.match(s, /\*\*R51\*\*/);
        assert.match(s, /\*\*R57\*\*/);
        // The Phase 6 spec's own out-of-scope list still mentions LATS as deferred (R28 — historical record preserved)
        assert.match(s, /LATS \(Phase 6b\)/);
      });

      test("new-instance.sh copies dynamics at creation (R86 supports backward compat)", () => {
        const sh = readFileSync(resolve(REPO, "new-instance.sh"), "utf-8");
        // The script must still copy dynamics/ from interpreter to instance dir
        assert.match(sh, /cp\s+-r\s+"\$INTERP_DIR\/dynamics"\s+"\$DIR\/dynamics"/);
      });
    });
    ```

- [ ] **Step 2: Run test to verify it fails**

    Run: `npm test 2>&1 | grep -E "phase-6b|FAIL"`
    Expected: PASS — all assertions should hold without any code changes (Phase 6 spec was not edited per R28/R85, and `new-instance.sh` was not touched per R86). If any assertion FAILS, that's a sign an earlier task accidentally edited Phase 6 spec or `new-instance.sh`; revert those changes.

- [ ] **Step 3: Write minimal implementation**

    None needed — these are guard pins for "did not edit" requirements.

- [ ] **Step 4: Run test to verify it passes**

    Run: `npm test 2>&1 | grep -E "phase-6b|FAIL"`
    Expected: PASS for all R28/R85/R86 assertions.

- [ ] **Step 5: Commit**

    ```bash
    git add src/test/phase-6b-lats.test.ts
    git commit -m "test(phase-6b): backwards-compat pins (Phase 6 spec untouched, new-instance.sh unchanged) (satisfies: R28, R85, R86)"
    ```
