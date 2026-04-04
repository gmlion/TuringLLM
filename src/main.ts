import { resolve } from "path";
import { mkdirSync, copyFileSync, readdirSync } from "fs";
import {
  getPlanSystemPrompt,
  getExecuteSystemPrompt,
  getUserPrompt,
} from "./prompt.js";
import { runPlanPhase, runExecutePhase } from "./llm.js";

const BASE_DIR = process.cwd();
const MEMORY_PATH = resolve(BASE_DIR, "MEMORY.md");
const INSTRUCTIONS_PATH = resolve(BASE_DIR, "INSTRUCTIONS.md");
const HISTORY_DIR = resolve(BASE_DIR, "history");
const MAX_CYCLES = 100;

function getStartCycle(): number {
  try {
    const entries = readdirSync(HISTORY_DIR);
    let max = 0;
    for (const entry of entries) {
      const match = entry.match(/^(\d+)-/);
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

function snapshotCycle(cycle: number, phase: string) {
  const dir = resolve(HISTORY_DIR, `${String(cycle).padStart(4, "0")}-${phase}`);
  mkdirSync(dir, { recursive: true });
  copyFileSync(MEMORY_PATH, resolve(dir, "MEMORY.md"));
  copyFileSync(INSTRUCTIONS_PATH, resolve(dir, "INSTRUCTIONS.md"));
}

async function main() {
  console.log("Turing machine starting");
  console.log(`  MEMORY:       ${MEMORY_PATH}`);
  console.log(`  INSTRUCTIONS: ${INSTRUCTIONS_PATH}`);
  console.log();

  mkdirSync(HISTORY_DIR, { recursive: true });

  const startCycle = getStartCycle();
  console.log(`  Resuming from cycle ${startCycle}`);
  console.log();

  for (let cycle = startCycle; cycle < startCycle + MAX_CYCLES; cycle++) {
    console.log(`--- Cycle ${cycle} ---`);

    // PLAN phase
    snapshotCycle(cycle, "pre-plan");
    const planPrompt = getUserPrompt(MEMORY_PATH, INSTRUCTIONS_PATH);
    console.log("  [PLAN]");
    await runPlanPhase(getPlanSystemPrompt(), planPrompt, INSTRUCTIONS_PATH);

    // EXECUTE phase
    snapshotCycle(cycle, "pre-exec");
    const execPrompt = getUserPrompt(MEMORY_PATH, INSTRUCTIONS_PATH);
    console.log("  [EXECUTE]");
    const result = await runExecutePhase(
      getExecuteSystemPrompt(),
      execPrompt,
      INSTRUCTIONS_PATH,
      MEMORY_PATH
    );

    if (result.halt) {
      snapshotCycle(cycle, "final");
      console.log(`\nMachine halted: ${result.haltMessage}`);
      return;
    }
    console.log();
  }

  console.log(`\nMax cycles (${MAX_CYCLES}) reached — halting.`);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
