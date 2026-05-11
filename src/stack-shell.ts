/**
 * stack-shell.ts — Disk-side wiring around the pure call-stack transforms.
 *
 * call-stack.ts holds the pure pop/push functions over `(stack, memory,
 * instructions)`. This module is the I/O complement: it reads the active
 * frame's MEMORY, runs `applyPop` / `applyPush`, persists their results
 * back to disk, removes popped frame directories, and emits the
 * corresponding events. `runStackBlock` reads as a clean three-step
 * sequence — pop transform → side effects → push transform → side effects
 * → halt-or-continue answer.
 */

import { mkdirSync, rmSync, writeFileSync } from "fs";
import { resolve } from "path";
import { log } from "./logger.js";
import { emitPop, emitPush, emitSplice } from "./events.js";
import {
  applyPop, applyPush, saveCallStack,
  type CallStack, type PopEvent,
} from "./call-stack.js";
import { BASE_DIR, CALL_STACK_PATH, activeFramePaths } from "./config.js";
import { readFile, getMemoryState } from "./io.js";

/**
 * Side-effects for each pop event: rmSync the popped frame's directory (with
 * retries to survive Windows file locks held by visualizer fetches), log the
 * cascade-pop transition, and emit the ## Return splice + pop events. Pure
 * pop logic lives in call-stack.ts; this is the I/O side.
 */
function applyPopSideEffects(events: PopEvent[], callerFrameDir: string): void {
  for (const ev of events) {
    try {
      rmSync(resolve(BASE_DIR, ev.frameDir), {
        recursive: true,
        force: true,
        maxRetries: 5,
        retryDelay: 100,
      });
    } catch (rmErr) {
      log(`  [pop] WARN: failed to remove ${ev.frameDir} after retries: ${rmErr instanceof Error ? rmErr.message : rmErr}`);
    }
    log(`  [pop] → ${ev.returnState}_completed (depth ${ev.depthAfter})`);
    if (ev.splicedKeys && ev.splicedKeys.length > 0) {
      emitSplice(callerFrameDir, ev.splicedKeys);
    }
    emitPop(ev.frameDir, ev.returnState, ev.depthAfter);
    if (ev.missingReturn) log(`  [pop] ${ev.frameDir}: no ## Return section`);
    for (const mal of ev.malformedLines) {
      log(`  [pop] ${ev.frameDir}: malformed return entry: ${mal}`);
    }
  }
}

/**
 * Run the pre-LLM stack block: cascade-pop on done, then push if ## Push is
 * present. Writes updated memory/instructions/stack to disk and returns
 * whether the machine should halt (state=done at depth 0).
 *
 * Reads/writes from the active frame's directory (derived from callStack).
 * After mutations, callStack is updated in-place.
 */
export function runStackBlock(callStack: CallStack): boolean {
  const { memoryPath } = activeFramePaths(callStack);

  // Pop.
  const popped = applyPop(
    callStack,
    readFile(memoryPath),
    (fd, file) => readFile(resolve(BASE_DIR, fd, file)),
  );

  if (popped.events.length > 0) {
    writeFileSync(
      resolve(BASE_DIR, popped.callerFrameDir, "MEMORY.md"),
      popped.callerMemoryAfter,
      "utf-8",
    );

    // Warn when cascade pop fires: intermediate frame MEMORIes are computed
    // in applyPop but only the final caller's MEMORY is written above. See
    // the JSDoc on applyPop in call-stack.ts for the full explanation.
    if (popped.events.length > 1) {
      log(`  [pop] WARN: cascade pop with ${popped.events.length} events; intermediate frame MEMORIes were not persisted (only the final caller).`);
    }

    applyPopSideEffects(popped.events, popped.callerFrameDir);

    callStack.nextCounter = popped.callStack.nextCounter;
    callStack.stack.length = 0;
    callStack.stack.push(...popped.callStack.stack);
    saveCallStack(CALL_STACK_PATH, callStack);
  }

  const { memoryPath: memPathAfterPop } = activeFramePaths(callStack);

  // Halt: state=done and only the root frame remains (stack.length === 1).
  if (getMemoryState(memPathAfterPop) === "done" && callStack.stack.length === 1) return true;

  // Push.
  const pushed = applyPush(
    callStack,
    readFile(memPathAfterPop),
    (p) => {
      const content = readFile(resolve(BASE_DIR, p));
      return content || null;
    },
  );
  if (pushed.ok) {
    writeFileSync(memPathAfterPop, pushed.callerMemoryAfter, "utf-8");

    const childFrameDir = resolve(BASE_DIR, pushed.frameDir);
    mkdirSync(resolve(childFrameDir, "scoped"), { recursive: true });
    writeFileSync(resolve(childFrameDir, "MEMORY.md"), pushed.childMemory, "utf-8");
    writeFileSync(resolve(childFrameDir, "INSTRUCTIONS.md"), pushed.childInstructions, "utf-8");

    Object.assign(callStack, pushed.callStack);
    saveCallStack(CALL_STACK_PATH, callStack);
    log(`  [push] ${pushed.target} → ${pushed.frameDir} (depth ${pushed.callStack.stack.length - 1})`);
    emitPush(pushed.target, pushed.frameDir, pushed.callStack.stack.length - 1);
  } else if (pushed.reason === "missing-target") {
    writeFileSync(memPathAfterPop, pushed.memory, "utf-8");
    log(`  [push] ERROR: ${pushed.target} not found or empty, skipping`);
  } else if (pushed.reason === "unresolved-placeholder") {
    writeFileSync(memPathAfterPop, pushed.memory, "utf-8");
    log(`  [push] ${pushed.target}: unresolved placeholder(s) ${pushed.placeholders.join(", ")}`);
  }
  return false;
}
