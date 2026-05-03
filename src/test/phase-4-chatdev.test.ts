import { test, describe } from "node:test";
import { strict as assert } from "node:assert";
import { existsSync, readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO = resolve(__dirname, "../..");
const INTERP = resolve(REPO, "interpreters/5-fixed-sop-teams/b-chatdev");

describe("phase-4 b-chatdev: layout, dialogue, PROGRAM parity", () => {
  test("required files exist (interpreter + roles/)", () => {
    for (const f of [
      "INSTRUCTIONS.md",
      "PROGRAM.md",
      "README.md",
      "operators/dialogue.md",
      "operators/evaluate.md",
      "roles/ceo.md",
      "roles/cto.md",
      "roles/coder.md",
      "roles/reviewer.md",
      "roles/tester.md",
      "roles/writer.md",
    ]) {
      assert.ok(existsSync(resolve(INTERP, f)), `${f} missing`);
    }
  });

  test("PROGRAM.md is byte-equal to a-metagpt/PROGRAM.md (R22)", () => {
    const a = readFileSync(resolve(REPO, "interpreters/5-fixed-sop-teams/a-metagpt/PROGRAM.md"));
    const b = readFileSync(resolve(INTERP, "PROGRAM.md"));
    assert.ok(a.equals(b), "PROGRAM.md diverged between a-metagpt and b-chatdev");
  });

  test("strategy walks four phases (design, coding, testing, documenting)", () => {
    const s = readFileSync(resolve(INTERP, "INSTRUCTIONS.md"), "utf-8");
    for (const phase of ["design", "coding", "testing", "documenting"]) {
      assert.match(s, new RegExp(phase, "i"), `strategy missing phase: ${phase}`);
    }
  });

  test("strategy pushes dialogue.md with correct participant pairs", () => {
    const s = readFileSync(resolve(INTERP, "INSTRUCTIONS.md"), "utf-8");
    // design: ceo+cto (no reviewer) → acceptance=false
    // coding/testing/documenting pair with reviewer → acceptance=true
    assert.match(s, /ceo.*cto|cto.*ceo/);
    assert.match(s, /coder.*reviewer|reviewer.*coder/);
    assert.match(s, /tester.*reviewer|reviewer.*tester/);
    assert.match(s, /writer.*reviewer|reviewer.*writer/);
  });

  test("dialogue.md honours acceptance flag by pushing evaluate.md", () => {
    const d = readFileSync(resolve(INTERP, "operators/dialogue.md"), "utf-8");
    assert.match(d, /\{\{participants\}\}/);
    assert.match(d, /\{\{topic\}\}/);
    assert.match(d, /\{\{acceptance\}\}/);
    assert.match(d, /operators\/evaluate\.md/);
  });

  test("evaluate.md byte-equal to Phase 1b copy", () => {
    const a = readFileSync(resolve(INTERP, "operators/evaluate.md"));
    const b = readFileSync(resolve(REPO, "interpreters/1-iterative-refinement/b-evaluator-optimizer/operators/evaluate.md"));
    assert.ok(a.equals(b), "evaluate.md in b-chatdev diverged from Phase 1b copy");
  });

  test("README cites ChatDev and is Phase-1-leaf-style", () => {
    const r = readFileSync(resolve(INTERP, "README.md"), "utf-8");
    assert.match(r, /ChatDev/);
    assert.match(r, /Qian/);
  });
});
