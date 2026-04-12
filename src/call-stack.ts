/**
 * call-stack.ts — Persistence for the instruction call stack.
 *
 * The call stack enables hierarchical instruction dispatch: a running
 * instruction set can "push" a dynamic (reusable instruction file),
 * and the shell automatically restores the caller on "pop" (when the
 * dynamic sets state to "done").
 */
import { readFileSync, writeFileSync } from "fs";

export type StackEntry = { returnState: string; instructions: string };

export function loadCallStack(path: string): StackEntry[] {
  try { return JSON.parse(readFileSync(path, "utf-8")); }
  catch { return []; }
}

export function saveCallStack(path: string, stack: StackEntry[]): void {
  writeFileSync(path, JSON.stringify(stack, null, 2), "utf-8");
}
