# Dynamics Stack — Refactor, Tests, and Docs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add comprehensive unit + integration tests for the operators/call-stack feature, refactor the push/pop handlers into pure testable transforms, and bring CLAUDE.md + README.md up to date with the new feature.

**Architecture:** Extract the push/pop per-cycle logic from `main.ts` into pure functions (`applyPush`, `applyPop`) in `call-stack.ts`. These take `{stack, memory, instructions}` plus an injected file-reader and return the new state — the shell keeps all file I/O. Tests use Node's built-in `node:test` runner (zero new deps). Docs add a "Dynamics" section wherever push/pop semantics, `.call-stack.json` persistence, or the `operators/` directory convention affect a reader's mental model.

**Tech Stack:** TypeScript 5.3, Node 21, `node:test` + `node:assert/strict`, existing `tsc` build.

**Scope exclusion:** Per user direction, interpreters (`interpreters/game-team`) are NOT touched in this plan — they will be rebuilt against the new stack logic separately.

---

## File Structure

### Created
- `src/test/memory.test.ts` — pure-function tests for `memory.ts`
- `src/test/call-stack.test.ts` — persistence + pure-transform tests for `call-stack.ts`
- `src/test/stack-integration.test.ts` — multi-cycle scenarios composing push/pop
- `src/test/prompt.test.ts` — `getSystemPrompt` variants, `getUserPrompt` inlining

### Modified
- `src/call-stack.ts` — extended with `applyPush`, `applyPop`, result types; persistence unchanged
- `src/main.ts` — `handlePush`/`handlePop` replaced by calls to the pure transforms; stack block in the cycle loop restructured around the new return values
- `src/memory.ts` — no code changes (existing functions get test coverage)
- `package.json` — add `"test"` script
- `CLAUDE.md` — Source Files list, Well-Known States, Instance Layout refreshed; new `## Dynamics` section
- `README.md` — new `## Dynamics` section + Instance Structure refresh

### Not modified (explicitly out of scope)
- `interpreters/**`
- Providers (`src/providers/*`)
- `logger.ts`, `git.ts`, `telegram.ts`, `tools.ts`, `errors.ts`, `server.ts`

---

## Task 1: Test infrastructure

**Files:**
- Modify: `package.json`
- Create: `src/test/smoke.test.ts`

- [ ] **Step 1: Add `test` script to `package.json`**

Edit `package.json` `"scripts"` block to add:
```json
"test": "tsc && node --test dist/test/"
```

Final `scripts` section:
```json
"scripts": {
  "build": "tsc",
  "start": "node dist/main.js",
  "visualize": "node dist/server.js",
  "test": "tsc && node --test dist/test/"
}
```

- [ ] **Step 2: Write a smoke test to verify the runner works**

Create `src/test/smoke.test.ts`:
```typescript
import { test } from "node:test";
import { strict as assert } from "node:assert";

test("smoke: test runner works", () => {
  assert.equal(1 + 1, 2);
});
```

- [ ] **Step 3: Run it**

```bash
npm test
```
Expected: `# pass 1`, `# fail 0`, exit 0.

- [ ] **Step 4: Commit**

```bash
git add package.json src/test/smoke.test.ts
git commit -m "test: add node:test infrastructure"
```

---

## Task 2: Pin tests for existing memory.ts pure functions

These functions already work; tests lock in current behavior so later changes can't regress.

**Files:**
- Create: `src/test/memory.test.ts`

- [ ] **Step 1: Write tests for `parseState`, `setState`, `getAnswersSection`, `writeAnswer`**

Create `src/test/memory.test.ts`:
```typescript
import { test, describe } from "node:test";
import { strict as assert } from "node:assert";
import {
  parseState, setState, getAnswersSection, writeAnswer,
  parsePendingQuestions, parsePush, removePush,
} from "../memory.js";

describe("parseState", () => {
  test("extracts state from ## State section", () => {
    assert.equal(parseState("## State\nfoo\n## Other\nbar"), "foo");
  });

  test("returns empty string when no ## State section", () => {
    assert.equal(parseState("## Other\nbar"), "");
  });

  test("trims trailing whitespace", () => {
    assert.equal(parseState("## State\nfoo   "), "foo");
  });
});

describe("setState", () => {
  test("replaces existing state", () => {
    const out = setState("## State\nfoo\n## Other\nbar", "baz");
    assert.match(out, /^## State\nbaz\n## Other\nbar$/);
  });

  test("no-op when ## State is missing (returns unchanged)", () => {
    const input = "## Other\nbar";
    assert.equal(setState(input, "baz"), input);
  });
});

describe("getAnswersSection", () => {
  test("returns content between ## Answers and next heading", () => {
    const mem = "## State\nfoo\n## Answers\n- **Q1**: yes\n## Other\n";
    assert.equal(getAnswersSection(mem), "- **Q1**: yes\n");
  });

  test("returns content to end of file if no trailing heading", () => {
    const mem = "## State\nfoo\n## Answers\n- **Q1**: yes\n";
    assert.equal(getAnswersSection(mem), "- **Q1**: yes\n");
  });

  test("returns empty string when no ## Answers", () => {
    assert.equal(getAnswersSection("## State\nfoo"), "");
  });
});

describe("writeAnswer", () => {
  test("appends to existing ## Answers", () => {
    const mem = "## State\nfoo\n## Answers\n- **Q1**: yes\n";
    const out = writeAnswer(mem, "Q2", "no");
    assert.match(out, /## Answers\n- \*\*Q2\*\*: no\n- \*\*Q1\*\*: yes/);
  });

  test("creates ## Answers section when missing", () => {
    const mem = "## State\nfoo";
    const out = writeAnswer(mem, "Q1", "yes");
    assert.match(out, /## Answers\n- \*\*Q1\*\*: yes\n/);
  });
});
```

