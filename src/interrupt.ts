/**
 * interrupt.ts — Single global "user pressed Ctrl+C" flag.
 *
 * On Windows + Git Bash a Ctrl+C frequently reaches only the foreground
 * subprocess (claude.exe), not the Node.js parent. The parent's
 * `process.on("SIGINT", ...)` handler may fire late or not at all in that
 * configuration, so a single `process.exit(0)` inside the handler is not
 * enough on its own. Code paths that observe abnormal subprocess exits (or
 * detect a Ctrl+C signature in the exit codes) call `setInterrupted()` so
 * the cycle loop notices on the next iteration and exits cleanly.
 *
 * The flag is process-local; a fresh `node dist/main.js` resets it.
 */

let interrupted = false;

export function isInterrupted(): boolean {
  return interrupted;
}

export function setInterrupted(): void {
  interrupted = true;
}
