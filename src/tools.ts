import { execSync } from "child_process";
import { mkdirSync, writeFileSync } from "fs";
import { createInterface } from "readline";
import { dirname } from "path";
import type Anthropic from "@anthropic-ai/sdk";

export type ToolResult = {
  output: string;
  halt: boolean;
  error: boolean;
};

export const ALLOWED_GIT_COMMANDS = new Set([
  "add", "blame", "branch", "cat-file", "checkout", "cherry-pick",
  "commit", "describe", "diff", "init", "log", "ls-files", "ls-tree",
  "merge", "mv", "rev-parse", "rm", "shortlog", "show", "stash",
  "status", "switch", "tag",
]);

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
      name: "git",
      description:
        "Run a git command in the workspace repo. Allowed subcommands: add, blame, branch, cat-file, checkout, cherry-pick, commit, describe, diff, init, log, ls-files, ls-tree, merge, mv, rev-parse, rm, shortlog, show, stash, status, switch, tag. Other subcommands (push, rebase, reset, clean, etc.) are blocked.",
      input_schema: {
        type: "object" as const,
        properties: {
          args: {
            type: "string",
            description: "Arguments to pass to git (e.g., 'branch feature-x', 'diff HEAD~2', 'log --oneline -5', 'checkout -b experiment')",
          },
        },
        required: ["args"],
      },
    },
    {
      name: "ask_user",
      description:
        "Ask the user a question and wait for their answer. Use when you need clarification about the spec, when you cannot verify something (e.g., visual output in a headless environment), or when the user's input is required to proceed.",
      input_schema: {
        type: "object" as const,
        properties: {
          question: {
            type: "string",
            description: "The question to ask the user",
          },
        },
        required: ["question"],
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

async function askUserQuestion(question: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    console.log("");
    console.log("┌─ USER INPUT NEEDED ─────────────────────────────────");
    for (const line of question.split("\n")) {
      console.log(`│ ${line}`);
    }
    console.log("└────────────────────────────────────────────────────");
    process.stdout.write("  > ");
    rl.question("", (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}

export async function executeTool(
  name: string,
  input: Record<string, unknown>,
  instructionsPath: string,
  workspacePath?: string
): Promise<ToolResult> {
  switch (name) {
    case "bash": {
      const command = typeof input.command === "string" ? input.command : String(input.command ?? "");
      if (!command) {
        return { output: "Error: no command provided.", halt: false, error: true };
      }
      try {
        const timeout = process.env.BASH_TIMEOUT
          ? parseInt(process.env.BASH_TIMEOUT, 10) * 1000
          : 5 * 60 * 1000; // 5 minutes default
        const stdout = execSync(command, {
          encoding: "utf-8",
          timeout,
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
    case "git": {
      const args = typeof input.args === "string" ? input.args : String(input.args ?? "");
      if (!args) {
        return { output: "Error: no git args provided.", halt: false, error: true };
      }
      if (!workspacePath) {
        return { output: "Error: workspace path not configured.", halt: false, error: true };
      }
      // Whitelist: only allow known-safe git subcommands
      const subcommand = args.trim().split(/\s+/)[0].toLowerCase();
      if (!ALLOWED_GIT_COMMANDS.has(subcommand)) {
        return {
          output: `Error: "git ${subcommand}" is not allowed. Allowed: ${[...ALLOWED_GIT_COMMANDS].join(", ")}.`,
          halt: false,
          error: true,
        };
      }
      try {
        const stdout = execSync(`git ${args}`, {
          encoding: "utf-8",
          timeout: 0,
          maxBuffer: 1024 * 1024,
          cwd: workspacePath,
        });
        return { output: stdout || "(no output)", halt: false, error: false };
      } catch (err: unknown) {
        const e = err as { stdout?: string; stderr?: string; status?: number };
        const output = `exit code ${e.status ?? 1}\nstdout: ${e.stdout ?? ""}\nstderr: ${e.stderr ?? ""}`;
        return { output, halt: false, error: true };
      }
    }
    case "update_instructions": {
      writeFileSync(instructionsPath, String(input.content ?? ""), "utf-8");
      return { output: "OK", halt: false, error: false };
    }
    case "ask_user": {
      const question = String(input.question ?? "");
      if (!question) {
        return { output: "Error: no question provided", halt: false, error: true };
      }
      const answer = await askUserQuestion(question);
      return { output: answer, halt: false, error: false };
    }
    case "halt": {
      const message = String(input.message ?? "halted");
      return { output: message, halt: true, error: false };
    }
    default:
      return { output: `Unknown tool: ${name}`, halt: false, error: true };
  }
}
