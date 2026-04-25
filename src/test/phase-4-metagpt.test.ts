import { test, describe } from "node:test";
import { strict as assert } from "node:assert";
import { existsSync, readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO = resolve(__dirname, "../..");
const INTERP = resolve(REPO, "interpreters/5-fixed-sop-teams/a-metagpt");

describe("phase-4 a-metagpt: layout, roles, evaluate reuse", () => {
  test("required files exist", () => {
    for (const f of [
      "INSTRUCTIONS.md",
      "PROGRAM.md",
      "README.md",
      "dynamics/role-pm.md",
      "dynamics/role-architect.md",
      "dynamics/role-engineer.md",
      "dynamics/role-qa.md",
      "dynamics/evaluate.md",
    ]) {
      assert.ok(existsSync(resolve(INTERP, f)), `${f} missing`);
    }
  });

  test("strategy walks PM → Architect → Engineer → QA", () => {
    const s = readFileSync(resolve(INTERP, "INSTRUCTIONS.md"), "utf-8");
    for (const dyn of ["role-pm.md", "role-architect.md", "role-engineer.md", "role-qa.md"]) {
      assert.match(s, new RegExp(dyn), `strategy missing push of ${dyn}`);
    }
  });

  test("strategy uses Push-Args to forward typed hand-offs", () => {
    const s = readFileSync(resolve(INTERP, "INSTRUCTIONS.md"), "utf-8");
    // Architect receives {{prd}}, Engineer receives {{design}}, QA receives {{tasks}}.
    assert.match(s, /\{\{prd\}\}/);
    assert.match(s, /\{\{design\}\}/);
    assert.match(s, /\{\{tasks\}\}/);
  });

  test("role-qa pushes evaluate.md", () => {
    const qa = readFileSync(resolve(INTERP, "dynamics/role-qa.md"), "utf-8");
    assert.match(qa, /dynamics\/evaluate\.md/);
  });

  test("evaluate.md byte-equal to b-evaluator-optimizer copy", () => {
    const a = readFileSync(resolve(INTERP, "dynamics/evaluate.md"));
    const b = readFileSync(resolve(REPO, "interpreters/1-iterative-refinement/b-evaluator-optimizer/dynamics/evaluate.md"));
    assert.ok(a.equals(b), "evaluate.md in a-metagpt diverged from Phase 1b copy");
  });

  test("role dynamics emit the typed hand-off sections via Return", () => {
    const pm = readFileSync(resolve(INTERP, "dynamics/role-pm.md"), "utf-8");
    const ar = readFileSync(resolve(INTERP, "dynamics/role-architect.md"), "utf-8");
    const en = readFileSync(resolve(INTERP, "dynamics/role-engineer.md"), "utf-8");
    const qa = readFileSync(resolve(INTERP, "dynamics/role-qa.md"), "utf-8");
    assert.match(pm, /## Return[\s\S]*prd:/);
    assert.match(ar, /## Return[\s\S]*design:/);
    assert.match(en, /## Return[\s\S]*tasks:/);
    assert.match(qa, /## Return[\s\S]*code_review:/);
  });
});
