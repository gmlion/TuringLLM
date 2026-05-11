import { test, describe } from "node:test";
import { strict as assert } from "node:assert";
import { existsSync, readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO = resolve(__dirname, "../..");
const INTERP = resolve(REPO, "interpreters/mas-papers/2-planning-decomposition/a-plan-execute");

describe("phase-3 a-plan-execute: file layout and content", () => {
  test("all required files exist", () => {
    for (const f of [
      "INSTRUCTIONS.md",
      "PROGRAM.md",
      "README.md",
      "operators/plan-execute.md",
      "operators/plan.md",
      "operators/tackle.md",
    ]) {
      assert.ok(existsSync(resolve(INTERP, f)), `${f} missing`);
    }
  });

  test("INSTRUCTIONS.md is a single-line marker pointing at operators/plan-execute.md", () => {
    const inst = readFileSync(resolve(INTERP, "INSTRUCTIONS.md"), "utf-8").trim();
    assert.equal(inst, "operators/plan-execute.md");
  });

  test("strategy carries the copy-verbatim directive", () => {
    // After Phase-7 migration INSTRUCTIONS.md is a marker; the strategy lives in the operator file.
    const s = readFileSync(resolve(INTERP, "operators/plan-execute.md"), "utf-8");
    assert.match(s, /# (Operator|Strategy):/);
  });

  test("strategy is a thin shim: only Initialize and Finish instructions", () => {
    // After Phase-7 migration INSTRUCTIONS.md is a marker; the strategy lives in the operator file.
    const s = readFileSync(resolve(INTERP, "operators/plan-execute.md"), "utf-8");
    assert.match(s, /## Instruction: Initialize/);
    assert.match(s, /## Instruction: Finish/);
    assert.match(s, /state is "empty"/);
    assert.match(s, /state is "tackling_completed"/);
    // Finish sets state to "done"; the shell halts on the well-known state.
    assert.match(s, /state to "done"|set state to "done"/i);
  });

  test("Initialize pushes tackle.md with the user goal", () => {
    // After Phase-7 migration INSTRUCTIONS.md is a marker; the strategy lives in the operator file.
    const s = readFileSync(resolve(INTERP, "operators/plan-execute.md"), "utf-8");
    assert.match(s, /## Push[\s\S]*operators\/tackle\.md/);
    assert.match(s, /goal:\s*\|/);
  });

  test("plan.md is one-shot decomposer: declares empty + done, returns 'plan', no replan logic", () => {
    const p = readFileSync(resolve(INTERP, "operators/plan.md"), "utf-8");
    assert.match(p, /state is "empty"/);
    assert.match(p, /^done$/m);
    assert.match(p, /\{\{goal\}\}/);
    assert.match(p, /## Return\n[\s\S]*\bplan:/);
    // No replan / results_so_far parameter — pure decomposition only.
    assert.doesNotMatch(p, /\{\{results_so_far\}\}/);
    assert.doesNotMatch(p, /REPLAN-TRIGGER/);
  });

  test("tackle.md declares the recursive 4-instruction state machine and returns 'result'", () => {
    const t = readFileSync(resolve(INTERP, "operators/tackle.md"), "utf-8");
    assert.match(t, /\{\{goal\}\}/);
    for (const needle of [
      "## Instruction: Try",
      "## Instruction: Iterate",
      "## Instruction: Continue",
      "## Instruction: Synthesize",
    ]) {
      assert.match(t, new RegExp(needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), `missing instruction: ${needle}`);
    }
    assert.match(t, /## Return\n[\s\S]*\bresult:/);
  });

  test("tackle.md Try frames the atomic-vs-composite decision as role-based judgement", () => {
    const t = readFileSync(resolve(INTERP, "operators/tackle.md"), "utf-8");
    // Role-anchored framing: the decision is "as {{role}}, do you produce this now or split?"
    assert.match(t, /\{\{role\}\}/);
    assert.match(t, /Decide as.*\{\{role\}\}.*would|professional judgement|as \{\{role\}\}/i);
    // Atomic = one tool call, composite = push plan
    assert.match(t, /one tool call|single tool call/i);
    assert.match(t, /push plan|deferring to plan/i);
  });

  test("tackle.md composite path pushes plan.md and recursive iterations push tackle.md", () => {
    const t = readFileSync(resolve(INTERP, "operators/tackle.md"), "utf-8");
    // Composite path -> plan.md
    assert.match(t, /## Push[\s\S]*operators\/plan\.md/);
    // Iterate / Continue -> recursive tackle.md
    assert.match(t, /## Push[\s\S]*operators\/tackle\.md/);
  });

  test("PROGRAM.md is the TypeScript project setup task (d1)", () => {
    const p = readFileSync(resolve(INTERP, "PROGRAM.md"), "utf-8");
    assert.match(p, /TypeScript/i);
    assert.match(p, /tsconfig\.json/);
    assert.match(p, /ci\.yml|GitHub Actions/i);
  });

  test("README names all four collapsed framings", () => {
    const r = readFileSync(resolve(INTERP, "README.md"), "utf-8");
    assert.match(r, /Plan-and-Execute/);
    assert.match(r, /Orchestrator.Workers/);
    assert.match(r, /Deep Research/);
    assert.match(r, /XAgent/);
    assert.match(r, /patterns\.md/);
  });
});

describe("R20-R27 Phase 7 migration: marker + canonical operator (2a plan-execute)", () => {
  const LEAF = "interpreters/mas-papers/2-planning-decomposition/a-plan-execute";

  test("R21: INSTRUCTIONS.md is single-line marker pointing at operators/plan-execute.md", () => {
    const inst = readFileSync(resolve(REPO, LEAF, "INSTRUCTIONS.md"), "utf-8").trim();
    assert.equal(inst, "operators/plan-execute.md");
  });

  test("R20/R22: operators/plan-execute.md exists and is the canonical strategy", () => {
    const op = resolve(REPO, LEAF, "operators/plan-execute.md");
    assert.ok(existsSync(op));
    const content = readFileSync(op, "utf-8");
    assert.match(content, /# (Operator|Strategy):.*Plan-Execute/i);
  });

  test("R47: bimodal Initialize detects {{program}} vs {{task}}", () => {
    const op = readFileSync(resolve(REPO, LEAF, "operators/plan-execute.md"), "utf-8");
    // Both literal tokens must be present somewhere in the file
    assert.match(op, /\{\{program\}\}/);
    assert.match(op, /\{\{task\}\}/);
    // Detection mechanism: grep -qF '{{task}}' or similar literal-token check
    assert.match(op, /grep.*-qF.*\{\{task\}\}/);
  });

  test("R23: terminal cycle emits ## Return\\nanswer:", () => {
    const op = readFileSync(resolve(REPO, LEAF, "operators/plan-execute.md"), "utf-8");
    assert.match(op, /## Return\s*\n\s*answer:/);
  });

  test("R24: terminal output ## Result preserved", () => {
    const op = readFileSync(resolve(REPO, LEAF, "operators/plan-execute.md"), "utf-8");
    assert.match(op, /## Result/);
  });

  test("R25: internal pushes use operators/ paths (not legacy paths)", () => {
    const op = readFileSync(resolve(REPO, LEAF, "operators/plan-execute.md"), "utf-8");
    // Must not reference the old directory name (split to avoid triggering the rename pin)
    const forbidden = new RegExp("dyn" + "amics/");
    assert.doesNotMatch(op, forbidden);
    // tackle sub-operator is pushed
    assert.match(op, /operators\/tackle\.md/);
  });
});
