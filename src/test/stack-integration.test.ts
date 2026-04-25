import { test, describe } from "node:test";
import { strict as assert } from "node:assert";
import { existsSync as existsSyncGT } from "fs";
import { resolve as resolveGT, dirname as dirnameGT } from "path";
import { fileURLToPath as fileURLToPathGT } from "url";
import { applyPop, applyPush, type CallStack } from "../call-stack.js";
import { parseState, setState } from "../memory.js";

const __filenameGT = fileURLToPathGT(import.meta.url);
const __dirnameGT = dirnameGT(__filenameGT);

/**
 * In-memory frame store simulating on-disk frame directories.
 * Maps frameDir → { memory, instructions }.
 */
type FrameStore = Map<string, { memory: string; instructions: string }>;

/**
 * Simulate the pre-LLM stack block from main.ts for a single cycle.
 * Uses the new Phase-2b applyPop and applyPush signatures.
 *
 * The frame store tracks per-frame memory and instructions so that
 * applyPop's readFrame callback can look up the caller's MEMORY.
 *
 * Returns the post-block state the LLM would see.
 */
function runStackBlock(
  callStack: CallStack,
  activeMemory: string,
  frameStore: FrameStore,
  files: Record<string, string>,
): { callStack: CallStack; memory: string; instructions: string; halt: boolean } {
  // Pop: cascade-pop while state=done and stack.length > 1.
  const popped = applyPop(callStack, activeMemory, (fd, _file) => {
    return frameStore.get(fd)?.memory ?? "";
  });

  let curCallStack = popped.callStack;
  let curMemory = popped.callerMemoryAfter;

  if (popped.events.length > 0) {
    // Update caller frame's memory in the store.
    frameStore.set(popped.callerFrameDir, {
      memory: popped.callerMemoryAfter,
      instructions: frameStore.get(popped.callerFrameDir)?.instructions ?? "",
    });
    // Remove popped frames from the store.
    for (const ev of popped.events) {
      frameStore.delete(ev.frameDir);
    }
  } else {
    // No pop happened; active memory stays as-is.
    curMemory = activeMemory;
  }

  // Halt check: state=done and only root remains.
  if (parseState(curMemory) === "done" && curCallStack.stack.length === 1) {
    const topFrameDir = curCallStack.stack[curCallStack.stack.length - 1].frameDir;
    return {
      callStack: curCallStack,
      memory: curMemory,
      instructions: frameStore.get(topFrameDir)?.instructions ?? "",
      halt: true,
    };
  }

  // Push: handle ## Push in current memory.
  const pushed = applyPush(curCallStack, curMemory, (p) => files[p] ?? null);

  if (pushed.ok) {
    // Update caller frame's memory (push stripped).
    frameStore.set(curCallStack.stack[curCallStack.stack.length - 1].frameDir, {
      memory: pushed.callerMemoryAfter,
      instructions: frameStore.get(curCallStack.stack[curCallStack.stack.length - 1].frameDir)?.instructions ?? "",
    });
    // Set up child frame.
    frameStore.set(pushed.frameDir, {
      memory: pushed.childMemory,
      instructions: pushed.childInstructions,
    });
    curCallStack = pushed.callStack;
    curMemory = pushed.childMemory;
  } else if (pushed.reason === "missing-target") {
    curMemory = pushed.memory;
    // Update active frame's memory.
    const topFd = curCallStack.stack[curCallStack.stack.length - 1].frameDir;
    frameStore.set(topFd, { memory: curMemory, instructions: frameStore.get(topFd)?.instructions ?? "" });
  }

  const topFrameDir = curCallStack.stack[curCallStack.stack.length - 1].frameDir;
  return {
    callStack: curCallStack,
    memory: curMemory,
    instructions: frameStore.get(topFrameDir)?.instructions ?? "",
    halt: false,
  };
}

/** Build a fresh root-only CallStack and FrameStore for tests. */
function makeRoot(instructions: string): { callStack: CallStack; frameStore: FrameStore } {
  const frameStore: FrameStore = new Map();
  const callStack: CallStack = {
    nextCounter: 1,
    stack: [{ returnState: "<root>", frameDir: "frames/f000-strategy" }],
  };
  frameStore.set("frames/f000-strategy", { memory: "", instructions });
  return { callStack, frameStore };
}

