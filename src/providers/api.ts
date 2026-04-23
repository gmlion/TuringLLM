import Anthropic from "@anthropic-ai/sdk";
import { resolve } from "path";
import { getTools, executeTool } from "../tools.js";
import { getSystemPrompt, getUserPrompt } from "../prompt.js";
import { log, logRaw } from "../logger.js";
import { QuotaExceededError } from "../errors.js";
import { getWorkspacePath } from "../git.js";
import { readFile, logToolCall, checkCycleCompleteness, MAX_RETRIES, type CycleResult } from "./shared.js";

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const MODEL = process.env.ANTHROPIC_MODEL || "claude-haiku-4-5-20251001";

export async function runCycle(
  instructionsPath: string,
  memoryPath: string
): Promise<CycleResult> {
  const systemPrompt = getSystemPrompt("api");
  const userPrompt = getUserPrompt(memoryPath, instructionsPath);
  const tools = getTools();

  const filesBefore: [string, string] = [readFile(memoryPath), readFile(instructionsPath)];

  const messages: Anthropic.MessageParam[] = [
    { role: "user", content: userPrompt },
  ];

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    let response: Anthropic.Message;
    try {
      response = await client.messages.create({
        model: MODEL,
        max_tokens: 16384,
        system: systemPrompt,
        tools,
        messages,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (/rate.?limit|429|overloaded|529|quota|resource.?exhausted/i.test(msg)) {
        let retryAfter: number | null = null;
        const apiErr = err as { headers?: Record<string, string> };
        if (apiErr.headers?.["retry-after"]) {
          retryAfter = parseInt(apiErr.headers["retry-after"], 10) || null;
        }
        throw new QuotaExceededError(msg, retryAfter);
      }
      throw err;
    }

    for (const block of response.content) {
      if (block.type === "text" && block.text.trim()) {
        log(`  [thinking] ${block.text}`);
      }
    }

    const toolUses = response.content.filter(
      (b): b is Anthropic.ToolUseBlock => b.type === "tool_use"
    );

    if (toolUses.length === 0) {
      logRaw("  (no tool calls emitted)");
      if (attempt < MAX_RETRIES - 1) {
        log(`  [retry ${attempt + 1}] no tool calls`);
        continue;
      }
      return { halt: false };
    }

    const toolResults: Anthropic.ToolResultBlockParam[] = [];
    let hasError = false;

    for (const toolUse of toolUses) {
      const input = toolUse.input as Record<string, unknown>;

      logRaw(`  [tool_call] ${toolUse.name}`);
      logRaw(`  [tool_input] ${JSON.stringify(input)}`);

      const instanceDir = resolve(memoryPath, "..");
      const result = await executeTool(toolUse.name, input, instructionsPath, getWorkspacePath(instanceDir), instanceDir);

      logRaw(`  [tool_result] ${result.output}`);
      logRaw(`  [tool_error] ${result.error}`);

      logToolCall(toolUse.name, input, result);

      toolResults.push({
        type: "tool_result",
        tool_use_id: toolUse.id,
        content: result.output,
        is_error: result.error,
      });
      if (result.error) {
        hasError = true;
      }
    }

    if (hasError) {
      log(`  [retry ${attempt + 1}] tool error, feeding back`);
      messages.push({ role: "assistant", content: response.content });
      messages.push({ role: "user", content: toolResults });
      continue;
    }

    // Check cycle completeness
    const completeness = checkCycleCompleteness(memoryPath, instructionsPath, filesBefore);

    if (completeness.halt) {
      return { halt: true, haltMessage: completeness.haltMessage };
    }

    if (completeness.noMatch) {
      return { halt: false, noMatch: true };
    }

    if (completeness.complete) {
      return { halt: false };
    }

    log(`  [retry ${attempt + 1}] ${completeness.problem.includes("did not update") ? "no state change" : "orphan state"}`);
    messages.push({ role: "assistant", content: response.content });
    messages.push({
      role: "user",
      content: [
        ...toolResults,
        {
          type: "text" as const,
          text: `Tool calls executed (results above), but: ${completeness.problem} You MUST update both MEMORY.md (via bash) and INSTRUCTIONS.md (via update_instructions).`,
        },
      ],
    });
  }

  log(`  [warn] cycle incomplete after ${MAX_RETRIES} retries`);
  return { halt: false };
}
