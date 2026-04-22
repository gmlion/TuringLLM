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
 * state to "empty" so the dynamic starts fresh.
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
