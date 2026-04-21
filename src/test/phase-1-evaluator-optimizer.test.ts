import { test, describe } from "node:test";
import { strict as assert } from "node:assert";
import { readFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { applyPop, applyPush, type StackEntry } from "../call-stack.js";
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
    assert.match(dyn, /## Attempt/);
    assert.match(dyn, /## Criterion/);
    assert.match(dyn, /## Verdict/);
    assert.match(dyn, /## Feedback/);
    assert.match(dyn, /state to "done"/);
  });

  test("fail then pass: attempted -> evaluate fail -> attempted -> evaluate pass -> done", () => {
    const strategy = readFileSync(resolve(INTERP, "INSTRUCTIONS.md"), "utf-8");

    let r = runStackBlock(
      [],
      '## State\nattempted\n## Criterion\nc1\n## Attempt\nv1\n## Push\ndynamics/evaluate.md',
      strategy,
    );
    assert.equal(r.stack.length, 1);
    assert.match(r.instructions, /Instruction:/);

    let memAfter = setState(
      r.memory + "\n## Verdict\nfail\n## Feedback\nmissed edge case",
      "done",
    );
    r = runStackBlock(r.stack, memAfter, r.instructions);
    assert.equal(r.stack.length, 0);
    assert.match(r.memory, /^## State\nattempted_completed/m);

    const memLoop =
      '## State\nattempted\n## Criterion\nc1\n## Attempt\nv2\n## Push\ndynamics/evaluate.md';
    r = runStackBlock([], memLoop, strategy);
    assert.equal(r.stack.length, 1);

    memAfter = setState(
      r.memory + "\n## Verdict\npass\n## Feedback\nok",
      "done",
    );
    r = runStackBlock(r.stack, memAfter, r.instructions);
    assert.match(r.memory, /^## State\nattempted_completed/m);

    const memDone = setState(r.memory, "done");
    r = runStackBlock(r.stack, memDone, r.instructions);
    assert.equal(r.halt, true);
  });

  test("malformed-verdict path keeps the loop alive (no waiting_for_user)", () => {
    // Design §Error handling prescribes: on a malformed `## Verdict`, the
    // strategy treats it as fail (conservative) AND appends a non-blocking
    // `## Pending Questions` item. It MUST NOT set state to
    // `waiting_for_user`, because the strategy has no `user_responded`
    // handler and the shell would otherwise re-enter handleNoMatch on every
    // subsequent user reply — a live stall.
    const strategy = readFileSync(resolve(INTERP, "INSTRUCTIONS.md"), "utf-8");
    const section = strategy.split(/^## Instruction: Handle verdict/m)[1] ?? "";
    assert.match(section, /Pending Questions/, "malformed-verdict path must add a Pending Questions item");
    assert.match(section, /do NOT set state to "waiting_for_user"/i, "malformed-verdict path must explicitly forbid waiting_for_user");
  });
});
