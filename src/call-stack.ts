/**
 * call-stack.ts — Instruction call stack: persistence and per-cycle transforms.
 *
 * The call stack enables hierarchical instruction dispatch: a running
 * instruction set can "push" a dynamic (reusable instruction file), and
 * the shell automatically restores the caller on "pop" (when the dynamic
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
  parseReturn,
  spliceReturns,
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
// Phase 2b persistence constants and helpers
// ---------------------------------------------------------------------------

const ROOT_FRAME_DIR = "frames/f000-strategy";
const ROOT_RETURN_STATE = "<root>";

function freshCallStack(): CallStack {
  return {
    nextCounter: 1,
    stack: [{ returnState: ROOT_RETURN_STATE, frameDir: ROOT_FRAME_DIR }],
  };
}

// ---------------------------------------------------------------------------
// Phase 2b persistence — loadCallStack / saveCallStack
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Phase 2b types — applyPop and applyPush results
// ---------------------------------------------------------------------------

export type PopEvent = {
  returnState: string;
  depthAfter: number;           // stack.length after this pop
  frameDir: string;             // popped frame's dir — caller rmSync's this
  splicedKeys: string[];        // keys from ## Return that were spliced into caller MEMORY
  missingReturn: boolean;       // true if child had state=done but no ## Return section
  malformedLines: string[];     // malformed ## Return entries (logged by caller)
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
 *  - Parse ## Return from child memory (may be absent → missingReturn=true).
 *  - Read caller MEMORY via readFrame(callerFrameDir, "MEMORY.md").
 *  - Transition caller state to {returnState}_completed via setState.
 *  - Splice return entries into caller memory via spliceReturns.
 *  - Record a PopEvent.
 *  - Set currentChildMemory = callerMemory for next cascade check.
 *
 * Returns the updated CallStack, the final caller MEMORY, and the final
 * top-of-stack frameDir. If no pops occurred (state != done OR stack.length === 1),
 * returns child memory and current top-of-stack unchanged.
 *
 * ## Cascade-pop semantics and the intermediate-frame loss caveat
 *
 * **When does cascade fire?**
 * Cascade (events.length > 1) fires while `state === "done" && stack.length > 1`.
 * In normal operation this rarely produces more than one pop per call because
 * `setState(callerMemory, frame.returnState + "_completed")` transitions the
 * caller's state to `<x>_completed`, NOT `done`. The while-loop therefore exits
 * after a single iteration.
 *
 * The only way cascade fires for real is if the caller's MEMORY still ends up
 * with `state === "done"` AFTER the setState + spliceReturns pass. That can
 * happen when the child's `## Return` section contains a `state: done` entry —
 * because `spliceReturns` treats `state` as just another key and upserts a
 * `## State\ndone` section into the caller's MEMORY, overwriting the
 * `<x>_completed` value that `setState` just wrote. Short of that, cascade
 * requires the caller's MEMORY file on disk to already contain `## State\ndone`
 * (e.g. a stale file from a prior run), which is a degenerate scenario.
 *
 * **Intermediate-frame MEMORY loss.**
 * When cascade DOES fire (events.length > 1), each iteration computes a
 * transformed caller MEMORY (setState + spliceReturns) but only the FINAL
 * caller's MEMORY is returned in `callerMemoryAfter`. The caller of applyPop
 * (currently `runStackBlock` in main.ts) writes `callerMemoryAfter` to
 * `callerFrameDir/MEMORY.md` exactly once. Intermediate frame MEMORIes —
 * the computed strings for frames between the leaf and the final caller — are
 * never written to disk. They exist only as ephemeral variables inside the
 * while-loop and are then discarded.
 *
 * This is benign today because cascade is structurally rare (see above).
 * If a future change makes cascade common, callers must iterate `events` and
 * write each intermediate frame's MEMORY to its `frameDir/MEMORY.md` before
 * issuing the rmSync that deletes it. A soft warning is emitted by
 * `runStackBlock` whenever `events.length > 1` to surface this scenario.
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
