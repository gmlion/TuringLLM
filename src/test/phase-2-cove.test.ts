import { test, describe } from "node:test";
import { strict as assert } from "node:assert";
import { readFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { applyPopLegacy as applyPop, applyPushLegacy as applyPush, type StackEntryLegacy as StackEntry } from "../call-stack.js";
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
