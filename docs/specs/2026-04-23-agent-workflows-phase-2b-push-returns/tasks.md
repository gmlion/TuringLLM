# Tasks: agent-workflows Phase 2b — isolated MEMORY per frame with declared returns

> **For executors:** use `kiro-flow:spec-execute` (it wraps
> `superpowers:subagent-driven-development` or `superpowers:executing-plans`).
> Each task below is TDD-shaped — write the failing test first, then minimal
> code, then verify, then commit. Commit messages must reference the task's
> `(satisfies: R#)` tag.

## Task index

| #   | Summary                                                                       | Satisfies                        |
| --- | ----------------------------------------------------------------------------- | -------------------------------- |
| T1  | Add `parseReturn` / `removeReturn` / `spliceReturns` to `src/memory.ts`       | R13, R14, R16, R33               |
| T2  | Add `formatFrameDir` / `slugFromTarget` to `src/call-stack.ts`                | R5, R33                          |
| T3  | Introduce new `CallStack` type + loader/saver for new JSON shape              | R4, R17, R33                     |
| T4  | Rewrite `applyPush` for per-frame MEMORY + frameDir result                    | R1, R2, R5, R9, R33              |
| T5  | Rewrite `applyPop` for on-disk restore + return splicing                      | R3, R6, R14, R15, R16, R33       |
| T6  | Replace static `MEMORY_PATH` / `INSTRUCTIONS_PATH` with `activeFramePaths()`  | R42                              |
| T7  | Update `main.ts`: cwd handoff, frame-aware I/O, halt detection                | R3, R37, R42                     |
| T8  | `history/NNNN-<hash>/` snapshot captures the whole `frames/` subtree          | R8, R41                          |
| T9  | Rewrite `new-instance.sh` for the `frames/f000-strategy/` layout              | R7, R39, R40                     |
| T10 | Delete every existing `instances/<name>/` directory                           | R44                              |
| T11 | Update `src/prompt.ts` with frame-context + surgical-edit subsections         | R19, R20, R38                    |
| T12 | Add scripted integration test `src/test/phase-2b-returns.test.ts`             | R33                              |
| T13 | Migrate `a-self-refine` to scoped files + `## Return`                         | R21, R32                         |
| T14 | Migrate `b-evaluator-optimizer`                                               | R22, R25, R32                    |
| T15 | Migrate `c-reflexion` (lessons.md surgical append)                            | R23, R25, R26, R32               |
| T16 | Migrate `d-cove` (verifications.md surgical sed)                              | R24, R27, R32                    |
| T17 | Documentation updates: CLAUDE.md, group README, agent-workflows docs, notes   | R28, R29, R30, R31, R43          |
| T18 | Live demos for all four interpreters + finalize phase-2b-notes.md             | R26, R27, R34, R35, R36          |

R10, R11, R12, R18 are struck through in requirements.md (dropped under
the chroot pivot); no tasks address them — this is deliberate.

---

## Task 1: Add return-section helpers to memory.ts (satisfies: R13, R14, R16, R33)

**Files:**
- Modify: `src/memory.ts`
- Modify: `src/test/memory.test.ts`

- [ ] **Step 1: Write the failing tests**

    Append to `src/test/memory.test.ts` (after the existing describe blocks; add the new symbols to the existing import from `../memory.js`):

    ```typescript
    describe("parseReturn", () => {
      test("returns empty entries when section absent", () => {
        const memory = "## State\ndone\n## Last Action\nfoo";
        const r = parseReturn(memory);
        assert.deepEqual(r.entries, {});
        assert.deepEqual(r.malformedLines, []);
      });

      test("parses single-line key: value pairs", () => {
        const memory = "## State\ndone\n## Return\nanswer: yes\nverdict: pass\n## Last Action\nfoo";
        const r = parseReturn(memory);
        assert.deepEqual(r.entries, { answer: "yes", verdict: "pass" });
        assert.deepEqual(r.malformedLines, []);
      });

      test("parses block scalar with two-space indent", () => {
        const memory = "## State\ndone\n## Return\ndraft: |\n  line one\n  line two\nshort: hi";
        const r = parseReturn(memory);
        assert.deepEqual(r.entries, { draft: "line one\nline two", short: "hi" });
      });

      test("collects malformed lines for logging", () => {
        const memory = "## State\ndone\n## Return\nok: yes\nbroken-no-colon\nalso-ok: true";
        const r = parseReturn(memory);
        assert.deepEqual(r.entries, { ok: "yes", "also-ok": "true" });
        assert.deepEqual(r.malformedLines, ["broken-no-colon"]);
      });

      test("stops at next ## heading", () => {
        const memory = "## State\ndone\n## Return\nq: hi\n## Other\nignored: yes";
        const r = parseReturn(memory);
        assert.deepEqual(r.entries, { q: "hi" });
      });
    });

    describe("removeReturn", () => {
      test("strips section between ## Return and next ##", () => {
        const memory = "## State\ndone\n## Return\nq: hi\n## Other\nkeep: this";
        assert.equal(removeReturn(memory), "## State\ndone\n## Other\nkeep: this");
      });

      test("strips section to end when no following heading", () => {
        const memory = "## State\ndone\n## Return\nq: hi";
        assert.equal(removeReturn(memory), "## State\ndone");
      });

      test("returns memory unchanged when section absent", () => {
        const memory = "## State\ndone\n## Last Action\nfoo";
        assert.equal(removeReturn(memory), memory);
      });
    });

    describe("spliceReturns", () => {
      test("appends a new section for a new key", () => {
        const caller = "## State\nattempted_completed\n";
        const r = spliceReturns(caller, { verdict: "pass" });
        assert.match(r, /## State\nattempted_completed/);
        assert.match(r, /## Verdict\npass/);
      });

      test("replaces an existing section body", () => {
        const caller = "## State\nfoo\n## Verdict\nfail\n## Feedback\nold";
        const r = spliceReturns(caller, { verdict: "pass" });
        assert.match(r, /## Verdict\npass/);
        assert.doesNotMatch(r, /## Verdict\nfail/);
        assert.match(r, /## Feedback\nold/);
      });

      test("capitalizes only the first character of the key", () => {
        const caller = "## State\nfoo\n";
        const r = spliceReturns(caller, { answerId: "42" });
        assert.match(r, /## AnswerId\n42/);
      });

      test("handles multi-line values", () => {
        const caller = "## State\nfoo\n";
        const r = spliceReturns(caller, { draft: "line1\nline2\nline3" });
        assert.match(r, /## Draft\nline1\nline2\nline3/);
      });

      test("returns caller unchanged when returns map is empty", () => {
        const caller = "## State\nfoo\n## Something\nbar";
        assert.equal(spliceReturns(caller, {}), caller);
      });
    });
    ```

- [ ] **Step 2: Run tests to verify they fail**

    Run: `npm test -- --test-name-pattern="parseReturn|removeReturn|spliceReturns"`
    Expected: FAIL — the helpers are not yet exported from `../memory.js`.

