# Tasks: agent-workflows Phase 2 — Chain-of-Verification

> **For executors:** use `kiro-flow:spec-execute` (it wraps
> `superpowers:subagent-driven-development` or `superpowers:executing-plans`).
> Each task below is TDD-shaped — write the failing test first, then minimal
> code, then verify, then commit. Commit messages must reference the task's
> `(satisfies: R#)` tag.

## Task index

| #   | Summary                                                                  | Satisfies                       |
| --- | ------------------------------------------------------------------------ | ------------------------------- |
| T1  | Add `parsePushArgs` + `removePushArgs` to memory.ts                       | R1, R4, R6                      |
| T2  | Add `substitutePlaceholders` helper to call-stack.ts                      | R2, R6                          |
| T3  | Extend `applyPush` with push-args + `unresolved-placeholder` failure path | R2, R3, R4, R5, R6              |
| T4  | Refactor `a-self-refine`: `self-critique.md` consumes `{{draft}}`         | R7, R10, R12, R13               |
| T5  | Refactor `b-evaluator-optimizer`: `evaluate.md` consumes `{{attempt}}` + `{{criterion}}` | R8, R10, R11, R12, R13 |
| T6  | Refactor `c-reflexion`: sync `evaluate.md` + `reflect.md` with push-args  | R9, R10, R11, R12, R13          |
| T7  | Scaffold `d-cove`: INSTRUCTIONS.md, PROGRAM.md, README.md                 | R14, R15, R19, R22              |
| T8  | Add `d-cove/dynamics/verify.md`                                            | R16, R17                        |
| T9  | Add `d-cove/dynamics/answer-independently.md`                              | R17, R18                        |
| T10 | Scripted integration test for d-cove (incl. depth-2 invariant)            | R20, R25                        |
| T11 | Docs: CLAUDE.md, group README, agent-workflows §Phase 2, phase-2-notes.md | R21, R22, R23, R24              |
| T12 | Live d-cove demo run + final validation                                   | R26, R27                        |

---

## Task 1: Add `parsePushArgs` + `removePushArgs` to memory.ts (satisfies: R1, R4, R6)

**Files:**
- Modify: `src/memory.ts`
- Modify: `src/test/memory.test.ts` (add new describe blocks)

- [ ] **Step 1: Write the failing tests**

    Open `src/test/memory.test.ts`. Append these describe blocks at the end of the file (do not remove existing tests):

    ```typescript
    describe("parsePushArgs", () => {
      test("returns empty object when section absent", () => {
        const memory = "## State\nfoo\n## Push\ndynamics/x.md";
        assert.deepEqual(parsePushArgs(memory), {});
      });

      test("parses single-line key: value pairs", () => {
        const memory = "## State\nfoo\n## Push\nx.md\n## Push-Args\nq: hi\nr: bye";
        assert.deepEqual(parsePushArgs(memory), { q: "hi", r: "bye" });
      });

      test("parses block scalar with | indicator (2-space indent)", () => {
        const memory = "## State\nfoo\n## Push\nx.md\n## Push-Args\ndraft: |\n  line one\n  line two\nq: short";
        assert.deepEqual(parsePushArgs(memory), { draft: "line one\nline two", q: "short" });
      });

      test("stops at next ## heading", () => {
        const memory = "## State\nfoo\n## Push\nx.md\n## Push-Args\nq: hi\n## Other\nignored: yes";
        assert.deepEqual(parsePushArgs(memory), { q: "hi" });
      });

      test("handles section at end of MEMORY without trailing newline", () => {
        const memory = "## State\nfoo\n## Push\nx.md\n## Push-Args\nq: hi";
        assert.deepEqual(parsePushArgs(memory), { q: "hi" });
      });

      test("skips malformed lines, parses valid ones", () => {
        const memory = "## State\nfoo\n## Push\nx.md\n## Push-Args\nq: hi\nbroken-no-colon\nr: bye";
        assert.deepEqual(parsePushArgs(memory), { q: "hi", r: "bye" });
      });

      test("trims trailing empty lines from block-scalar value", () => {
        const memory = "## State\nfoo\n## Push\nx.md\n## Push-Args\ndraft: |\n  one\n  two\n\n## Other\nx";
        assert.deepEqual(parsePushArgs(memory), { draft: "one\ntwo" });
      });
    });

    describe("removePushArgs", () => {
      test("strips section between ## Push-Args and next ## heading", () => {
        const memory = "## State\nfoo\n## Push\nx.md\n## Push-Args\nq: hi\nr: bye\n## Other\nkeep: this";
        const result = removePushArgs(memory);
        assert.equal(result, "## State\nfoo\n## Push\nx.md\n## Other\nkeep: this");
      });

      test("strips section to end of MEMORY when no following ##", () => {
        const memory = "## State\nfoo\n## Push\nx.md\n## Push-Args\nq: hi";
        const result = removePushArgs(memory);
        assert.equal(result, "## State\nfoo\n## Push\nx.md");
      });

      test("returns memory unchanged when section absent", () => {
        const memory = "## State\nfoo\n## Push\nx.md";
        assert.equal(removePushArgs(memory), memory);
      });
    });
    ```

    Add `parsePushArgs, removePushArgs` to the existing import from `../memory.js` at the top of the file (or create the import if no existing test in this file imports from memory.ts; check first).

- [ ] **Step 2: Run tests to verify they fail**

    Run: `npm test -- --test-name-pattern="parsePushArgs|removePushArgs"`
    Expected: FAIL with `parsePushArgs is not a function` or similar.

- [ ] **Step 3: Add the implementations to `src/memory.ts`**

    Append at the end of `src/memory.ts`:

    ```typescript
    /**
     * Parse the ## Push-Args section into a key→value map.
     *
     * Format:
     *   - `key: value` (single-line; rest of line after `: ` is the value)
     *   - `key: |` followed by lines indented by 2 spaces (block scalar;
     *     leading 2 spaces stripped, lines joined with \n, trailing empty
     *     lines trimmed)
     *
     * Returns {} if the section is absent. Skips malformed lines silently —
     * missing args surface later as unresolved placeholders in applyPush.
     */
    export function parsePushArgs(memory: string): Record<string, string> {
      const headerRe = /(^|\n)## Push-Args\n/;
      const headerMatch = memory.match(headerRe);
      if (!headerMatch) return {};
      const start = (headerMatch.index ?? 0) + headerMatch[0].length;

      const remainder = memory.slice(start);
      const nextHeading = remainder.match(/\n## [A-Z]/);
      const sectionEnd = nextHeading
        ? start + (nextHeading.index ?? 0)
        : memory.length;
      const section = memory.slice(start, sectionEnd);

      const result: Record<string, string> = {};
      const lines = section.split("\n");
      let i = 0;
      while (i < lines.length) {
        const line = lines[i];
        const blockMatch = line.match(/^([a-zA-Z_][a-zA-Z0-9_]*): \|$/);
        if (blockMatch) {
          const key = blockMatch[1];
          const valueLines: string[] = [];
          i++;
          while (i < lines.length && (lines[i].startsWith("  ") || lines[i] === "")) {
            valueLines.push(lines[i].startsWith("  ") ? lines[i].slice(2) : "");
            i++;
          }
          while (valueLines.length > 0 && valueLines[valueLines.length - 1] === "") {
            valueLines.pop();
          }
          result[key] = valueLines.join("\n");
          continue;
        }
        const singleMatch = line.match(/^([a-zA-Z_][a-zA-Z0-9_]*): (.+)$/);
        if (singleMatch) {
          result[singleMatch[1]] = singleMatch[2];
        }
        i++;
      }
      return result;
    }

    /** Remove the ## Push-Args section from MEMORY. Mirror of removePush. */
    export function removePushArgs(memory: string): string {
      return memory.replace(/\n?## Push-Args\n[^\n]*(\n(?!## )[^\n]*)*/m, "");
    }
    ```

