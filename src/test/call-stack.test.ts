import { test, describe, beforeEach, afterEach } from "node:test";
import { strict as assert } from "node:assert";
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { tmpdir } from "node:os";
import { loadCallStack, saveCallStack, applyPop, applyPush, type StackEntry, type CallStack } from "../call-stack.js";

let dir: string;
let path: string;

beforeEach(() => {
  dir = mkdtempSync(resolve(tmpdir(), "turing-stack-"));
  path = resolve(dir, ".call-stack.json");
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("loadCallStack", () => {
  test("returns fresh stack when file does not exist", () => {
    const cs = loadCallStack(path);
    assert.equal(cs.stack.length, 1);
    assert.equal(cs.stack[0].returnState, "<root>");
    assert.equal(cs.nextCounter, 1);
  });

  test("returns fresh stack when file is empty", () => {
    writeFileSync(path, "", "utf-8");
    const cs = loadCallStack(path);
    assert.equal(cs.stack.length, 1);
    assert.equal(cs.stack[0].returnState, "<root>");
  });

  test("returns fresh stack when file has malformed JSON", () => {
    writeFileSync(path, "{not json", "utf-8");
    const cs = loadCallStack(path);
    assert.equal(cs.stack.length, 1);
  });

  test("returns fresh stack when JSON is not a CallStack shape", () => {
    writeFileSync(path, '{"x":1}', "utf-8");
    const cs = loadCallStack(path);
    assert.equal(cs.stack.length, 1);
  });

  test("loads a previously-saved CallStack", () => {
    const original: CallStack = {
      nextCounter: 3,
      stack: [
        { returnState: "<root>", frameDir: "frames/f000-strategy" },
        { returnState: "planning", frameDir: "frames/f001-consult" },
        { returnState: "needs_x", frameDir: "frames/f002-dynamic" },
      ],
    };
    writeFileSync(path, JSON.stringify(original), "utf-8");
    const loaded = loadCallStack(path);
    assert.deepEqual(loaded, original);
  });
});

describe("saveCallStack", () => {
  test("writes JSON round-trippable via loadCallStack", () => {
    const cs: CallStack = {
      nextCounter: 2,
      stack: [
        { returnState: "<root>", frameDir: "frames/f000-strategy" },
        { returnState: "a", frameDir: "frames/f001-dyn" },
      ],
    };
    saveCallStack(path, cs);
    assert.deepEqual(loadCallStack(path), cs);
  });

  test("writes minimal stack correctly", () => {
    const cs: CallStack = {
      nextCounter: 1,
      stack: [{ returnState: "<root>", frameDir: "frames/f000-strategy" }],
    };
    saveCallStack(path, cs);
    const raw = JSON.parse(readFileSync(path, "utf-8"));
    assert.equal(raw.nextCounter, 1);
    assert.equal(raw.stack.length, 1);
  });
});

describe("applyPop", () => {
  test("no-op when state is not done", () => {
    const cs: CallStack = {
      nextCounter: 2,
      stack: [
        { returnState: "<root>", frameDir: "frames/f000-strategy" },
        { returnState: "x", frameDir: "frames/f001-dyn" },
      ],
    };
    const r = applyPop(cs, "## State\nrunning", () => "## State\nx");
    assert.deepEqual(r.events, []);
    assert.equal(r.callStack.stack.length, 2);
    assert.equal(r.callerMemoryAfter, "## State\nrunning");
  });

  test("no-op when state is done but stack.length === 1 (root only)", () => {
    const cs: CallStack = {
      nextCounter: 1,
      stack: [{ returnState: "<root>", frameDir: "frames/f000-strategy" }],
    };
    const r = applyPop(cs, "## State\ndone", () => "should not be called");
    assert.deepEqual(r.events, []);
    assert.equal(r.callStack.stack.length, 1);
    // callerMemoryAfter is set to childMemory when no pops occur
    assert.equal(r.callerMemoryAfter, "## State\ndone");
  });

  test("single pop restores caller memory and sets state to {returnState}_completed", () => {
    const cs: CallStack = {
      nextCounter: 2,
      stack: [
        { returnState: "<root>", frameDir: "frames/f000-strategy" },
        { returnState: "planning", frameDir: "frames/f001-dyn" },
      ],
    };
    const callerMemory = "## State\nplanning\n## Last Action\nx";
    const r = applyPop(cs, "## State\ndone", () => callerMemory);
    assert.equal(r.callStack.stack.length, 1);
    assert.match(r.callerMemoryAfter, /^## State\nplanning_completed/);
    assert.match(r.callerMemoryAfter, /## Last Action\nx/);
    assert.equal(r.events.length, 1);
    assert.equal(r.events[0].returnState, "planning");
    assert.equal(r.events[0].depthAfter, 1);
    assert.equal(r.events[0].frameDir, "frames/f001-dyn");
    assert.equal(r.events[0].missingReturn, true);
  });

  test("does not mutate input callStack", () => {
    const cs: CallStack = {
      nextCounter: 2,
      stack: [
        { returnState: "<root>", frameDir: "frames/f000-strategy" },
        { returnState: "x", frameDir: "frames/f001-dyn" },
      ],
    };
    const original = JSON.stringify(cs);
    applyPop(cs, "## State\ndone", () => "## State\nx");
    assert.equal(JSON.stringify(cs), original);
  });

  test("single pop only — state becomes {returnState}_completed, not done, so loop exits", () => {
    const cs: CallStack = {
      nextCounter: 3,
      stack: [
        { returnState: "<root>", frameDir: "frames/f000-strategy" },
        { returnState: "outer", frameDir: "frames/f001-outer" },
        { returnState: "inner", frameDir: "frames/f002-inner" },
      ],
    };
    const innerCallerMemory = "## State\nouter";
    const r = applyPop(cs, "## State\ndone", (fd) => {
      if (fd === "frames/f001-outer") return innerCallerMemory;
      throw new Error(`unexpected: ${fd}`);
    });
    assert.equal(r.callStack.stack.length, 2);
    assert.match(r.callerMemoryAfter, /^## State\ninner_completed/);
    assert.equal(r.events.length, 1);
    assert.equal(r.events[0].returnState, "inner");
    assert.equal(r.events[0].depthAfter, 2);
  });

  test("## Return entries are spliced into caller memory", () => {
    const cs: CallStack = {
      nextCounter: 2,
      stack: [
        { returnState: "<root>", frameDir: "frames/f000-strategy" },
        { returnState: "waiting", frameDir: "frames/f001-dyn" },
      ],
    };
    const childMemory = "## State\ndone\n## Return\nresult: success\nscore: 42";
    const r = applyPop(cs, childMemory, () => "## State\nwaiting");
    assert.match(r.callerMemoryAfter, /## Result\nsuccess/);
    assert.match(r.callerMemoryAfter, /## Score\n42/);
    assert.deepEqual(r.events[0].splicedKeys, ["result", "score"]);
    assert.equal(r.events[0].missingReturn, false);
  });

  test("malformed ## Return lines are logged but valid entries still splice", () => {
    const cs: CallStack = {
      nextCounter: 2,
      stack: [
        { returnState: "<root>", frameDir: "frames/f000-strategy" },
        { returnState: "foo", frameDir: "frames/f001-x" },
      ],
    };
    const childMemory = "## State\ndone\n## Return\nok: yes\nbroken-no-colon";
    const r = applyPop(cs, childMemory, () => "## State\nfoo\n");
    assert.match(r.callerMemoryAfter, /## Ok\nyes/);
    assert.deepEqual(r.events[0].splicedKeys, ["ok"]);
    assert.deepEqual(r.events[0].malformedLines, ["broken-no-colon"]);
  });

  test("cascade pop fires when child's ## Return overrides caller state to done", () => {
    // This test documents the cascade-pop contract and the intermediate-frame
    // MEMORY loss caveat described in the applyPop JSDoc.
    //
    // Setup: 3-deep stack (root + mid + leaf).
    // The leaf's ## Return includes `state: done`.
    // spliceReturns treats "state" as a regular key and upserts ## State in the
    // mid-frame's MEMORY to "done" — overriding the "leaf_completed" that
    // setState wrote — which causes the while-loop to fire a second time.
    //
    // After cascade: stack reduces to [root] only, events.length === 2.
    // The FINAL caller (root) gets its MEMORY returned in callerMemoryAfter.
    // The INTERMEDIATE caller (mid) had its MEMORY computed inside the loop
    // but it is NOT returned — only the final caller's MEMORY is. This is the
    // intermediate-frame loss that runStackBlock warns about when events.length > 1.
    const cs: CallStack = {
      nextCounter: 3,
      stack: [
        { returnState: "<root>", frameDir: "frames/f000-strategy" },
        { returnState: "intermediate", frameDir: "frames/f001-mid" },
        { returnState: "leaf", frameDir: "frames/f002-leaf" },
      ],
    };

    // Child (leaf) signals done and passes back state: done in ## Return.
    // spliceReturns will capitalize "state" → "## State" and upsert it,
    // replacing the "leaf_completed" value that setState wrote into mid's MEMORY.
    const childMemory = "## State\ndone\n## Return\nstate: done";

    const r = applyPop(cs, childMemory, (frameDir) => {
      if (frameDir === "frames/f001-mid") {
        return "## State\nintermediate\n## Work\nsome work";
      }
      if (frameDir === "frames/f000-strategy") {
        return "## State\nroot_state\n## Root\nroot data";
      }
      throw new Error(`unexpected readFrame call for: ${frameDir}`);
    });

    // Cascade fired: both leaf and mid were popped in a single applyPop call.
    assert.equal(r.events.length, 2, "cascade should produce 2 pop events");

    // Stack reduced to root frame only.
    assert.equal(r.callStack.stack.length, 1);
    assert.equal(r.callStack.stack[0].frameDir, "frames/f000-strategy");

    // First event: leaf popped, mid becomes caller.
    assert.equal(r.events[0].returnState, "leaf");
    assert.equal(r.events[0].depthAfter, 2);
    assert.equal(r.events[0].frameDir, "frames/f002-leaf");

    // Second event: mid popped (because its spliced state became "done"), root becomes caller.
    assert.equal(r.events[1].returnState, "intermediate");
    assert.equal(r.events[1].depthAfter, 1);
    assert.equal(r.events[1].frameDir, "frames/f001-mid");

    // callerMemoryAfter is the FINAL caller's (root's) MEMORY after state transition.
    // Root's state was set to "intermediate_completed" by setState.
    assert.match(r.callerMemoryAfter, /^## State\nintermediate_completed/m);

    // The intermediate mid-frame's MEMORY (which had state overridden to "done"
    // by spliceReturns) was computed but is NOT present in any return value —
    // it was only used as the loop's "currentChildMemory" for the next iteration.
    // This is the intermediate-frame loss documented in the applyPop JSDoc.
  });
});

describe("applyPush", () => {
  function makeCs(depth = 0): CallStack {
    return {
      nextCounter: depth + 1,
      stack: [
        { returnState: "<root>", frameDir: "frames/f000-strategy" },
        ...Array.from({ length: depth }, (_, i) => ({
          returnState: `frame${i}`,
          frameDir: `frames/f${String(i + 1).padStart(3, "0")}-dyn`,
        })),
      ],
    };
  }

  test("reason 'no-push' when ## Push section is absent", () => {
    const r = applyPush(makeCs(), "## State\nfoo", () => "target");
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.reason, "no-push");
  });

  test("reason 'missing-target' and ## Push stripped when target reads as null", () => {
    const memory = "## State\nfoo\n## Push\nbad/path.md";
    const r = applyPush(makeCs(), memory, () => null);
    assert.equal(r.ok, false);
    if (!r.ok && r.reason === "missing-target") {
      assert.equal(r.target, "bad/path.md");
      assert.doesNotMatch(r.memory, /## Push/);
      assert.match(r.memory, /## State\nfoo/);
    }
  });

  test("successful push: saves returnState, returns childInstructions and childMemory", () => {
    const memory = "## State\nplanning\n## Push\noperators/consult.md";
    const r = applyPush(makeCs(), memory, (p) => {
      assert.equal(p, "operators/consult.md");
      return "# Dynamic";
    });

    assert.equal(r.ok, true);
    if (r.ok) {
      assert.equal(r.target, "operators/consult.md");
      assert.equal(r.callStack.stack.length, 2);
      assert.equal(r.callStack.stack[1].returnState, "planning");
      assert.equal(r.childInstructions, "# Dynamic");
      assert.equal(r.childMemory, "## State\nempty\n");
      assert.doesNotMatch(r.callerMemoryAfter, /## Push/);
    }
  });

  test("nested push: frame appended, prior frames preserved", () => {
    const cs = makeCs(1); // already 1 dynamic frame at depth 1
    const memory = "## State\ninner_task\n## Push\noperators/sub.md";
    const r = applyPush(cs, memory, () => "# Sub");

    assert.equal(r.ok, true);
    if (r.ok) {
      // root + 1 existing + 1 new = 3 total
      assert.equal(r.callStack.stack.length, 3);
      assert.equal(r.callStack.stack[1].returnState, "frame0");
      assert.equal(r.callStack.stack[2].returnState, "inner_task");
    }
  });

  test("does not mutate input callStack on success", () => {
    const cs = makeCs();
    const original = JSON.stringify(cs);
    applyPush(cs, "## State\nfoo\n## Push\ntgt.md", () => "c");
    assert.equal(JSON.stringify(cs), original);
  });
});
