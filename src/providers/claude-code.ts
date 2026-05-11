import { execFileSync } from "child_process";
import { mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join, resolve } from "path";
import { getSystemPrompt, getUserPrompt } from "../prompt.js";
import { log, logRaw } from "../logger.js";
import { QuotaExceededError } from "../errors.js";
import { setInterrupted } from "../interrupt.js";
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

/**
 * Detect a Ctrl+C / SIGINT termination of the claude subprocess across
 * platforms. POSIX kernels deliver SIGINT (status 130 or signal === "SIGINT"),
 * while the Windows console kills the child with STATUS_CONTROL_C_EXIT
 * (0xC000013A = 3221225786 unsigned, -1073741510 as int32). Without the
 * Windows codes the catch block falls through, the cycle-completeness check
 * sees memory unchanged, and the retry loop relaunches claude — making
 * Ctrl+C effectively impossible to honour from git-bash on Windows.
 */
export function isCtrlCExit(e: { status?: number | null; signal?: string | null }): boolean {
  if (e.signal === "SIGINT") return true;
  if (e.status === 130) return true;
  if (e.status === 3221225786) return true;
  if (e.status === -1073741510) return true;
  return false;
}

/**
 * Decide whether a claude-code subprocess result represents a real quota error
 * worth retrying. Only signals true when the API or the subprocess itself
 * actually failed — never on a successful response that happens to contain
 * quota-shaped words in its prose. Protects in-flight MEMORY mutations from
 * being discarded by needless retries.
 */