- [ ] **Step 4: Build and re-run tests**

    Run: `npm run build && npm test -- --test-name-pattern="parsePushArgs|removePushArgs"`
    Expected: PASS — all 10 new tests green.

- [ ] **Step 5: Run full test suite to confirm no regression**

    Run: `npm test`
    Expected: PASS — 82 pre-existing + 10 new = 92 tests.

- [ ] **Step 6: Commit**

    ```bash
    git add src/memory.ts src/test/memory.test.ts
    git commit -m "feat(memory): add parsePushArgs and removePushArgs (satisfies: R1, R4, R6)"
    ```

---

## Task 2: Add `substitutePlaceholders` helper to call-stack.ts (satisfies: R2, R6)

**Files:**
- Modify: `src/call-stack.ts`
- Create: `src/test/push-args.test.ts`

- [ ] **Step 1: Write the failing test**

    Create `src/test/push-args.test.ts`:

    ```typescript
    import { test, describe } from "node:test";
    import { strict as assert } from "node:assert";
    import { substitutePlaceholders } from "../call-stack.js";

    describe("substitutePlaceholders", () => {
      test("substitutes single known placeholder", () => {
        const r = substitutePlaceholders("Hello {{name}}!", { name: "World" });
        assert.equal(r.result, "Hello World!");
        assert.deepEqual(r.unresolved, []);
      });

      test("substitutes multiple occurrences of same key", () => {
        const r = substitutePlaceholders("{{x}} and {{x}} again", { x: "Y" });
        assert.equal(r.result, "Y and Y again");
      });

      test("substitutes multi-line values", () => {
        const r = substitutePlaceholders("Draft:\n{{draft}}\n", { draft: "line1\nline2" });
        assert.equal(r.result, "Draft:\nline1\nline2\n");
      });

      test("returns unresolved list when arg missing", () => {
        const r = substitutePlaceholders("Hi {{a}} and {{b}}", { a: "ok" });
        assert.equal(r.result, "Hi ok and {{b}}");
        assert.deepEqual(r.unresolved, ["b"]);
      });

      test("deduplicates unresolved list", () => {
        const r = substitutePlaceholders("{{a}} {{a}} {{b}} {{b}}", {});
        assert.deepEqual(r.unresolved, ["a", "b"]);
      });

      test("ignores placeholders that don't match identifier rule", () => {
        const r = substitutePlaceholders("{{1bad}} and {{ok}}", { ok: "Y" });
        assert.equal(r.result, "{{1bad}} and Y");
        assert.deepEqual(r.unresolved, []);
      });
    });
    ```

- [ ] **Step 2: Run test to verify it fails**

    Run: `npm test -- --test-name-pattern="substitutePlaceholders"`
    Expected: FAIL with `substitutePlaceholders is not exported` or similar.

- [ ] **Step 3: Add the implementation to `src/call-stack.ts`**

    Append at the end of `src/call-stack.ts`:

    ```typescript
    const PLACEHOLDER_RE = /\{\{([a-zA-Z_][a-zA-Z0-9_]*)\}\}/g;

    /**
     * Replace every {{key}} occurrence in template with args[key].
     * Unmatched keys are left in place and reported in `unresolved`
     * (deduplicated, in source order).
     *
     * Placeholder identifier rule: [a-zA-Z_][a-zA-Z0-9_]*. Anything else
     * inside {{ }} is left as literal text (no match attempted).
     */
    export function substitutePlaceholders(
      template: string,
      args: Record<string, string>,
    ): { result: string; unresolved: string[] } {
      const unresolvedSet = new Set<string>();
      const result = template.replace(PLACEHOLDER_RE, (match, key) => {
        if (key in args) return args[key];
        unresolvedSet.add(key);
        return match;
      });
      return { result, unresolved: [...unresolvedSet] };
    }
    ```

- [ ] **Step 4: Build and re-run tests**

    Run: `npm run build && npm test -- --test-name-pattern="substitutePlaceholders"`
    Expected: PASS — all 6 new tests green.

- [ ] **Step 5: Run full test suite**

    Run: `npm test`
    Expected: PASS — 92 + 6 = 98 tests.

- [ ] **Step 6: Commit**

    ```bash
    git add src/call-stack.ts src/test/push-args.test.ts
    git commit -m "feat(call-stack): add substitutePlaceholders helper (satisfies: R2, R6)"
    ```

---

## Task 3: Extend `applyPush` with push-args + `unresolved-placeholder` failure (satisfies: R2, R3, R4, R5, R6)

**Files:**
- Modify: `src/call-stack.ts` (extend `applyPush`, extend `PushResult`)
- Modify: `src/main.ts` (log unresolved-placeholder)
- Modify: `src/test/push-args.test.ts` (add applyPush tests)

- [ ] **Step 1: Write the failing tests**

    Append to `src/test/push-args.test.ts`:

    ```typescript
    import { applyPush } from "../call-stack.js";

    describe("applyPush with ## Push-Args", () => {
      test("substitutes placeholders successfully and pushes one frame", () => {
        const memory = "## State\nfoo\n## Push\ndyn.md\n## Push-Args\nq: hello";
        const target = "Question: {{q}}";
        const result = applyPush([], memory, "# caller", () => target);
        assert.equal(result.ok, true);
        if (!result.ok) return;
        assert.equal(result.instructions, "Question: hello");
        assert.equal(result.stack.length, 1);
        assert.equal(result.stack[0].returnState, "foo");
        assert.equal(result.stack[0].instructions, "# caller");
        assert.match(result.memory, /^## State\nempty/m);
        assert.doesNotMatch(result.memory, /## Push\b/);
        assert.doesNotMatch(result.memory, /## Push-Args/);
      });

      test("fails on unresolved placeholder, strips both sections, leaves stack untouched", () => {
        const memory = "## State\nfoo\n## Push\ndyn.md\n## Push-Args\nq: hi";
        const target = "{{q}} and {{missing}}";
        const result = applyPush([], memory, "# caller", () => target);
        assert.equal(result.ok, false);
        if (result.ok) return;
        assert.equal(result.reason, "unresolved-placeholder");
        if (result.reason !== "unresolved-placeholder") return;
        assert.deepEqual(result.placeholders, ["missing"]);
        assert.equal(result.target, "dyn.md");
        assert.doesNotMatch(result.memory, /## Push\b/);
        assert.doesNotMatch(result.memory, /## Push-Args/);
      });

      test("succeeds with no Push-Args + no placeholders (R5: today's behaviour)", () => {
        const memory = "## State\nfoo\n## Push\ndyn.md";
        const target = "no placeholders here";
        const result = applyPush([], memory, "# caller", () => target);
        assert.equal(result.ok, true);
        if (!result.ok) return;
        assert.equal(result.instructions, "no placeholders here");
      });

      test("fails when target has placeholders but no Push-Args supplied", () => {
        const memory = "## State\nfoo\n## Push\ndyn.md";
        const target = "needs {{x}}";
        const result = applyPush([], memory, "# caller", () => target);
        assert.equal(result.ok, false);
        if (result.ok) return;
        assert.equal(result.reason, "unresolved-placeholder");
      });

      test("missing-target also strips ## Push-Args (defence-in-depth)", () => {
        const memory = "## State\nfoo\n## Push\ndyn.md\n## Push-Args\nq: hi";
        const result = applyPush([], memory, "# caller", () => null);
        assert.equal(result.ok, false);
        if (result.ok) return;
        assert.equal(result.reason, "missing-target");
        assert.doesNotMatch(result.memory, /## Push-Args/);
      });
    });
    ```

