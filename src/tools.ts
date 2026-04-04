import { execSync } from "child_process";
import { mkdirSync, writeFileSync } from "fs";
import { dirname } from "path";
import type Anthropic from "@anthropic-ai/sdk";

export type ToolResult = {
  output: string;
  halt: boolean;
  error: boolean;
};

export function getTools(): Anthropic.Tool[] {
  return [
    {
      name: "bash",
      description:
        "Run a shell command. Returns stdout and stderr. Do NOT use heredocs to create files — use write_file instead.",
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
      description:
        "Write content to a file. Creates parent directories if needed. Use this for authoring files (HTML, CSS, scripts). Do not use bash heredocs.",
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
        "Rewrite INSTRUCTIONS.md with the complete new contents.",
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
        "Stop the machine. Call when the program has reached its goal or cannot make further progress.",
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

export function executeTool(
  name: string,
  input: Record<string, unknown>,
  instructionsPath: string
): ToolResult {
  switch (name) {
    case "bash": {
      const command = typeof input.command === "string" ? input.command : String(input.command ?? "");
      if (!command) {
        return { output: "Error: no command provided.", halt: false, error: true };
      }
      try {
        const stdout = execSync(command, {
          encoding: "utf-8",
          timeout: 30_000,
          maxBuffer: 1024 * 1024,
        });
        return { output: stdout || "(no output)", halt: false, error: false };
      } catch (err: unknown) {
        const e = err as { stdout?: string; stderr?: string; status?: number };
        const stderr = e.stderr ?? "";
        const output = `exit code ${e.status ?? 1}\nstdout: ${e.stdout ?? ""}\nstderr: ${stderr}`;
        const isSyntaxError = /syntax error|unexpected EOF|here-document|bad substitution/i.test(stderr);
        return { output, halt: false, error: isSyntaxError };
      }
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
        return { output: "OK", halt: false, error: false };
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        return { output: `Error: ${msg}`, halt: false, error: true };
      }
    }
    case "update_instructions": {
      writeFileSync(instructionsPath, String(input.content ?? ""), "utf-8");
      return { output: "OK", halt: false, error: false };
    }
    case "halt": {
      const message = String(input.message ?? "halted");
      return { output: message, halt: true, error: false };
    }
    default:
      return { output: `Unknown tool: ${name}`, halt: false, error: true };
  }
}
