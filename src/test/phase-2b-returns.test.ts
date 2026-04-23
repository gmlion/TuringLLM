import { test, describe, beforeEach, afterEach } from "node:test";
import { strict as assert } from "node:assert";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync, existsSync } from "fs";
import { resolve } from "path";
import { tmpdir } from "os";
import { applyPush, applyPop, type CallStack } from "../call-stack.js";

describe("phase-2b end-to-end push/pop/splice", () => {
  let tmp: string;
  beforeEach(() => { tmp = mkdtempSync(resolve(tmpdir(), "turing-p2b-")); });
  afterEach(() => { rmSync(tmp, { recursive: true, force: true }); });

  function setupRoot(initialMemory: string): { cs: CallStack; rootMemPath: string } {
    mkdirSync(resolve(tmp, "frames/f000-strategy/scoped"), { recursive: true });
    const rootMemPath = resolve(tmp, "frames/f000-strategy/MEMORY.md");
    writeFileSync(rootMemPath, initialMemory, "utf-8");
    const cs: CallStack = {
      nextCounter: 1,
      stack: [{ returnState: "<root>", frameDir: "frames/f000-strategy" }],
    };
    return { cs, rootMemPath };
  }

  test("push creates child frame, pop splices ## Return into caller on disk", () => {
    const { cs, rootMemPath } = setupRoot(
      "## State\ndrafted\n## Draft\nclaim X\n## Push\ndynamics/verify.md\n## Push-Args\ndraft: |\n  claim X"
    );
    const rootMem = readFileSync(rootMemPath, "utf-8");

    // Push.
    const pushed = applyPush(cs, rootMem, (p) =>
      p === "dynamics/verify.md" ? "# Dynamic: Verify\nDraft: {{draft}}" : null,
    );
    assert.equal(pushed.ok, true);
    if (!pushed.ok) return;

    // Simulate main.ts-side filesystem effects after push.
    mkdirSync(resolve(tmp, pushed.frameDir, "scoped"), { recursive: true });
    writeFileSync(resolve(tmp, pushed.frameDir, "MEMORY.md"), pushed.childMemory, "utf-8");
    writeFileSync(resolve(tmp, pushed.frameDir, "INSTRUCTIONS.md"), pushed.childInstructions, "utf-8");
    writeFileSync(rootMemPath, pushed.callerMemoryAfter, "utf-8");

    // Verify caller's MEMORY.md still has its heap content (NOT obliterated).
    const callerAfterPush = readFileSync(rootMemPath, "utf-8");
    assert.match(callerAfterPush, /## State\ndrafted/);
    assert.match(callerAfterPush, /## Draft\nclaim X/);
    assert.doesNotMatch(callerAfterPush, /## Push/);
    assert.doesNotMatch(callerAfterPush, /## Push-Args/);

    // Simulate child writing its ## Return and state=done.
    const childMemory = "## State\ndone\n## Return\nrevised: revised answer\n";
    writeFileSync(resolve(tmp, pushed.frameDir, "MEMORY.md"), childMemory, "utf-8");

    // Pop.
    const popped = applyPop(pushed.callStack, childMemory, (frameDir, file) => {
      return readFileSync(resolve(tmp, frameDir, file), "utf-8");
    });
    assert.equal(popped.callStack.stack.length, 1);
    assert.equal(popped.callerFrameDir, "frames/f000-strategy");

    // Simulate main.ts-side filesystem effects after pop.
    writeFileSync(rootMemPath, popped.callerMemoryAfter, "utf-8");
    rmSync(resolve(tmp, pushed.frameDir), { recursive: true, force: true });

    // Verify on-disk end state.
    const final = readFileSync(rootMemPath, "utf-8");
    assert.match(final, /## State\ndrafted_completed/);
    assert.match(final, /## Draft\nclaim X/);
    assert.match(final, /## Revised\nrevised answer/);
    assert.equal(existsSync(resolve(tmp, pushed.frameDir)), false);
  });

  test("caller MEMORY survives multiple push/pop cycles (no obliteration)", () => {
    // The motivating test — verify.md-style scenario: strategy pushes verify,
    // verify pushes answer-indep (depth 2), pop, pop.
    const { cs, rootMemPath } = setupRoot(
      "## State\ndrafted\n## Draft\nmulti-claim draft\n## Push\ndynamics/verify.md\n## Push-Args\ndraft: |\n  multi-claim draft"
    );
    const rootMem0 = readFileSync(rootMemPath, "utf-8");

    // Push verify.
    const push1 = applyPush(cs, rootMem0, (p) =>
      p === "dynamics/verify.md" ? "# verify\n{{draft}}" : null,
    );
    assert.equal(push1.ok, true);
    if (!push1.ok) return;
    mkdirSync(resolve(tmp, push1.frameDir, "scoped"), { recursive: true });
    writeFileSync(resolve(tmp, push1.frameDir, "MEMORY.md"), push1.childMemory, "utf-8");
    writeFileSync(rootMemPath, push1.callerMemoryAfter, "utf-8");

    // verify writes its ## Verifications into its scoped file.
    writeFileSync(
      resolve(tmp, push1.frameDir, "scoped/verifications.md"),
      "- V1: q1; pending\n- V2: q2; pending\n",
      "utf-8",
    );
    // verify now has state=asking, pushes answer-indep.
    writeFileSync(
      resolve(tmp, push1.frameDir, "MEMORY.md"),
      "## State\nasking\n## Push\ndynamics/answer-independently.md\n## Push-Args\nquestion: |\n  q1",
      "utf-8",
    );
    const verifyMem = readFileSync(resolve(tmp, push1.frameDir, "MEMORY.md"), "utf-8");

    // Push answer-indep.
    const push2 = applyPush(push1.callStack, verifyMem, (p) =>
      p === "dynamics/answer-independently.md" ? "# ans\n{{question}}" : null,
    );
    assert.equal(push2.ok, true);
    if (!push2.ok) return;
    assert.equal(push2.callStack.stack.length, 3);  // strategy + verify + answer-indep

    // answer-indep runs, sets state=done, emits ## Return.
    const childMem = "## State\ndone\n## Return\nanswer: yes, q1 is true\n";

    // Pop answer-indep.
    const pop1 = applyPop(push2.callStack, childMem, (fd, f) =>
      readFileSync(resolve(tmp, fd, f), "utf-8"),
    );
    assert.equal(pop1.callStack.stack.length, 2);
    assert.equal(pop1.callerFrameDir, push1.frameDir);
    // verify's MEMORY got a ## Answer splice.
    assert.match(pop1.callerMemoryAfter, /## Answer\nyes, q1 is true/);

    // Critical assertion: verify.md's scoped/verifications.md is UNTOUCHED.
    const verifsOnDisk = readFileSync(
      resolve(tmp, push1.frameDir, "scoped/verifications.md"),
      "utf-8",
    );
    assert.equal(verifsOnDisk, "- V1: q1; pending\n- V2: q2; pending\n");

    // Critical assertion: strategy's ## Draft is UNTOUCHED on disk.
    const stratDraft = readFileSync(rootMemPath, "utf-8");
    assert.match(stratDraft, /## Draft\nmulti-claim draft/);
  });
});
