import { execFileSync } from "child_process";
import { readFileSync } from "fs";
import { resolve } from "path";
import { getSystemPrompt, getUserPrompt } from "../prompt.js";
import { log, logRaw } from "../logger.js";

import { QuotaExceededError } from "../errors.js";

export type CycleResult = {
  halt: boolean;
  haltMessage?: string;
};

function readFile(path: string): string {
  try {
    return readFileSync(path, "utf-8");
  } catch {
    return "";
  }
}

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
  const systemPrompt = getSystemPrompt();
  const userPrompt = getUserPrompt(memoryPath, instructionsPath) + "\n\nExecute the next cycle.";
  const cwd = resolve(memoryPath, "..");

  const memBefore = readFile(memoryPath);
  const instBefore = readFile(instructionsPath);

  const maxRetries = 20;
  for (let attempt = 0; ; attempt++) {
    let stdout = "";
    let stderr = "";
    let exitCode = 0;

    try {
      const args = [
        "-p", userPrompt,
        "--system-prompt", systemPrompt,
        "--model", "haiku",
        "--output-format", "json",
        "--allowedTools", "Bash(*)", "Write(*)", "Edit(*)", "Read(*)",
        "--dangerously-skip-permissions",
      ];

      stdout = execFileSync("claude", args, {
        encoding: "utf-8",
        timeout: 180_000,
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
      const preview = resultText.trim().slice(0, 300);
      log(`  [claude-code] ${preview}${resultText.trim().length > 300 ? "..." : ""}`);
    } else if (exitCode !== 0) {
      log(`  [claude-code] exited with code ${exitCode}${stderr ? ": " + stderr.slice(0, 150) : ""}`);
    } else {
      log(`  [claude-code] (no text output)`);
    }

    // Check if halted
    const memAfter = readFile(memoryPath);
    const stateMatch = memAfter.match(/^## State\n(.+)/m);
    const state = stateMatch ? stateMatch[1].trim() : "";

    if (state === "done") {
      const lastAction = memAfter.match(/^## Last Action\n([\s\S]*?)(?=\n## |\n*$)/m);
      return { halt: true, haltMessage: lastAction ? lastAction[1].trim() : "Program complete" };
    }

    if (state === "waiting_for_user") {
      return { halt: false };
    }

    // Check completeness
    const instAfter = readFile(instructionsPath);
    const memChanged = memAfter !== memBefore;
    const instChanged = instAfter !== instBefore;

    if (memChanged || instChanged) {
      const hasMatch = instAfter.includes(`state is "${state}"`);
      if (hasMatch) {
        return { halt: false };
      }
      if (attempt < maxRetries) {
        log(`  [retry ${attempt + 1}] orphan state "${state}" — no matching instruction`);
        continue;
      }
    } else {
      if (attempt < maxRetries) {
        log(`  [retry ${attempt + 1}] no state change`);
        continue;
      }
    }

    if (attempt >= maxRetries) {
      log(`  [warn] cycle incomplete after ${maxRetries} retries`);
      return { halt: false };
    }
  }
}
