import Anthropic from "@anthropic-ai/sdk";
import { readFileSync } from "fs";
import { resolve } from "path";
import { getTools, executeTool } from "../tools.js";
import { getSystemPrompt, getUserPrompt } from "../prompt.js";
import { log, logRaw } from "../logger.js";
import { QuotaExceededError } from "../errors.js";
import { getWorkspacePath } from "../git.js";

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

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

export async function runCycle(
  instructionsPath: string,
  memoryPath: string
): Promise<CycleResult> {
  const systemPrompt = getSystemPrompt();
  const userPrompt = getUserPrompt(memoryPath, instructionsPath) + "\n\nExecute the next cycle.";
  const tools = getTools();

  const filesBefore = [readFile(memoryPath), readFile(instructionsPath)];

  const messages: Anthropic.MessageParam[] = [
    { role: "user", content: userPrompt },
  ];

  for (let attempt = 0; ; attempt++) {
    let response: Anthropic.Message;
    try {
      response = await client.messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 16384,
        system: systemPrompt,
        tools,
        messages,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (/rate.?limit|429|overloaded|529|quota|resource.?exhausted/i.test(msg)) {
        throw new QuotaExceededError(msg);
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
      return { halt: false };
    }

    const toolResults: Anthropic.ToolResultBlockParam[] = [];
    let hasError = false;
    let halted = false;
    let haltMessage = "";

    for (const toolUse of toolUses) {
      const input = toolUse.input as Record<string, unknown>;

      // Log full tool call to file
      logRaw(`  [tool_call] ${toolUse.name}`);
      logRaw(`  [tool_input] ${JSON.stringify(input)}`);

      const instanceDir = resolve(memoryPath, "..");
      const result = executeTool(toolUse.name, input, instructionsPath, getWorkspacePath(instanceDir));

      // Log full result to file
      logRaw(`  [tool_result] ${result.output}`);
      logRaw(`  [tool_error] ${result.error}`);

      // Console gets a summary
      if (toolUse.name === "bash") {
        const cmd = typeof input.command === "string" ? input.command : "";
        const preview = cmd.length > 120 ? cmd.slice(0, 120) + "..." : cmd;
        log(`  [bash] ${preview}${result.error ? " (error)" : ""}`);
      } else if (toolUse.name === "write_file") {
        log(`  [write_file] ${input.path}${result.error ? " (error)" : ""}`);
      } else if (toolUse.name === "git") {
        log(`  [git] ${input.args}${result.error ? " (error)" : ""}`);
      } else if (toolUse.name === "update_instructions") {
        log(`  [update_instructions]`);
      } else if (toolUse.name === "halt") {
        log(`  [halt] ${input.message}`);
      }

      toolResults.push({
        type: "tool_result",
        tool_use_id: toolUse.id,
        content: result.output,
        is_error: result.error,
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
      messages.push({ role: "assistant", content: response.content });
      messages.push({ role: "user", content: toolResults });
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
      messages.push({ role: "assistant", content: response.content });
      messages.push({
        role: "user",
        content: [
          ...toolResults,
          {
            type: "text" as const,
            text: `Tool calls executed (results above), but: ${problem} You MUST update both MEMORY.md (via bash) and INSTRUCTIONS.md (via update_instructions).`,
          },
        ],
      });
      continue;
    }

    return { halt: false };
  }
}
