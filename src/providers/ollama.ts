import { writeFileSync } from "fs";
import { resolve } from "path";
import { getTools, executeTool } from "../tools.js";
import { getSystemPrompt, getUserPrompt } from "../prompt.js";
import { log, logRaw } from "../logger.js";
import { getWorkspacePath } from "../git.js";
import { readFile, logToolCall, checkCycleCompleteness, MAX_RETRIES, type CycleResult, type ProviderEvent } from "./shared.js";
import type Anthropic from "@anthropic-ai/sdk";

const BASE_URL = process.env.OLLAMA_BASE_URL || "http://localhost:11434";
const MODEL = process.env.OLLAMA_MODEL || "qwen3:14b";
const NUM_CTX = process.env.OLLAMA_NUM_CTX ? parseInt(process.env.OLLAMA_NUM_CTX, 10) : 16384;

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
  const events: ProviderEvent[] = [];

  // Stateful mode: no tools, LLM outputs MEMORY.md + SYSCALLS.md
  if (stateful) {
    const messages: OllamaMessage[] = [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ];

    const t0Llm = Date.now();
    events.push({ type: "llm_request", provider: "ollama", model: MODEL, prompt: `${systemPrompt}\n\n${userPrompt}` });
    const result = await ollamaChat(messages, []);
    let content = result.message.content.trim();

    // Strip markdown fences if the model wraps output
    content = content.replace(/^```(?:markdown)?\n?/g, "").replace(/\n?```$/g, "").trim();

    // Split on ===SYSCALLS=== separator
    const parts = content.split(/^===SYSCALLS===$/m);
    const memoryContent = (parts[0] || "").trim();
    const syscallsContent = (parts[1] || "").trim();

    events.push({ type: "llm_response", output: result.message.content, durationMs: Date.now() - t0Llm });

    if (memoryContent) {
      logRaw(`  [memory-write] ${memoryContent}`);
      writeFileSync(memoryPath, memoryContent + "\n", "utf-8");
    }

    const syscallsPath = resolve(memoryPath, "..", "..", "..", "SYSCALLS.md");
    // Write new syscalls (empty string if no actions requested)
    writeFileSync(syscallsPath, syscallsContent ? syscallsContent + "\n" : "", "utf-8");

    return { halt: false, events };
  }

  const tools = convertTools(getTools());

  const filesBefore: [string, string] = [readFile(memoryPath), readFile(instructionsPath)];

  const messages: OllamaMessage[] = [
    { role: "system", content: systemPrompt },
    { role: "user", content: userPrompt },
  ];

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    let result: OllamaChatResult;
    const t0Llm = Date.now();
    events.push({ type: "llm_request", provider: "ollama", model: MODEL, prompt: `${systemPrompt}\n\n${userPrompt}` });
    try {
      result = await ollamaChat(messages, tools);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (/rate.?limit|429|overloaded|quota|resource.?exhausted/i.test(msg)) {
        throw new Error(`Quota exceeded: ${msg}`);
      }
      throw new Error(`Ollama request failed: ${msg}`);
    }

    const assistantMsg = result.message;

    // Content already streamed to console; log to file
    if (assistantMsg.content) {
      logRaw(`  [thinking] ${assistantMsg.content}`);
    }

    events.push({ type: "llm_response", output: assistantMsg.content || "", durationMs: Date.now() - t0Llm });

    if (result.promptEvalCount || result.evalCount) {
      logRaw(`  [usage] prompt=${result.promptEvalCount ?? "?"} completion=${result.evalCount ?? "?"}`);
    }

    const toolCalls = assistantMsg.tool_calls || [];
    logRaw(`  [raw_tool_calls] ${JSON.stringify(toolCalls)}`);

    if (toolCalls.length === 0) {
      logRaw("  (no tool calls emitted)");
      if (attempt < MAX_RETRIES - 1) {
        events.push({ type: "retry", attempt: attempt + 1, reason: "no tool calls" });
        log(`  [retry ${attempt + 1}] no tool calls`);
        continue;
      }
      return { halt: false, events };
    }

    // Add assistant message to history
    messages.push(assistantMsg);

    let hasError = false;

    for (const tc of toolCalls) {
      const name = tc.function.name;
      const input = tc.function.arguments;

      logRaw(`  [tool_call] ${name}`);
      logRaw(`  [tool_input] ${JSON.stringify(input)}`);

      events.push({ type: "tool_call", tool: name, input: JSON.stringify(input) });

      const frameDir = resolve(memoryPath, "..");
      const instanceRoot = resolve(frameDir, "..", "..");
      const toolResult = await executeTool(name, input, instructionsPath, getWorkspacePath(instanceRoot), frameDir);

      logRaw(`  [tool_result] ${toolResult.output}`);
      logRaw(`  [tool_error] ${toolResult.error}`);

      events.push({ type: "tool_result", tool: name, output: toolResult.output, isError: toolResult.error });

      logToolCall(name, input, toolResult);

      messages.push({
        role: "tool",
        content: toolResult.output,
      });

      if (toolResult.error) {
        hasError = true;
      }
    }

    if (hasError) {
      events.push({ type: "retry", attempt: attempt + 1, reason: "tool error, feeding back" });
      log(`  [retry ${attempt + 1}] tool error, feeding back`);
      continue;
    }

    // Check cycle completeness
    const completeness = checkCycleCompleteness(memoryPath, instructionsPath, filesBefore);

    if (completeness.halt) {
      return { halt: true, haltMessage: completeness.haltMessage, events };
    }

    if (completeness.noMatch) {
      return { halt: false, noMatch: true, events };
    }

    if (completeness.complete) {
      return { halt: false, events };
    }

    const retryReason = completeness.problem.includes("did not update") ? "no state change" : "orphan state";
    events.push({ type: "retry", attempt: attempt + 1, reason: retryReason });
    log(`  [retry ${attempt + 1}] ${retryReason}`);
    messages.push({
      role: "user",
      content: `Tool calls executed (results above), but: ${completeness.problem} You MUST update both MEMORY.md (via bash) and INSTRUCTIONS.md (via update_instructions).`,
    });
  }

  log(`  [warn] cycle incomplete after ${MAX_RETRIES} retries`);
  return { halt: false, events };
}
