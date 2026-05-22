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
  test("throws when file does not exist", () => {
    assert.throws(() => loadCallStack(path), /cannot read call stack/);
  });

  test("throws when file is empty", () => {
    writeFileSync(path, "", "utf-8");
    assert.throws(() => loadCallStack(path), /not valid JSON/);
  });

  test("throws when file has malformed JSON", () => {
    writeFileSync(path, "{not json", "utf-8");
    assert.throws(() => loadCallStack(path), /not valid JSON/);
  });

  test("throws when JSON shape is invalid", () => {
    writeFileSync(path, '{"x":1}', "utf-8");
    assert.throws(() => loadCallStack(path), /invalid shape/);
  });

  test("throws when stack is empty", () => {
    writeFileSync(path, '{"nextCounter":1,"stack":[]}', "utf-8");
    assert.throws(() => loadCallStack(path), /invalid shape/);
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
    assert.equal(r.events[0].hasReturn, false);
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

  test("## Return body is spliced into caller memory under ## Popped Return", () => {
    const cs: CallStack = {
      nextCounter: 2,
      stack: [
        { returnState: "<root>", frameDir: "frames/f000-strategy" },
        { returnState: "waiting", frameDir: "frames/f001-dyn" },
      ],
    };
    const childMemory = "## State\ndone\n## Return\nresult: success\nscore: 42";
    const r = applyPop(cs, childMemory, () => "## State\nwaiting");
    assert.match(r.callerMemoryAfter, /## Popped Return\nresult: success\nscore: 42/);
    // No per-key splay: no top-level ## Result or ## Score sections.
    assert.doesNotMatch(r.callerMemoryAfter, /^## Result\nsuccess/m);
    assert.doesNotMatch(r.callerMemoryAfter, /^## Score\n42/m);
    assert.equal(r.events[0].hasReturn, true);
  });

  test("a child's `state: done` in ## Return cannot inject ## State into caller (no cascade)", () => {
    // Regression: previously the per-key splay would write `## State\ndone`
    // into the caller, overriding the `<x>_completed` state and triggering a
    // second cascade-pop iteration, losing intermediate-frame MEMORIes.
    //
    // The fix is structural: the child's return body now lives verbatim inside
    // a single `## Popped Return` section in the caller. The line `state: done`
    // is body text, not a section header, so the caller's ## State parser
    // never sees it. This test pins the structural property.
    const cs: CallStack = {
      nextCounter: 3,
      stack: [
        { returnState: "<root>", frameDir: "frames/f000-strategy" },
        { returnState: "intermediate", frameDir: "frames/f001-mid" },
        { returnState: "leaf", frameDir: "frames/f002-leaf" },
      ],
    };

    // Child (leaf) signals done and tries to inject state: done in ## Return.
    const childMemory = "## State\ndone\n## Return\nstate: done\nverdict: pass";

    const r = applyPop(cs, childMemory, (frameDir) => {
      if (frameDir === "frames/f001-mid") {
        return "## State\nintermediate\n## Work\nsome work";
      }
      throw new Error(`unexpected readFrame call for: ${frameDir}`);
    });

    // No cascade: exactly one pop event.
    assert.equal(r.events.length, 1, "single section splice must prevent cascade");

    // Stack reduced to [root, mid] — mid was NOT popped a second time.
    assert.equal(r.callStack.stack.length, 2);
    assert.equal(r.callStack.stack[1].frameDir, "frames/f001-mid");

    // Mid frame's state is properly `leaf_completed` (setState's write
    // survived because the return body lives in ## Popped Return).
    assert.match(r.callerMemoryAfter, /^## State\nleaf_completed/m);

    // The entire return body sits verbatim under ## Popped Return.
    assert.match(r.callerMemoryAfter, /## Popped Return\nstate: done\nverdict: pass/);
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
