import { test, describe } from "node:test";
import { strict as assert } from "node:assert";
import { existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { execSync } from "child_process";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

describe("R5: no `dynamics/` substring in INSTRUCTIONS.md or operator files", () => {
  test("no dynamics/ in any interpreter markdown", () => {
    let out = "";
    try {
      out = execSync('git grep -l "dynamics/" -- "interpreters/**/*.md"', { cwd: REPO, encoding: "utf-8" }).trim();
    } catch (e: any) {
      out = "";
    }
    assert.equal(out, "", `unexpected 'dynamics/' references in: ${out}`);
  });
});

describe("R4: dynamics/ → operators/ rename across all leaves", () => {
  const leaves = [
    "interpreters/1-iterative-refinement/a-self-refine",
    "interpreters/1-iterative-refinement/b-evaluator-optimizer",
    "interpreters/1-iterative-refinement/c-reflexion",
    "interpreters/1-iterative-refinement/d-cove",
    "interpreters/2-planning-decomposition/a-plan-execute",
    "interpreters/2-planning-decomposition/b-orchestrator-workers",
    "interpreters/2-planning-decomposition/c-deep-research",
    "interpreters/3-search/a-tot",
    "interpreters/3-search/b-lats",
    "interpreters/4-peer-collaboration/a-debate",
    "interpreters/5-fixed-sop-teams/a-metagpt",
    "interpreters/5-fixed-sop-teams/b-chatdev",
  ];
  for (const leaf of leaves) {
    test(`${leaf}/operators/ exists`, () => {
      assert.ok(existsSync(resolve(REPO, leaf, "operators")), `${leaf}/operators/ missing`);
    });
    test(`${leaf}/dynamics/ does NOT exist`, () => {
      assert.ok(!existsSync(resolve(REPO, leaf, "dynamics")), `${leaf}/dynamics/ should be gone`);
    });
  }
});
