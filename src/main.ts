/**
 * main.ts — Cycle loop orchestrator.
 *
 * The shell: reads state, invokes the LLM, commits, checks for user
 * interaction, and repeats. All markdown parsing is in memory.ts,
 * all configuration in config.ts.
 */
import { mkdirSync, copyFileSync, cpSync, readFileSync, writeFileSync, readdirSync, existsSync, rmSync } from "fs";
import { execSync } from "child_process";
import { resolve, dirname, join } from "path";
import { fileURLToPath } from "url";
import { createInterface } from "readline";
import { initLog, log } from "./logger.js";
import { ensureMachineRepo, ensureProjectRepo, commitCycle, getWorkspacePath } from "./git.js";
import {
  initEvents, setCycleContext, clearCycleContext,
  emitCycleStart, emitCycleEnd, emitPush, emitPop, emitSplice,
  emitMachineGitCommit, emitInstructionsChanged, emitError, emitHalt, emitRetry,
  emitToolCall, emitToolResult, emitLlmRequest, emitLlmResponse,
} from "./events.js";
import type { ProviderEvent } from "./providers/shared.js";
import { ALLOWED_GIT_COMMANDS } from "./tools.js";
import { TelegramSession } from "./telegram.js";
import {
  BASE_DIR, activeFramePaths, HISTORY_DIR, SYSCALLS_PATH,
  CALL_STACK_PATH, PROVIDER, STATEFUL, INSTANCE_NAME,
  TELEGRAM_TOKEN, TELEGRAM_CHAT_ID, USE_TELEGRAM,
} from "./config.js";
import {
  parseState, parsePendingQuestions, getAnswersSection,
  writeAnswer, setState, type PendingQuestion,
} from "./memory.js";
import {
  loadCallStack, saveCallStack,
  applyPop, applyPush, type CallStack,
  substitutePlaceholders, slugFromTarget, formatFrameDir,
} from "./call-stack.js";

// --- Utilities ---

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
      emitRetry(attempt + 1, opts.label);
      await sleep(delay * 1000);
      delay = Math.min(delay * 2, maxDelay);
    }
  }
}

export function drainProviderEvents(events: ProviderEvent[]): void {
  for (const ev of events) {
    switch (ev.type) {
      case "llm_request":
        emitLlmRequest(ev.provider, ev.model, ev.prompt);
        break;
      case "llm_response":
        emitLlmResponse(ev.output, ev.durationMs, ev.usage);
        break;
      case "tool_call":
        emitToolCall(ev.tool, ev.input);
        break;
      case "tool_result":
        emitToolResult(ev.tool, ev.output, ev.isError);
        break;
      case "retry":
        emitRetry(ev.attempt, ev.reason);
        break;
    }
  }
}

function readFile(path: string): string {
  try { return readFileSync(path, "utf-8"); } catch { return ""; }
}

function getMemoryState(memoryPath: string): string {
  return parseState(readFile(memoryPath));
}

function getPendingQuestions(memoryPath: string): PendingQuestion[] {
  return parsePendingQuestions(readFile(memoryPath));
}

// --- User session ---

export interface UserSession {
  presentQuestion(id: string, question: string): Promise<void>;
  wasPresented(id: string, question: string): boolean;
  collectReplies(): Promise<string[]>;
  waitForAny(pollIntervalMs?: number): Promise<string[]>;
  getAnswers(): Map<string, string>;
}

class StdinSession implements UserSession {
  private presented = new Set<string>();
  private answers = new Map<string, string>();
  private pendingQueue: string[] = [];
  private previouslyCollected = new Set<string>();
  private rl = createInterface({ input: process.stdin, output: process.stdout, terminal: false });
  private listening = false;

  async presentQuestion(id: string, question: string): Promise<void> {
    this.presented.add(id);
    this.pendingQueue.push(id);
    log("");
    log(`\u250c\u2500 ${id} ${"\u2500".repeat(Math.max(0, 50 - id.length))}\u2510`);
    for (const line of question.split("\n")) log(`\u2502 ${line}`);
    log(`\u2514${"\u2500".repeat(54)}\u2518`);
    this.promptNext();
  }

  wasPresented(id: string, _question: string): boolean {
    return this.presented.has(id);
  }

