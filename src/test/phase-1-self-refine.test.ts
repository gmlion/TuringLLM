import { test, describe, beforeEach, afterEach } from "node:test";
import { strict as assert } from "node:assert";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync, existsSync } from "fs";
import { resolve } from "path";
import { tmpdir } from "os";
import { fileURLToPath } from "url";
import { dirname } from "path";
import { applyPush, applyPop, type CallStack } from "../call-stack.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const INTERP = resolve(__dirname, "../../interpreters/1-iterative-refinement/a-self-refine");

describe("1a self-refine", () => {
  test("interpreter files exist at the Group-1 path", () => {
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
    // The Refine instruction writes state=done (as a MEMORY value via the canonical heredoc).
    assert.match(dyn, /^done$/m);
  });

  test("strategy uses scoped draft file and ## Return splicing", () => {
    const strategy = readFileSync(resolve(INTERP, "INSTRUCTIONS.md"), "utf-8");
    assert.match(strategy, /\.\/scoped\/draft\.md/, "strategy should reference ./scoped/draft.md");
    assert.match(strategy, /## Return/, "strategy should mention ## Return");
    assert.doesNotMatch(strategy, /## Draft\b/, "strategy should not use ## Draft in MEMORY");
  });

  test("self-critique dynamic uses ## Return block with critique and refined", () => {
    const dyn = readFileSync(resolve(INTERP, "operators/self-critique.md"), "utf-8");
    assert.match(dyn, /## Return/, "dynamic should use ## Return");
    assert.match(dyn, /critique:/, "dynamic ## Return should have critique key");
    assert.match(dyn, /refined:/, "dynamic ## Return should have refined key");
    assert.doesNotMatch(dyn, /## Critique\n/, "dynamic should not write ## Critique section directly");
    assert.doesNotMatch(dyn, /## Refined\n/, "dynamic should not write ## Refined section directly");
  });

  describe("push/pop integration with scoped draft", () => {
    let tmp: string;
    beforeEach(() => {
      tmp = mkdtempSync(resolve(tmpdir(), "turing-self-refine-"));
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

    test("push on drafted state -> dynamic gets draft arg substituted", () => {
      // Write the draft to the scoped file.
      const { cs, rootMemPath } = setupRootFrame(
        "## State\ndrafted\n## Push\noperators/self-critique.md\n## Push-Args\ndraft: |\n  first attempt\n  line two"
      );
      mkdirSync(resolve(tmp, "frames/f000-strategy/scoped"), { recursive: true });
      writeFileSync(resolve(tmp, "frames/f000-strategy/scoped/draft.md"), "first attempt\nline two\n", "utf-8");

      const rootMem = readFileSync(rootMemPath, "utf-8");

      // Use the real dynamic file from the interpreter.
      const selfCritiqueContent = readFileSync(resolve(INTERP, "operators/self-critique.md"), "utf-8");

      const pushed = applyPush(cs, rootMem, (p) =>
        p === "operators/self-critique.md" ? selfCritiqueContent : null
      );
      assert.equal(pushed.ok, true, "push should succeed");
      if (!pushed.ok) return;

      // Child instructions should have {{draft}} substituted.
      assert.doesNotMatch(pushed.childInstructions, /\{\{draft\}\}/, "no unresolved {{draft}} placeholder");
      assert.match(pushed.childInstructions, /first attempt/, "draft content should appear in child instructions");
      assert.match(pushed.childInstructions, /line two/, "draft second line should appear in child instructions");

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

      // Verify caller MEMORY on disk still has state=drafted (no obliteration).
      const callerOnDisk = readFileSync(rootMemPath, "utf-8");
      assert.match(callerOnDisk, /^## State\ndrafted/m);
    });

    test("child writes ## Return -> pop splices ## Critique and ## Refined into caller", () => {
      const { cs, rootMemPath } = setupRootFrame(
        "## State\ndrafted\n## Push\noperators/self-critique.md\n## Push-Args\ndraft: |\n  original draft"
      );

      const selfCritiqueContent = readFileSync(resolve(INTERP, "operators/self-critique.md"), "utf-8");
      const rootMem = readFileSync(rootMemPath, "utf-8");

      const pushed = applyPush(cs, rootMem, (p) =>
        p === "operators/self-critique.md" ? selfCritiqueContent : null
      );
      assert.equal(pushed.ok, true);
      if (!pushed.ok) return;

      // Simulate filesystem effects of push.
      mkdirSync(resolve(tmp, pushed.frameDir, "scoped"), { recursive: true });
      writeFileSync(resolve(tmp, pushed.frameDir, "MEMORY.md"), pushed.childMemory, "utf-8");
      writeFileSync(rootMemPath, pushed.callerMemoryAfter, "utf-8");

      // Simulate child writing ## Return with critique and refined (state=done).
      const childMemoryDone =
        "## State\ndone\n## Return\ncritique: |\n  concrete feedback\n  line two\nrefined: |\n  improved draft\n  line two\n";
      writeFileSync(resolve(tmp, pushed.frameDir, "MEMORY.md"), childMemoryDone, "utf-8");

      // Pop.
      const popped = applyPop(pushed.callStack, childMemoryDone, (frameDir, file) => {
        return readFileSync(resolve(tmp, frameDir, file), "utf-8");
      });

      assert.equal(popped.callStack.stack.length, 1, "stack should be back to root");
      assert.equal(popped.callerFrameDir, "frames/f000-strategy");
      assert.equal(popped.events.length, 1);

      // Verify spliced keys.
      assert.deepEqual(popped.events[0].splicedKeys.sort(), ["critique", "refined"]);
      assert.equal(popped.events[0].missingReturn, false);

      // Write pop result to disk.
      writeFileSync(rootMemPath, popped.callerMemoryAfter, "utf-8");

      // Verify caller MEMORY now has ## Critique and ## Refined.
      const finalMem = readFileSync(rootMemPath, "utf-8");
      assert.match(finalMem, /^## State\ndrafted_completed/m, "caller state should be drafted_completed");
      assert.match(finalMem, /## Critique\n/, "## Critique should be spliced in");
      assert.match(finalMem, /concrete feedback/, "critique content should be present");
      assert.match(finalMem, /## Refined\n/, "## Refined should be spliced in");
      assert.match(finalMem, /improved draft/, "refined content should be present");
    });

    test("second loop: accepted refinement -> state=done -> halts at depth 0", () => {
      const { cs, rootMemPath } = setupRootFrame(
        "## State\ndrafted\n## Push\noperators/self-critique.md\n## Push-Args\ndraft: |\n  second attempt"
      );
      mkdirSync(resolve(tmp, "frames/f000-strategy/scoped"), { recursive: true });
      writeFileSync(resolve(tmp, "frames/f000-strategy/scoped/draft.md"), "second attempt\n", "utf-8");

      const selfCritiqueContent = readFileSync(resolve(INTERP, "operators/self-critique.md"), "utf-8");
      const rootMem = readFileSync(rootMemPath, "utf-8");

      const pushed = applyPush(cs, rootMem, (p) =>
        p === "operators/self-critique.md" ? selfCritiqueContent : null
      );
      assert.equal(pushed.ok, true);
      if (!pushed.ok) return;

      // Simulate filesystem effects of push.
      mkdirSync(resolve(tmp, pushed.frameDir, "scoped"), { recursive: true });
      writeFileSync(resolve(tmp, pushed.frameDir, "MEMORY.md"), pushed.childMemory, "utf-8");
      writeFileSync(rootMemPath, pushed.callerMemoryAfter, "utf-8");

      // Simulate child writing state=done + ## Return.
      const childMemoryDone =
        "## State\ndone\n## Return\ncritique: |\n  final feedback\nrefined: |\n  final text\n";
      writeFileSync(resolve(tmp, pushed.frameDir, "MEMORY.md"), childMemoryDone, "utf-8");

      // Pop -> caller gets drafted_completed + ## Critique + ## Refined spliced in.
      const popped = applyPop(pushed.callStack, childMemoryDone, (frameDir, file) => {
        return readFileSync(resolve(tmp, frameDir, file), "utf-8");
      });
      writeFileSync(rootMemPath, popped.callerMemoryAfter, "utf-8");

      assert.match(popped.callerMemoryAfter, /^## State\ndrafted_completed/m);
      assert.match(popped.callerMemoryAfter, /## Critique/);
      assert.match(popped.callerMemoryAfter, /## Refined/);

      // Simulate LLM accepting the refinement: sets state=done, removes Critique/Refined.
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
