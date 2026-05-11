/**
 * main.ts — Entry point.
 *
 * Sets up the run (logger, events, repos, root frame), then drives the
 * cycle loop by calling `runOneCycle` until it returns "halt". Per-cycle
 * mechanics live in cycle.ts; user interaction in interaction.ts; pure
 * call-stack transforms in call-stack.ts and their disk wiring in
 * stack-shell.ts.
 */

import { existsSync, mkdirSync, readFileSync } from "fs";
import { resolve } from "path";
import { fileURLToPath } from "url";
import { initLog, log } from "./logger.js";
import { ensureMachineRepo, ensureProjectRepo } from "./git.js";
import { initEvents, clearCycleContext, emitError, emitHalt } from "./events.js";
import { startupBootstrap } from "./bootstrap.js";
import { getStartCycle, runOneCycle } from "./cycle.js";
import { loadCallStack } from "./call-stack.js";
import { isInterrupted, setInterrupted } from "./interrupt.js";
import {
  BASE_DIR, HISTORY_DIR, CALL_STACK_PATH,
  PROVIDER, USE_TELEGRAM, TELEGRAM_CHAT_ID,
} from "./config.js";

// Two-stage Ctrl+C handler. On Windows + Git Bash the parent's SIGINT
// handler can fire late (or not at all when Ctrl+C reaches only the
// foreground claude subprocess). Stage 1 sets the global interrupt flag
// and asks the cycle loop to exit at the next boundary. Stage 2 (a second
// Ctrl+C while still running) calls process.exit(1) immediately as an
// escape hatch in case the loop is wedged in a sync subprocess call.
process.on("SIGINT", () => {
  if (isInterrupted()) {
    // Second Ctrl+C — force exit. The first request to exit cleanly
    // didn't take, so don't pretend we're shutting down gracefully.
    console.error("\nForce exit on second Ctrl+C.");
    process.exit(1);
  }
  setInterrupted();
  log("\nInterrupted — finishing current cycle's bookkeeping then exiting. (Press Ctrl+C again to force quit.)");
  try { clearCycleContext(); emitHalt("signal"); } catch {}
});
process.on("SIGTERM", () => process.exit(0));

async function main() {
  initLog(BASE_DIR);
  initEvents(BASE_DIR);
  clearCycleContext();

  log("Turing machine starting");
  log(`  Provider:     ${PROVIDER}`);
  log(`  Instance:     ${BASE_DIR}`);
  if (USE_TELEGRAM) log(`  Telegram:     enabled (chat ${TELEGRAM_CHAT_ID})`);

  mkdirSync(HISTORY_DIR, { recursive: true });
  ensureMachineRepo(BASE_DIR);
  ensureProjectRepo(BASE_DIR);

  // Every instance must declare its root operator via .root-operator.
  const rootOperatorFile = resolve(BASE_DIR, ".root-operator");
  if (!existsSync(rootOperatorFile) || !readFileSync(rootOperatorFile, "utf-8").trim()) {
    const msg = "no .root-operator configured for this instance; create a new instance via new-instance.sh";
    log(`  [bootstrap] ${msg}`);
    process.exit(1);
  }

  // First run (no call stack yet): bootstrap creates the root frame.
  // Resume (call stack exists): just reload it — don't re-create frames.
  if (!existsSync(CALL_STACK_PATH)) {
    startupBootstrap(BASE_DIR);
    log("  Bootstrapped root frame from .root-operator");
  }

  const callStack = loadCallStack(CALL_STACK_PATH);

  const startCycle = getStartCycle();
  log(`  Resuming from cycle ${startCycle}`);
  const stackDepth = callStack.stack.length - 1; // root frame not counted
  if (stackDepth > 0) log(`  Call stack depth: ${stackDepth}`);
  log("");

  for (let cycle = startCycle; ; cycle++) {
    if (isInterrupted()) {
      log("\nHalted by user.");
      return;
    }
    if ((await runOneCycle(callStack, cycle)) === "halt") return;
  }
}

// Only run main() when this file is executed directly (not imported by tests).
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((err: unknown) => {
    // User-interrupt path: a Ctrl+C-shaped subprocess exit set the global flag
    // and re-threw the original error. Exit cleanly rather than logging "Fatal".
    if (isInterrupted()) {
      console.error("\nHalted by user.");
      process.exit(0);
    }
    if ((err as { name?: string })?.name === "QuotaExceededError") {
      try { clearCycleContext(); emitHalt("quota_exceeded"); } catch { /* logs may be uninitialized */ }
      console.error("Quota exceeded — exiting cleanly (resumable):", err);
      process.exit(0);
    }
    try { emitError(err instanceof Error ? err : new Error(String(err))); } catch { /* logs may be uninitialized */ }
    console.error("Fatal error:", err);
    process.exit(1);
  });
}