  private promptNext(): void {
    const nextId = this.pendingQueue.find((id) => !this.answers.has(id));
    if (!nextId) { this.listening = false; return; }
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
    const newIds = [...this.presented].filter((id) => this.answers.has(id) && !this.previouslyCollected.has(id));
    for (const id of newIds) this.previouslyCollected.add(id);
    return newIds;
  }

  async waitForAny(): Promise<string[]> {
    this.promptNext();
    while (true) {
      const newIds = await this.collectReplies();
      if (newIds.length > 0) return newIds;
      await new Promise((r) => setTimeout(r, 200));
    }
  }

  getAnswers(): Map<string, string> { return new Map(this.answers); }
}

// --- Signal handling ---

process.on("SIGINT", () => {
  log("\nInterrupted \u2014 exiting.");
  try { clearCycleContext(); emitHalt("signal"); } catch {}
  process.exit(0);
});
process.on("SIGTERM", () => process.exit(0));

// --- Session setup ---

// Lazily initialized to avoid opening readline at import time (breaks test imports).
let _stdinFallback: StdinSession | null = null;
function getStdinFallback(): StdinSession {
  if (!_stdinFallback) _stdinFallback = new StdinSession();
  return _stdinFallback;
}

let _telegramSession: TelegramSession | null | undefined = undefined;
function getTelegramSession(): TelegramSession | null {
  if (_telegramSession === undefined) {
    _telegramSession = USE_TELEGRAM
      ? new TelegramSession(TELEGRAM_TOKEN, TELEGRAM_CHAT_ID, INSTANCE_NAME, BASE_DIR)
      : null;
  }
  return _telegramSession;
}

function getUserSession(): UserSession {
  const telegramSession = getTelegramSession();
  if (telegramSession && !telegramSession.degraded) return telegramSession;
  if (telegramSession?.degraded) log("  [telegram] Degraded \u2014 falling back to stdin");
  return getStdinFallback();
}

const userSession: UserSession = {
  presentQuestion: (id, q) => getUserSession().presentQuestion(id, q),
  wasPresented: (id, q) => getUserSession().wasPresented(id, q),
  collectReplies: () => getUserSession().collectReplies(),
  waitForAny: (p) => getUserSession().waitForAny(p),
  getAnswers: () => {
    const answers = new Map<string, string>();
    const ts = getTelegramSession();
    if (ts) for (const [k, v] of ts.getAnswers()) answers.set(k, v);
    for (const [k, v] of getStdinFallback().getAnswers()) answers.set(k, v);
    return answers;
  },
};

// --- Interaction helpers ---

async function sendCycleSummary(cycle: number, summary: string | undefined, memoryPath: string): Promise<void> {
  const telegramSession = getTelegramSession();
  if (!telegramSession || telegramSession.degraded || !summary) return;
  if (getPendingQuestions(memoryPath).length === 0) return;
  await telegramSession.sendInfo(`[${INSTANCE_NAME}] Cycle ${cycle}\n\n${summary}`);
}

async function presentNewQuestions(memoryPath: string): Promise<void> {
  for (const q of getPendingQuestions(memoryPath)) {
    if (!userSession.wasPresented(q.id, q.question)) {
      if (USE_TELEGRAM) log(`  [telegram] Sending ${q.id}: ${q.question}`);
      await userSession.presentQuestion(q.id, q.question);
    }
  }
}

async function collectReplies(memoryPath: string): Promise<void> {
  const newIds = await userSession.collectReplies();
  if (newIds.length === 0) return;

  const answers = userSession.getAnswers();
  let memory = readFile(memoryPath);
  const existing = getAnswersSection(memory);
  let wrote = false;

  for (const qId of newIds) {
    const answer = answers.get(qId)!;
    if (existing.includes(`- **${qId}**:`)) continue;
    log(`  [${qId} answered] ${answer}`);
    memory = writeAnswer(memory, qId, answer);
    wrote = true;
  }
  if (wrote) writeFileSync(memoryPath, memory, "utf-8");
}

