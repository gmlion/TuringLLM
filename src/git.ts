import { execSync } from "child_process";
import { existsSync } from "fs";
import { resolve } from "path";
import { log } from "./logger.js";

function run(cmd: string, cwd: string): string {
  try {
    return execSync(cmd, { encoding: "utf-8", cwd }).trim();
  } catch {
    return "";
  }
}

// Machine git — tracks cycle-by-cycle evolution of the instance
// Must be its OWN repo, not inherited from a parent project repo.
export function ensureMachineRepo(instanceDir: string): void {
  const ownGitDir = resolve(instanceDir, ".git");
  if (!existsSync(ownGitDir)) {
    run("git init", instanceDir);
    run("git add -A", instanceDir);
    run('git commit -m "cycle 0: initial state" --allow-empty', instanceDir);
    log("  [machine-git] initialized repository");
  }
}

export function commitCycle(instanceDir: string, cycle: number, state: string): string {
  run("git add -A", instanceDir);

  const status = run("git status --porcelain", instanceDir);
  if (!status) {
    return run("git rev-parse --short HEAD", instanceDir) || "0000000";
  }

  const message = `cycle ${cycle}: ${state}`;
  run(`git commit -m "${message}"`, instanceDir);
  const hash = run("git rev-parse --short HEAD", instanceDir) || "0000000";
  log(`  [machine-git] ${hash} — ${message}`);
  return hash;
}

// Project git — the LLM's repo for artifacts, inside workspace/
export function ensureProjectRepo(instanceDir: string): void {
  const workspaceDir = resolve(instanceDir, "workspace");
  if (!existsSync(workspaceDir)) {
    execSync(`mkdir -p "${workspaceDir}"`, { encoding: "utf-8" });
  }
  const isRepo = run("git rev-parse --is-inside-work-tree", workspaceDir);
  if (isRepo !== "true") {
    run("git init", workspaceDir);
    run('git commit --allow-empty -m "initial"', workspaceDir);
    log("  [project-git] initialized workspace repository");
  }
}

export function getWorkspacePath(instanceDir: string): string {
  return resolve(instanceDir, "workspace");
}
