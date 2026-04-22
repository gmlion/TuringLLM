/**
 * memory.ts — Pure functions for MEMORY.md parsing and transformation.
 *
 * All functions are pure string transformers: they take a MEMORY string
 * and return parsed data or a transformed string. No file I/O.
 *
 * Invariant: MEMORY.md always starts with `## State\n<state>`.
 */

export type PendingQuestion = { id: string; question: string };

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
  return memory.replace(/\n?## Push\n[^\n]*(\n(?!## )[^\n]*)*/m, "");
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
  const headerRe = /(^|\n)## Push-Args\n/;
  const headerMatch = memory.match(headerRe);
  if (!headerMatch) return {};
  const start = (headerMatch.index ?? 0) + headerMatch[0].length;

  const remainder = memory.slice(start);
  const nextHeading = remainder.match(/\n## [A-Z]/);
  const sectionEnd = nextHeading
    ? start + (nextHeading.index ?? 0)
    : memory.length;
  const section = memory.slice(start, sectionEnd);

  const result: Record<string, string> = {};
  const lines = section.split("\n");
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const blockMatch = line.match(/^([a-zA-Z_][a-zA-Z0-9_]*): \|$/);
    if (blockMatch) {
      const key = blockMatch[1];
      const valueLines: string[] = [];
      i++;
      while (i < lines.length && (lines[i].startsWith("  ") || lines[i] === "")) {
        valueLines.push(lines[i].startsWith("  ") ? lines[i].slice(2) : "");
        i++;
      }
      while (valueLines.length > 0 && valueLines[valueLines.length - 1] === "") {
        valueLines.pop();
      }
      result[key] = valueLines.join("\n");
      continue;
    }
    const singleMatch = line.match(/^([a-zA-Z_][a-zA-Z0-9_]*): (.+)$/);
    if (singleMatch) {
      result[singleMatch[1]] = singleMatch[2];
    }
    i++;
  }
  return result;
}

/** Remove the ## Push-Args section from MEMORY. Mirror of removePush. */
export function removePushArgs(memory: string): string {
  return memory.replace(/\n?## Push-Args\n[^\n]*(\n(?!## )[^\n]*)*/m, "");
}
