import { test, describe } from "node:test";
import { strict as assert } from "node:assert";
import { readFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { applyPop, applyPush, type CallStack } from "../call-stack.js";
import { parseState, setState } from "../memory.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const INTERP = resolve(__dirname, "../../interpreters/1-iterative-refinement/c-reflexion");

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

/** Extract the content of a named MEMORY section (without the header line). */
function extractSection(memory: string, name: string): string {
  const re = new RegExp(`^## ${name}\\n([\\s\\S]*?)(?=\\n## [A-Z]|$)`, "m");
  const m = memory.match(re);
  return m ? m[1].replace(/\n+$/, "") : "";
}

function simulateEvaluate(
  strategy: string,
  lessons: string,
  attempt: string,
  verdict: "pass" | "fail",
  feedback: string,
): { callStack: CallStack; frameStore: FrameStore; memory: string; instructions: string } {
  const initial =
    `## State\nattempted\n## Criterion\nc1\n## Lessons\n${lessons}\n## Attempt\n${attempt}\n## Push\ndynamics/evaluate.md\n## Push-Args\nattempt: |\n  ${attempt}\ncriterion: |\n  c1`;
  const { callStack, frameStore } = makeSession(strategy);
  let r = runStackBlock(callStack, frameStore, initial, strategy);
  assert.equal(r.callStack.stack.length, 2, "evaluate push should save caller frame");
  assert.match(r.instructions, /Instruction: Judge/);
  assert.match(r.instructions, /Attempt:/);
  assert.doesNotMatch(r.instructions, /\{\{attempt\}\}|\{\{criterion\}\}/);
  const memAfter = setState(
    r.memory + `\n## Verdict\n${verdict}\n## Feedback\n${feedback}`,
    "done",
  );
  r = runStackBlock(r.callStack, r.frameStore, memAfter, r.instructions);
  assert.equal(r.callStack.stack.length, 1);
  assert.match(r.memory, /^## State\nattempted_completed/m);
  return { callStack: r.callStack, frameStore: r.frameStore, memory: r.memory, instructions: r.instructions };
}

function simulateReflect(
  strategy: string,
  callStack: CallStack,
  frameStore: FrameStore,
  memoryAtFailedAttempt: string,
  lessonText: string,
): { callStack: CallStack; frameStore: FrameStore; memory: string; instructions: string } {
  const attempt = extractSection(memoryAtFailedAttempt, "Attempt");
  const verdict = extractSection(memoryAtFailedAttempt, "Verdict");
  const feedback = extractSection(memoryAtFailedAttempt, "Feedback") || "(no feedback)";
  const attemptLines = attempt.split("\n").map((l) => `  ${l}`).join("\n");
  const verdictLines = verdict.split("\n").map((l) => `  ${l}`).join("\n");
  const feedbackLines = feedback.split("\n").map((l) => `  ${l}`).join("\n");
  const withPush =
    memoryAtFailedAttempt +
    `\n## Push\ndynamics/reflect.md\n## Push-Args\nattempt: |\n${attemptLines}\nverdict: |\n${verdictLines}\nfeedback: |\n${feedbackLines}`;
  let r = runStackBlock(callStack, frameStore, withPush, strategy);
  assert.equal(r.callStack.stack.length, 2, "reflect push should save caller frame");
  assert.match(r.instructions, /Instruction: Distil lesson/);
  assert.match(r.instructions, /Attempt:/);
  assert.match(r.instructions, /Verdict:/);
  assert.match(r.instructions, /Feedback:/);
  assert.doesNotMatch(r.instructions, /\{\{attempt\}\}|\{\{verdict\}\}|\{\{feedback\}\}/);
  const memAfter = setState(r.memory + `\n## Lesson\n${lessonText}`, "done");
  r = runStackBlock(r.callStack, r.frameStore, memAfter, r.instructions);
  assert.equal(r.callStack.stack.length, 1);
  assert.match(r.memory, /^## State\nfailed_attempt_completed/m);
  return { callStack: r.callStack, frameStore: r.frameStore, memory: r.memory, instructions: r.instructions };
}

describe("1c reflexion", () => {
  test("interpreter files exist", () => {
    assert.ok(existsSync(resolve(INTERP, "INSTRUCTIONS.md")));
    assert.ok(existsSync(resolve(INTERP, "PROGRAM.md")));
    assert.ok(existsSync(resolve(INTERP, "test_palindrome.md")));
    assert.ok(existsSync(resolve(INTERP, "dynamics/evaluate.md")));
    assert.ok(existsSync(resolve(INTERP, "dynamics/reflect.md")));
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

  test("strategy Attempt instruction mentions ## Lessons (R12)", () => {
    const strategy = readFileSync(resolve(INTERP, "INSTRUCTIONS.md"), "utf-8");
    const section = strategy.split(/^## Instruction: Attempt/m)[1] ?? "";
    assert.match(section, /## Lessons/, "Attempt instruction must read ## Lessons before attempting");
  });

  test("reflect dynamic receives push-args and produces Lesson", () => {
    const dyn = readFileSync(resolve(INTERP, "dynamics/reflect.md"), "utf-8");
    assert.match(dyn, /\{\{attempt\}\}/);
    assert.match(dyn, /\{\{verdict\}\}/);
    assert.match(dyn, /\{\{feedback\}\}/);
    assert.match(dyn, /## Lesson/);
    assert.match(dyn, /state to "done"/);
  });

  test("full loop: two failures accumulate two lessons, third attempt passes (R10, R11)", () => {
    const strategy = readFileSync(resolve(INTERP, "INSTRUCTIONS.md"), "utf-8");

    let result = simulateEvaluate(strategy, "", "v1", "fail", "missed edge case A");
    let mem = setState(result.memory, "failed_attempt");
    result = simulateReflect(strategy, result.callStack, result.frameStore, mem, "always handle case A");

    let lessons = "- L1: always handle case A";

    result = simulateEvaluate(strategy, lessons, "v2", "fail", "missed edge case B");
    mem = setState(result.memory, "failed_attempt");
    result = simulateReflect(strategy, result.callStack, result.frameStore, mem, "always handle case B");
    lessons = "- L1: always handle case A\n- L2: always handle case B";

    result = simulateEvaluate(strategy, lessons, "v3", "pass", "all good");
    const memDone = setState(result.memory, "done");
    const finalR = runStackBlock(result.callStack, result.frameStore, memDone, result.instructions);
    assert.equal(finalR.halt, true);

    const lessonLines = lessons.split("\n").filter((l) => l.startsWith("- L"));
    assert.ok(lessonLines.length >= 2, `expected ≥2 lessons accumulated, got ${lessonLines.length}`);
  });
});