- [ ] **Step 2: Run tests to verify they fail**

    Run: `npm test -- --test-name-pattern="applyPush with"`
    Expected: FAIL — most assertions miss because `applyPush` doesn't yet handle args.

- [ ] **Step 3: Extend `PushResult` and `applyPush` in `src/call-stack.ts`**

    In `src/call-stack.ts`:

    Update the `PushResult` type (replace the existing union):

    ```typescript
    export type PushResult =
      | {
          ok: true;
          stack: StackEntry[];
          memory: string;
          instructions: string;
          target: string;
        }
      | { ok: false; memory: string; reason: "no-push" }
      | { ok: false; memory: string; reason: "missing-target"; target: string }
      | {
          ok: false;
          memory: string;
          reason: "unresolved-placeholder";
          target: string;
          placeholders: string[];
        };
    ```

    Update the imports near the top to add the new helpers:

    ```typescript
    import {
      parseState,
      parsePush,
      removePush,
      setState,
      parsePushArgs,
      removePushArgs,
    } from "./memory.js";
    ```

    Replace the existing `applyPush` body with:

    ```typescript
    export function applyPush(
      stack: StackEntry[],
      memory: string,
      instructions: string,
      readTarget: (path: string) => string | null,
    ): PushResult {
      const target = parsePush(memory);
      if (!target) return { ok: false, memory, reason: "no-push" };

      const args = parsePushArgs(memory);

      const targetContent = readTarget(target);
      if (!targetContent) {
        return {
          ok: false,
          memory: removePushArgs(removePush(memory)),
          reason: "missing-target",
          target,
        };
      }

      const { result: substituted, unresolved } = substitutePlaceholders(
        targetContent,
        args,
      );
      if (unresolved.length > 0) {
        return {
          ok: false,
          memory: removePushArgs(removePush(memory)),
          reason: "unresolved-placeholder",
          target,
          placeholders: unresolved,
        };
      }

      const returnState = parseState(memory);
      const newStack = [...stack, { returnState, instructions }];
      const newMemory = setState(
        removePushArgs(removePush(memory)),
        "empty",
      );

      return { ok: true, stack: newStack, memory: newMemory, instructions: substituted, target };
    }
    ```

    Note: `substitutePlaceholders` is already exported from this file (added in T2).

- [ ] **Step 4: Update `src/main.ts` to log the new failure reason**

    In `src/main.ts`, find the `applyPush` consumer block (around line 367–375). Locate:

    ```typescript
    } else if (pushed.reason === "missing-target") {
      // existing log line
    }
    ```

    Add a third branch immediately after:

    ```typescript
    } else if (pushed.reason === "unresolved-placeholder") {
      writeFileSync(MEMORY_PATH, pushed.memory, "utf-8");
      log(`  [push] ${pushed.target}: unresolved placeholder(s) ${pushed.placeholders.join(", ")}`);
    }
    ```

    (Verify the `missing-target` branch already writes `pushed.memory` back to disk; mirror that behaviour exactly.)

- [ ] **Step 5: Build and re-run tests**

    Run: `npm run build && npm test -- --test-name-pattern="applyPush"`
    Expected: PASS — all five new applyPush tests green; existing applyPush tests in `stack-integration.test.ts` still pass.

- [ ] **Step 6: Run full test suite**

    Run: `npm test`
    Expected: PASS — 98 + 5 = 103 tests.

- [ ] **Step 7: Commit**

    ```bash
    git add src/call-stack.ts src/main.ts src/test/push-args.test.ts
    git commit -m "feat(call-stack): extend applyPush with push-args + unresolved-placeholder failure (satisfies: R2, R3, R4, R5, R6)"
    ```

---

## Task 4: Refactor `a-self-refine` (satisfies: R7, R10, R12, R13)

**Files:**
- Modify: `interpreters/1-iterative-refinement/a-self-refine/dynamics/self-critique.md`
- Modify: `interpreters/1-iterative-refinement/a-self-refine/INSTRUCTIONS.md`
- Modify: `src/test/phase-1-self-refine.test.ts`

- [ ] **Step 1: Update the test to reflect the new push payload shape**

    In `src/test/phase-1-self-refine.test.ts`, locate the test block titled
    `"push on drafted -> dynamic runs -> pop to drafted_completed"`. Replace
    the `memory` declaration line with:

    ```typescript
        const memory = '## State\ndrafted\n## Draft\nfirst attempt\n## Push\ndynamics/self-critique.md\n## Push-Args\ndraft: |\n  first attempt';
    ```

    In the same test block, replace the assertion:

    ```typescript
        assert.match(r.instructions, /Instruction:/, "dynamic should be loaded");
    ```

    with:

    ```typescript
        assert.match(r.instructions, /Instruction:/, "dynamic should be loaded");
        assert.match(r.instructions, /first attempt/, "draft arg should be substituted into dynamic");
        assert.doesNotMatch(r.instructions, /\{\{draft\}\}/, "no unresolved placeholder");
    ```

    Locate the test block titled `"second loop -> accepted -> halts at done at depth 0"`.
    Replace the `memory` declaration line with:

    ```typescript
        let memory = '## State\ndrafted\n## Draft\nsecond attempt\n## Push\ndynamics/self-critique.md\n## Push-Args\ndraft: |\n  second attempt';
    ```

- [ ] **Step 2: Run the updated tests to verify they fail**

    Run: `npm test -- --test-name-pattern="a self-refine|1a self-refine"`
    Expected: FAIL on the new substitution assertion (the dynamic still
    references `## Draft` from MEMORY rather than `{{draft}}`).

- [ ] **Step 3: Refactor the dynamic**

    Overwrite `interpreters/1-iterative-refinement/a-self-refine/dynamics/self-critique.md` with:

    ```markdown
    # Dynamic: Self-Critique

    Receives argument: {{draft}}.
    Produced MEMORY: ## Critique, ## Refined.
    Return: state done → caller sees {caller_state}_completed.

    ## Instruction: Critique
    **Condition:** MEMORY state is "empty"
    **Action:** Critique the draft below — describe concrete strengths, weaknesses, and specific improvements to make. Write `## Critique` in MEMORY. Set state to "critiqued".

    Draft:
    {{draft}}

    ## Instruction: Refine
    **Condition:** MEMORY state is "critiqued" and `## Critique` is present
    **Action:** Read `## Critique`. Produce an improved version of the draft below that addresses every critique point and write it to `## Refined`. Set state to "done".

    Draft:
    {{draft}}
    ```

- [ ] **Step 4: Update the strategy callsite**

    In `interpreters/1-iterative-refinement/a-self-refine/INSTRUCTIONS.md`,
    replace the `Request critique` instruction's Action with:

    ```markdown
    **Action:** Append the following to MEMORY (do not change state — the shell will set it to "empty" when it pushes the dynamic):

        ## Push
        dynamics/self-critique.md
        ## Push-Args
        draft: |
          <verbatim contents of ## Draft, every line indented two spaces>
    ```

- [ ] **Step 5: Run the test suite to confirm green**

    Run: `npm run build && npm test -- --test-name-pattern="a self-refine|1a self-refine"`
    Expected: PASS.

- [ ] **Step 6: Run full test suite**

    Run: `npm test`
    Expected: PASS — all 103 tests.

- [ ] **Step 7: Commit**

    ```bash
    git add interpreters/1-iterative-refinement/a-self-refine/dynamics/self-critique.md interpreters/1-iterative-refinement/a-self-refine/INSTRUCTIONS.md src/test/phase-1-self-refine.test.ts
    git commit -m "refactor(a-self-refine): self-critique receives draft as push-arg (satisfies: R7, R10, R12, R13)"
    ```

---

## Task 5: Refactor `b-evaluator-optimizer` (satisfies: R8, R10, R11, R12, R13)

**Files:**
- Modify: `interpreters/1-iterative-refinement/b-evaluator-optimizer/dynamics/evaluate.md`
- Modify: `interpreters/1-iterative-refinement/b-evaluator-optimizer/INSTRUCTIONS.md`
- Modify: `src/test/phase-1-evaluator-optimizer.test.ts`

- [ ] **Step 1: Update the test to reflect the new push payload shape**

    In `src/test/phase-1-evaluator-optimizer.test.ts`, locate every literal
    memory string that contains `## Push\ndynamics/evaluate.md`. Each
    becomes:

    ```
    ## Push
    dynamics/evaluate.md
    ## Push-Args
    attempt: |
      <attempt content, two-space indented>
    criterion: |
      <criterion content, two-space indented>
    ```

    Add post-substitution assertions where the dynamic is loaded:

    ```typescript
    assert.match(r.instructions, /Attempt:[\s\S]*<attempt content>/);
    assert.doesNotMatch(r.instructions, /\{\{attempt\}\}|\{\{criterion\}\}/);
    ```

    (Use whatever literal attempt/criterion strings the existing test already
    uses; the assertion is just that they appear post-substitution and no
    placeholders remain.)