describe("stack integration", () => {
  test("top-level done halts", () => {
    const { callStack, frameStore } = makeRoot("# Strategy");
    const r = runStackBlock(callStack, "## State\ndone", frameStore, {});
    assert.equal(r.halt, true);
  });

  test("running state at depth 0 does nothing", () => {
    const { callStack, frameStore } = makeRoot("# Strategy");
    const r = runStackBlock(callStack, "## State\nplanning", frameStore, {});
    assert.equal(r.halt, false);
    // Stack still has only the root frame.
    assert.equal(r.callStack.stack.length, 1);
    assert.match(r.memory, /## State\nplanning/);
  });

  test("push then done pops back to caller with {state}_completed", () => {
    const files = { "dynamics/consult.md": "# Dynamic" };
    const { callStack, frameStore } = makeRoot("# Strategy");

    // Cycle 1: caller writes ## Push; block pushes it.
    const c1 = runStackBlock(
      callStack,
      "## State\nneeds_opinion\n## Push\ndynamics/consult.md",
      frameStore,
      files,
    );
    assert.equal(c1.halt, false);
    assert.equal(c1.callStack.stack.length, 2);
    assert.equal(c1.instructions, "# Dynamic");
    assert.match(c1.memory, /## State\nempty/);

    // Cycle 2 (LLM runs dynamic, eventually sets state=done).
    const memAfterDynamic = setState(c1.memory, "done");

    // Cycle 3 (pre-LLM block): should pop back to caller.
    const c3 = runStackBlock(c1.callStack, memAfterDynamic, frameStore, files);
    assert.equal(c3.halt, false);
    assert.equal(c3.callStack.stack.length, 1);
    assert.equal(c3.instructions, "# Strategy");
    assert.match(c3.memory, /## State\nneeds_opinion_completed/);
  });

  test("nested push: outer -> inner -> pop -> pop -> halt", () => {
    const files = {
      "dynamics/a.md": "# A",
      "dynamics/b.md": "# B",
    };
    const { callStack, frameStore } = makeRoot("# Strategy");

    // Outer pushes A.
    let r = runStackBlock(callStack, "## State\nouter\n## Push\ndynamics/a.md", frameStore, files);
    assert.equal(r.callStack.stack.length, 2);
    assert.equal(r.instructions, "# A");

    // Inside A, push B.
    const memInAwithPush = setState(r.memory, "inside_a") + "\n## Push\ndynamics/b.md";
    r = runStackBlock(r.callStack, memInAwithPush, frameStore, files);
    assert.equal(r.callStack.stack.length, 3);
    assert.equal(r.instructions, "# B");

    // B finishes -> pop to A with "inside_a_completed".
    const bDone = setState(r.memory, "done");
    r = runStackBlock(r.callStack, bDone, frameStore, files);
    assert.equal(r.callStack.stack.length, 2);
    assert.equal(r.instructions, "# A");
    assert.match(r.memory, /## State\ninside_a_completed/);

    // A finishes -> pop to strategy with "outer_completed".
    const aDone = setState(r.memory, "done");
    r = runStackBlock(r.callStack, aDone, frameStore, files);
    assert.equal(r.callStack.stack.length, 1);
    assert.equal(r.instructions, "# Strategy");
    assert.match(r.memory, /## State\nouter_completed/);

    // Strategy finishes -> halt.
    r = runStackBlock(r.callStack, setState(r.memory, "done"), frameStore, files);
    assert.equal(r.halt, true);
  });

  test("done + push in child memory: pop restores caller, child ## Push is NOT forwarded", () => {
    // Phase-2b semantics: after a pop, the caller's memory is read from the
    // caller's frame file (not the child's memory). Any ## Push the child had
    // is NOT forwarded to the caller — only ## Return entries are.
    // This test verifies that pop brings stack back to depth 1 and the child's
    // ## Push does NOT trigger a subsequent push from the caller's context.
    const files = { "dynamics/other.md": "# Other" };
    const { callStack, frameStore } = makeRoot("# Caller");

    // Set up: depth=1 (root + one dynamic frame with returnState "x").
    const cs2: CallStack = {
      nextCounter: 2,
      stack: [
        { returnState: "<root>", frameDir: "frames/f000-strategy" },
        { returnState: "x", frameDir: "frames/f001-other" },
      ],
    };
    // Caller's saved memory has NO ## Push (only child has ## Push).
    frameStore.set("frames/f000-strategy", { memory: "## State\nx", instructions: "# Caller" });
    frameStore.set("frames/f001-other", { memory: "## State\ndone\n## Push\ndynamics/other.md", instructions: "# Dynamic" });

    const r = runStackBlock(
      cs2,
      "## State\ndone\n## Push\ndynamics/other.md",
      frameStore,
      files,
    );
    // Pop fires; stack goes back to root only.
    // The child's ## Push is NOT forwarded to the caller.
    assert.equal(r.halt, false);
    assert.equal(r.callStack.stack.length, 1);
    assert.match(r.memory, /## State\nx_completed/);
    assert.equal(r.instructions, "# Caller");
  });

  test("push to missing file leaves stack untouched and strips ## Push from memory", () => {
    const { callStack, frameStore } = makeRoot("# Strategy");
    const r = runStackBlock(
      callStack,
      "## State\nfoo\n## Push\nno/such/file.md",
      frameStore,
      {},
    );
    assert.equal(r.halt, false);
    assert.equal(r.callStack.stack.length, 1);
    assert.equal(r.instructions, "# Strategy");
    assert.doesNotMatch(r.memory, /## Push/);
    assert.match(r.memory, /## State\nfoo/);
  });

  test("waiting_for_user inside a dynamic does not trigger a pop", () => {
    // State != "done", so no pop. Stack is preserved.
    const { callStack, frameStore } = makeRoot("# Caller");
    // Manually set up depth=1.
    const cs2: CallStack = {
      nextCounter: 2,
      stack: [
        { returnState: "<root>", frameDir: "frames/f000-strategy" },
        { returnState: "x", frameDir: "frames/f001-dyn" },
      ],
    };
    frameStore.set("frames/f001-dyn", { memory: "## State\nwaiting_for_user", instructions: "# Dynamic" });
    const r = runStackBlock(cs2, "## State\nwaiting_for_user", frameStore, {});
    assert.equal(r.halt, false);
    assert.equal(r.callStack.stack.length, 2);
    assert.equal(r.instructions, "# Dynamic");
    assert.match(r.memory, /## State\nwaiting_for_user/);
  });
});

// ---------------------------------------------------------------------------
// Direct applyPop unit tests (new Phase-2b signature)
// ---------------------------------------------------------------------------

describe("applyPop", () => {
  test("push then done pops back to caller with {state}_completed", () => {
    const files: Record<string, string> = {
      "dynamics/consult.md": "# Dynamic",
    };
    const cs0: CallStack = {
      nextCounter: 1,
      stack: [{ returnState: "<root>", frameDir: "frames/f000-strategy" }],
    };
    const callerMemory = "## State\nneeds_opinion\n## Push\ndynamics/consult.md";

    // Push.
    const pushed = applyPush(cs0, callerMemory, (p) => files[p] ?? null);
    assert.equal(pushed.ok, true);
    if (!pushed.ok) return;
    assert.equal(pushed.callStack.stack.length, 2);

    // Simulate the child running to done.
    const childMemory = "## State\ndone\n## Return\nresult: ok";
    // The caller's MEMORY as it exists on disk at the caller's frame.
    const callerMemoryOnDisk = pushed.callerMemoryAfter;

    const popped = applyPop(pushed.callStack, childMemory, (frameDir, file) => {
      if (frameDir === "frames/f000-strategy" && file === "MEMORY.md") {
        return callerMemoryOnDisk;
      }
      throw new Error(`unexpected read: ${frameDir}/${file}`);
    });

    assert.equal(popped.callStack.stack.length, 1);
    assert.equal(popped.callerFrameDir, "frames/f000-strategy");
    assert.match(popped.callerMemoryAfter, /## State\nneeds_opinion_completed/);
    assert.match(popped.callerMemoryAfter, /## Result\nok/);
    assert.equal(popped.events.length, 1);
    assert.equal(popped.events[0].returnState, "needs_opinion");
    assert.equal(popped.events[0].frameDir, "frames/f001-consult");
    assert.equal(popped.events[0].missingReturn, false);
    assert.deepEqual(popped.events[0].splicedKeys, ["result"]);
  });

  test("pop without ## Return succeeds and logs missingReturn", () => {
    const cs: CallStack = {
      nextCounter: 2,
      stack: [
        { returnState: "<root>", frameDir: "frames/f000-strategy" },
        { returnState: "foo", frameDir: "frames/f001-x" },
      ],
    };
    const childMemory = "## State\ndone";
    const popped = applyPop(cs, childMemory, () => "## State\nfoo\n");
    assert.equal(popped.callStack.stack.length, 1);
    assert.equal(popped.events[0].missingReturn, true);
    assert.deepEqual(popped.events[0].splicedKeys, []);
  });

  test("pop with malformed ## Return entries skips them and splices the rest", () => {
    const cs: CallStack = {
      nextCounter: 2,
      stack: [
        { returnState: "<root>", frameDir: "frames/f000-strategy" },
        { returnState: "foo", frameDir: "frames/f001-x" },
      ],
    };
    const childMemory = "## State\ndone\n## Return\nok: yes\nbroken-no-colon";
    const popped = applyPop(cs, childMemory, () => "## State\nfoo\n");
    assert.match(popped.callerMemoryAfter, /## Ok\nyes/);
    assert.deepEqual(popped.events[0].splicedKeys, ["ok"]);
    assert.deepEqual(popped.events[0].malformedLines, ["broken-no-colon"]);
  });

  test("pop never removes the root frame (depth 1 + done does NOT pop)", () => {
    const cs: CallStack = {
      nextCounter: 1,
      stack: [{ returnState: "<root>", frameDir: "frames/f000-strategy" }],
    };
    const childMemory = "## State\ndone";
    const popped = applyPop(cs, childMemory, () => "should not be called");
    // Root stays; pop loop exits because stack.length === 1.
    assert.equal(popped.callStack.stack.length, 1);
    assert.equal(popped.events.length, 0);
  });

  test("no-op when state is not done", () => {
    const cs: CallStack = {
      nextCounter: 2,
      stack: [
        { returnState: "<root>", frameDir: "frames/f000-strategy" },
        { returnState: "x", frameDir: "frames/f001-dyn" },
      ],
    };
    const popped = applyPop(cs, "## State\nrunning", () => "");
    assert.equal(popped.events.length, 0);
    assert.equal(popped.callStack.stack.length, 2);
    assert.equal(popped.callerMemoryAfter, "## State\nrunning");
  });

  test("cascade pop: both child and restored caller are done", () => {
    // Stack: root → frame1 → frame2
    // frame2 is done → pops to frame1 → frame1 gets state "frame1state_completed"
    // If frame1state_completed is also considered done (not typical, but test cascade):
    // The cascade loop checks: after pop, if NEW curMemory (frame1 updated) is also "done"
    // AND stack.length > 1, pops again.
    // For this test: frame1's memory after splice will have state "done" to trigger cascade.
    const cs: CallStack = {
      nextCounter: 3,
      stack: [
        { returnState: "<root>", frameDir: "frames/f000-strategy" },
        { returnState: "frame1state", frameDir: "frames/f001-a" },
        { returnState: "frame2state", frameDir: "frames/f002-b" },
      ],
    };
    const childMemory = "## State\ndone";
    // frame1's memory will be "## State\ndone" (pre-splice, the returnState_completed would be
    // "frame2state_completed", not "done"). To trigger another pop, we need the caller
    // after setState to also be "done".
    // setState sets state to "frame2state_completed", NOT "done", so cascade stops.
    // This test verifies cascade does NOT fire again for normal popping.
    const frame1Memory = "## State\nframe1state";
    const frame0Memory = "## State\n<root>";

    const popped = applyPop(cs, childMemory, (fd) => {
      if (fd === "frames/f001-a") return frame1Memory;
      if (fd === "frames/f000-strategy") return frame0Memory;
      throw new Error(`unexpected: ${fd}`);
    });

    // Only one pop (frame2 → frame1), because frame1 gets "frame2state_completed" not "done".
    assert.equal(popped.events.length, 1);
    assert.equal(popped.callStack.stack.length, 2);
    assert.match(popped.callerMemoryAfter, /## State\nframe2state_completed/);
  });
});

// ---------------------------------------------------------------------------
// Phase-4 retirement: game-team directory must be deleted (R35)
// ---------------------------------------------------------------------------

test("game-team directory is removed (R35 — Phase-4 retirement)", () => {
  const p = resolveGT(__dirnameGT, "../../interpreters/game-team");
  assert.equal(existsSyncGT(p), false, "interpreters/game-team should be deleted in Phase-4 retirement");
});
