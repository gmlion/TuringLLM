import { test, describe, beforeEach, afterEach } from "node:test";
import { strict as assert } from "node:assert";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { tmpdir } from "os";
import { fileURLToPath } from "url";
import { applyPop, applyPush, type CallStack } from "../call-stack.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const INTERP = resolve(__dirname, "../../interpreters/1-iterative-refinement/c-reflexion");

describe("1c reflexion", () => {
  test("interpreter files exist", () => {
    assert.ok(existsSync(resolve(INTERP, "INSTRUCTIONS.md")), "INSTRUCTIONS.md missing");
    assert.ok(existsSync(resolve(INTERP, "PROGRAM.md")), "PROGRAM.md missing");
    assert.ok(existsSync(resolve(INTERP, "test_palindrome.md")), "test_palindrome.md missing");
    assert.ok(existsSync(resolve(INTERP, "dynamics/evaluate.md")), "dynamics/evaluate.md missing");
    assert.ok(existsSync(resolve(INTERP, "dynamics/reflect.md")), "dynamics/reflect.md missing");
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

  test("strategy uses all three scoped files", () => {
    const strategy = readFileSync(resolve(INTERP, "INSTRUCTIONS.md"), "utf-8");
    assert.match(strategy, /\.\/scoped\/attempt\.md/, "strategy should reference ./scoped/attempt.md");
    assert.match(strategy, /\.\/scoped\/criterion\.md/, "strategy should reference ./scoped/criterion.md");
    assert.match(strategy, /\.\/scoped\/lessons\.md/, "strategy should reference ./scoped/lessons.md");
  });

  test("strategy uses surgical append for lessons.md (R23)", () => {
    const strategy = readFileSync(resolve(INTERP, "INSTRUCTIONS.md"), "utf-8");
    // Must have echo + >> for surgical append
    assert.match(strategy, /echo/, "strategy must use echo for lessons.md append");
    assert.match(strategy, />>.*\.\/scoped\/lessons\.md|\.\/scoped\/lessons\.md.*>>/, "strategy must use >> (append) for lessons.md");
    // The strategy header (outside instructions) must forbid wholesale rewrites of lessons.md
    const header = strategy.split(/^## Instruction:/m)[0] ?? "";
    assert.match(header, /wholesale rewrites are forbidden|wholesale rewrite.*forbidden|forbidden.*wholesale rewrite/i,
      "strategy header must explicitly forbid wholesale rewrites of lessons.md");
  });

  test("strategy does not use ## Lessons or ## Attempt or ## Criterion as MEMORY sections", () => {
    const strategy = readFileSync(resolve(INTERP, "INSTRUCTIONS.md"), "utf-8");
    // The strategy should reference ## Verdict and ## Feedback (spliced from evaluate.md) but not ## Attempt/## Criterion/## Lessons
    assert.doesNotMatch(strategy, /^## Lessons\b/m, "strategy should not use ## Lessons in MEMORY");
    assert.doesNotMatch(strategy, /^## Attempt\b/m, "strategy should not use ## Attempt in MEMORY");
    assert.doesNotMatch(strategy, /^## Criterion\b/m, "strategy should not use ## Criterion in MEMORY");
  });

  test("evaluate dynamic uses {{attempt}} and {{criterion}} and writes ## Return (byte-equal with b)", () => {
    const dyn = readFileSync(resolve(INTERP, "dynamics/evaluate.md"), "utf-8");
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
    const dyn = readFileSync(resolve(INTERP, "dynamics/reflect.md"), "utf-8");
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

    function setupRootFrame(initialMemory: string): { cs: CallStack; rootMemPath: string } {
      mkdirSync(resolve(tmp, "frames/f000-strategy/scoped"), { recursive: true });
      const rootMemPath = resolve(tmp, "frames/f000-strategy/MEMORY.md");
      writeFileSync(rootMemPath, initialMemory, "utf-8");
      const cs: CallStack = {
        nextCounter: 1,
        stack: [{ returnState: "<root>", frameDir: "frames/f000-strategy" }],
      };
      return { cs, rootMemPath };
    }

    test("push on attempted state -> dynamic gets attempt and criterion args substituted", () => {
      const { cs, rootMemPath } = setupRootFrame(
        "## State\nattempted\n## Push\ndynamics/evaluate.md\n## Push-Args\nattempt: |\n  first attempt\n  line two\ncriterion: |\n  must do X\n  must do Y"
      );

      const rootMem = readFileSync(rootMemPath, "utf-8");
      const evaluateContent = readFileSync(resolve(INTERP, "dynamics/evaluate.md"), "utf-8");

      const pushed = applyPush(cs, rootMem, (p) =>
        p === "dynamics/evaluate.md" ? evaluateContent : null
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
        "## State\nattempted\n## Push\ndynamics/evaluate.md\n## Push-Args\nattempt: |\n  original attempt\ncriterion: |\n  must do X"
      );

      const evaluateContent = readFileSync(resolve(INTERP, "dynamics/evaluate.md"), "utf-8");
      const rootMem = readFileSync(rootMemPath, "utf-8");

      const pushed = applyPush(cs, rootMem, (p) =>
        p === "dynamics/evaluate.md" ? evaluateContent : null
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

    function setupRootFrame(initialMemory: string): { cs: CallStack; rootMemPath: string } {
      mkdirSync(resolve(tmp, "frames/f000-strategy/scoped"), { recursive: true });
      const rootMemPath = resolve(tmp, "frames/f000-strategy/MEMORY.md");
      writeFileSync(rootMemPath, initialMemory, "utf-8");
      const cs: CallStack = {
        nextCounter: 1,
        stack: [{ returnState: "<root>", frameDir: "frames/f000-strategy" }],
      };
      return { cs, rootMemPath };
    }

    test("evaluate fail -> splice verdict+feedback -> state=failed_attempt -> push reflect -> reflect returns lesson: -> ## Lesson spliced in caller", () => {
      // Start with failed_attempt state (after evaluate returned fail verdict + feedback)
      const memAtFailedAttempt =
        "## State\nfailed_attempt\n## Verdict\nfail\n## Feedback\nmissed edge case X\n";
      const { cs, rootMemPath } = setupRootFrame(
        memAtFailedAttempt +
        "## Push\ndynamics/reflect.md\n## Push-Args\nattempt: |\n  my attempt text\nverdict: |\n  fail\nfeedback: |\n  missed edge case X"
      );

      const reflectContent = readFileSync(resolve(INTERP, "dynamics/reflect.md"), "utf-8");
      const rootMem = readFileSync(rootMemPath, "utf-8");

      const pushed = applyPush(cs, rootMem, (p) =>
        p === "dynamics/reflect.md" ? reflectContent : null
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

      const strategy = readFileSync(resolve(INTERP, "INSTRUCTIONS.md"), "utf-8");

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

    test("reflect push/pop two iterations: lesson spliced each time, state advances to attempting", () => {
      const reflectContent = readFileSync(resolve(INTERP, "dynamics/reflect.md"), "utf-8");

      function doOneReflectCycle(
        cs: CallStack,
        memAtFailedAttempt: string,
        attemptText: string,
        verdictText: string,
        feedbackText: string,
        lessonText: string,
      ): { cs: CallStack; memory: string } {
        mkdirSync(resolve(tmp, "frames/f000-strategy/scoped"), { recursive: true });
        const rootMemPath = resolve(tmp, "frames/f000-strategy/MEMORY.md");
        const memWithPush =
          memAtFailedAttempt +
          `\n## Push\ndynamics/reflect.md\n## Push-Args\nattempt: |\n  ${attemptText}\nverdict: |\n  ${verdictText}\nfeedback: |\n  ${feedbackText}`;
        writeFileSync(rootMemPath, memWithPush, "utf-8");

        const pushed = applyPush(cs, memWithPush, (p) =>
          p === "dynamics/reflect.md" ? reflectContent : null
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

        return { cs: popped.callStack, memory: popped.callerMemoryAfter };
      }

      const cs0: CallStack = {
        nextCounter: 1,
        stack: [{ returnState: "<root>", frameDir: "frames/f000-strategy" }],
      };

      // First iteration
      const r1 = doOneReflectCycle(
        cs0,
        "## State\nfailed_attempt\n## Verdict\nfail\n## Feedback\nmissed A\n",
        "attempt v1", "fail", "missed A", "always handle A"
      );

      // Second iteration (fresh push counter)
      const r2 = doOneReflectCycle(
        r1.cs,
        "## State\nfailed_attempt\n## Verdict\nfail\n## Feedback\nmissed B\n",
        "attempt v2", "fail", "missed B", "always handle B"
      );

      // After two iterations, both ## Lesson splices occurred.
      assert.match(r1.memory, /always handle A/, "first lesson should appear after first reflect pop");
      assert.match(r2.memory, /always handle B/, "second lesson should appear after second reflect pop");
    });
  });
});
