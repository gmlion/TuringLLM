import Anthropic from "@anthropic-ai/sdk";
import { readFileSync } from "fs";
import {
  getPlanTools,
  getExecuteTools,
  executePlanTool,
  executeExecTool,
} from "./tools.js";
import type { ToolResult } from "./tools.js";

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

export type CycleResult = {
  halt: boolean;
  haltMessage?: string;
};

const MAX_RETRIES = 5;

function readFile(path: string): string {
  try {
    return readFileSync(path, "utf-8");
  } catch {
    return "";
  }
}

async function invoke(
  systemPrompt: string,
  userPrompt: string,
  tools: Anthropic.Tool[],
  handleToolUse: (name: string, input: Record<string, unknown>) => ToolResult,
  watchFiles?: string[]
): Promise<CycleResult> {
  const messages: Anthropic.MessageParam[] = [
    { role: "user", content: userPrompt },
  ];

  const filesBefore = watchFiles?.map((f) => readFile(f));

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 16384,
      system: systemPrompt,
      tools,
      messages,
    });

    for (const block of response.content) {
      if (block.type === "text" && block.text.trim()) {
        console.log(`  [thinking] ${block.text}`);
      }
    }

    const toolUses = response.content.filter(
      (b): b is Anthropic.ToolUseBlock => b.type === "tool_use"
    );

    if (toolUses.length === 0) {
      return { halt: false };
    }

    // Execute all tool calls
    const toolResults: Anthropic.ToolResultBlockParam[] = [];
    let hasError = false;
    let halted = false;
    let haltMessage = "";

    for (const toolUse of toolUses) {
      const result = handleToolUse(
        toolUse.name,
        toolUse.input as Record<string, unknown>
      );
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

    // Check if any tool errored — retry with error feedback
    if (hasError) {
      if (attempt < MAX_RETRIES) {
        console.log(`  [retry ${attempt + 1}/${MAX_RETRIES}] tool call error, feeding back`);
        messages.push({ role: "assistant", content: response.content });
        messages.push({ role: "user", content: toolResults });
        continue;
      }
      console.log(`  [error] tool calls failed after ${MAX_RETRIES} retries`);
      return { halt: false };
    }

    // Check if watched files changed — if not, the cycle is incomplete
    if (watchFiles && filesBefore) {
      const filesAfter = watchFiles.map((f) => readFile(f));
      const anyChanged = filesBefore.some((before, i) => before !== filesAfter[i]);

      if (!anyChanged) {
        if (attempt < MAX_RETRIES) {
          console.log(`  [retry ${attempt + 1}/${MAX_RETRIES}] no state change, feeding results back`);
          messages.push({ role: "assistant", content: response.content });
          messages.push({
            role: "user",
            content: [
              ...toolResults,
              {
                type: "text" as const,
                text: "Your tool calls executed successfully (results above), but you did not update MEMORY.md or INSTRUCTIONS.md. The cycle is incomplete — the machine will stall if you don't advance the state. Please call bash to write MEMORY.md with the new state and results, and call update_instructions with verification and next steps.",
              },
            ],
          });
          continue;
        }
        console.log(`  [warn] executor made no state change after ${MAX_RETRIES} retries`);
      }
    }

    return { halt: false };
  }

  return { halt: false };
}

export async function runPlanPhase(
  systemPrompt: string,
  userPrompt: string,
  instructionsPath: string
): Promise<void> {
  await invoke(
    systemPrompt,
    userPrompt + "\n\nPLAN PHASE: Rewrite INSTRUCTIONS.md with your updated plan.",
    getPlanTools(instructionsPath),
    (name, input) => executePlanTool(name, input, instructionsPath)
  );
}

export async function runExecutePhase(
  systemPrompt: string,
  userPrompt: string,
  instructionsPath: string,
  memoryPath: string
): Promise<CycleResult> {
  return invoke(
    systemPrompt,
    userPrompt + "\n\nEXECUTE PHASE: Find the first matching instruction and handle it.",
    getExecuteTools(),
    (name, input) => executeExecTool(name, input, instructionsPath),
    [memoryPath, instructionsPath]
  );
}
