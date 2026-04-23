import { test, describe } from "node:test";
import { strict as assert } from "node:assert";
import { applyPopLegacy as applyPop, applyPushLegacy as applyPush, type StackEntryLegacy as StackEntry } from "../call-stack.js";
import { parseState, setState } from "../memory.js";

/**
 * Simulate the pre-LLM stack block from main.ts for a single cycle.
 * Returns the post-block state the LLM would see.
 */
function runStackBlock(
  stack: StackEntry[],
  memory: string,
  instructions: string,
  files: Record<string, string>,
): { stack: StackEntry[]; memory: string; instructions: string; halt: boolean } {
  const popped = applyPop(stack, memory, instructions);
  let curStack = popped.stack;
  let curMemory = popped.memory;
  let curInstructions = popped.instructions;

  if (parseState(curMemory) === "done" && curStack.length === 0) {
    return { stack: curStack, memory: curMemory, instructions: curInstructions, halt: true };
  }

  const pushed = applyPush(curStack, curMemory, curInstructions, (p) => files[p] ?? null);
  if (pushed.ok) {
    curStack = pushed.stack;
    curMemory = pushed.memory;
    curInstructions = pushed.instructions;
  } else if (pushed.reason === "missing-target") {
    curMemory = pushed.memory;
  }
  return { stack: curStack, memory: curMemory, instructions: curInstructions, halt: false };
}

describe("stack integration", () => {
  test("top-level done halts", () => {
    const r = runStackBlock([], "## State\ndone", "# Strategy", {});
    assert.equal(r.halt, true);
  });

  test("running state at depth 0 does nothing", () => {
    const r = runStackBlock([], "## State\nplanning", "# Strategy", {});
    assert.equal(r.halt, false);
    assert.equal(r.stack.length, 0);
    assert.match(r.memory, /## State\nplanning/);
  });

  test("push then done pops back to caller with {state}_completed", () => {
    const files = { "dynamics/consult.md": "# Dynamic" };

    // Cycle 1: caller writes ## Push; block pushes it.
    const c1 = runStackBlock(
      [],
      "## State\nneeds_opinion\n## Push\ndynamics/consult.md",
      "# Strategy",
      files,
    );
    assert.equal(c1.halt, false);
    assert.equal(c1.stack.length, 1);
    assert.equal(c1.instructions, "# Dynamic");
    assert.match(c1.memory, /## State\nempty/);

    // Cycle 2 (LLM runs dynamic, eventually sets state=done).
    const memAfterDynamic = setState(c1.memory, "done");

    // Cycle 3 (pre-LLM block): should pop back to caller.
    const c3 = runStackBlock(c1.stack, memAfterDynamic, c1.instructions, files);
    assert.equal(c3.halt, false);
    assert.equal(c3.stack.length, 0);
    assert.equal(c3.instructions, "# Strategy");
    assert.match(c3.memory, /## State\nneeds_opinion_completed/);
  });

  test("nested push: outer -> inner -> pop -> pop -> halt", () => {
    const files = {
      "dynamics/a.md": "# A",
      "dynamics/b.md": "# B",
    };

    // Outer pushes A.
    let r = runStackBlock([], "## State\nouter\n## Push\ndynamics/a.md", "# Strategy", files);
    assert.equal(r.stack.length, 1);
    assert.equal(r.instructions, "# A");

    // Inside A, push B.
    const memInAwithPush = setState(r.memory, "inside_a") + "\n## Push\ndynamics/b.md";
    r = runStackBlock(r.stack, memInAwithPush, r.instructions, files);
    assert.equal(r.stack.length, 2);
    assert.equal(r.instructions, "# B");

    // B finishes -> pop to A with "inside_a_completed".
    const bDone = setState(r.memory, "done");
    r = runStackBlock(r.stack, bDone, r.instructions, files);
    assert.equal(r.stack.length, 1);
    assert.equal(r.instructions, "# A");
    assert.match(r.memory, /## State\ninside_a_completed/);

    // A finishes -> pop to strategy with "outer_completed".
    const aDone = setState(r.memory, "done");
    r = runStackBlock(r.stack, aDone, r.instructions, files);
    assert.equal(r.stack.length, 0);
    assert.equal(r.instructions, "# Strategy");
    assert.match(r.memory, /## State\nouter_completed/);

    // Strategy finishes -> halt.
    r = runStackBlock(r.stack, setState(r.memory, "done"), r.instructions, files);
    assert.equal(r.halt, true);
  });

  test("done + push in the same cycle: pop runs first, push fires from the restored caller's context", () => {
    // Caller's saved state was "x"; dynamic sets state=done AND writes ## Push.
    // Expected: pop restores caller (state -> x_completed),
    // then push fires from the caller's context onto a fresh frame.
    const files = { "dynamics/other.md": "# Other" };
    const stack: StackEntry[] = [{ returnState: "x", instructions: "# Caller" }];

    const r = runStackBlock(
      stack,
      "## State\ndone\n## Push\ndynamics/other.md",
      "# Dynamic",
      files,
    );
    assert.equal(r.halt, false);
    assert.equal(r.stack.length, 1);
    // After pop, caller's state is x_completed; push saves that as the return state.
    assert.equal(r.stack[0].returnState, "x_completed");
    assert.equal(r.stack[0].instructions, "# Caller");
    assert.equal(r.instructions, "# Other");
    assert.match(r.memory, /## State\nempty/);
  });

  test("push to missing file leaves stack untouched and strips ## Push from memory", () => {
    const r = runStackBlock(
      [],
      "## State\nfoo\n## Push\nno/such/file.md",
      "# Strategy",
      {},
    );
    assert.equal(r.halt, false);
    assert.equal(r.stack.length, 0);
    assert.equal(r.instructions, "# Strategy");
    assert.doesNotMatch(r.memory, /## Push/);
    assert.match(r.memory, /## State\nfoo/);
  });

  test("waiting_for_user inside a dynamic does not trigger a pop", () => {
    // State != "done", so no pop. Stack is preserved.
    const stack: StackEntry[] = [{ returnState: "x", instructions: "# Caller" }];
    const r = runStackBlock(stack, "## State\nwaiting_for_user", "# Dynamic", {});
    assert.equal(r.halt, false);
    assert.equal(r.stack.length, 1);
    assert.equal(r.instructions, "# Dynamic");
    assert.match(r.memory, /## State\nwaiting_for_user/);
  });
});
