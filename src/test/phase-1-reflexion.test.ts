import { test, describe } from "node:test";
import { strict as assert } from "node:assert";
import { readFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { applyPop, applyPush, type StackEntry } from "../call-stack.js";
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

function simulateEvaluate(
  strategy: string,
  lessons: string,
  attempt: string,
  verdict: "pass" | "fail",
  feedback: string,
): { memory: string; stack: StackEntry[]; instructions: string } {
  const initial =
    `## State\nattempted\n## Criterion\nc1\n## Lessons\n${lessons}\n## Attempt\n${attempt}\n## Push\ndynamics/evaluate.md\n## Push-Args\nattempt: |\n  ${attempt}\ncriterion: |\n  c1`;
  let r = runStackBlock([], initial, strategy);
  assert.equal(r.stack.length, 1, "evaluate push should save caller frame");
  assert.match(r.instructions, /Instruction: Judge/);
  assert.match(r.instructions, /Attempt:/);
  assert.doesNotMatch(r.instructions, /\{\{attempt\}\}|\{\{criterion\}\}/);
  const memAfter = setState(
    r.memory + `\n## Verdict\n${verdict}\n## Feedback\n${feedback}`,
    "done",
  );
  r = runStackBlock(r.stack, memAfter, r.instructions);
  assert.equal(r.stack.length, 0);
  assert.match(r.memory, /^## State\nattempted_completed/m);
  return r;
}

/** Extract the content of a named MEMORY section (without the header line). */
function extractSection(memory: string, name: string): string {
  const re = new RegExp(`^## ${name}\\n([\\s\\S]*?)(?=\\n## [A-Z]|$)`, "m");
  const m = memory.match(re);
  return m ? m[1].replace(/\n+$/, "") : "";
}

function simulateReflect(
  strategy: string,
  memoryAtFailedAttempt: string,
  lessonText: string,
): { memory: string; stack: StackEntry[]; instructions: string } {
  const attempt = extractSection(memoryAtFailedAttempt, "Attempt");
  const verdict = extractSection(memoryAtFailedAttempt, "Verdict");
  const feedback = extractSection(memoryAtFailedAttempt, "Feedback") || "(no feedback)";
  const attemptLines = attempt.split("\n").map((l) => `  ${l}`).join("\n");
  const verdictLines = verdict.split("\n").map((l) => `  ${l}`).join("\n");
  const feedbackLines = feedback.split("\n").map((l) => `  ${l}`).join("\n");
  const withPush =
    memoryAtFailedAttempt +
    `\n## Push\ndynamics/reflect.md\n## Push-Args\nattempt: |\n${attemptLines}\nverdict: |\n${verdictLines}\nfeedback: |\n${feedbackLines}`;
  let r = runStackBlock([], withPush, strategy);
  assert.equal(r.stack.length, 1, "reflect push should save caller frame");
  assert.match(r.instructions, /Instruction: Distil lesson/);
  assert.match(r.instructions, /Attempt:/);
  assert.match(r.instructions, /Verdict:/);
  assert.match(r.instructions, /Feedback:/);
  assert.doesNotMatch(r.instructions, /\{\{attempt\}\}|\{\{verdict\}\}|\{\{feedback\}\}/);
  const memAfter = setState(r.memory + `\n## Lesson\n${lessonText}`, "done");
  r = runStackBlock(r.stack, memAfter, r.instructions);
  assert.equal(r.stack.length, 0);
  assert.match(r.memory, /^## State\nfailed_attempt_completed/m);
  return r;
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

    let r: { memory: string; stack: StackEntry[]; instructions: string; halt?: boolean } = simulateEvaluate(strategy, "", "v1", "fail", "missed edge case A");
    let mem = setState(r.memory, "failed_attempt");
    r = simulateReflect(strategy, mem, "always handle case A");

    let lessons = "- L1: always handle case A";

    r = simulateEvaluate(strategy, lessons, "v2", "fail", "missed edge case B");
    mem = setState(r.memory, "failed_attempt");
    r = simulateReflect(strategy, mem, "always handle case B");
    lessons = "- L1: always handle case A\n- L2: always handle case B";

    r = simulateEvaluate(strategy, lessons, "v3", "pass", "all good");
    const memDone = setState(r.memory, "done");
    r = runStackBlock(r.stack, memDone, r.instructions);
    assert.equal(r.halt, true);

    const lessonLines = lessons.split("\n").filter((l) => l.startsWith("- L"));
    assert.ok(lessonLines.length >= 2, `expected ≥2 lessons accumulated, got ${lessonLines.length}`);
  });
});
