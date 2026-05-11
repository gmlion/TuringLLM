/**
 * bootstrap.ts — Instance lifecycle endpoints.
 *
 * `startupBootstrap` materialises a fresh instance from its `.root-operator`
 * declaration: substitutes `{{program}}` from PROGRAM.md into the operator
 * template, writes the root frame directory, and seeds `.call-stack.json`.
 *
 * `emitOutputMd` is the dual: when the root frame halts, it converts the
 * root memory's `## Return` block into `OUTPUT.md`, one section per key,
 * or writes a diagnostic when the operator halted without a return value.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import {
  type CallStack,
  substitutePlaceholders, slugFromTarget, formatFrameDir,
} from "./call-stack.js";
import { parseReturn } from "./memory.js";

export interface BootstrapResult {
  callStack: CallStack;
  memoryPath: string;
  instructionsPath: string;
}

export function startupBootstrap(baseDir: string): BootstrapResult {
  const rootOpFile = join(baseDir, ".root-operator");
  const rootOpPath = existsSync(rootOpFile) ? readFileSync(rootOpFile, "utf-8").trim() : "";
  if (!rootOpPath) {
    throw new Error(
      "no .root-operator configured for this instance; create a new instance via new-instance.sh",
    );
  }

  const slug = slugFromTarget(rootOpPath);
  const frameDirRelative = formatFrameDir(0, slug);

  const operatorContent = readFileSync(join(baseDir, rootOpPath), "utf-8");
  const programPath = join(baseDir, "PROGRAM.md");
  const programContent = existsSync(programPath) ? readFileSync(programPath, "utf-8") : "";
  const { result: substituted } = substitutePlaceholders(operatorContent, { program: programContent });

  mkdirSync(join(baseDir, frameDirRelative, "scoped"), { recursive: true });
  writeFileSync(join(baseDir, frameDirRelative, "INSTRUCTIONS.md"), substituted, "utf-8");
  writeFileSync(join(baseDir, frameDirRelative, "MEMORY.md"), "## State\nempty\n", "utf-8");

  const callStack: CallStack = {
    nextCounter: 1,
    stack: [{ returnState: "<root>", frameDir: frameDirRelative }],
  };
  writeFileSync(join(baseDir, ".call-stack.json"), JSON.stringify(callStack, null, 2), "utf-8");

  return {
    callStack,
    memoryPath: join(baseDir, frameDirRelative, "MEMORY.md"),
    instructionsPath: join(baseDir, frameDirRelative, "INSTRUCTIONS.md"),
  };
}

export function emitOutputMd(baseDir: string, rootMemory: string): void {
  const { entries } = parseReturn(rootMemory);
  let outputBody: string;
  if (Object.keys(entries).length === 0) {
    outputBody =
      "# OUTPUT (no return values)\n\n" +
      "The root operator halted without a ## Return block. " +
      "Inspect frames/f000-<slug>/MEMORY.md for terminal state.\n";
  } else {
    outputBody = "";
    for (const [key, value] of Object.entries(entries)) {
      const sectionTitle = key.charAt(0).toUpperCase() + key.slice(1);
      outputBody += `## ${sectionTitle}\n${value}\n\n`;
    }
  }
  writeFileSync(join(baseDir, "OUTPUT.md"), outputBody);
}
