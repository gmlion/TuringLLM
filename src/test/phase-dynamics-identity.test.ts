import { test, describe } from "node:test";
import { strict as assert } from "node:assert";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO = resolve(__dirname, "../..");

const EVALUATE_PATHS = [
  "interpreters/1-iterative-refinement/b-evaluator-optimizer/dynamics/evaluate.md",
  "interpreters/1-iterative-refinement/c-reflexion/dynamics/evaluate.md",
  "interpreters/5-fixed-sop-teams/a-metagpt/dynamics/evaluate.md",
  "interpreters/5-fixed-sop-teams/b-chatdev/dynamics/evaluate.md",
  "interpreters/3-search/a-tot/dynamics/evaluate.md",
];

describe("evaluate.md identity across phases", () => {
  test("evaluate.md is byte-equal across all four consumers", () => {
    const contents = EVALUATE_PATHS.map((p) => readFileSync(resolve(REPO, p)));
    for (let i = 1; i < contents.length; i++) {
      assert.ok(
        contents[0].equals(contents[i]),
        `evaluate.md diverged between ${EVALUATE_PATHS[0]} and ${EVALUATE_PATHS[i]}`,
      );
    }
  });
});
