import { test, describe } from "node:test";
import { strict as assert } from "node:assert";
import { readFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO = resolve(__dirname, "../..");

const LEAVES = [
  "interpreters/2-planning-decomposition/a-plan-execute",
  "interpreters/2-planning-decomposition/b-orchestrator-workers",
  "interpreters/2-planning-decomposition/c-deep-research",
];

const FILES = [
  "INSTRUCTIONS.md",
  "dynamics/plan.md",
  "dynamics/execute-step.md",
  "dynamics/synthesize.md",
];

describe("phase-3 dynamics identity", () => {
  for (const file of FILES) {
    test(`${file} is byte-equal across the three leaves`, () => {
      const contents = LEAVES.map((leaf) => {
        const p = resolve(REPO, leaf, file);
        assert.ok(existsSync(p), `${p} missing`);
        return readFileSync(p);
      });
      assert.ok(contents[0].equals(contents[1]), `${file}: a vs b diverged`);
      assert.ok(contents[0].equals(contents[2]), `${file}: a vs c diverged`);
    });
  }

  test("group-level README exists and names all four framings", () => {
    const r = readFileSync(resolve(REPO, "interpreters/2-planning-decomposition/README.md"), "utf-8");
    assert.match(r, /Plan-and-Execute/);
    assert.match(r, /Orchestrator.Workers/);
    assert.match(r, /Deep Research/);
    assert.match(r, /XAgent/);
  });
});