async function handleUserInteraction(memoryPath: string): Promise<void> {
  await presentNewQuestions(memoryPath);

  const questions = getPendingQuestions(memoryPath);
  if (questions.length === 0) {
    await userSession.presentQuestion("Q0", "(the machine is asking for input but provided no question)");
  }

  const ids = questions.length > 0 ? questions.map((q) => q.id) : ["Q0"];
  log(`  Waiting for any reply to: ${ids.join(", ")}...`);
  const newIds = await userSession.waitForAny();

  const answers = userSession.getAnswers();
  let memory = readFile(memoryPath);
  const existing = getAnswersSection(memory);
  for (const qId of newIds) {
    const answer = answers.get(qId);
    if (!answer || existing.includes(`- **${qId}**:`)) continue;
    log(`  [${qId} answered] ${answer}`);
    memory = writeAnswer(memory, qId, answer);
  }
  writeFileSync(memoryPath, memory, "utf-8");

  memory = readFile(memoryPath);
  writeFileSync(memoryPath, setState(memory, "user_responded"), "utf-8");
}

// --- Syscalls (stateful mode) ---

function executeSyscalls(instructionsPath: string, frameDir: string): void {
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
        const output = execSync(command, { encoding: "utf-8", maxBuffer: 1024 * 1024, cwd: frameDir });
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
      writeFileSync(instructionsPath, rest, "utf-8");
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
    case "claude-code": return (await import("./providers/claude-code.js")).runCycle(instructionsPath, memoryPath);
    case "api": return (await import("./providers/api.js")).runCycle(instructionsPath, memoryPath);
    case "openai": return (await import("./providers/openai.js")).runCycle(instructionsPath, memoryPath);
    case "ollama": return (await import("./providers/ollama.js")).runCycle(instructionsPath, memoryPath);
    case "local": return (await import("./providers/local.js")).runCycle(instructionsPath, memoryPath);
    default: throw new Error(`Unknown provider: ${PROVIDER}. Use "claude-code", "api", "openai", "ollama", or "local".`);
  }
}

// --- Cycle helpers ---

function getStartCycle(): number {
  try {
    const entries = readdirSync(HISTORY_DIR);
    let max = 0;
    for (const entry of entries) {
      const match = entry.match(/^(\d+)/);
      if (match) { const num = parseInt(match[1], 10); if (num > max) max = num; }
    }
    return max + 1;
  } catch { return 1; }
}

function snapshot(cycle: number, hash: string): void {
  const dir = resolve(HISTORY_DIR, `${String(cycle).padStart(4, "0")}-${hash}`);
  mkdirSync(dir, { recursive: true });
  const framesSrc = resolve(BASE_DIR, "frames");
  if (existsSync(framesSrc)) {
    cpSync(framesSrc, resolve(dir, "frames"), { recursive: true });
  }
  if (existsSync(CALL_STACK_PATH)) {
    copyFileSync(CALL_STACK_PATH, resolve(dir, ".call-stack.json"));
  }
}

function handleNoMatch(state: string, memoryPath: string): void {
  const hasPending = getPendingQuestions(memoryPath).length > 0;
  log(`  [no-match] No instruction matched state "${state}" \u2014 ${hasPending ? "pending questions exist, waiting for user" : "asking user"}`);
  let memory = readFile(memoryPath);
  memory = setState(memory, "waiting_for_user");
  if (!hasPending) {
    memory += `\n## Pending Questions\n- **Q0**: No instruction in INSTRUCTIONS.md matched state "${state}". What should the machine do next?\n`;
  }
  writeFileSync(memoryPath, memory, "utf-8");
}

// --- Call stack shell wiring ---

/**
 * Run the pre-LLM stack block: cascade-pop on done, then push if ## Push is
 * present. Writes updated memory/instructions/stack to disk and returns
 * whether the machine should halt (state=done at depth 0).
 *
 * Reads/writes from the active frame's directory (derived from callStack).
 * After mutations, callStack is updated in-place.
 */
