import { readFileSync } from "fs";
import { log } from "../logger.js";
import type { ToolResult } from "../tools.js";
import {
  emitLlmRequest, emitLlmResponse,
  emitToolCall, emitToolResult, emitRetry,
} from "../events.js";

export const MAX_RETRIES = 20;

export type ProviderEvent =
  | { type: "llm_request"; provider: string; model: string; prompt: string }
  | { type: "llm_response"; output: string; durationMs: number; usage?: object }
  | { type: "tool_call"; tool: string; input: string }
  | { type: "tool_result"; tool: string; output: string; isError: boolean }
  | { type: "retry"; attempt: number; reason: string };

/**
 * Dispatch table for ProviderEvent types. Maps event types to their corresponding
 * emit functions. Eliminates control flow and makes event handling declarative.
 */
const eventHandlers: Record<ProviderEvent['type'], (ev: ProviderEvent) => void> = {
  llm_request: (ev) => emitLlmRequest((ev as any).provider, (ev as any).model, (ev as any).prompt),
  llm_response: (ev) => emitLlmResponse((ev as any).output, (ev as any).durationMs, (ev as any).usage),
  tool_call: (ev) => emitToolCall((ev as any).tool, (ev as any).input),
  tool_result: (ev) => emitToolResult((ev as any).tool, (ev as any).output, (ev as any).isError),
  retry: (ev) => emitRetry((ev as any).attempt, (ev as any).reason),
};

/**
 * Translate the buffered ProviderEvent list (returned by every provider's
 * runCycle) into the corresponding emit calls. Providers buffer rather
 * than emit directly so a provider can be unit-tested without an active
 * events.jsonl, and so the shell can decide on ordering vs. its own
 * cycle-start/end emissions.
 */
export function drainProviderEvents(events: ProviderEvent[]): void {
  for (const ev of events) {
    eventHandlers[ev.type](ev);
  }
}

export type CycleResult = {
  halt: boolean;
  haltMessage?: string;
  noMatch?: boolean;
  summary?: string;
  events: ProviderEvent[];  // required (B-architecture: every provider must populate)
};

export type ProviderModule = {
  runCycle: (instructionsPath: string, memoryPath: string) => Promise<CycleResult>;
};

export function readFile(path: string): string {
  try {
    return readFileSync(path, "utf-8");
  } catch {
    return "";
  }
}

/**
 * Formatters for tool call logging. Maps tool names to formatting functions.
 * Eliminates duplication and makes tool types extensible without modifying control flow.
 */
const toolFormatters: Record<string, (input: Record<string, unknown>, hasError: boolean) => string> = {
  bash: (input, hasError) => {
    const cmd = typeof input.command === "string" ? input.command : "";
    return `  [bash] ${cmd}${hasError ? " (error)" : ""}`;
  },
  write_file: (input, hasError) => {
    return `  [write_file] ${input.path}${hasError ? " (error)" : ""}`;
  },
  git: (input, hasError) => {
    return `  [git] ${input.args}${hasError ? " (error)" : ""}`;
  },
  update_instructions: () => `  [update_instructions]`,
};

export function logToolCall(name: string, input: Record<string, unknown>, result: ToolResult): void {
  const formatter = toolFormatters[name];
  if (formatter) {
    log(formatter(input, !!result.error));
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

/**
 * Regex patterns for parsing MEMORY.md sections. Named constants clarify intent
 * and support extraction of parsing logic into pure functions.
 */
const STATE_PATTERN = /^## State\n(.+)/m;
const LAST_ACTION_PATTERN = /^## Last Action\n([\s\S]*?)(?=\n## |\n*$)/m;
const MATCHED_INSTRUCTION_PATTERN = /^## Matched Instruction\n(.+)/m;

/**
 * Extract the state value from MEMORY.md content.
 * Pure function: takes memory content, returns normalized state string.
 */
function parseState(memoryContent: string): string {
  const match = memoryContent.match(STATE_PATTERN);
  return match ? match[1].trim() : "";
}

/**
 * Extract the matched instruction value from MEMORY.md content.
 * Pure function: takes memory content, returns normalized matched instruction string.
 */
function parseMatchedInstruction(memoryContent: string): string {
  const match = memoryContent.match(MATCHED_INSTRUCTION_PATTERN);
  const value = match ? match[1].trim().toLowerCase() : "";
  return value;
}

/**
 * Extract the halt message (from Last Action section) from MEMORY.md content.
 * Pure function: takes memory content, returns halt message string.
 */
function parseHaltMessage(memoryContent: string): string {
  const match = memoryContent.match(LAST_ACTION_PATTERN);
  return match ? match[1].trim() : "Program complete";
}

export function checkCycleCompleteness(
  memoryPath: string,
  instructionsPath: string,
  filesBefore: [string, string]
): CompletenessResult {
  const memoryAfter = readFile(memoryPath);
  const instructionsAfter = readFile(instructionsPath);
  const memoryChanged = memoryAfter !== filesBefore[0];
  const instructionsChanged = instructionsAfter !== filesBefore[1];

  const newState = parseState(memoryAfter);

  // All providers should detect "done" state consistently
  if (newState === "done") {
    return {
      complete: true,
      problem: "",
      halt: true,
      haltMessage: parseHaltMessage(memoryAfter),
      noMatch: false,
      state: newState,
    };
  }

  if (newState === "waiting_for_user") {
    return { complete: true, problem: "", halt: false, haltMessage: "", noMatch: false, state: newState };
  }

  // Check if the LLM declared no matching instruction
  const matchedValue = parseMatchedInstruction(memoryAfter);
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
