import { test, describe } from "node:test";
import { strict as assert } from "node:assert";
import { existsSync, readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { execSync } from "child_process";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

describe("R1: aflow-lite directory layout", () => {
  test("interpreters/7-meta-framework/a-aflow-lite/ exists", () => {
    assert.ok(existsSync(resolve(REPO, "interpreters/7-meta-framework/a-aflow-lite")));
  });
  test("INSTRUCTIONS.md is a single-line marker", () => {
    const inst = readFileSync(resolve(REPO, "interpreters/7-meta-framework/a-aflow-lite/INSTRUCTIONS.md"), "utf-8").trim();
    assert.equal(inst, "operators/aflow-lite.md");
  });
  test("operators/ dir exists", () => {
    assert.ok(existsSync(resolve(REPO, "interpreters/7-meta-framework/a-aflow-lite/operators")));
  });
  test("PROGRAM.md exists", () => {
    assert.ok(existsSync(resolve(REPO, "interpreters/7-meta-framework/a-aflow-lite/PROGRAM.md")));
  });
});

describe("R2: group README exists", () => {
  test("interpreters/7-meta-framework/README.md exists and mentions aflow-lite", () => {
    const p = resolve(REPO, "interpreters/7-meta-framework/README.md");
    assert.ok(existsSync(p));
    const content = readFileSync(p, "utf-8");
    assert.match(content, /aflow-lite/i);
  });
});

describe("R3: leaf README exists", () => {
  test("interpreters/7-meta-framework/a-aflow-lite/README.md exists", () => {
    assert.ok(existsSync(resolve(REPO, "interpreters/7-meta-framework/a-aflow-lite/README.md")));
  });
});

describe("R10: no 'dynamics/' substring outside frozen spec dirs", () => {
  test("git grep returns nothing", () => {
    const excludes = [
      ":!docs/specs/2026-04-23-agent-workflows-phase-2b-push-returns/",
      ":!docs/specs/2026-04-24-implement-phase-3-and-4/",
      ":!docs/specs/2026-04-30-agent-workflows-phase-6/",
      ":!docs/specs/2026-05-01-implement-phase-6b/",
      ":!docs/specs/2026-05-02-phase-7-including-cove-and-1b-in-addition-or-instead-of-1a/",
      ":!src/test/phase-7-aflow-lite.test.ts",
    ].join(" ");
    let out = "";
    try {
      out = execSync(`git grep -l "dynamics/" -- ${excludes}`, { cwd: REPO, encoding: "utf-8" }).trim();
    } catch (e: any) {
      out = "";
    }
    assert.equal(out, "", `unexpected 'dynamics/' references: ${out}`);
  });
});

describe("R26/R34: 12 operators copied byte-equal into aflow-lite", () => {
  const COPIES = [
    ["refine.md",                "interpreters/1-iterative-refinement/b-evaluator-optimizer/operators/refine.md"],
    ["reflexion.md",             "interpreters/1-iterative-refinement/c-reflexion/operators/reflexion.md"],
    ["cove.md",                  "interpreters/1-iterative-refinement/d-cove/operators/cove.md"],
    ["plan-execute.md",          "interpreters/2-planning-decomposition/a-plan-execute/operators/plan-execute.md"],
    ["debate.md",                "interpreters/4-peer-collaboration/a-debate/operators/debate.md"],
    ["evaluate.md",              "interpreters/1-iterative-refinement/b-evaluator-optimizer/operators/evaluate.md"],
    ["reflect.md",               "interpreters/1-iterative-refinement/c-reflexion/operators/reflect.md"],
    ["verify.md",                "interpreters/1-iterative-refinement/d-cove/operators/verify.md"],
    ["answer-independently.md",  "interpreters/1-iterative-refinement/d-cove/operators/answer-independently.md"],
    ["tackle.md",                "interpreters/2-planning-decomposition/a-plan-execute/operators/tackle.md"],
    ["plan.md",                  "interpreters/2-planning-decomposition/a-plan-execute/operators/plan.md"],
    ["opine.md",                 "interpreters/4-peer-collaboration/a-debate/operators/opine.md"],
  ];
  const AFLOW_DIR = "interpreters/7-meta-framework/a-aflow-lite/operators";
  for (const [name, source] of COPIES) {
    test(`${name} exists in aflow-lite operators/`, () => {
      assert.ok(existsSync(resolve(REPO, AFLOW_DIR, name)), `missing: ${name}`);
    });
    test(`${name} is byte-equal to canonical ${source}`, () => {
      const a = readFileSync(resolve(REPO, AFLOW_DIR, name), "utf-8");
      const b = readFileSync(resolve(REPO, source), "utf-8");
      assert.equal(a, b, `${name} not byte-equal to canonical`);
    });
  }
});