export function shouldThrowQuotaForResponse(
  parsed: { result?: string; is_error?: boolean; api_error_status?: unknown } | null,
  exitCode: number,
  stdout: string,
  stderr: string,
): boolean {
  const apiFailed = parsed !== null && (parsed.is_error === true || parsed.api_error_status != null);
  const subprocessFailed = exitCode !== 0;
  const responseInvalid = parsed === null && exitCode === 0 && stdout.length > 0;

  if (!(apiFailed || subprocessFailed || responseInvalid)) {
    // Successful, parseable response — trust it. Side effects already landed.
    return false;
  }

  const errorText =
    (parsed && typeof parsed.api_error_status === "string" ? parsed.api_error_status : "") ||
    stderr ||
    (apiFailed ? (parsed?.result || "") : stdout);
  return isQuotaError(errorText);
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

  // Pass system prompt via a temp file and the user prompt via stdin so neither
  // counts against the OS argv ceiling (Windows CreateProcess caps at ~32 KB,
  // and large MEMORY/INSTRUCTIONS pairs blow past that). See the demo4b
  // postmortem for the original failure mode.
  const promptDir = mkdtempSync(join(tmpdir(), "turing-cc-"));
  const systemPromptFile = join(promptDir, "system-prompt.md");
  writeFileSync(systemPromptFile, systemPrompt, "utf-8");

  let retryContext = "";
  // Count clean-exit empty responses. When the claude subprocess hits a weekly
  // quota / rate-limit block, observed behaviour is exit 0 + empty stdout in
  // ~14ms — none of the existing detectors fire (no api_error_status, no
  // non-zero exit, no quota-shaped prose), so the cycle-completeness retry
  // loop spins MAX_RETRIES times in milliseconds and main.ts then advances
  // to the next cycle, repeating forever. Tally empties; if every retry was
  // empty, escalate to QuotaExceededError so withBackoff/main can exit
  // cleanly instead of writing 57 GB of "no text output" to events.jsonl.
  let cleanExitEmptyResponses = 0;

  try {
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      let stdout = "";
      let stderr = "";
      let exitCode = 0;

      const prompt = retryContext ? `${userPrompt}\n\n${retryContext}` : userPrompt;

      const t0Llm = Date.now();
      // llm_request.prompt is the concatenated system+user prompt (convention shared
      // across providers).
      events.push({ type: "llm_request", provider: "claude-code", model: process.env.CC_MODEL || "haiku", prompt: `${systemPrompt}\n\n${prompt}` });

      try {
        const args = [
          "--print",
          "--system-prompt-file", systemPromptFile,
          "--model", process.env.CC_MODEL || "haiku",
          "--output-format", "json",
          "--allowedTools", "Bash(*)", "Write(*)", "Edit(*)", "WebSearch", "WebFetch",
          "--dangerously-skip-permissions",
        ];

        stdout = execFileSync("claude", args, {
          encoding: "utf-8",
          input: prompt,
          timeout: 0,
          maxBuffer: 10 * 1024 * 1024,
          cwd,
          env: { ...process.env },
        });
      } catch (err: unknown) {
        if (err instanceof QuotaExceededError) throw err;
        const e = err as { stdout?: string; stderr?: string; status?: number; signal?: string; code?: string };
        if (isCtrlCExit(e)) {
          // Mark interrupted so the cycle loop in main.ts exits at the next
          // boundary. Don't call process.exit() here — we want main()'s catch
          // to run normal shutdown and the loop guard to print "Halted by user".
          setInterrupted();
          throw err;
        }
        // ENAMETOOLONG / E2BIG would mean we still exceeded the OS limit even
        // with stdin+file (e.g. a giant single allowedTools entry). Surface it
        // immediately rather than retrying — no retry will fix this.
        if (e.code === "ENAMETOOLONG" || e.code === "E2BIG") {
          throw new Error(`claude subprocess spawn failed with ${e.code}; argv too large despite stdin+system-prompt-file routing`);
        }
        stdout = (e.stdout || "").trim();
        stderr = (e.stderr || "").trim();
        exitCode = e.status ?? 1;
      }

      logRaw(`  [claude-code exit=${exitCode}]`);
      logRaw(`  [claude-code stdout]\n${stdout}`);
      if (stderr) logRaw(`  [claude-code stderr]\n${stderr}`);

      let resultText = "";
      let durationMs = Date.now() - t0Llm;
      let parsed: { result?: string; cost_usd?: number; duration_ms?: number; is_error?: boolean; api_error_status?: unknown } | null = null;
      try {
        parsed = JSON.parse(stdout);
        resultText = parsed?.result || "";

        if (parsed?.cost_usd) {
          log(`  [cost] $${parsed.cost_usd.toFixed(4)}`);
        }
        if (parsed?.duration_ms) {
          durationMs = parsed.duration_ms;
          log(`  [duration] ${(parsed.duration_ms / 1000).toFixed(1)}s`);
        }
      } catch {
        resultText = stdout;
      }

      // Quota detection: only treat as quota when API/subprocess signals real
      // failure (never on a successful response that happens to contain
      // quota-shaped prose). Protects in-flight MEMORY mutations from being
      // discarded by needless retries. See shouldThrowQuotaForResponse jsdoc.
      if (shouldThrowQuotaForResponse(parsed, exitCode, stdout, stderr)) {
        throw new QuotaExceededError(`Quota exceeded: ${(stderr || stdout).slice(0, 200)}`);
      }

      events.push({ type: "llm_response", output: resultText, durationMs });

      if (resultText) {
        log(`  [claude-code] ${resultText.trim()}`);
      } else if (exitCode !== 0) {
        log(`  [claude-code] exited with code ${exitCode}${stderr ? ": " + stderr : ""}`);
      } else {
        log(`  [claude-code] (no text output)`);
        cleanExitEmptyResponses += 1;
      }

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
    if (cleanExitEmptyResponses === MAX_RETRIES) {
      // Every retry was a clean-exit empty response. The CLI is refusing to
      // do work — almost always a weekly token / 5h block. Escalate to
      // QuotaExceededError so withBackoff applies its exponential backoff
      // (60s → 600s, 10 retries) and ultimately main.ts exits cleanly. The
      // alternative — returning {halt:false} — keeps main.ts spinning new
      // cycles at ~3/sec writing only "no text output" log entries.
      throw new QuotaExceededError(
        `claude returned empty output for all ${MAX_RETRIES} retries — likely quota or rate-limit block`,
      );
    }
    return { halt: false, events };
  } finally {
    rmSync(promptDir, { recursive: true, force: true });
  }
}
