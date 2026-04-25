import { execFileSync } from "child_process";
import { resolve } from "path";
import { getSystemPrompt, getUserPrompt } from "../prompt.js";
import { log, logRaw } from "../logger.js";
import { QuotaExceededError } from "../errors.js";
import { readFile, checkCycleCompleteness, MAX_RETRIES, type CycleResult, type ProviderEvent } from "./shared.js";

const QUOTA_PATTERNS = [
  /quota/i,
  /rate.?limit/i,
  /too many requests/i,
  /overloaded/i,
  /\b529\b/,
  /resource.?exhausted/i,
];

export function isQuotaError(text: string): boolean {
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
  const events: ProviderEvent[] = [];

  let retryContext = "";

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    let stdout = "";
    let stderr = "";
    let exitCode = 0;

    const prompt = retryContext ? `${userPrompt}\n\n${retryContext}` : userPrompt;

    const t0Llm = Date.now();
    // llm_request.prompt is the concatenated system+user prompt (convention shared
    // across providers); the literal `-p` arg passed to the `claude` binary is just
    // the user prompt — system prompt is passed via --system-prompt.
    events.push({ type: "llm_request", provider: "claude-code", model: process.env.CC_MODEL || "haiku", prompt: `${systemPrompt}\n\n${prompt}` });

    try {
      const args = [
        "-p", prompt,
        "--system-prompt", systemPrompt,
        "--model", process.env.CC_MODEL || "haiku",
        "--output-format", "json",
        "--allowedTools", "Bash(*)", "Write(*)", "Edit(*)", "WebSearch", "WebFetch",
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
      const e = err as { stdout?: string; stderr?: string; status?: number; signal?: string };
      if (e.signal === "SIGINT" || e.status === 130) {
        process.exit(0);
      }
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
    let durationMs = Date.now() - t0Llm;
    try {
      const parsed = JSON.parse(stdout);
      resultText = parsed.result || "";

      // Log cost info if available
      if (parsed.cost_usd) {
        log(`  [cost] $${parsed.cost_usd.toFixed(4)}`);
      }
      if (parsed.duration_ms) {
        durationMs = parsed.duration_ms;
        log(`  [duration] ${(parsed.duration_ms / 1000).toFixed(1)}s`);
      }
    } catch {
      resultText = stdout;
    }

    events.push({ type: "llm_response", output: resultText, durationMs });

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
      return { halt: true, haltMessage: completeness.haltMessage, summary: resultText, events };
    }

    if (completeness.noMatch) {
      return { halt: false, noMatch: true, summary: resultText, events };
    }

    if (completeness.complete) {
      return { halt: false, summary: resultText, events };
    }

    retryContext = `RETRY: Previous attempt failed. ${completeness.problem} You MUST update MEMORY.md with the new ## State before stopping.`;
    events.push({ type: "retry", attempt: attempt + 1, reason: completeness.problem });
    log(`  [retry ${attempt + 1}] ${completeness.problem}`);
  }

  log(`  [warn] cycle incomplete after ${MAX_RETRIES} retries`);
  return { halt: false, events };
}
