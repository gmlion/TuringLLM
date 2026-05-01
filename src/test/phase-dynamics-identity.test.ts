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
  "interpreters/3-search/b-lats/dynamics/evaluate.md",
];

const REFLECT_PATHS = [
  "interpreters/1-iterative-refinement/c-reflexion/dynamics/reflect.md",
  "interpreters/3-search/b-lats/dynamics/reflect.md",
];

const EXPAND_NODE_PATHS = [
  "interpreters/3-search/a-tot/dynamics/expand-node.md",
  "interpreters/3-search/b-lats/dynamics/expand-node.md",
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

describe("reflect.md identity across phases", () => {
  test("reflect.md is byte-equal across all consumers", () => {
    const contents = REFLECT_PATHS.map((p) => readFileSync(resolve(REPO, p)));
    for (let i = 1; i < contents.length; i++) {
      assert.ok(
        contents[0].equals(contents[i]),
        `reflect.md diverged between ${REFLECT_PATHS[0]} and ${REFLECT_PATHS[i]}`,
      );
    }
  });
});

describe("expand-node.md identity across phases (post-refactor)", () => {
  test("expand-node.md is byte-equal across all consumers", () => {
    const contents = EXPAND_NODE_PATHS.map((p) => readFileSync(resolve(REPO, p)));
    for (let i = 1; i < contents.length; i++) {
      assert.ok(
        contents[0].equals(contents[i]),
        `expand-node.md diverged between ${EXPAND_NODE_PATHS[0]} and ${EXPAND_NODE_PATHS[i]}`,
      );
    }
  });
});
