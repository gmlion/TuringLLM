/**
 * retry.ts — Generic retry-with-exponential-backoff combinator.
 *
 * Used by the cycle loop (provider quota retries) and the Telegram client
 * (transient API failures). Capped delay; optional shouldRetry predicate
 * to bail out on terminal errors.
 */

import { log } from "./logger.js";
import { emitRetry } from "./events.js";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function withBackoff<T>(
  fn: () => Promise<T>,
  opts: {
    label: string;
    maxRetries?: number;
    initialDelaySec?: number;
    maxDelaySec?: number;
    shouldRetry?: (err: unknown) => boolean;
  },
): Promise<T> {
  const maxRetries = opts.maxRetries ?? 5;
  const maxDelay = opts.maxDelaySec ?? 300;
  let delay = opts.initialDelaySec ?? 5;
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const attemptExhausted = attempt >= maxRetries;
      const isTerminalError = opts.shouldRetry && !opts.shouldRetry(err);
      if (attemptExhausted || isTerminalError) throw err;
      log(`  [${opts.label}] ${err instanceof Error ? err.message : err}`);
      log(`  [${opts.label}] retrying in ${delay}s... (attempt ${attempt + 1}/${maxRetries})`);
      emitRetry(attempt + 1, opts.label);
      await sleep(delay * 1000);
      delay = Math.min(delay * 2, maxDelay);
    }
  }
}
