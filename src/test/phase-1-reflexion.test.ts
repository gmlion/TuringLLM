import { test, describe, beforeEach, afterEach } from "node:test";
import { strict as assert } from "node:assert";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { tmpdir } from "os";
import { fileURLToPath } from "url";
import { execSync } from "child_process";
import { applyPop, applyPush, type CallStack } from "../call-stack.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO = resolve(__dirname, "../..");
const INTERP = resolve(__dirname, "../../interpreters/mas-papers/1-iterative-refinement/c-reflexion");

// Module-level helper: creates the root frame directory structure and returns a
// pre-populated call stack pointing at frames/f000-strategy. `tmp` is passed
// explicitly so the helper can be used from any describe block.
function setupRootFrame(
  tmp: string,
  initialMemory: string
): { cs: CallStack; rootMemPath: string } {
  mkdirSync(resolve(tmp, "frames/f000-strategy/scoped"), { recursive: true });
  const rootMemPath = resolve(tmp, "frames/f000-strategy/MEMORY.md");
  writeFileSync(rootMemPath, initialMemory, "utf-8");
  const cs: CallStack = {
    nextCounter: 1,
    stack: [{ returnState: "<root>", frameDir: "frames/f000-strategy" }],
  };
  return { cs, rootMemPath };
}

