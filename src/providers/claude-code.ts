import { execFileSync } from "child_process";
import { resolve } from "path";
import { getSystemPrompt, getUserPrompt } from "../prompt.js";
import { log, logRaw } from "../logger.js";
import { QuotaExceededError } from "../errors.js";
import { readFile, checkCycleCompleteness, MAX_RETRIES } from "./shared.js";

export type CycleResult = {
  halt: boolean;
  haltMessage?: string;
};

const QUOTA_PATTERNS = [
  /quota/i,
  /rate.?limit/i,
  /too many requests/i,
  /overloaded/i,
  /529/,
  /resource.?exhausted/i,
];

function isQuotaError(text: string): boolean {
  return QUOTA_PATTERNS.some((p) => p.test(text));
}

export async function runCycle(
  instructionsPath: string,
  memoryPath: string
): Promise<CycleResult> {
  const systemPrompt = getSystemPrompt("claude-code");
  const userPrompt = getUserPrompt(memoryPath, instructionsPath);
  const cwd = resolve(memoryPath, "..");

  const filesBefore: [string, string] = [readFile(memoryPath), readFile(instructionsPath)];

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    let stdout = "";
    let stderr = "";
    let exitCode = 0;

    try {
      const args = [
        "-p", userPrompt,
        "--system-prompt", systemPrompt,
        "--model", process.env.CC_MODEL || "haiku",
        "--output-format", "json",
        "--allowedTools", "Bash(*)", "Write(*)", "Edit(*)",
        "--dangerously-skip-permissions",
      ];

      stdout = execFileSync("claude", args, {
        encoding: "utf-8",
        timeout: 0,
        maxBuffer: 10 * 1024 * 1024,
        cwd,
        env: { ...process.env },
      });
    } catch (err: unknown) {
      if (err instanceof QuotaExceededError) throw err;
      const e = err as { stdout?: string; stderr?: string; status?: number };
      stdout = (e.stdout || "").trim();
      stderr = (e.stderr || "").trim();
      exitCode = e.status ?? 1;
    }

    // Log everything
    logRaw(`  [claude-code exit=${exitCode}]`);
    logRaw(`  [claude-code stdout]\n${stdout}`);
    if (stderr) logRaw(`  [claude-code stderr]\n${stderr}`);

    // Check quota
    if (isQuotaError(stdout) || isQuotaError(stderr)) {
      throw new QuotaExceededError(`Quota exceeded: ${(stderr || stdout).slice(0, 200)}`);
    }

    // Parse JSON output for logging
    let resultText = "";
    try {
      const parsed = JSON.parse(stdout);
      resultText = parsed.result || "";

      // Log cost info if available
      if (parsed.cost_usd) {
        log(`  [cost] $${parsed.cost_usd.toFixed(4)}`);
      }
      if (parsed.duration_ms) {
        log(`  [duration] ${(parsed.duration_ms / 1000).toFixed(1)}s`);
      }
    } catch {
      resultText = stdout;
    }

    // Console summary
    if (resultText) {
      log(`  [claude-code] ${resultText.trim()}`);
    } else if (exitCode !== 0) {
      log(`  [claude-code] exited with code ${exitCode}${stderr ? ": " + stderr : ""}`);
    } else {
      log(`  [claude-code] (no text output)`);
    }

    // Check cycle completeness
    const completeness = checkCycleCompleteness(memoryPath, instructionsPath, filesBefore);

    if (completeness.halt) {
      return { halt: true, haltMessage: completeness.haltMessage };
    }

    if (completeness.complete) {
      return { halt: false };
    }

    log(`  [retry ${attempt + 1}] ${completeness.problem.includes("did not update") ? "no state change" : "orphan state"}`);
  }

  log(`  [warn] cycle incomplete after ${MAX_RETRIES} retries`);
  return { halt: false };
}
