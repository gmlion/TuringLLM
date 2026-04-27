import { test, describe } from "node:test";
import { strict as assert } from "node:assert";
import { existsSync, readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO = resolve(__dirname, "../..");
const INTERP = resolve(REPO, "interpreters/2-planning-decomposition/a-plan-execute");

describe("phase-3 a-plan-execute: file layout and content", () => {
  test("all required files exist", () => {
    for (const f of [
      "INSTRUCTIONS.md",
      "PROGRAM.md",
      "README.md",
      "dynamics/plan.md",
      "dynamics/execute-step.md",
      "dynamics/synthesize.md",
    ]) {
      assert.ok(existsSync(resolve(INTERP, f)), `${f} missing`);
    }
  });

  test("strategy carries the copy-verbatim directive", () => {
    const s = readFileSync(resolve(INTERP, "INSTRUCTIONS.md"), "utf-8");
    assert.match(s, /IMPORTANT: Everything between "# Strategy" and "# Sub-instructions"/);
    assert.match(s, /# Strategy/);
    assert.match(s, /# Sub-instructions/);
  });

  test("strategy declares all six required state conditions", () => {
    const s = readFileSync(resolve(INTERP, "INSTRUCTIONS.md"), "utf-8");
    for (const needle of [
      'state is "empty"',
      'state is "planning_completed"',
      'state is "ready"',
      'state is "executing_completed"',
      'state is "synthesising_completed"',
      'state is "done"',
    ]) {
      assert.match(s, new RegExp(needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), `missing: ${needle}`);
    }
  });

  test("strategy Route instruction uses fuzzy NL condition (R40 a)", () => {
    const s = readFileSync(resolve(INTERP, "INSTRUCTIONS.md"), "utf-8");
    // Route after step inspects ## Step Result body; condition must be fuzzy.
    assert.match(s, /suggests|indicates|appears|is successful|looks|signals/i);
  });

  test("strategy has a non-blocking pending-questions branch (R40 b)", () => {
    const s = readFileSync(resolve(INTERP, "INSTRUCTIONS.md"), "utf-8");
    assert.match(s, /## Pending Questions/);
    assert.match(s, /non-blocking|without.*waiting_for_user|do not.*waiting_for_user/i);
  });

  test("plan.md declares empty + done states and returns 'plan'", () => {
    const p = readFileSync(resolve(INTERP, "dynamics/plan.md"), "utf-8");
    assert.match(p, /state is "empty"/);
    assert.match(p, /^done$/m);
    assert.match(p, /\{\{goal\}\}/);
    assert.match(p, /## Return\n[\s\S]*\bplan:/);
  });

  test("execute-step.md consumes current_step + context and returns outcome", () => {
    const e = readFileSync(resolve(INTERP, "dynamics/execute-step.md"), "utf-8");
    assert.match(e, /\{\{current_step\}\}/);
    assert.match(e, /\{\{context\}\}/);
    assert.match(e, /^done$/m);
    assert.match(e, /outcome:/);
  });

  test("execute-step.md documents needs_replan return path", () => {
    const e = readFileSync(resolve(INTERP, "dynamics/execute-step.md"), "utf-8");
    assert.match(e, /needs_replan/);
  });

  test("synthesize.md consumes results and returns report", () => {
    const y = readFileSync(resolve(INTERP, "dynamics/synthesize.md"), "utf-8");
    assert.match(y, /\{\{results\}\}/);
    assert.match(y, /^done$/m);
    assert.match(y, /report:/);
  });

  test("PROGRAM.md is the TypeScript project setup task (d1)", () => {
    const p = readFileSync(resolve(INTERP, "PROGRAM.md"), "utf-8");
    assert.match(p, /TypeScript/i);
    assert.match(p, /tsconfig\.json/);
    assert.match(p, /ci\.yml|GitHub Actions/i);
  });

  test("README names all four collapsed framings (R45 + R65)", () => {
    const r = readFileSync(resolve(INTERP, "README.md"), "utf-8");
    assert.match(r, /Plan-and-Execute/);
    assert.match(r, /Orchestrator.Workers/);
    assert.match(r, /Deep Research/);
    assert.match(r, /XAgent/);
    assert.match(r, /patterns\.md/);
  });
});
