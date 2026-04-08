import { readFileSync } from "fs";
import { resolve } from "path";
import { getTools, executeTool } from "../tools.js";
import { getSystemPrompt, getUserPrompt } from "../prompt.js";
import { log, logRaw } from "../logger.js";
import { getWorkspacePath } from "../git.js";
import {
  getLlama,
  LlamaChatSession,
  LlamaModel,
  resolveModelFile,
  defineChatSessionFunction,
} from "node-llama-cpp";
import type { Llama } from "node-llama-cpp";
import type Anthropic from "@anthropic-ai/sdk";

const MODEL_PATH = process.env.LOCAL_MODEL_PATH || "";
const MODEL_URI = process.env.LOCAL_MODEL_URI || "";
const GPU_LAYERS = process.env.LOCAL_GPU_LAYERS ? parseInt(process.env.LOCAL_GPU_LAYERS, 10) : undefined;
const CONTEXT_SIZE = process.env.LOCAL_CONTEXT_SIZE ? parseInt(process.env.LOCAL_CONTEXT_SIZE, 10) : 16384;

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

// Singleton model — loaded once, reused across cycles
let llamaInstance: Llama | null = null;
let modelInstance: LlamaModel | null = null;

async function getModel(): Promise<LlamaModel> {
  if (modelInstance) return modelInstance;

  log("  [local] Loading model...");
  llamaInstance = await getLlama();

  let modelPath: string;
  if (MODEL_PATH) {
    modelPath = MODEL_PATH;
  } else if (MODEL_URI) {
    modelPath = await resolveModelFile(MODEL_URI);
  } else {
    throw new Error(
      "Set LOCAL_MODEL_PATH to a GGUF file path, or LOCAL_MODEL_URI to a HuggingFace URI"
    );
  }

  log(`  [local] Model: ${modelPath}`);
  if (GPU_LAYERS !== undefined) {
    log(`  [local] GPU layers: ${GPU_LAYERS}`);
  }
  modelInstance = await llamaInstance.loadModel({ modelPath, gpuLayers: GPU_LAYERS });
  log("  [local] Model loaded");

  return modelInstance;
}

// Convert our Anthropic tool defs to node-llama-cpp function defs
function buildFunctions(
  anthropicTools: Anthropic.Tool[],
  instructionsPath: string,
  workspacePath: string | undefined
) {
  const results: { name: string; output: string; error: boolean; halt: boolean }[] = [];

  const functions: Record<string, ReturnType<typeof defineChatSessionFunction>> = {};

  for (const tool of anthropicTools) {
    const toolName = tool.name;
    const schema = tool.input_schema as {
      type: string;
      properties: Record<string, unknown>;
      required?: string[];
    };

    functions[toolName] = defineChatSessionFunction({
      description: tool.description,
      params: schema,
      async handler(params: Record<string, unknown>) {
        logRaw(`  [tool_call] ${toolName}`);
        logRaw(`  [tool_input] ${JSON.stringify(params)}`);

        const result = await executeTool(toolName, params, instructionsPath, workspacePath);

        logRaw(`  [tool_result] ${result.output}`);
        logRaw(`  [tool_error] ${result.error}`);

        if (toolName === "bash") {
          const cmd = typeof params.command === "string" ? params.command : "";
          log(`  [bash] ${cmd}${result.error ? " (error)" : ""}`);
        } else if (toolName === "write_file") {
          log(`  [write_file] ${params.path}${result.error ? " (error)" : ""}`);
        } else if (toolName === "git") {
          log(`  [git] ${params.args}${result.error ? " (error)" : ""}`);
        } else if (toolName === "update_instructions") {
          log(`  [update_instructions]`);
        } else if (toolName === "halt") {
          log(`  [halt] ${params.message}`);
        }

        results.push({
          name: toolName,
          output: result.output,
          error: result.error,
          halt: result.halt,
        });

        return result.output;
      },
    } as Parameters<typeof defineChatSessionFunction>[0]);
  }

  return { functions, results };
}

export async function runCycle(
  instructionsPath: string,
  memoryPath: string
): Promise<CycleResult> {
  const systemPrompt = getSystemPrompt("ollama");
  const userPrompt = getUserPrompt(memoryPath, instructionsPath, "ollama");
  const tools = getTools();

  const filesBefore = [readFile(memoryPath), readFile(instructionsPath)];

  const model = await getModel();
  const instanceDir = resolve(memoryPath, "..");
  const workspacePath = getWorkspacePath(instanceDir);

  const { functions, results } = buildFunctions(tools, instructionsPath, workspacePath);

  const maxRetries = 20;
  for (let attempt = 0; ; attempt++) {
    results.length = 0;

    // Fresh context and session per attempt — avoids corrupted KV cache on errors
    const context = await model.createContext({ contextSize: CONTEXT_SIZE });
    const session = new LlamaChatSession({ contextSequence: context.getSequence() });
    session.setChatHistory([
      { type: "system", text: systemPrompt },
    ]);

    let responseText = "";
    try {
      responseText = await session.prompt(userPrompt, {
        functions,
        onTextChunk(text: string) {
          process.stdout.write(text);
        },
      });
      process.stdout.write("\n");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      log(`  [local-error] ${msg}`);
      await context.dispose();
      if (attempt < maxRetries) {
        log(`  [retry ${attempt + 1}] inference error`);
        continue;
      }
      throw err;
    }

    await context.dispose();

    if (responseText) {
      logRaw(`  [response] ${responseText}`);
    }

    if (results.length === 0) {
      logRaw("  (no tool calls)");
      if (attempt < maxRetries) {
        log(`  [retry ${attempt + 1}] no tool calls`);
        continue;
      }
      return { halt: false };
    }

    const haltResult = results.find((r) => r.halt);
    if (haltResult) {
      return { halt: true, haltMessage: haltResult.output };
    }

    // Check cycle completeness
    const memoryAfter = readFile(memoryPath);
    const instructionsAfter = readFile(instructionsPath);
    const memoryChanged = memoryAfter !== filesBefore[0];
    const instructionsChanged = instructionsAfter !== filesBefore[1];

    const stateMatch = memoryAfter.match(/^## State\n(.+)/m);
    const newState = stateMatch ? stateMatch[1].trim() : "";

    if (newState === "done") {
      const lastAction = memoryAfter.match(/^## Last Action\n([\s\S]*?)(?=\n## |\n*$)/m);
      return { halt: true, haltMessage: lastAction ? lastAction[1].trim() : "Program complete" };
    }

    if (newState === "waiting_for_user") {
      return { halt: false };
    }

    const hasMatchingInstruction = instructionsAfter.includes(`state is "${newState}"`);

    if (memoryChanged || instructionsChanged) {
      if (hasMatchingInstruction) {
        return { halt: false };
      }
    }

    if (attempt >= maxRetries) {
      log(`  [warn] cycle incomplete after ${maxRetries} retries`);
      return { halt: false };
    }

    log(`  [retry ${attempt + 1}] ${memoryChanged ? "orphan state" : "no state change"}`);
  }
}
