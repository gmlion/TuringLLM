/**
 * memory.ts — Pure functions for MEMORY.md parsing and transformation.
 *
 * All functions are pure string transformers: they take a MEMORY string
 * and return parsed data or a transformed string. No file I/O.
 *
 * Invariant: MEMORY.md always starts with `## State\n<state>`.
 */

export type PendingQuestion = { id: string; question: string };

/** Block scalar key pattern: keys never allow hyphens (invariant across all parsers). */
const BLOCK_SCALAR_KEY_PATTERN = /^([a-zA-Z_][a-zA-Z0-9_]*): \|$/;

/** Extract the current state from MEMORY content. */
export function parseState(memory: string): string {
  const match = memory.match(/^## State\n(.+)/m);
  return match ? match[1].trim() : "";
}

/**
 * Parse pending questions from MEMORY content.
 *
 * Handles flexible formats:
 * - `- **Q1**: question` (bold)
 * - `- __Q1__: question` (underscores)
 * - `- Q1: question` (plain)
 * - `- label: question` (any label)
 * - Multi-line questions (continuation lines until next `- `)
 * - Section headers with suffixes: `## Pending Questions - Choose Approach`
 */
export function parsePendingQuestions(memory: string): PendingQuestion[] {
  const match = memory.match(/^## Pending Questions[^\n]*\n([\s\S]*?)(?=\n## [A-Z])/m)
    || memory.match(/^## Pending Questions[^\n]*\n([\s\S]+)$/m);
  if (!match) return [];

  const items: PendingQuestion[] = [];
  const parts = match[1].split(/^(?=- )/gm).filter(Boolean);
  for (const part of parts) {
    let m = part.match(/^- \*\*([^*]+)\*\*:?\s*([\s\S]*)/);
    if (!m) m = part.match(/^- __([^_]+)__:?\s*([\s\S]*)/);
    if (!m) m = part.match(/^- (Q\d+[^:]*?):\s*([\s\S]*)/);
    if (!m) m = part.match(/^- ([^:]+):\s*([\s\S]*)/);
    if (m) items.push({ id: m[1].trim(), question: m[2].trim() });
  }
  return items;
}

/** Extract the ## Answers section content (without header, trailing newlines trimmed). */
export function getAnswersSection(memory: string): string {
  const match = memory.match(/^## Answers\n([\s\S]*?)(?=\n## [A-Z])/m)
    || memory.match(/^## Answers\n([\s\S]+)$/m);
  return match ? match[1].replace(/\n+$/, "") : "";
}

/** Append an answer to the ## Answers section. Pure string transform. */
export function writeAnswer(memory: string, id: string, answer: string): string {
  const line = `- **${id}**: ${answer}\n`;
  if (memory.match(/^## Answers\n/m)) {
    return memory.replace(/^(## Answers\n)/m, `$1${line}`);
  }
  return memory + `\n## Answers\n${line}`;
}

/** Set the state in MEMORY. Pure string transform. */
export function setState(memory: string, state: string): string {
  return memory.replace(/^(## State\n).+/m, `$1${state}`);
}

/** Extract push target from MEMORY (path after ## Push header). */
export function parsePush(memory: string): string | null {
  const match = memory.match(/^## Push\n(.+)/m);
  return match ? match[1].trim() : null;
}

/** Remove the ## Push section from MEMORY. */
export function removePush(memory: string): string {
  return removeSection(memory, "Push");
}

/**
 * Extract block scalar value from lines, handling indentation and trimming.
 * Returns the value and the next line index to continue parsing from.
 * Block scalars must be indented by exactly 2 spaces; trailing blank lines are trimmed.
 */
function extractBlockScalarValue(
  lines: string[],
  startIndex: number,
): { value: string; nextIndex: number } {
  const valueLines: string[] = [];
  let i = startIndex;
  while (i < lines.length && (lines[i].startsWith("  ") || lines[i] === "")) {
    valueLines.push(lines[i].startsWith("  ") ? lines[i].slice(2) : "");
    i++;
  }
  while (valueLines.length > 0 && valueLines[valueLines.length - 1] === "") {
    valueLines.pop();
  }
  return { value: valueLines.join("\n"), nextIndex: i };
}

/**
 * Internal helper: parse a `## <sectionName>` block into keyed entries.
 *
 * Grammar (same as Push-Args / Return):
 *   - `key: value`    — single-line
 *   - `key: |`        — block scalar: continuation lines must be indented
 *                       by exactly 2 spaces; trailing blank lines trimmed
 *
 * Options:
 *   allowHyphensInSingleLine — widens the single-line key regex from
 *     `[a-zA-Z_][a-zA-Z0-9_]*` to `[a-zA-Z_][a-zA-Z0-9_-]*`.
 *     Block-scalar keys never allow hyphens (matches both parsers).
 *   skipBlankLines — skip blank lines instead of treating them as malformed.
 *     When false (default) blank lines are silently skipped too — the
 *     difference is that with skipBlankLines=false a blank line is not
 *     added to malformedLines (parsePushArgs behaviour), while with
 *     skipBlankLines=true it is explicitly continued (parseReturn behaviour).
 *     Both produce the same observable result for blank lines; the flag
 *     exists to faithfully document the original intent of each caller.
 */
function parseKeyedSection(
  memory: string,
  sectionName: string,
  options?: {
    allowHyphensInSingleLine?: boolean;
    skipBlankLines?: boolean;
  },
): { entries: Record<string, string>; malformedLines: string[] } {
  const escapedName = sectionName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const headerRe = new RegExp(`(^|\\n)## ${escapedName}\\n`);
  const headerMatch = memory.match(headerRe);
  if (!headerMatch) return { entries: {}, malformedLines: [] };
  const start = (headerMatch.index ?? 0) + headerMatch[0].length;

  const remainder = memory.slice(start);
  const nextHeading = remainder.match(/\n## [A-Z]/);
  const sectionEnd = nextHeading
    ? start + (nextHeading.index ?? 0)
    : memory.length;
  const section = memory.slice(start, sectionEnd);

  const singleLineKeyPat = options?.allowHyphensInSingleLine
    ? /^([a-zA-Z_][a-zA-Z0-9_-]*): (.+)$/
    : /^([a-zA-Z_][a-zA-Z0-9_]*): (.+)$/;

  const entries: Record<string, string> = {};
  const malformedLines: string[] = [];
  const lines = section.split("\n");
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (line === "") {
      i++;
      continue;
    }
    // Block scalar: `key: |`  (keys never allow hyphens regardless of option)
    const blockMatch = line.match(BLOCK_SCALAR_KEY_PATTERN);
    if (blockMatch) {
      const key = blockMatch[1];
      i++;
      const { value, nextIndex } = extractBlockScalarValue(lines, i);
      entries[key] = value;
      i = nextIndex;
      continue;
    }
    // Single-line: `key: value`
    const singleMatch = line.match(singleLineKeyPat);
    if (singleMatch) {
      entries[singleMatch[1]] = singleMatch[2];
    } else {
      malformedLines.push(line);
    }
    i++;
  }
  return { entries, malformedLines };
}

/**
 * Internal helper: remove a `## <sectionName>` block from MEMORY.
 * Section name is escaped for use in a regex.
 */
function removeSection(memory: string, sectionName: string): string {
  const escapedName = sectionName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return memory.replace(
    new RegExp(`\\n?## ${escapedName}\\n[^\\n]*(\\n(?!## )[^\\n]*)*`, "m"),
    "",
  );
}

/**
 * Parse the ## Push-Args section into a key→value map.
 *
 * Format:
 *   - `key: value` (single-line; rest of line after `: ` is the value)
 *   - `key: |` followed by lines indented by 2 spaces (block scalar;
 *     leading 2 spaces stripped, lines joined with \n, trailing empty
 *     lines trimmed)
 *
 * Returns {} if the section is absent. Skips malformed lines silently —
 * missing args surface later as unresolved placeholders in applyPush.
 */
export function parsePushArgs(memory: string): Record<string, string> {
  return parseKeyedSection(memory, "Push-Args").entries;
}

/** Remove the ## Push-Args section from MEMORY. Mirror of removePush. */
export function removePushArgs(memory: string): string {
  return removeSection(memory, "Push-Args");
}

/**
 * Parse the ## Return section into (entries, malformedLines).
 * Grammar is identical to parsePushArgs: `key: value` or `key: |` block scalar
 * with 2-space indentation. Malformed lines (no `:`, or identifier rule
 * violation) are collected separately so the caller can log them.
 * Single-line keys allow hyphens; block-scalar keys do not.
 */
export function parseReturn(memory: string): {
  entries: Record<string, string>;
  malformedLines: string[];
} {
  return parseKeyedSection(memory, "Return", {
    allowHyphensInSingleLine: true,
    skipBlankLines: true,
  });
}

/** Remove the ## Return section from MEMORY. Mirror of removePushArgs. */
export function removeReturn(memory: string): string {
  return removeSection(memory, "Return");
}

/**
 * Capitalize the first character of a key for use in section headers.
 * Example: "answerId" → "AnswerId", "verdict" → "Verdict"
 */
function capitalizeKey(key: string): string {
  return key.charAt(0).toUpperCase() + key.slice(1);
}

/**
 * Splice return entries into caller MEMORY as ## <CapitalizedKey> sections.
 * Upsert: replace an existing section's body if present, append a new
 * section at the end otherwise. First character of the key is uppercased;
 * remaining characters preserved (so "answerId" → "## AnswerId").
 */
export function spliceReturns(
  callerMemory: string,
  returns: Record<string, string>,
): string {
  let out = callerMemory;
  for (const [key, value] of Object.entries(returns)) {
    const sectionName = `## ${capitalizeKey(key)}`;
    const re = new RegExp(
      `(^|\\n)${sectionName}\\n[^\\n]*(\\n(?!## )[^\\n]*)*`,
      "m",
    );
    if (re.test(out)) {
      out = out.replace(re, `$1${sectionName}\n${value}`);
    } else {
      if (!out.endsWith("\n")) out += "\n";
      out += `${sectionName}\n${value}\n`;
    }
  }
  return out;
}
