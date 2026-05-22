import { test, describe, beforeEach, afterEach } from "node:test";
import { strict as assert } from "node:assert";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { tmpdir } from "node:os";
import { getSystemPrompt, getUserPrompt, _shared } from "../prompt.js";

describe("getSystemPrompt", () => {
  test("api provider: base prompt includes Operators section and API_TOOLS_SECTION", () => {
    const p = getSystemPrompt("api");
    assert.match(p, /# Operators \(Push\/Pop\)/);
    assert.match(p, /## Push\n[\s\S]*operators\/consult\.md/);
    assert.match(p, /\*\*bash\*\*: Run a shell command/);
  });

  test("claude-code provider: includes CC_TOOLS_SECTION instead of API_TOOLS_SECTION", () => {
    const p = getSystemPrompt("claude-code");
    assert.match(p, /# Cycle discipline/);
    assert.doesNotMatch(p, /\*\*update_instructions\*\*:/);
  });

  test("ollama provider: returns the compact Ollama-specific prompt", () => {
    const p = getSystemPrompt("ollama");
    assert.match(p, /You are a Turing machine/);
    assert.match(p, /## Push/);
  });

  test("default provider (undefined) returns api-style prompt", () => {
    const p = getSystemPrompt();
    assert.match(p, /\*\*bash\*\*: Run a shell command/);
  });

  // Anti-drift guard: the prompt file used to contain two or three byte-
  // identical copies of "# Mutating other files" and "# Operators (Push/Pop)".
  // After the dedup these are single constants; this test pins the
  // invariant so a future copy-paste-and-edit reintroduces the drift only
  // when the test is also updated.
  describe("shared sections (anti-drift)", () => {
    test("API and OLLAMA include the tool-loop frame paths verbatim", () => {
      assert.ok(getSystemPrompt("api").includes(_shared.FRAME_PATHS_TOOL));
      assert.ok(getSystemPrompt("ollama").includes(_shared.FRAME_PATHS_TOOL));
    });

    test("API and OLLAMA include the tool-loop mutating-other-files block", () => {
      assert.ok(getSystemPrompt("api").includes(_shared.MUTATING_OTHER_FILES_TOOL));
      assert.ok(getSystemPrompt("ollama").includes(_shared.MUTATING_OTHER_FILES_TOOL));
    });

    test("API prompt includes the long Operators (Push/Pop) section", () => {
      assert.ok(getSystemPrompt("api").includes(_shared.OPERATORS_PUSH_POP));
    });

    test("API includes the MEMORY recipe and the Asking-the-user section", () => {
      const p = getSystemPrompt("api");
      assert.ok(p.includes(_shared.MEMORY_RECIPE_BASH));
      assert.ok(p.includes(_shared.ASKING_USER_TOOL));
    });
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

  test("working directory reported in prompt body", () => {
    writeFileSync(memoryPath, "## State\nfoo", "utf-8");
    writeFileSync(instructionsPath, "# Strategy", "utf-8");
    const p = getUserPrompt(memoryPath, instructionsPath, "api");
    // Header line lists the resolved dir (== parent of memoryPath).
    assert.match(p, /Working directory:/);
  });
});
