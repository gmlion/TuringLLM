import { test, describe } from "node:test";
import { strict as assert } from "node:assert";
import { existsSync, readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO = resolve(__dirname, "../..");
const INTERP = resolve(REPO, "interpreters/mas-papers/5-fixed-sop-teams/b-chatdev");

describe("phase-4 b-chatdev: layout, dialogue, PROGRAM parity", () => {
  test("required files exist (interpreter + roles/)", () => {
    for (const f of [
      "INSTRUCTIONS.md",
      "PROGRAM.md",
      "README.md",
      "operators/chatdev.md",
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
    const a = readFileSync(resolve(REPO, "interpreters/mas-papers/5-fixed-sop-teams/a-metagpt/PROGRAM.md"));
    const b = readFileSync(resolve(INTERP, "PROGRAM.md"));
    assert.ok(a.equals(b), "PROGRAM.md diverged between a-metagpt and b-chatdev");
  });

  test("strategy walks four phases (design, coding, testing, documenting)", () => {
    const s = readFileSync(resolve(INTERP, "operators/chatdev.md"), "utf-8");
    for (const phase of ["design", "coding", "testing", "documenting"]) {
      assert.match(s, new RegExp(phase, "i"), `strategy missing phase: ${phase}`);
    }
  });

  test("strategy pushes dialogue.md with correct participant pairs", () => {
    const s = readFileSync(resolve(INTERP, "operators/chatdev.md"), "utf-8");
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
    const b = readFileSync(resolve(REPO, "interpreters/mas-papers/1-iterative-refinement/b-evaluator-optimizer/operators/evaluate.md"));
    assert.ok(a.equals(b), "evaluate.md in b-chatdev diverged from Phase 1b copy");
  });

  test("README cites ChatDev and is Phase-1-leaf-style", () => {
    const r = readFileSync(resolve(INTERP, "README.md"), "utf-8");
    assert.match(r, /ChatDev/);
    assert.match(r, /Qian/);
  });
});

describe("phase-7 b-chatdev: canonical operator migration (R20, R21, R22, R23, R24, R25, R27, R45, R46, R47)", () => {
  test("INSTRUCTIONS.md is a single-line marker pointing at operators/chatdev.md (R21, R46)", () => {
    const inst = readFileSync(resolve(INTERP, "INSTRUCTIONS.md"), "utf-8").trim();
    assert.equal(inst, "operators/chatdev.md");
  });

  test("operators/chatdev.md exists (R22)", () => {
    assert.ok(existsSync(resolve(INTERP, "operators/chatdev.md")), "operators/chatdev.md missing");
  });

  test("operators/chatdev.md has bimodal header (# Operator:) and # Sub-instructions (R20, R22, R45)", () => {
    const s = readFileSync(resolve(INTERP, "operators/chatdev.md"), "utf-8");
    assert.match(s, /^# Operator:/m);
    assert.match(s, /^# Sub-instructions/m);
  });

  test("operators/chatdev.md uses canonical placeholders {{task}} + {{prior_answer}}; no {{program}} (R47)", () => {
    const s = readFileSync(resolve(INTERP, "operators/chatdev.md"), "utf-8");
    assert.match(s, /\{\{task\}\}/);
    assert.match(s, /\{\{prior_answer\}\}/);
    assert.doesNotMatch(s, /\{\{program\}\}/);
  });

  test("operators/chatdev.md Initialize has no dual-mode detect block (R47)", () => {
    const s = readFileSync(resolve(INTERP, "operators/chatdev.md"), "utf-8");
    const initM = s.match(/^## Instruction:\s*Initialize\b([\s\S]*?)(?=^## Instruction:|^# Sub-instructions)/m);
    const init = initM ? initM[1] : "";
    assert.doesNotMatch(init, /grep.*\{\{task\}\}/);
  });

  test("operators/chatdev.md Initialize does NOT hardcode cat ../../PROGRAM.md (R23)", () => {
    const s = readFileSync(resolve(INTERP, "operators/chatdev.md"), "utf-8");
    const initM = s.match(/^## Instruction:\s*Initialize\b([\s\S]*?)(?=^## Instruction:|^# Sub-instructions)/m);
    const init = initM ? initM[1] : "";
    assert.doesNotMatch(init, /cat\s+\.\.\/\.\.\/PROGRAM\.md/);
  });

  test("operators/chatdev.md Finish adds ## Return answer: pointing at documentation output (R23, R24)", () => {
    const s = readFileSync(resolve(INTERP, "operators/chatdev.md"), "utf-8");
    const finishM = s.match(/^## Instruction:\s*Finish\b([\s\S]*?)(?=^## Instruction:|^# Sub-instructions)/m);
    const finish = finishM ? finishM[1] : "";
    assert.match(finish, /## Return\s*\n\s*answer:/);
  });

  test("operators/chatdev.md internal sub-pushes use operators/ paths (R25)", () => {
    const s = readFileSync(resolve(INTERP, "operators/chatdev.md"), "utf-8");
    assert.match(s, /## Push\s*\n\s*operators\/dialogue\.md/);
  });

  test("operators/chatdev.md documents both bootstrap and library-call usage (R27)", () => {
    // After the {{task}}-canonical refactor there are no separate modes;
    // the same operator works both standalone (bootstrap-loaded) and as
    // a library operator pushed by a meta-framework. The header prose
    // should still mention both usages.
    const s = readFileSync(resolve(INTERP, "operators/chatdev.md"), "utf-8");
    assert.match(s, /bootstrap/i);
    assert.match(s, /meta-framework|aflow|library operator/i);
  });

  test("operators/chatdev.md Sub-instructions section is empty (this operator needs none)", () => {
    const s = readFileSync(resolve(INTERP, "operators/chatdev.md"), "utf-8");
    const idx = s.search(/^# Sub-instructions/m);
    assert.ok(idx >= 0, "# Sub-instructions section missing");
    const sub = s.slice(idx).replace(/^# Sub-instructions\s*\n/, "").trim();
    assert.match(sub, /\(none/, `sub-instructions section should declare "(none …)", got: ${sub.slice(0, 80)}`);
  });
});