- [ ] **Step 2: Run tests to verify they fail**

    Run: `npm test -- --test-name-pattern="evaluator-optimizer"`
    Expected: FAIL on substitution assertions.

- [ ] **Step 3: Refactor the dynamic**

    Overwrite `interpreters/1-iterative-refinement/b-evaluator-optimizer/dynamics/evaluate.md` with:

    ```markdown
    # Dynamic: Evaluate

    Receives arguments: {{attempt}}, {{criterion}}.
    Produced MEMORY: ## Verdict (literal "pass" or "fail"), ## Feedback.
    Return: state done → caller sees {caller_state}_completed.

    ## Instruction: Judge
    **Condition:** MEMORY state is "empty"
    **Action:** Judge whether the attempt below meets every bullet of the criterion. Write `## Verdict` with the literal text `pass` or `fail` on its own line (no other content in that section). Write `## Feedback` describing concretely what is right or wrong, citing specific criterion bullets by number. Set state to "done".

    Attempt:
    {{attempt}}

    Criterion:
    {{criterion}}
    ```

- [ ] **Step 4: Update the strategy callsite**

    In `interpreters/1-iterative-refinement/b-evaluator-optimizer/INSTRUCTIONS.md`,
    replace the `Request evaluation` instruction's Action with:

    ```markdown
    **Action:** Append the following to MEMORY (do not change state):

        ## Push
        dynamics/evaluate.md
        ## Push-Args
        attempt: |
          <verbatim contents of ## Attempt, every line indented two spaces>
        criterion: |
          <verbatim contents of ## Criterion, every line indented two spaces>
    ```

- [ ] **Step 5: Run tests**

    Run: `npm run build && npm test -- --test-name-pattern="evaluator-optimizer"`
    Expected: PASS.

- [ ] **Step 6: Run full test suite (still expect 103 since c's evaluate.md hasn't been synced yet — phase-1-dynamics-identity.test.ts will FAIL)**

    Run: `npm test`
    Expected: PARTIAL PASS — `phase-1-dynamics-identity` fails because
    b's evaluate.md no longer matches c's. This is intentional and gets
    fixed in Task 6's commit; do **not** sync c here.

- [ ] **Step 7: Commit (with the expected identity-test failure noted in the message)**

    ```bash
    git add interpreters/1-iterative-refinement/b-evaluator-optimizer/dynamics/evaluate.md interpreters/1-iterative-refinement/b-evaluator-optimizer/INSTRUCTIONS.md src/test/phase-1-evaluator-optimizer.test.ts
    git commit -m "refactor(b-evaluator-optimizer): evaluate receives attempt+criterion as push-args (satisfies: R8, R10, R12, R13)

    Note: phase-1-dynamics-identity test fails until Task 6 syncs c's
    evaluate.md to match. This is the expected mid-refactor state."
    ```

    (Pre-commit hooks will run `npm test`; if your repo's hook is configured to block on failure, temporarily run `git commit --no-verify` and document this in phase-2-notes.md. If the hook is just a warning, proceed normally.)

---

## Task 6: Refactor `c-reflexion`: sync `evaluate.md` + refactor `reflect.md` (satisfies: R9, R10, R11, R12, R13)

**Files:**
- Modify: `interpreters/1-iterative-refinement/c-reflexion/dynamics/evaluate.md` (byte-equal copy from b's)
- Modify: `interpreters/1-iterative-refinement/c-reflexion/dynamics/reflect.md`
- Modify: `interpreters/1-iterative-refinement/c-reflexion/INSTRUCTIONS.md`
- Modify: `src/test/phase-1-reflexion.test.ts`

- [ ] **Step 1: Update the test to reflect new push payload shapes**

    In `src/test/phase-1-reflexion.test.ts`, locate every literal memory
    string that has `## Push\ndynamics/evaluate.md` or
    `## Push\ndynamics/reflect.md`. For evaluate, append:
    ```
    ## Push-Args
    attempt: |
      <attempt content>
    criterion: |
      <criterion content>
    ```
    For reflect, append:
    ```
    ## Push-Args
    attempt: |
      <attempt content>
    verdict: |
      <verdict content>
    feedback: |
      <feedback content>
    ```
    Add post-load assertions that no `{{...}}` remains in `r.instructions`.

- [ ] **Step 2: Run tests to verify they fail**

    Run: `npm test -- --test-name-pattern="reflexion"`
    Expected: FAIL on substitution assertions.

- [ ] **Step 3: Sync c's `evaluate.md` byte-equal with b's**

    Run from repo root:

    ```bash
    cp interpreters/1-iterative-refinement/b-evaluator-optimizer/dynamics/evaluate.md \
       interpreters/1-iterative-refinement/c-reflexion/dynamics/evaluate.md
    ```

