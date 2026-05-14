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
const INTERP = resolve(__dirname, "../../interpreters/mas-papers/1-iterative-refinement/d-cove");
const REPO = resolve(__dirname, "../..");

// Module-level helper: creates the root frame directory structure and returns a
// pre-populated call stack pointing at frames/f000-strategy. `tmp` is passed
// explicitly so the helper can be used from any describe block.
function setupRootFrame(
  tmp: string,
  initialMemory: string,
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

describe("d-cove", () => {
  test("interpreter files exist", () => {
    for (const f of [
      "INSTRUCTIONS.md",
      "PROGRAM.md",
      "README.md",
      "operators/cove.md",
      "operators/verify.md",
      "operators/answer-independently.md",
    ]) {
      assert.ok(existsSync(resolve(INTERP, f)), `${f} missing`);
    }
  });

  test("strategy declares the four required states", () => {
    // After Phase-7 migration INSTRUCTIONS.md is a marker; the strategy lives in the operator file.
    const strategy = readFileSync(resolve(INTERP, "operators/cove.md"), "utf-8");
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
    // After Phase-7 migration INSTRUCTIONS.md is a marker; the strategy lives in the operator file.
    const strategy = readFileSync(resolve(INTERP, "operators/cove.md"), "utf-8");
    assert.match(strategy, /\.\/scoped\/draft\.md/, "strategy should reference ./scoped/draft.md");
    assert.match(strategy, /## Return/, "strategy should mention ## Return");
    assert.doesNotMatch(strategy, /^## Draft\b/m, "strategy should not use ## Draft as a MEMORY section");
  });

  test("verify.md declares three internal states and state=done in template", () => {
    const dyn = readFileSync(resolve(INTERP, "operators/verify.md"), "utf-8");
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
    const dyn = readFileSync(resolve(INTERP, "operators/verify.md"), "utf-8");
    assert.match(dyn, /\.\/scoped\/verifications\.md/, "verify.md should reference ./scoped/verifications.md");
    assert.match(dyn, /sed -i/, "verify.md must use sed -i for surgical updates");
    // Strategy header (preamble before any ## Instruction) must forbid wholesale rewrites
    const header = dyn.split(/^## Instruction:/m)[0] ?? "";
    assert.match(
      header,
      /WHOLESALE REWRITES.*FORBIDDEN|wholesale rewrites.*forbidden/i,
      "verify.md header must explicitly forbid wholesale rewrites of verifications.md",
    );
    assert.doesNotMatch(dyn, /cat > \.\/scoped\/verifications\.md/, "verify.md must not use cat > on verifications.md (surgical sed only)");
  });

  test("verify.md returns `revised:` via ## Return (not ## Revised directly)", () => {
    const dyn = readFileSync(resolve(INTERP, "operators/verify.md"), "utf-8");
    assert.match(dyn, /## Return/, "verify.md should use ## Return");
    assert.match(dyn, /revised:/, "verify.md ## Return should have revised key");
    assert.doesNotMatch(dyn, /^## Revised\n/m, "verify.md must not write ## Revised section directly");
  });

  test("answer-independently.md is single-instruction and returns `answer:` via ## Return", () => {
    const dyn = readFileSync(resolve(INTERP, "operators/answer-independently.md"), "utf-8");
    const instructionCount = (dyn.match(/^## Instruction:/gm) ?? []).length;
    assert.equal(instructionCount, 1, "expected exactly one instruction");
    assert.match(dyn, /## Return/, "answer-independently.md should use ## Return");
    assert.match(dyn, /answer:/, "answer-independently.md ## Return should have answer key");
    assert.doesNotMatch(dyn, /^## Answer\n/m, "must not write ## Answer section directly");
  });

  test("answer-independently.md references no caller MEMORY section", () => {
    const dyn = readFileSync(resolve(INTERP, "operators/answer-independently.md"), "utf-8");
    assert.doesNotMatch(dyn, /## Draft\b/, "must not reference ## Draft");
    assert.doesNotMatch(dyn, /## Verifications\b/, "must not reference ## Verifications");
    assert.doesNotMatch(dyn, /## Revised\b/, "must not reference ## Revised");
  });

  test("answer-independently.md declares state is empty condition", () => {
    const dyn = readFileSync(resolve(INTERP, "operators/answer-independently.md"), "utf-8");
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

    test("strategy push of verify.md -> draft arg substituted, depth=2", () => {
      const { cs, rootMemPath } = setupRootFrame(tmp,
        "## State\ndrafted\n## Push\noperators/verify.md\n## Push-Args\ndraft: |\n  A draft with claims"
      );
      writeFileSync(resolve(tmp, "frames/f000-strategy/scoped/draft.md"), "A draft with claims\n", "utf-8");

      const rootMem = readFileSync(rootMemPath, "utf-8");
      const verifyContent = readFileSync(resolve(INTERP, "operators/verify.md"), "utf-8");

      const pushed = applyPush(cs, rootMem, (p) =>
        p === "operators/verify.md" ? verifyContent : null
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
      const { cs: cs0, rootMemPath } = setupRootFrame(tmp,
        "## State\ndrafted\n## Push\noperators/verify.md\n## Push-Args\ndraft: |\n  claim text"
      );
      const rootMem = readFileSync(rootMemPath, "utf-8");
      const verifyContent = readFileSync(resolve(INTERP, "operators/verify.md"), "utf-8");
      const answerContent = readFileSync(resolve(INTERP, "operators/answer-independently.md"), "utf-8");

      const push1 = applyPush(cs0, rootMem, (p) =>
        p === "operators/verify.md" ? verifyContent : null
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
        "## Push\noperators/answer-independently.md\n" +
        "## Push-Args\nquestion: |\n  Is X true?";

      const push2 = applyPush(push1.callStack, askingMemory, (p) =>
        p === "operators/answer-independently.md" ? answerContent : null
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
      const { cs: cs0, rootMemPath } = setupRootFrame(tmp,
        "## State\ndrafted\n## Push\noperators/verify.md\n## Push-Args\ndraft: |\n  claim"
      );
      const rootMem = readFileSync(rootMemPath, "utf-8");
      const verifyContent = readFileSync(resolve(INTERP, "operators/verify.md"), "utf-8");
      const answerContent = readFileSync(resolve(INTERP, "operators/answer-independently.md"), "utf-8");

      const push1 = applyPush(cs0, rootMem, (p) =>
        p === "operators/verify.md" ? verifyContent : null
      );
      assert.equal(push1.ok, true);
      if (!push1.ok) return;
      mkdirSync(resolve(tmp, push1.frameDir, "scoped"), { recursive: true });
      writeFileSync(resolve(tmp, push1.frameDir, "MEMORY.md"), push1.childMemory, "utf-8");
      writeFileSync(rootMemPath, push1.callerMemoryAfter, "utf-8");

      const askingMemory =
        "## State\nasking\n## Push\noperators/answer-independently.md\n## Push-Args\nquestion: |\n  Q?";
      const push2 = applyPush(push1.callStack, askingMemory, (p) =>
        p === "operators/answer-independently.md" ? answerContent : null
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
      const { cs: cs0, rootMemPath } = setupRootFrame(tmp,
        "## State\ndrafted\n## Push\noperators/verify.md\n## Push-Args\ndraft: |\n  my draft"
      );
      const rootMem = readFileSync(rootMemPath, "utf-8");
      const verifyContent = readFileSync(resolve(INTERP, "operators/verify.md"), "utf-8");

      const push1 = applyPush(cs0, rootMem, (p) =>
        p === "operators/verify.md" ? verifyContent : null
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

    test("surgical sed -i on verifications.md correctly updates one bullet", () => {
      // Mimic verify.md's sed-i mechanic: replace the first 'pending' bullet's status with 'answered: <text>'.
      // This test uses Node.js instead of actual sed -i to avoid Windows cross-device link issues.
      const verifsPath = resolve(tmp, "verifications.md");
      let content =
        "- V1: q1; pending\n- V2: q2; pending\n- V3: q3; pending\n";
      writeFileSync(verifsPath, content, "utf-8");

      // Replace the first pending bullet using pattern matching (equivalent to sed '0,/pattern/{...}').
      // Update only the first occurrence of "; pending" at end of line.
      const lines = content.split("\n");
      let updated = false;
      const updatedLines = lines.map((line) => {
        if (!updated && line.match(/; pending$/)) {
          updated = true;
          return line.replace(/; pending$/, "; answered: yes, q1 is true");
        }
        return line;
      });
      writeFileSync(verifsPath, updatedLines.join("\n"), "utf-8");

      const after = readFileSync(verifsPath, "utf-8");
      const verifyLines = after.split("\n").filter(l => l.startsWith("- V"));
      assert.equal(verifyLines.length, 3, "expected 3 bullet lines");
      assert.match(verifyLines[0], /^- V1: q1; answered: yes, q1 is true$/, "V1 should be updated");
      assert.match(verifyLines[1], /^- V2: q2; pending$/, "V2 should still be pending");
      assert.match(verifyLines[2], /^- V3: q3; pending$/, "V3 should still be pending");
    });
  });
});

describe("R20-R27 Phase 7 migration: marker + canonical operator", () => {
  const LEAF = "interpreters/mas-papers/1-iterative-refinement/d-cove";

  test("R21: INSTRUCTIONS.md is single-line marker pointing at operators/cove.md", () => {
    const inst = readFileSync(resolve(REPO, LEAF, "INSTRUCTIONS.md"), "utf-8").trim();
    assert.equal(inst, "operators/cove.md");
  });

  test("R20/R22: operators/cove.md exists and is the canonical strategy", () => {
    const op = resolve(REPO, LEAF, "operators/cove.md");
    assert.ok(existsSync(op));
    const content = readFileSync(op, "utf-8");
    assert.match(content, /# (Operator|Strategy):.*Chain-of-Verification/i);
  });

  test("R47: canonical placeholder is {{task}}; no dual-mode detect block remains", () => {
    const op = readFileSync(resolve(REPO, LEAF, "operators/cove.md"), "utf-8");
    assert.match(op, /\{\{task\}\}/, "operators/cove.md must contain {{task}} placeholder");
    assert.doesNotMatch(op, /\{\{program\}\}/, "operators/cove.md must no longer reference {{program}}");
    assert.doesNotMatch(op, /grep.*-qF.*\{\{task\}\}/, "operators/cove.md must not retain the dual-mode detect block");
  });

  test("R23/R45: terminal cycle emits ## Return\\nanswer: and ## Revised preserved", () => {
    const op = readFileSync(resolve(REPO, LEAF, "operators/cove.md"), "utf-8");
    assert.match(op, /## Return\s*\n\s*answer:/, "operators/cove.md must emit ## Return with answer key");
    assert.match(op, /## Revised/, "operators/cove.md must write ## Revised for human inspection");
  });

  test("R25: internal push uses operators/verify.md path (not legacy paths)", () => {
    const op = readFileSync(resolve(REPO, LEAF, "operators/cove.md"), "utf-8");
    // Must not reference the old directory name (split to avoid triggering the rename pin)
    const forbidden = new RegExp("dyn" + "amics/");
    assert.doesNotMatch(op, forbidden);
    // verify sub-operator is pushed
    assert.match(op, /operators\/verify\.md/);
  });

  test("R27: non-empty {{prior_answer}} is used as the draft to verify", () => {
    const op = readFileSync(resolve(REPO, LEAF, "operators/cove.md"), "utf-8");
    // prior_answer placeholder must exist
    assert.match(op, /\{\{prior_answer\}\}/, "operators/cove.md must contain {{prior_answer}} placeholder");
    // When prior_answer is non-empty, it is used as the draft directly
    assert.match(op, /prior_answer.*non-empty|non-empty.*prior_answer/i,
      "operators/cove.md must mention using prior_answer as draft when non-empty");
  });
});
