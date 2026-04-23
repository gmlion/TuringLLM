/**
 * config.ts — Environment and path configuration.
 *
 * Loads .env files (project-level, then instance-level override),
 * and exports all configuration constants used by the shell.
 */
import { config } from "dotenv";
import { resolve, basename } from "path";
import { existsSync } from "fs";
import type { CallStack } from "./call-stack.js";

export const BASE_DIR = process.cwd();

// Load .env: instance-level overrides project-level
const projectRoot = resolve(BASE_DIR, "../..");
const projectEnv = resolve(projectRoot, ".env");
const instanceEnv = resolve(BASE_DIR, ".env");
if (existsSync(projectEnv)) config({ path: projectEnv });
if (existsSync(instanceEnv)) config({ path: instanceEnv, override: true });

export const HISTORY_DIR = resolve(BASE_DIR, "history");
export const SYSCALLS_PATH = resolve(BASE_DIR, "SYSCALLS.md");
export const CALL_STACK_PATH = resolve(BASE_DIR, ".call-stack.json");

export const PROVIDER = process.env.TURING_PROVIDER || "claude-code";
export const STATEFUL = process.env.TURING_STATEFUL === "1";
export const INSTANCE_NAME = basename(BASE_DIR);

export const TELEGRAM_TOKEN = process.env.TELEGRAM_BOT_TOKEN || "";
export const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID || "";
export const USE_TELEGRAM = !!(TELEGRAM_TOKEN && TELEGRAM_CHAT_ID);

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
