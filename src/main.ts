import { resolve } from "path";
import { mkdirSync, copyFileSync, readFileSync, writeFileSync, readdirSync } from "fs";
import { createInterface } from "readline";
import { runCycle as runCycleClaudeCode } from "./providers/claude-code.js";
import { runCycle as runCycleApi } from "./providers/api.js";
import { initLog, log, getLogPath } from "./logger.js";

const BASE_DIR = process.cwd();
const MEMORY_PATH = resolve(BASE_DIR, "MEMORY.md");
const INSTRUCTIONS_PATH = resolve(BASE_DIR, "INSTRUCTIONS.md");
const HISTORY_DIR = resolve(BASE_DIR, "history");
const MAX_CYCLES = 100;

const PROVIDER = process.env.TURING_PROVIDER || "claude-code";

function getStartCycle(): number {
  try {
    const entries = readdirSync(HISTORY_DIR);
    let max = 0;
    for (const entry of entries) {
      const match = entry.match(/^(\d+)/);
      if (match) {
        const num = parseInt(match[1], 10);
        if (num > max) max = num;
      }
    }
    return max + 1;
  } catch {
    return 1;
  }
}

function snapshot(cycle: number) {
  const dir = resolve(HISTORY_DIR, String(cycle).padStart(4, "0"));
  mkdirSync(dir, { recursive: true });
  copyFileSync(MEMORY_PATH, resolve(dir, "MEMORY.md"));
  copyFileSync(INSTRUCTIONS_PATH, resolve(dir, "INSTRUCTIONS.md"));
}

function readFile(path: string): string {
  try {
    return readFileSync(path, "utf-8");
  } catch {
    return "";
  }
}

function getMemoryState(): string {
  const memory = readFile(MEMORY_PATH);
  const match = memory.match(/^## State\n(.+)/m);
  return match ? match[1].trim() : "";
}

function getMemoryQuestion(): string {
  const memory = readFile(MEMORY_PATH);
  const match = memory.match(/^## Question\n([\s\S]*?)(?=\n## [A-Z])/m);
  if (match) return match[1].trim();
  // Fallback: Question is the last section — grab everything after it
  const fallback = memory.match(/^## Question\n([\s\S]*)$/m);
  return fallback ? fallback[1].trim() : "";
}

async function askUser(question: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    log("");
    log("┌─ USER INPUT NEEDED ─────────────────────────────────");
    for (const line of question.split("\n")) {
      log(`│ ${line}`);
    }
    log("└────────────────────────────────────────────────────");
    process.stdout.write("  > ");
    rl.question("", (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}

async function handleUserInteraction(): Promise<void> {
  const question = getMemoryQuestion();
  const answer = await askUser(question || "(the machine is asking for input but provided no question)");
  log(`  [user answered] ${answer}`);

  const memory = readFile(MEMORY_PATH);
  const updated = memory
    .replace(/^(## State\n).+/m, "$1user_responded")
    .replace(/^## Answer\n[\s\S]*?(?=\n## |\s*$)/m, "")
    + `\n## Answer\n${answer}\n`;
  writeFileSync(MEMORY_PATH, updated, "utf-8");
}

async function runCycle(instructionsPath: string, memoryPath: string) {
  switch (PROVIDER) {
    case "claude-code":
      return runCycleClaudeCode(instructionsPath, memoryPath);
    case "api":
      return runCycleApi(instructionsPath, memoryPath);
    default:
      throw new Error(`Unknown provider: ${PROVIDER}. Use "claude-code" or "api".`);
  }
}

async function main() {
  initLog(BASE_DIR);

  log("Turing machine starting");
  log(`  Provider:     ${PROVIDER}`);
  log(`  MEMORY:       ${MEMORY_PATH}`);
  log(`  INSTRUCTIONS: ${INSTRUCTIONS_PATH}`);
  log(`  Log:          ${getLogPath()}`);

  mkdirSync(HISTORY_DIR, { recursive: true });

  const startCycle = getStartCycle();
  log(`  Resuming from cycle ${startCycle}`);
  log("");

  for (let cycle = startCycle; cycle < startCycle + MAX_CYCLES; cycle++) {
    if (getMemoryState() === "waiting_for_user") {
      log(`--- Cycle ${cycle} (user interaction) ---`);
      snapshot(cycle);
      await handleUserInteraction();
      log("");
      continue;
    }

    snapshot(cycle);
    log(`--- Cycle ${cycle} ---`);

    const result = await runCycle(INSTRUCTIONS_PATH, MEMORY_PATH);

    if (result.halt) {
      snapshot(cycle + 1);
      log(`\nMachine halted: ${result.haltMessage}`);
      return;
    }

    if (getMemoryState() === "waiting_for_user") {
      await handleUserInteraction();
    }

    log("");
  }

  log(`\nMax cycles (${MAX_CYCLES}) reached — halting.`);
}

main().catch((err) => {
  if (err?.name === "QuotaExceededError") {
    log(`\nQuota exceeded — pausing. Resume anytime by running this instance again.`);
    log(`  ${err.message}`);
    process.exit(0);
  }
  console.error("Fatal error:", err);
  process.exit(1);
});
