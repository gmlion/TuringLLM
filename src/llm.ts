import Anthropic from "@anthropic-ai/sdk";
import { readFileSync } from "fs";
import { getTools, executeTool } from "./tools.js";

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

export async function runCycle(
  systemPrompt: string,
  userPrompt: string,
  instructionsPath: string,
  memoryPath: string
): Promise<CycleResult> {
  const tools = getTools();
  const watchFiles = [memoryPath, instructionsPath];
  const filesBefore = watchFiles.map((f) => readFile(f));

  const messages: Anthropic.MessageParam[] = [
    { role: "user", content: userPrompt },
  ];

  for (let attempt = 0; ; attempt++) {
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

    const toolResults: Anthropic.ToolResultBlockParam[] = [];
    let hasError = false;
    let halted = false;
    let haltMessage = "";

    for (const toolUse of toolUses) {
      const result = executeTool(
        toolUse.name,
        toolUse.input as Record<string, unknown>,
        instructionsPath
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

    // Retry on tool errors (syntax errors, empty commands)
    if (hasError) {
      console.log(`  [retry ${attempt + 1}] tool error, feeding back`);
      messages.push({ role: "assistant", content: response.content });
      messages.push({ role: "user", content: toolResults });
      continue;
    }

    // Check cycle completeness
    const memoryAfter = readFile(memoryPath);
    const instructionsAfter = readFile(instructionsPath);
    const memoryChanged = memoryAfter !== filesBefore[0];
    const instructionsChanged = instructionsAfter !== filesBefore[1];

    // Extract the new state from MEMORY
    const stateMatch = memoryAfter.match(/^## State\n(.+)/m);
    const newState = stateMatch ? stateMatch[1].trim() : "";

    // Check if INSTRUCTIONS has a condition matching the new state
    const hasMatchingInstruction = newState === "done" ||
      instructionsAfter.includes(`state is "${newState}"`) ||
      instructionsAfter.includes(`state is "${newState}"`);

    let problem = "";
    if (!memoryChanged && !instructionsChanged) {
      problem = "You did not update MEMORY.md or INSTRUCTIONS.md. The cycle is incomplete.";
    } else if (memoryChanged && !hasMatchingInstruction) {
      problem = `You updated MEMORY state to "${newState}" but INSTRUCTIONS.md has no instruction with a matching condition. The machine will stall. You must call update_instructions to add instructions that match the new state.`;
    }

    if (problem) {
      console.log(`  [retry ${attempt + 1}] ${memoryChanged ? "orphan state" : "no state change"}`);
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

  return { halt: false };
}