describe("1c reflexion", () => {
  test("interpreter files exist", () => {
    assert.ok(existsSync(resolve(INTERP, "INSTRUCTIONS.md")), "INSTRUCTIONS.md missing");
    assert.ok(existsSync(resolve(INTERP, "PROGRAM.md")), "PROGRAM.md missing");
    assert.ok(existsSync(resolve(INTERP, "test_palindrome.md")), "test_palindrome.md missing");
    assert.ok(existsSync(resolve(INTERP, "operators/evaluate.md")), "operators/evaluate.md missing");
    assert.ok(existsSync(resolve(INTERP, "operators/reflect.md")), "operators/reflect.md missing");
  });

  test("strategy declares every required state", () => {
    // After Phase-7 migration INSTRUCTIONS.md is a marker; the strategy lives in the operator file.
    const strategy = readFileSync(resolve(INTERP, "operators/reflexion.md"), "utf-8");
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

  test("strategy uses all three scoped files", () => {
    // After Phase-7 migration INSTRUCTIONS.md is a marker; the strategy lives in the operator file.
    const strategy = readFileSync(resolve(INTERP, "operators/reflexion.md"), "utf-8");
    assert.match(strategy, /\.\/scoped\/attempt\.md/, "strategy should reference ./scoped/attempt.md");
    assert.match(strategy, /\.\/scoped\/criterion\.md/, "strategy should reference ./scoped/criterion.md");
    assert.match(strategy, /\.\/scoped\/lessons\.md/, "strategy should reference ./scoped/lessons.md");
  });

  test("strategy uses surgical append for lessons.md (R23)", () => {
    // After Phase-7 migration INSTRUCTIONS.md is a marker; the strategy lives in the operator file.
    const strategy = readFileSync(resolve(INTERP, "operators/reflexion.md"), "utf-8");
    // Must have echo + >> for surgical append
    assert.match(strategy, /echo/, "strategy must use echo for lessons.md append");
    assert.match(strategy, />>.*\.\/scoped\/lessons\.md|\.\/scoped\/lessons\.md.*>>/, "strategy must use >> (append) for lessons.md");
    // The strategy header (outside instructions) must forbid wholesale rewrites of lessons.md
    const header = strategy.split(/^## Instruction:/m)[0] ?? "";
    assert.match(header, /wholesale rewrites are forbidden|wholesale rewrite.*forbidden|forbidden.*wholesale rewrite/i,
      "strategy header must explicitly forbid wholesale rewrites of lessons.md");
  });

  test("strategy does not use ## Attempt or ## Criterion as intermediate MEMORY sections", () => {
    // After Phase-7 migration INSTRUCTIONS.md is a marker; the strategy lives in the operator file.
    const strategy = readFileSync(resolve(INTERP, "operators/reflexion.md"), "utf-8");
    // ## Attempt and ## Criterion must never appear as MEMORY sections in the strategy
    // (they live exclusively in ./scoped/ files during execution).
    // Note: ## Lessons IS written as terminal output — that is intentional.
    // After the F4 fix the Finish instruction was folded into "Route on verdict" (pass branch),
    // so ## Lessons now appears in the single-heredoc that also writes ## State done.
    assert.doesNotMatch(strategy, /^## Attempt\b/m, "strategy should not use ## Attempt in MEMORY");
    assert.doesNotMatch(strategy, /^## Criterion\b/m, "strategy should not use ## Criterion in MEMORY");
    // Verify ## Lessons only appears inside an instruction body that also writes ## State done
    // (i.e. it is terminal output, not an intermediate MEMORY section).
    // Approach: for every instruction block that contains ^## Lessons, confirm the same block also
    // writes "## State\ndone" (the canonical terminal write).
    const blocks = strategy.split(/^## Instruction:/m);
    for (let i = 1; i < blocks.length; i++) {
      const block = blocks[i];
      if (/^## Lessons\b/m.test(block)) {
        assert.match(block, /## State\s*\ndone\b/,
          "strategy should not use ## Lessons as an intermediate MEMORY section (only in terminal output that writes ## State done)");
      }
    }
  });

  test("evaluate dynamic uses {{attempt}} and {{criterion}} and writes ## Return (byte-equal with b)", () => {
    const dyn = readFileSync(resolve(INTERP, "operators/evaluate.md"), "utf-8");
    assert.match(dyn, /\{\{attempt\}\}/, "evaluate.md should use {{attempt}} placeholder");
    assert.match(dyn, /\{\{criterion\}\}/, "evaluate.md should use {{criterion}} placeholder");
    assert.match(dyn, /## Return/, "evaluate.md should use ## Return");
    assert.match(dyn, /verdict:/, "evaluate.md ## Return should have verdict key");
    assert.match(dyn, /feedback:/, "evaluate.md ## Return should have feedback key");
    assert.doesNotMatch(dyn, /^## Verdict\n/m, "evaluate.md should not write ## Verdict section directly");
    assert.doesNotMatch(dyn, /^## Feedback\n/m, "evaluate.md should not write ## Feedback section directly");
    assert.match(dyn, /^\s*## State\s*\n\s*done\b/m, "evaluate.md Return block should set state to done");
    assert.match(dyn, /state is "empty"/, "evaluate.md should have empty-state condition");
  });

  test("reflect dynamic uses {{attempt}}, {{verdict}}, {{feedback}} and writes ## Return with lesson key", () => {
    const dyn = readFileSync(resolve(INTERP, "operators/reflect.md"), "utf-8");
    assert.match(dyn, /\{\{attempt\}\}/, "reflect.md should use {{attempt}} placeholder");
    assert.match(dyn, /\{\{verdict\}\}/, "reflect.md should use {{verdict}} placeholder");
    assert.match(dyn, /\{\{feedback\}\}/, "reflect.md should use {{feedback}} placeholder");
    assert.match(dyn, /## Return/, "reflect.md should use ## Return");
    assert.match(dyn, /lesson:/, "reflect.md ## Return should have lesson key");
    assert.match(dyn, /^\s*## State\s*\n\s*done\b/m, "reflect.md Return block should set state to done");
    // Must NOT write ## Lesson directly to MEMORY (uses ## Return instead)
    assert.doesNotMatch(dyn, /^## Lesson\n/m, "reflect.md should not write ## Lesson section directly");
  });

  describe("evaluate push/pop integration", () => {
    let tmp: string;
    beforeEach(() => {
      tmp = mkdtempSync(resolve(tmpdir(), "turing-reflexion-eval-"));
    });
    afterEach(() => {
      rmSync(tmp, { recursive: true, force: true });
    });

    test("push on attempted state -> dynamic gets attempt and criterion args substituted", () => {
      const { cs, rootMemPath } = setupRootFrame(
        tmp,
        "## State\nattempted\n## Push\noperators/evaluate.md\n## Push-Args\nattempt: |\n  first attempt\n  line two\ncriterion: |\n  must do X\n  must do Y"
      );

      const rootMem = readFileSync(rootMemPath, "utf-8");
      const evaluateContent = readFileSync(resolve(INTERP, "operators/evaluate.md"), "utf-8");

      const pushed = applyPush(cs, rootMem, (p) =>
        p === "operators/evaluate.md" ? evaluateContent : null
      );
      assert.equal(pushed.ok, true, "push should succeed");
      if (!pushed.ok) return;

      // Child instructions should have {{attempt}} and {{criterion}} substituted.
      assert.doesNotMatch(pushed.childInstructions, /\{\{attempt\}\}/, "no unresolved {{attempt}} placeholder");
      assert.doesNotMatch(pushed.childInstructions, /\{\{criterion\}\}/, "no unresolved {{criterion}} placeholder");
      assert.match(pushed.childInstructions, /first attempt/, "attempt content should appear in child instructions");
      assert.match(pushed.childInstructions, /line two/, "attempt second line should appear in child instructions");
      assert.match(pushed.childInstructions, /must do X/, "criterion content should appear in child instructions");
      assert.match(pushed.childInstructions, /must do Y/, "criterion second line should appear in child instructions");

      // Child starts with state=empty.
      assert.match(pushed.childMemory, /^## State\nempty/m);

      // Caller's memory has Push and Push-Args stripped.
      assert.doesNotMatch(pushed.callerMemoryAfter, /## Push/);
      assert.doesNotMatch(pushed.callerMemoryAfter, /## Push-Args/);

      // Stack depth is 2.
      assert.equal(pushed.callStack.stack.length, 2, "push should add one frame");
    });

    test("child writes ## Return with verdict/feedback -> pop splices ## Verdict and ## Feedback into caller", () => {
      const { cs, rootMemPath } = setupRootFrame(
        tmp,
        "## State\nattempted\n## Push\noperators/evaluate.md\n## Push-Args\nattempt: |\n  original attempt\ncriterion: |\n  must do X"
      );

      const evaluateContent = readFileSync(resolve(INTERP, "operators/evaluate.md"), "utf-8");
      const rootMem = readFileSync(rootMemPath, "utf-8");

      const pushed = applyPush(cs, rootMem, (p) =>
        p === "operators/evaluate.md" ? evaluateContent : null
      );
      assert.equal(pushed.ok, true);
      if (!pushed.ok) return;

      // Simulate filesystem effects of push.
      mkdirSync(resolve(tmp, pushed.frameDir, "scoped"), { recursive: true });
      writeFileSync(resolve(tmp, pushed.frameDir, "MEMORY.md"), pushed.childMemory, "utf-8");
      writeFileSync(rootMemPath, pushed.callerMemoryAfter, "utf-8");

      // Simulate child (evaluate) writing ## Return with verdict and feedback (state=done).
      const childMemoryDone =
        "## State\ndone\n## Return\nverdict: |\n  pass\nfeedback: |\n  looks good\n  meets all criteria\n";
      writeFileSync(resolve(tmp, pushed.frameDir, "MEMORY.md"), childMemoryDone, "utf-8");

      // Pop.
      const popped = applyPop(pushed.callStack, childMemoryDone, (frameDir, file) => {
        return readFileSync(resolve(tmp, frameDir, file), "utf-8");
      });

      assert.equal(popped.callStack.stack.length, 1, "stack should be back to root");
      assert.equal(popped.callerFrameDir, "frames/f000-strategy");
      assert.equal(popped.events.length, 1);

      // Verify spliced keys.
      assert.deepEqual(popped.events[0].splicedKeys.sort(), ["feedback", "verdict"]);
      assert.equal(popped.events[0].missingReturn, false);

      // Verify caller MEMORY now has ## Verdict and ## Feedback.
      assert.match(popped.callerMemoryAfter, /^## State\nattempted_completed/m, "caller state should be attempted_completed");
      assert.match(popped.callerMemoryAfter, /## Verdict\n/, "## Verdict should be spliced in");
      assert.match(popped.callerMemoryAfter, /pass/, "verdict content should be present");
      assert.match(popped.callerMemoryAfter, /## Feedback\n/, "## Feedback should be spliced in");
      assert.match(popped.callerMemoryAfter, /looks good/, "feedback content should be present");
    });
  });

  describe("reflect push/pop integration", () => {
    let tmp: string;
    beforeEach(() => {
      tmp = mkdtempSync(resolve(tmpdir(), "turing-reflexion-reflect-"));
    });
    afterEach(() => {
      rmSync(tmp, { recursive: true, force: true });
    });

    test("evaluate fail -> splice verdict+feedback -> state=failed_attempt -> push reflect -> reflect returns lesson: -> ## Lesson spliced in caller", () => {
      // Start with failed_attempt state (after evaluate returned fail verdict + feedback)
      const memAtFailedAttempt =
        "## State\nfailed_attempt\n## Verdict\nfail\n## Feedback\nmissed edge case X\n";
      const { cs, rootMemPath } = setupRootFrame(
        tmp,
        memAtFailedAttempt +
        "## Push\noperators/reflect.md\n## Push-Args\nattempt: |\n  my attempt text\nverdict: |\n  fail\nfeedback: |\n  missed edge case X"
      );

      const reflectContent = readFileSync(resolve(INTERP, "operators/reflect.md"), "utf-8");
      const rootMem = readFileSync(rootMemPath, "utf-8");

      const pushed = applyPush(cs, rootMem, (p) =>
        p === "operators/reflect.md" ? reflectContent : null
      );
      assert.equal(pushed.ok, true, "reflect push should succeed");
      if (!pushed.ok) return;

      // Stack depth is 2.
      assert.equal(pushed.callStack.stack.length, 2, "reflect push should save caller frame");

      // Child instructions should have all three args substituted.
      assert.doesNotMatch(pushed.childInstructions, /\{\{attempt\}\}/, "no unresolved {{attempt}}");
      assert.doesNotMatch(pushed.childInstructions, /\{\{verdict\}\}/, "no unresolved {{verdict}}");
      assert.doesNotMatch(pushed.childInstructions, /\{\{feedback\}\}/, "no unresolved {{feedback}}");
      assert.match(pushed.childInstructions, /my attempt text/, "attempt content in child instructions");
      assert.match(pushed.childInstructions, /missed edge case X/, "feedback content in child instructions");

      // Child starts with state=empty.
      assert.match(pushed.childMemory, /^## State\nempty/m);

      // Caller's Push and Push-Args are stripped.
      assert.doesNotMatch(pushed.callerMemoryAfter, /## Push/);
      assert.doesNotMatch(pushed.callerMemoryAfter, /## Push-Args/);

      // Simulate filesystem effects of push.
      mkdirSync(resolve(tmp, pushed.frameDir, "scoped"), { recursive: true });
      writeFileSync(resolve(tmp, pushed.frameDir, "MEMORY.md"), pushed.childMemory, "utf-8");
      writeFileSync(rootMemPath, pushed.callerMemoryAfter, "utf-8");

      // Simulate reflect dynamic writing ## State done + ## Return with lesson key.
      const childMemoryDone =
        "## State\ndone\n## Return\nlesson: |\n  always handle X\n";
      writeFileSync(resolve(tmp, pushed.frameDir, "MEMORY.md"), childMemoryDone, "utf-8");

      // Pop.
      const popped = applyPop(pushed.callStack, childMemoryDone, (frameDir, file) => {
        return readFileSync(resolve(tmp, frameDir, file), "utf-8");
      });

      assert.equal(popped.callStack.stack.length, 1, "stack should be back to root after reflect pop");
      assert.equal(popped.events.length, 1);
      assert.deepEqual(popped.events[0].splicedKeys, ["lesson"], "lesson should be spliced into caller MEMORY");
      assert.equal(popped.events[0].missingReturn, false);

      // Caller MEMORY should have state=failed_attempt_completed and ## Lesson spliced in.
      assert.match(popped.callerMemoryAfter, /^## State\nfailed_attempt_completed/m, "caller state should be failed_attempt_completed");
      assert.match(popped.callerMemoryAfter, /## Lesson\n/, "## Lesson should be spliced into caller MEMORY");
      assert.match(popped.callerMemoryAfter, /always handle X/, "lesson content should be present");
    });
  });

  describe("multi-iteration: two failed lessons accumulate, third passes (R26)", () => {
    let tmp: string;
    beforeEach(() => {
      tmp = mkdtempSync(resolve(tmpdir(), "turing-reflexion-multi-"));
    });
    afterEach(() => {
      rmSync(tmp, { recursive: true, force: true });
    });

    test(">=2 lessons accumulate across two failed iterations", () => {
      // This test simulates the lesson accumulation at the instruction level —
      // not via actual bash, but by verifying the strategy's shell instructions
      // call for surgical echo >> appends and that lessons.md grows correctly.

      // After Phase-7 migration INSTRUCTIONS.md is a marker; the strategy lives in the operator file.
      const strategy = readFileSync(resolve(INTERP, "operators/reflexion.md"), "utf-8");

      // Verify surgical append is specified in the Accumulate lesson instruction.
      const accumulateSection = strategy.split(/^## Instruction: Accumulate lesson/m)[1] ?? "";
      assert.ok(accumulateSection.length > 0, "Accumulate lesson instruction should exist");
      assert.match(accumulateSection, /echo/, "Accumulate lesson must instruct echo");
      assert.match(accumulateSection, />>\s*.*lessons\.md|lessons\.md.*>>/, "Accumulate lesson must use >> append");
      // The instruction may mention "Do NOT use cat > ..." for clarity, but must not instruct it positively.
      // We check that the section does not contain a command-like "cat >" without a preceding "NOT" or "Do NOT".
      const noProhibitionText = accumulateSection.replace(/Do NOT use[^\n]*/g, "");
      assert.doesNotMatch(noProhibitionText, /cat\s*>(?!>).*lessons\.md/, "Accumulate lesson must NOT instruct cat > wholesale rewrite");

      // Simulate two lesson appends to a temp lessons.md file.
      const lessonsPath = resolve(tmp, "lessons.md");
      writeFileSync(lessonsPath, "", "utf-8");

      // First append: L1
      const l1 = "always handle case A";
      const existing1 = readFileSync(lessonsPath, "utf-8");
      const n1 = (existing1.match(/^- L\d+:/gm) ?? []).length + 1;
      writeFileSync(lessonsPath, existing1 + `- L${n1}: ${l1}\n`, "utf-8");

      // Second append: L2
      const l2 = "always handle case B";
      const existing2 = readFileSync(lessonsPath, "utf-8");
      const n2 = (existing2.match(/^- L\d+:/gm) ?? []).length + 1;
      writeFileSync(lessonsPath, existing2 + `- L${n2}: ${l2}\n`, "utf-8");

      const finalLessons = readFileSync(lessonsPath, "utf-8");
      const lessonLines = finalLessons.split("\n").filter((l) => l.startsWith("- L"));
      assert.ok(lessonLines.length >= 2, `expected >=2 lessons accumulated, got ${lessonLines.length}`);
      assert.match(finalLessons, /- L1:/, "lesson 1 should be present");
      assert.match(finalLessons, /- L2:/, "lesson 2 should be present");
      assert.match(finalLessons, /always handle case A/, "L1 text should be present");
      assert.match(finalLessons, /always handle case B/, "L2 text should be present");
    });

    // I2: end-to-end verification that the surgical echo >> mechanic works at
    // the shell level (R23). This exercises an actual bash invocation rather
    // than TypeScript writeFileSync, confirming the strategy's prescribed shell
    // command accumulates lines correctly.
    test("surgical append via real bash echo >> yields >=2 lessons", () => {
      const lessonsPath = resolve(tmp, "frames/f000-strategy/scoped/lessons.md");
      mkdirSync(resolve(tmp, "frames/f000-strategy/scoped"), { recursive: true });
      writeFileSync(lessonsPath, "", "utf-8");
      // Use { shell: "bash" } so that echo behaves like POSIX bash (not Windows cmd.exe).
      execSync(`echo "- L1: always handle case A" >> "${lessonsPath}"`, { shell: "bash" });
      execSync(`echo "- L2: always handle case B" >> "${lessonsPath}"`, { shell: "bash" });
      const lines = readFileSync(lessonsPath, "utf-8").split("\n").filter(l => l.startsWith("- L"));
      assert.ok(lines.length >= 2, `expected >=2 lessons, got ${lines.length}`);
      assert.match(lines[0], /^- L1:/);
      assert.match(lines[1], /^- L2:/);
    });

    test("reflect push/pop two iterations: lesson spliced each time, state advances to attempting", () => {
      const reflectContent = readFileSync(resolve(INTERP, "operators/reflect.md"), "utf-8");
      const lessonsPath = resolve(tmp, "frames/f000-strategy/scoped/lessons.md");

      // Ensure scoped directory and empty lessons.md exist before any iteration.
      mkdirSync(resolve(tmp, "frames/f000-strategy/scoped"), { recursive: true });
      writeFileSync(lessonsPath, "", "utf-8");

      // I3: helper that simulates one full reflect cycle AND the subsequent
      // Accumulate-lesson transition (echo >> via real execSync).
      //
      // Returns the caller MEMORY after the pop with ## Lesson still present
      // (before the Accumulate step strips it), so that the caller can inspect it.
      // After the accumulate step the returned `memoryAfterAccumulate` has
      // ## Lesson / ## Verdict / ## Feedback removed and state is ready to
      // transition to "attempting".
      function doOneReflectAndAccumulateCycle(
        cs: CallStack,
        memAtFailedAttempt: string,
        attemptText: string,
        verdictText: string,
        feedbackText: string,
        lessonText: string,
      ): { cs: CallStack; memoryAfterPop: string; memoryAfterAccumulate: string } {
        const rootMemPath = resolve(tmp, "frames/f000-strategy/MEMORY.md");
        const memWithPush =
          memAtFailedAttempt +
          `\n## Push\noperators/reflect.md\n## Push-Args\nattempt: |\n  ${attemptText}\nverdict: |\n  ${verdictText}\nfeedback: |\n  ${feedbackText}`;
        writeFileSync(rootMemPath, memWithPush, "utf-8");

        const pushed = applyPush(cs, memWithPush, (p) =>
          p === "operators/reflect.md" ? reflectContent : null
        );
        assert.equal(pushed.ok, true, "reflect push should succeed");
        if (!pushed.ok) throw new Error("push failed");

        mkdirSync(resolve(tmp, pushed.frameDir, "scoped"), { recursive: true });
        writeFileSync(resolve(tmp, pushed.frameDir, "MEMORY.md"), pushed.childMemory, "utf-8");
        writeFileSync(rootMemPath, pushed.callerMemoryAfter, "utf-8");

        const childMemoryDone = `## State\ndone\n## Return\nlesson: |\n  ${lessonText}\n`;
        writeFileSync(resolve(tmp, pushed.frameDir, "MEMORY.md"), childMemoryDone, "utf-8");

        const popped = applyPop(pushed.callStack, childMemoryDone, (frameDir, file) => {
          return readFileSync(resolve(tmp, frameDir, file), "utf-8");
        });

        assert.equal(popped.callStack.stack.length, 1, "stack back to root after reflect pop");
        assert.match(popped.callerMemoryAfter, /^## State\nfailed_attempt_completed/m);
        assert.match(popped.callerMemoryAfter, /## Lesson\n/);
        assert.match(popped.callerMemoryAfter, new RegExp(lessonText));

        const memoryAfterPop = popped.callerMemoryAfter;

        // --- Simulate Accumulate-lesson transition (I3) ---
        // 1. Read the spliced ## Lesson from caller MEMORY.
        const lessonMatch = memoryAfterPop.match(/^## Lesson\n([\s\S]*?)(?=^##|\z)/m);
        const splicedLesson = lessonMatch ? lessonMatch[1].trim() : lessonText;

        // 2. Count existing lines in lessons.md to determine index N.
        const existingLessons = readFileSync(lessonsPath, "utf-8");
        const n = (existingLessons.match(/^- L\d+:/gm) ?? []).length + 1;

        // 3. Append via real bash echo >> (the actual mechanic the strategy prescribes).
        // { shell: "bash" } ensures POSIX echo semantics (not Windows cmd.exe).
        execSync(`echo "- L${n}: ${splicedLesson}" >> "${lessonsPath}"`, { shell: "bash" });

        // 4. Remove ## Lesson / ## Verdict / ## Feedback from caller MEMORY and
        //    transition state to "attempting" (simulating strategy's Accumulate instruction).
        // Split on ## section boundaries so trailing content is captured correctly
        // regardless of whether the section is last or has a successor.
        const memoryAfterAccumulate = memoryAfterPop
          .split(/^(?=## )/m)
          .filter((p) => !["## Lesson\n", "## Verdict\n", "## Feedback\n"].some((h) => p.startsWith(h)))
          .join("")
          .replace(/^## State\nfailed_attempt_completed/m, "## State\nattempting");

        // 5. Assert spliced sections were removed and state transitioned.
        assert.doesNotMatch(memoryAfterAccumulate, /^## Lesson\b/m,
          "## Lesson should be removed after Accumulate step");
        assert.doesNotMatch(memoryAfterAccumulate, /^## Verdict\b/m,
          "## Verdict should be removed after Accumulate step");
        assert.doesNotMatch(memoryAfterAccumulate, /^## Feedback\b/m,
          "## Feedback should be removed after Accumulate step");
        assert.match(memoryAfterAccumulate, /^## State\nattempting/m,
          "state should be 'attempting' after Accumulate step");

        return { cs: popped.callStack, memoryAfterPop, memoryAfterAccumulate };
      }

      const cs0: CallStack = {
        nextCounter: 1,
        stack: [{ returnState: "<root>", frameDir: "frames/f000-strategy" }],
      };

      // First iteration: reflect + accumulate
      const r1 = doOneReflectAndAccumulateCycle(
        cs0,
        "## State\nfailed_attempt\n## Verdict\nfail\n## Feedback\nmissed A\n",
        "attempt v1", "fail", "missed A", "always handle A"
      );

      // Second iteration: reflect + accumulate (fresh push counter)
      const r2 = doOneReflectAndAccumulateCycle(
        r1.cs,
        "## State\nfailed_attempt\n## Verdict\nfail\n## Feedback\nmissed B\n",
        "attempt v2", "fail", "missed B", "always handle B"
      );

      // After two reflect cycles + accumulate steps, lessons.md should have 2 entries.
      const finalLessons = readFileSync(lessonsPath, "utf-8");
      const lessonLines = finalLessons.split("\n").filter(l => l.startsWith("- L"));
      assert.ok(lessonLines.length >= 2, `expected >=2 lessons after two cycles, got ${lessonLines.length}`);
      assert.match(lessonLines[0], /^- L1:/, "first lesson should be L1");
      assert.match(lessonLines[1], /^- L2:/, "second lesson should be L2");

      // Both lessons' content should be present.
      assert.match(r1.memoryAfterPop, /always handle A/, "first lesson should appear after first reflect pop");
      assert.match(r2.memoryAfterPop, /always handle B/, "second lesson should appear after second reflect pop");

      // Both memories after accumulate should be in state=attempting with lesson sections removed.
      assert.match(r1.memoryAfterAccumulate, /^## State\nattempting/m,
        "first cycle memory should transition to attempting after accumulate");
      assert.match(r2.memoryAfterAccumulate, /^## State\nattempting/m,
        "second cycle memory should transition to attempting after accumulate");
    });
  });
});

describe("R20-R27 Phase 7 migration: marker + canonical operator", () => {
  const LEAF = "interpreters/mas-papers/1-iterative-refinement/c-reflexion";

  test("R21: INSTRUCTIONS.md is single-line marker pointing at operators/reflexion.md", () => {
    const inst = readFileSync(resolve(REPO, LEAF, "INSTRUCTIONS.md"), "utf-8").trim();
    assert.equal(inst, "operators/reflexion.md");
  });

  test("R20/R22: operators/reflexion.md exists and is the canonical strategy", () => {
    const op = resolve(REPO, LEAF, "operators/reflexion.md");
    assert.ok(existsSync(op));
    const content = readFileSync(op, "utf-8");
    assert.match(content, /# (Operator|Strategy):.*Reflexion/i);
  });

  test("R47: canonical placeholder is {{task}}; no dual-mode detect block remains", () => {
    const op = readFileSync(resolve(REPO, LEAF, "operators/reflexion.md"), "utf-8");
    assert.match(op, /\{\{task\}\}/, "operators/reflexion.md must contain {{task}} placeholder");
    assert.doesNotMatch(op, /\{\{program\}\}/, "operators/reflexion.md must no longer reference {{program}}");
    assert.doesNotMatch(op, /grep.*-qF.*\{\{task\}\}/, "operators/reflexion.md must not retain the dual-mode detect block");
  });

  test("R45/R46: terminal cycle emits ## Return\\nanswer: and ## Refined + ## Lessons", () => {
    const op = readFileSync(resolve(REPO, LEAF, "operators/reflexion.md"), "utf-8");
    assert.match(op, /## Return\s*\n\s*answer:/, "operators/reflexion.md must emit ## Return with answer key");
    assert.match(op, /## Refined/, "operators/reflexion.md must write ## Refined for human inspection");
    assert.match(op, /## Lessons/, "operators/reflexion.md must write ## Lessons for human inspection");
  });

  test("R27: internal pushes use operators/ paths (not the old dyn/ prefix)", () => {
    const op = readFileSync(resolve(REPO, LEAF, "operators/reflexion.md"), "utf-8");
    assert.doesNotMatch(op, new RegExp("dyn" + "amics/"));
    assert.match(op, /operators\/evaluate\.md/);
    assert.match(op, /operators\/reflect\.md/);
  });

  test("R25: malformed-verdict path keeps the loop alive (no waiting_for_user)", () => {
    const op = readFileSync(resolve(REPO, LEAF, "operators/reflexion.md"), "utf-8");
    const section = op.split(/^## Instruction: Route on verdict/m)[1] ?? "";
    assert.match(section, /Pending Questions/, "malformed-verdict path must add a Pending Questions item");
    assert.match(section, /do NOT set state to "waiting_for_user"/i,
      "malformed-verdict path must explicitly forbid waiting_for_user");
  });
});
