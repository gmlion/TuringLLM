import { execSync } from "child_process";
import { mkdirSync, writeFileSync } from "fs";
import { dirname } from "path";
import type Anthropic from "@anthropic-ai/sdk";

export type ToolResult = {
  output: string;
  halt: boolean;
  error: boolean;
};

// Plan phase: can only rewrite INSTRUCTIONS.md
export function getPlanTools(instructionsPath: string): Anthropic.Tool[] {
  return [
    {
      name: "update_instructions",
      description: `Rewrite INSTRUCTIONS.md with the new plan. You must call this every cycle.`,
      input_schema: {
        type: "object" as const,
        properties: {
          content: {
            type: "string",
            description: "The complete new contents of INSTRUCTIONS.md",
          },
        },
        required: ["content"],
      },
    },
  ];
}

// Execute phase: can run bash, write files, update instructions, or halt
export function getExecuteTools(): Anthropic.Tool[] {
  return [
    {
      name: "bash",
      description: "Run a shell command. Returns stdout and stderr. Do NOT use heredocs to create files — use the write_file tool instead.",
      input_schema: {
        type: "object" as const,
        properties: {
          command: {
            type: "string",
            description: "The shell command to execute",
          },
        },
        required: ["command"],
      },
    },
    {
      name: "write_file",
      description: "Write content to a file. Creates parent directories if needed. Use this instead of bash heredocs for creating files.",
      input_schema: {
        type: "object" as const,
        properties: {
          path: {
            type: "string",
            description: "Path to the file to write",
          },
          content: {
            type: "string",
            description: "The content to write to the file",
          },
        },
        required: ["path", "content"],
      },
    },
    {
      name: "update_instructions",
      description:
        "Rewrite INSTRUCTIONS.md. Use this to decompose an abstract instruction into finer-grained sub-instructions, or to add verification and next-step instructions after executing.",
      input_schema: {
        type: "object" as const,
        properties: {
          content: {
            type: "string",
            description: "The complete new contents of INSTRUCTIONS.md",
          },
        },
        required: ["content"],
      },
    },
    {
      name: "halt",
      description:
        "Stop the machine. Call this when the program has reached its goal or cannot make further progress.",
      input_schema: {
        type: "object" as const,
        properties: {
          message: {
            type: "string",
            description: "Reason for halting",
          },
        },
        required: ["message"],
      },
    },
  ];
}

export function executePlanTool(
  name: string,
  input: Record<string, unknown>,
  instructionsPath: string
): ToolResult {
  if (name === "update_instructions") {
    writeFileSync(instructionsPath, String(input.content ?? ""), "utf-8");
    console.log(`  [update_instructions]`);
    return { output: "OK", halt: false, error: false };
  }
  return { output: `Unknown tool: ${name}`, halt: false, error: true };
}

export function executeExecTool(
  name: string,
  input: Record<string, unknown>,
  instructionsPath: string
): ToolResult {
  switch (name) {
    case "update_instructions": {
      writeFileSync(instructionsPath, String(input.content ?? ""), "utf-8");
      console.log(`  [update_instructions] (decompose)`);
      return { output: "OK", halt: false, error: false };
    }
    case "write_file": {
      const path = String(input.path ?? "");
      const content = String(input.content ?? "");
      if (!path) {
        return { output: "Error: no path provided", halt: false, error: true };
      }
      try {
        mkdirSync(dirname(path), { recursive: true });
        writeFileSync(path, content, "utf-8");
        console.log(`  [write_file] ${path}`);
        return { output: "OK", halt: false, error: false };
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.log(`  [write_file] ${path} (failed)`);
        return { output: `Error writing file: ${msg}`, halt: false, error: true };
      }
    }
    case "bash": {
      const command = typeof input.command === "string" ? input.command : String(input.command ?? "");
      if (!command) {
        console.log(`  [bash] ERROR: empty command. Input keys: ${Object.keys(input).join(", ")}`);
        return { output: "Error: no command provided. The bash tool requires a 'command' string parameter.", halt: false, error: true };
      }
      const preview = command.length > 120 ? command.slice(0, 120) + "..." : command;
      try {
        const stdout = execSync(command, {
          encoding: "utf-8",
          timeout: 30_000,
          maxBuffer: 1024 * 1024,
        });
        console.log(`  [bash] ${preview}`);
        return { output: stdout || "(no output)", halt: false, error: false };
      } catch (err: unknown) {
        const e = err as { stdout?: string; stderr?: string; status?: number };
        const stderr = e.stderr ?? "";
        const output = `exit code ${e.status ?? 1}\nstdout: ${e.stdout ?? ""}\nstderr: ${stderr}`;
        console.log(`  [bash] ${preview} (failed)`);
        // Only retry on shell syntax errors (malformed heredocs, bad substitutions, etc.)
        // Normal command failures (exit code != 0) are valid results, not retryable errors
        const isSyntaxError = /syntax error|unexpected EOF|here-document|bad substitution/i.test(stderr);
        return { output, halt: false, error: isSyntaxError };
      }
    }
    case "halt": {
      const message = String(input.message ?? "halted");
      console.log(`  [halt] ${message}`);
      return { output: message, halt: true, error: false };
    }
    default:
      return { output: `Unknown tool: ${name}`, halt: false, error: true };
  }
}
