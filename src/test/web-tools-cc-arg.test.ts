import { test, describe } from "node:test";
import { strict as assert } from "node:assert";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe("CC provider --allowedTools includes WebSearch + WebFetch", () => {
  test("source text of claude-code.ts lists both tools", () => {
    const src = readFileSync(
      resolve(__dirname, "../../src/providers/claude-code.ts"),
      "utf-8",
    );
    const idx = src.indexOf("--allowedTools");
    assert.ok(idx >= 0, "--allowedTools not found");
    const tail = src.slice(idx, idx + 500);
    assert.match(tail, /"Bash\(\*\)"/, "Bash(*) present");
    assert.match(tail, /"Write\(\*\)"/, "Write(*) present");
    assert.match(tail, /"Edit\(\*\)"/, "Edit(*) present");
    assert.match(tail, /"WebSearch"/,   "WebSearch present");
    assert.match(tail, /"WebFetch"/,    "WebFetch present");
  });

  test("CC_TOOLS_SECTION documents WebSearch + WebFetch", () => {
    const src = readFileSync(
      resolve(__dirname, "../../src/prompt.ts"),
      "utf-8",
    );
    const idx = src.indexOf("CC_TOOLS_SECTION");
    assert.ok(idx >= 0, "CC_TOOLS_SECTION not found");
    const block = src.slice(idx, src.indexOf("`;", idx));
    assert.match(block, /WebSearch/);
    assert.match(block, /WebFetch/);
  });
});
