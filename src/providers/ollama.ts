import { readFileSync } from "fs";
import { resolve } from "path";
import { getTools, executeTool } from "../tools.js";
import { getSystemPrompt, getUserPrompt } from "../prompt.js";
import { log, logRaw } from "../logger.js";
import { getWorkspacePath } from "../git.js";
import type Anthropic from "@anthropic-ai/sdk";

const BASE_URL = process.env.OLLAMA_BASE_URL || "http://localhost:11434";
const MODEL = process.env.OLLAMA_MODEL || "qwen3:14b";
const NUM_CTX = process.env.OLLAMA_NUM_CTX ? parseInt(process.env.OLLAMA_NUM_CTX, 10) : 16384;

export type CycleResult = {
  halt: boolean;
  haltMessage?: string;
};

function readFile(path: string): string {
  try {
    return readFileSync(path, "utf-8");
  } catch {
    return "";
  }
}

interface OllamaToolCall {
  function: {
    name: string;
    arguments: Record<string, unknown>;
  };
}

interface OllamaMessage {
  role: string;
  content: string;
  tool_calls?: OllamaToolCall[];
}

interface OllamaStreamChunk {
  message: {
    role: string;
    content?: string;
    tool_calls?: OllamaToolCall[];
  };
  done: boolean;
  eval_count?: number;
  prompt_eval_count?: number;
}

// Convert our Anthropic-shaped tool defs to Ollama format
function convertTools(anthropicTools: Anthropic.Tool[]) {
  return anthropicTools.map((t) => ({
    type: "function" as const,
    function: {
      name: t.name,
      description: t.description,
      parameters: t.input_schema,
    },
  }));
}

interface OllamaChatResult {
  message: OllamaMessage;
  evalCount?: number;
  promptEvalCount?: number;
}

async function ollamaChat(messages: OllamaMessage[], tools: unknown[]): Promise<OllamaChatResult> {
  const body = JSON.stringify({
    model: MODEL,
    messages,
    tools,
    stream: true,
    options: { num_ctx: NUM_CTX },
  });

  const res = await fetch(`${BASE_URL}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Ollama error ${res.status}: ${text}`);
  }

  // Stream the response — print thinking tokens as they arrive
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let content = "";
  let toolCalls: OllamaToolCall[] | undefined;
  let evalCount: number | undefined;
  let promptEvalCount: number | undefined;
  let streamingThinking = false;

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });

    // Ollama sends newline-delimited JSON
    let newlineIdx;
    while ((newlineIdx = buffer.indexOf("\n")) !== -1) {
      const line = buffer.slice(0, newlineIdx).trim();
      buffer = buffer.slice(newlineIdx + 1);
      if (!line) continue;

      let chunk: OllamaStreamChunk;
      try {
        chunk = JSON.parse(line);
      } catch {
        continue;
      }

      // Accumulate content and stream it to console
      if (chunk.message.content) {
        const text = chunk.message.content;
        content += text;
        if (!streamingThinking) {
          process.stdout.write("  [thinking] ");
          streamingThinking = true;
        }
        process.stdout.write(text);
      }

      // Tool calls come in the final chunk
      if (chunk.message.tool_calls) {
        toolCalls = chunk.message.tool_calls;
      }

      if (chunk.done) {
        evalCount = chunk.eval_count;
        promptEvalCount = chunk.prompt_eval_count;
      }
    }
  }

  if (streamingThinking) {
    process.stdout.write("\n");
  }

  return {
    message: {
      role: "assistant",
      content,
      tool_calls: toolCalls,
    },
    evalCount,
    promptEvalCount,
  };
}

