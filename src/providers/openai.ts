import OpenAI from "openai";
import { readFileSync } from "fs";
import { resolve } from "path";
import { getTools, executeTool } from "../tools.js";
import { getSystemPrompt, getUserPrompt } from "../prompt.js";
import { log, logRaw } from "../logger.js";
import { QuotaExceededError } from "../errors.js";
import { getWorkspacePath } from "../git.js";
import type Anthropic from "@anthropic-ai/sdk";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  baseURL: process.env.OPENAI_BASE_URL || undefined,
});

const MODEL = process.env.OPENAI_MODEL || "gpt-4o";

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

// Convert our Anthropic-shaped tool defs to OpenAI function calling format
function convertTools(anthropicTools: Anthropic.Tool[]): OpenAI.ChatCompletionTool[] {
  return anthropicTools.map((t) => ({
    type: "function" as const,
    function: {
      name: t.name,
      description: t.description,
      parameters: t.input_schema as Record<string, unknown>,
    },
  }));
}

export async function runCycle(
  instructionsPath: string,
  memoryPath: string
): Promise<CycleResult> {
  const systemPrompt = getSystemPrompt("openai");
  const userPrompt = getUserPrompt(memoryPath, instructionsPath);
  const tools = convertTools(getTools());

  const filesBefore = [readFile(memoryPath), readFile(instructionsPath)];

  const messages: OpenAI.ChatCompletionMessageParam[] = [
    { role: "system", content: systemPrompt },
    { role: "user", content: userPrompt },
  ];

  for (let attempt = 0; ; attempt++) {
    let response: OpenAI.ChatCompletion;
    try {
      response = await client.chat.completions.create({
        model: MODEL,
        max_tokens: 16384,
        tools,
        tool_choice: "required",
        messages,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (/rate.?limit|429|overloaded|quota|resource.?exhausted/i.test(msg)) {
        let retryAfter: number | null = null;
        const apiErr = err as { headers?: Record<string, string> };
        if (apiErr.headers?.["retry-after"]) {
          retryAfter = parseInt(apiErr.headers["retry-after"], 10) || null;
        }
        throw new QuotaExceededError(msg, retryAfter);
      }
      throw err;
    }

    const choice = response.choices[0];
    if (!choice) {
      logRaw("  (empty response)");
      return { halt: false };
    }

    const assistantMsg = choice.message;
    logRaw(`  [finish_reason] ${choice.finish_reason}`);
    logRaw(`  [message_keys] ${Object.keys(assistantMsg).join(", ")}`);

    // Log thinking/text — check for reasoning field (qwen3/ollama)
    const reasoning = (assistantMsg as unknown as Record<string, unknown>).reasoning;
    if (reasoning) {
      logRaw(`  [reasoning] ${String(reasoning).slice(0, 500)}`);
    }
    if (assistantMsg.content) {
      log(`  [thinking] ${assistantMsg.content}`);
    }

    // Log usage
    if (response.usage) {
      logRaw(`  [usage] prompt=${response.usage.prompt_tokens} completion=${response.usage.completion_tokens}`);
    }

    const rawToolCalls = assistantMsg.tool_calls || [];
    logRaw(`  [raw_tool_calls] ${JSON.stringify(rawToolCalls)}`);

    // Filter to function tool calls only (skip custom tool calls)
    const toolCalls = rawToolCalls.filter(
      (tc): tc is OpenAI.ChatCompletionMessageToolCall & { type: "function"; function: { name: string; arguments: string } } =>
        tc.type === "function" && "function" in tc
    );

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
      let input: Record<string, unknown>;
      try {
        input = JSON.parse(tc.function.arguments);
      } catch {
        logRaw(`  [warn] failed to parse tool arguments: ${tc.function.arguments.slice(0, 200)}`);
        messages.push({
          role: "tool",
          tool_call_id: tc.id,
          content: "Error: invalid JSON in tool arguments",
        });
        hasError = true;
        continue;
      }

      logRaw(`  [tool_call] ${tc.function.name}`);
      logRaw(`  [tool_input] ${JSON.stringify(input)}`);

      const instanceDir = resolve(memoryPath, "..");
      const result = await executeTool(tc.function.name, input, instructionsPath, getWorkspacePath(instanceDir));

      logRaw(`  [tool_result] ${result.output}`);
      logRaw(`  [tool_error] ${result.error}`);

      // Console log
      if (tc.function.name === "bash") {
        const cmd = typeof input.command === "string" ? input.command : "";
        log(`  [bash] ${cmd}${result.error ? " (error)" : ""}`);
      } else if (tc.function.name === "write_file") {
        log(`  [write_file] ${input.path}${result.error ? " (error)" : ""}`);
      } else if (tc.function.name === "git") {
        log(`  [git] ${input.args}${result.error ? " (error)" : ""}`);
      } else if (tc.function.name === "update_instructions") {
        log(`  [update_instructions]`);
      } else if (tc.function.name === "halt") {
        log(`  [halt] ${input.message}`);
      }

      messages.push({
        role: "tool",
        tool_call_id: tc.id,
        content: result.output,
      });

      if (result.halt) {
        halted = true;
        haltMessage = result.output;
      }
      if (result.error) {
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
