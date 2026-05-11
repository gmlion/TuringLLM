/**
 * io.ts — Tiny file-I/O wrappers.
 *
 * `readFile` is the silent-fail variant: returns "" on any read error.
 * Most cycle-shell code wants this — a missing file means "treat as
 * empty"; a permission error treated as "empty" is preferable to a
 * crash mid-cycle, since the next cycle will see the same state and
 * surface a real diagnostic.
 *
 * `getMemoryState` and `getPendingQuestions` lift the pure parsers
 * from memory.ts to the disk by way of `readFile`.
 */

import { readFileSync } from "fs";
import { parseState, parsePendingQuestions, type PendingQuestion } from "./memory.js";

export function readFile(path: string): string {
  try { return readFileSync(path, "utf-8"); } catch { return ""; }
}

export function getMemoryState(memoryPath: string): string {
  return parseState(readFile(memoryPath));
}

export function getPendingQuestions(memoryPath: string): PendingQuestion[] {
  return parsePendingQuestions(readFile(memoryPath));
}