function runStackBlock(callStack: CallStack): boolean {
  // Resolve the current active frame's paths.
  const { memoryPath } = activeFramePaths(callStack);

  // Pop: use the Phase-2b applyPop.
  const popped = applyPop(
    callStack,
    readFile(memoryPath),
    (fd, file) => readFile(resolve(BASE_DIR, fd, file)),
  );

  if (popped.events.length > 0) {
    // Write the updated caller memory to its frame's MEMORY.md.
    writeFileSync(
      resolve(BASE_DIR, popped.callerFrameDir, "MEMORY.md"),
      popped.callerMemoryAfter,
      "utf-8",
    );

    // Warn when cascade pop fires: intermediate frame MEMORIes are computed
    // in applyPop but only the final caller's MEMORY is written to disk above.
    // See the JSDoc on applyPop in call-stack.ts for the full explanation.
    if (popped.events.length > 1) {
      log(`  [pop] WARN: cascade pop with ${popped.events.length} events; intermediate frame MEMORIes were not persisted (only the final caller).`);
    }

    // rmSync each popped frame's directory and log events.
    for (const ev of popped.events) {
      rmSync(resolve(BASE_DIR, ev.frameDir), { recursive: true, force: true });
      log(`  [pop] \u2192 ${ev.returnState}_completed (depth ${ev.depthAfter})`);
      if (ev.splicedKeys && ev.splicedKeys.length > 0) {
        emitSplice(popped.callerFrameDir, ev.splicedKeys);
      }
      emitPop(ev.frameDir, ev.returnState, ev.depthAfter);
      if (ev.missingReturn) log(`  [pop] ${ev.frameDir}: no ## Return section`);
      for (const mal of ev.malformedLines) {
        log(`  [pop] ${ev.frameDir}: malformed return entry: ${mal}`);
      }
    }

    // Update the callStack reference in-place.
    callStack.nextCounter = popped.callStack.nextCounter;
    callStack.stack.length = 0;
    callStack.stack.push(...popped.callStack.stack);
    saveCallStack(CALL_STACK_PATH, callStack);
  }

  // Re-resolve active frame paths after potential pops.
  const { memoryPath: memPathAfterPop } = activeFramePaths(callStack);

  // Halt: state=done and only the root frame remains (stack.length === 1).
  if (getMemoryState(memPathAfterPop) === "done" && callStack.stack.length === 1) return true;

  // Push: use the Phase-2b applyPush.
  const pushed = applyPush(
    callStack,
    readFile(memPathAfterPop),
    (p) => {
      const content = readFile(resolve(BASE_DIR, p));
      return content || null;
    },
  );
  if (pushed.ok) {
    // Write caller's updated MEMORY (Push/Push-Args stripped) back to caller's frame.
    writeFileSync(memPathAfterPop, pushed.callerMemoryAfter, "utf-8");

    // Create the child frame directory and write its MEMORY + INSTRUCTIONS.
    const childFrameDir = resolve(BASE_DIR, pushed.frameDir);
    mkdirSync(resolve(childFrameDir, "scoped"), { recursive: true });
    writeFileSync(resolve(childFrameDir, "MEMORY.md"), pushed.childMemory, "utf-8");
    writeFileSync(resolve(childFrameDir, "INSTRUCTIONS.md"), pushed.childInstructions, "utf-8");

    // Persist the updated call stack.
    Object.assign(callStack, pushed.callStack);
    saveCallStack(CALL_STACK_PATH, callStack);
    log(`  [push] ${pushed.target} → ${pushed.frameDir} (depth ${pushed.callStack.stack.length - 1})`);
    emitPush(pushed.target, pushed.frameDir, pushed.callStack.stack.length - 1);
  } else if (pushed.reason === "missing-target") {
    writeFileSync(memPathAfterPop, pushed.memory, "utf-8");
    log(`  [push] ERROR: ${pushed.target} not found or empty, skipping`);
  } else if (pushed.reason === "unresolved-placeholder") {
    writeFileSync(memPathAfterPop, pushed.memory, "utf-8");
    log(`  [push] ${pushed.target}: unresolved placeholder(s) ${pushed.placeholders.join(", ")}`);
  }
  return false;
}

// --- Phase-7 bootstrap ---

export interface BootstrapResult {
  callStack: CallStack;
  memoryPath: string;
  instructionsPath: string;
}

/**
 * Read `.root-operator` from baseDir, derive the root frame slug, substitute
 * `{{program}}` from PROGRAM.md, and create `frames/f000-<slug>/` with
 * INSTRUCTIONS.md, MEMORY.md, scoped/, and an initialized .call-stack.json.
 *
 * Satisfies: R11 (reads .root-operator), R12 (slug from operator filename),
 * R17 (frame dir f000-<slug>).
 *
 * Throws if .root-operator is absent or empty (R14 — caller handles the error
 * message; T9 will provide the canonical user-facing message).
 */