- [ ] **Step 3: Add the implementations to `src/memory.ts`**

    Append at the end of the file:

    ```typescript
    /**
     * Parse the ## Return section into (entries, malformedLines).
     * Grammar is identical to parsePushArgs: `key: value` or `key: |` block scalar
     * with 2-space indentation. Malformed lines (no `:`, or identifier rule
     * violation) are collected separately so the caller can log them.
     */
    export function parseReturn(memory: string): {
      entries: Record<string, string>;
      malformedLines: string[];
    } {
      const headerRe = /(^|\n)## Return\n/;
      const headerMatch = memory.match(headerRe);
      if (!headerMatch) return { entries: {}, malformedLines: [] };
      const start = (headerMatch.index ?? 0) + headerMatch[0].length;

      const remainder = memory.slice(start);
      const nextHeading = remainder.match(/\n## [A-Z]/);
      const sectionEnd = nextHeading
        ? start + (nextHeading.index ?? 0)
        : memory.length;
      const section = memory.slice(start, sectionEnd);

      const entries: Record<string, string> = {};
      const malformedLines: string[] = [];
      const lines = section.split("\n");
      let i = 0;
      while (i < lines.length) {
        const line = lines[i];
        if (line === "") { i++; continue; }
        const blockMatch = line.match(/^([a-zA-Z_][a-zA-Z0-9_]*): \|$/);
        if (blockMatch) {
          const key = blockMatch[1];
          const valueLines: string[] = [];
          i++;
          while (i < lines.length && (lines[i].startsWith("  ") || lines[i] === "")) {
            valueLines.push(lines[i].startsWith("  ") ? lines[i].slice(2) : "");
            i++;
          }
          while (valueLines.length > 0 && valueLines[valueLines.length - 1] === "") {
            valueLines.pop();
          }
          entries[key] = valueLines.join("\n");
          continue;
        }
        const singleMatch = line.match(/^([a-zA-Z_][a-zA-Z0-9_-]*): (.+)$/);
        if (singleMatch) {
          entries[singleMatch[1]] = singleMatch[2];
        } else {
          malformedLines.push(line);
        }
        i++;
      }
      return { entries, malformedLines };
    }

    /** Remove the ## Return section from MEMORY. Mirror of removePushArgs. */
    export function removeReturn(memory: string): string {
      return memory.replace(/\n?## Return\n[^\n]*(\n(?!## )[^\n]*)*/m, "");
    }

    /**
     * Splice return entries into caller MEMORY as ## <CapitalizedKey> sections.
     * Upsert: replace an existing section's body if present, append a new
     * section at the end otherwise. First character of the key is uppercased;
     * remaining characters preserved (so "answerId" → "## AnswerId").
     */
    export function spliceReturns(
      callerMemory: string,
      returns: Record<string, string>,
    ): string {
      let out = callerMemory;
      for (const [key, value] of Object.entries(returns)) {
        const capitalized = key.charAt(0).toUpperCase() + key.slice(1);
        const sectionName = `## ${capitalized}`;
        const re = new RegExp(
          `(^|\\n)${sectionName}\\n[^\\n]*(\\n(?!## )[^\\n]*)*`,
          "m",
        );
        if (re.test(out)) {
          out = out.replace(re, `$1${sectionName}\n${value}`);
        } else {
          if (!out.endsWith("\n")) out += "\n";
          out += `${sectionName}\n${value}\n`;
        }
      }
      return out;
    }
    ```

- [ ] **Step 4: Build and re-run tests**

    Run: `npm run build && npm test -- --test-name-pattern="parseReturn|removeReturn|spliceReturns"`
    Expected: PASS — all new tests green.

- [ ] **Step 5: Run full suite**

    Run: `npm test`
    Expected: PASS — no pre-existing test regresses (110 baseline + 13 new = 123).

- [ ] **Step 6: Commit**

    ```bash
    git add src/memory.ts src/test/memory.test.ts
    git commit -m "feat(memory): add parseReturn, removeReturn, spliceReturns (satisfies: R13, R14, R16, R33)"
    ```

---

## Task 2: Add frame-dir naming helpers to call-stack.ts (satisfies: R5, R33)

**Files:**
- Modify: `src/call-stack.ts`
- Create: `src/test/phase-2b-frame-dir.test.ts`

- [ ] **Step 1: Write the failing tests**

    Create `src/test/phase-2b-frame-dir.test.ts`:

    ```typescript
    import { test, describe } from "node:test";
    import { strict as assert } from "node:assert";
    import { formatFrameDir, slugFromTarget } from "../call-stack.js";

    describe("slugFromTarget", () => {
      test("basic dynamic path", () => {
        assert.equal(slugFromTarget("dynamics/verify.md"), "verify");
      });

      test("hyphens preserved, extension stripped", () => {
        assert.equal(slugFromTarget("dynamics/answer-independently.md"), "answer-independently");
      });

      test("non-alphanumeric characters replaced with _", () => {
        assert.equal(slugFromTarget("dynamics/foo.bar baz.md"), "foo_bar_baz");
      });

      test("path without leading directory", () => {
        assert.equal(slugFromTarget("inline.md"), "inline");
      });
    });

    describe("formatFrameDir", () => {
      test("counter zero-pads to 3 digits", () => {
        assert.equal(formatFrameDir(0, "strategy"), "frames/f000-strategy");
        assert.equal(formatFrameDir(7, "verify"), "frames/f007-verify");
        assert.equal(formatFrameDir(42, "answer-independently"), "frames/f042-answer-independently");
      });

      test("counter widens beyond 999 preserving lexical sort", () => {
        assert.equal(formatFrameDir(1000, "verify"), "frames/f1000-verify");
      });
    });
    ```

- [ ] **Step 2: Run tests to verify they fail**

    Run: `npm test -- --test-name-pattern="formatFrameDir|slugFromTarget"`
    Expected: FAIL — helpers not yet exported.

- [ ] **Step 3: Add the implementations to `src/call-stack.ts`**

    Append at the end:

    ```typescript
    /**
     * Derive a filesystem-safe slug from a push-target path.
     * Example: "dynamics/answer-independently.md" → "answer-independently".
     */
    export function slugFromTarget(target: string): string {
      const base = target.split(/[\\/]/).pop() ?? target;
      const noExt = base.replace(/\.md$/, "");
      return noExt.replace(/[^a-zA-Z0-9_-]/g, "_");
    }

    /**
     * Build the relative frame directory path for a push-counter + slug.
     * Counter is zero-padded to 3 digits below 1000, widens lexically beyond.
     */
    export function formatFrameDir(counter: number, slug: string): string {
      const padded = counter < 1000 ? String(counter).padStart(3, "0") : String(counter);
      return `frames/f${padded}-${slug}`;
    }
    ```

- [ ] **Step 4: Build and re-run tests**

    Run: `npm run build && npm test -- --test-name-pattern="formatFrameDir|slugFromTarget"`
    Expected: PASS.

- [ ] **Step 5: Run full suite**

    Run: `npm test`
    Expected: PASS (123 baseline + 6 new = 129).

- [ ] **Step 6: Commit**

    ```bash
    git add src/call-stack.ts src/test/phase-2b-frame-dir.test.ts
    git commit -m "feat(call-stack): add formatFrameDir and slugFromTarget helpers (satisfies: R5, R33)"
    ```

---

## Task 3: Introduce new CallStack type + loader/saver (satisfies: R4, R17, R33)

**Files:**
- Modify: `src/call-stack.ts`
- Create: `src/test/phase-2b-call-stack.test.ts`

- [ ] **Step 1: Write the failing tests**

    Create `src/test/phase-2b-call-stack.test.ts`:

    ```typescript
    import { test, describe, beforeEach, afterEach } from "node:test";
    import { strict as assert } from "node:assert";
    import { mkdtempSync, rmSync, writeFileSync, readFileSync } from "fs";
    import { resolve } from "path";
    import { tmpdir } from "os";
    import { loadCallStack, saveCallStack, type CallStack } from "../call-stack.js";

    describe("CallStack persistence (Phase 2b shape)", () => {
      let tmp: string;
      beforeEach(() => { tmp = mkdtempSync(resolve(tmpdir(), "turing-cs-")); });
      afterEach(() => { rmSync(tmp, { recursive: true, force: true }); });

      test("loads fresh when file absent", () => {
        const cs = loadCallStack(resolve(tmp, ".call-stack.json"));
        assert.equal(cs.nextCounter, 1);
        assert.deepEqual(cs.stack, [
          { returnState: "<root>", frameDir: "frames/f000-strategy" },
        ]);
      });

      test("loads the new object shape round-trip", () => {
        const path = resolve(tmp, ".call-stack.json");
        const cs: CallStack = {
          nextCounter: 3,
          stack: [
            { returnState: "<root>", frameDir: "frames/f000-strategy" },
            { returnState: "drafted", frameDir: "frames/f001-verify" },
          ],
        };
        saveCallStack(path, cs);
        const loaded = loadCallStack(path);
        assert.deepEqual(loaded, cs);
      });

      test("malformed JSON returns fresh shape", () => {
        const path = resolve(tmp, ".call-stack.json");
        writeFileSync(path, "not json", "utf-8");
        const cs = loadCallStack(path);
        assert.equal(cs.nextCounter, 1);
        assert.equal(cs.stack.length, 1);
        assert.equal(cs.stack[0].frameDir, "frames/f000-strategy");
      });

      test("pre-Phase-2b bare-array shape returns fresh (no compat)", () => {
        // R18 explicitly dropped — bare arrays are no longer loaded as stacks.
        const path = resolve(tmp, ".call-stack.json");
        writeFileSync(path, JSON.stringify([
          { returnState: "foo", instructions: "bar" },
        ]), "utf-8");
        const cs = loadCallStack(path);
        assert.equal(cs.nextCounter, 1);
        assert.deepEqual(cs.stack, [
          { returnState: "<root>", frameDir: "frames/f000-strategy" },
        ]);
      });

      test("saveCallStack writes valid JSON matching the shape", () => {
        const path = resolve(tmp, ".call-stack.json");
        saveCallStack(path, {
          nextCounter: 2,
          stack: [
            { returnState: "<root>", frameDir: "frames/f000-strategy" },
          ],
        });
        const raw = readFileSync(path, "utf-8");
        const parsed = JSON.parse(raw);
        assert.equal(parsed.nextCounter, 2);
        assert.ok(Array.isArray(parsed.stack));
        assert.equal(parsed.stack[0].frameDir, "frames/f000-strategy");
      });
    });
    ```

- [ ] **Step 2: Run tests to verify they fail**

    Run: `npm test -- --test-name-pattern="CallStack persistence"`
    Expected: FAIL — the new `CallStack` type, `loadCallStack`, `saveCallStack` signatures don't match yet (today they use `StackEntry[]`).

- [ ] **Step 3: Replace the types and loaders in `src/call-stack.ts`**

    Near the top of `src/call-stack.ts`, replace the existing `StackEntry` type and the `loadCallStack`/`saveCallStack` functions (and `PopEvent` / `PopResult` / `PushResult` types — those are rewritten in T4/T5, leave their old signatures for now but keep the file type-clean). Specifically:

    Replace the existing `StackEntry` type with:

    ```typescript
    export type StackEntry = {
      returnState: string;
      frameDir: string;
    };

    export type CallStack = {
      nextCounter: number;
      stack: StackEntry[];
    };
    ```

    Replace `loadCallStack` and `saveCallStack` with:

    ```typescript
    const ROOT_FRAME_DIR = "frames/f000-strategy";
    const ROOT_RETURN_STATE = "<root>";

    function freshCallStack(): CallStack {
      return {
        nextCounter: 1,
        stack: [{ returnState: ROOT_RETURN_STATE, frameDir: ROOT_FRAME_DIR }],
      };
    }

    export function loadCallStack(path: string): CallStack {
      try {
        const parsed = JSON.parse(readFileSync(path, "utf-8"));
        if (
          parsed &&
          typeof parsed === "object" &&
          !Array.isArray(parsed) &&
          typeof parsed.nextCounter === "number" &&
          Array.isArray(parsed.stack) &&
          parsed.stack.length > 0 &&
          parsed.stack.every(
            (e: unknown) =>
              e !== null &&
              typeof e === "object" &&
              typeof (e as StackEntry).returnState === "string" &&
              typeof (e as StackEntry).frameDir === "string",
          )
        ) {
          return parsed as CallStack;
        }
      } catch { /* fall through */ }
      return freshCallStack();
    }

    export function saveCallStack(path: string, callStack: CallStack): void {
      writeFileSync(path, JSON.stringify(callStack, null, 2), "utf-8");
    }
    ```

    Note: `applyPush` and `applyPop` still have their Phase-2 signatures at this point — they'll be rewritten in T4/T5. This task is *only* the types + loaders. If TypeScript complains that `applyPush/applyPop` use the old `StackEntry[]` vs the new `CallStack` shape, temporarily accept any mismatch — T4/T5 will bring them into alignment. If this blocks `npm run build`, the cleanest patch is to temporarily type `applyPush`'s first parameter as `StackEntry[]` (a union of old and new is not needed because applyPush will be fully rewritten next). The test below only exercises loadCallStack/saveCallStack, so the build doesn't have to be green if a one-commit-later commit fixes it.

    **If the build does fail on this task**: split into T3a (types + loaders, fail-clean — type applyPush's first arg as `CallStack` with a `.stack` unpacking inside the body as a shim) and T3b (T4's rewrite). For simplicity, assume the executor can keep the build green by being careful with types.

- [ ] **Step 4: Build and re-run tests**

    Run: `npm run build && npm test -- --test-name-pattern="CallStack persistence"`
    Expected: PASS.

- [ ] **Step 5: Run full suite**

    Run: `npm test`
    Expected: PASS (129 baseline + 5 new = 134). Some existing push-args / stack-integration tests may need minor adjustment if they construct `CallStack` objects. Update them to the new shape in this commit.

- [ ] **Step 6: Commit**

    ```bash
    git add src/call-stack.ts src/test/phase-2b-call-stack.test.ts
    git commit -m "feat(call-stack): introduce Phase 2b CallStack type + loader/saver (satisfies: R4, R17, R33)"
    ```

---

## Task 4: Rewrite applyPush for per-frame MEMORY + frameDir result (satisfies: R1, R2, R5, R9, R33)

**Files:**
- Modify: `src/call-stack.ts`
- Modify: `src/test/push-args.test.ts`

- [ ] **Step 1: Update existing `applyPush` tests to the new signature**

    In `src/test/push-args.test.ts`, replace every existing `applyPush` call of the form `applyPush([], memory, instructions, readTarget)` with the new signature: `applyPush(callStack, memory, readTarget)` where `callStack` is a `CallStack` object and the old `instructions` parameter is gone (caller's instructions are implicit in the frame).

    Also update result-object assertions: `result.callStack.stack.length`, `result.callerMemoryAfter`, `result.childMemory`, `result.childInstructions`, `result.frameDir`, `result.target`.

    Example rewrite of one existing test (adapt the same pattern to the others; keep the test *intent* — successful push, failure modes, etc.):

    ```typescript
    test("substitutes placeholders successfully and pushes one frame", () => {
      const memory = "## State\nfoo\n## Push\ndyn.md\n## Push-Args\nq: hello";
      const target = "Question: {{q}}";
      const result = applyPush(
        { nextCounter: 1, stack: [{ returnState: "<root>", frameDir: "frames/f000-strategy" }] },
        memory,
        () => target,
      );
      assert.equal(result.ok, true);
      if (!result.ok) return;
      assert.equal(result.callStack.nextCounter, 2);
      assert.equal(result.callStack.stack.length, 2);
      assert.equal(result.callStack.stack[1].returnState, "foo");
      assert.equal(result.callStack.stack[1].frameDir, "frames/f001-dyn");
      assert.equal(result.childInstructions, "Question: hello");
      assert.equal(result.childMemory, "## State\nempty\n");
      assert.equal(result.frameDir, "frames/f001-dyn");
      assert.doesNotMatch(result.callerMemoryAfter, /## Push\b/);
      assert.doesNotMatch(result.callerMemoryAfter, /## Push-Args/);
    });
    ```

    Add a new test for R9 (failure does not increment counter):

    ```typescript
    test("unresolved-placeholder failure does NOT increment nextCounter", () => {
      const cs = { nextCounter: 5, stack: [{ returnState: "<root>", frameDir: "frames/f000-strategy" }] };
      const result = applyPush(cs, "## State\nfoo\n## Push\ndyn.md", () => "needs {{x}}");
      assert.equal(result.ok, false);
      // counter is NOT advanced by the caller; the result does not expose
      // a new callStack on failure (only callerMemoryAfter for Push stripping).
      // Verify by inspecting cs itself — unchanged since applyPush is pure.
      assert.equal(cs.nextCounter, 5);
      assert.equal(cs.stack.length, 1);
    });
    ```

- [ ] **Step 2: Run tests to verify they fail**

    Run: `npm test -- --test-name-pattern="applyPush"`
    Expected: FAIL — old `applyPush` signature doesn't match the new shape.

- [ ] **Step 3: Rewrite `applyPush` in `src/call-stack.ts`**

    Replace the current `applyPush` function body and the `PushResult` union type with:

    ```typescript
    export type PushResult =
      | {
          ok: true;
          callStack: CallStack;
          callerMemoryAfter: string;
          childMemory: string;
          childInstructions: string;
          frameDir: string;
          target: string;
        }
      | { ok: false; memory: string; reason: "no-push" }
      | { ok: false; memory: string; reason: "missing-target"; target: string }
      | {
          ok: false;
          memory: string;
          reason: "unresolved-placeholder";
          target: string;
          placeholders: string[];
        };

    export function applyPush(
      callStack: CallStack,
      callerMemory: string,
      readTarget: (path: string) => string | null,
    ): PushResult {
      const target = parsePush(callerMemory);
      if (!target) return { ok: false, memory: callerMemory, reason: "no-push" };

      const args = parsePushArgs(callerMemory);

      const targetContent = readTarget(target);
      if (!targetContent) {
        return {
          ok: false,
          memory: removePushArgs(removePush(callerMemory)),
          reason: "missing-target",
          target,
        };
      }

      const { result: substituted, unresolved } = substitutePlaceholders(
        targetContent,
        args,
      );
      if (unresolved.length > 0) {
        return {
          ok: false,
          memory: removePushArgs(removePush(callerMemory)),
          reason: "unresolved-placeholder",
          target,
          placeholders: unresolved,
        };
      }

      const frameDir = formatFrameDir(callStack.nextCounter, slugFromTarget(target));
      const returnState = parseState(callerMemory);
      const newEntry: StackEntry = { returnState, frameDir };

      const newCallStack: CallStack = {
        nextCounter: callStack.nextCounter + 1,
        stack: [...callStack.stack, newEntry],
      };

      const callerMemoryAfter = removePushArgs(removePush(callerMemory));
      const childMemory = "## State\nempty\n";

      return {
        ok: true,
        callStack: newCallStack,
        callerMemoryAfter,
        childMemory,
        childInstructions: substituted,
        frameDir,
        target,
      };
    }
    ```

- [ ] **Step 4: Build + run applyPush tests**

    Run: `npm run build && npm test -- --test-name-pattern="applyPush"`
    Expected: PASS.

- [ ] **Step 5: Run full suite**

    Run: `npm test`
    Expected: PASS (some unrelated tests may still fail if they use the old applyPop signature — T5 fixes those. For this commit, at minimum push-args.test.ts and phase-2b-*.test.ts must pass. If stack-integration.test.ts or the phase-1-*.test.ts fail on applyPop signature mismatch, mark those tests `.skip` temporarily and un-skip them in T5.)

- [ ] **Step 6: Commit**

    ```bash
    git add src/call-stack.ts src/test/push-args.test.ts
    git commit -m "feat(call-stack): rewrite applyPush for Phase 2b per-frame memory (satisfies: R1, R2, R5, R9, R33)"
    ```

---

## Task 5: Rewrite applyPop for on-disk restore + return splicing (satisfies: R3, R6, R14, R15, R16, R33)

**Files:**
- Modify: `src/call-stack.ts`
- Modify: `src/test/stack-integration.test.ts`

- [ ] **Step 1: Update existing `applyPop` tests to the new signature**

    In `src/test/stack-integration.test.ts`, update the `runStackBlock` helper and all tests that call `applyPop` directly. New signature: `applyPop(callStack: CallStack, childMemory: string, readFrame: (frameDir, file) => string)`.

    Example rewrite of a test:

    ```typescript
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
        throw new Error("unexpected read");
      });

      assert.equal(popped.callStack.stack.length, 1);
      assert.equal(popped.callerFrameDir, "frames/f000-strategy");
      assert.match(popped.callerMemoryAfter, /## State\nneeds_opinion_completed/);
      assert.match(popped.callerMemoryAfter, /## Result\nok/);
      assert.equal(popped.events.length, 1);
      assert.equal(popped.events[0].returnState, "needs_opinion");
      assert.equal(popped.events[0].frameDir, "frames/f001-consult");
    });
    ```

    Add new tests for R15 and R16:

    ```typescript
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
    ```

- [ ] **Step 2: Run tests to verify they fail**

    Run: `npm test -- --test-name-pattern="stack integration|pop"`
    Expected: FAIL — old `applyPop` signature doesn't match the new shape.

- [ ] **Step 3: Rewrite `applyPop` in `src/call-stack.ts`**

    Replace the current `applyPop` function, `PopEvent`, `PopResult` with:

    ```typescript
    export type PopEvent = {
      returnState: string;
      depthAfter: number;
      frameDir: string;
      splicedKeys: string[];
      missingReturn: boolean;
      malformedLines: string[];
    };

    export type PopResult = {
      callStack: CallStack;
      callerMemoryAfter: string;
      callerFrameDir: string;
      events: PopEvent[];
    };

    export function applyPop(
      callStack: CallStack,
      childMemory: string,
      readFrame: (frameDir: string, file: "MEMORY.md") => string,
    ): PopResult {
      let stack = [...callStack.stack];
      const events: PopEvent[] = [];
      let currentChildMemory = childMemory;
      let lastCallerMemory = "";
      let lastCallerFrameDir = stack[stack.length - 1]?.frameDir ?? "";

      // Cascade-pops only while state === "done" AND there is a caller to pop to
      // (i.e. stack.length > 1 — the root frame is never popped).
      while (parseState(currentChildMemory) === "done" && stack.length > 1) {
        const frame = stack.pop()!;
        const { entries: returns, malformedLines } = parseReturn(currentChildMemory);
        const callerFrameDir = stack[stack.length - 1].frameDir;
        const rawCallerMemory = readFrame(callerFrameDir, "MEMORY.md");
        let callerMemory = setState(rawCallerMemory, frame.returnState + "_completed");
        callerMemory = spliceReturns(callerMemory, returns);

        events.push({
          returnState: frame.returnState,
          depthAfter: stack.length,
          frameDir: frame.frameDir,
          splicedKeys: Object.keys(returns),
          missingReturn: Object.keys(returns).length === 0,
          malformedLines,
        });

        // For the cascade check, the new "child memory" is the caller's memory
        // (in case its state is also "done" and another pop should fire).
        currentChildMemory = callerMemory;
        lastCallerMemory = callerMemory;
        lastCallerFrameDir = callerFrameDir;
      }

      // If no pops happened, we still need to return some sensible callerMemory /
      // callerFrameDir so main.ts can no-op. Populate from the current top frame.
      if (events.length === 0) {
        lastCallerFrameDir = stack[stack.length - 1]?.frameDir ?? "";
        lastCallerMemory = childMemory;
      }

      return {
        callStack: { nextCounter: callStack.nextCounter, stack },
        callerMemoryAfter: lastCallerMemory,
        callerFrameDir: lastCallerFrameDir,
        events,
      };
    }
    ```

    Add imports at the top of `src/call-stack.ts` for `parseReturn` and `spliceReturns` from `./memory.js` (added in T1).

- [ ] **Step 4: Build + run applyPop tests**

    Run: `npm run build && npm test -- --test-name-pattern="stack integration|applyPop|pop"`
    Expected: PASS.

- [ ] **Step 5: Run full suite**

    Run: `npm test`
    Expected: PASS. The phase-1-*.test.ts and phase-2-cove.test.ts files still use old applyPush/applyPop signatures; they remain failing (or .skip'd from T4) until their respective retrofit tasks (T13-T16). If the test suite is red, that's expected at this commit point — document in the commit message which tests are intentionally failing.

- [ ] **Step 6: Commit**

    ```bash
    git add src/call-stack.ts src/test/stack-integration.test.ts
    git commit -m "feat(call-stack): rewrite applyPop for Phase 2b on-disk restore + splice (satisfies: R3, R6, R14, R15, R16, R33)

    phase-1-*.test.ts and phase-2-cove.test.ts remain red at this commit
    and are fixed per-interpreter in T13-T16 retrofits."
    ```

---

## Task 6: Replace static paths with activeFramePaths helper (satisfies: R42)

**Files:**
- Modify: `src/config.ts`

- [ ] **Step 1: Remove the static exports and add the helper**

    In `src/config.ts`:

    - Remove: `export const MEMORY_PATH = resolve(BASE_DIR, "MEMORY.md");`
    - Remove: `export const INSTRUCTIONS_PATH = resolve(BASE_DIR, "INSTRUCTIONS.md");`
    - Keep: `HISTORY_DIR`, `SYSCALLS_PATH`, `CALL_STACK_PATH`, `PROVIDER`, `STATEFUL`, `INSTANCE_NAME`, `TELEGRAM_*`.
    - Add the frame-aware helper:

    ```typescript
    import type { CallStack } from "./call-stack.js";

    /**
     * Resolve the active frame's on-disk paths.
     * The active frame is always stack[top] (the root frame is on the stack
     * as stack[0] per Phase 2b R17, so this never needs a fallback).
     */
    export function activeFramePaths(callStack: CallStack): {
      frameDir: string;
      memoryPath: string;
      instructionsPath: string;
    } {
      const top = callStack.stack[callStack.stack.length - 1];
      const frameDir = resolve(BASE_DIR, top.frameDir);
      return {
        frameDir,
        memoryPath: resolve(frameDir, "MEMORY.md"),
        instructionsPath: resolve(frameDir, "INSTRUCTIONS.md"),
      };
    }
    ```

    This creates a circular-import risk (`config.ts` ↔ `call-stack.ts`). To avoid it, import `CallStack` with `import type` (type-only, stripped at compile time) — this is already shown above.

- [ ] **Step 2: Build**

    Run: `npm run build`
    Expected: FAIL — many call sites in `src/main.ts` still reference `MEMORY_PATH` and `INSTRUCTIONS_PATH`.

- [ ] **Step 3: (Defer fix to T7)**

    The compile errors introduced by this task are resolved in T7, which rewrites `main.ts` to call `activeFramePaths()`. This task ends in a non-green state; T7 finishes it.

- [ ] **Step 4: Commit**

    Stage only `src/config.ts` (do NOT stage `src/main.ts` changes — those belong to T7):

    ```bash
    git add src/config.ts
    git commit -m "refactor(config): replace static MEMORY_PATH/INSTRUCTIONS_PATH with activeFramePaths (satisfies: R42)

    Build intentionally red at this commit; main.ts is rewritten in the
    next commit (T7) to consume activeFramePaths instead."
    ```

    Alternative: if red-at-commit is undesirable, merge this task's work into T7's commit. Document the merge in T7's commit message.

---

## Task 7: Update main.ts for cwd handoff + frame-aware paths + halt detection (satisfies: R3, R37, R42)

**Files:**
- Modify: `src/main.ts`

- [ ] **Step 1: Identify all sites using the old static paths and the old cwd**

    Run: `grep -n 'MEMORY_PATH\|INSTRUCTIONS_PATH\|cwd: BASE_DIR' src/main.ts`
    Expected: 20+ hits.

- [ ] **Step 2: Rewrite main.ts to use frame-aware I/O**

    Key transformations inside `src/main.ts`:

    - Remove `MEMORY_PATH, INSTRUCTIONS_PATH` from the imports; import `activeFramePaths` from `./config.js`.
    - Introduce a helper at the top of the cycle body:
      ```typescript
      const { frameDir, memoryPath, instructionsPath } = activeFramePaths(callStack);
      ```
    - Replace every `readFile(MEMORY_PATH)` with `readFile(memoryPath)` (or the corresponding frame-scoped call).
    - Replace every `writeFileSync(MEMORY_PATH, ...)` with `writeFileSync(memoryPath, ...)`.
    - Same for `INSTRUCTIONS_PATH` → `instructionsPath`.
    - Replace `cwd: BASE_DIR` in the bash tool execution site with `cwd: frameDir`.
    - In the snapshot function, also replace `copyFileSync(MEMORY_PATH, ...)` with a recursive copy — but note that T8 refactors snapshot more thoroughly. For this commit, update snapshot to call `cpSync(resolve(BASE_DIR, "frames"), resolve(dir, "frames"), { recursive: true })` and keep only the `.call-stack.json` single-file copy alongside.

    Halt detection: `runStackBlock` currently checks `callStack.length === 0` as a halt condition. Under Phase 2b root-on-stack, change this to:

    ```typescript
    if (parseState(readFile(memoryPath)) === "done" && callStack.stack.length === 1) {
      return true; // halt
    }
    ```

    Rewrite `runStackBlock` signature to take the new `CallStack` object and call the rewritten `applyPush` / `applyPop` with the new signatures. The function now also takes responsibility for the filesystem side-effects:

    - On pop event: for each event, `rmSync(resolve(BASE_DIR, event.frameDir), { recursive: true, force: true })`; write `popped.callerMemoryAfter` to `resolve(BASE_DIR, popped.callerFrameDir, "MEMORY.md")`.
    - On push: `mkdirSync(resolve(BASE_DIR, pushed.frameDir, "scoped"), { recursive: true })`; write `childMemory` to the new frame's `MEMORY.md`; write `childInstructions` to the new frame's `INSTRUCTIONS.md`; write `callerMemoryAfter` to the CALLER's frame's `MEMORY.md` (NOT the child's — the child gets fresh).

    Provider invocation: `runCycle(instructionsPath, memoryPath, ...)` — signature unchanged; pass in the frame-aware paths.

    Telemetry logs:
    - `log(\`  MEMORY:       ${memoryPath}\`)` — but this changes per cycle, so log it inside the loop prelude, not at startup.
    - At startup, log `log(\`  Instance:     ${INSTANCE_DIR}\`)` instead; per-cycle prelude logs the active frame dir.

    `readTarget` callback to `applyPush`: `resolve(BASE_DIR, p)` where `p` is the `## Push` target (e.g. `dynamics/verify.md`). `BASE_DIR` is `process.cwd()` set at process start, which is `instances/<name>/`. Dynamics live at `instances/<name>/dynamics/` (instance root, not inside a frame). This matches the design's "dynamics stay at instance root" rule.

- [ ] **Step 3: Run tests**

    Run: `npm run build && npm test`
    Expected: PASS for push-args, memory, stack-integration, phase-2b-*. The phase-1-*.test.ts and phase-2-cove.test.ts files still fail until T13-T16.

- [ ] **Step 4: Commit**

    ```bash
    git add src/main.ts
    git commit -m "refactor(main): cwd handoff + frame-aware I/O + halt-at-depth-1 (satisfies: R3, R37, R42)"
    ```

---

## Task 8: History snapshot captures the frames/ subtree (satisfies: R8, R41)

**Files:**
- Modify: `src/main.ts` (the `snapshot` function)

- [ ] **Step 1: Add a quick integration test for snapshot**

    Create a focused test under `src/test/phase-2b-snapshot.test.ts`:

    ```typescript
    import { test, describe, beforeEach, afterEach } from "node:test";
    import { strict as assert } from "node:assert";
    import { mkdtempSync, rmSync, mkdirSync, writeFileSync, existsSync, readFileSync } from "fs";
    import { resolve } from "path";
    import { tmpdir } from "os";
    import { cpSync } from "fs";

    describe("frames/ snapshot via cpSync", () => {
      let tmp: string;
      beforeEach(() => { tmp = mkdtempSync(resolve(tmpdir(), "turing-snap-")); });
      afterEach(() => { rmSync(tmp, { recursive: true, force: true }); });

      test("recursive copy preserves nested frame content", () => {
        mkdirSync(resolve(tmp, "frames/f000-strategy/scoped"), { recursive: true });
        writeFileSync(resolve(tmp, "frames/f000-strategy/MEMORY.md"), "root memory", "utf-8");
        writeFileSync(resolve(tmp, "frames/f000-strategy/scoped/draft.md"), "a draft", "utf-8");
        mkdirSync(resolve(tmp, "frames/f001-verify/scoped"), { recursive: true });
        writeFileSync(resolve(tmp, "frames/f001-verify/MEMORY.md"), "verify memory", "utf-8");
        writeFileSync(resolve(tmp, "frames/f001-verify/scoped/verifications.md"), "- V1: pending\n", "utf-8");

        mkdirSync(resolve(tmp, "history/0001-abc"), { recursive: true });
        cpSync(resolve(tmp, "frames"), resolve(tmp, "history/0001-abc/frames"), { recursive: true });

        assert.ok(existsSync(resolve(tmp, "history/0001-abc/frames/f000-strategy/MEMORY.md")));
        assert.ok(existsSync(resolve(tmp, "history/0001-abc/frames/f000-strategy/scoped/draft.md")));
        assert.ok(existsSync(resolve(tmp, "history/0001-abc/frames/f001-verify/scoped/verifications.md")));
        assert.equal(
          readFileSync(resolve(tmp, "history/0001-abc/frames/f001-verify/scoped/verifications.md"), "utf-8"),
          "- V1: pending\n",
        );
      });
    });
    ```

- [ ] **Step 2: Run the test (confirm it passes; this test exercises Node's built-in cpSync)**

    Run: `npm test -- --test-name-pattern="frames/ snapshot"`
    Expected: PASS (the test doesn't depend on any project code — it verifies cpSync semantics).

- [ ] **Step 3: Update the `snapshot` function in `src/main.ts`**

    Replace the current body of `snapshot(cycle, hash)` with:

    ```typescript
    function snapshot(cycle: number, hash: string): void {
      const dir = resolve(HISTORY_DIR, `${String(cycle).padStart(4, "0")}-${hash}`);
      mkdirSync(dir, { recursive: true });
      // Recursive copy of the entire frames/ subtree preserves per-frame
      // INSTRUCTIONS.md, MEMORY.md, and scoped/* for every live frame.
      const framesSrc = resolve(BASE_DIR, "frames");
      if (existsSync(framesSrc)) {
        cpSync(framesSrc, resolve(dir, "frames"), { recursive: true });
      }
      if (existsSync(CALL_STACK_PATH)) {
        copyFileSync(CALL_STACK_PATH, resolve(dir, ".call-stack.json"));
      }
    }
    ```

    Add `cpSync` to the `fs` import at the top of `main.ts`.

- [ ] **Step 4: Run full suite**

    Run: `npm run build && npm test`
    Expected: PASS for everything except the still-red phase-1-*.test.ts and phase-2-cove.test.ts (until T13–T16).

- [ ] **Step 5: Commit**

    ```bash
    git add src/main.ts src/test/phase-2b-snapshot.test.ts
    git commit -m "feat(main): history snapshot now captures the whole frames/ subtree (satisfies: R8, R41)"
    ```

---

## Task 9: Rewrite new-instance.sh for frames/f000-strategy/ layout (satisfies: R7, R39, R40)

**Files:**
- Modify: `new-instance.sh`

- [ ] **Step 1: Replace `new-instance.sh` with the new layout logic**

    Key changes:
    - Create `$DIR/frames/f000-strategy/scoped/` instead of placing INSTRUCTIONS.md/MEMORY.md at `$DIR/`.
    - Copy the interpreter's `INSTRUCTIONS.md` to `$DIR/frames/f000-strategy/INSTRUCTIONS.md`.
    - Copy interpreter support `.md` files (other than `INSTRUCTIONS.md` and `PROGRAM.md`) to `$DIR/frames/f000-strategy/<base>` — they're strategy-scoped.
    - Copy the interpreter's `PROGRAM.md` (if present) to `$DIR/PROGRAM.md` — PROGRAM stays at instance root. If the interpreter doesn't have one, write the default template at the instance root as today.
    - Copy the interpreter's `dynamics/` to `$DIR/dynamics/` (instance root) — unchanged from today.
    - Write `$DIR/.call-stack.json` with the root frame entry pre-populated.
    - Write `$DIR/frames/f000-strategy/MEMORY.md` with `## State\nempty\n`.
    - Leave `.gitignore`, `run.sh`, `.env`, `.api_key` at the instance root (unchanged locations and contents).
    - Do NOT create `$DIR/INSTRUCTIONS.md` or `$DIR/MEMORY.md` at the instance root.

    Concrete replacement (append a full new script body; the prior 1-layer layout code is removed in the same edit):

    ```bash
    #!/usr/bin/env bash
    set -euo pipefail

    if [ -z "${1:-}" ]; then
      echo "Usage: ./new-instance.sh <name> [interpreter-path]"
      exit 1
    fi

    NAME="$1"
    INTERPRETER="${2:-}"
    DIR="instances/$NAME"
    SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

    if [ -d "$DIR" ]; then
      echo "Error: instance '$NAME' already exists at $DIR"
      exit 1
    fi

    mkdir -p "$DIR/frames/f000-strategy/scoped"

    # INSTRUCTIONS.md + support files (strategy-scoped)
    if [ -n "$INTERPRETER" ]; then
      INTERP_DIR="$SCRIPT_DIR/$INTERPRETER"
      if [ ! -f "$INTERP_DIR/INSTRUCTIONS.md" ]; then
        echo "Error: interpreter at '$INTERP_DIR' has no INSTRUCTIONS.md"
        exit 1
      fi
      cp "$INTERP_DIR/INSTRUCTIONS.md" "$DIR/frames/f000-strategy/INSTRUCTIONS.md"

      # Support files (role descriptions, test harnesses, etc.): strategy-scoped.
      # Excludes INSTRUCTIONS.md (above) and PROGRAM.md (instance root, below).
      for f in "$INTERP_DIR"/*.md; do
        [ -e "$f" ] || continue
        base="$(basename "$f")"
        if [ "$base" != "INSTRUCTIONS.md" ] && [ "$base" != "PROGRAM.md" ]; then
          cp "$f" "$DIR/frames/f000-strategy/$base"
        fi
      done

      # Dynamics: shared across all frames, at instance root.
      if [ -d "$INTERP_DIR/dynamics" ]; then
        cp -r "$INTERP_DIR/dynamics" "$DIR/dynamics"
      fi

      # PROGRAM.md: instance root.
      if [ -f "$INTERP_DIR/PROGRAM.md" ]; then
        cp "$INTERP_DIR/PROGRAM.md" "$DIR/PROGRAM.md"
      else
        cat > "$DIR/PROGRAM.md" << 'EOF'
    # Goal
    (describe the goal here)

    ## Step 1: (first high-level step)
    (describe what to do)

    ## Step 2: (second high-level step)
    (describe what to do)
    EOF
      fi
    else
      cat > "$DIR/frames/f000-strategy/INSTRUCTIONS.md" << 'INSTEOF'
    # Strategy

    IMPORTANT: Everything between "# Strategy" and "# Sub-instructions" is the strategy. It must be copied VERBATIM into every update_instructions call. Never modify, summarize, or omit any strategy instruction. Only the "# Sub-instructions" section below changes.

    ## Instruction: Initialize
    **Condition:** MEMORY state is "empty"
    **Action:** Read ../../PROGRAM.md to understand the goal. Set MEMORY state to "strategy_ready" with a note about the overall plan.

    ## Instruction: Load next program step
    **Condition:** MEMORY state is "strategy_ready"
    **Action:** Read ../../PROGRAM.md. Find the first step not marked done in MEMORY. Decompose it into 2-4 concrete sub-instructions for the CURRENT step only. Write them in the "# Sub-instructions" section below. Each action sub-instruction must be followed by a verification sub-instruction. The LAST sub-instruction must always be:

      ## Instruction: Step complete
      **Condition:** MEMORY state is "<final_verified_state>"
      **Action:** Mark the current program step as done in MEMORY. Set state to "strategy_ready".

    If all steps in PROGRAM.md are done, set MEMORY state to "done" instead. Set MEMORY state to the first sub-instruction's expected state. Remember: copy the ENTIRE strategy section above verbatim when calling update_instructions.

    ## Instruction: Finish
    **Condition:** MEMORY state is "done"
    **Action:** Call halt with a summary of what was accomplished.

    # Sub-instructions

    (none yet — the "Load next program step" instruction will populate these)
    INSTEOF
      cat > "$DIR/PROGRAM.md" << 'EOF'
    # Goal
    (describe the goal here)

    ## Step 1: (first high-level step)
    (describe what to do)

    ## Step 2: (second high-level step)
    (describe what to do)
    EOF
    fi

    # Strategy's MEMORY: canonical fresh-state shape.
    cat > "$DIR/frames/f000-strategy/MEMORY.md" << 'EOF'
    ## State
    empty
    EOF

    # Call stack: root frame pre-populated per Phase 2b R17.
    echo '{"nextCounter":1,"stack":[{"returnState":"<root>","frameDir":"frames/f000-strategy"}]}' > "$DIR/.call-stack.json"

    # .gitignore
    cat > "$DIR/.gitignore" << 'EOF'
    .api_key
    .env
    .telegram-state.json
    logs/
    history/
    workspace/.git/
    EOF

    # run.sh (unchanged from Phase 2).
    cat > "$DIR/run.sh" << 'RUNEOF'
    #!/usr/bin/env bash
    set -euo pipefail

    INSTANCE_DIR="$(cd "$(dirname "$0")" && pwd)"
    PROJECT_ROOT="$(cd "$INSTANCE_DIR/../.." && pwd)"
    KEY_FILE="$INSTANCE_DIR/.api_key"

    export TURING_PROVIDER="${TURING_PROVIDER:-claude-code}"

    if [ "$TURING_PROVIDER" = "api" ]; then
      if [ -z "${ANTHROPIC_API_KEY:-}" ]; then
        if [ -f "$KEY_FILE" ]; then
          ANTHROPIC_API_KEY="$(cat "$KEY_FILE")"
        else
          read -rsp "ANTHROPIC_API_KEY: " ANTHROPIC_API_KEY
          echo
          echo "$ANTHROPIC_API_KEY" > "$KEY_FILE"
          chmod 600 "$KEY_FILE"
        fi
        export ANTHROPIC_API_KEY
      fi
    fi

    cd "$INSTANCE_DIR"
    node "$PROJECT_ROOT/dist/main.js"
    RUNEOF
    chmod +x "$DIR/run.sh"

    echo "Instance '$NAME' created at $DIR/"
    if [ -n "$INTERPRETER" ]; then
      echo "  Interpreter: $INTERPRETER"
    fi
    echo "  1. Edit $DIR/PROGRAM.md with your goal and high-level steps"
    echo "  2. Run:  $DIR/run.sh"
    ```

- [ ] **Step 2: Smoke-test the new script**

    Run:
    ```bash
    ./new-instance.sh _smoke-2b interpreters/1-iterative-refinement/d-cove
    ls -la instances/_smoke-2b/
    ls -la instances/_smoke-2b/frames/f000-strategy/
    cat instances/_smoke-2b/.call-stack.json
    ```
    Expected output confirms: `PROGRAM.md`, `dynamics/`, `frames/f000-strategy/`, `run.sh`, `.gitignore` at instance root; `INSTRUCTIONS.md`, `MEMORY.md`, `scoped/` inside `frames/f000-strategy/`; `.call-stack.json` contains the root frame entry.

    Clean up: `rm -rf instances/_smoke-2b`

- [ ] **Step 3: Commit**

    ```bash
    git add new-instance.sh
    git commit -m "feat(new-instance.sh): create frames/f000-strategy/ layout with root call-stack entry (satisfies: R7, R39, R40)"
    ```

---

## Task 10: Delete every existing instances/<name>/ directory (satisfies: R44)

**Files:**
- Delete: `instances/demo-1a`, `instances/demo-1b`, `instances/demo-1b-b`, `instances/demo-1c`, `instances/p2-cove`, `instances/p2-cove-20`, and any others present at the time.

- [ ] **Step 1: Inventory existing instance directories**

    Run: `ls instances/`
    Expected output at this commit: `demo-1a  demo-1b  demo-1b-b  demo-1c  p2-cove  p2-cove-20` (or a superset if more instances were created during development).

- [ ] **Step 2: Remove them**

    Run:
    ```bash
    for d in instances/*/; do rm -rf "$d"; done
    ls instances/
    ```
    Expected output: empty (the `instances/` directory itself remains).

- [ ] **Step 3: Commit**

    `instances/` is gitignored; there are no tracked files to stage. The commit is a no-op from git's perspective, but the commit message documents the cleanup for the audit trail:

    ```bash
    git commit --allow-empty -m "chore(instances): delete pre-Phase-2b instances (satisfies: R44)

    Deleted:
      instances/demo-1a
      instances/demo-1b
      instances/demo-1b-b
      instances/demo-1c
      instances/p2-cove
      instances/p2-cove-20
    No migration performed; no archive retained. Per R43/R44, pre-Phase-2b
    instances cannot resume under the new layout."
    ```

---

## Task 11: Update src/prompt.ts with frame-context + surgical-edit subsections (satisfies: R19, R20, R38)

**Files:**
- Modify: `src/prompt.ts`

- [ ] **Step 1: Read the existing system prompt to find the insertion point**

    Run: `grep -n '# MEMORY.md\|# How it works' src/prompt.ts`
    Expected: find the `# MEMORY.md` heading; new subsections go immediately before it.

- [ ] **Step 2: Add the frame-context subsection BEFORE the existing `# MEMORY.md` recipe**

    Insert this new subsection immediately before the `# MEMORY.md` heading in `BASE_SYSTEM_PROMPT`:

    ```
    # Your frame

    You are running inside a frame-specific directory at
    \`instances/<name>/frames/f<NNN>-<slug>/\`. Your cwd is this directory.
    Paths you reference resolve as follows:

    - \`./MEMORY.md\` — your frame's MEMORY (write via the recipe below).
    - \`./INSTRUCTIONS.md\` — your frame's program.
    - \`./scoped/\` — your frame's scratch directory for structured state (drafts, lists, tables).
    - \`../../PROGRAM.md\` — the shared user program (read-only).
    - \`../../workspace/\` — the shared project artifacts directory with its own git repo; the \`git\` tool operates there.

    These relative paths are invariant regardless of stack depth: every frame sits one directory below \`instances/<name>/frames/\`, so \`../..\` always lands at the instance root.
    ```

- [ ] **Step 3: Add the surgical-edit subsection AFTER the existing `# MEMORY.md` recipe**

    Insert this new subsection immediately after the existing `# MEMORY.md` subsection (and its canonical `cat > MEMORY.md << MEMEOF` example):

    ```
    # Mutating other files

    For every file other than \`./MEMORY.md\`, \`./INSTRUCTIONS.md\`, and \`../../PROGRAM.md\`, DO NOT rewrite the file wholesale. Use in-place surgical edits: \`sed -i\`, \`awk\` piped to a temp-file rename, \`echo >>\` for appends. Wholesale rewrites of structured files (bullet lists, tables) are a silent drift source: if a list has N entries and you re-emit N-1 while trying to update one, you have lost data without any tool error firing. Surgical edits cannot forget what they did not name.

    Examples:
    - Mark the first pending bullet as answered:
      \`sed -i '0,/^- V[0-9]\\+:.*pending$/{s/pending$/answered: <text>/}' ./scoped/verifications.md\`
    - Append a new bullet to a list:
      \`echo "- L<N>: <text>" >> ./scoped/lessons.md\`
    - Read a single entry:
      \`grep '^- V3:' ./scoped/verifications.md\`
    ```

- [ ] **Step 4: Build**

    Run: `npm run build`
    Expected: PASS (pure string literal changes).

- [ ] **Step 5: Commit**

    ```bash
    git add src/prompt.ts
    git commit -m "feat(prompt): add frame-context + surgical-edit subsections (satisfies: R19, R20, R38)"
    ```

---

## Task 12: Add scripted integration test phase-2b-returns.test.ts (satisfies: R33)

**Files:**
- Create: `src/test/phase-2b-returns.test.ts`

- [ ] **Step 1: Write the test**

    Create `src/test/phase-2b-returns.test.ts`:

    ```typescript
    import { test, describe, beforeEach, afterEach } from "node:test";
    import { strict as assert } from "node:assert";
    import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync, existsSync } from "fs";
    import { resolve } from "path";
    import { tmpdir } from "os";
    import { applyPush, applyPop, type CallStack } from "../call-stack.js";

    describe("phase-2b end-to-end push/pop/splice", () => {
      let tmp: string;
      beforeEach(() => { tmp = mkdtempSync(resolve(tmpdir(), "turing-p2b-")); });
      afterEach(() => { rmSync(tmp, { recursive: true, force: true }); });

      function setupRoot(): { cs: CallStack; rootMemPath: string } {
        mkdirSync(resolve(tmp, "frames/f000-strategy/scoped"), { recursive: true });
        const rootMemPath = resolve(tmp, "frames/f000-strategy/MEMORY.md");
        writeFileSync(rootMemPath, "## State\ndrafted\n## Draft\nclaim X\n## Push\ndynamics/verify.md\n## Push-Args\ndraft: |\n  claim X", "utf-8");
        const cs: CallStack = {
          nextCounter: 1,
          stack: [{ returnState: "<root>", frameDir: "frames/f000-strategy" }],
        };
        return { cs, rootMemPath };
      }

      test("push creates child frame, pop splices ## Return into caller on disk", () => {
        const { cs, rootMemPath } = setupRoot();
        const rootMem = readFileSync(rootMemPath, "utf-8");

        // Push.
        const pushed = applyPush(cs, rootMem, (p) =>
          p === "dynamics/verify.md" ? "# Dynamic: Verify\nDraft: {{draft}}" : null,
        );
        assert.equal(pushed.ok, true);
        if (!pushed.ok) return;

        // Main.ts-side filesystem effects.
        mkdirSync(resolve(tmp, pushed.frameDir, "scoped"), { recursive: true });
        writeFileSync(resolve(tmp, pushed.frameDir, "MEMORY.md"), pushed.childMemory, "utf-8");
        writeFileSync(resolve(tmp, pushed.frameDir, "INSTRUCTIONS.md"), pushed.childInstructions, "utf-8");
        writeFileSync(rootMemPath, pushed.callerMemoryAfter, "utf-8");

        // Verify caller's MEMORY.md still exists on disk (it WASN'T obliterated)
        const callerAfterPush = readFileSync(rootMemPath, "utf-8");
        assert.match(callerAfterPush, /## State\ndrafted/);
        assert.match(callerAfterPush, /## Draft\nclaim X/);
        assert.doesNotMatch(callerAfterPush, /## Push/);
        assert.doesNotMatch(callerAfterPush, /## Push-Args/);

        // Simulate child writing its ## Return and state=done.
        const childMemory = "## State\ndone\n## Return\nrevised: revised answer\n";
        writeFileSync(resolve(tmp, pushed.frameDir, "MEMORY.md"), childMemory, "utf-8");

        // Pop.
        const popped = applyPop(pushed.callStack, childMemory, (frameDir, file) => {
          return readFileSync(resolve(tmp, frameDir, file), "utf-8");
        });
        assert.equal(popped.callStack.stack.length, 1);
        assert.equal(popped.callerFrameDir, "frames/f000-strategy");

        // Main.ts would write this and rmSync the child frame.
        writeFileSync(rootMemPath, popped.callerMemoryAfter, "utf-8");
        rmSync(resolve(tmp, pushed.frameDir), { recursive: true, force: true });

        // Verify on-disk end state.
        const final = readFileSync(rootMemPath, "utf-8");
        assert.match(final, /## State\ndrafted_completed/);
        assert.match(final, /## Draft\nclaim X/);
        assert.match(final, /## Revised\nrevised answer/);
        assert.equal(existsSync(resolve(tmp, pushed.frameDir)), false);
      });

      test("caller MEMORY survives multiple push/pop cycles (no obliteration)", () => {
        // This is the motivating test — verify.md-style scenario: strategy
        // pushes verify, verify pushes answer-indep (depth 2), pop, pop.
        const { cs, rootMemPath } = setupRoot();
        // Replace root memory with a richer state that has ## Draft persisting.
        writeFileSync(
          rootMemPath,
          "## State\ndrafted\n## Draft\nmulti-claim draft\n## Push\ndynamics/verify.md\n## Push-Args\ndraft: |\n  multi-claim draft",
          "utf-8",
        );
        const rootMem0 = readFileSync(rootMemPath, "utf-8");

        // Push verify.
        const push1 = applyPush(cs, rootMem0, (p) =>
          p === "dynamics/verify.md" ? "# verify\n{{draft}}" : null,
        );
        assert.equal(push1.ok, true);
        if (!push1.ok) return;
        mkdirSync(resolve(tmp, push1.frameDir, "scoped"), { recursive: true });
        writeFileSync(resolve(tmp, push1.frameDir, "MEMORY.md"), push1.childMemory, "utf-8");
        writeFileSync(rootMemPath, push1.callerMemoryAfter, "utf-8");

        // verify writes its ## Verifications into its scoped file.
        writeFileSync(
          resolve(tmp, push1.frameDir, "scoped/verifications.md"),
          "- V1: q1; pending\n- V2: q2; pending\n",
          "utf-8",
        );
        // verify now has state=asking, pushes answer-indep.
        writeFileSync(
          resolve(tmp, push1.frameDir, "MEMORY.md"),
          "## State\nasking\n## Push\ndynamics/answer-independently.md\n## Push-Args\nquestion: |\n  q1",
          "utf-8",
        );
        const verifyMem = readFileSync(resolve(tmp, push1.frameDir, "MEMORY.md"), "utf-8");

        // Push answer-indep.
        const push2 = applyPush(push1.callStack, verifyMem, (p) =>
          p === "dynamics/answer-independently.md" ? "# ans\n{{question}}" : null,
        );
        assert.equal(push2.ok, true);
        if (!push2.ok) return;
        assert.equal(push2.callStack.stack.length, 3);  // strategy + verify + answer-indep

        // answer-indep runs, sets state=done, emits ## Return.
        const childMem = "## State\ndone\n## Return\nanswer: yes, q1 is true\n";

        // Pop answer-indep.
        const pop1 = applyPop(push2.callStack, childMem, (fd, f) =>
          readFileSync(resolve(tmp, fd, f), "utf-8"),
        );
        assert.equal(pop1.callStack.stack.length, 2);
        assert.equal(pop1.callerFrameDir, push1.frameDir);
        // verify's MEMORY got a ## Answer splice.
        assert.match(pop1.callerMemoryAfter, /## Answer\nyes, q1 is true/);

        // Critical assertion: verify.md's scoped/verifications.md is UNTOUCHED.
        const verifsOnDisk = readFileSync(
          resolve(tmp, push1.frameDir, "scoped/verifications.md"),
          "utf-8",
        );
        assert.equal(verifsOnDisk, "- V1: q1; pending\n- V2: q2; pending\n");

        // Critical assertion: strategy's ## Draft is UNTOUCHED on disk.
        const stratDraft = readFileSync(rootMemPath, "utf-8");
        assert.match(stratDraft, /## Draft\nmulti-claim draft/);
      });
    });
    ```

- [ ] **Step 2: Run the test**

    Run: `npm run build && npm test -- --test-name-pattern="phase-2b end-to-end"`
    Expected: PASS — exercises the fully wired Phase 2b push/pop plus splicing with real filesystem I/O.

- [ ] **Step 3: Commit**

    ```bash
    git add src/test/phase-2b-returns.test.ts
    git commit -m "test(phase-2b): end-to-end push/pop/splice with no-obliteration assertion (satisfies: R33)"
    ```

---

## Task 13: Migrate a-self-refine (satisfies: R21, R32)

**Files:**
- Modify: `interpreters/1-iterative-refinement/a-self-refine/INSTRUCTIONS.md`
- Modify: `interpreters/1-iterative-refinement/a-self-refine/dynamics/self-critique.md`
- Modify: `src/test/phase-1-self-refine.test.ts`

- [ ] **Step 1: Rewrite `interpreters/1-iterative-refinement/a-self-refine/INSTRUCTIONS.md`**

    Replace the strategy to use `./scoped/draft.md` and splice-based returns:

    ```markdown
    # Strategy: Self-Refine

    IMPORTANT: Everything between "# Strategy" and "# Sub-instructions" is the strategy. It must be copied VERBATIM into every update_instructions call. Never modify, summarize, or omit any strategy instruction. Only the "# Sub-instructions" section below changes.

    This interpreter implements the Self-Refine pattern (patterns.md Group 1). A single role drafts into `./scoped/draft.md`, critiques its own draft via the `self-critique.md` dynamic (which receives `{{draft}}` as a push-arg and returns `critique` + `refined` via `## Return`), and decides whether to accept or loop. No memory carries across iterations beyond the current `./scoped/draft.md`.

    ## Instruction: Initialize
    **Condition:** MEMORY state is "empty"
    **Action:** Read `../../PROGRAM.md`. Produce an initial draft addressing the task and write it to `./scoped/draft.md` (wholesale `cat > ./scoped/draft.md << EOF ... EOF` is fine — a draft is a single blob). Set MEMORY state to "drafted".

    ## Instruction: Request critique
    **Condition:** MEMORY state is "drafted" and `./scoped/draft.md` exists
    **Action:** Read `./scoped/draft.md` and append the following to `./MEMORY.md` (do not change state — the shell will set it to "empty" when it pushes the dynamic):

        ## Push
        dynamics/self-critique.md
        ## Push-Args
        draft: |
          <verbatim contents of ./scoped/draft.md, every line indented two spaces>

    ## Instruction: Evaluate refinement
    **Condition:** MEMORY state is "drafted_completed" and both `## Critique` and `## Refined` are present in MEMORY
    **Action:** Decide whether `## Refined` adequately addresses the task in `../../PROGRAM.md`. If it is accepted, set state to "done". If not accepted, overwrite `./scoped/draft.md` wholesale with the content of `## Refined` (`cat > ./scoped/draft.md << EOF ... EOF`), remove the `## Critique` and `## Refined` sections from MEMORY (by not emitting them in the next MEMORY rewrite), and set state to "drafted" (which re-enters "Request critique").

    ## Instruction: Finish
    **Condition:** MEMORY state is "done"
    **Action:** Call halt with a short summary that includes the final contents of `./scoped/draft.md`.

    # Sub-instructions

    (none — this interpreter needs none.)
    ```

- [ ] **Step 2: Rewrite `interpreters/1-iterative-refinement/a-self-refine/dynamics/self-critique.md`**

    ```markdown
    # Dynamic: Self-Critique

    Receives argument: {{draft}}.
    Produced MEMORY: ## State done + ## Return block with keys `critique`, `refined`.
    Return: state done → caller sees {caller_state}_completed, and ## Return entries are spliced into caller's MEMORY as ## Critique and ## Refined.

    ## Instruction: Critique
    **Condition:** MEMORY state is "empty"
    **Action:** Critique the draft below — describe concrete strengths, weaknesses, and specific improvements to make. Write the critique to a scratch section `## CritiqueScratch` in MEMORY. Set state to "critiqued".

    Draft:
    {{draft}}

    ## Instruction: Refine
    **Condition:** MEMORY state is "critiqued" and `## CritiqueScratch` is present
    **Action:** Read `## CritiqueScratch`. Produce an improved version of the draft below that addresses every critique point. Write MEMORY with state=done plus a `## Return` section containing `critique` (copied from `## CritiqueScratch`) and `refined` (the improved version), both as block scalars:

        ## State
        done
        ## Return
        critique: |
          <verbatim contents of ## CritiqueScratch, every line indented two spaces>
        refined: |
          <your refined draft, every line indented two spaces>

    Draft:
    {{draft}}
    ```

- [ ] **Step 3: Update `src/test/phase-1-self-refine.test.ts`**

    The test no longer constructs `## Draft` inline in MEMORY for the strategy; instead, `./scoped/draft.md` holds the draft and the strategy's `Request critique` emits `## Push-Args` with `draft: |` substituted from it. The self-critique dynamic now returns `critique` + `refined` via `## Return` rather than writing `## Critique` / `## Refined` directly.

    Rewrite the integration tests to match:
    - Remove assertions that the dynamic writes `## Critique` / `## Refined` to MEMORY directly.
    - Add assertions: after the pop, the caller's MEMORY has `## Critique\n...` and `## Refined\n...` sections (spliced by the shell).
    - Update the test's memory-construction helpers to write `./scoped/draft.md` as a file in a temp dir, with the strategy's push emitting `## Push-Args` with the draft content.

    (Due to length, the executor should model the test on `src/test/phase-2b-returns.test.ts` from T12 — same temp-dir harness, same push/pop walk, but with the a-self-refine dynamic loaded.)

- [ ] **Step 4: Build and run**

    Run: `npm run build && npm test -- --test-name-pattern="self-refine"`
    Expected: PASS.

- [ ] **Step 5: Run full suite**

    Run: `npm test`
    Expected: PASS for self-refine; b/c/d still red until their own retrofit tasks.

- [ ] **Step 6: Commit**

    ```bash
    git add interpreters/1-iterative-refinement/a-self-refine/INSTRUCTIONS.md \
            interpreters/1-iterative-refinement/a-self-refine/dynamics/self-critique.md \
            src/test/phase-1-self-refine.test.ts
    git commit -m "refactor(a-self-refine): migrate to scoped draft + ## Return splicing (satisfies: R21, R32)"
    ```

---

## Task 14: Migrate b-evaluator-optimizer (satisfies: R22, R25, R32)

**Files:**
- Modify: `interpreters/1-iterative-refinement/b-evaluator-optimizer/INSTRUCTIONS.md`
- Modify: `interpreters/1-iterative-refinement/b-evaluator-optimizer/dynamics/evaluate.md`
- Modify: `src/test/phase-1-evaluator-optimizer.test.ts`

- [ ] **Step 1: Rewrite `INSTRUCTIONS.md`** — strategy uses `./scoped/attempt.md` + `./scoped/criterion.md`. Initialize reads `../../PROGRAM.md`, copies its `## Acceptance Criterion` section to `./scoped/criterion.md`, produces first attempt, writes to `./scoped/attempt.md`. Request-evaluation pushes `dynamics/evaluate.md` with `attempt` + `criterion` as push-args. Handle-verdict reads `## Verdict` + `## Feedback` (spliced by shell), rewrites `./scoped/attempt.md` wholesale on fail.

- [ ] **Step 2: Rewrite `dynamics/evaluate.md`** — receives `{{attempt}}` and `{{criterion}}` (Phase 2 behaviour); the single `Judge` instruction now writes `## Return` with `verdict: pass|fail` and `feedback: <text>` instead of writing `## Verdict` / `## Feedback` sections directly.

- [ ] **Step 3: Update `src/test/phase-1-evaluator-optimizer.test.ts`** — same pattern as T13: temp-dir harness, strategy's scoped files on disk, pushes include `## Push-Args` read from `./scoped/*.md`, pop splices verdict + feedback into caller's MEMORY.

- [ ] **Step 4: Build + run targeted**

    Run: `npm run build && npm test -- --test-name-pattern="evaluator-optimizer"`
    Expected: PASS.

- [ ] **Step 5: Run dynamics-identity test**

    Run: `npm test -- --test-name-pattern="dynamics-identity"`
    Expected: FAIL — b's evaluate.md no longer matches c's yet (c's isn't migrated). This is the same intentional mid-refactor state as Phase 2's T5. Task 15 restores byte-equality.

- [ ] **Step 6: Commit**

    ```bash
    git add interpreters/1-iterative-refinement/b-evaluator-optimizer/INSTRUCTIONS.md \
            interpreters/1-iterative-refinement/b-evaluator-optimizer/dynamics/evaluate.md \
            src/test/phase-1-evaluator-optimizer.test.ts
    git commit -m "refactor(b-evaluator-optimizer): migrate to scoped files + ## Return (satisfies: R22, R32)

    phase-1-dynamics-identity fails at this commit; T15 restores byte-equality."
    ```

---

## Task 15: Migrate c-reflexion with lessons.md surgical append (satisfies: R23, R25, R26, R32)

**Files:**
- Modify: `interpreters/1-iterative-refinement/c-reflexion/INSTRUCTIONS.md`
- Modify: `interpreters/1-iterative-refinement/c-reflexion/dynamics/evaluate.md` (cp from b's)
- Modify: `interpreters/1-iterative-refinement/c-reflexion/dynamics/reflect.md`
- Modify: `src/test/phase-1-reflexion.test.ts`

- [ ] **Step 1: Sync c's `evaluate.md` byte-equal with b's**

    Run:
    ```bash
    cp interpreters/1-iterative-refinement/b-evaluator-optimizer/dynamics/evaluate.md \
       interpreters/1-iterative-refinement/c-reflexion/dynamics/evaluate.md
    ```

- [ ] **Step 2: Rewrite `INSTRUCTIONS.md`** — strategy uses `./scoped/attempt.md`, `./scoped/criterion.md`, `./scoped/lessons.md`. Initialize creates empty `lessons.md`. Attempt reads `criterion.md` + `lessons.md`, writes new `attempt.md`. Accumulate-lesson appends `- L<N>: <text>` to `lessons.md` surgically via `echo >>`. Action text explicitly forbids `cat > ./scoped/lessons.md` (wholesale rewrite) and states the only permitted mutation is `echo "- L<N>: ..." >> ./scoped/lessons.md`.

- [ ] **Step 3: Rewrite `dynamics/reflect.md`** — receives `{{attempt}}`, `{{verdict}}`, `{{feedback}}` (Phase 2 behaviour); single instruction writes `## Return` with `lesson: <text>` instead of `## Lesson` in MEMORY.

- [ ] **Step 4: Update `src/test/phase-1-reflexion.test.ts`** — same harness pattern; additionally assert that the strategy's `Accumulate lesson` Action text contains `echo ".*L.*" >> ./scoped/lessons.md` and does NOT contain `cat > ./scoped/lessons.md` (R23's forbidden-wholesale clause).

- [ ] **Step 5: Build + run**

    Run: `npm run build && npm test -- --test-name-pattern="reflexion|dynamics-identity"`
    Expected: PASS — reflexion tests green + dynamics-identity green again (b's and c's evaluate.md are byte-equal after the cp).

- [ ] **Step 6: Commit**

    ```bash
    git add interpreters/1-iterative-refinement/c-reflexion/INSTRUCTIONS.md \
            interpreters/1-iterative-refinement/c-reflexion/dynamics/evaluate.md \
            interpreters/1-iterative-refinement/c-reflexion/dynamics/reflect.md \
            src/test/phase-1-reflexion.test.ts
    git commit -m "refactor(c-reflexion): migrate to scoped + surgical lessons.md append (satisfies: R23, R25, R26, R32)"
    ```

---

## Task 16: Migrate d-cove with verifications.md surgical sed (satisfies: R24, R27, R32)

**Files:**
- Modify: `interpreters/1-iterative-refinement/d-cove/INSTRUCTIONS.md`
- Modify: `interpreters/1-iterative-refinement/d-cove/dynamics/verify.md`
- Modify: `interpreters/1-iterative-refinement/d-cove/dynamics/answer-independently.md`
- Modify: `src/test/phase-2-cove.test.ts`

- [ ] **Step 1: Rewrite strategy `INSTRUCTIONS.md`** — strategy owns `./scoped/draft.md`. Initialize writes the draft. Request-verification pushes `dynamics/verify.md` with `draft` push-arg. Finalize reads `## Revised` (spliced from verify's `## Return`) and halts.

- [ ] **Step 2: Rewrite `dynamics/verify.md`** — at verify's own scope. Pose-questions writes `./scoped/verifications.md` with bullet list. Ask-next appends `## Push` + `## Push-Args` (with `question: |`). Record-answer uses surgical `sed -i` to replace the first `pending` marker in `./scoped/verifications.md` with `answered: <## Answer contents>`. Build-revised reads `./scoped/verifications.md` + `{{draft}}` and writes `## Return` with `revised: <text>`. Action text explicitly forbids `cat > ./scoped/verifications.md` after the Pose step.

- [ ] **Step 3: Rewrite `dynamics/answer-independently.md`** — receives `{{question}}` (Phase 2 behaviour); single instruction writes `## Return` with `answer: <text>`. The defensive "no access to other MEMORY sections" wording can be simplified because the child's MEMORY is now physically in a different directory — the child CANNOT see caller's MEMORY unless it deliberately traverses `..`.

- [ ] **Step 4: Update `src/test/phase-2-cove.test.ts`** — update depth invariants: `stack.length === 2` = strategy + verify (R27); `stack.length === 3` = strategy + verify + answer-indep. Assert verify's Action text contains `sed -i` and does NOT contain `cat > ./scoped/verifications.md` after the Pose step.

- [ ] **Step 5: Build + run**

    Run: `npm run build && npm test`
    Expected: PASS across the whole suite (all retrofits done).

- [ ] **Step 6: Commit**

    ```bash
    git add interpreters/1-iterative-refinement/d-cove/INSTRUCTIONS.md \
            interpreters/1-iterative-refinement/d-cove/dynamics/verify.md \
            interpreters/1-iterative-refinement/d-cove/dynamics/answer-independently.md \
            src/test/phase-2-cove.test.ts
    git commit -m "refactor(d-cove): migrate to scoped verifications.md + surgical sed + ## Return (satisfies: R24, R27, R32)"
    ```

---

## Task 17: Documentation updates (satisfies: R28, R29, R30, R31, R43)

**Files:**
- Modify: `CLAUDE.md`
- Modify: `interpreters/1-iterative-refinement/README.md`
- Modify: `docs/agent-workflows/requirements.md`
- Create: `docs/agent-workflows/phase-2b-notes.md`

- [ ] **Step 1: Update `CLAUDE.md`** — add a new section after the existing "Dynamics (Call Stack)" section describing: the per-frame directory layout (`instances/<name>/frames/f<NNN>-<slug>/`), the canonical per-frame MEMORY schema (no more Scope section), frame-directory naming, cwd-based access with `../../PROGRAM.md` / `../../workspace/`, `## Return` block format + splicing semantics, the surgical-edit rule with examples, and the breaking-change note that pre-2b paused instances cannot resume (R43).

- [ ] **Step 2: Update `interpreters/1-iterative-refinement/README.md`** — the "Arguments via INSTRUCTIONS (push-args)" section now also describes returns via `## Return`, per-frame `./scoped/` directories, and links to CLAUDE.md for the shell convention.

- [ ] **Step 3: Update `docs/agent-workflows/requirements.md`** — in §Phase 2, replace the "Reuse: the arguments-via-INSTRUCTIONS convention..." bullet with a reference to Phase 2b's broader isolation model. Add a brief note that Phase 2b ships per-frame dirs + declared returns + surgical edits.

- [ ] **Step 4: Create `docs/agent-workflows/phase-2b-notes.md`** with the initial template (T18 fills in demo findings):

    ```markdown
    # Phase 2b — Implementation notes

    Captured at the end of the agent-workflows-phase-2b spec. Findings that future phases can use to avoid the same pain.

    ## Per-frame directory layout

    (To be filled. Note: anything surprising during the new-instance.sh rewrite or the cwd handoff integration.)

    ## ## Return parsing and splicing

    (To be filled. Note: any edge cases in block scalar parsing or splice-into-existing-section semantics that bit implementers.)

    ## Interpreter retrofits

    (To be filled. Note: whether LLMs follow surgical edits (sed -i, echo >>) reliably or regress to wholesale rewrites, and whether the strategy action text needs to grow more defensive.)

    ## d-cove live demo

    (To be filled by Task 18. Record: whether verifications.md persists across depth-2 push-pop cycles, whether Haiku follows surgical edits on every bullet, final ## Revised content.)

    ## a/b/c live demos

    (To be filled by Task 18. Record: cycles to halt, scoped-file contents, splicing behaviour.)

    ## Cross-cutting

    (To be filled. Breaking changes, removed code paths, anything a future Phase 2c should know.)
    ```

- [ ] **Step 5: Commit**

    ```bash
    git add CLAUDE.md interpreters/1-iterative-refinement/README.md docs/agent-workflows/requirements.md docs/agent-workflows/phase-2b-notes.md
    git commit -m "docs: document Phase 2b per-frame layout + ## Return + breaking change (satisfies: R28, R29, R30, R31, R43)"
    ```

---

## Task 18: Live demos for all four interpreters + finalize phase-2b-notes.md (satisfies: R26, R27, R34, R35, R36)

**Files:**
- Modify: `docs/agent-workflows/phase-2b-notes.md` (append findings)

- [ ] **Step 1: Run each demo end-to-end**

    For each of a, b, c, d, create a fresh instance and run it:

    ```bash
    ./new-instance.sh p2b-a interpreters/1-iterative-refinement/a-self-refine
    instances/p2b-a/run.sh
    ```

    Repeat for `p2b-b`, `p2b-c`, `p2b-d`. The `p2b-d` run uses the 20-person knights-and-knaves PROGRAM.md as shipped in d-cove.

- [ ] **Step 2: Verify acceptance gates per interpreter**

    For each instance:
    - **State=done** at halt: `grep -A1 '^## State$' instances/p2b-<x>/frames/f000-strategy/MEMORY.md | tail -1` should print `done`.
    - **Scoped files populated**: check `./scoped/` inside the root frame for the expected artifacts (draft.md for a/d, attempt.md + criterion.md for b/c, lessons.md for c).
    - **## Return splice present** for the final pop — the strategy's MEMORY.md contains the expected spliced sections (## Refined for a, ## Verdict + ## Feedback for b, ## Verdict + ## Feedback + accumulated ## Lessons for c, ## Revised for d).

    For p2b-d specifically:
    - **No obliteration drift**: find verify.md's frame dir in history; `grep -c '^- V' history/<cycle>/frames/f001-verify/scoped/verifications.md` should stay constant across cycles (no silent reconstruction).
    - **Surgical edits only**: log shows `sed -i` or `echo >>` invocations on `verifications.md`, not `cat >`.
    - **Depth-2 invariant**: at least one snapshot in history/ has `.call-stack.json` with `stack.length === 3`.

    For p2b-c specifically (R26):
    - **≥ 2 lessons**: `wc -l < instances/p2b-c/frames/f000-strategy/scoped/lessons.md` should be ≥ 2.

- [ ] **Step 3: Replace the placeholder sections in `docs/agent-workflows/phase-2b-notes.md`** with the actual findings from the four runs. At minimum document:
    - Cycle counts per demo.
    - Whether any LLM regressed to wholesale rewrites (and if so, where the strategy text was too lax).
    - Whether any demo exhausted the retry budget (R36 path).
    - Whether `## Return` parsing hit any unexpected malformed-entry paths.
    - Anything a Phase 2c should inherit.

- [ ] **Step 4: Commit**

    ```bash
    git add docs/agent-workflows/phase-2b-notes.md
    git commit -m "docs(agent-workflows): record Phase-2b implementation notes and live demo findings (satisfies: R26, R27, R34, R35, R36)"
    ```

- [ ] **Step 5: Final test sweep**

    Run: `npm test`
    Expected: PASS — full suite green.
