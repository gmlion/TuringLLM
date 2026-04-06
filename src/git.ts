import { execSync } from "child_process";
import { log } from "./logger.js";

function run(cmd: string, cwd: string): string {
  try {
    return execSync(cmd, { encoding: "utf-8", cwd }).trim();
  } catch {
    return "";
  }
}

export function ensureRepo(cwd: string): void {
  const isRepo = run("git rev-parse --is-inside-work-tree", cwd);
  if (isRepo !== "true") {
    run("git init", cwd);
    run("git add -A", cwd);
    run('git commit -m "cycle 0: initial state" --allow-empty', cwd);
    log("  [git] initialized repository");
  }
}

export function commitCycle(cwd: string, cycle: number, state: string): string {
  run("git add -A", cwd);

  // Check if there's anything to commit
  const status = run("git status --porcelain", cwd);
  if (!status) {
    // Nothing changed, return current HEAD hash
    return run("git rev-parse --short HEAD", cwd) || "0000000";
  }

  const message = `cycle ${cycle}: ${state}`;
  run(`git commit -m "${message}"`, cwd);
  const hash = run("git rev-parse --short HEAD", cwd) || "0000000";
  log(`  [git] ${hash} — ${message}`);
  return hash;
}
