# Tasks: agent-workflows-phase-1

> **For executors:** use `kiro-flow:spec-execute` (wraps
> `superpowers:subagent-driven-development` or
> `superpowers:executing-plans`). Each task below is TDD-shaped — write the
> failing test first, then minimal code (markdown is code here), then verify,
> then commit. Commit messages MUST end with the task's `(satisfies: R#)`
> tag.

## Task index

| #   | Summary                                                          | Satisfies                             |
| --- | ---------------------------------------------------------------- | ------------------------------------- |
| T0  | Contingent: fix shell bug surfaced by T1–T3                      | R13, R14, R16, R22                    |
| T1  | Build `a-self-refine` + scripted push/pop integration test      | R1, R2, R3, R6, R7, R10, R17, R18, R23 |
| T2  | Build `b-evaluator-optimizer` + integration test                | R1, R2, R4, R6, R7, R10, R17, R18, R23 |
| T3  | Build `c-reflexion` + integration test + palindrome harness     | R1, R2, R4, R5, R6, R7, R10, R11, R12, R17, R18, R19, R23 |
| T4  | Byte-equality test for `evaluate.md` across b and c            | R19                                   |
| T5  | Update `CLAUDE.md` "Existing interpreters" (keep game-team)      | R15, R20, R24                         |
| T6  | End-to-end demo runs on Claude Code + visualiser + notes         | R8, R9, R11, R12, R18, R21, R22       |

Tasks run in order. T0 is contingent — executed only if T1, T2, or T3
surfaces a shell-level blocker. R22 is satisfied passively by T6 (no new
error paths introduced).

---

## Task 0: Contingent shell fix (satisfies: R13, R14, R16, R22)

**When to execute:** Only if T1, T2, or T3 fails for a reason attributable
to shell code (e.g. `applyPop` mis-setting the returnState, `applyPush`
mis-parsing the path, `main.ts` wiring defect). If the failure is only in
the interpreter's markdown, fix the markdown inside the triggering task
instead — do not open T0.

**Files (reserved; filled in by executor):**
- Modify: `src/<module>.ts`
- Test:   `src/test/<module>.test.ts`

- [ ] **Step 1: Reproduce the defect in a failing unit test**

    Add a new `test(...)` block to the closest existing test file in
    `src/test/` that exercises the broken primitive (prefer
    `src/test/call-stack.test.ts`, `src/test/memory.test.ts`, or
    `src/test/stack-integration.test.ts` by subject). The test must fail
    on unpatched `main`.

- [ ] **Step 2: Run test to verify it fails**

    Run: `npm test`
    Expected: FAIL with an assertion pointing at the newly added test.

- [ ] **Step 3: Apply the minimal shell fix**

    Edit the owning `.ts` module in `src/` to make the failing test pass.
    The change MUST be non-breaking and additive (per R14): no
    signature-level renames, no behavioural changes to unaffected code
    paths. If the fix would require a larger refactor, STOP and surface
    the tradeoff to the user before proceeding.

- [ ] **Step 4: Run test to verify it passes**

    Run: `npm test`
    Expected: PASS (all tests green, including pre-existing ones).

- [ ] **Step 5: Commit**

    ```bash
    git add src/<module>.ts src/test/<module>.test.ts
    git commit -m "fix(shell): <one-line description of the fix> (satisfies: R13, R14, R16, R22)"
    ```

---

## Task 1: Build `a-self-refine` interpreter (satisfies: R1, R2, R3, R6, R7, R10, R17, R18, R23)

**Files:**
- Create: `interpreters/mas-papers/1-iterative-refinement/a-self-refine/INSTRUCTIONS.md`
- Create: `interpreters/mas-papers/1-iterative-refinement/a-self-refine/PROGRAM.md`
- Create: `interpreters/mas-papers/1-iterative-refinement/a-self-refine/operators/self-critique.md`
- Test:   `src/test/phase-1-self-refine.test.ts`