export function startupBootstrap(baseDir: string): BootstrapResult {
  const rootOpFile = join(baseDir, ".root-operator");
  const rootOpPath = existsSync(rootOpFile) ? readFileSync(rootOpFile, "utf-8").trim() : "";
  if (!rootOpPath) {
    throw new Error(
      "no .root-operator configured for this instance — pre-Phase-7 instances " +
      "are read-only artefacts; create a new instance via new-instance.sh",
    );
  }

  const slug = slugFromTarget(rootOpPath);
  const frameDirRelative = formatFrameDir(0, slug);

  const operatorContent = readFileSync(join(baseDir, rootOpPath), "utf-8");
  const programPath = join(baseDir, "PROGRAM.md");
  const programContent = existsSync(programPath) ? readFileSync(programPath, "utf-8") : "";
  const { result: substituted } = substitutePlaceholders(operatorContent, { program: programContent });

  mkdirSync(join(baseDir, frameDirRelative, "scoped"), { recursive: true });
  writeFileSync(join(baseDir, frameDirRelative, "INSTRUCTIONS.md"), substituted, "utf-8");
  writeFileSync(join(baseDir, frameDirRelative, "MEMORY.md"), "## State\nempty\n", "utf-8");

  const callStack: CallStack = {
    nextCounter: 1,
    stack: [{ returnState: "<root>", frameDir: frameDirRelative }],
  };
  writeFileSync(join(baseDir, ".call-stack.json"), JSON.stringify(callStack, null, 2), "utf-8");

  return {
    callStack,
    memoryPath: join(baseDir, frameDirRelative, "MEMORY.md"),
    instructionsPath: join(baseDir, frameDirRelative, "INSTRUCTIONS.md"),
  };
}

// --- Main loop ---

