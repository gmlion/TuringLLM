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
 *
 * Used by `bootstrap.ts:emitOutputMd` to splay the root frame's return
 * into OUTPUT.md sections. The shell's own pop path does NOT use this —
 * it uses `getReturnBody` and `spliceReturn` to place the verbatim body
 * under a single `## Popped Return` section, avoiding the per-key splay
 * that would collide with shell-managed sections (`## State`, `## Push`,
 * etc.) in the caller.
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

/**
 * Extract the verbatim body of the `## Return` section: everything from
 * the line after `## Return` up to (but not including) the next `## `
 * heading or end of file. Trailing newlines are trimmed.
 *
 * Returns `""` if no `## Return` section is present, OR if the section
 * exists but its body is empty.
 *
 * Used by `applyPop` to splice the return body into the caller's MEMORY
 * under a single `## Popped Return` section, without splaying per key —
 * the splay would let a child overwrite shell-managed sections via key
 * collision.
 */
export function getReturnBody(memory: string): string {
  const headerMatch = memory.match(/(^|\n)## Return\n/);
  if (!headerMatch) return "";
  const start = (headerMatch.index ?? 0) + headerMatch[0].length;
  const rest = memory.slice(start);
  const nextHeading = rest.match(/\n## [A-Z]/);
  const end = nextHeading ? start + (nextHeading.index ?? 0) : memory.length;
  return memory.slice(start, end).replace(/\n+$/, "");
}

/** Remove the ## Return section from MEMORY. Mirror of removePushArgs. */
export function removeReturn(memory: string): string {
  return removeSection(memory, "Return");
}

/**
 * Splice the verbatim body of a child's `## Return` into the caller's
 * MEMORY under a single `## Popped Return` section. Upsert: replace an
 * existing section's body if present, append at end otherwise.
 *
 * Why a single section instead of per-key splay? A per-key splay would
 * let a child write keys that capitalize to shell-managed section
 * headers (e.g. `state`, `push`, `return`, `answers`) and inject those
 * sections into the caller — a real cascade-pop / control-flow hijack
 * vector. Confining the entire return body under one fixed header makes
 * the injection structurally impossible: the caller's interpreter reads
 * named keys *inside* `## Popped Return`, not as top-level MEMORY
 * sections.
 *
 * Empty body is a no-op (caller MEMORY returned unchanged).
 */
export function spliceReturn(callerMemory: string, returnBody: string): string {
  if (returnBody === "") return callerMemory;
  const sectionName = "## Popped Return";
  const re = new RegExp(
    `(^|\\n)${sectionName}\\n[^\\n]*(\\n(?!## )[^\\n]*)*`,
    "m",
  );
  if (re.test(callerMemory)) {
    return callerMemory.replace(re, `$1${sectionName}\n${returnBody}`);
  }
  let out = callerMemory;
  if (!out.endsWith("\n")) out += "\n";
  return out + `${sectionName}\n${returnBody}\n`;
}
