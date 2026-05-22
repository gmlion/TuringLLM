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
 *
 * Phase 2b shape:
 *   - StackEntry: { returnState, frameDir }  (frameDir replaces inline instructions)
 *   - CallStack:  { nextCounter, stack }     (was a bare StackEntry[])
 *   - Root frame is always stack[0]; never popped.  Halt = done + stack.length === 1.
 */
import { readFileSync, writeFileSync } from "fs";
import {
  parseState,
  parsePush,
  removePush,
  setState,
  parsePushArgs,
  removePushArgs,
  getReturnBody,
  spliceReturn,
} from "./memory.js";

// ---------------------------------------------------------------------------
// Phase 2b types
// ---------------------------------------------------------------------------

export type StackEntry = {
  returnState: string;
  frameDir: string;
};

export type CallStack = {
  nextCounter: number;
  stack: StackEntry[];
};

// ---------------------------------------------------------------------------
// Phase 2b persistence — loadCallStack / saveCallStack
// ---------------------------------------------------------------------------

/**
 * Load the call stack from disk.
 *
 * Throws on absence or corruption. There is no fallback: every real instance
 * gets its root frame from `startupBootstrap` (driven by `.root-operator`),
 * and main.ts only calls `loadCallStack` AFTER ensuring `.call-stack.json`
 * exists. If we get here with a missing/invalid file, the instance state is
 * unrecoverable — better to fail loudly than to invent a frame directory
 * that doesn't match what's actually on disk.
 */
