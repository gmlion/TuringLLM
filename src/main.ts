import { resolve } from "path";
import { mkdirSync, copyFileSync, readdirSync } from "fs";
import { getSystemPrompt, getUserPrompt } from "./prompt.js";
import { runCycle } from "./llm.js";

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

async function main() {
  console.log("Turing machine starting");
  console.log(`  MEMORY:       ${MEMORY_PATH}`);
  console.log(`  INSTRUCTIONS: ${INSTRUCTIONS_PATH}`);

  mkdirSync(HISTORY_DIR, { recursive: true });

  const startCycle = getStartCycle();
  console.log(`  Resuming from cycle ${startCycle}`);
  console.log();

  const systemPrompt = getSystemPrompt();

  for (let cycle = startCycle; cycle < startCycle + MAX_CYCLES; cycle++) {
    snapshot(cycle);
    console.log(`--- Cycle ${cycle} ---`);

    const userPrompt = getUserPrompt(MEMORY_PATH, INSTRUCTIONS_PATH);
    const result = await runCycle(systemPrompt, userPrompt, INSTRUCTIONS_PATH, MEMORY_PATH);

    if (result.halt) {
      snapshot(cycle + 1);
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
