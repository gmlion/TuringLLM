import { config } from "dotenv";
import { resolve, dirname } from "path";
import { mkdirSync, copyFileSync, readFileSync, writeFileSync, readdirSync, existsSync } from "fs";
import { execSync } from "child_process";
import { createInterface } from "readline";
import { initLog, log, getLogPath } from "./logger.js";
import { ensureMachineRepo, ensureProjectRepo, commitCycle } from "./git.js";
import { getWorkspacePath } from "./git.js";
import { ALLOWED_GIT_COMMANDS } from "./tools.js";
import { sendTelegramMessage, waitForTelegramReply } from "./telegram.js";

const BASE_DIR = process.cwd();

// Load .env: instance-level overrides project-level
const projectRoot = resolve(BASE_DIR, "../..");
const projectEnv = resolve(projectRoot, ".env");
const instanceEnv = resolve(BASE_DIR, ".env");
if (existsSync(projectEnv)) config({ path: projectEnv });
if (existsSync(instanceEnv)) config({ path: instanceEnv, override: true });
const MEMORY_PATH = resolve(BASE_DIR, "MEMORY.md");
const INSTRUCTIONS_PATH = resolve(BASE_DIR, "INSTRUCTIONS.md");
const HISTORY_DIR = resolve(BASE_DIR, "history");
const MAX_CYCLES = 100;

const PROVIDER = process.env.TURING_PROVIDER || "claude-code";
const TELEGRAM_TOKEN = process.env.TELEGRAM_BOT_TOKEN || "";
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID || "";
const USE_TELEGRAM = !!(TELEGRAM_TOKEN && TELEGRAM_CHAT_ID);

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

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

