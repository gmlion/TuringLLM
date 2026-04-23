import { test, describe } from "node:test";
import { strict as assert } from "node:assert";
import { readFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { applyPop, applyPush, type CallStack } from "../call-stack.js";
import { parseState, setState } from "../memory.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const INTERP = resolve(__dirname, "../../interpreters/1-iterative-refinement/a-self-refine");

function readTarget(p: string): string | null {
  const full = resolve(INTERP, p);
  if (!existsSync(full)) return null;
  const content = readFileSync(full, "utf-8");
  return content || null;
}

/** Per-test frame store: maps frameDir → { instructions } */
type FrameStore = Map<string, { instructions: string }>;

/**
 * Simulate the pre-LLM stack block.
 *
 * Uses the new Phase-2b applyPop with a legacy-compatible readFrame:
 * since interpreters don't use ## Return yet, we pass the active child
 * memory as the "caller memory" so all accumulated sections survive the
 * pop (same observable result as the legacy applyPopLegacy).
 */
function runStackBlock(
  callStack: CallStack,
  frameStore: FrameStore,
  memory: string,
  instructions: string,
): { callStack: CallStack; frameStore: FrameStore; memory: string; instructions: string; halt: boolean } {
  // Pop: readFrame returns the active child memory (legacy-compatible behavior).
  const popped = applyPop(callStack, memory, (_fd, _file) => memory);
  let curCallStack = popped.callStack;
  let curMemory = popped.callerMemoryAfter;
  let curInstructions = instructions;

  if (popped.events.length > 0) {
    // Restore instructions for the caller frame.
    const callerFrameDir = popped.callerFrameDir;
    curInstructions = frameStore.get(callerFrameDir)?.instructions ?? instructions;
    // Update caller frame with popped memory.
    frameStore.set(callerFrameDir, { instructions: curInstructions });
    // Remove popped frame.
    for (const ev of popped.events) {
      frameStore.delete(ev.frameDir);
    }
  }

  if (parseState(curMemory) === "done" && curCallStack.stack.length === 1) {
    return { callStack: curCallStack, frameStore, memory: curMemory, instructions: curInstructions, halt: true };
  }

  // Push.
  const pushed = applyPush(curCallStack, curMemory, readTarget);
  if (pushed.ok) {
    // Save caller frame instructions in the store.
    const callerFrameDir = curCallStack.stack[curCallStack.stack.length - 1].frameDir;
    frameStore.set(callerFrameDir, { instructions: curInstructions });
    // Set up child frame.
    frameStore.set(pushed.frameDir, { instructions: pushed.childInstructions });
    curCallStack = pushed.callStack;
    curMemory = pushed.childMemory;
    curInstructions = pushed.childInstructions;
  } else if (pushed.reason === "missing-target") {
    curMemory = pushed.memory;
  }

  return { callStack: curCallStack, frameStore, memory: curMemory, instructions: curInstructions, halt: false };
}

/** Build an initial session for a test with root instructions. */
function makeSession(rootInstructions: string): { callStack: CallStack; frameStore: FrameStore } {
  const callStack: CallStack = {
    nextCounter: 1,
    stack: [{ returnState: "<root>", frameDir: "frames/f000-strategy" }],
  };
  const frameStore: FrameStore = new Map();
  frameStore.set("frames/f000-strategy", { instructions: rootInstructions });
  return { callStack, frameStore };
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
    const memory = '## State\ndrafted\n## Draft\nfirst attempt\n## Push\ndynamics/self-critique.md\n## Push-Args\ndraft: |\n  first attempt';

    const { callStack: cs0, frameStore: fs } = makeSession(strategy);
    let r = runStackBlock(cs0, fs, memory, strategy);
    assert.equal(r.halt, false);
    assert.equal(r.callStack.stack.length, 2, "push should save one caller frame");
    assert.match(r.memory, /^## State\nempty/m);
    assert.match(r.instructions, /Instruction:/, "dynamic should be loaded");
    assert.match(r.instructions, /first attempt/, "draft arg should be substituted into dynamic");
    assert.doesNotMatch(r.instructions, /\{\{draft\}\}/, "no unresolved placeholder");

    const memAfterDynamic = setState(
      r.memory + "\n## Critique\nconcrete feedback\n## Refined\nbetter attempt",
      "done",
    );
    r = runStackBlock(r.callStack, r.frameStore, memAfterDynamic, r.instructions);
    assert.equal(r.halt, false);
    assert.equal(r.callStack.stack.length, 1);
    assert.match(r.memory, /^## State\ndrafted_completed/m);
    assert.equal(r.instructions, strategy);
  });

  test("second loop -> accepted -> halts at done at depth 0", () => {
    const strategy = readFileSync(resolve(INTERP, "INSTRUCTIONS.md"), "utf-8");
    const memory = '## State\ndrafted\n## Draft\nsecond attempt\n## Push\ndynamics/self-critique.md\n## Push-Args\ndraft: |\n  second attempt';
    const { callStack: cs0, frameStore: fs } = makeSession(strategy);
    let r = runStackBlock(cs0, fs, memory, strategy);
    const memAfterDynamic = setState(
      r.memory + "\n## Critique\nfinal feedback\n## Refined\nfinal text",
      "done",
    );
    r = runStackBlock(r.callStack, r.frameStore, memAfterDynamic, r.instructions);
    assert.match(r.memory, /^## State\ndrafted_completed/m);

    const memAccepted = setState(r.memory, "done");
    r = runStackBlock(r.callStack, r.frameStore, memAccepted, r.instructions);
    assert.equal(r.halt, true);
  });
});
