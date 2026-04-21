import { test, describe } from "node:test";
import { strict as assert } from "node:assert";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO = resolve(__dirname, "../..");

describe("phase-1 dynamics identity", () => {
  test("evaluate.md is byte-equal across 1b and 1c", () => {
    const a = readFileSync(
      resolve(REPO, "interpreters/1-iterative-refinement/b-evaluator-optimizer/dynamics/evaluate.md"),
    );
    const b = readFileSync(
      resolve(REPO, "interpreters/1-iterative-refinement/c-reflexion/dynamics/evaluate.md"),
    );
    assert.ok(a.equals(b), "evaluate.md diverged between 1b and 1c");
  });
});