async function main() {
  initLog(BASE_DIR);
  initEvents(BASE_DIR);
  clearCycleContext();

  log("Turing machine starting");
  log(`  Provider:     ${PROVIDER}`);
  log(`  Instance:     ${BASE_DIR}`);
  if (USE_TELEGRAM) log(`  Telegram:     enabled (chat ${TELEGRAM_CHAT_ID})`);

  mkdirSync(HISTORY_DIR, { recursive: true });
  ensureMachineRepo(BASE_DIR);
  ensureProjectRepo(BASE_DIR);

  // Phase-7 bootstrap: if no call stack exists yet, read .root-operator and
  // create the root frame before the cycle loop begins.
  if (!existsSync(CALL_STACK_PATH)) {
    try {
      startupBootstrap(BASE_DIR);
      log("  Bootstrapped root frame from .root-operator");
    } catch (err) {
      log(`  [bootstrap] ${err instanceof Error ? err.message : err}`);
      // Fall through: loadCallStack will return freshCallStack() with the legacy
      // frames/f000-strategy dir, which works for pre-Phase-7 instances.
    }
  }

  const callStack = loadCallStack(CALL_STACK_PATH);

  const startCycle = getStartCycle();
  log(`  Resuming from cycle ${startCycle}`);
  const stackDepth = callStack.stack.length - 1; // root frame not counted
  if (stackDepth > 0) log(`  Call stack depth: ${stackDepth}`);
  log("");

  for (let cycle = startCycle; ; cycle++) {
    // Resolve active frame paths at the top of each cycle.
    const { frameDir, memoryPath, instructionsPath } = activeFramePaths(callStack);

    await collectReplies(memoryPath);

    // Set cycle context with the pre-stack-ops top frame so that push/pop/splice
    // events fired inside runStackBlock are stamped with the correct cycle number.
    // Use the relative frameDir from the call stack (not the absolute path
    // returned by activeFramePaths) so events.jsonl entries match the
    // visualizer's selectedFrameDir filter, which is also relative.
    setCycleContext(cycle, callStack.stack[callStack.stack.length - 1].frameDir);

    // Deterministic stack management (before LLM invocation)
    if (runStackBlock(callStack)) {
      log(`\nMachine halted: done`);
      clearCycleContext();
      emitHalt("done");
      return;
    }

    // Re-resolve after potential push/pop mutations.
    const { frameDir: fd2, memoryPath: mp2, instructionsPath: ip2 } = activeFramePaths(callStack);

    // Re-set cycle context with the post-stack-ops active frame (the frame the LLM will execute in).
    setCycleContext(cycle, callStack.stack[callStack.stack.length - 1].frameDir);
    emitCycleStart();
    const t0 = Date.now();
    const instructionsBytesBefore = readFileSync(ip2, "utf-8").length;

    const currentState = getMemoryState(mp2);

    if (currentState === "waiting_for_user") {
      log(`--- Cycle ${cycle} (frame: ${fd2}) (user interaction) ---`);
      const hash = commitCycle(BASE_DIR, cycle, "waiting_for_user");
      snapshot(cycle, hash);
      emitMachineGitCommit(hash, `cycle ${cycle}: waiting_for_user`);
      emitCycleEnd("waiting_for_user", Date.now() - t0);
      await handleUserInteraction(mp2);
      log("");
      continue;
    }

    log(`--- Cycle ${cycle} (frame: ${fd2}) ---`);

    const result = await withBackoff(
      () => runCycle(ip2, mp2),
      {
        label: "quota",
        initialDelaySec: 60,
        maxDelaySec: 600,
        maxRetries: 10,
        shouldRetry: (err) => (err as { name?: string })?.name === "QuotaExceededError",
      }
    );

    // Drain provider events before any other state inspection.
    drainProviderEvents(result.events);

    // Re-resolve after provider invocation (provider may have changed files).
    const { frameDir: fd3, memoryPath: mp3, instructionsPath: ip3 } = activeFramePaths(callStack);

    // Stateful mode
    if (STATEFUL) {
      const memoryContent = readFile(mp3);
      const matchedMatch = memoryContent.match(/^## Matched Instruction\n(.+)/m);
      const matchedValue = matchedMatch ? matchedMatch[1].trim().toLowerCase() : "";

      if (matchedValue === "none") {
        handleNoMatch(getMemoryState(mp3), mp3);
        const hash = commitCycle(BASE_DIR, cycle, "waiting_for_user");
        snapshot(cycle, hash);
        const instructionsBytesAfterStatefulNone = readFileSync(ip3, "utf-8").length;
        if (instructionsBytesAfterStatefulNone !== instructionsBytesBefore) {
          emitInstructionsChanged(instructionsBytesBefore, instructionsBytesAfterStatefulNone);
        }
        emitMachineGitCommit(hash, `cycle ${cycle}: waiting_for_user`);
        emitCycleEnd("waiting_for_user", Date.now() - t0);
        await handleUserInteraction(mp3);
        log("");
        continue;
      }

      executeSyscalls(ip3, fd3);
      const state = getMemoryState(mp3);
      const hash = commitCycle(BASE_DIR, cycle, state);
      snapshot(cycle, hash);
      const instructionsBytesAfterStateful = readFileSync(ip3, "utf-8").length;
      if (instructionsBytesAfterStateful !== instructionsBytesBefore) {
        emitInstructionsChanged(instructionsBytesBefore, instructionsBytesAfterStateful);
      }
      emitMachineGitCommit(hash, `cycle ${cycle}: ${state}`);
      emitCycleEnd(state, Date.now() - t0);

      await sendCycleSummary(cycle, result.summary, mp3);
      await presentNewQuestions(mp3);
      if (state === "waiting_for_user") await handleUserInteraction(mp3);

      log("");
      continue;
    }

    // Non-stateful mode
    const state = getMemoryState(mp3);

    if (result.noMatch) {
      handleNoMatch(state, mp3);
    }

    const finalState = result.noMatch ? "waiting_for_user" : state;
    const hash = commitCycle(BASE_DIR, cycle, finalState);
    snapshot(cycle, hash);
    const instructionsBytesAfter = readFileSync(ip3, "utf-8").length;
    if (instructionsBytesAfter !== instructionsBytesBefore) {
      emitInstructionsChanged(instructionsBytesBefore, instructionsBytesAfter);
    }
    emitMachineGitCommit(hash, `cycle ${cycle}: ${finalState}`);
    emitCycleEnd(finalState, Date.now() - t0);

    await sendCycleSummary(cycle, result.summary, mp3);
    await presentNewQuestions(mp3);
    if (finalState === "waiting_for_user") await handleUserInteraction(mp3);

    log("");
  }
}

// Only run main() when this file is executed directly (not imported by tests).
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((err: unknown) => {
    if ((err as { name?: string })?.name === "QuotaExceededError") {
      try { clearCycleContext(); emitHalt("quota_exceeded"); } catch { /* logs may be uninitialized */ }
      console.error("Quota exceeded — exiting cleanly (resumable):", err);
      process.exit(0);
    }
    try { emitError(err instanceof Error ? err : new Error(String(err))); } catch { /* logs may be uninitialized */ }
    console.error("Fatal error:", err);
    process.exit(1);
  });
}
