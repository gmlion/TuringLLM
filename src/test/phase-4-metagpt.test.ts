import { test, describe } from "node:test";
import { strict as assert } from "node:assert";
import { existsSync, readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO = resolve(__dirname, "../..");
const INTERP = resolve(REPO, "interpreters/mas-papers/5-fixed-sop-teams/a-metagpt");

describe("phase-4 a-metagpt: layout, roles, evaluate reuse", () => {
  test("required files exist", () => {
    for (const f of [
      "INSTRUCTIONS.md",
      "PROGRAM.md",
      "README.md",
      "operators/role-pm.md",
      "operators/role-architect.md",
      "operators/role-engineer.md",
      "operators/role-qa.md",
      "operators/evaluate.md",
    ]) {
      assert.ok(existsSync(resolve(INTERP, f)), `${f} missing`);
    }
  });

  test("strategy walks PM → Architect → Engineer → QA", () => {
    const s = readFileSync(resolve(INTERP, "operators/metagpt.md"), "utf-8");
    for (const dyn of ["role-pm.md", "role-architect.md", "role-engineer.md", "role-qa.md"]) {
      assert.match(s, new RegExp(dyn), `strategy missing push of ${dyn}`);
    }
  });

  test("strategy uses Push-Args to forward typed hand-offs", () => {
    const s = readFileSync(resolve(INTERP, "operators/metagpt.md"), "utf-8");
    // Architect receives {{prd}}, Engineer receives {{design}}, QA receives {{tasks}}.
    assert.match(s, /\{\{prd\}\}/);
    assert.match(s, /\{\{design\}\}/);
    assert.match(s, /\{\{tasks\}\}/);
  });

  test("role-qa pushes evaluate.md", () => {
    const qa = readFileSync(resolve(INTERP, "operators/role-qa.md"), "utf-8");
    assert.match(qa, /operators\/evaluate\.md/);
  });

  test("evaluate.md byte-equal to b-evaluator-optimizer copy", () => {
    const a = readFileSync(resolve(INTERP, "operators/evaluate.md"));
    const b = readFileSync(resolve(REPO, "interpreters/mas-papers/1-iterative-refinement/b-evaluator-optimizer/operators/evaluate.md"));
    assert.ok(a.equals(b), "evaluate.md in a-metagpt diverged from Phase 1b copy");
  });

  test("role dynamics emit the typed hand-off sections via Return", () => {
    const pm = readFileSync(resolve(INTERP, "operators/role-pm.md"), "utf-8");
    const ar = readFileSync(resolve(INTERP, "operators/role-architect.md"), "utf-8");
    const en = readFileSync(resolve(INTERP, "operators/role-engineer.md"), "utf-8");
    const qa = readFileSync(resolve(INTERP, "operators/role-qa.md"), "utf-8");
    assert.match(pm, /## Return[\s\S]*prd:/);
    assert.match(ar, /## Return[\s\S]*design:/);
    assert.match(en, /## Return[\s\S]*tasks:/);
    assert.match(qa, /## Return[\s\S]*review:/);
  });
});

describe("phase-7 a-metagpt: canonical operator migration (R20, R21, R22, R23, R24, R25, R27, R45, R46, R47)", () => {
  test("INSTRUCTIONS.md is a single-line marker pointing at operators/metagpt.md (R21, R46)", () => {
    const inst = readFileSync(resolve(INTERP, "INSTRUCTIONS.md"), "utf-8").trim();
    assert.equal(inst, "operators/metagpt.md");
  });

  test("operators/metagpt.md exists (R22)", () => {
    assert.ok(existsSync(resolve(INTERP, "operators/metagpt.md")), "operators/metagpt.md missing");
  });

  test("operators/metagpt.md has bimodal header (# Operator:) and # Sub-instructions (R20, R22, R45)", () => {
    const s = readFileSync(resolve(INTERP, "operators/metagpt.md"), "utf-8");
    assert.match(s, /^# Operator:/m);
    assert.match(s, /^# Sub-instructions/m);
  });

  test("operators/metagpt.md uses canonical placeholders {{task}} + {{prior_answer}}; no {{program}} (R47)", () => {
    const s = readFileSync(resolve(INTERP, "operators/metagpt.md"), "utf-8");
    assert.match(s, /\{\{task\}\}/);
    assert.match(s, /\{\{prior_answer\}\}/);
    assert.doesNotMatch(s, /\{\{program\}\}/);
  });

  test("operators/metagpt.md Initialize has no dual-mode detect block (R47)", () => {
    const s = readFileSync(resolve(INTERP, "operators/metagpt.md"), "utf-8");
    const initM = s.match(/^## Instruction:\s*Initialize\b([\s\S]*?)(?=^## Instruction:|^# Sub-instructions)/m);
    const init = initM ? initM[1] : "";
    assert.doesNotMatch(init, /grep.*\{\{task\}\}/);
  });

  test("operators/metagpt.md Initialize does NOT hardcode cat ../../PROGRAM.md (R23)", () => {
    const s = readFileSync(resolve(INTERP, "operators/metagpt.md"), "utf-8");
    const initM = s.match(/^## Instruction:\s*Initialize\b([\s\S]*?)(?=^## Instruction:|^# Sub-instructions)/m);
    const init = initM ? initM[1] : "";
    assert.doesNotMatch(init, /cat\s+\.\.\/\.\.\/PROGRAM\.md/);
  });

  test("operators/metagpt.md Finish preserves ## Review AND adds ## Return answer: (R23, R24)", () => {
    const s = readFileSync(resolve(INTERP, "operators/metagpt.md"), "utf-8");
    const finishM = s.match(/^## Instruction:\s*Finish\b([\s\S]*?)(?=^## Instruction:|^# Sub-instructions)/m);
    const finish = finishM ? finishM[1] : "";
    assert.match(finish, /## Review/);
    assert.match(finish, /## Return\s*\n\s*answer:/);
  });

  test("operators/metagpt.md internal sub-pushes use operators/ paths (R25)", () => {
    const s = readFileSync(resolve(INTERP, "operators/metagpt.md"), "utf-8");
    assert.match(s, /## Push\s*\n\s*operators\/role-pm\.md/);
    assert.match(s, /## Push\s*\n\s*operators\/role-architect\.md/);
    assert.match(s, /## Push\s*\n\s*operators\/role-engineer\.md/);
    assert.match(s, /## Push\s*\n\s*operators\/role-qa\.md/);
  });

  test("operators/metagpt.md documents both bootstrap and library-call usage (R27)", () => {
    const s = readFileSync(resolve(INTERP, "operators/metagpt.md"), "utf-8");
    assert.match(s, /bootstrap/i);
    assert.match(s, /meta-framework|aflow|library operator/i);
  });

  test("operators/metagpt.md Sub-instructions section is empty (this operator needs none)", () => {
    const s = readFileSync(resolve(INTERP, "operators/metagpt.md"), "utf-8");
    const idx = s.search(/^# Sub-instructions/m);
    assert.ok(idx >= 0, "# Sub-instructions section missing");
    const sub = s.slice(idx).replace(/^# Sub-instructions\s*\n/, "").trim();
    assert.match(sub, /\(none/, `sub-instructions section should declare "(none …)", got: ${sub.slice(0, 80)}`);
  });
});
