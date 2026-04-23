import { test, describe, beforeEach, afterEach } from "node:test";
import { strict as assert } from "node:assert";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { tmpdir } from "os";
import { fileURLToPath } from "url";
import { applyPop, applyPush, type CallStack } from "../call-stack.js";
import { parseState } from "../memory.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const INTERP = resolve(__dirname, "../../interpreters/1-iterative-refinement/d-cove");

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

  test("strategy uses ./scoped/draft.md and ## Return splicing", () => {
    const strategy = readFileSync(resolve(INTERP, "INSTRUCTIONS.md"), "utf-8");
    assert.match(strategy, /\.\/scoped\/draft\.md/, "strategy should reference ./scoped/draft.md");
    assert.match(strategy, /## Return/, "strategy should mention ## Return");
    assert.doesNotMatch(strategy, /^## Draft\b/m, "strategy should not use ## Draft as a MEMORY section");
  });

  test("verify.md declares three internal states and state=done in template", () => {
    const dyn = readFileSync(resolve(INTERP, "dynamics/verify.md"), "utf-8");
    for (const needle of [
      'state is "empty"',
      'state is "asking"',
      'state is "asking_completed"',
      'state to "done"',
    ]) {
      assert.match(
        dyn,
        new RegExp(needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
        `verify.md missing condition/action: ${needle}`,
      );
    }
    // No "revising" state — the combined Record-answer instruction handles finalization
    assert.doesNotMatch(dyn, /state is "revising"/, 'verify.md must not have "revising" state');
    assert.doesNotMatch(dyn, /state to "revising"/, 'verify.md must not transition to "revising"');
  });

  test("verify.md uses ./scoped/verifications.md and surgical sed for updates", () => {
    const dyn = readFileSync(resolve(INTERP, "dynamics/verify.md"), "utf-8");
    assert.match(dyn, /\.\/scoped\/verifications\.md/, "verify.md should reference ./scoped/verifications.md");
    assert.match(dyn, /sed -i/, "verify.md must use sed -i for surgical updates");
    // Strategy header (preamble before any ## Instruction) must forbid wholesale rewrites
    const header = dyn.split(/^## Instruction:/m)[0] ?? "";
    assert.match(
      header,
      /WHOLESALE REWRITES.*FORBIDDEN|wholesale rewrites.*forbidden/i,
      "verify.md header must explicitly forbid wholesale rewrites of verifications.md",
    );
  });

  test("verify.md returns `revised:` via ## Return (not ## Revised directly)", () => {
    const dyn = readFileSync(resolve(INTERP, "dynamics/verify.md"), "utf-8");
    assert.match(dyn, /## Return/, "verify.md should use ## Return");
    assert.match(dyn, /revised:/, "verify.md ## Return should have revised key");
    assert.doesNotMatch(dyn, /^## Revised\n/m, "verify.md must not write ## Revised section directly");
  });

  test("answer-independently.md is single-instruction and returns `answer:` via ## Return", () => {
    const dyn = readFileSync(resolve(INTERP, "dynamics/answer-independently.md"), "utf-8");
    const instructionCount = (dyn.match(/^## Instruction:/gm) ?? []).length;
    assert.equal(instructionCount, 1, "expected exactly one instruction");
    assert.match(dyn, /## Return/, "answer-independently.md should use ## Return");
    assert.match(dyn, /answer:/, "answer-independently.md ## Return should have answer key");
    assert.doesNotMatch(dyn, /^## Answer\n/m, "must not write ## Answer section directly");
  });

  test("answer-independently.md references no caller MEMORY section", () => {
    const dyn = readFileSync(resolve(INTERP, "dynamics/answer-independently.md"), "utf-8");
    assert.doesNotMatch(dyn, /## Draft\b/, "must not reference ## Draft");
    assert.doesNotMatch(dyn, /## Verifications\b/, "must not reference ## Verifications");
    assert.doesNotMatch(dyn, /## Revised\b/, "must not reference ## Revised");
  });

  test("answer-independently.md declares state is empty condition", () => {
    const dyn = readFileSync(resolve(INTERP, "dynamics/answer-independently.md"), "utf-8");
    assert.match(dyn, /state is "empty"/, "answer-independently.md should have empty-state condition");
  });

  describe("push/pop integration", () => {
    let tmp: string;
    beforeEach(() => {
      tmp = mkdtempSync(resolve(tmpdir(), "turing-cove-"));
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

    test("strategy push of verify.md -> draft arg substituted, depth=2", () => {
      const { cs, rootMemPath } = setupRootFrame(
        "## State\ndrafted\n## Push\ndynamics/verify.md\n## Push-Args\ndraft: |\n  A draft with claims"
      );
      writeFileSync(resolve(tmp, "frames/f000-strategy/scoped/draft.md"), "A draft with claims\n", "utf-8");

      const rootMem = readFileSync(rootMemPath, "utf-8");
      const verifyContent = readFileSync(resolve(INTERP, "dynamics/verify.md"), "utf-8");

      const pushed = applyPush(cs, rootMem, (p) =>
        p === "dynamics/verify.md" ? verifyContent : null
      );
      assert.equal(pushed.ok, true, "push should succeed");
      if (!pushed.ok) return;

      // Child instructions should have {{draft}} substituted.
      assert.doesNotMatch(pushed.childInstructions, /\{\{draft\}\}/, "no unresolved {{draft}} placeholder");
      assert.match(pushed.childInstructions, /A draft with claims/, "draft content should appear in child instructions");

      // Child starts with state=empty.
      assert.match(pushed.childMemory, /^## State\nempty/m);

      // Caller's memory has Push and Push-Args stripped.
      assert.doesNotMatch(pushed.callerMemoryAfter, /## Push/);
      assert.doesNotMatch(pushed.callerMemoryAfter, /## Push-Args/);

      // Stack depth is 2 (root + verify frame).
      assert.equal(pushed.callStack.stack.length, 2, "depth should be 2 (root + verify frame)");
      assert.match(pushed.childInstructions, /Dynamic: Verify/);

      // Write child frame to disk.
      mkdirSync(resolve(tmp, pushed.frameDir, "scoped"), { recursive: true });
      writeFileSync(resolve(tmp, pushed.frameDir, "MEMORY.md"), pushed.childMemory, "utf-8");
      writeFileSync(rootMemPath, pushed.callerMemoryAfter, "utf-8");

      // Caller MEMORY on disk should retain state=drafted (no obliteration).
      const callerOnDisk = readFileSync(rootMemPath, "utf-8");
      assert.match(callerOnDisk, /^## State\ndrafted/m);
    });

    test("R27 depth-3 invariant: verify pushes answer-independently.md -> stack.length === 3", () => {
      // Step 1: strategy (depth 1) pushes verify.md (depth 2)
      const { cs: cs0, rootMemPath } = setupRootFrame(
        "## State\ndrafted\n## Push\ndynamics/verify.md\n## Push-Args\ndraft: |\n  claim text"
      );
      const rootMem = readFileSync(rootMemPath, "utf-8");
      const verifyContent = readFileSync(resolve(INTERP, "dynamics/verify.md"), "utf-8");
      const answerContent = readFileSync(resolve(INTERP, "dynamics/answer-independently.md"), "utf-8");

      const push1 = applyPush(cs0, rootMem, (p) =>
        p === "dynamics/verify.md" ? verifyContent : null
      );
      assert.equal(push1.ok, true, "first push should succeed");
      if (!push1.ok) return;
      assert.equal(push1.callStack.stack.length, 2, "after first push: stack.length === 2");

      // Simulate main.ts filesystem effects.
      mkdirSync(resolve(tmp, push1.frameDir, "scoped"), { recursive: true });
      writeFileSync(resolve(tmp, push1.frameDir, "MEMORY.md"), push1.childMemory, "utf-8");
      writeFileSync(rootMemPath, push1.callerMemoryAfter, "utf-8");

      // Step 2: verify (depth 2) pushes answer-independently.md (depth 3)
      const askingMemory =
        "## State\nasking\n" +
        "## Push\ndynamics/answer-independently.md\n" +
        "## Push-Args\nquestion: |\n  Is X true?";

      const push2 = applyPush(push1.callStack, askingMemory, (p) =>
        p === "dynamics/answer-independently.md" ? answerContent : null
      );
      assert.equal(push2.ok, true, "second push should succeed");
      if (!push2.ok) return;

      // R27 core assertion: stack.length === 3 (strategy + verify + answer-indep)
      assert.equal(push2.callStack.stack.length, 3, "depth must be 3 (root + verify + answer-indep)");

      // Child is answer-independently.md with question substituted.
      assert.match(push2.childInstructions, /Dynamic: Answer Independently/);
      assert.doesNotMatch(push2.childInstructions, /\{\{question\}\}/, "no unresolved {{question}} placeholder");
      assert.match(push2.childInstructions, /Is X true\?/, "question arg substituted");

      // Child starts with state=empty.
      assert.match(push2.childMemory, /^## State\nempty/m);
    });

    test("answer-independently pops back to verify with asking_completed and ## Answer spliced", () => {
      // Build stack: strategy (0) -> verify (1) -> answer-indep (2)
      const { cs: cs0, rootMemPath } = setupRootFrame(
        "## State\ndrafted\n## Push\ndynamics/verify.md\n## Push-Args\ndraft: |\n  claim"
      );
      const rootMem = readFileSync(rootMemPath, "utf-8");
      const verifyContent = readFileSync(resolve(INTERP, "dynamics/verify.md"), "utf-8");
      const answerContent = readFileSync(resolve(INTERP, "dynamics/answer-independently.md"), "utf-8");

      const push1 = applyPush(cs0, rootMem, (p) =>
        p === "dynamics/verify.md" ? verifyContent : null
      );
      assert.equal(push1.ok, true);
      if (!push1.ok) return;
      mkdirSync(resolve(tmp, push1.frameDir, "scoped"), { recursive: true });
      writeFileSync(resolve(tmp, push1.frameDir, "MEMORY.md"), push1.childMemory, "utf-8");
      writeFileSync(rootMemPath, push1.callerMemoryAfter, "utf-8");

      const askingMemory =
        "## State\nasking\n## Push\ndynamics/answer-independently.md\n## Push-Args\nquestion: |\n  Q?";
      const push2 = applyPush(push1.callStack, askingMemory, (p) =>
        p === "dynamics/answer-independently.md" ? answerContent : null
      );
      assert.equal(push2.ok, true);
      if (!push2.ok) return;
      assert.equal(push2.callStack.stack.length, 3);

      mkdirSync(resolve(tmp, push2.frameDir), { recursive: true });
      writeFileSync(resolve(tmp, push2.frameDir, "MEMORY.md"), push2.childMemory, "utf-8");
      writeFileSync(resolve(tmp, push1.frameDir, "MEMORY.md"), askingMemory, "utf-8");

      // Simulate answer-indep producing ## Return with answer and setting state=done.
      const answerMemoryDone =
        "## State\ndone\n## Return\nanswer: |\n  yes, X is true\n";
      writeFileSync(resolve(tmp, push2.frameDir, "MEMORY.md"), answerMemoryDone, "utf-8");

      // Pop answer-indep -> back to verify.
      const popped = applyPop(push2.callStack, answerMemoryDone, (frameDir, file) =>
        readFileSync(resolve(tmp, frameDir, file), "utf-8")
      );

      assert.equal(popped.callStack.stack.length, 2, "popped back to verify (depth 2)");
      assert.equal(popped.callerFrameDir, push1.frameDir);
      assert.equal(popped.events.length, 1);
      assert.deepEqual(popped.events[0].splicedKeys, ["answer"], "answer should be spliced into verify's MEMORY");

      // verify's MEMORY should have state=asking_completed and ## Answer spliced in.
      assert.match(popped.callerMemoryAfter, /^## State\nasking_completed/m);
      assert.match(popped.callerMemoryAfter, /## Answer\nyes, X is true/);
    });

    test("verify pops back to strategy with drafted_completed and ## Revised spliced", () => {
      const { cs: cs0, rootMemPath } = setupRootFrame(
        "## State\ndrafted\n## Push\ndynamics/verify.md\n## Push-Args\ndraft: |\n  my draft"
      );
      const rootMem = readFileSync(rootMemPath, "utf-8");
      const verifyContent = readFileSync(resolve(INTERP, "dynamics/verify.md"), "utf-8");

      const push1 = applyPush(cs0, rootMem, (p) =>
        p === "dynamics/verify.md" ? verifyContent : null
      );
      assert.equal(push1.ok, true);
      if (!push1.ok) return;

      mkdirSync(resolve(tmp, push1.frameDir, "scoped"), { recursive: true });
      writeFileSync(resolve(tmp, push1.frameDir, "MEMORY.md"), push1.childMemory, "utf-8");
      writeFileSync(rootMemPath, push1.callerMemoryAfter, "utf-8");

      // Simulate verify writing state=done + ## Return with revised key.
      const verifyDone =
        "## State\ndone\n## Return\nrevised: |\n  the corrected answer\n  with two lines\n";
      writeFileSync(resolve(tmp, push1.frameDir, "MEMORY.md"), verifyDone, "utf-8");

      // Pop verify -> back to strategy.
      const popped = applyPop(push1.callStack, verifyDone, (frameDir, file) =>
        readFileSync(resolve(tmp, frameDir, file), "utf-8")
      );

      assert.equal(popped.callStack.stack.length, 1, "popped back to strategy (depth 1)");
      assert.equal(popped.callerFrameDir, "frames/f000-strategy");
      assert.equal(popped.events.length, 1);
      assert.deepEqual(popped.events[0].splicedKeys, ["revised"], "revised should be spliced into strategy's MEMORY");

      // Strategy's MEMORY should have state=drafted_completed and ## Revised spliced in.
      assert.match(popped.callerMemoryAfter, /^## State\ndrafted_completed/m);
      assert.match(popped.callerMemoryAfter, /## Revised\n/);
      assert.match(popped.callerMemoryAfter, /the corrected answer/);
    });
  });
});
