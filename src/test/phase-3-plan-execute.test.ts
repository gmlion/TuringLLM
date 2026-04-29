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
      "dynamics/tackle.md",
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

  test("strategy is a thin shim: only Initialize and Finish instructions", () => {
    const s = readFileSync(resolve(INTERP, "INSTRUCTIONS.md"), "utf-8");
    assert.match(s, /## Instruction: Initialize/);
    assert.match(s, /## Instruction: Finish/);
    assert.match(s, /state is "empty"/);
    assert.match(s, /state is "tackling_completed"/);
    // Finish sets state to "done"; the shell halts on the well-known state.
    assert.match(s, /state to "done"|set state to "done"/i);
  });

  test("Initialize pushes tackle.md with the user goal", () => {
    const s = readFileSync(resolve(INTERP, "INSTRUCTIONS.md"), "utf-8");
    assert.match(s, /## Push[\s\S]*dynamics\/tackle\.md/);
    assert.match(s, /goal:\s*\|/);
  });

  test("plan.md is one-shot decomposer: declares empty + done, returns 'plan', no replan logic", () => {
    const p = readFileSync(resolve(INTERP, "dynamics/plan.md"), "utf-8");
    assert.match(p, /state is "empty"/);
    assert.match(p, /^done$/m);
    assert.match(p, /\{\{goal\}\}/);
    assert.match(p, /## Return\n[\s\S]*\bplan:/);
    // No replan / results_so_far parameter — pure decomposition only.
    assert.doesNotMatch(p, /\{\{results_so_far\}\}/);
    assert.doesNotMatch(p, /REPLAN-TRIGGER/);
  });

  test("tackle.md declares the recursive 4-instruction state machine and returns 'result'", () => {
    const t = readFileSync(resolve(INTERP, "dynamics/tackle.md"), "utf-8");
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

  test("tackle.md Try uses single-tool-call as the atomic-vs-composite heuristic", () => {
    const t = readFileSync(resolve(INTERP, "dynamics/tackle.md"), "utf-8");
    assert.match(t, /SINGLE tool call|single tool call/i);
    assert.match(t, /assess[\s\S]{0,200}before/i);
  });

  test("tackle.md composite path pushes plan.md and recursive iterations push tackle.md", () => {
    const t = readFileSync(resolve(INTERP, "dynamics/tackle.md"), "utf-8");
    // Composite path -> plan.md
    assert.match(t, /## Push[\s\S]*dynamics\/plan\.md/);
    // Iterate / Continue -> recursive tackle.md
    assert.match(t, /## Push[\s\S]*dynamics\/tackle\.md/);
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
