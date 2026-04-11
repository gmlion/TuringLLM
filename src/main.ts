import { config } from "dotenv";
import { resolve, dirname, basename } from "path";
import { mkdirSync, copyFileSync, readFileSync, writeFileSync, readdirSync, existsSync } from "fs";
import { execSync } from "child_process";
import { createInterface } from "readline";
import { initLog, log, getLogPath } from "./logger.js";
import { ensureMachineRepo, ensureProjectRepo, commitCycle } from "./git.js";
import { getWorkspacePath } from "./git.js";
import { ALLOWED_GIT_COMMANDS } from "./tools.js";
import { TelegramSession } from "./telegram.js";

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

export async function withBackoff<T>(
  fn: () => Promise<T>,
  opts: { label: string; maxRetries?: number; initialDelaySec?: number; maxDelaySec?: number; shouldRetry?: (err: unknown) => boolean }
): Promise<T> {
  const maxRetries = opts.maxRetries ?? 5;
  const maxDelay = opts.maxDelaySec ?? 300;
  let delay = opts.initialDelaySec ?? 5;
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (attempt >= maxRetries || (opts.shouldRetry && !opts.shouldRetry(err))) throw err;
      log(`  [${opts.label}] ${err instanceof Error ? err.message : err}`);
      log(`  [${opts.label}] retrying in ${delay}s... (attempt ${attempt + 1}/${maxRetries})`);
      await sleep(delay * 1000);
      delay = Math.min(delay * 2, maxDelay);
    }
  }
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
  const match = memory.match(/^## Pending Questions\n([\s\S]*?)(?=\n## [A-Z])/m)
    || memory.match(/^## Pending Questions\n([\s\S]+)$/m);
  if (!match) return [];
  const items: Array<{id: string, question: string}> = [];
  const parts = match[1].split(/^(?=- \*\*\w+\*\*:)/gm).filter(Boolean);
  for (const part of parts) {
    const m = part.match(/^- \*\*(\w+)\*\*:\s*([\s\S]*)/);
    if (m) items.push({ id: m[1], question: m[2].trim() });
  }
  return items;
}

// --- User session: unified async interface for stdin and Telegram ---

export interface UserSession {
  presentQuestion(id: string, question: string): Promise<void>;
  wasPresented(id: string): boolean;
  collectReplies(): Promise<string[]>;
  waitForAll(ids: string[]): Promise<void>;
  getAnswers(): Map<string, string>;
}

class StdinSession implements UserSession {
  private presented: Set<string> = new Set();
  private answers: Map<string, string> = new Map();
  private pendingQueue: string[] = [];
  private rl = createInterface({ input: process.stdin, output: process.stdout, terminal: false });
  private listening = false;

  constructor() {
    this.rl.on("close", () => process.exit(0));
    process.on("SIGINT", () => process.exit(0));
  }

  async presentQuestion(id: string, question: string): Promise<void> {
    this.presented.add(id);
    this.pendingQueue.push(id);
    log("");
    log(`\u250c\u2500 ${id} ${"\u2500".repeat(Math.max(0, 50 - id.length))}\u2510`);
    for (const line of question.split("\n")) {
      log(`\u2502 ${line}`);
    }
    log(`\u2514${"\u2500".repeat(54)}\u2518`);
    this.promptNext();
  }

  wasPresented(id: string): boolean {
    return this.presented.has(id);
  }

  private promptNext(): void {
    const nextId = this.pendingQueue.find((id) => !this.answers.has(id));
    if (!nextId) {
      this.listening = false;
      return;
    }
    if (this.listening) return;
    this.listening = true;
    process.stdout.write(`  ${nextId} > `);
    this.rl.once("line", (answer) => {
      this.listening = false;
      this.answers.set(nextId, answer);
      this.promptNext();
    });
  }

  async collectReplies(): Promise<string[]> {
    return [...this.presented].filter((id) => this.answers.has(id));
  }

  async waitForAll(ids: string[]): Promise<void> {
    this.promptNext();
    while (!ids.every((id) => this.answers.has(id))) {
      await new Promise((r) => setTimeout(r, 200));
    }
  }

  getAnswers(): Map<string, string> {
    return new Map(this.answers);
  }
}

const INSTANCE_NAME = basename(BASE_DIR);
const stdinFallback = new StdinSession();
const telegramSession = USE_TELEGRAM
  ? new TelegramSession(TELEGRAM_TOKEN, TELEGRAM_CHAT_ID, INSTANCE_NAME)
  : null;

function getUserSession(): UserSession {
  if (telegramSession && !telegramSession.degraded) return telegramSession;
  if (telegramSession?.degraded) log("  [telegram] Degraded — falling back to stdin");
  return stdinFallback;
}

// Proxy that checks degraded state on each call
const userSession: UserSession = {
  presentQuestion: (id, q) => getUserSession().presentQuestion(id, q),
  wasPresented: (id) => (telegramSession?.wasPresented(id) || stdinFallback.wasPresented(id)),
  collectReplies: () => getUserSession().collectReplies(),
  waitForAll: (ids) => getUserSession().waitForAll(ids),
  getAnswers: () => {
    const answers = new Map<string, string>();
    if (telegramSession) for (const [k, v] of telegramSession.getAnswers()) answers.set(k, v);
    for (const [k, v] of stdinFallback.getAnswers()) answers.set(k, v);
    return answers;
  },
};

/** Present any new pending questions to the user (print to console / send to Telegram). */
async function presentNewQuestions(): Promise<void> {
  const questions = getPendingQuestions();
  for (const q of questions) {
    if (!userSession.wasPresented(q.id)) {
      if (USE_TELEGRAM) log(`  [telegram] Sending ${q.id}: ${q.question}`);
      await userSession.presentQuestion(q.id, q.question);
    }
  }
}

/** Collect any user replies and write them to ## Answers in MEMORY. */
async function collectReplies(): Promise<void> {
  const newAnswerIds = await userSession.collectReplies();
  if (newAnswerIds.length === 0) return;

  const answers = userSession.getAnswers();
  let memory = readFile(MEMORY_PATH);
  let wrote = false;

  const existingAnswers = memory.match(/^## Answers\n([\s\S]*?)(?=\n## [A-Z]|$)/m)?.[1] || "";
  for (const qId of newAnswerIds) {
    const answer = answers.get(qId)!;
    if (existingAnswers.includes(`- **${qId}**:`)) continue;
    wrote = true;
    log(`  [${qId} answered] ${answer}`);
    const answersMatch = memory.match(/^## Answers\n/m);
    if (answersMatch) {
      memory = memory.replace(/^(## Answers\n)/m, `$1- **${qId}**: ${answer}\n`);
    } else {
      memory = memory + `\n## Answers\n- **${qId}**: ${answer}\n`;
    }
  }

  if (wrote) writeFileSync(MEMORY_PATH, memory, "utf-8");
}

async function handleUserInteraction(): Promise<void> {
  const questions = getPendingQuestions();

  // Ensure all questions are presented
  await presentNewQuestions();

  if (questions.length === 0) {
    // No pending questions but state is waiting_for_user
    await userSession.presentQuestion("Q0", "(the machine is asking for input but provided no question)");
    await userSession.waitForAll(["Q0"]);
    const answer = userSession.getAnswers().get("Q0") || "";
    log(`  [user answered] ${answer}`);
    const memory = readFile(MEMORY_PATH);
    const updated = memory
      .replace(/^(## State\n).+/m, "$1user_responded")
      + `\n## Answers\n- **Q0**: ${answer}\n`;
    writeFileSync(MEMORY_PATH, updated, "utf-8");
    return;
  }

  // Wait for all pending questions to be answered
  const questionIds = questions.map((q) => q.id);
  log(`  Waiting for replies to: ${questionIds.join(", ")}...`);
  await userSession.waitForAll(questionIds);

  // Write any answers not yet in MEMORY
  const answers = userSession.getAnswers();
  let memory = readFile(MEMORY_PATH);
  const answersSection = memory.match(/^## Answers\n([\s\S]*?)(?=\n## [A-Z]|$)/m)?.[1] || "";
  for (const q of questions) {
    const answer = answers.get(q.id);
    if (!answer || answersSection.includes(`- **${q.id}**:`)) continue;
    log(`  [${q.id} answered] ${answer}`);
    const answersMatch = memory.match(/^## Answers\n/m);
    if (answersMatch) {
      memory = memory.replace(/^(## Answers\n)/m, `$1- **${q.id}**: ${answer}\n`);
    } else {
      memory = memory + `\n## Answers\n- **${q.id}**: ${answer}\n`;
    }
  }
  writeFileSync(MEMORY_PATH, memory, "utf-8");

  memory = readFile(MEMORY_PATH);
  const updated = memory.replace(/^(## State\n).+/m, "$1user_responded");
  writeFileSync(MEMORY_PATH, updated, "utf-8");
}

// --- Syscalls (stateful mode) ---

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

// --- Provider dispatch ---

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

// --- Main loop ---

async function main() {
  initLog(BASE_DIR);

  log("Turing machine starting");
  log(`  Provider:     ${PROVIDER}`);
  log(`  MEMORY:       ${MEMORY_PATH}`);
  log(`  INSTRUCTIONS: ${INSTRUCTIONS_PATH}`);
  log(`  Log:          ${getLogPath()}`);
  if (USE_TELEGRAM) log(`  Telegram:     enabled (chat ${TELEGRAM_CHAT_ID})`);

  mkdirSync(HISTORY_DIR, { recursive: true });
  ensureMachineRepo(BASE_DIR);
  ensureProjectRepo(BASE_DIR);

  const startCycle = getStartCycle();
  log(`  Resuming from cycle ${startCycle}`);
  log("");

  for (let cycle = startCycle; cycle < startCycle + MAX_CYCLES; cycle++) {
    // Collect any user replies that arrived since last cycle
    await collectReplies();

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

    const result = await withBackoff(
      () => runCycle(INSTRUCTIONS_PATH, MEMORY_PATH),
      {
        label: "quota",
        initialDelaySec: 60,
        maxDelaySec: 600,
        maxRetries: 10,
        shouldRetry: (err) => (err as { name?: string })?.name === "QuotaExceededError",
      }
    );

    // Stateful mode: execute syscalls after LLM writes them
    if (STATEFUL) {
      const memoryContent = readFile(MEMORY_PATH);
      const matchedMatch = memoryContent.match(/^## Matched Instruction\n(.+)/m);
      const matchedValue = matchedMatch ? matchedMatch[1].trim().toLowerCase() : "";

      if (matchedValue === "none") {
        const state = getMemoryState();
        const hasPendingQuestions = getPendingQuestions().length > 0;
        log(`  [no-match] No instruction matched state "${state}" \u2014 ${hasPendingQuestions ? "pending questions exist, waiting for user" : "asking user"}`);
        let updated = memoryContent.replace(/^(## State\n).+/m, "$1waiting_for_user");
        if (!hasPendingQuestions) {
          updated = updated + `\n## Pending Questions\n- **Q0**: No instruction in INSTRUCTIONS.md matched state "${state}". What should the machine do next?\n`;
        }
        writeFileSync(MEMORY_PATH, updated, "utf-8");
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

      // Present any new pending questions immediately
      await presentNewQuestions();

      if (state === "waiting_for_user") {
        await handleUserInteraction();
      }

      log("");
      continue;
    }

    const state = getMemoryState();

    // If the LLM couldn't match any instruction, ask the user
    if (result.noMatch) {
      const hasPendingQuestions = getPendingQuestions().length > 0;
      log(`  [no-match] No instruction matched state "${state}" \u2014 ${hasPendingQuestions ? "pending questions exist, waiting for user" : "asking user"}`);
      const memory = readFile(MEMORY_PATH);
      let updated = memory.replace(/^(## State\n).+/m, "$1waiting_for_user");
      if (!hasPendingQuestions) {
        updated = updated + `\n## Pending Questions\n- **Q0**: No instruction in INSTRUCTIONS.md matched state "${state}". What should the machine do next?\n`;
      }
      writeFileSync(MEMORY_PATH, updated, "utf-8");
    }

    const finalState = result.noMatch ? "waiting_for_user" : state;
    const hash = commitCycle(BASE_DIR, cycle, finalState);
    snapshot(cycle, hash);

    if (finalState === "done") {
      log(`\nMachine halted: done`);
      return;
    }

    // Present any new pending questions immediately
    await presentNewQuestions();

    if (finalState === "waiting_for_user") {
      await handleUserInteraction();
    }

    log("");
  }

  log(`\nMax cycles (${MAX_CYCLES}) reached \u2014 halting.`);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