export async function runCycle(
  instructionsPath: string,
  memoryPath: string
): Promise<CycleResult> {
  const stateful = process.env.TURING_STATEFUL === "1";
  const systemPrompt = getSystemPrompt("ollama");
  const userPrompt = getUserPrompt(memoryPath, instructionsPath, "ollama");

  // Stateful mode: no tools, LLM outputs MEMORY.md + SYSCALLS.md
  if (stateful) {
    const messages: OllamaMessage[] = [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ];

    const result = await ollamaChat(messages, []);
    let content = result.message.content.trim();

    // Strip markdown fences if the model wraps output
    content = content.replace(/^```(?:markdown)?\n?/g, "").replace(/\n?```$/g, "").trim();

    // Split on ===SYSCALLS=== separator
    const parts = content.split(/^===SYSCALLS===$/m);
    const memoryContent = (parts[0] || "").trim();
    const syscallsContent = (parts[1] || "").trim();

    const { writeFileSync } = await import("fs");
    const { resolve } = await import("path");

    if (memoryContent) {
      logRaw(`  [memory-write] ${memoryContent}`);
      writeFileSync(memoryPath, memoryContent + "\n", "utf-8");
    }

    const syscallsPath = resolve(memoryPath, "..", "SYSCALLS.md");
    // Write new syscalls (empty string if no actions requested)
    writeFileSync(syscallsPath, syscallsContent ? syscallsContent + "\n" : "", "utf-8");

    return { halt: false };
  }

  const tools = convertTools(getTools());

  const filesBefore = [readFile(memoryPath), readFile(instructionsPath)];

  const messages: OllamaMessage[] = [
    { role: "system", content: systemPrompt },
    { role: "user", content: userPrompt },
  ];

  for (let attempt = 0; ; attempt++) {
    let result: OllamaChatResult;
    try {
      result = await ollamaChat(messages, tools);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(`Ollama request failed: ${msg}`);
    }

    const assistantMsg = result.message;

    // Content already streamed to console; log to file
    if (assistantMsg.content) {
      logRaw(`  [thinking] ${assistantMsg.content}`);
    }

    if (result.promptEvalCount || result.evalCount) {
      logRaw(`  [usage] prompt=${result.promptEvalCount ?? "?"} completion=${result.evalCount ?? "?"}`);
    }

    const toolCalls = assistantMsg.tool_calls || [];
    logRaw(`  [raw_tool_calls] ${JSON.stringify(toolCalls)}`);

    if (toolCalls.length === 0) {
      logRaw("  (no tool calls emitted)");
      return { halt: false };
    }

    // Add assistant message to history
    messages.push(assistantMsg);

    let hasError = false;
    let halted = false;
    let haltMessage = "";

    for (const tc of toolCalls) {
      const name = tc.function.name;
      const input = tc.function.arguments;

      logRaw(`  [tool_call] ${name}`);
      logRaw(`  [tool_input] ${JSON.stringify(input)}`);

      const instanceDir = resolve(memoryPath, "..");
      const toolResult = await executeTool(name, input, instructionsPath, getWorkspacePath(instanceDir));

      logRaw(`  [tool_result] ${toolResult.output}`);
      logRaw(`  [tool_error] ${toolResult.error}`);

      if (name === "bash") {
        const cmd = typeof input.command === "string" ? input.command : "";
        log(`  [bash] ${cmd}${toolResult.error ? " (error)" : ""}`);
      } else if (name === "write_file") {
        log(`  [write_file] ${input.path}${toolResult.error ? " (error)" : ""}`);
      } else if (name === "git") {
        log(`  [git] ${input.args}${toolResult.error ? " (error)" : ""}`);
      } else if (name === "update_instructions") {
        log(`  [update_instructions]`);
      } else if (name === "halt") {
        log(`  [halt] ${input.message}`);
      }

      messages.push({
        role: "tool",
        content: toolResult.output,
      });

      if (toolResult.halt) {
        halted = true;
        haltMessage = toolResult.output;
      }
      if (toolResult.error) {
        hasError = true;
      }
    }

    if (halted) {
      return { halt: true, haltMessage };
    }

    if (hasError) {
      log(`  [retry ${attempt + 1}] tool error, feeding back`);
      continue;
    }

    // Check cycle completeness
    const memoryAfter = readFile(memoryPath);
    const instructionsAfter = readFile(instructionsPath);
    const memoryChanged = memoryAfter !== filesBefore[0];
    const instructionsChanged = instructionsAfter !== filesBefore[1];

    const stateMatch = memoryAfter.match(/^## State\n(.+)/m);
    const newState = stateMatch ? stateMatch[1].trim() : "";

    const hasMatchingInstruction = newState === "done" ||
      newState === "waiting_for_user" ||
      instructionsAfter.includes(`state is "${newState}"`);

    let problem = "";
    if (!memoryChanged && !instructionsChanged) {
      problem = "You did not update MEMORY.md or INSTRUCTIONS.md. The cycle is incomplete.";
    } else if (memoryChanged && !hasMatchingInstruction) {
      problem = `You updated MEMORY state to "${newState}" but INSTRUCTIONS.md has no instruction with a matching condition. The machine will stall.`;
    }

    if (problem) {
      log(`  [retry ${attempt + 1}] ${memoryChanged ? "orphan state" : "no state change"}`);
      messages.push({
        role: "user",
        content: `Tool calls executed (results above), but: ${problem} You MUST update both MEMORY.md (via bash) and INSTRUCTIONS.md (via update_instructions).`,
      });
      continue;
    }

    return { halt: false };
  }
}