export function loadCallStack(path: string): CallStack {
  let raw: string;
  try {
    raw = readFileSync(path, "utf-8");
  } catch (err) {
    throw new Error(
      `cannot read call stack at ${path}: ${err instanceof Error ? err.message : err}. ` +
      `Recreate the instance via new-instance.sh.`,
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new Error(
      `call stack at ${path} is not valid JSON: ${err instanceof Error ? err.message : err}. ` +
      `Recreate the instance via new-instance.sh.`,
    );
  }

  const ok =
    parsed !== null &&
    typeof parsed === "object" &&
    !Array.isArray(parsed) &&
    typeof (parsed as { nextCounter?: unknown }).nextCounter === "number" &&
    Array.isArray((parsed as { stack?: unknown }).stack) &&
    (parsed as { stack: unknown[] }).stack.length > 0 &&
    (parsed as { stack: unknown[] }).stack.every(
      (e: unknown) =>
        e !== null &&
        typeof e === "object" &&
        typeof (e as StackEntry).returnState === "string" &&
        typeof (e as StackEntry).frameDir === "string",
    );

  if (!ok) {
    throw new Error(
      `call stack at ${path} has invalid shape (expected { nextCounter: number, stack: StackEntry[] } with a non-empty stack). ` +
      `Recreate the instance via new-instance.sh.`,
    );
  }
  return parsed as CallStack;
}

export function saveCallStack(path: string, callStack: CallStack): void {
  writeFileSync(path, JSON.stringify(callStack, null, 2), "utf-8");
}

// ---------------------------------------------------------------------------
// Phase 2b types — applyPop and applyPush results
// ---------------------------------------------------------------------------

export type PopEvent = {
  returnState: string;
  depthAfter: number;           // stack.length after this pop
  frameDir: string;             // popped frame's dir — caller rmSync's this
  hasReturn: boolean;           // true if child had a non-empty ## Return section
};

export type PopResult = {
  callStack: CallStack;
  callerMemoryAfter: string;    // caller's MEMORY after state transition + splice
  callerFrameDir: string;       // relative path, e.g. "frames/f000-strategy"
  events: PopEvent[];
};

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

/**
 * Cascade-pop while state is "done" AND stack.length > 1 (root is never popped).
 *
 * Per iteration:
 *  - Pop the top frame.
 *  - Extract the verbatim body of ## Return from child memory via
 *    `getReturnBody` (may be empty → hasReturn=false).
 *  - Read caller MEMORY via readFrame(callerFrameDir, "MEMORY.md").
 *  - Transition caller state to {returnState}_completed via setState.
 *  - Splice the return body into caller memory under ## Popped Return
 *    via `spliceReturn` (NOT per-key splay — see spliceReturn's docs).
 *  - Record a PopEvent.
 *  - Set currentChildMemory = callerMemory for next cascade check.
 *
 * Returns the updated CallStack, the final caller MEMORY, and the final
 * top-of-stack frameDir. If no pops occurred (state != done OR stack.length === 1),
 * returns child memory and current top-of-stack unchanged.
 *
 * ## Cascade-pop semantics: now structurally rare
 *
 * Cascade (events.length > 1) fires while `state === "done" && stack.length > 1`.
 * The loop sets caller state to `<x>_completed`, NOT `done`, so it exits after
 * one iteration in the normal case.
 *
 * The historical injection vector — child writes `state: done` in its `## Return`
 * and the per-key splay overrides the caller's `<x>_completed` back to `done` —
 * was closed by switching to a single `## Popped Return` section. A child's
 * return body now lives inside that fixed wrapper section in the caller, so it
 * cannot reach the caller's `## State` parser.
 *
 * The only remaining way for cascade to fire is the degenerate case where the
 * caller's MEMORY file on disk already contains `## State\ndone` (e.g. a stale
 * file left by a crashed prior run). The runtime warning in runStackBlock
 * remains as a safety net for that scenario.
 *
 * **Intermediate-frame MEMORY loss (degenerate-only).**
 * If cascade DOES fire, each iteration computes a transformed caller MEMORY
 * but only the FINAL caller's MEMORY is returned in `callerMemoryAfter`. The
 * caller of applyPop (currently `runStackBlock`) writes `callerMemoryAfter` to
 * `callerFrameDir/MEMORY.md` exactly once. Intermediate frame MEMORIes exist
 * only as ephemeral variables inside the while-loop. A soft warning fires when
 * events.length > 1; in practice this only triggers on the degenerate stale-file
 * scenario above.
 */
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

  while (parseState(currentChildMemory) === "done" && stack.length > 1) {
    const frame = stack.pop()!;
    const returnBody = getReturnBody(currentChildMemory);
    const callerFrameDir = stack[stack.length - 1].frameDir;
    const rawCallerMemory = readFrame(callerFrameDir, "MEMORY.md");
    let callerMemory = setState(rawCallerMemory, frame.returnState + "_completed");
    callerMemory = spliceReturn(callerMemory, returnBody);

    events.push({
      returnState: frame.returnState,
      depthAfter: stack.length,
      frameDir: frame.frameDir,
      hasReturn: returnBody !== "",
    });

    currentChildMemory = callerMemory;
    lastCallerMemory = callerMemory;
    lastCallerFrameDir = callerFrameDir;
  }

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

/**
 * Handle a ## Push in callerMemory if present.
 *
 * On success: increments callStack.nextCounter, appends a new StackEntry,
 * and returns the caller's MEMORY (with Push/Push-Args stripped) and the
 * child's MEMORY ("## State\nempty\n") and substituted instructions separately
 * so the shell can write them to different frame directories on disk.
 *
 * On failure: does NOT modify callStack or increment counter (R9).
 * Returns callerMemory with ## Push / ## Push-Args stripped (so the LLM
 * doesn't retry the same bad push).
 *
 * `readTarget` returns null for missing or empty files.
 */
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

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

const PLACEHOLDER_RE = /\{\{([a-zA-Z_][a-zA-Z0-9_]*)\}\}/g;

/**
 * Replace every {{key}} occurrence in template with args[key].
 * Unmatched keys are left in place and reported in `unresolved`
 * (deduplicated, in source order).
 *
 * Placeholder identifier rule: [a-zA-Z_][a-zA-Z0-9_]*. Anything else
 * inside {{ }} is left as literal text (no match attempted).
 */
export function substitutePlaceholders(
  template: string,
  args: Record<string, string>,
): { result: string; unresolved: string[] } {
  const unresolvedSet = new Set<string>();
  const result = template.replace(PLACEHOLDER_RE, (match, key) => {
    if (key in args) return args[key];
    unresolvedSet.add(key);
    return match;
  });
  return { result, unresolved: [...unresolvedSet] };
}

/**
 * Derive a filesystem-safe slug from a push-target path.
 * Example: "operators/answer-independently.md" → "answer-independently".
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
