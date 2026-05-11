/**
 * dispatch.ts — Provider lookup.
 *
 * Maps the PROVIDER env value to the provider's `runCycle` entry point.
 * Each value lazy-imports its provider module so unused providers stay
 * out of the dependency graph at startup.
 */

import { PROVIDER } from "../config.js";
import type { CycleResult, ProviderModule } from "./shared.js";

const PROVIDERS: Record<string, () => Promise<ProviderModule>> = {
  "claude-code": () => import("./claude-code.js"),
  "api": () => import("./api.js"),
  "openai": () => import("./openai.js"),
  "ollama": () => import("./ollama.js"),
  "local": () => import("./local.js"),
};

export async function runCycle(
  instructionsPath: string,
  memoryPath: string,
): Promise<CycleResult> {
  const loader = PROVIDERS[PROVIDER];
  if (!loader) {
    throw new Error(
      `Unknown provider: ${PROVIDER}. Use one of: ${Object.keys(PROVIDERS).join(", ")}.`,
    );
  }
  return (await loader()).runCycle(instructionsPath, memoryPath);
}
