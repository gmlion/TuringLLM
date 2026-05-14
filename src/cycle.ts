/**
 * cycle.ts — Per-cycle bookkeeping helpers.
 *
 * Each cycle ends with the same five steps: commit, snapshot, emit
 * instructions-changed (if any), emit machine-git-commit, emit cycle-end.
 * `commitCycleAndEmit` bundles them. `snapshot` and the helpers for
 * resuming (`getStartCycle`) and falling back when no instruction matched
 * (`handleNoMatch`) round out the module.
 */

import { copyFileSync, cpSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "fs";
import { resolve } from "path";
import { log } from "./logger.js";
import { commitCycle } from "./git.js";
import {
  emitCycleEnd, emitCycleStart, emitHalt, emitInstructionsChanged, emitMachineGitCommit,
  setCycleContext, clearCycleContext,
} from "./events.js";
import { setState } from "./memory.js";
import { BASE_DIR, CALL_STACK_PATH, HISTORY_DIR, STATEFUL, activeFramePaths } from "./config.js";
import { readFile, getMemoryState, getPendingQuestions } from "./io.js";
import { withBackoff } from "./retry.js";
import { drainProviderEvents } from "./providers/shared.js";
import { runCycle as providerRunCycle } from "./providers/dispatch.js";
import { executeSyscalls } from "./syscalls.js";
import { emitOutputMd } from "./bootstrap.js";
import { collectReplies, handleUserInteraction, postCycleUserOps } from "./interaction.js";
import { runStackBlock } from "./stack-shell.js";
import type { CallStack } from "./call-stack.js";

export function getStartCycle(): number {
  try {
    const numbers = readdirSync(HISTORY_DIR)
      .map((e) => parseInt(e.match(/^(\d+)/)?.[1] ?? "0", 10))
      .filter((n) => Number.isFinite(n));
    return Math.max(0, ...numbers) + 1;
  } catch { return 1; }
}

function snapshot(cycle: number, hash: string): void {
  const dir = resolve(HISTORY_DIR, `${String(cycle).padStart(4, "0")}-${hash}`);
  mkdirSync(dir, { recursive: true });
  const framesSrc = resolve(BASE_DIR, "frames");
  if (existsSync(framesSrc)) {
    cpSync(framesSrc, resolve(dir, "frames"), { recursive: true });
  }
  if (existsSync(CALL_STACK_PATH)) {
    copyFileSync(CALL_STACK_PATH, resolve(dir, ".call-stack.json"));
  }
}

function emitIfInstructionsChanged(instructionsPath: string, before: number): void {
  const after = readFileSync(instructionsPath, "utf-8").length;
  if (after !== before) emitInstructionsChanged(before, after);
}

export function commitCycleAndEmit(
  cycle: number,
  state: string,
  t0: number,
  instructionsPath: string,
  instructionsBytesBefore: number,
): void {
  const hash = commitCycle(BASE_DIR, cycle, state);
  snapshot(cycle, hash);
  emitIfInstructionsChanged(instructionsPath, instructionsBytesBefore);
  emitMachineGitCommit(hash, `cycle ${cycle}: ${state}`);
  emitCycleEnd(state, Date.now() - t0);
}

export function handleNoMatch(state: string, memoryPath: string): void {
  const hasPending = getPendingQuestions(memoryPath).length > 0;
  log(`  [no-match] No instruction matched state "${state}" — ${hasPending ? "pending questions exist, waiting for user" : "asking user"}`);
  let memory = readFile(memoryPath);
  memory = setState(memory, "waiting_for_user");
  if (!hasPending) {
    memory += `\n## Pending Questions\n- **Q0**: No instruction in INSTRUCTIONS.md matched state "${state}". What should the machine do next?\n`;
  }
  writeFileSync(memoryPath, memory, "utf-8");
}

/**
 * Run one iteration of the cycle loop. Returns "halt" when the machine
 * has reached its terminal state and the loop should stop, "continue"
 * otherwise. The loop in main() is just `while (await runOneCycle(...) !== "halt")`.
 *
 * Sequence: collect any user replies → resolve stack ops (cascade-pop on
 * done, push if requested) → emit cycle-start and snapshot the
 * instruction bytes → branch on (currentState === "waiting_for_user") for
 * the no-LLM fast path, otherwise invoke the provider with quota backoff →
 * commit, snapshot, emit cycle-end → run post-cycle interactions.
 */
export async function runOneCycle(
  callStack: CallStack,
  cycle: number,
): Promise<"halt" | "continue"> {
  await collectReplies(callStack);

  // Set cycle context with the pre-stack-ops top frame so push/pop/splice
  // events fired inside runStackBlock are stamped with the correct cycle
  // number. Use the relative frameDir from the call stack (not the absolute
  // path returned by activeFramePaths) so events.jsonl entries match the
  // visualizer's selectedFrameDir filter, which is also relative.
  setCycleContext(cycle, callStack.stack[callStack.stack.length - 1].frameDir);

  if (runStackBlock(callStack)) {
    log(`\nMachine halted: done`);
    const rootFrameDir = callStack.stack[0].frameDir;
    const rootMemory = readFile(resolve(BASE_DIR, rootFrameDir, "MEMORY.md"));
    emitOutputMd(BASE_DIR, rootMemory);
    log(`  OUTPUT.md written to ${BASE_DIR}`);
    clearCycleContext();
    emitHalt("done");
    return "halt";
  }

  // Re-resolve after potential push/pop mutations.
  const { frameDir: fd2, memoryPath: mp2, instructionsPath: ip2 } = activeFramePaths(callStack);

  setCycleContext(cycle, callStack.stack[callStack.stack.length - 1].frameDir);
  emitCycleStart();
  const t0 = Date.now();
  const instructionsBytesBefore = readFileSync(ip2, "utf-8").length;

  const currentState = getMemoryState(mp2);

  if (currentState === "waiting_for_user") {
    log(`--- Cycle ${cycle} (frame: ${fd2}) (user interaction) ---`);
    commitCycleAndEmit(cycle, "waiting_for_user", t0, ip2, instructionsBytesBefore);
    await handleUserInteraction(mp2, callStack.stack[callStack.stack.length - 1].frameDir);
    log("");
    return "continue";
  }

  log(`--- Cycle ${cycle} (frame: ${fd2}) ---`);

  const result = await withBackoff(
    () => providerRunCycle(ip2, mp2),
    {
      label: "quota",
      initialDelaySec: 60,
      maxDelaySec: 600,
      maxRetries: 10,
      shouldRetry: (err) => (err as { name?: string })?.name === "QuotaExceededError",
    },
  );

  drainProviderEvents(result.events);

  // Re-resolve after provider invocation (provider may have changed files).
  const { frameDir: fd3, memoryPath: mp3, instructionsPath: ip3 } = activeFramePaths(callStack);

  if (STATEFUL) {
    const memoryContent = readFile(mp3);
    const matchedMatch = memoryContent.match(/^## Matched Instruction\n(.+)/m);
    const matchedValue = matchedMatch ? matchedMatch[1].trim().toLowerCase() : "";

    if (matchedValue === "none") {
      handleNoMatch(getMemoryState(mp3), mp3);
      commitCycleAndEmit(cycle, "waiting_for_user", t0, ip3, instructionsBytesBefore);
      await handleUserInteraction(mp3, callStack.stack[callStack.stack.length - 1].frameDir);
      log("");
      return "continue";
    }

    executeSyscalls(ip3, fd3);
    const state = getMemoryState(mp3);
    commitCycleAndEmit(cycle, state, t0, ip3, instructionsBytesBefore);
    await postCycleUserOps(cycle, result.summary, callStack, state);
    log("");
    return "continue";
  }

  // Non-stateful mode
  const state = getMemoryState(mp3);
  if (result.noMatch) handleNoMatch(state, mp3);
  const finalState = result.noMatch ? "waiting_for_user" : state;
  commitCycleAndEmit(cycle, finalState, t0, ip3, instructionsBytesBefore);
  await postCycleUserOps(cycle, result.summary, callStack, finalState);
  log("");
  return "continue";
}
