import { test, describe, beforeEach, afterEach } from "node:test";
import { strict as assert } from "node:assert";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { tmpdir } from "os";
import { fileURLToPath } from "url";
import { applyPush, applyPop, type CallStack } from "../call-stack.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const INTERP = resolve(__dirname, "../../interpreters/1-iterative-refinement/b-evaluator-optimizer");

describe("1b evaluator-optimizer", () => {
  test("interpreter files exist at the Group-1 path", () => {
    assert.ok(existsSync(resolve(INTERP, "INSTRUCTIONS.md")), "INSTRUCTIONS.md missing");
    assert.ok(existsSync(resolve(INTERP, "PROGRAM.md")), "PROGRAM.md missing");
    assert.ok(existsSync(resolve(INTERP, "dynamics/evaluate.md")), "dynamics/evaluate.md missing");
  });

  test("strategy declares the four required states", () => {
    const strategy = readFileSync(resolve(INTERP, "INSTRUCTIONS.md"), "utf-8");
    for (const needle of [
      'state is "empty"',
      'state is "attempted"',
      'state is "attempted_completed"',
      'state is "done"',
    ]) {
      assert.match(strategy, new RegExp(needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), `strategy missing condition: ${needle}`);
    }
  });

  test("strategy uses scoped attempt and criterion files and ## Return splicing", () => {
    const strategy = readFileSync(resolve(INTERP, "INSTRUCTIONS.md"), "utf-8");
    assert.match(strategy, /\.\/scoped\/attempt\.md/, "strategy should reference ./scoped/attempt.md");
    assert.match(strategy, /\.\/scoped\/criterion\.md/, "strategy should reference ./scoped/criterion.md");
    assert.match(strategy, /## Return/, "strategy should mention ## Return");
    assert.doesNotMatch(strategy, /## Attempt\b/, "strategy should not use ## Attempt in MEMORY");
    assert.doesNotMatch(strategy, /## Criterion\b/, "strategy should not use ## Criterion in MEMORY");
  });

  test("evaluate dynamic uses {{attempt}} and {{criterion}} placeholders and writes ## Return", () => {
    const dyn = readFileSync(resolve(INTERP, "dynamics/evaluate.md"), "utf-8");
    assert.match(dyn, /\{\{attempt\}\}/, "evaluate.md should use {{attempt}} placeholder");
    assert.match(dyn, /\{\{criterion\}\}/, "evaluate.md should use {{criterion}} placeholder");
    assert.match(dyn, /## Return/, "evaluate.md should use ## Return");
    assert.match(dyn, /verdict:/, "evaluate.md ## Return should have verdict key");
    assert.match(dyn, /feedback:/, "evaluate.md ## Return should have feedback key");
    assert.doesNotMatch(dyn, /^## Verdict\n/m, "evaluate.md should not write ## Verdict section directly");
    assert.doesNotMatch(dyn, /^## Feedback\n/m, "evaluate.md should not write ## Feedback section directly");
  });

  test("evaluate dynamic declares state=done (as MEMORY value)", () => {
    const dyn = readFileSync(resolve(INTERP, "dynamics/evaluate.md"), "utf-8");
    assert.match(dyn, /^\s*## State\s*\n\s*done\b/m, "evaluate.md Return block should set state to done");
    assert.match(dyn, /state is "empty"/, "evaluate.md should have empty-state condition");
  });

  test("malformed-verdict path keeps the loop alive (no waiting_for_user)", () => {
    const strategy = readFileSync(resolve(INTERP, "INSTRUCTIONS.md"), "utf-8");
    const section = strategy.split(/^## Instruction: Handle verdict/m)[1] ?? "";
    assert.match(section, /Pending Questions/, "malformed-verdict path must add a Pending Questions item");
    assert.match(section, /do NOT set state to "waiting_for_user"/i, "malformed-verdict path must explicitly forbid waiting_for_user");
  });

  describe("push/pop integration with scoped attempt and criterion", () => {
    let tmp: string;
    beforeEach(() => {
      tmp = mkdtempSync(resolve(tmpdir(), "turing-evaluator-optimizer-"));
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
      writeFileSync(resolve(tmp, "frames/f000-strategy/scoped/attempt.md"), "first attempt\nline two\n", "utf-8");
      writeFileSync(resolve(tmp, "frames/f000-strategy/scoped/criterion.md"), "must do X\nmust do Y\n", "utf-8");

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

      // Write child frame to disk.
      mkdirSync(resolve(tmp, pushed.frameDir, "scoped"), { recursive: true });
      writeFileSync(resolve(tmp, pushed.frameDir, "MEMORY.md"), pushed.childMemory, "utf-8");
      writeFileSync(resolve(tmp, pushed.frameDir, "INSTRUCTIONS.md"), pushed.childInstructions, "utf-8");
      writeFileSync(rootMemPath, pushed.callerMemoryAfter, "utf-8");

      // Verify caller MEMORY on disk still has state=attempted (no obliteration).
      const callerOnDisk = readFileSync(rootMemPath, "utf-8");
      assert.match(callerOnDisk, /^## State\nattempted/m);
    });

    test("child writes ## Return -> pop splices ## Verdict and ## Feedback into caller", () => {
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

      // Write pop result to disk.
      writeFileSync(rootMemPath, popped.callerMemoryAfter, "utf-8");

      // Verify caller MEMORY now has ## Verdict and ## Feedback.
      const finalMem = readFileSync(rootMemPath, "utf-8");
      assert.match(finalMem, /^## State\nattempted_completed/m, "caller state should be attempted_completed");
      assert.match(finalMem, /## Verdict\n/, "## Verdict should be spliced in");
      assert.match(finalMem, /pass/, "verdict content should be present");
      assert.match(finalMem, /## Feedback\n/, "## Feedback should be spliced in");
      assert.match(finalMem, /looks good/, "feedback content should be present");
    });

    test("pass verdict -> state=done -> halts at depth 0", () => {
      const { cs, rootMemPath } = setupRootFrame(
        "## State\nattempted\n## Push\ndynamics/evaluate.md\n## Push-Args\nattempt: |\n  second attempt\ncriterion: |\n  must do X"
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

      // Simulate child writing state=done + ## Return with pass verdict.
      const childMemoryDone =
        "## State\ndone\n## Return\nverdict: |\n  pass\nfeedback: |\n  all criteria met\n";
      writeFileSync(resolve(tmp, pushed.frameDir, "MEMORY.md"), childMemoryDone, "utf-8");

      // Pop -> caller gets attempted_completed + ## Verdict + ## Feedback spliced in.
      const popped = applyPop(pushed.callStack, childMemoryDone, (frameDir, file) => {
        return readFileSync(resolve(tmp, frameDir, file), "utf-8");
      });
      writeFileSync(rootMemPath, popped.callerMemoryAfter, "utf-8");

      assert.match(popped.callerMemoryAfter, /^## State\nattempted_completed/m);
      assert.match(popped.callerMemoryAfter, /## Verdict/);
      assert.match(popped.callerMemoryAfter, /## Feedback/);

      // Simulate LLM seeing pass verdict: sets state=done, removes Verdict/Feedback.
      // At depth 1 (only root frame), state=done => halt.
      const acceptedMem = "## State\ndone\n";
      writeFileSync(rootMemPath, acceptedMem, "utf-8");

      // applyPop with state=done and stack.length === 1 => no pop, no halt (shell checks halt).
      const finalPop = applyPop(popped.callStack, acceptedMem, (frameDir, file) => {
        return readFileSync(resolve(tmp, frameDir, file), "utf-8");
      });
      // Stack stays at 1 (root never popped), no events fired — shell detects halt.
      assert.equal(finalPop.callStack.stack.length, 1, "root frame never popped");
      assert.equal(finalPop.events.length, 0, "no pop event at root");
    });
  });
});
