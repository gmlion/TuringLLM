import { test, describe } from "node:test";
import { strict as assert } from "node:assert";
import { readFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { applyPop, applyPush, type CallStack } from "../call-stack.js";
import { parseState, setState } from "../memory.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const INTERP = resolve(__dirname, "../../interpreters/1-iterative-refinement/b-evaluator-optimizer");

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
    const callerFrameDir = popped.callerFrameDir;
    curInstructions = frameStore.get(callerFrameDir)?.instructions ?? instructions;
    frameStore.set(callerFrameDir, { instructions: curInstructions });
    for (const ev of popped.events) {
      frameStore.delete(ev.frameDir);
    }
  }

  if (parseState(curMemory) === "done" && curCallStack.stack.length === 1) {
    return { callStack: curCallStack, frameStore, memory: curMemory, instructions: curInstructions, halt: true };
  }

  const pushed = applyPush(curCallStack, curMemory, readTarget);
  if (pushed.ok) {
    const callerFrameDir = curCallStack.stack[curCallStack.stack.length - 1].frameDir;
    frameStore.set(callerFrameDir, { instructions: curInstructions });
    frameStore.set(pushed.frameDir, { instructions: pushed.childInstructions });
    curCallStack = pushed.callStack;
    curMemory = pushed.childMemory;
    curInstructions = pushed.childInstructions;
  } else if (pushed.reason === "missing-target") {
    curMemory = pushed.memory;
  }

  return { callStack: curCallStack, frameStore, memory: curMemory, instructions: curInstructions, halt: false };
}

function makeSession(rootInstructions: string): { callStack: CallStack; frameStore: FrameStore } {
  const callStack: CallStack = {
    nextCounter: 1,
    stack: [{ returnState: "<root>", frameDir: "frames/f000-strategy" }],
  };
  const frameStore: FrameStore = new Map();
  frameStore.set("frames/f000-strategy", { instructions: rootInstructions });
  return { callStack, frameStore };
}

describe("1b evaluator-optimizer", () => {
  test("interpreter files exist", () => {
    assert.ok(existsSync(resolve(INTERP, "INSTRUCTIONS.md")));
    assert.ok(existsSync(resolve(INTERP, "PROGRAM.md")));
    assert.ok(existsSync(resolve(INTERP, "dynamics/evaluate.md")));
  });

  test("strategy declares the required states", () => {
    const strategy = readFileSync(resolve(INTERP, "INSTRUCTIONS.md"), "utf-8");
    for (const needle of [
      'state is "empty"',
      'state is "attempted"',
      'state is "attempted_completed"',
      'state is "done"',
    ]) {
      assert.match(strategy, new RegExp(needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    }
  });

  test("evaluate dynamic consumes ## Attempt and ## Criterion, produces ## Verdict and ## Feedback", () => {
    const dyn = readFileSync(resolve(INTERP, "dynamics/evaluate.md"), "utf-8");
    assert.match(dyn, /\{\{attempt\}\}/);
    assert.match(dyn, /\{\{criterion\}\}/);
    assert.match(dyn, /## Verdict/);
    assert.match(dyn, /## Feedback/);
    assert.match(dyn, /state to "done"/);
  });

  test("fail then pass: attempted -> evaluate fail -> attempted -> evaluate pass -> done", () => {
    const strategy = readFileSync(resolve(INTERP, "INSTRUCTIONS.md"), "utf-8");
    const { callStack: cs0, frameStore: fs } = makeSession(strategy);

    let r = runStackBlock(
      cs0,
      fs,
      '## State\nattempted\n## Criterion\nc1\n## Attempt\nv1\n## Push\ndynamics/evaluate.md\n## Push-Args\nattempt: |\n  v1\ncriterion: |\n  c1',
      strategy,
    );
    assert.equal(r.callStack.stack.length, 2);
    assert.match(r.instructions, /Instruction:/);
    assert.match(r.instructions, /Attempt:/);
    assert.doesNotMatch(r.instructions, /\{\{attempt\}\}|\{\{criterion\}\}/);

    let memAfter = setState(
      r.memory + "\n## Verdict\nfail\n## Feedback\nmissed edge case",
      "done",
    );
    r = runStackBlock(r.callStack, r.frameStore, memAfter, r.instructions);
    assert.equal(r.callStack.stack.length, 1);
    assert.match(r.memory, /^## State\nattempted_completed/m);

    const { callStack: cs1, frameStore: fs1 } = makeSession(strategy);
    const memLoop =
      '## State\nattempted\n## Criterion\nc1\n## Attempt\nv2\n## Push\ndynamics/evaluate.md\n## Push-Args\nattempt: |\n  v2\ncriterion: |\n  c1';
    r = runStackBlock(cs1, fs1, memLoop, strategy);
    assert.equal(r.callStack.stack.length, 2);

    memAfter = setState(
      r.memory + "\n## Verdict\npass\n## Feedback\nok",
      "done",
    );
    r = runStackBlock(r.callStack, r.frameStore, memAfter, r.instructions);
    assert.match(r.memory, /^## State\nattempted_completed/m);

    const memDone = setState(r.memory, "done");
    r = runStackBlock(r.callStack, r.frameStore, memDone, r.instructions);
    assert.equal(r.halt, true);
  });

  test("malformed-verdict path keeps the loop alive (no waiting_for_user)", () => {
    const strategy = readFileSync(resolve(INTERP, "INSTRUCTIONS.md"), "utf-8");
    const section = strategy.split(/^## Instruction: Handle verdict/m)[1] ?? "";
    assert.match(section, /Pending Questions/, "malformed-verdict path must add a Pending Questions item");
    assert.match(section, /do NOT set state to "waiting_for_user"/i, "malformed-verdict path must explicitly forbid waiting_for_user");
  });
});