- [ ] **Step 1: Write the failing integration test**

    Create `src/test/phase-1-self-refine.test.ts` with the following
    exact content:

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
    const INTERP = resolve(__dirname, "../../interpreters/mas-papers/1-iterative-refinement/a-self-refine");

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
      } else if (pushed.reason === "missing-target") {
        curMemory = pushed.memory;
      }
      return { stack: curStack, memory: curMemory, instructions: curInstructions, halt: false };
    }

    describe("a self-refine", () => {
      test("interpreter files exist at the Group-2 path", () => {
        assert.ok(existsSync(resolve(INTERP, "INSTRUCTIONS.md")), "INSTRUCTIONS.md missing");
        assert.ok(existsSync(resolve(INTERP, "PROGRAM.md")), "PROGRAM.md missing");
        assert.ok(existsSync(resolve(INTERP, "operators/self-critique.md")), "operators/self-critique.md missing");
      });

      test("strategy declares the four required states", () => {
        const strategy = readFileSync(resolve(INTERP, "INSTRUCTIONS.md"), "utf-8");
        for (const needle of [
          'state is "empty"',
          'state is "drafted"',
          'state is "drafted_completed"',
          'state is "done"',
        ]) {
          assert.match(strategy, new RegExp(needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), `strategy missing condition: ${needle}`);
        }
      });

      test("self-critique dynamic declares the empty and critiqued states", () => {
        const dyn = readFileSync(resolve(INTERP, "operators/self-critique.md"), "utf-8");
        assert.match(dyn, /state is "empty"/);
        assert.match(dyn, /state is "critiqued"/);
        assert.match(dyn, /state to "done"/);
      });

      test("push on drafted -> dynamic runs -> pop to drafted_completed", () => {
        const strategy = readFileSync(resolve(INTERP, "INSTRUCTIONS.md"), "utf-8");
        const memory = '## State\ndrafted\n## Draft\nfirst attempt\n## Push\noperators/self-critique.md';

        let r = runStackBlock([], memory, strategy);
        assert.equal(r.halt, false);
        assert.equal(r.stack.length, 1, "push should save one caller frame");
        assert.match(r.memory, /^## State\nempty/m);
        assert.match(r.instructions, /Instruction:/, "dynamic should be loaded");

        const memAfterDynamic = setState(
          r.memory + "\n## Critique\nconcrete feedback\n## Refined\nbetter attempt",
          "done",
        );
        r = runStackBlock(r.stack, memAfterDynamic, r.instructions);
        assert.equal(r.halt, false);
        assert.equal(r.stack.length, 0);
        assert.match(r.memory, /^## State\ndrafted_completed/m);
        assert.equal(r.instructions, strategy);
      });

      test("second loop -> accepted -> halts at done at depth 0", () => {
        const strategy = readFileSync(resolve(INTERP, "INSTRUCTIONS.md"), "utf-8");
        // Simulate the caller deciding to loop once more (drafted again),
        // then accepting the second refinement.
        let memory = '## State\ndrafted\n## Draft\nsecond attempt\n## Push\noperators/self-critique.md';
        let r = runStackBlock([], memory, strategy);
        const memAfterDynamic = setState(
          r.memory + "\n## Critique\nfinal feedback\n## Refined\nfinal text",
          "done",
        );
        r = runStackBlock(r.stack, memAfterDynamic, r.instructions);
        assert.match(r.memory, /^## State\ndrafted_completed/m);

        const memAccepted = setState(r.memory, "done");
        r = runStackBlock(r.stack, memAccepted, r.instructions);
        assert.equal(r.halt, true);
      });
    });
    ```

- [ ] **Step 2: Run test to verify it fails**

    Run: `npm test`
    Expected: FAIL with "INSTRUCTIONS.md missing" (and subsequent file
    checks). Directory does not yet exist.

- [ ] **Step 3: Create the strategy file**

    Create `interpreters/mas-papers/1-iterative-refinement/a-self-refine/INSTRUCTIONS.md`
    with this exact content:

    ````markdown
    # Strategy: Self-Refine

    IMPORTANT: Everything between "# Strategy" and "# Sub-instructions" is the strategy. It must be copied VERBATIM into every update_instructions call. Never modify, summarize, or omit any strategy instruction. Only the "# Sub-instructions" section below changes.

    This interpreter implements the Self-Refine pattern (patterns.md Group 1). A single role drafts, critiques its own draft via the `self-critique.md` dynamic, and decides whether to accept or loop. No memory carries across iterations beyond the current `## Draft`.

    ## Instruction: Initialize
    **Condition:** MEMORY state is "empty"
    **Action:** Read PROGRAM.md. Produce an initial draft addressing the task and write it to `## Draft` in MEMORY. Set state to "drafted".

    ## Instruction: Request critique
    **Condition:** MEMORY state is "drafted" and `## Draft` is present
    **Action:** Write `## Push` with exactly the value `operators/self-critique.md` on its own line. Do not change state — the shell will set it to "empty" when it pushes the dynamic.

    ## Instruction: Evaluate refinement
    **Condition:** MEMORY state is "drafted_completed" and both `## Critique` and `## Refined` are present
    **Action:** Decide whether `## Refined` adequately addresses the task in PROGRAM.md. If it is accepted, set state to "done". If not accepted, replace the content of `## Draft` with the current `## Refined`, remove the `## Critique` and `## Refined` sections from MEMORY, and set state to "drafted" (which re-enters "Request critique").

    ## Instruction: Finish
    **Condition:** MEMORY state is "done"
    **Action:** Call halt with a short summary that includes the final `## Draft`.

    # Sub-instructions

    (none — this interpreter needs none.)
    ````

- [ ] **Step 4: Create the demo `PROGRAM.md`**

    Create `interpreters/mas-papers/1-iterative-refinement/a-self-refine/PROGRAM.md`
    with this exact content:

    ```markdown
    # Goal

    Write a concise, one-paragraph docstring for the existing TypeScript function `parseState` defined in `src/memory.ts` of this repository.

    The docstring should:

    - Describe what `parseState` does in at most three sentences.
    - Describe the one argument (`memory: string`) and the return value.
    - Be written as a JSDoc block comment (`/** ... */`) suitable for placement directly above the function declaration.

    Do not modify any source file; write the final docstring into MEMORY only.
    ```

- [ ] **Step 5: Create the self-critique dynamic**

    Create `interpreters/mas-papers/1-iterative-refinement/a-self-refine/operators/self-critique.md`
    with this exact content:

    ````markdown
    # Dynamic: Self-Critique

    Consumed MEMORY: `## Draft`.
    Produced MEMORY: `## Critique`, `## Refined`.
    Return: state `done` → caller sees `{caller_state}_completed`.

    ## Instruction: Critique
    **Condition:** MEMORY state is "empty" and `## Draft` is present
    **Action:** Read `## Draft`. Write `## Critique` in MEMORY describing concrete strengths, weaknesses, and specific improvements to make. Set state to "critiqued".

    ## Instruction: Refine
    **Condition:** MEMORY state is "critiqued" and both `## Draft` and `## Critique` are present
    **Action:** Read `## Draft` and `## Critique`. Produce an improved version that addresses every critique point and write it to `## Refined`. Set state to "done".
    ````

- [ ] **Step 6: Run test to verify it passes**

    Run: `npm test`
    Expected: PASS. All `a self-refine` test blocks pass; no pre-existing
    tests regress.

- [ ] **Step 7: Commit**

    ```bash
    git add interpreters/mas-papers/1-iterative-refinement/a-self-refine src/test/phase-1-self-refine.test.ts
    git commit -m "feat(interpreters): add a-self-refine with scripted push/pop test (satisfies: R1, R2, R3, R6, R7, R10, R17, R18, R23)"
    ```

---

## Task 2: Build `b-evaluator-optimizer` interpreter (satisfies: R1, R2, R4, R6, R7, R10, R17, R18, R23)

**Files:**
- Create: `interpreters/mas-papers/1-iterative-refinement/b-evaluator-optimizer/INSTRUCTIONS.md`
- Create: `interpreters/mas-papers/1-iterative-refinement/b-evaluator-optimizer/PROGRAM.md`
- Create: `interpreters/mas-papers/1-iterative-refinement/b-evaluator-optimizer/operators/evaluate.md`
- Test:   `src/test/phase-1-evaluator-optimizer.test.ts`

- [ ] **Step 1: Write the failing integration test**

    Create `src/test/phase-1-evaluator-optimizer.test.ts` with this exact
    content:

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
    const INTERP = resolve(__dirname, "../../interpreters/mas-papers/1-iterative-refinement/b-evaluator-optimizer");

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
      } else if (pushed.reason === "missing-target") {
        curMemory = pushed.memory;
      }
      return { stack: curStack, memory: curMemory, instructions: curInstructions, halt: false };
    }

    describe("b evaluator-optimizer", () => {
      test("interpreter files exist", () => {
        assert.ok(existsSync(resolve(INTERP, "INSTRUCTIONS.md")));
        assert.ok(existsSync(resolve(INTERP, "PROGRAM.md")));
        assert.ok(existsSync(resolve(INTERP, "operators/evaluate.md")));
      });

      test("strategy declares the required states", () => {
        const strategy = readFileSync(resolve(INTERP, "INSTRUCTIONS.md"), "utf-8");
        for (const needle of [
          'state is "empty"',
          'state is "attempted"',
          'state is "attempted_completed"',
          'state is "done"',
        ]) {
          assert.match(strategy, new RegExp(needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
        }
      });

      test("evaluate dynamic consumes ## Attempt and ## Criterion, produces ## Verdict and ## Feedback", () => {
        const dyn = readFileSync(resolve(INTERP, "operators/evaluate.md"), "utf-8");
        assert.match(dyn, /## Attempt/);
        assert.match(dyn, /## Criterion/);
        assert.match(dyn, /## Verdict/);
        assert.match(dyn, /## Feedback/);
        assert.match(dyn, /state to "done"/);
      });

      test("fail then pass: attempted -> evaluate fail -> attempted -> evaluate pass -> done", () => {
        const strategy = readFileSync(resolve(INTERP, "INSTRUCTIONS.md"), "utf-8");

        // Cycle A: strategy has produced ## Attempt and ## Criterion and is pushing.
        let r = runStackBlock(
          [],
          '## State\nattempted\n## Criterion\nc1\n## Attempt\nv1\n## Push\noperators/evaluate.md',
          strategy,
        );
        assert.equal(r.stack.length, 1);
        assert.match(r.instructions, /Instruction:/);

        // Evaluator returns fail + feedback.
        let memAfter = setState(
          r.memory + "\n## Verdict\nfail\n## Feedback\nmissed edge case",
          "done",
        );
        r = runStackBlock(r.stack, memAfter, r.instructions);
        assert.equal(r.stack.length, 0);
        assert.match(r.memory, /^## State\nattempted_completed/m);

        // Strategy reacts: rewrites ## Attempt, removes Verdict+Feedback, re-enters attempted, pushes again.
        const memLoop =
          '## State\nattempted\n## Criterion\nc1\n## Attempt\nv2\n## Push\noperators/evaluate.md';
        r = runStackBlock([], memLoop, strategy);
        assert.equal(r.stack.length, 1);

        // Evaluator returns pass.
        memAfter = setState(
          r.memory + "\n## Verdict\npass\n## Feedback\nok",
          "done",
        );
        r = runStackBlock(r.stack, memAfter, r.instructions);
        assert.match(r.memory, /^## State\nattempted_completed/m);

        // Strategy sets done at depth 0 -> halt next stack block.
        const memDone = setState(r.memory, "done");
        r = runStackBlock(r.stack, memDone, r.instructions);
        assert.equal(r.halt, true);
      });
    });
    ```

- [ ] **Step 2: Run test to verify it fails**

    Run: `npm test`
    Expected: FAIL on the "interpreter files exist" assertion first.

- [ ] **Step 3: Create the strategy file**

    Create `interpreters/mas-papers/1-iterative-refinement/b-evaluator-optimizer/INSTRUCTIONS.md`
    with this exact content:

    ````markdown
    # Strategy: Evaluator–Optimizer

    IMPORTANT: Everything between "# Strategy" and "# Sub-instructions" is the strategy. It must be copied VERBATIM into every update_instructions call. Never modify, summarize, or omit any strategy instruction. Only the "# Sub-instructions" section below changes.

    This interpreter implements the Evaluator–Optimizer pattern (patterns.md Group 1). A generator role produces attempts; a separate evaluator role (the `evaluate.md` dynamic) judges each attempt against an explicit `## Criterion` and returns pass/fail with feedback.

    ## Instruction: Initialize
    **Condition:** MEMORY state is "empty"
    **Action:** Read PROGRAM.md. Copy its `## Acceptance Criterion` section verbatim into MEMORY as `## Criterion`. Produce an initial attempt and write it to `## Attempt`. Set state to "attempted".

    ## Instruction: Request evaluation
    **Condition:** MEMORY state is "attempted" and both `## Attempt` and `## Criterion` are present
    **Action:** Write `## Push` with exactly the value `operators/evaluate.md` on its own line. Do not change state.

    ## Instruction: Handle verdict
    **Condition:** MEMORY state is "attempted_completed" and `## Verdict` is present
    **Action:** If `## Verdict` is literally "pass", set state to "done". If `## Verdict` is literally "fail", use `## Feedback` to rewrite the content of `## Attempt` (replacing the prior attempt), remove the `## Verdict` and `## Feedback` sections from MEMORY, and set state to "attempted". If `## Verdict` is anything else, append a `## Pending Questions` item flagging the malformed verdict and set state to "waiting_for_user".

    ## Instruction: Finish
    **Condition:** MEMORY state is "done"
    **Action:** Call halt with a summary that includes the final `## Attempt`.

    # Sub-instructions

    (none — this interpreter needs none.)
    ````

- [ ] **Step 4: Create the demo `PROGRAM.md`**

    Create `interpreters/mas-papers/1-iterative-refinement/b-evaluator-optimizer/PROGRAM.md`
    with this exact content:

    ````markdown
    # Goal

    Rewrite the following technical paragraph in plain, non-expert English.

    ## Source Paragraph

    > Prompt caching amortises the cost of fixed-prefix tokens across repeated API invocations by persisting the model's internal attention state for that prefix, so subsequent calls that reuse the same prefix skip re-encoding and pay a reduced rate for the cached portion of the context window.

    ## Acceptance Criterion

    1. The rewrite is five sentences or fewer.
    2. The rewrite contains none of these jargon terms verbatim: "amortise", "prefix tokens", "attention state", "re-encoding", "context window".
    3. The rewrite preserves the three factual claims of the source: (a) that caching is applied to a fixed initial part of each request, (b) that reusing that part across calls is what unlocks the benefit, and (c) that the benefit is reduced cost for the cached portion.
    ````

- [ ] **Step 5: Create the evaluate dynamic**

    Create `interpreters/mas-papers/1-iterative-refinement/b-evaluator-optimizer/operators/evaluate.md`
    with this exact content:

    ````markdown
    # Dynamic: Evaluate

    Consumed MEMORY: `## Attempt`, `## Criterion`.
    Produced MEMORY: `## Verdict` (literal "pass" or "fail"), `## Feedback`.
    Return: state `done` → caller sees `{caller_state}_completed`.

    ## Instruction: Judge
    **Condition:** MEMORY state is "empty" and both `## Attempt` and `## Criterion` are present
    **Action:** Judge whether `## Attempt` meets every bullet of `## Criterion`. Write `## Verdict` with the literal text `pass` or `fail` on its own line (no other content in that section). Write `## Feedback` describing concretely what is right or wrong, citing specific criterion bullets by number. Set state to "done".
    ````

- [ ] **Step 6: Run test to verify it passes**

    Run: `npm test`
    Expected: PASS. All `b evaluator-optimizer` blocks pass.

- [ ] **Step 7: Commit**

    ```bash
    git add interpreters/mas-papers/1-iterative-refinement/b-evaluator-optimizer src/test/phase-1-evaluator-optimizer.test.ts
    git commit -m "feat(interpreters): add b-evaluator-optimizer with scripted push/pop test (satisfies: R1, R2, R4, R6, R7, R10, R17, R18, R23)"
    ```

---

## Task 3: Build `c-reflexion` interpreter with palindrome harness (satisfies: R1, R2, R4, R5, R6, R7, R10, R11, R12, R17, R18, R19, R23)

**Files:**
- Create: `interpreters/mas-papers/1-iterative-refinement/c-reflexion/INSTRUCTIONS.md`
- Create: `interpreters/mas-papers/1-iterative-refinement/c-reflexion/PROGRAM.md`
- Create: `interpreters/mas-papers/1-iterative-refinement/c-reflexion/test_palindrome.md`
- Create: `interpreters/mas-papers/1-iterative-refinement/c-reflexion/operators/evaluate.md`  *(byte-equal copy of b's)*
- Create: `interpreters/mas-papers/1-iterative-refinement/c-reflexion/operators/reflect.md`
- Test:   `src/test/phase-1-reflexion.test.ts`

- [ ] **Step 1: Write the failing integration test**

    Create `src/test/phase-1-reflexion.test.ts` with this exact content:

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
    const INTERP = resolve(__dirname, "../../interpreters/mas-papers/1-iterative-refinement/c-reflexion");

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
      } else if (pushed.reason === "missing-target") {
        curMemory = pushed.memory;
      }
      return { stack: curStack, memory: curMemory, instructions: curInstructions, halt: false };
    }

    /** Script: evaluate dynamic pushed, returns verdict+feedback, pops. */
    function simulateEvaluate(
      strategy: string,
      lessons: string,
      attempt: string,
      verdict: "pass" | "fail",
      feedback: string,
    ): { memory: string; stack: StackEntry[]; instructions: string } {
      const initial =
        `## State\nattempted\n## Criterion\nc1\n## Lessons\n${lessons}\n## Attempt\n${attempt}\n## Push\noperators/evaluate.md`;
      let r = runStackBlock([], initial, strategy);
      assert.equal(r.stack.length, 1, "evaluate push should save caller frame");
      assert.match(r.instructions, /Instruction: Judge/);
      const memAfter = setState(
        r.memory + `\n## Verdict\n${verdict}\n## Feedback\n${feedback}`,
        "done",
      );
      r = runStackBlock(r.stack, memAfter, r.instructions);
      assert.equal(r.stack.length, 0);
      assert.match(r.memory, /^## State\nattempted_completed/m);
      return r;
    }

    /** Script: reflect dynamic pushed from failed_attempt, returns ## Lesson, pops. */
    function simulateReflect(
      strategy: string,
      memoryAtFailedAttempt: string,
      lessonText: string,
    ): { memory: string; stack: StackEntry[]; instructions: string } {
      const withPush = memoryAtFailedAttempt + "\n## Push\noperators/reflect.md";
      let r = runStackBlock([], withPush, strategy);
      assert.equal(r.stack.length, 1, "reflect push should save caller frame");
      assert.match(r.instructions, /Instruction: Distil lesson/);
      const memAfter = setState(r.memory + `\n## Lesson\n${lessonText}`, "done");
      r = runStackBlock(r.stack, memAfter, r.instructions);
      assert.equal(r.stack.length, 0);
      assert.match(r.memory, /^## State\nfailed_attempt_completed/m);
      return r;
    }

    describe("c reflexion", () => {
      test("interpreter files exist", () => {
        assert.ok(existsSync(resolve(INTERP, "INSTRUCTIONS.md")));
        assert.ok(existsSync(resolve(INTERP, "PROGRAM.md")));
        assert.ok(existsSync(resolve(INTERP, "test_palindrome.md")));
        assert.ok(existsSync(resolve(INTERP, "operators/evaluate.md")));
        assert.ok(existsSync(resolve(INTERP, "operators/reflect.md")));
      });

      test("strategy declares every required state", () => {
        const strategy = readFileSync(resolve(INTERP, "INSTRUCTIONS.md"), "utf-8");
        for (const needle of [
          'state is "empty"',
          'state is "attempting"',
          'state is "attempted"',
          'state is "attempted_completed"',
          'state is "failed_attempt"',
          'state is "failed_attempt_completed"',
          'state is "done"',
        ]) {
          assert.match(strategy, new RegExp(needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), `strategy missing: ${needle}`);
        }
      });

      test("strategy Attempt instruction mentions ## Lessons (R12)", () => {
        const strategy = readFileSync(resolve(INTERP, "INSTRUCTIONS.md"), "utf-8");
        const section = strategy.split(/^## Instruction: Attempt/m)[1] ?? "";
        assert.match(section, /## Lessons/, "Attempt instruction must read ## Lessons before attempting");
      });

      test("reflect dynamic consumes Attempt+Verdict, produces Lesson", () => {
        const dyn = readFileSync(resolve(INTERP, "operators/reflect.md"), "utf-8");
        assert.match(dyn, /## Attempt/);
        assert.match(dyn, /## Verdict/);
        assert.match(dyn, /## Lesson/);
        assert.match(dyn, /state to "done"/);
      });

      test("full loop: two failures accumulate two lessons, third attempt passes (R10, R11)", () => {
        const strategy = readFileSync(resolve(INTERP, "INSTRUCTIONS.md"), "utf-8");

        // --- Failure 1 ---
        let r = simulateEvaluate(strategy, "", "v1", "fail", "missed edge case A");
        // Route to failed_attempt
        let mem = setState(r.memory, "failed_attempt");
        r = simulateReflect(strategy, mem, "always handle case A");

        // Strategy accumulates: append lesson, clear transient sections, set attempting.
        let lessons = "- L1: always handle case A";

        // --- Failure 2 ---
        r = simulateEvaluate(strategy, lessons, "v2", "fail", "missed edge case B");
        mem = setState(r.memory, "failed_attempt");
        r = simulateReflect(strategy, mem, "always handle case B");
        lessons = "- L1: always handle case A\n- L2: always handle case B";

        // --- Pass on attempt 3 ---
        r = simulateEvaluate(strategy, lessons, "v3", "pass", "all good");
        const memDone = setState(r.memory, "done");
        r = runStackBlock(r.stack, memDone, r.instructions);
        assert.equal(r.halt, true);

        // R11: final scripted lessons must contain ≥2 entries.
        const lessonLines = lessons.split("\n").filter((l) => l.startsWith("- L"));
        assert.ok(lessonLines.length >= 2, `expected ≥2 lessons accumulated, got ${lessonLines.length}`);
      });
    });
    ```

- [ ] **Step 2: Run test to verify it fails**

    Run: `npm test`
    Expected: FAIL on the "interpreter files exist" assertion first.

- [ ] **Step 3: Create the strategy file**

    Create `interpreters/mas-papers/1-iterative-refinement/c-reflexion/INSTRUCTIONS.md`
    with this exact content:

    ````markdown
    # Strategy: Reflexion

    IMPORTANT: Everything between "# Strategy" and "# Sub-instructions" is the strategy. It must be copied VERBATIM into every update_instructions call. Never modify, summarize, or omit any strategy instruction. Only the "# Sub-instructions" section below changes.

    This interpreter implements the Reflexion pattern (patterns.md Group 1): Evaluator–Optimizer plus an explicit reflection step that distils each failed attempt into a verbal lesson. Lessons accumulate in `## Lessons` and are read into every subsequent attempt.

    ## Instruction: Initialize
    **Condition:** MEMORY state is "empty"
    **Action:** Read PROGRAM.md. Copy its `## Acceptance Criterion` section verbatim into `## Criterion` in MEMORY. If PROGRAM.md names an auxiliary file to be materialised under `workspace/` (for example the palindrome demo's hidden test file), read the corresponding `*.md` file from the instance directory that contains its content in a fenced code block, extract the code block, and write it to the named path via the `write_file` tool. Initialize an empty `## Lessons` section in MEMORY. Set state to "attempting".

    ## Instruction: Attempt
    **Condition:** MEMORY state is "attempting"
    **Action:** Read `## Criterion` and (if present) `## Lessons`. Produce an attempt that reflects every lesson currently listed in `## Lessons`; write it to `## Attempt`. Set state to "attempted".

    ## Instruction: Request evaluation
    **Condition:** MEMORY state is "attempted" and `## Attempt` is present
    **Action:** Write `## Push` with exactly the value `operators/evaluate.md` on its own line. Do not change state.

    ## Instruction: Route on verdict
    **Condition:** MEMORY state is "attempted_completed" and `## Verdict` is present
    **Action:** If `## Verdict` is literally "pass", set state to "done". Otherwise set state to "failed_attempt".

    ## Instruction: Reflect
    **Condition:** MEMORY state is "failed_attempt" and `## Attempt` and `## Verdict` are present
    **Action:** Write `## Push` with exactly the value `operators/reflect.md` on its own line. Do not change state.

    ## Instruction: Accumulate lesson
    **Condition:** MEMORY state is "failed_attempt_completed" and `## Lesson` is present
    **Action:** Append `## Lesson` as a new numbered bullet to `## Lessons` in MEMORY (e.g. `- L1: ...`, incrementing the index from the highest existing lesson number). Remove the `## Attempt`, `## Verdict`, `## Feedback`, and `## Lesson` sections from MEMORY. Leave `## Lessons` and `## Criterion` untouched. Set state to "attempting".

    ## Instruction: Finish
    **Condition:** MEMORY state is "done"
    **Action:** Call halt with a summary that includes the final `## Attempt` and a listing of `## Lessons` that were used.

    # Sub-instructions

    (none — this interpreter needs none.)
    ````

- [ ] **Step 4: Create the demo `PROGRAM.md`**

    Create `interpreters/mas-papers/1-iterative-refinement/c-reflexion/PROGRAM.md`
    with this exact content:

    ````markdown
    # Goal

    Write a Python function `is_palindrome(s: str) -> bool` that returns `True` when `s` is a palindrome after normalising: the comparison must ignore letter case and ignore non-alphanumeric characters.

    Place the implementation at `workspace/is_palindrome.py` so the evaluator's test harness can import it.

    ## Acceptance Criterion

    1. The file `workspace/is_palindrome.py` exists and defines a function `is_palindrome(s: str) -> bool`.
    2. Running `python workspace/tests/test_palindrome.py` exits with status 0.

    The evaluator will run the test file to produce its verdict. The test file (with hidden edge cases) must be materialised under `workspace/tests/test_palindrome.py` during initialisation — the strategy's "Initialize" instruction reads `test_palindrome.md` from the instance directory, extracts the fenced Python code block, and writes it to that path. Do not modify the test file afterwards.
    ````

- [ ] **Step 5: Create the palindrome test harness (`test_palindrome.md`)**

    Create `interpreters/mas-papers/1-iterative-refinement/c-reflexion/test_palindrome.md`
    with this exact content:

    ````markdown
    # Hidden test harness for the palindrome demo

    The strategy's "Initialize" instruction reads this file, extracts the
    fenced Python block below, and writes it to
    `workspace/tests/test_palindrome.py`. The evaluator dynamic runs
    `python workspace/tests/test_palindrome.py` via the `bash` tool and
    interprets exit status 0 as `pass`, anything else as `fail`.

    ```python
    import sys
    sys.path.insert(0, 'workspace')
    from is_palindrome import is_palindrome

    cases = [
        ("", True),
        ("a", True),
        ("aa", True),
        ("ab", False),
        ("A man, a plan, a canal: Panama", True),
        ("No 'x' in Nixon", True),
        ("race a car", False),
        ("12321", True),
        ("123456", False),
        ("Was it a car or a cat I saw?", True),
        ("Not a palindrome!", False),
    ]

    failures = []
    for i, (s, expected) in enumerate(cases):
        try:
            actual = is_palindrome(s)
        except Exception as e:
            failures.append(f"case {i}: {s!r} raised {type(e).__name__}: {e}")
            continue
        if actual != expected:
            failures.append(f"case {i}: is_palindrome({s!r}) = {actual!r}, expected {expected!r}")

    if failures:
        for line in failures:
            print(line)
        sys.exit(1)
    print("all cases passed")
    sys.exit(0)
    ```
    ````

- [ ] **Step 6: Create the `evaluate.md` dynamic (byte-equal copy of b's)**

    Copy the file byte-for-byte from the b interpreter:

    ```bash
    cp interpreters/mas-papers/1-iterative-refinement/b-evaluator-optimizer/operators/evaluate.md \
       interpreters/mas-papers/1-iterative-refinement/c-reflexion/operators/evaluate.md
    ```

    Do NOT edit the copy. Drift will be caught by T4's byte-equality test.

- [ ] **Step 7: Create the `reflect.md` dynamic**

    Create `interpreters/mas-papers/1-iterative-refinement/c-reflexion/operators/reflect.md`
    with this exact content:

    ````markdown
    # Dynamic: Reflect

    Consumed MEMORY: `## Attempt`, `## Verdict` (and `## Feedback` if present).
    Produced MEMORY: `## Lesson`.
    Return: state `done` → caller sees `{caller_state}_completed`.

    ## Instruction: Distil lesson
    **Condition:** MEMORY state is "empty" and `## Attempt` and `## Verdict` are present
    **Action:** Read `## Attempt`, `## Verdict`, and `## Feedback` if present. Write `## Lesson` as one short verbal rule the next attempt should apply — one or two sentences, phrased as a directive ("always X", "avoid Y"), not a restatement of the feedback. Set state to "done".
    ````

- [ ] **Step 8: Run test to verify it passes**

    Run: `npm test`
    Expected: PASS. All `c reflexion` blocks pass.

- [ ] **Step 9: Commit**

    ```bash
    git add interpreters/mas-papers/1-iterative-refinement/c-reflexion src/test/phase-1-reflexion.test.ts
    git commit -m "feat(interpreters): add c-reflexion with palindrome harness and scripted push/pop test (satisfies: R1, R2, R4, R5, R6, R7, R10, R11, R12, R17, R18, R19, R23)"
    ```

---

## Task 4: Byte-equality test for `evaluate.md` (satisfies: R19)

**Files:**
- Test: `src/test/phase-1-dynamics-identity.test.ts`

- [ ] **Step 1: Write the test**

    Create `src/test/phase-1-dynamics-identity.test.ts` with this exact
    content:

    ```typescript
    import { test, describe } from "node:test";
    import { strict as assert } from "node:assert";
    import { readFileSync } from "fs";
    import { resolve, dirname } from "path";
    import { fileURLToPath } from "url";

    const __filename = fileURLToPath(import.meta.url);
    const __dirname = dirname(__filename);
    const REPO = resolve(__dirname, "../..");

    describe("phase-1 dynamics identity", () => {
      test("evaluate.md is byte-equal across b and c", () => {
        const a = readFileSync(
          resolve(REPO, "interpreters/mas-papers/1-iterative-refinement/b-evaluator-optimizer/operators/evaluate.md"),
        );
        const b = readFileSync(
          resolve(REPO, "interpreters/mas-papers/1-iterative-refinement/c-reflexion/operators/evaluate.md"),
        );
        assert.ok(a.equals(b), "evaluate.md diverged between b and c");
      });
    });
    ```

- [ ] **Step 2: Run test to verify it passes (both copies already exist after T3)**

    Run: `npm test`
    Expected: PASS. Running this test after T3 (which created the copy)
    is the same-commit verification that the copy is byte-equal.

- [ ] **Step 3: Commit**

    ```bash
    git add src/test/phase-1-dynamics-identity.test.ts
    git commit -m "test: enforce byte-equality of evaluate.md across b and c (satisfies: R19)"
    ```

---

## Task 5: Update `CLAUDE.md` "Existing interpreters" (satisfies: R15, R20, R24)

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Read the current "Existing interpreters" subsection**

    Run: `grep -n "Existing interpreters" CLAUDE.md` — note the line
    number.

    Read 40 lines around that line to see the current bullet for
    `game-team` and the shape of each entry.

- [ ] **Step 2: Replace the subsection with the new list (keeping game-team)**

    Edit `CLAUDE.md`. Replace the contents of the "### Existing interpreters"
    subsection with exactly these four bullets (in this order), preserving
    the surrounding `### Existing interpreters` heading and the subsequent
    `### Creating a new interpreter` heading:

    ```markdown
    - **default** (no argument to new-instance.sh) — Step-by-step executor. Reads PROGRAM.md steps, decomposes each into sub-instructions with verification.
    - **`interpreters/game-team`** — Game dev team simulation with fuzzy natural-language conditions. Six roles (team lead, architect, game designer, developer, 2D artist, UI/UX). Scheduled for deletion in Phase 4 of the agent-workflows plan; exempt from the Phase-1 directory layout convention.
    - **`interpreters/mas-papers/1-iterative-refinement/a-self-refine`** — Self-Refine (patterns.md Group 1). Single role drafts, critiques its own output via `self-critique.md`, iterates until accepted.
    - **`interpreters/mas-papers/1-iterative-refinement/b-evaluator-optimizer`** — Evaluator–Optimizer (patterns.md Group 1). Generator produces attempts; external evaluator (`evaluate.md`) judges against an explicit `## Criterion` and returns pass/fail with feedback.
    - **`interpreters/mas-papers/1-iterative-refinement/c-reflexion`** — Reflexion (patterns.md Group 1). Evaluator–Optimizer plus a `reflect.md` step that distils each failed attempt into a verbal lesson accumulated in `## Lessons` and read back into every subsequent attempt.
    ```

    The original game-team bullet's detailed description (scope
    decomposition, user-as-peer framing, etc.) may be trimmed to the
    one-liner above to keep the subsection uniform. The full detail
    remains in the interpreter's own `INSTRUCTIONS.md`.

- [ ] **Step 3: Verify game-team still boots (non-regression for R15)**

    Run:
    ```bash
    ./new-instance.sh gt-smoke interpreters/game-team
    test -f instances/gt-smoke/INSTRUCTIONS.md && test -f instances/gt-smoke/team-lead.md && echo "game-team scaffolds OK"
    rm -rf instances/gt-smoke
    ```
    Expected: `game-team scaffolds OK`. (A full LLM run is out of scope
    for this task; the scaffold check is sufficient to assert R15
    functional continuity at the new-instance.sh level.)

- [ ] **Step 4: Run the test suite (sanity)**

    Run: `npm test`
    Expected: PASS.

- [ ] **Step 5: Commit**

    ```bash
    git add CLAUDE.md
    git commit -m "docs(CLAUDE): list Phase-1 interpreters; keep game-team bullet (satisfies: R15, R20, R24)"
    ```

---

## Task 6: End-to-end demo runs + visualiser + phase-1-notes.md (satisfies: R8, R9, R11, R12, R18, R21, R22)

This task is an **acceptance task** rather than TDD — it costs real LLM
calls and cannot be automated in CI. The executor runs each demo,
inspects the result, and records findings in `docs/agent-workflows/phase-1-notes.md`.

**Files:**
- Create: `docs/agent-workflows/phase-1-notes.md`

- [ ] **Step 1: Ensure build is up to date**

    Run: `npm run build && npm test`
    Expected: `tsc` produces `dist/`, `npm test` passes.

- [ ] **Step 2: Run a self-refine end-to-end**

    Run:
    ```bash
    ./new-instance.sh p1-a interpreters/mas-papers/1-iterative-refinement/a-self-refine
    TURING_PROVIDER=claude-code instances/p1-a/run.sh
    ```
    Expected:
    - Machine halts with `## State\ndone` in `instances/p1-a/MEMORY.md` (R8).
    - `instances/p1-a/history/` contains a contiguous `NNNN-<hash>/`
      sequence, one per cycle (R9).
    - Final MEMORY contains a `## Draft` reflecting a concise docstring
      for `parseState`.

- [ ] **Step 3: Run b evaluator-optimizer end-to-end**

    Run:
    ```bash
    ./new-instance.sh p1-b interpreters/mas-papers/1-iterative-refinement/b-evaluator-optimizer
    TURING_PROVIDER=claude-code instances/p1-b/run.sh
    ```
    Expected:
    - Machine halts at `done` (R8).
    - Final `## Verdict` is `pass` (or the machine stopped after rewriting
      at least once — record which).
    - Final `## Attempt` satisfies the three acceptance-criterion bullets
      in the demo PROGRAM.

- [ ] **Step 4: Run c reflexion end-to-end**

    Run:
    ```bash
    ./new-instance.sh p1-c interpreters/mas-papers/1-iterative-refinement/c-reflexion
    TURING_PROVIDER=claude-code instances/p1-c/run.sh
    ```
    Expected:
    - Machine halts at `done` (R8).
    - `instances/p1-c/MEMORY.md` contains `## Lessons` with **at least
      two** `- L*:` bullets before the final `done` (R11).
    - History contains snapshots where `## Attempt` was rewritten after
      `## Lessons` had grown — qualitative spot-check (R12).
    - `workspace/is_palindrome.py` exists and `python workspace/tests/test_palindrome.py`
      exits 0 when run from `instances/p1-c/`.

- [ ] **Step 5: Verify visualiser replay for each instance (R9, R18)**

    Run each of:
    ```bash
    ./visualize.sh p1-a
    ./visualize.sh p1-b
    ./visualize.sh p1-c
    ```
    Expected: in each case the visualiser launches without runtime error
    and paints the full snapshot sequence. Close the browser tab and
    stop the server between runs.

- [ ] **Step 6: Verify no new error surface (R22)**

    Inspect the three `instances/p1-1*/logs/run-*.log` files. Confirm
    that any retry-exhaustion, quota, or no-match messages use the
    existing shell strings (e.g. `retrying in`, `Quota`, `No instruction
    in INSTRUCTIONS.md matched state`). If a new error message shape is
    present, investigate — it indicates an unintended shell change; roll
    back to T0 if needed.

- [ ] **Step 7: Write `docs/agent-workflows/phase-1-notes.md`**

    Create the file with this exact top structure, then fill in the
    notes from the three runs. If nothing was surprising, replace the
    `<…>` placeholders with a single sentinel line per interpreter.

    ```markdown
    # Phase 1 — Implementation notes

    Written at the end of the agent-workflows-phase-1 spec. One
    paragraph per surprising finding, per interpreter. The goal is that
    Phase 2 (CoVe) and later phases can avoid the same pain.

    ## a self-refine
    <paragraph, or: "nothing surprising during implementation or demo run.">

    ## b evaluator-optimizer
    <paragraph, or: "nothing surprising during implementation or demo run.">

    ## c reflexion
    <paragraph, or: "nothing surprising during implementation or demo run.">

    ## Cross-cutting
    <anything that affected more than one interpreter — e.g. shell
    behaviour, visualiser behaviour, provider quirks — or: "(none).">
    ```

- [ ] **Step 8: Confirm the dynamics table in `docs/agent-workflows/requirements.md` still matches R3–R5**

    Compare the MEMORY contracts in the committed dynamics against the
    rows for `self-critique.md`, `evaluate.md`, and `reflect.md` in the
    top-of-document dynamics table. If any row diverges from what T1/T2/T3
    actually produced, update that row (R19). If the table already matches,
    no edit is needed.

- [ ] **Step 9: Clean up demo instances (optional)**

    Demo instances under `instances/` are gitignored. Remove them if
    they add clutter:
    ```bash
    rm -rf instances/p1-a instances/p1-b instances/p1-c
    ```

- [ ] **Step 10: Commit**

    ```bash
    git add docs/agent-workflows/phase-1-notes.md
    # If T8 required a dynamics-table edit:
    git add docs/agent-workflows/requirements.md
    git commit -m "docs(agent-workflows): record Phase-1 implementation notes and demo acceptance (satisfies: R8, R9, R11, R12, R18, R21, R22)"
    ```