- [ ] **Step 2: Add tests for `parsePendingQuestions` (all four label formats + multi-line + section-suffix)**

Append to `src/test/memory.test.ts`:
```typescript
describe("parsePendingQuestions", () => {
  test("parses bold-label format", () => {
    const mem = "## Pending Questions\n- **Q1**: first\n- **Q2**: second\n";
    const qs = parsePendingQuestions(mem);
    assert.deepEqual(qs, [
      { id: "Q1", question: "first" },
      { id: "Q2", question: "second" },
    ]);
  });

  test("parses underscore-label format", () => {
    const qs = parsePendingQuestions("## Pending Questions\n- __Q1__: x\n");
    assert.deepEqual(qs, [{ id: "Q1", question: "x" }]);
  });

  test("parses plain Q-label format", () => {
    const qs = parsePendingQuestions("## Pending Questions\n- Q1: x\n");
    assert.deepEqual(qs, [{ id: "Q1", question: "x" }]);
  });

  test("parses generic label format as fallback", () => {
    const qs = parsePendingQuestions("## Pending Questions\n- label: x\n");
    assert.deepEqual(qs, [{ id: "label", question: "x" }]);
  });

  test("handles multi-line question bodies", () => {
    const mem = "## Pending Questions\n- **Q1**: first line\n  continuation\n- **Q2**: second\n";
    const qs = parsePendingQuestions(mem);
    assert.equal(qs.length, 2);
    assert.match(qs[0].question, /first line[\s\S]*continuation/);
    assert.equal(qs[1].question, "second");
  });

  test("accepts section header with suffix", () => {
    const mem = "## Pending Questions - Choose Approach\n- **Q1**: x\n";
    const qs = parsePendingQuestions(mem);
    assert.deepEqual(qs, [{ id: "Q1", question: "x" }]);
  });

  test("stops at next ## heading", () => {
    const mem = "## Pending Questions\n- **Q1**: x\n## Answers\n- **Q1**: y\n";
    const qs = parsePendingQuestions(mem);
    assert.deepEqual(qs, [{ id: "Q1", question: "x" }]);
  });

  test("returns [] when section missing", () => {
    assert.deepEqual(parsePendingQuestions("## State\nfoo"), []);
  });
});
```

- [ ] **Step 3: Run tests**

```bash
npm test
```
Expected: all new tests pass, `# fail 0`.

- [ ] **Step 4: Commit**

```bash
git add src/test/memory.test.ts
git commit -m "test: pin memory.ts parser/writer behaviour"
```

---

## Task 3: Tests for parsePush / removePush

These are the new MEMORY helpers added for the stack feature; they had no coverage.

**Files:**
- Modify: `src/test/memory.test.ts`

- [ ] **Step 1: Append push-parser tests**

Append to `src/test/memory.test.ts`:
```typescript
describe("parsePush", () => {
  test("extracts path after ## Push header", () => {
    assert.equal(parsePush("## State\nfoo\n## Push\noperators/consult.md"), "operators/consult.md");
  });

  test("trims whitespace from path", () => {
    assert.equal(parsePush("## Push\n  operators/consult.md  \n"), "operators/consult.md");
  });

  test("returns null when ## Push is missing", () => {
    assert.equal(parsePush("## State\nfoo"), null);
  });

  test("returns null for empty push body", () => {
    // '## Push\n' with nothing after — regex requires at least one char
    assert.equal(parsePush("## State\nfoo\n## Push\n"), null);
  });
});

describe("removePush", () => {
  test("removes ## Push section in the middle", () => {
    const mem = "## State\nfoo\n## Push\npath\n## Other\nx";
    assert.equal(removePush(mem), "## State\nfoo\n## Other\nx");
  });

  test("removes ## Push section at end of file", () => {
    const mem = "## State\nfoo\n## Push\npath";
    const out = removePush(mem);
    assert.match(out, /^## State\nfoo\s*$/);
  });

  test("removes ## Push even when followed by blank line + next section", () => {
    const mem = "## State\nfoo\n## Push\npath\n\n## Other\nx";
    const out = removePush(mem);
    assert.match(out, /## State\nfoo/);
    assert.match(out, /## Other\nx/);
    assert.doesNotMatch(out, /## Push/);
  });

  test("no-op when no ## Push section present", () => {
    const mem = "## State\nfoo\n## Other\nx";
    assert.equal(removePush(mem), mem);
  });
});
```

- [ ] **Step 2: Run tests**

```bash
npm test
```
Expected: all pass.

- [ ] **Step 3: Commit**

```bash
git add src/test/memory.test.ts
git commit -m "test: cover parsePush/removePush"
```

---

## Task 4: Tests for call-stack persistence

**Files:**
- Create: `src/test/call-stack.test.ts`

- [ ] **Step 1: Write persistence tests**

Create `src/test/call-stack.test.ts`:
```typescript
import { test, describe, beforeEach, afterEach } from "node:test";
import { strict as assert } from "node:assert";
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { tmpdir } from "node:os";
import { loadCallStack, saveCallStack, type StackEntry } from "../call-stack.js";

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
  test("returns [] when file does not exist", () => {
    assert.deepEqual(loadCallStack(path), []);
  });

  test("returns [] when file is empty", () => {
    writeFileSync(path, "", "utf-8");
    assert.deepEqual(loadCallStack(path), []);
  });

  test("returns [] when file has malformed JSON", () => {
    writeFileSync(path, "{not json", "utf-8");
    assert.deepEqual(loadCallStack(path), []);
  });

  test("returns [] when JSON is not an array", () => {
    writeFileSync(path, '{"x":1}', "utf-8");
    assert.deepEqual(loadCallStack(path), []);
  });

  test("loads a previously-saved stack", () => {
    const stack: StackEntry[] = [
      { returnState: "planning", instructions: "# Strategy\n..." },
      { returnState: "needs_x", instructions: "# Dynamic\n..." },
    ];
    writeFileSync(path, JSON.stringify(stack), "utf-8");
    assert.deepEqual(loadCallStack(path), stack);
  });
});

describe("saveCallStack", () => {
  test("writes JSON round-trippable via loadCallStack", () => {
    const stack: StackEntry[] = [
      { returnState: "a", instructions: "one" },
      { returnState: "b", instructions: "two" },
    ];
    saveCallStack(path, stack);
    assert.deepEqual(loadCallStack(path), stack);
  });

  test("writes empty array as []", () => {
    saveCallStack(path, []);
    assert.equal(readFileSync(path, "utf-8").trim(), "[]");
  });
});
```

