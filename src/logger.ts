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
  // TODO(better-logging-followup): logRaw has 40+ call sites across providers/
  // that previously wrote diagnostic detail (raw stdout, tool inputs, etc.) to
  // logs/run-<ts>.log. Now silent. The structured event stream covers tool I/O
  // for non-CC providers, but for the claude-code provider the raw subprocess
  // stdout is no longer captured anywhere. Either:
  //   (a) audit each logRaw call site and migrate useful diagnostics into
  //       events.ts emitters, or
  //   (b) extend events.ts.emitLlmResponse to carry the full provider stdout
  //       (currently only the parsed `result` text), so CC runs are debuggable.
  // Until then, CC runs lose verbose stdout that previously appeared in the
  // file log.
}

export function getLogPath(): string | null {
  return null;
}
