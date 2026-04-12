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

/** Extract the ## Answers section content (without header). */
export function getAnswersSection(memory: string): string {
  return memory.match(/^## Answers\n([\s\S]*?)(?=\n## [A-Z]|$)/m)?.[1] || "";
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