function snapshot(cycle: number, hash: string) {
  const dir = resolve(HISTORY_DIR, `${String(cycle).padStart(4, "0")}-${hash}`);
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

function getPendingQuestions(): Array<{id: string, question: string}> {
  const memory = readFile(MEMORY_PATH);
  const match = memory.match(/^## Pending Questions\n([\s\S]*?)(?=\n## [A-Z]|\s*$)/m);
  if (!match) return [];
  const items: Array<{id: string, question: string}> = [];
  const regex = /^- \*\*(\w+)\*\*:\s*(.+)/gm;
  let m;
  while ((m = regex.exec(match[1])) !== null) {
    items.push({ id: m[1], question: m[2] });
  }
  return items;
}

async function askUserStdin(question: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    log("");
    const idMatch = question.match(/^(\w+):\s*/);
    const header = idMatch ? ` ${idMatch[1]} ` : " USER INPUT NEEDED ";
    const body = idMatch ? question.slice(idMatch[0].length) : question;
    log(`┌─${header}${"─".repeat(Math.max(0, 52 - header.length))}┐`);
    for (const line of body.split("\n")) {
      log(`│ ${line}`);
    }
    log(`└${"─".repeat(54)}┘`);
    process.stdout.write("  > ");
    rl.question("", (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}

async function askUserTelegram(question: string): Promise<string> {
  log(`  [telegram] Sending question...`);
  const msgId = await sendTelegramMessage(TELEGRAM_TOKEN, TELEGRAM_CHAT_ID, question);
  log(`  [telegram] Question sent, waiting for reply...`);
  const reply = await waitForTelegramReply(TELEGRAM_TOKEN, TELEGRAM_CHAT_ID, msgId);
  log(`  [telegram] Got reply: ${reply}`);
  return reply;
}

async function askUser(question: string): Promise<string> {
  return USE_TELEGRAM ? askUserTelegram(question) : askUserStdin(question);
}

const STATEFUL = process.env.TURING_STATEFUL === "1";
const SYSCALLS_PATH = resolve(BASE_DIR, "SYSCALLS.md");

function executeSyscalls(): void {
  const content = readFile(SYSCALLS_PATH);
  if (!content.trim()) return;

  const blocks = content.split(/^---$/m).map(b => b.trim()).filter(Boolean);
  const results: string[] = [];

  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];
    const firstLine = block.split("\n")[0];
    const rest = block.slice(firstLine.length).trim();

    if (firstLine.startsWith("bash:")) {
      const command = firstLine.slice(5).trim() || rest;
      log(`  [bash] ${command}`);
      try {
        const output = execSync(command, { encoding: "utf-8", maxBuffer: 1024 * 1024, cwd: BASE_DIR });
        results.push(`## Result ${i + 1}: bash\n${output || "(no output)"}`);
      } catch (err: unknown) {
        const e = err as { stdout?: string; stderr?: string; status?: number };
        results.push(`## Result ${i + 1}: bash\nexit code ${e.status ?? 1}\nstdout: ${e.stdout ?? ""}\nstderr: ${e.stderr ?? ""}`);
      }
    } else if (firstLine.startsWith("write_file:")) {
      const filePath = firstLine.slice(11).trim();
      log(`  [write_file] ${filePath}`);
      try {
        mkdirSync(dirname(filePath), { recursive: true });
        writeFileSync(filePath, rest, "utf-8");
        results.push(`## Result ${i + 1}: write_file\nOK`);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        results.push(`## Result ${i + 1}: write_file\nError: ${msg}`);
      }
    } else if (firstLine.startsWith("update_instructions:")) {
      log(`  [update_instructions]`);
      writeFileSync(INSTRUCTIONS_PATH, rest, "utf-8");
      results.push(`## Result ${i + 1}: update_instructions\nOK`);
    } else if (firstLine.startsWith("git:")) {
      const args = firstLine.slice(4).trim() || rest;
      const workspacePath = getWorkspacePath(BASE_DIR);
      const subcommand = args.trim().split(/\s+/)[0].toLowerCase();
      if (!ALLOWED_GIT_COMMANDS.has(subcommand)) {
        results.push(`## Result ${i + 1}: git\nError: "git ${subcommand}" is not allowed. Allowed: ${[...ALLOWED_GIT_COMMANDS].join(", ")}.`);
      } else {
        log(`  [git] ${args}`);
        try {
          const output = execSync(`git ${args}`, { encoding: "utf-8", maxBuffer: 1024 * 1024, cwd: workspacePath });
          results.push(`## Result ${i + 1}: git\n${output || "(no output)"}`);
        } catch (err: unknown) {
          const e = err as { stdout?: string; stderr?: string; status?: number };
          results.push(`## Result ${i + 1}: git\nexit code ${e.status ?? 1}\nstdout: ${e.stdout ?? ""}\nstderr: ${e.stderr ?? ""}`);
        }
      }
    } else {
      results.push(`## Result ${i + 1}: unknown\nError: unknown action: ${firstLine}`);
    }
  }

  writeFileSync(SYSCALLS_PATH, results.join("\n\n") + "\n", "utf-8");
}

async function handleUserInteraction(): Promise<void> {
  const questions = getPendingQuestions();

  if (questions.length === 0) {
    const answer = await askUser("(the machine is asking for input but provided no question)");
    log(`  [user answered] ${answer}`);
    const memory = readFile(MEMORY_PATH);
    const updated = memory
      .replace(/^(## State\n).+/m, "$1user_responded")
      + `\n## Answers\n- **Q0**: ${answer}\n`;
    writeFileSync(MEMORY_PATH, updated, "utf-8");
    return;
  }

  for (const q of questions) {
    const answer = await askUser(`${q.id}: ${q.question}`);
    log(`  [${q.id} answered] ${answer}`);

    // Append answer to ## Answers immediately (saves partial progress)
    let memory = readFile(MEMORY_PATH);
    const answersMatch = memory.match(/^## Answers\n/m);
    if (answersMatch) {
      memory = memory.replace(/^(## Answers\n)/m, `$1- **${q.id}**: ${answer}\n`);
    } else {
      memory = memory + `\n## Answers\n- **${q.id}**: ${answer}\n`;
    }
    writeFileSync(MEMORY_PATH, memory, "utf-8");
  }

  // Set state to user_responded after all questions answered
  const memory = readFile(MEMORY_PATH);
  const updated = memory.replace(/^(## State\n).+/m, "$1user_responded");
  writeFileSync(MEMORY_PATH, updated, "utf-8");
}

async function runCycle(instructionsPath: string, memoryPath: string) {
  switch (PROVIDER) {
    case "claude-code": {
      const { runCycle: fn } = await import("./providers/claude-code.js");
      return fn(instructionsPath, memoryPath);
    }
    case "api": {
      const { runCycle: fn } = await import("./providers/api.js");
      return fn(instructionsPath, memoryPath);
    }
    case "openai": {
      const { runCycle: fn } = await import("./providers/openai.js");
      return fn(instructionsPath, memoryPath);
    }
    case "ollama": {
      const { runCycle: fn } = await import("./providers/ollama.js");
      return fn(instructionsPath, memoryPath);
    }
    case "local": {
      const { runCycle: fn } = await import("./providers/local.js");
      return fn(instructionsPath, memoryPath);
    }
    default:
      throw new Error(`Unknown provider: ${PROVIDER}. Use "claude-code", "api", "openai", "ollama", or "local".`);
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
  ensureMachineRepo(BASE_DIR);
  ensureProjectRepo(BASE_DIR);

  const startCycle = getStartCycle();
  log(`  Resuming from cycle ${startCycle}`);
  log("");

  for (let cycle = startCycle; cycle < startCycle + MAX_CYCLES; cycle++) {
    const currentState = getMemoryState();

    if (currentState === "waiting_for_user") {
      log(`--- Cycle ${cycle} (user interaction) ---`);
      const hash = commitCycle(BASE_DIR, cycle, "waiting_for_user");
      snapshot(cycle, hash);
      await handleUserInteraction();
      log("");
      continue;
    }

    log(`--- Cycle ${cycle} ---`);

    let result;
    let backoff = 60;
    for (;;) {
      try {
        result = await runCycle(INSTRUCTIONS_PATH, MEMORY_PATH);
        break;
      } catch (err: unknown) {
        if ((err as { name?: string })?.name === "QuotaExceededError") {
          const qErr = err as { retryAfterSeconds?: number | null; message: string };
          const waitSec = qErr.retryAfterSeconds ?? backoff;
          log(`  [quota] ${qErr.message}`);
          log(`  [quota] retrying in ${waitSec}s...`);
          await sleep(waitSec * 1000);
          backoff = Math.min(backoff * 2, 600);
          continue;
        }
        throw err;
      }
    }

    // Stateful mode: execute syscalls after LLM writes them
    if (STATEFUL) {
      // Check for no-match before executing syscalls
      const memoryContent = readFile(MEMORY_PATH);
      const matchedMatch = memoryContent.match(/^## Matched Instruction\n(.+)/m);
      const matchedValue = matchedMatch ? matchedMatch[1].trim().toLowerCase() : "";

      if (matchedValue === "none") {
        const state = getMemoryState();
        log(`  [no-match] No instruction matched state "${state}" — asking user`);
        const updated = memoryContent
          .replace(/^(## State\n).+/m, "$1waiting_for_user")
          .replace(/^## Pending Questions\n[\s\S]*?(?=\n## [A-Z]|\s*$)/m, "");
        writeFileSync(MEMORY_PATH,
          updated + `\n## Pending Questions\n- **Q0**: No instruction in INSTRUCTIONS.md matched state "${state}". What should the machine do next?\n`,
          "utf-8"
        );
        const hash = commitCycle(BASE_DIR, cycle, "waiting_for_user");
        snapshot(cycle, hash);
        await handleUserInteraction();
        log("");
        continue;
      }

      executeSyscalls();
      const state = getMemoryState();
      const hash = commitCycle(BASE_DIR, cycle, state);
      snapshot(cycle, hash);

      if (state === "done") {
        log(`\nMachine halted: done`);
        return;
      }

      if (state === "waiting_for_user") {
        await handleUserInteraction();
      }

      log("");
      continue;
    }

    const state = getMemoryState();

    // If the LLM couldn't match any instruction, ask the user
    if (result.noMatch) {
      log(`  [no-match] No instruction matched state "${state}" — asking user`);
      const memory = readFile(MEMORY_PATH);
      const updated = memory
        .replace(/^(## State\n).+/m, "$1waiting_for_user")
        .replace(/^## Pending Questions\n[\s\S]*?(?=\n## [A-Z]|\s*$)/m, "");
      writeFileSync(MEMORY_PATH,
        updated + `\n## Pending Questions\n- **Q0**: No instruction in INSTRUCTIONS.md matched state "${state}". What should the machine do next?\n`,
        "utf-8"
      );
    }

    const finalState = result.noMatch ? "waiting_for_user" : state;
    const hash = commitCycle(BASE_DIR, cycle, finalState);
    snapshot(cycle, hash);

    if (finalState === "done") {
      log(`\nMachine halted: done`);
      return;
    }

    if (finalState === "waiting_for_user") {
      await handleUserInteraction();
    }

    log("");
  }

  log(`\nMax cycles (${MAX_CYCLES}) reached — halting.`);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