- [ ] **Step 2: Run tests**

```bash
npm test
```
Expected: all pass. (Note: `loadCallStack` currently does NOT guard against non-array JSON — this test will fail. That's intentional — it's fixed in Task 5.)

Expected failures:
- `returns [] when JSON is not an array` — FAIL (current code returns the object verbatim)

- [ ] **Step 3: Fix `loadCallStack` to guard non-array JSON**

Replace the body of `loadCallStack` in `src/call-stack.ts`:
```typescript
export function loadCallStack(path: string): StackEntry[] {
  try {
    const parsed = JSON.parse(readFileSync(path, "utf-8"));
    return Array.isArray(parsed) ? parsed : [];
  } catch { return []; }
}
```

- [ ] **Step 4: Run tests — expect all pass**

```bash
npm test
```

- [ ] **Step 5: Commit**

```bash
git add src/test/call-stack.test.ts src/call-stack.ts
git commit -m "test: cover call-stack persistence; guard non-array JSON"
```

---

## Task 5: TDD — `applyPop` pure transform

**Files:**
- Modify: `src/call-stack.ts`
- Modify: `src/test/call-stack.test.ts`
- Modify: `src/memory.ts` (no changes — just importing from it)

- [ ] **Step 1: Write failing tests for `applyPop`**

Append to `src/test/call-stack.test.ts`:
```typescript
import { applyPop } from "../call-stack.js";

describe("applyPop", () => {
  test("no-op when state is not done", () => {
    const stack: StackEntry[] = [{ returnState: "x", instructions: "old" }];
    const r = applyPop(stack, "## State\nrunning", "current");
    assert.deepEqual(r.stack, stack);
    assert.equal(r.memory, "## State\nrunning");
    assert.equal(r.instructions, "current");
    assert.deepEqual(r.events, []);
  });

  test("no-op when state is done but stack is empty", () => {
    const r = applyPop([], "## State\ndone", "current");
    assert.deepEqual(r.stack, []);
    assert.equal(r.memory, "## State\ndone");
    assert.equal(r.instructions, "current");
    assert.deepEqual(r.events, []);
  });

  test("single pop restores caller instructions and sets state to {returnState}_completed", () => {
    const stack: StackEntry[] = [{ returnState: "planning", instructions: "# Strategy" }];
    const r = applyPop(stack, "## State\ndone\n## Last Action\nx", "# Dynamic");
    assert.deepEqual(r.stack, []);
    assert.match(r.memory, /^## State\nplanning_completed/);
    assert.match(r.memory, /## Last Action\nx/);
    assert.equal(r.instructions, "# Strategy");
    assert.deepEqual(r.events, [{ returnState: "planning", depthAfter: 0 }]);
  });

  test("does not mutate input stack", () => {
    const stack: StackEntry[] = [{ returnState: "x", instructions: "a" }];
    applyPop(stack, "## State\ndone", "b");
    assert.equal(stack.length, 1);
  });

  test("cascade-pops while state remains done (if caller's saved state is also done — unusual but safe)", () => {
    // If a caller pushed from state "done" (unusual), after pop state becomes "done_completed" — NOT done.
    // Normal case: one frame pops, and state changes to "x_completed" so the loop exits.
    const stack: StackEntry[] = [
      { returnState: "outer", instructions: "# Outer" },
      { returnState: "inner", instructions: "# Inner" },
    ];
    const r = applyPop(stack, "## State\ndone", "# Current");
    // Single pop: state becomes inner_completed (not "done"), so loop exits.
    assert.equal(r.stack.length, 1);
    assert.equal(r.instructions, "# Inner");
    assert.match(r.memory, /^## State\ninner_completed/);
    assert.deepEqual(r.events, [{ returnState: "inner", depthAfter: 1 }]);
  });
});
```

- [ ] **Step 2: Run tests — expect failure**

```bash
npm test
```
Expected: `applyPop is not exported`. Suite fails at import.

- [ ] **Step 3: Implement `applyPop` in `src/call-stack.ts`**

