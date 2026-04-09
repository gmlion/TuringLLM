import { readFileSync } from "fs";
import { log } from "../logger.js";
import type { ToolResult } from "../tools.js";

export const MAX_RETRIES = 20;

export type CycleResult = {
  halt: boolean;
  haltMessage?: string;
  noMatch?: boolean;
};

export function readFile(path: string): string {
  try {
    return readFileSync(path, "utf-8");
  } catch {
    return "";
  }
}

export function logToolCall(name: string, input: Record<string, unknown>, result: ToolResult): void {
  if (name === "bash") {
    const cmd = typeof input.command === "string" ? input.command : "";
    log(`  [bash] ${cmd}${result.error ? " (error)" : ""}`);
  } else if (name === "write_file") {
    log(`  [write_file] ${input.path}${result.error ? " (error)" : ""}`);
  } else if (name === "git") {
    log(`  [git] ${input.args}${result.error ? " (error)" : ""}`);
  } else if (name === "update_instructions") {
    log(`  [update_instructions]`);
  } else if (name === "halt") {
    log(`  [halt] ${input.message}`);
  } else if (name === "ask_user") {
    log(`  [ask_user]`);
  }
}

export type CompletenessResult = {
  complete: boolean;
  problem: string;
  halt: boolean;
  haltMessage: string;
  noMatch: boolean;
  state: string;
};

export function checkCycleCompleteness(
  memoryPath: string,
  instructionsPath: string,
  filesBefore: [string, string]
): CompletenessResult {
  const memoryAfter = readFile(memoryPath);
  const instructionsAfter = readFile(instructionsPath);
  const memoryChanged = memoryAfter !== filesBefore[0];
  const instructionsChanged = instructionsAfter !== filesBefore[1];

  const stateMatch = memoryAfter.match(/^## State\n(.+)/m);
  const newState = stateMatch ? stateMatch[1].trim() : "";

  // All providers should detect "done" state consistently
  if (newState === "done") {
    const lastAction = memoryAfter.match(/^## Last Action\n([\s\S]*?)(?=\n## |\n*$)/m);
    return {
      complete: true,
      problem: "",
      halt: true,
      haltMessage: lastAction ? lastAction[1].trim() : "Program complete",
      noMatch: false,
      state: newState,
    };
  }

  if (newState === "waiting_for_user") {
    return { complete: true, problem: "", halt: false, haltMessage: "", noMatch: false, state: newState };
  }

  // Check if the LLM declared no matching instruction
  const matchedMatch = memoryAfter.match(/^## Matched Instruction\n(.+)/m);
  const matchedValue = matchedMatch ? matchedMatch[1].trim().toLowerCase() : "";
  const noMatch = matchedValue === "none";

  if (noMatch) {
    return {
      complete: true,
      problem: "",
      halt: false,
      haltMessage: "",
      noMatch: true,
      state: newState,
    };
  }

  let problem = "";
  if (!memoryChanged && !instructionsChanged) {
    problem = "You did not update MEMORY.md or INSTRUCTIONS.md. The cycle is incomplete.";
  }

  return {
    complete: !problem,
    problem,
    halt: false,
    haltMessage: "",
    noMatch: false,
    state: newState,
  };
}
