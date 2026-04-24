import { test, describe, beforeEach, afterEach } from "node:test";
import { strict as assert } from "node:assert";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { tmpdir } from "node:os";
import { getSystemPrompt, getUserPrompt } from "../prompt.js";

describe("getSystemPrompt", () => {
  const origStateful = process.env.TURING_STATEFUL;
  afterEach(() => {
    if (origStateful === undefined) delete process.env.TURING_STATEFUL;
    else process.env.TURING_STATEFUL = origStateful;
  });

  test("api provider: base prompt includes Dynamics section and API_TOOLS_SECTION", () => {
    delete process.env.TURING_STATEFUL;
    const p = getSystemPrompt("api");
    assert.match(p, /# Dynamics \(Push\/Pop\)/);
    assert.match(p, /## Push\n[\s\S]*dynamics\/consult\.md/);
    assert.match(p, /\*\*bash\*\*: Run a shell command/);
  });

  test("claude-code provider: includes CC_TOOLS_SECTION instead of API_TOOLS_SECTION", () => {
    delete process.env.TURING_STATEFUL;
    const p = getSystemPrompt("claude-code");
    assert.match(p, /# Cycle discipline/);
    assert.doesNotMatch(p, /\*\*update_instructions\*\*:/);
  });

  test("ollama provider: returns the compact Ollama-specific prompt with dynamics", () => {
    delete process.env.TURING_STATEFUL;
    const p = getSystemPrompt("ollama");
    assert.match(p, /You are a Turing machine/);
    assert.match(p, /## Push/);
    // Compact Ollama prompt inlines dynamics guidance without the # heading.
    assert.doesNotMatch(p, /# Dynamics \(Push\/Pop\)/);
  });

  test("stateful mode overrides provider and returns STATEFUL prompt", () => {
    process.env.TURING_STATEFUL = "1";
    const p = getSystemPrompt("api");
    assert.match(p, /===SYSCALLS===/);
    assert.match(p, /# Dynamics \(Push\/Pop\)/);
  });

  test("default provider (undefined) returns api-style prompt", () => {
    delete process.env.TURING_STATEFUL;
    const p = getSystemPrompt();
    assert.match(p, /\*\*bash\*\*: Run a shell command/);
  });
});

describe("getUserPrompt", () => {
  let dir: string;
  let memoryPath: string;
  let instructionsPath: string;

  beforeEach(() => {
    // Mimic the Phase 2b layout: <instance>/frames/f000-strategy/MEMORY.md
    dir = mkdtempSync(resolve(tmpdir(), "turing-prompt-"));
    const frameDir = resolve(dir, "frames", "f000-strategy");
    mkdirSync(frameDir, { recursive: true });
    memoryPath = resolve(frameDir, "MEMORY.md");
    instructionsPath = resolve(frameDir, "INSTRUCTIONS.md");
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
    delete process.env.TURING_STATEFUL;
  });

  test("inlines MEMORY and INSTRUCTIONS content", () => {
    writeFileSync(memoryPath, "## State\nfoo", "utf-8");
    writeFileSync(instructionsPath, "# Strategy\n...", "utf-8");
    const p = getUserPrompt(memoryPath, instructionsPath, "api");
    assert.match(p, /<MEMORY>\n## State\nfoo\n<\/MEMORY>/);
    assert.match(p, /<INSTRUCTIONS>\n# Strategy\n\.\.\.\n<\/INSTRUCTIONS>/);
    assert.match(p, /Execute the next cycle\.$/);
  });

  test("shows (empty) when MEMORY or INSTRUCTIONS file missing", () => {
    const p = getUserPrompt(memoryPath, instructionsPath, "api");
    assert.match(p, /<MEMORY>\n\(empty\)\n<\/MEMORY>/);
    assert.match(p, /<INSTRUCTIONS>\n\(empty\)\n<\/INSTRUCTIONS>/);
  });

  test("ollama variant appends tool-call nudge", () => {
    writeFileSync(memoryPath, "## State\nfoo", "utf-8");
    writeFileSync(instructionsPath, "# Strategy", "utf-8");
    const p = getUserPrompt(memoryPath, instructionsPath, "ollama");
    assert.match(p, /You MUST respond with tool calls only/);
  });

  test("stateful mode includes SYSCALLS block", () => {
    process.env.TURING_STATEFUL = "1";
    writeFileSync(memoryPath, "## State\nfoo", "utf-8");
    writeFileSync(instructionsPath, "# Strategy", "utf-8");
    writeFileSync(resolve(dir, "SYSCALLS.md"), "## Result 1: bash\nok", "utf-8");
    const p = getUserPrompt(memoryPath, instructionsPath, "api");
    assert.match(p, /<SYSCALLS>\n## Result 1: bash\nok\n<\/SYSCALLS>/);
    assert.match(p, /===SYSCALLS===/);
  });

  test("working directory reported in prompt body", () => {
    writeFileSync(memoryPath, "## State\nfoo", "utf-8");
    writeFileSync(instructionsPath, "# Strategy", "utf-8");
    const p = getUserPrompt(memoryPath, instructionsPath, "api");
    // Header line lists the resolved dir (== parent of memoryPath).
    assert.match(p, /Working directory:/);
  });
});