Replace the full contents of `src/call-stack.ts` with:
```typescript
/**
 * call-stack.ts — Instruction call stack: persistence and per-cycle transforms.
 *
 * The call stack enables hierarchical instruction dispatch: a running
 * instruction set can "push" an operator (reusable instruction file), and
 * the shell automatically restores the caller on "pop" (when the operator
 * sets state to "done").
 *
 * The push/pop transforms are pure — no file I/O — so stack semantics can
 * be tested in isolation. The shell writes the results to disk.
 */
import { readFileSync, writeFileSync } from "fs";
import { parseState, parsePush, removePush, setState } from "./memory.js";

export type StackEntry = { returnState: string; instructions: string };

// --- Persistence ---

export function loadCallStack(path: string): StackEntry[] {
  try {
    const parsed = JSON.parse(readFileSync(path, "utf-8"));
    return Array.isArray(parsed) ? parsed : [];
  } catch { return []; }
}

export function saveCallStack(path: string, stack: StackEntry[]): void {
  writeFileSync(path, JSON.stringify(stack, null, 2), "utf-8");
}

// --- Pure transforms ---

export type PopEvent = { returnState: string; depthAfter: number };

export type PopResult = {
  stack: StackEntry[];
  memory: string;
  instructions: string;
  events: PopEvent[];
};

/**
 * Cascade-pop while state is "done" and the stack is non-empty.
 *
 * Each pop restores the caller's instructions and sets the caller's state
 * to "{returnState}_completed" (so the caller's entry condition for that
 * state does not immediately re-fire).
 */
export function applyPop(
  stack: StackEntry[],
  memory: string,
  instructions: string,
): PopResult {
  const newStack = [...stack];
  const events: PopEvent[] = [];
  let curMemory = memory;
  let curInstructions = instructions;

  while (parseState(curMemory) === "done" && newStack.length > 0) {
    const entry = newStack.pop()!;
    curInstructions = entry.instructions;
    curMemory = setState(curMemory, entry.returnState + "_completed");
    events.push({ returnState: entry.returnState, depthAfter: newStack.length });
  }

  return { stack: newStack, memory: curMemory, instructions: curInstructions, events };
}
```

- [ ] **Step 4: Run tests — expect pass**

```bash
npm test
```
Expected: all `applyPop` tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/call-stack.ts src/test/call-stack.test.ts
git commit -m "feat: extract applyPop as pure transform"
```

---

## Task 6: TDD — `applyPush` pure transform

**Files:**
- Modify: `src/call-stack.ts`
- Modify: `src/test/call-stack.test.ts`

- [ ] **Step 1: Write failing tests for `applyPush`**

Append to `src/test/call-stack.test.ts`:
```typescript
import { applyPush } from "../call-stack.js";

