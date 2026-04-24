// src/logger.ts — stdout-only after better-logging.
// The structured event stream lives in src/events.ts; this module no longer
// mirrors stdout to a file (R23). Kept as thin pass-throughs so the many
// existing log() call sites need no edit (R22).

export function initLog(_baseDir: string): void {
  // No-op. Retained so call sites that called initLog() pre-better-logging
  // don't need to be edited. Future: remove call site and delete this fn.
}

export function log(message: string): void {
  console.log(message);
}

export function logRaw(_message: string): void {
  // Pre-better-logging this wrote diagnostic detail to the file mirror.
  // The file mirror is gone; structured detail lives in events.jsonl.
  // Kept as a no-op so existing call sites compile until they're audited.
}

export function getLogPath(): string | null {
  return null;
}
