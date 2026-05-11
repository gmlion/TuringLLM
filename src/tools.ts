import { execSync } from "child_process";
import { mkdirSync, writeFileSync } from "fs";
import { dirname } from "path";
import type Anthropic from "@anthropic-ai/sdk";

export type ToolResult = {
  output: string;
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
      name: "web_search",
      description:
        "Search the web for <query>. Returns a JSON-encoded list of up to 10 results {title, url, snippet}. Non-deterministic across runs. On failure (backend timeout, empty result set, unknown backend) the JSON contains an empty results array plus a 'note' describing the condition.",
      input_schema: {
        type: "object" as const,
        properties: {
          query: {
            type: "string",
            description: "Search query string",
          },
        },
        required: ["query"],
      },
    },
    {
      name: "web_fetch",
      description:
        "Fetch <url> and return its visible text (HTML stripped to plain text). Non-HTML content types (e.g. PDF, images) return a diagnostic rather than binary content.",
      input_schema: {
        type: "object" as const,
        properties: {
          url: {
            type: "string",
            description: "Absolute HTTP(S) URL to fetch",
          },
        },
        required: ["url"],
      },
    },
  ];
}

// Helper: Consolidate repeated coercion pattern for extracting string inputs
function extractString(value: unknown, fallback: string = ""): string {
  return typeof value === "string" ? value : String(value ?? fallback);
}

// Handler: Execute bash command with timeout and syntax-error detection
function executeBash(command: string, cwd?: string): ToolResult {
  if (!command) {
    return { output: "Error: no command provided.", error: true };
  }
  try {
    const timeout = process.env.BASH_TIMEOUT
      ? parseInt(process.env.BASH_TIMEOUT, 10) * 1000
      : 5 * 60 * 1000; // 5 minutes default
    const stdout = execSync(command, {
      encoding: "utf-8",
      timeout,
      maxBuffer: 1024 * 1024,
      ...(cwd ? { cwd } : {}),
    });
    return { output: stdout || "(no output)", error: false };
  } catch (err: unknown) {
    const e = err as { stdout?: string; stderr?: string; status?: number };
    const stderr = e.stderr ?? "";
    const output = `exit code ${e.status ?? 1}\nstdout: ${e.stdout ?? ""}\nstderr: ${stderr}`;
    const isSyntaxError = /syntax error|unexpected EOF|here-document|bad substitution/i.test(stderr);
    return { output, error: isSyntaxError };
  }
}

// Handler: Write file with recursive directory creation
function executeWriteFile(path: string, content: string): ToolResult {
  if (!path) {
    return { output: "Error: no path provided", error: true };
  }
  try {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, content, "utf-8");
    return { output: "OK", error: false };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { output: `Error: ${msg}`, error: true };
  }
}

// Handler: Execute git command with whitelist validation
function executeGit(args: string, workspacePath?: string): ToolResult {
  if (!args) {
    return { output: "Error: no git args provided.", error: true };
  }
  if (!workspacePath) {
    return { output: "Error: workspace path not configured.", error: true };
  }
  // Whitelist: only allow known-safe git subcommands
  const subcommand = args.trim().split(/\s+/)[0].toLowerCase();
  if (!ALLOWED_GIT_COMMANDS.has(subcommand)) {
    return {
      output: `Error: "git ${subcommand}" is not allowed. Allowed: ${[...ALLOWED_GIT_COMMANDS].join(", ")}.`,
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
    return { output: stdout || "(no output)", error: false };
  } catch (err: unknown) {
    const e = err as { stdout?: string; stderr?: string; status?: number };
    const output = `exit code ${e.status ?? 1}\nstdout: ${e.stdout ?? ""}\nstderr: ${e.stderr ?? ""}`;
    return { output, error: true };
  }
}

// Handler: Execute web search (async)
async function executeWebSearch(query: string): Promise<ToolResult> {
  const { webSearch } = await import("./web-tools.js");
  const out = await webSearch(extractString(query));
  return { output: JSON.stringify(out), error: false };
}

// Handler: Execute web fetch (async)
async function executeWebFetch(url: string): Promise<ToolResult> {
  const { webFetch } = await import("./web-tools.js");
  const out = await webFetch(extractString(url));
  return { output: JSON.stringify(out), error: false };
}

// Dispatcher: Route tool calls to appropriate handlers
export async function executeTool(
  name: string,
  input: Record<string, unknown>,
  instructionsPath: string,
  workspacePath?: string,
  cwd?: string
): Promise<ToolResult> {
  switch (name) {
    case "bash": {
      const command = extractString(input.command);
      return executeBash(command, cwd);
    }
    case "write_file": {
      const path = extractString(input.path);
      const content = extractString(input.content);
      return executeWriteFile(path, content);
    }
    case "git": {
      const args = extractString(input.args);
      return executeGit(args, workspacePath);
    }
    case "update_instructions": {
      const content = extractString(input.content);
      writeFileSync(instructionsPath, content, "utf-8");
      return { output: "OK", error: false };
    }
    case "web_search": {
      const query = extractString(input.query);
      return await executeWebSearch(query);
    }
    case "web_fetch": {
      const url = extractString(input.url);
      return await executeWebFetch(url);
    }
    default:
      return { output: `Unknown tool: ${name}`, error: true };
  }
}