describe("applyPush", () => {
  test("reason 'no-push' when ## Push section is absent", () => {
    const r = applyPush([], "## State\nfoo", "current", () => "target");
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.reason, "no-push");
  });

  test("reason 'missing-target' and ## Push stripped when target reads as null", () => {
    const memory = "## State\nfoo\n## Push\nbad/path.md";
    const r = applyPush([], memory, "current", () => null);
    assert.equal(r.ok, false);
    if (!r.ok && r.reason === "missing-target") {
      assert.equal(r.target, "bad/path.md");
      assert.doesNotMatch(r.memory, /## Push/);
      assert.match(r.memory, /## State\nfoo/);
    }
  });

  test("successful push: saves caller, swaps instructions, sets state to empty, removes ## Push", () => {
    const memory = "## State\nplanning\n## Push\noperators/consult.md";
    const r = applyPush([], memory, "# Strategy", (p) => {
      assert.equal(p, "operators/consult.md");
      return "# Dynamic";
    });

    assert.equal(r.ok, true);
    if (r.ok) {
      assert.equal(r.target, "operators/consult.md");
      assert.equal(r.stack.length, 1);
      assert.deepEqual(r.stack[0], { returnState: "planning", instructions: "# Strategy" });
      assert.equal(r.instructions, "# Dynamic");
      assert.match(r.memory, /^## State\nempty/);
      assert.doesNotMatch(r.memory, /## Push/);
    }
  });

  test("nested push: frame appended, prior frames preserved", () => {
    const existing: StackEntry[] = [{ returnState: "outer", instructions: "# Outer" }];
    const memory = "## State\ninner_task\n## Push\noperators/sub.md";
    const r = applyPush(existing, memory, "# Inner", () => "# Sub");

    assert.equal(r.ok, true);
    if (r.ok) {
      assert.equal(r.stack.length, 2);
      assert.deepEqual(r.stack[0], { returnState: "outer", instructions: "# Outer" });
      assert.deepEqual(r.stack[1], { returnState: "inner_task", instructions: "# Inner" });
    }
  });

  test("does not mutate input stack on success", () => {
    const stack: StackEntry[] = [{ returnState: "x", instructions: "a" }];
    applyPush(stack, "## State\nfoo\n## Push\ntgt.md", "b", () => "c");
    assert.equal(stack.length, 1);
  });
});
```

- [ ] **Step 2: Run tests — expect failure**

```bash
npm test
```
Expected: `applyPush is not exported`.

- [ ] **Step 3: Implement `applyPush` in `src/call-stack.ts`**

Append to `src/call-stack.ts`:
```typescript
export type PushResult =
  | {
      ok: true;
      stack: StackEntry[];
      memory: string;
      instructions: string;
      target: string;
    }
  | { ok: false; memory: string; reason: "no-push" }
  | { ok: false; memory: string; reason: "missing-target"; target: string };

/**
 * Handle a ## Push in MEMORY if present.
 *
 * On success: saves {returnState, instructions} onto the stack, replaces
 * instructions with the target file's contents, strips ## Push, and sets
 * state to "empty" so the operator starts fresh.
 *
 * On missing target: returns memory with ## Push stripped so the LLM
 * doesn't retry the same bad push every cycle; the caller logs the error.
 *
 * `readTarget` returns null for missing or empty files; otherwise the
 * target's content.
 */
export function applyPush(
  stack: StackEntry[],
  memory: string,
  instructions: string,
  readTarget: (path: string) => string | null,
): PushResult {
  const target = parsePush(memory);
  if (!target) return { ok: false, memory, reason: "no-push" };

  const targetContent = readTarget(target);
  if (!targetContent) {
    return { ok: false, memory: removePush(memory), reason: "missing-target", target };
  }

  const returnState = parseState(memory);
  const newStack = [...stack, { returnState, instructions }];
  const newMemory = setState(removePush(memory), "empty");

  return { ok: true, stack: newStack, memory: newMemory, instructions: targetContent, target };
}
```

- [ ] **Step 4: Run tests — expect pass**

```bash
npm test
```

- [ ] **Step 5: Commit**

```bash
git add src/call-stack.ts src/test/call-stack.test.ts
git commit -m "feat: extract applyPush as pure transform"
```

---

## Task 7: Refactor `main.ts` to use the pure transforms

**Files:**
- Modify: `src/main.ts`

- [ ] **Step 1: Remove the old `handlePush`/`handlePop` helpers and rewire the cycle loop**

In `src/main.ts`, update the import block from `call-stack.js`:
```typescript
import {
  loadCallStack, saveCallStack, applyPop, applyPush,
  type StackEntry,
} from "./call-stack.js";
```

Remove the unused imports (`parsePush`, `removePush`) from the `./memory.js` import — they are no longer referenced in `main.ts`:
```typescript
import {
  parseState, parsePendingQuestions, getAnswersSection,
  writeAnswer, setState, type PendingQuestion,
} from "./memory.js";
```

Delete the entire `// --- Call stack helpers ---` section (the `handlePop` and `handlePush` functions, ~36 lines between `function handleNoMatch` and `// --- Main loop ---`).

Replace the stack-management block at the top of the `for (let cycle...)` loop:

**Before** (delete):
```typescript
    // Deterministic stack management (before LLM invocation)
    if (getMemoryState() === "done") {
      if (callStack.length > 0) {
        handlePop(callStack);
      } else {
        log(`\nMachine halted: done`);
        return;
      }
    }
    if (parsePush(readFile(MEMORY_PATH))) {
      handlePush(callStack);
    }
```

**After** (insert in the same place):
```typescript
    // Deterministic stack management (before LLM invocation)
    {
      const popped = applyPop(callStack, readFile(MEMORY_PATH), readFile(INSTRUCTIONS_PATH));
      if (popped.events.length > 0) {
        writeFileSync(MEMORY_PATH, popped.memory, "utf-8");
        writeFileSync(INSTRUCTIONS_PATH, popped.instructions, "utf-8");
        callStack.length = 0;
        callStack.push(...popped.stack);
        saveCallStack(CALL_STACK_PATH, callStack);
        for (const ev of popped.events) {
          log(`  [pop] \u2192 ${ev.returnState}_completed (depth ${ev.depthAfter})`);
        }
      }

      if (getMemoryState() === "done" && callStack.length === 0) {
        log(`\nMachine halted: done`);
        return;
      }

      const pushed = applyPush(
        callStack,
        readFile(MEMORY_PATH),
        readFile(INSTRUCTIONS_PATH),
        (p) => {
          const content = readFile(resolve(BASE_DIR, p));
          return content || null;
        },
      );
      if (pushed.ok) {
        writeFileSync(MEMORY_PATH, pushed.memory, "utf-8");
        writeFileSync(INSTRUCTIONS_PATH, pushed.instructions, "utf-8");
        callStack.length = 0;
        callStack.push(...pushed.stack);
        saveCallStack(CALL_STACK_PATH, callStack);
        log(`  [push] ${pushed.target} (depth ${callStack.length})`);
      } else if (pushed.reason === "missing-target") {
        writeFileSync(MEMORY_PATH, pushed.memory, "utf-8");
        log(`  [push] ERROR: ${pushed.target} not found or empty, skipping`);
      }
    }
```

Note: `StackEntry` is imported for type completeness even if `main.ts` no longer references it directly — if the linter complains, drop it. Keep the `resolve` import from `node:path`; it's already present.

- [ ] **Step 2: Build**

```bash
npm run build
```
Expected: no TypeScript errors.

- [ ] **Step 3: Run full test suite**

```bash
npm test
```
Expected: all tests still pass. (Existing memory/stack tests cover the same semantics; if something broke, a test fails.)

- [ ] **Step 4: Commit**

```bash
git add src/main.ts
git commit -m "refactor: use applyPush/applyPop pure transforms in main loop"
```

---

## Task 8: Integration test — multi-cycle push/pop scenarios

**Files:**
- Create: `src/test/stack-integration.test.ts`

- [ ] **Step 1: Write integration tests that compose the transforms across simulated cycles**

Create `src/test/stack-integration.test.ts`:
```typescript
import { test, describe } from "node:test";
import { strict as assert } from "node:assert";
import { applyPop, applyPush, type StackEntry } from "../call-stack.js";
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

  test("push then done pops back to caller", () => {
    const files = { "operators/consult.md": "# Dynamic" };

    // Cycle 1: caller writes ## Push; block pushes it.
    const c1 = runStackBlock(
      [],
      "## State\nneeds_opinion\n## Push\noperators/consult.md",
      "# Strategy",
      files,
    );
    assert.equal(c1.halt, false);
    assert.equal(c1.stack.length, 1);
    assert.equal(c1.instructions, "# Dynamic");
    assert.match(c1.memory, /## State\nempty/);

    // Cycle 2: operator runs, eventually sets state=done.
    const memAfterDynamic = setState(c1.memory, "done");

    // Cycle 3 (pre-LLM block): should pop back to caller.
    const c3 = runStackBlock(c1.stack, memAfterDynamic, c1.instructions, files);
    assert.equal(c3.halt, false);
    assert.equal(c3.stack.length, 0);
    assert.equal(c3.instructions, "# Strategy");
    assert.match(c3.memory, /## State\nneeds_opinion_completed/);
  });

  test("nested push: outer → inner → pop → pop → halt", () => {
    const files = {
      "operators/a.md": "# A",
      "operators/b.md": "# B",
    };

    // Outer pushes A.
    let r = runStackBlock([], "## State\nouter\n## Push\noperators/a.md", "# Strategy", files);
    assert.equal(r.stack.length, 1);
    assert.equal(r.instructions, "# A");

    // Inside A, push B.
    const memInA = setState(r.memory, "inside_a");
    const memInAwithPush = memInA + "\n## Push\noperators/b.md";
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

  test("done + push in the same cycle: pop runs first, push is evaluated against restored caller", () => {
    // Caller's saved state was "x"; operator sets state=done AND writes ## Push.
    // Expected main.ts behaviour: pop restores caller (state -> x_completed),
    // then push fires from the caller's context onto a fresh frame.
    const files = { "operators/other.md": "# Other" };
    const stack: StackEntry[] = [{ returnState: "x", instructions: "# Caller" }];

    const r = runStackBlock(
      stack,
      "## State\ndone\n## Push\noperators/other.md",
      "# Dynamic",
      files,
    );
    assert.equal(r.halt, false);
    assert.equal(r.stack.length, 1);
    // The new frame on the stack should be the caller, with returnState=x_completed
    // (because after the pop, caller's state was x_completed when push fired).
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
});
```

- [ ] **Step 2: Run tests — expect pass**

```bash
npm test
```

- [ ] **Step 3: Commit**

```bash
git add src/test/stack-integration.test.ts
git commit -m "test: add stack integration scenarios"
```

---

## Task 9: Tests for prompt.ts

**Files:**
- Create: `src/test/prompt.test.ts`

- [ ] **Step 1: Write tests**

Create `src/test/prompt.test.ts`:
```typescript
import { test, describe, beforeEach, afterEach } from "node:test";
import { strict as assert } from "node:assert";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { tmpdir } from "node:os";
import { getSystemPrompt, getUserPrompt } from "../prompt.js";

describe("getSystemPrompt", () => {
  const origStateful = process.env.TURING_STATEFUL;
  afterEach(() => {
    if (origStateful === undefined) delete process.env.TURING_STATEFUL;
    else process.env.TURING_STATEFUL = origStateful;
  });

  test("api provider: base prompt includes Dynamics section and API_TOOLS_SECTION", () => {
    delete process.env.TURING_STATEFUL;
    const p = getSystemPrompt("api");
    assert.match(p, /# Operators \(Push\/Pop\)/);
    assert.match(p, /## Push\n[\s\S]*operators\/consult\.md/);
    assert.match(p, /\*\*bash\*\*: Run a shell command/);
  });

  test("claude-code provider: includes CC_TOOLS_SECTION instead of API_TOOLS_SECTION", () => {
    delete process.env.TURING_STATEFUL;
    const p = getSystemPrompt("claude-code");
    assert.match(p, /# Cycle discipline/);
    assert.doesNotMatch(p, /\*\*update_instructions\*\*:/);
  });

  test("ollama provider: returns the compact Ollama-specific prompt with operators", () => {
    delete process.env.TURING_STATEFUL;
    const p = getSystemPrompt("ollama");
    assert.match(p, /You are a Turing machine/);
    assert.match(p, /## Push/);
    assert.doesNotMatch(p, /# Dynamics \(Push\/Pop\)/); // compact form, no heading
  });

  test("stateful mode overrides provider and returns STATEFUL prompt", () => {
    process.env.TURING_STATEFUL = "1";
    const p = getSystemPrompt("api");
    assert.match(p, /===SYSCALLS===/);
    assert.match(p, /# Operators \(Push\/Pop\)/);
  });
});

describe("getUserPrompt", () => {
  let dir: string;
  let memoryPath: string;
  let instructionsPath: string;

  beforeEach(() => {
    dir = mkdtempSync(resolve(tmpdir(), "turing-prompt-"));
    memoryPath = resolve(dir, "MEMORY.md");
    instructionsPath = resolve(dir, "INSTRUCTIONS.md");
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
    delete process.env.TURING_STATEFUL;
  });

  test("inlines MEMORY and INSTRUCTIONS content", () => {
    writeFileSync(memoryPath, "## State\nfoo", "utf-8");
    writeFileSync(instructionsPath, "# Strategy\n...", "utf-8");
    const p = getUserPrompt(memoryPath, instructionsPath, "api");
    assert.match(p, /<MEMORY>\n## State\nfoo\n<\/MEMORY>/);
    assert.match(p, /<INSTRUCTIONS>\n# Strategy\n\.\.\.\n<\/INSTRUCTIONS>/);
    assert.match(p, /Execute the next cycle\.$/);
  });

  test("shows (empty) when MEMORY or INSTRUCTIONS file missing", () => {
    const p = getUserPrompt(memoryPath, instructionsPath, "api");
    assert.match(p, /<MEMORY>\n\(empty\)\n<\/MEMORY>/);
    assert.match(p, /<INSTRUCTIONS>\n\(empty\)\n<\/INSTRUCTIONS>/);
  });

  test("ollama variant appends tool-call nudge", () => {
    writeFileSync(memoryPath, "## State\nfoo", "utf-8");
    writeFileSync(instructionsPath, "# Strategy", "utf-8");
    const p = getUserPrompt(memoryPath, instructionsPath, "ollama");
    assert.match(p, /You MUST respond with tool calls only/);
  });

  test("stateful mode includes SYSCALLS block", () => {
    process.env.TURING_STATEFUL = "1";
    writeFileSync(memoryPath, "## State\nfoo", "utf-8");
    writeFileSync(instructionsPath, "# Strategy", "utf-8");
    writeFileSync(resolve(dir, "SYSCALLS.md"), "## Result 1: bash\nok", "utf-8");
    const p = getUserPrompt(memoryPath, instructionsPath, "api");
    assert.match(p, /<SYSCALLS>\n## Result 1: bash\nok\n<\/SYSCALLS>/);
    assert.match(p, /===SYSCALLS===/);
  });
});
```

- [ ] **Step 2: Run tests — expect pass**

```bash
npm test
```

- [ ] **Step 3: Commit**

```bash
git add src/test/prompt.test.ts
git commit -m "test: cover prompt construction"
```

---

## Task 10: Update CLAUDE.md

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Update `## Source Files` list**

Replace the `## Source Files` block (lines 31-45) with:
```markdown
## Source Files

- `src/main.ts` — Cycle loop, git commits, history snapshots, user interaction, provider dispatch, stack management
- `src/config.ts` — Environment and path configuration (loads .env, exports paths and provider flags)
- `src/memory.ts` — Pure MEMORY.md parsers and transforms (`parseState`, `parsePush`, `removePush`, etc.)
- `src/call-stack.ts` — Instruction call stack: persistence (`.call-stack.json`) and pure push/pop transforms
- `src/prompt.ts` — System prompt and user prompt construction (inlines MEMORY + INSTRUCTIONS)
- `src/tools.ts` — Tool definitions (bash, write_file, git, update_instructions) and execution
- `src/telegram.ts` — Telegram bot integration (non-blocking user questions via chat)
- `src/providers/api.ts` — Anthropic SDK provider with managed tool loop
- `src/providers/claude-code.ts` — Claude Code CLI provider using native CC tools
- `src/providers/openai.ts` — OpenAI-compatible API provider
- `src/providers/ollama.ts` — Ollama native API provider with streaming
- `src/providers/local.ts` — In-process GGUF provider via node-llama-cpp (no server needed)
- `src/providers/shared.ts` — Shared helpers: readFile, logToolCall, checkCycleCompleteness, CycleResult, MAX_RETRIES
- `src/logger.ts` — Dual output: console gets summaries, `logs/run-<timestamp>.log` gets full untruncated output
- `src/errors.ts` — QuotaExceededError for graceful pause on rate limits (exit 0, resumable)
- `src/git.ts` — Two git repos per instance: machine git (instance root, auto-commits per cycle) and project git (workspace/, LLM-controlled)
- `src/server.ts` — Static file server for the visualizer
- `src/test/` — `node:test` suite for memory, call-stack, prompt, and stack integration scenarios
```

- [ ] **Step 2: Update `## Well-Known States`**

Replace the `## Well-Known States` block with:
```markdown
## Well-Known States

The shell intercepts these MEMORY states before each LLM invocation:

- `done` — If the call stack is empty, halts the machine. If the call stack has frames (an operator is active), the shell pops one frame: restores the caller's instructions and sets state to `{returnState}_completed` (where `returnState` is the state the caller was in when it pushed). Cascade-pops while state remains `done`.
- `waiting_for_user` — reads `## Pending Questions` from MEMORY, prompts user one question at a time, writes answers to `## Answers` in MEMORY, sets state to `user_responded`. Questions are non-blocking: the LLM adds them to `## Pending Questions` without changing state and keeps working. Only sets `waiting_for_user` when all remaining work is blocked on unanswered questions.

The shell also intercepts the `## Push` MEMORY section (see Dynamics below).
```

- [ ] **Step 3: Insert a new `## Dynamics (Call Stack)` section**

Insert this new section immediately before the `## Interpreters` section:
```markdown
## Dynamics (Call Stack)

An **operator** is a reusable instruction file that can be invoked from the running instruction set via push/pop semantics — like calling a subroutine. The shell owns the stack; the LLM signals intent through MEMORY.

**Push.** The LLM writes `## Push` in MEMORY with a file path relative to the instance directory:

```
## Push
operators/consult.md
```

Before the next LLM invocation, the shell:
1. Saves the current `{state, instructions}` as a new frame on the call stack.
2. Loads the target file as the new `INSTRUCTIONS.md`.
3. Strips the `## Push` section from MEMORY.
4. Sets state to `empty` so the operator starts fresh.

The operator can then run its own state machine over the MEMORY the caller left behind (the caller is expected to write any context the operator needs into dedicated MEMORY sections before pushing).

**Pop.** When the operator sets state to `done`, the shell pops the top frame, restores the caller's instructions, and sets state to `{caller_state}_completed` — where `caller_state` is the state the caller was in at push time. The caller must have an instruction that matches `{caller_state}_completed` to consume the returned result.

The `_completed` suffix prevents an infinite loop: the caller's original `{caller_state}` instruction (which did the push) does not immediately re-fire.

**Nesting.** Operators can push further operators. The stack is unbounded in principle; each push adds a frame. On cascade-pop (e.g., the LLM sets `done` and the top caller's restored state is still `done`), the shell pops again — in practice this only happens if a caller pushed from state `done`, which is unusual.

**Persistence.** The stack is persisted to `.call-stack.json` in the instance directory after every change. Snapshots in `history/NNNN-<hash>/` include a copy of the stack so past cycles are fully reconstructable.

**Authoring operators.** Create `interpreters/<name>/operators/<thing>.md` alongside `INSTRUCTIONS.md`. The `new-instance.sh` script copies the whole `operators/` directory into each new instance. An operator file follows the same format as `INSTRUCTIONS.md` (a state machine with conditions/actions), must have an entry condition for state `empty`, and must eventually set state `done` to return control to the caller.

**Missing push targets.** If `## Push` points at a non-existent or empty file, the shell logs an error, strips `## Push` from MEMORY, and continues with the caller unchanged (no frame is pushed). The LLM will see the next cycle without the push request and can adapt.

**Implementation.** All push/pop semantics live in `src/call-stack.ts` as pure functions (`applyPush`, `applyPop`) that take `{stack, memory, instructions}` and return the transformed state. The shell in `src/main.ts` runs them before each LLM invocation and writes results back to disk. This split is why the stack logic is unit-tested independently of the main loop.
```

- [ ] **Step 4: Update `## Instance Layout`**

Replace the `## Instance Layout` block at the bottom with:
```markdown
## Instance Layout

```
instances/foo/
├── PROGRAM.md         # User's program (read-only to machine)
├── INSTRUCTIONS.md    # Strategy + generated sub-instructions (or an operator, while one is active)
├── MEMORY.md          # Current state; may contain ## Push to delegate to an operator
├── .call-stack.json   # Saved call stack (empty array at depth 0)
├── .env               # Provider/model config (gitignored)
├── workspace/         # Project artifacts (has its own git repo)
├── operators/          # Reusable instruction files copied from the interpreter (optional)
├── run.sh             # Launch script
├── .api_key           # Cached API key (gitignored)
├── .gitignore         # Ignores .api_key, .env, logs/, history/, workspace/.git/
├── history/           # Snapshot per cycle (0001-a3f1b2c/ — includes .call-stack.json)
└── logs/              # Full run logs (run-<timestamp>.log)
```
```

- [ ] **Step 5: Append a testing note to the `## Build and Run` block**

Replace the line `No test suite or linter configured. After TypeScript changes, always \`npm run build\` before running instances.` with:

```markdown
After TypeScript changes, always `npm run build` before running instances. A `node:test` suite lives in `src/test/` — run it with `npm test` (builds + runs). No linter is configured.
```

- [ ] **Step 6: Review the full file for consistency**

Read `CLAUDE.md` end-to-end. Confirm:
- Source Files list includes every `src/*.ts` file and the test dir
- Well-Known States mentions both halt and pop behaviour for `done`
- Dynamics section is present and precedes Interpreters
- Instance Layout shows `.call-stack.json` and `operators/`

- [ ] **Step 7: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: document operators/call-stack in CLAUDE.md"
```

---

## Task 11: Update README.md

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Add a `## Dynamics` section**

Insert this section immediately before the `## Interpreters` section (around line 139):

```markdown
## Dynamics (Call Stack)

An **operator** is a reusable instruction file invoked like a subroutine. The running instruction set delegates by writing `## Push` in MEMORY:

```
## Push
operators/consult-team.md
```

The shell saves the current `{state, instructions}` onto a call stack, loads the operator as the new `INSTRUCTIONS.md`, and sets state to `empty`. When the operator sets state to `done`, the shell pops the stack, restores the caller's instructions, and sets state to `{caller_state}_completed`.

```
    ┌─── caller ───┐
    │ state: needs_opinion                 ┌─ operator ─┐
    │ ## Push: operators/consult.md ──────► │ state: empty
    └──────────────┘                       │ ...
                                           │ state: done ───┐
    ┌─── caller ───┐                       └────────────────┘
    │ state: needs_opinion_completed ◄────────── pop
    └──────────────┘
```

- Operators can nest (an operator can push another).
- Stack is persisted to `.call-stack.json` and snapshotted into each `history/` entry.
- Missing push targets are logged and ignored — no frame is pushed.
- Author operators in `interpreters/<name>/operators/*.md`; they are copied into each new instance.

Implementation: `src/call-stack.ts` (pure `applyPush` / `applyPop` transforms), called from the cycle loop in `src/main.ts`. Unit-tested under `src/test/`.
```

- [ ] **Step 2: Update Instance Structure to include `.call-stack.json` and `operators/`**

Replace the `## Instance Structure` block at the bottom with:
```markdown
## Instance Structure

```
instances/foo/
├── PROGRAM.md         # User's program (read-only to machine)
├── INSTRUCTIONS.md    # Strategy + generated sub-instructions (swapped when an operator is active)
├── MEMORY.md          # Current state; may carry ## Push to delegate
├── .call-stack.json   # Saved call stack (empty at depth 0)
├── workspace/         # Project artifacts (own git repo)
├── operators/          # Reusable instruction files (optional, provided by the interpreter)
├── run.sh             # Launch script
├── *.md               # Interpreter support files (role descriptions, etc.)
├── .api_key           # Cached API key (gitignored)
├── .gitignore
├── history/           # Snapshots per cycle
│   ├── 0001-a3f1b2c/
│   │   ├── MEMORY.md
│   │   ├── INSTRUCTIONS.md
│   │   └── .call-stack.json
│   └── ...
└── logs/              # Full run logs
    └── run-2026-04-06T*.log
```
```

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs: document operators/call-stack in README"
```

---

## Task 12: Full suite sanity check

**Files:** none (verification only)

- [ ] **Step 1: Clean build**

```bash
rm -rf dist/
npm run build
```
Expected: no TypeScript errors.

- [ ] **Step 2: Run the full test suite**

```bash
npm test
```
Expected: all suites pass, `# fail 0`, exit 0.

- [ ] **Step 3: Verify docs render**

Open `CLAUDE.md` and `README.md`, confirm:
- No broken markdown (matched code fences, headings)
- The new Dynamics sections read coherently on their own

- [ ] **Step 4: Final summary commit (if any cleanup was needed)**

If any small fixes arose in steps 1-3:
```bash
git add -A
git commit -m "chore: post-review cleanup"
```

Otherwise skip.

---

## Self-review checklist

- **Spec coverage:** Docs (CLAUDE.md + README.md): Tasks 10-11. Optimizations = the push/pop refactor: Tasks 5-7. Tests = comprehensive: Tasks 1-9 (memory, call-stack persistence, applyPop, applyPush, integration, prompt). Interpreters left alone per user direction. All three asks covered.
- **No placeholders:** All tests and code blocks contain the actual code; no "fill in" or "similar to".
- **Type/name consistency:** `StackEntry`, `applyPush`, `applyPop`, `PopEvent`, `PopResult`, `PushResult` consistent across Tasks 5-8 and in main.ts refactor. Import paths use `.js` (correct for Node16 ESM TS).
- **File-path accuracy:** All test files live under `src/test/` which compiles to `dist/test/`; runner path `dist/test/` matches. `call-stack.ts` path matches what main.ts imports today.
