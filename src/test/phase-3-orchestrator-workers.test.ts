import { test, describe } from "node:test";
import { strict as assert } from "node:assert";
import { existsSync, readFileSync, readdirSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO = resolve(__dirname, "../..");
const INTERP = resolve(REPO, "interpreters/2-planning-decomposition/b-orchestrator-workers");

describe("phase-3 b-orchestrator-workers: layout, PROGRAM, inputs, README", () => {
  test("required files exist", () => {
    for (const f of [
      "INSTRUCTIONS.md",
      "PROGRAM.md",
      "README.md",
      "dynamics/plan.md",
      "dynamics/execute-step.md",
      "dynamics/synthesize.md",
    ]) {
      assert.ok(existsSync(resolve(INTERP, f)), `${f} missing`);
    }
  });

  test("PROGRAM.md instructs summarisation of workspace/inputs/", () => {
    const p = readFileSync(resolve(INTERP, "PROGRAM.md"), "utf-8");
    assert.match(p, /workspace\/inputs/);
    assert.match(p, /summar/i);
  });

  test("exactly five input files under workspace/inputs/", () => {
    const dir = resolve(INTERP, "workspace/inputs");
    assert.ok(existsSync(dir), "workspace/inputs missing");
    const files = readdirSync(dir).filter((n) => n.endsWith(".md")).sort();
    assert.equal(files.length, 5, `expected 5 input files, found ${files.length}: ${files.join(",")}`);
    for (let i = 1; i <= 5; i++) {
      assert.ok(files.includes(`input-${i}.md`), `input-${i}.md missing`);
    }
  });

  test("each input file is non-trivial (>= 50 chars)", () => {
    for (let i = 1; i <= 5; i++) {
      const body = readFileSync(resolve(INTERP, `workspace/inputs/input-${i}.md`), "utf-8");
      assert.ok(body.trim().length >= 50, `input-${i}.md too short`);
    }
  });

  test("README names Orchestrator-Workers AND all four framings (R45 + R65)", () => {
    const r = readFileSync(resolve(INTERP, "README.md"), "utf-8");
    assert.match(r, /Orchestrator.Workers/);
    assert.match(r, /Anthropic/);
    assert.match(r, /Plan-and-Execute/);
    assert.match(r, /Deep Research/);
    assert.match(r, /XAgent/);
  });
});
