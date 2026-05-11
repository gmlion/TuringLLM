/**
 * syscalls.ts — Stateful-mode syscall executor.
 *
 * The stateful provider writes a syscalls block to SYSCALLS_PATH; the shell
 * executes each block (bash / write_file / update_instructions / git) and
 * writes the per-block results back to the same file. Each kind has its
 * own error format; bash and git share `formatExecError` because both wrap
 * a shelling-out failure.
 */

import { execSync } from "child_process";
import { mkdirSync, writeFileSync } from "fs";
import { dirname } from "path";
import { log } from "./logger.js";
import { ALLOWED_GIT_COMMANDS } from "./tools.js";
import { getWorkspacePath } from "./git.js";
import { BASE_DIR, SYSCALLS_PATH } from "./config.js";
import { readFile } from "./io.js";

function formatExecError(i: number, kind: string, err: unknown): string {
  const e = err as { stdout?: string; stderr?: string; status?: number };
  return `## Result ${i + 1}: ${kind}\nexit code ${e.status ?? 1}\nstdout: ${e.stdout ?? ""}\nstderr: ${e.stderr ?? ""}`;
}

export function executeSyscalls(instructionsPath: string, frameDir: string): void {
  const content = readFile(SYSCALLS_PATH);
  if (!content.trim()) return;

  const blocks = content.split(/^---$/m).map(b => b.trim()).filter(Boolean);
  const results: string[] = [];

  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];
    const firstLine = block.split("\n")[0];
    const rest = block.slice(firstLine.length).trim();

    if (firstLine.startsWith("bash:")) {
      const command = firstLine.slice(5).trim() || rest;
      log(`  [bash] ${command}`);
      try {
        const output = execSync(command, { encoding: "utf-8", maxBuffer: 1024 * 1024, cwd: frameDir });
        results.push(`## Result ${i + 1}: bash\n${output || "(no output)"}`);
      } catch (err: unknown) {
        results.push(formatExecError(i, "bash", err));
      }
    } else if (firstLine.startsWith("write_file:")) {
      const filePath = firstLine.slice(11).trim();
      log(`  [write_file] ${filePath}`);
      try {
        mkdirSync(dirname(filePath), { recursive: true });
        writeFileSync(filePath, rest, "utf-8");
        results.push(`## Result ${i + 1}: write_file\nOK`);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        results.push(`## Result ${i + 1}: write_file\nError: ${msg}`);
      }
    } else if (firstLine.startsWith("update_instructions:")) {
      log(`  [update_instructions]`);
      try {
        writeFileSync(instructionsPath, rest, "utf-8");
        results.push(`## Result ${i + 1}: update_instructions\nOK`);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        results.push(`## Result ${i + 1}: update_instructions\nError: ${msg}`);
      }
    } else if (firstLine.startsWith("git:")) {
      const args = firstLine.slice(4).trim() || rest;
      const workspacePath = getWorkspacePath(BASE_DIR);
      const subcommand = args.trim().split(/\s+/)[0].toLowerCase();
      if (!ALLOWED_GIT_COMMANDS.has(subcommand)) {
        results.push(`## Result ${i + 1}: git\nError: "git ${subcommand}" is not allowed. Allowed: ${[...ALLOWED_GIT_COMMANDS].join(", ")}.`);
      } else {
        log(`  [git] ${args}`);
        try {
          const output = execSync(`git ${args}`, { encoding: "utf-8", maxBuffer: 1024 * 1024, cwd: workspacePath });
          results.push(`## Result ${i + 1}: git\n${output || "(no output)"}`);
        } catch (err: unknown) {
          results.push(formatExecError(i, "git", err));
        }
      }
    } else {
      results.push(`## Result ${i + 1}: unknown\nError: unknown action: ${firstLine}`);
    }
  }

  writeFileSync(SYSCALLS_PATH, results.join("\n\n") + "\n", "utf-8");
}
