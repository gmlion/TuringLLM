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
    try {
      const args = [
        "-p", userPrompt,
        "--system-prompt", systemPrompt,
        "--model", "haiku",
        "--output-format", "text",
        "--allowedTools", "Bash(*)", "Write(*)", "Edit(*)", "Read(*)",
        "--dangerously-skip-permissions",
      ];

      const result = execFileSync("claude", args, {
        encoding: "utf-8",
        timeout: 180_000,
        maxBuffer: 10 * 1024 * 1024,
        cwd,
        env: { ...process.env },
      });

      logRaw(`  [claude-code full output]\n${result}`);
      const preview = result.trim().slice(0, 300);
      if (preview) log(`  [claude-code] ${preview}${result.trim().length > 300 ? "..." : ""}`);

      if (isQuotaError(result)) {
        throw new QuotaExceededError(`Quota exceeded: ${result.trim().slice(0, 200)}`);
      }
    } catch (err: unknown) {
      if (err instanceof QuotaExceededError) throw err;

      const e = err as { stdout?: string; stderr?: string; status?: number };
      const stdout = (e.stdout || "").trim();
      const stderr = (e.stderr || "").trim();
      logRaw(`  [claude-code stdout]\n${stdout}`);
      logRaw(`  [claude-code stderr]\n${stderr}`);

      if (isQuotaError(stdout) || isQuotaError(stderr)) {
        throw new QuotaExceededError(`Quota exceeded: ${(stderr || stdout).slice(0, 200)}`);
      }

      if (stdout) log(`  [claude-code] ${stdout.slice(0, 200)}${stdout.length > 200 ? "..." : ""}`);
      if (stderr) log(`  [claude-code error] ${stderr.slice(0, 200)}${stderr.length > 200 ? "..." : ""}`);
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