- [ ] **Step 4: Refactor `reflect.md`**

    Overwrite `interpreters/1-iterative-refinement/c-reflexion/dynamics/reflect.md`:

    ```markdown
    # Dynamic: Reflect

    Receives arguments: {{attempt}}, {{verdict}}, {{feedback}}.
    Produced MEMORY: ## Lesson.
    Return: state done → caller sees {caller_state}_completed.

    ## Instruction: Distil lesson
    **Condition:** MEMORY state is "empty"
    **Action:** Read the attempt, verdict, and feedback below. Write `## Lesson` as one short verbal rule the next attempt should apply — one or two sentences, phrased as a directive ("always X", "avoid Y"), not a restatement of the feedback. Set state to "done".

    Attempt:
    {{attempt}}

    Verdict:
    {{verdict}}

    Feedback:
    {{feedback}}
    ```

- [ ] **Step 5: Update the strategy callsites**

    In `interpreters/1-iterative-refinement/c-reflexion/INSTRUCTIONS.md`:

    Replace the `Request evaluation` instruction's Action with the same
    block as Task 5 Step 4 (push evaluate.md with attempt + criterion).

    Replace the `Reflect` instruction's Action with:

    ```markdown
    **Action:** Append the following to MEMORY (do not change state):

        ## Push
        dynamics/reflect.md
        ## Push-Args
        attempt: |
          <verbatim contents of ## Attempt, every line indented two spaces>
        verdict: |
          <verbatim contents of ## Verdict, every line indented two spaces>
        feedback: |
          <verbatim contents of ## Feedback, every line indented two spaces; if absent, use the literal value `(no feedback)`>
    ```

- [ ] **Step 6: Run tests**

    Run: `npm run build && npm test`
    Expected: PASS — all 103 tests including `phase-1-dynamics-identity`
    (now b == c again).

- [ ] **Step 7: Commit**

    ```bash
    git add interpreters/1-iterative-refinement/c-reflexion/dynamics/evaluate.md interpreters/1-iterative-refinement/c-reflexion/dynamics/reflect.md interpreters/1-iterative-refinement/c-reflexion/INSTRUCTIONS.md src/test/phase-1-reflexion.test.ts
    git commit -m "refactor(c-reflexion): sync evaluate.md + reflect receives push-args (satisfies: R9, R10, R11, R12, R13)"
    ```

---

## Task 7: Scaffold `d-cove` interpreter (satisfies: R14, R15, R19, R22)

**Files:**
- Create: `interpreters/1-iterative-refinement/d-cove/INSTRUCTIONS.md`
- Create: `interpreters/1-iterative-refinement/d-cove/PROGRAM.md`
- Create: `interpreters/1-iterative-refinement/d-cove/README.md`
- Create: `interpreters/1-iterative-refinement/d-cove/dynamics/.gitkeep` (or skip; verify.md and answer-independently.md land in T8/T9)

- [ ] **Step 1: Create the directory and write `INSTRUCTIONS.md`**

    ```bash
    mkdir -p interpreters/1-iterative-refinement/d-cove/dynamics
    ```

    Create `interpreters/1-iterative-refinement/d-cove/INSTRUCTIONS.md`:

    ```markdown
    # Strategy: Chain-of-Verification

    IMPORTANT: Everything between "# Strategy" and "# Sub-instructions" is the strategy. It must be copied VERBATIM into every update_instructions call. Never modify, summarize, or omit any strategy instruction. Only the "# Sub-instructions" section below changes.

    This interpreter implements the Chain-of-Verification pattern (patterns.md Group 1, Dhuliawala et al., Meta, 2023) at stack depth 2. The drafter emits a candidate answer, then `verify.md` decomposes the answer into independent verification questions. Each question is answered by a separate push of `answer-independently.md`, which receives only its question as an argument and reads PROGRAM.md for shared premise context — it has no access to the draft. After all answers are gathered, `verify.md` emits `## Revised` based on the diff between the draft's claims and the independent answers.

    This interpreter is one-shot: there is no acceptance loop. If the revised answer is still wrong, the run halts with that output. The pattern's value is the structural separation of drafting from claim-checking.

    ## Instruction: Initialize
    **Condition:** MEMORY state is "empty"
    **Action:** Read PROGRAM.md. Produce an initial draft answering the goal and write it to `## Draft` in MEMORY. Set state to "drafted".

    ## Instruction: Request verification
    **Condition:** MEMORY state is "drafted" and `## Draft` is present
    **Action:** Append the following to MEMORY (do not change state — the shell will set it to "empty" when it pushes the dynamic):

        ## Push
        dynamics/verify.md
        ## Push-Args
        draft: |
          <verbatim contents of ## Draft, every line indented two spaces>

    ## Instruction: Finalize
    **Condition:** MEMORY state is "drafted_completed" and `## Revised` is present
    **Action:** Set state to "done".

    ## Instruction: Finish
    **Condition:** MEMORY state is "done"
    **Action:** Call halt with a summary that includes the final `## Revised`.

    # Sub-instructions

    (none — this interpreter needs none.)
    ```

- [ ] **Step 2: Write `PROGRAM.md`**

    Create `interpreters/1-iterative-refinement/d-cove/PROGRAM.md`:

    ```markdown
    # Goal

    Solve the following knights-and-knaves puzzle.

    ## Premises

    Four islanders — Alice, Bob, Carol, Dan. Each is either a knight (always tells the truth) or a knave (always lies). They make these statements:

    - Alice: "Bob and I are of different types."
    - Bob: "Carol is a knave."
    - Carol: "Dan is a knight."
    - Dan: "Alice is a knave."

    ## Task

    Determine the type (knight or knave) of each islander. Return your final assignment as exactly four lines, one per islander, in this form:

        Alice: <knight|knave>
        Bob:   <knight|knave>
        Carol: <knight|knave>
        Dan:   <knight|knave>
    ```

- [ ] **Step 3: Write `README.md`**

    Create `interpreters/1-iterative-refinement/d-cove/README.md`:

    ```markdown
    # d — Chain-of-Verification (CoVe)

    *Dhuliawala et al., Meta, 2023 — "Chain-of-Verification Reduces
    Hallucination in Large Language Models" (arXiv:2309.11495). See
    `docs/agent-workflows/patterns.md` §Group 1.*

    Decomposed self-critique. The drafter produces a candidate answer.
    `verify.md` extracts the answer's atomic claims into N independent
    verification questions and pushes `answer-independently.md` once per
    question. Each child sees only its question (and PROGRAM.md for
    shared premise context) — never the draft or the prior reasoning.
    After all answers are gathered, `verify.md` emits `## Revised`.

    This interpreter is **one-shot**: no acceptance loop. The pattern's
    value is structural separation of drafting from claim-checking, not
    iterative refinement.

    ## State machine

    ```
    empty ─► drafted ─(push verify, args=draft)─► [verify dynamic at depth 1]
                                                            │
                                                            ▼
                                              [N children at depth 2,
                                               one per claim, one at a time]
                                                            │
                                                            ▼
                                                   verify emits ## Revised
                                                            │ done
                                                            ▼
              drafted_completed ─(Finalize)─► done ─(Finish)─► HALT
    ```

    Four strategy instructions: `Initialize`, `Request verification`,
    `Finalize`, `Finish`. No loop.

    ## Dynamics

    | File | Receives | Produces | Notes |
    | --- | --- | --- | --- |
    | `dynamics/verify.md` | `{{draft}}` | `## Revised` (in MEMORY, returned to caller) | Runs at depth 1; iterates over claims, pushing answer-independently per claim. |
    | `dynamics/answer-independently.md` | `{{question}}` | `## Answer` | Single-instruction. Runs at depth 2. Has no access to draft (structurally — its instructions reference no caller MEMORY section). |

    ## Demo `PROGRAM.md`

    A four-person knights-and-knaves puzzle (Alice, Bob, Carol, Dan).
    Unique solution: Alice=knave, Bob=knave, Carol=knight, Dan=knight.
    Frontier models commonly commit to the false Case 1 branch
    (Alice=knight) before backtracking; CoVe surfaces the inconsistency
    via per-statement verification.

    ## Run it

    ```bash
    ./new-instance.sh my-d interpreters/1-iterative-refinement/d-cove
    instances/my-d/run.sh
    ```

    ## Known behaviour

    - **Stack depth 2.** This is the first interpreter that exercises
      depth-2 push/pop. Mid-verification, `.call-stack.json` contains
      two frames; you can confirm by inspecting the file during a run.
    - **Informal isolation.** `answer-independently.md`'s instruction
      text references no caller MEMORY section by name, so a compliant
      LLM has no instructed reason to read `## Draft`. A misbehaving
      model could still `cat MEMORY.md`; we accept this trade-off
      rather than build shell-level memory isolation.
    - **One-shot.** If the revised answer is still wrong, the run
      halts with that output. A future hybrid (CoVe + Evaluator) would
      add an acceptance loop.
    - No iteration cap.
    ```

- [ ] **Step 4: Verify the structure exists**

    Run: `ls interpreters/1-iterative-refinement/d-cove/`
    Expected: `INSTRUCTIONS.md`, `PROGRAM.md`, `README.md`, `dynamics/` (empty so far).

- [ ] **Step 5: Commit**

    ```bash
    git add interpreters/1-iterative-refinement/d-cove/INSTRUCTIONS.md interpreters/1-iterative-refinement/d-cove/PROGRAM.md interpreters/1-iterative-refinement/d-cove/README.md
    git commit -m "feat(d-cove): scaffold Chain-of-Verification interpreter (satisfies: R14, R15, R19, R22)"
    ```

---

## Task 8: Add `d-cove/dynamics/verify.md` (satisfies: R16, R17)

**Files:**
- Create: `interpreters/1-iterative-refinement/d-cove/dynamics/verify.md`

- [ ] **Step 1: Write the dynamic**

    Create `interpreters/1-iterative-refinement/d-cove/dynamics/verify.md`:

    ```markdown
    # Dynamic: Verify

    Receives argument: {{draft}}.
    Produced MEMORY: ## Revised.
    Return: state done → caller sees {caller_state}_completed.

    Internal MEMORY scratch (cleared before pop): ## Verifications.
    Pushes (depth 2): dynamics/answer-independently.md, once per claim.

    ## Instruction: Pose questions
    **Condition:** MEMORY state is "empty"
    **Action:** Read the draft below. Decompose it into N >= 2 atomic factual or inferential claims. Write `## Verifications` to MEMORY as a numbered list, one bullet per claim, each in the form:

        - V1: <verification question that tests claim 1>; pending
        - V2: <verification question that tests claim 2>; pending
        - ...

    Each verification question must be self-contained enough that an answerer with access to PROGRAM.md (premises only) and the question alone can evaluate it without seeing the draft. Set state to "asking".

    Draft:
    {{draft}}

    ## Instruction: Ask next
    **Condition:** MEMORY state is "asking" and `## Verifications` contains at least one bullet ending in `pending`
    **Action:** Find the first V_i bullet whose status is `pending`. Append the following to MEMORY (do not change state):

        ## Push
        dynamics/answer-independently.md
        ## Push-Args
        question: |
          <verbatim text of V_i's verification question, two-space indented>

    ## Instruction: Record answer
    **Condition:** MEMORY state is "asking_completed" and `## Answer` is present
    **Action:** In `## Verifications`, locate the V_i that was most recently asked (the first bullet still ending in `pending`). Replace `pending` with `answered: <verbatim contents of ## Answer>`. Remove the `## Answer` section from MEMORY. If any bullet in `## Verifications` still ends in `pending`, set state to "asking". Otherwise set state to "revising".

    ## Instruction: Build revised
    **Condition:** MEMORY state is "revising"
    **Action:** Read `## Verifications` (now fully answered) and the draft below. For each claim in the draft, compare against the corresponding V_i answer. Where they agree, keep the draft's claim. Where they disagree, replace the draft's claim with the verified value. Write the corrected full answer to `## Revised` in MEMORY. Remove the `## Verifications` section from MEMORY. Set state to "done".

    Draft:
    {{draft}}
    ```

- [ ] **Step 2: Verify it loads as a string**

    Run:
    ```bash
    test -s interpreters/1-iterative-refinement/d-cove/dynamics/verify.md && echo OK
    ```
    Expected: `OK`.

- [ ] **Step 3: Commit**

    ```bash
    git add interpreters/1-iterative-refinement/d-cove/dynamics/verify.md
    git commit -m "feat(d-cove): add verify.md depth-1 dynamic (satisfies: R16, R17)"
    ```

---

## Task 9: Add `d-cove/dynamics/answer-independently.md` (satisfies: R17, R18)

**Files:**
- Create: `interpreters/1-iterative-refinement/d-cove/dynamics/answer-independently.md`

- [ ] **Step 1: Write the dynamic**

    Create `interpreters/1-iterative-refinement/d-cove/dynamics/answer-independently.md`:

    ```markdown
    # Dynamic: Answer Independently

    Receives argument: {{question}}.
    Produced MEMORY: ## Answer.
    Return: state done → caller sees {caller_state}_completed.

    ## Instruction: Answer in isolation
    **Condition:** MEMORY state is "empty"
    **Action:** Answer the question below using only:
      (a) the premises in PROGRAM.md (you may read PROGRAM.md), and
      (b) general world knowledge applicable to the question.

    You have no draft, no prior reasoning, and no access to other MEMORY sections produced by the caller. Do not read MEMORY.md beyond checking your own `## State` header.

    Write your answer to `## Answer` in MEMORY (one sentence preferred, short paragraph maximum). Set state to "done".

    Question:
    {{question}}
    ```

- [ ] **Step 2: Verify**

    Run:
    ```bash
    test -s interpreters/1-iterative-refinement/d-cove/dynamics/answer-independently.md && echo OK
    ```
    Expected: `OK`.

- [ ] **Step 3: Commit**

    ```bash
    git add interpreters/1-iterative-refinement/d-cove/dynamics/answer-independently.md
    git commit -m "feat(d-cove): add answer-independently.md depth-2 leaf (satisfies: R17, R18)"
    ```

---

## Task 10: Scripted integration test for d-cove (satisfies: R20, R25)

**Files:**
- Create: `src/test/phase-2-cove.test.ts`

- [ ] **Step 1: Write the test**

    Create `src/test/phase-2-cove.test.ts`:

    ```typescript
    import { test, describe } from "node:test";
    import { strict as assert } from "node:assert";
    import { readFileSync, existsSync } from "fs";
    import { resolve, dirname } from "path";
    import { fileURLToPath } from "url";
    import { applyPop, applyPush, type StackEntry } from "../call-stack.js";
    import { parseState, setState } from "../memory.js";

    const __filename = fileURLToPath(import.meta.url);
    const __dirname = dirname(__filename);
    const INTERP = resolve(__dirname, "../../interpreters/1-iterative-refinement/d-cove");

    function readTarget(p: string): string | null {
      const full = resolve(INTERP, p);
      if (!existsSync(full)) return null;
      const content = readFileSync(full, "utf-8");
      return content || null;
    }

    function runStackBlock(
      stack: StackEntry[],
      memory: string,
      instructions: string,
    ): { stack: StackEntry[]; memory: string; instructions: string; halt: boolean } {
      const popped = applyPop(stack, memory, instructions);
      let curStack = popped.stack;
      let curMemory = popped.memory;
      let curInstructions = popped.instructions;
      if (parseState(curMemory) === "done" && curStack.length === 0) {
        return { stack: curStack, memory: curMemory, instructions: curInstructions, halt: true };
      }
      const pushed = applyPush(curStack, curMemory, curInstructions, readTarget);
      if (pushed.ok) {
        curStack = pushed.stack;
        curMemory = pushed.memory;
        curInstructions = pushed.instructions;
      } else if (pushed.reason === "missing-target" || pushed.reason === "unresolved-placeholder") {
        curMemory = pushed.memory;
      }
      return { stack: curStack, memory: curMemory, instructions: curInstructions, halt: false };
    }

    describe("d-cove", () => {
      test("interpreter files exist", () => {
        for (const f of [
          "INSTRUCTIONS.md",
          "PROGRAM.md",
          "README.md",
          "dynamics/verify.md",
          "dynamics/answer-independently.md",
        ]) {
          assert.ok(existsSync(resolve(INTERP, f)), `${f} missing`);
        }
      });

      test("strategy declares the four required states", () => {
        const strategy = readFileSync(resolve(INTERP, "INSTRUCTIONS.md"), "utf-8");
        for (const needle of [
          'state is "empty"',
          'state is "drafted"',
          'state is "drafted_completed"',
          'state is "done"',
        ]) {
          assert.match(
            strategy,
            new RegExp(needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
            `strategy missing condition: ${needle}`,
          );
        }
      });

      test("verify.md declares the four internal states", () => {
        const dyn = readFileSync(resolve(INTERP, "dynamics/verify.md"), "utf-8");
        for (const needle of [
          'state is "empty"',
          'state is "asking"',
          'state is "asking_completed"',
          'state is "revising"',
          'state to "done"',
        ]) {
          assert.match(
            dyn,
            new RegExp(needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
            `verify.md missing condition: ${needle}`,
          );
        }
      });

      test("answer-independently.md is single-instruction and references no caller MEMORY section", () => {
        const dyn = readFileSync(resolve(INTERP, "dynamics/answer-independently.md"), "utf-8");
        const instructionCount = (dyn.match(/^## Instruction:/gm) ?? []).length;
        assert.equal(instructionCount, 1, "expected exactly one instruction");
        assert.doesNotMatch(dyn, /## Draft\b/, "must not reference ## Draft");
        assert.doesNotMatch(dyn, /## Verifications\b/, "must not reference ## Verifications");
        assert.doesNotMatch(dyn, /## Revised\b/, "must not reference ## Revised");
      });

      test("strategy push of verify.md substitutes draft and reaches depth 1", () => {
        const strategy = readFileSync(resolve(INTERP, "INSTRUCTIONS.md"), "utf-8");
        const memory =
          '## State\ndrafted\n## Draft\nA draft with claims\n' +
          '## Push\ndynamics/verify.md\n' +
          '## Push-Args\ndraft: |\n  A draft with claims';
        const r = runStackBlock([], memory, strategy);
        assert.equal(r.halt, false);
        assert.equal(r.stack.length, 1, "depth should be 1 after pushing verify.md");
        assert.match(r.instructions, /Dynamic: Verify/);
        assert.match(r.instructions, /A draft with claims/, "draft arg substituted");
        assert.doesNotMatch(r.instructions, /\{\{draft\}\}/, "no unresolved placeholder");
      });

      test("verify.md push of answer-independently.md reaches depth 2 (R20)", () => {
        const strategy = readFileSync(resolve(INTERP, "INSTRUCTIONS.md"), "utf-8");
        // First push: strategy → verify.md (depth 1)
        const memory1 =
          '## State\ndrafted\n## Draft\nclaim text\n' +
          '## Push\ndynamics/verify.md\n' +
          '## Push-Args\ndraft: |\n  claim text';
        let r = runStackBlock([], memory1, strategy);
        assert.equal(r.stack.length, 1);
        const verifyInstr = r.instructions;

        // Simulate verify.md having posed and now asking: it sets state to
        // "asking" and writes ## Push for answer-independently.md.
        const askingMemory =
          '## State\nasking\n' +
          '## Verifications\n- V1: Is X true?; pending\n' +
          '## Push\ndynamics/answer-independently.md\n' +
          '## Push-Args\nquestion: |\n  Is X true?';
        r = runStackBlock(r.stack, askingMemory, verifyInstr);
        assert.equal(r.halt, false);
        assert.equal(r.stack.length, 2, "depth must be 2 with answer-independently pushed");
        assert.match(r.instructions, /Dynamic: Answer Independently/);
        assert.match(r.instructions, /Is X true\?/, "question arg substituted");
      });

      test("answer-independently pops back to verify with asking_completed", () => {
        const strategy = readFileSync(resolve(INTERP, "INSTRUCTIONS.md"), "utf-8");
        // Build a stack with strategy at 0, verify at 1, answer-indep at 2
        const memory1 =
          '## State\ndrafted\n## Draft\nclaim\n' +
          '## Push\ndynamics/verify.md\n## Push-Args\ndraft: |\n  claim';
        let r = runStackBlock([], memory1, strategy);
        const verifyInstr = r.instructions;
        const askingMemory =
          '## State\nasking\n## Verifications\n- V1: Q?; pending\n' +
          '## Push\ndynamics/answer-independently.md\n## Push-Args\nquestion: |\n  Q?';
        r = runStackBlock(r.stack, askingMemory, verifyInstr);
        assert.equal(r.stack.length, 2);

        // Simulate answer-indep producing ## Answer and setting state to done
        const answerMemory = setState(r.memory + "\n## Answer\nyes", "done");
        r = runStackBlock(r.stack, answerMemory, r.instructions);
        assert.equal(r.halt, false);
        assert.equal(r.stack.length, 1, "popped back to verify");
        assert.match(r.memory, /^## State\nasking_completed/m);
        assert.match(r.memory, /## Answer\nyes/);
        assert.equal(r.instructions, verifyInstr, "verify.md instructions restored");
      });
    });
    ```

- [ ] **Step 2: Run the new test**

    Run: `npm run build && npm test -- --test-name-pattern="d-cove"`
    Expected: PASS — all 6 d-cove tests green.

- [ ] **Step 3: Run full test suite**

    Run: `npm test`
    Expected: PASS — 103 + 6 = 109 tests.

- [ ] **Step 4: Commit**

    ```bash
    git add src/test/phase-2-cove.test.ts
    git commit -m "test(d-cove): scripted integration with depth-2 invariant (satisfies: R20, R25)"
    ```

---

## Task 11: Documentation updates (satisfies: R21, R22, R23, R24)

**Files:**
- Modify: `CLAUDE.md`
- Modify: `interpreters/1-iterative-refinement/README.md`
- Modify: `docs/agent-workflows/requirements.md`
- Create: `docs/agent-workflows/phase-2-notes.md`

- [ ] **Step 1: Update `CLAUDE.md`**

    Locate the "Dynamics (Call Stack)" section. Immediately after the
    "Push." subsection (where `## Push` is documented), add a new
    subsection:

    ```markdown
    **Push-Args (arguments).** A dynamic can declare `{{placeholders}}`
    in its instruction text. The caller passes values by writing
    `## Push-Args` immediately after `## Push`:

    ```
    ## Push
    dynamics/answer-independently.md
    ## Push-Args
    question: When was X founded?
    draft: |
      Multi-line values use a YAML-style block scalar with two-space
      indentation. Lines are joined with newlines; trailing empty
      lines are trimmed.
    ```

    Before installing the loaded INSTRUCTIONS, the shell substitutes
    every `{{key}}` with the corresponding value from `## Push-Args`.
    If any `{{placeholder}}` remains unresolved after substitution, the
    push fails with reason `unresolved-placeholder` (same lifecycle as
    `missing-target`: both `## Push` and `## Push-Args` are stripped
    from MEMORY, the error is logged, the stack stays unchanged).

    When `## Push-Args` is absent, no substitution is attempted; a
    target file with no `{{...}}` syntax loads verbatim. A target file
    that *does* contain `{{...}}` but receives no args fails with
    `unresolved-placeholder` — this catches programmer errors where a
    caller forgets to pass required args.

    Implementation: `parsePushArgs` and `removePushArgs` in
    `src/memory.ts`; `substitutePlaceholders` and the extended
    `applyPush` in `src/call-stack.ts`.
    ```

- [ ] **Step 2: Update `interpreters/1-iterative-refinement/README.md`**

    Add a fourth row to the comparison table:

    ```
    | [`d-cove/`](./d-cove/) | self (decomposed at depth 2) | none | per-claim Q&A from `answer-independently.md` |
    ```

    In the "Coming next in this group" section, replace the Phase 2
    bullet with a one-line note that Phase 2 has shipped:

    ```markdown
    ## Coming next in this group

    Phase 2 (CoVe / `d-cove`) shipped together with the
    arguments-via-INSTRUCTIONS shell convention. Future variants in
    this group, if any, would compose CoVe with iteration (e.g. CoVe +
    Evaluator–Optimizer hybrid).
    ```

    Add a new section at the bottom of the group README, before
    "See also":

    ```markdown
    ## Arguments via INSTRUCTIONS (push-args)

    All four dynamics in this group receive their per-call inputs via
    `## Push-Args` + `{{var}}` substitution at push time, rather than
    by reading caller-controlled MEMORY sections. The convention
    separates per-frame arguments (in INSTRUCTIONS, scoped to the
    frame) from the shared heap (MEMORY, persistent across pops). See
    `CLAUDE.md` "Dynamics (Call Stack) → Push-Args" for the contract.

    Outputs (`## Critique`, `## Refined`, `## Verdict`, `## Feedback`,
    `## Lesson`, `## Revised`, `## Answer`) are still written to
    MEMORY — they're the call's return value to the caller.
    ```

- [ ] **Step 3: Update `docs/agent-workflows/requirements.md` §Phase 2**

    Locate `## Phase 2 — Chain-of-Verification (patterns.md Group 1, nested variant)`.
    Replace the body with:

    ```markdown
    ## Phase 2 — Chain-of-Verification (patterns.md Group 1, nested variant)

    Still iterative refinement, but the critique step is *decomposed*
    into independent verification Q&A. First interpreter that requires
    **stack depth 2**, so it doubles as a snapshot/restore stress test
    for the shell.

    Phase 2 also introduces the **arguments-via-INSTRUCTIONS** shell
    convention (`## Push-Args` + `{{var}}` substitution) and retrofits
    the existing `a`/`b`/`c` dynamics onto it. The convention retires
    "prompt trust" as the isolation mechanism for `answer-independently.md`
    and cleanly separates per-frame arguments (INSTRUCTIONS) from the
    shared heap (MEMORY).

    **Deliverables:**
    - `interpreters/1-iterative-refinement/d-cove/`
    - Shell extension to `applyPush` in `src/call-stack.ts`
    - Refactored `a`/`b`/`c` dynamics

    - Strategy: drafter emits a candidate answer, pushes `verify.md`
      with `{{draft}}` as a push-arg.
    - New dynamic: `verify.md` — generates N >= 2 verification questions
      from the draft, for each pushes `answer-independently.md` with
      `{{question}}`, collects answers from MEMORY, emits `## Revised`.
    - New dynamic: `answer-independently.md` — answers one question
      using PROGRAM.md and general knowledge; references no caller
      MEMORY section.
    - Demo `PROGRAM.md`: a four-person knights-and-knaves puzzle where
      first-pass reasoning commonly drifts.
    - **Reuse:** the arguments-via-INSTRUCTIONS convention introduced
      by this phase is used by all four dynamics in Group 1 from this
      phase onward.
    - **Validation:** mid-verify, `.call-stack.json` contains two
      frames (asserted by `src/test/phase-2-cove.test.ts`).
    ```

- [ ] **Step 4: Create `docs/agent-workflows/phase-2-notes.md`**

    Initial template (executor will append findings during the live
    demo in Task 12):

    ```markdown
    # Phase 2 — Implementation notes

    Captured at the end of the agent-workflows-phase-2 spec. Findings
    that future phases can use to avoid the same pain.

    ## Push-args parser

    (To be filled during/after implementation. Note: any surprises in
    the YAML-ish parser, especially around block-scalar indentation
    edge cases.)

    ## Retrofit of a/b/c

    (To be filled. Note: any places where the strategy callsites had
    to grow significantly more verbose, and whether the LLM reliably
    follows the new "append ## Push and ## Push-Args" Action format.)

    ## d-cove live demo

    (To be filled by Task 12. Record: number of cycles to halt,
    whether all four V_i were genuinely answered independently
    (`history/` evidence), final ## Revised content, comparison
    against the unique solution Alice=knave, Bob=knave, Carol=knight,
    Dan=knight.)

    ## Cross-cutting

    (To be filled.)
    ```

- [ ] **Step 5: Commit**

    ```bash
    git add CLAUDE.md interpreters/1-iterative-refinement/README.md docs/agent-workflows/requirements.md docs/agent-workflows/phase-2-notes.md
    git commit -m "docs: document push-args + d-cove across CLAUDE.md, group README, agent-workflows (satisfies: R21, R22, R23, R24)"
    ```

---

## Task 12: Live d-cove demo run + final validation (satisfies: R26, R27)

**Files:**
- Modify: `docs/agent-workflows/phase-2-notes.md` (append findings)

- [ ] **Step 1: Create a fresh d-cove instance**

    Run:
    ```bash
    ./new-instance.sh p2-cove interpreters/1-iterative-refinement/d-cove
    ```
    Expected: `Instance 'p2-cove' created at instances/p2-cove/`.

- [ ] **Step 2: Run the demo end-to-end**

    Run:
    ```bash
    instances/p2-cove/run.sh
    ```
    Expected: machine progresses through cycles, eventually halting at
    `## State: done`. Allowable runtime: a few minutes against
    `claude-code` with Haiku.

- [ ] **Step 3: Verify R26 acceptance criteria**

    ```bash
    # MEMORY is at done with ## Revised
    grep -q '^## State$' instances/p2-cove/MEMORY.md && \
      grep -A1 '^## State$' instances/p2-cove/MEMORY.md | tail -1 | grep -q '^done$' && \
      grep -q '^## Revised$' instances/p2-cove/MEMORY.md && \
      echo "R26 first half: PASS"

    # At least one history snapshot has stack depth 2
    found=0
    for f in instances/p2-cove/history/*/.call-stack.json; do
      depth=$(node -e "console.log(JSON.parse(require('fs').readFileSync('$f','utf-8')).length)")
      if [ "$depth" = "2" ]; then found=1; break; fi
    done
    [ "$found" = "1" ] && echo "R26 second half: PASS (depth-2 evidence in history)"
    ```

    Expected: both `PASS` lines printed.

- [ ] **Step 4: Verify the answer**

    Inspect `instances/p2-cove/MEMORY.md`'s `## Revised` section. The
    expected unique solution is:

    ```
    Alice: knave
    Bob:   knave
    Carol: knight
    Dan:   knight
    ```

    Allowable variance: capitalisation, surrounding prose, line ordering,
    spacing. If the model produced a different assignment, that's a Phase-2
    *demo* gap (the pattern still ran correctly if depth-2 was observed) —
    record it in phase-2-notes.md (Task 11 Step 4 left a placeholder).

- [ ] **Step 5: Append findings to `docs/agent-workflows/phase-2-notes.md`**

    Replace the four placeholder sections in `phase-2-notes.md` with
    actual observations from the run. At minimum:
    - Cycle count to halt.
    - Whether all V_i were genuinely answered before revision (count
      `## Push: dynamics/answer-independently.md` occurrences in
      `instances/p2-cove/logs/run-*.log`).
    - The final `## Revised` content verbatim.
    - Whether it matches the unique solution; if not, which step
      drifted.
    - Anything surprising in the push-args parser, the retrofit, or
      the depth-2 mechanic.

- [ ] **Step 6: Commit the notes**

    ```bash
    git add docs/agent-workflows/phase-2-notes.md
    git commit -m "docs(agent-workflows): record Phase-2 implementation notes and demo acceptance (satisfies: R26, R27)"
    ```

- [ ] **Step 7: Final test sweep**

    Run: `npm test`
    Expected: PASS — 109 tests (82 phase-1 + 10 memory.test push-args +
    11 push-args.test + 6 phase-2-cove).

- [ ] **Step 8: Spec marked done by orchestrator**

    Reply `approve` to the Phase 4 banner. The orchestrator's `continue`
    handler will set `phase: "done"` in `.kiro-state.json` and print the
    final `[kiro-flow] All tasks complete. Spec marked done.` line.
