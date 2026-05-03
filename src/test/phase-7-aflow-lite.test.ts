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

describe("R48: workspace/gsm8k.jsonl fixture", () => {
  const FIXTURE = "interpreters/7-meta-framework/a-aflow-lite/workspace/gsm8k.jsonl";
  test("fixture exists", () => {
    assert.ok(existsSync(resolve(REPO, FIXTURE)));
  });
  test("fixture has exactly 20 lines, each parseable JSON with question (string) + answer (integer)", () => {
    const lines = readFileSync(resolve(REPO, FIXTURE), "utf-8").trim().split("\n");
    assert.equal(lines.length, 20, "expected 20 items");
    for (let i = 0; i < lines.length; i++) {
      const obj = JSON.parse(lines[i]);
      assert.equal(typeof obj.question, "string", `item ${i}: question not string`);
      assert.ok(obj.question.length > 10, `item ${i}: question too short`);
      assert.equal(typeof obj.answer, "number", `item ${i}: answer not number`);
      assert.ok(Number.isInteger(obj.answer), `item ${i}: answer not integer`);
    }
  });
});

describe("R49: PROGRAM.md is short prose pointing at fixture", () => {
  const PROG = "interpreters/7-meta-framework/a-aflow-lite/PROGRAM.md";
  test("PROGRAM.md exists and references workspace/gsm8k.jsonl", () => {
    const content = readFileSync(resolve(REPO, PROG), "utf-8");
    assert.match(content, /workspace\/gsm8k\.jsonl/);
    assert.match(content, /GSM8K/);
  });
});

describe("R28: aflow-lite.md is the canonical operator", () => {
  const OP = "interpreters/7-meta-framework/a-aflow-lite/operators/aflow-lite.md";
  test("operators/aflow-lite.md exists", () => {
    assert.ok(existsSync(resolve(REPO, OP)));
  });
  test("file has a strategy preamble naming the meta-framework", () => {
    const content = readFileSync(resolve(REPO, OP), "utf-8");
    assert.match(content, /# Operator: AFlow-lite/i);
    assert.match(content, /MCTS/);
    assert.match(content, /workflow/i);
  });
});

describe("R31: hardcoded operator library", () => {
  const OP = "interpreters/7-meta-framework/a-aflow-lite/operators/aflow-lite.md";
  test("library is exactly refine,reflexion,cove,plan-execute,debate", () => {
    const content = readFileSync(resolve(REPO, OP), "utf-8");
    assert.match(content, /LIBRARY="refine,reflexion,cove,plan-execute,debate"/);
  });
  test("library does NOT include MoA, self-refine, tot, lats, metagpt, chatdev", () => {
    const content = readFileSync(resolve(REPO, OP), "utf-8");
    assert.doesNotMatch(content, /LIBRARY=.*\bMoA\b/);
    assert.doesNotMatch(content, /LIBRARY=.*\bself-refine\b/);
    assert.doesNotMatch(content, /LIBRARY=.*\btot\b/);
    assert.doesNotMatch(content, /LIBRARY=.*\blats\b/);
    assert.doesNotMatch(content, /LIBRARY=.*\bmetagpt\b/);
    assert.doesNotMatch(content, /LIBRARY=.*\bchatdev\b/);
  });
});

describe("R28/R29/R30: scoped files schema and tree ledger setup", () => {
  const OP = "interpreters/7-meta-framework/a-aflow-lite/operators/aflow-lite.md";
  test("preamble lists scoped files: tree.md, task.md, max_iterations.md, uct_c.md, iter_count.md, benchmark_items.md, state-<id>.md", () => {
    const content = readFileSync(resolve(REPO, OP), "utf-8");
    for (const f of ["tree.md", "task.md", "max_iterations.md", "uct_c.md", "iter_count.md", "benchmark_items.md", "state-"]) {
      assert.match(content, new RegExp(f.replace(".", "\\.").replace("-", "\\-")), `preamble missing scoped/${f}`);
    }
  });
});

describe("R36/R50: Initialize loads fixture and samples 3 items deterministically", () => {
  const OP = "interpreters/7-meta-framework/a-aflow-lite/operators/aflow-lite.md";
  test("Initialize instruction matches state empty", () => {
    const content = readFileSync(resolve(REPO, OP), "utf-8");
    assert.match(content, /## Instruction: Initialize/);
    assert.match(content, /MEMORY state is "empty"/);
  });
  test("Initialize loads workspace/gsm8k.jsonl", () => {
    const content = readFileSync(resolve(REPO, OP), "utf-8");
    assert.match(content, /workspace\/gsm8k\.jsonl/);
  });
  test("Initialize writes max_iterations=10, uct_c≈1.41421356, iter_count=0", () => {
    const content = readFileSync(resolve(REPO, OP), "utf-8");
    assert.match(content, /max_iterations\.md.*10|10.*max_iterations\.md/s);
    assert.match(content, /1\.41421356/);
    assert.match(content, /iter_count\.md.*0|0.*iter_count\.md/s);
  });
  test("Initialize samples 3 items and persists to scoped/benchmark_items.md", () => {
    const content = readFileSync(resolve(REPO, OP), "utf-8");
    assert.match(content, /benchmark_items\.md/);
    // Some indication of 3-item sampling
    assert.match(content, /\b3\b/);
  });
  test("Initialize creates root n0 (empty workflow) and transitions to selecting", () => {
    const content = readFileSync(resolve(REPO, OP), "utf-8");
    assert.match(content, /n0/);
    assert.match(content, /state-n0\.md/);
    assert.match(content, /selecting/);
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
