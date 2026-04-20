import { test, describe } from "node:test";
import { strict as assert } from "node:assert";
import { readFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { applyPop, applyPush, type StackEntry } from "../call-stack.js";
import { parseState, setState } from "../memory.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const INTERP = resolve(__dirname, "../../interpreters/2-iterative-refinement/1a-self-refine");

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

describe("1a self-refine", () => {
  test("interpreter files exist at the Group-2 path", () => {
    assert.ok(existsSync(resolve(INTERP, "INSTRUCTIONS.md")), "INSTRUCTIONS.md missing");
    assert.ok(existsSync(resolve(INTERP, "PROGRAM.md")), "PROGRAM.md missing");
    assert.ok(existsSync(resolve(INTERP, "dynamics/self-critique.md")), "dynamics/self-critique.md missing");
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
    const dyn = readFileSync(resolve(INTERP, "dynamics/self-critique.md"), "utf-8");
    assert.match(dyn, /state is "empty"/);
    assert.match(dyn, /state is "critiqued"/);
    assert.match(dyn, /state to "done"/);
  });

  test("push on drafted -> dynamic runs -> pop to drafted_completed", () => {
    const strategy = readFileSync(resolve(INTERP, "INSTRUCTIONS.md"), "utf-8");
    const memory = '## State\ndrafted\n## Draft\nfirst attempt\n## Push\ndynamics/self-critique.md';

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
    let memory = '## State\ndrafted\n## Draft\nsecond attempt\n## Push\ndynamics/self-critique.md';
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
