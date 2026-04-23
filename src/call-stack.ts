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
 *
 * Legacy (pre-Phase-2b) shape is kept under the *Legacy suffix for backward
 * compatibility while T4/T5 are pending.  applyPush/applyPop are stubs that
 * throw until T4/T5 are complete.
 */
import { readFileSync, writeFileSync } from "fs";
import {
  parseState,
  parsePush,
  removePush,
  setState,
  parsePushArgs,
  removePushArgs,
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
// Phase 2b stubs — applyPush / applyPop (to be implemented in T4 / T5)
// ---------------------------------------------------------------------------

export type PopEvent = { returnState: string; depthAfter: number };

export type PopResult = {
  stack: StackEntry[];
  memory: string;
  instructions: string;
  events: PopEvent[];
};

export type PushResult =
  | {
      ok: true;
      stack: StackEntry[];
      memory: string;
      instructions: string;
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

/** Stub — full implementation coming in T5. */
export function applyPop(
  _stack: StackEntry[],
  _memory: string,
  _instructions: string,
): PopResult {
  throw new Error("applyPop: T5 not implemented yet");
}

/** Stub — full implementation coming in T4. */
export function applyPush(
  _stack: StackEntry[],
  _memory: string,
  _instructions: string,
  _readTarget: (path: string) => string | null,
): PushResult {
  throw new Error("applyPush: T4 not implemented yet");
}

// ---------------------------------------------------------------------------
// Legacy types and functions (pre-Phase-2b; used by main.ts and existing tests
// until T4/T5 rewrite the callers).
// ---------------------------------------------------------------------------

export type StackEntryLegacy = { returnState: string; instructions: string };

export function loadCallStackLegacy(path: string): StackEntryLegacy[] {
  try {
    const parsed = JSON.parse(readFileSync(path, "utf-8"));
    return Array.isArray(parsed) ? parsed : [];
  } catch { return []; }
}

export function saveCallStackLegacy(path: string, stack: StackEntryLegacy[]): void {
  writeFileSync(path, JSON.stringify(stack, null, 2), "utf-8");
}

export type PopResultLegacy = {
  stack: StackEntryLegacy[];
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
export function applyPopLegacy(
  stack: StackEntryLegacy[],
  memory: string,
  instructions: string,
): PopResultLegacy {
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

export type PushResultLegacy =
  | {
      ok: true;
      stack: StackEntryLegacy[];
      memory: string;
      instructions: string;
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
 * Handle a ## Push in MEMORY if present.
 *
 * On success: saves {returnState, instructions} onto the stack, replaces
 * instructions with the target file's contents, strips ## Push, and sets
 * state to "empty" so the dynamic starts fresh.
 *
 * On missing target: returns memory with ## Push stripped so the LLM
 * doesn't retry the same bad push every cycle; the caller logs the error.
 *
 * `readTarget` returns null for missing or empty files; otherwise the
 * target's content.
 */
export function applyPushLegacy(
  stack: StackEntryLegacy[],
  memory: string,
  instructions: string,
  readTarget: (path: string) => string | null,
): PushResultLegacy {
  const target = parsePush(memory);
  if (!target) return { ok: false, memory, reason: "no-push" };

  const args = parsePushArgs(memory);

  const targetContent = readTarget(target);
  if (!targetContent) {
    return {
      ok: false,
      memory: removePushArgs(removePush(memory)),
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
      memory: removePushArgs(removePush(memory)),
      reason: "unresolved-placeholder",
      target,
      placeholders: unresolved,
    };
  }

  const returnState = parseState(memory);
  const newStack = [...stack, { returnState, instructions }];
  const newMemory = setState(
    removePushArgs(removePush(memory)),
    "empty",
  );

  return { ok: true, stack: newStack, memory: newMemory, instructions: substituted, target };
}

// ---------------------------------------------------------------------------
// Pure helpers (shared by legacy and future Phase-2b implementations)
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
