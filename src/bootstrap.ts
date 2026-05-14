/**
 * bootstrap.ts — Instance lifecycle endpoints.
 *
 * `startupBootstrap` materialises a fresh instance from its `.root-operator`
 * declaration: substitutes `{{task}}` (from PROGRAM.md) and `{{prior_answer}}`
 * (always empty at bootstrap) into the operator template, writes the root
 * frame directory, and seeds `.call-stack.json`. Bootstrap matches the
 * push path's strictness: any unresolved `{{...}}` placeholder in the
 * operator template after substitution is a hard error — the same contract
 * `applyPush` enforces. This keeps a single shape for operator templates:
 * declare what you receive, and you receive exactly that.
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

/**
 * Read and validate the root operator path from the .root-operator config file.
 * Throws if the file is missing or empty.
 */
function readRootOperator(rootOpFile: string): string {
  const rootOpPath = existsSync(rootOpFile) ? readFileSync(rootOpFile, "utf-8").trim() : "";
  if (!rootOpPath) {
    throw new Error(
      "no .root-operator configured for this instance; create a new instance via new-instance.sh",
    );
  }
  return rootOpPath;
}

/**
 * Compute bootstrap data: frame directory, slug, call stack, and substituted content.
 * Pure function—accepts file contents and roots as arguments; returns computed structures
 * without I/O. Separates transformation logic from effects.
 */
function buildBootstrapData(
  baseDir: string,
  rootOpPath: string,
  operatorContent: string,
  programContent: string,
): {
  frameDirRelative: string;
  slug: string;
  callStack: CallStack;
  substituted: string;
} {
  const slug = slugFromTarget(rootOpPath);
  const frameDirRelative = formatFrameDir(0, slug);

  const { result: substituted, unresolved } = substitutePlaceholders(operatorContent, {
    task: programContent,
    prior_answer: "",
  });
  if (unresolved.length > 0) {
    throw new Error(
      `root operator '${rootOpPath}' has unresolved placeholders after bootstrap: ${unresolved.map((p) => `{{${p}}}`).join(", ")}. Bootstrap only provides {{task}} and {{prior_answer}}.`,
    );
  }

  const callStack: CallStack = {
    nextCounter: 1,
    stack: [{ returnState: "<root>", frameDir: frameDirRelative }],
  };

  return { frameDirRelative, slug, callStack, substituted };
}

export function startupBootstrap(baseDir: string): BootstrapResult {
  const rootOpFile = join(baseDir, ".root-operator");
  const rootOpPath = readRootOperator(rootOpFile);

  const operatorContent = readFileSync(join(baseDir, rootOpPath), "utf-8");
  const programPath = join(baseDir, "PROGRAM.md");
  const programContent = existsSync(programPath) ? readFileSync(programPath, "utf-8") : "";

  const { frameDirRelative, callStack, substituted } = buildBootstrapData(
    baseDir,
    rootOpPath,
    operatorContent,
    programContent,
  );

  // Validate substituted content before creating directories and writing files.
  if (!substituted || substituted.trim().length === 0) {
    throw new Error(
      "substituted operator content is empty; check PROGRAM.md and {{task}} placeholder in operator template",
    );
  }

  try {
    mkdirSync(join(baseDir, frameDirRelative, "scoped"), { recursive: true });
    writeFileSync(join(baseDir, frameDirRelative, "INSTRUCTIONS.md"), substituted, "utf-8");
    writeFileSync(join(baseDir, frameDirRelative, "MEMORY.md"), "## State\nempty\n", "utf-8");
  } catch (error) {
    throw new Error(
      `failed to initialize frame directory: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  writeFileSync(join(baseDir, ".call-stack.json"), JSON.stringify(callStack, null, 2), "utf-8");

  return {
    callStack,
    memoryPath: join(baseDir, frameDirRelative, "MEMORY.md"),
    instructionsPath: join(baseDir, frameDirRelative, "INSTRUCTIONS.md"),
  };
}

/**
 * Format return entries into markdown sections: capitalize first letter of each key,
 * format as "## SectionTitle\nvalue".
 * Pure function—enables testing of formatting logic in isolation.
 */
function formatReturnEntries(entries: Record<string, string>): string {
  let outputBody = "";
  for (const [key, value] of Object.entries(entries)) {
    const sectionTitle = key.charAt(0).toUpperCase() + key.slice(1);
    outputBody += `## ${sectionTitle}\n${value}\n\n`;
  }
  return outputBody;
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
    outputBody = formatReturnEntries(entries);
  }
  writeFileSync(join(baseDir, "OUTPUT.md"), outputBody);
}
