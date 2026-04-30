import { test, describe } from "node:test";
import { strict as assert } from "node:assert";
import { existsSync, readFileSync, readdirSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO = resolve(__dirname, "../..");
const GROUP = resolve(REPO, "interpreters/3-search");
const INTERP = resolve(GROUP, "a-tot");

describe("phase-6 a-tot: directory layout (R1)", () => {
  test("group dir interpreters/3-search/ exists", () => {
    assert.ok(existsSync(GROUP), "group directory missing");
  });
  test("interpreter dir interpreters/3-search/a-tot/ exists (R1)", () => {
    assert.ok(existsSync(INTERP), "interpreter directory missing");
  });
  test("interpreter has INSTRUCTIONS.md, PROGRAM.md, README.md, dynamics/ (R1)", () => {
    for (const f of ["INSTRUCTIONS.md", "PROGRAM.md", "README.md"]) {
      assert.ok(existsSync(resolve(INTERP, f)), `${f} missing`);
    }
    assert.ok(existsSync(resolve(INTERP, "dynamics")), "dynamics/ missing");
  });
});

describe("phase-6 a-tot: group README (R2)", () => {
  test("group README at interpreters/3-search/README.md exists", () => {
    assert.ok(existsSync(resolve(GROUP, "README.md")), "group README missing");
  });
  test("group README mentions ToT (shipped), GoT (deferred), LATS (Phase 6b)", () => {
    const s = readFileSync(resolve(GROUP, "README.md"), "utf-8");
    assert.match(s, /Tree of Thoughts|ToT/);
    assert.match(s, /Graph of Thoughts|GoT/);
    assert.match(s, /LATS/);
  });
  test("group README cites Yao et al. and Besta et al. and Zhou et al.", () => {
    const s = readFileSync(resolve(GROUP, "README.md"), "utf-8");
    assert.match(s, /Yao\s+et\s+al/i);
    assert.match(s, /Besta\s+et\s+al/i);
    assert.match(s, /Zhou\s+et\s+al/i);
  });
});

describe("phase-6 a-tot: evaluate.md reuse (R45)", () => {
  test("dynamics/evaluate.md exists in a-tot", () => {
    assert.ok(
      existsSync(resolve(INTERP, "dynamics/evaluate.md")),
      "evaluate.md missing in a-tot/dynamics/",
    );
  });
  test("dynamics/evaluate.md is byte-equal to canonical 1b copy (R45)", () => {
    const canon = readFileSync(
      resolve(REPO, "interpreters/1-iterative-refinement/b-evaluator-optimizer/dynamics/evaluate.md"),
    );
    const here = readFileSync(resolve(INTERP, "dynamics/evaluate.md"));
    assert.ok(canon.equals(here), "evaluate.md diverged from canonical");
  });
});

function escapeRegExp(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function extractInstructionBody(src: string, name: string): string {
  const startRe = new RegExp(`^## Instruction:\\s*${escapeRegExp(name)}\\b`, "m");
  const m = src.match(startRe);
  if (!m) return "";
  const start = m.index! + m[0].length;
  const rest = src.slice(start);
  const endRe = /^(## Instruction:|# Sub-instructions)/m;
  const e = rest.match(endRe);
  return e ? rest.slice(0, e.index!) : rest;
}

describe("phase-6 a-tot: strategy preamble (structural)", () => {
  test("strategy is bounded by # Strategy / # Sub-instructions and is verbatim-required", () => {
    const s = readFileSync(resolve(INTERP, "INSTRUCTIONS.md"), "utf-8");
    assert.match(s, /^# Strategy/m);
    assert.match(s, /^# Sub-instructions/m);
    assert.match(s, /VERBATIM into every update_instructions call/);
  });
});

describe("phase-6 a-tot: Initialize instruction (R5–R9)", () => {
  test("Initialize matches state == empty (R5)", () => {
    const s = readFileSync(resolve(INTERP, "INSTRUCTIONS.md"), "utf-8");
    const init = extractInstructionBody(s, "Initialize");
    assert.ok(init.length > 0, "Initialize instruction missing");
    assert.match(init, /MEMORY state is "empty"/);
  });
  test("Initialize references PROGRAM.md (R5)", () => {
    const s = readFileSync(resolve(INTERP, "INSTRUCTIONS.md"), "utf-8");
    const init = extractInstructionBody(s, "Initialize");
    assert.match(init, /\.\.\/\.\.\/PROGRAM\.md/);
  });
  test("Initialize handles insufficient input via Pending Questions + waiting_for_user (R6)", () => {
    const s = readFileSync(resolve(INTERP, "INSTRUCTIONS.md"), "utf-8");
    const init = extractInstructionBody(s, "Initialize");
    assert.match(init, /## Pending Questions/);
    assert.match(init, /waiting_for_user/);
  });
  test("Initialize writes scoped/{numbers,target,max_depth,current_depth}.md (R7)", () => {
    const s = readFileSync(resolve(INTERP, "INSTRUCTIONS.md"), "utf-8");
    const init = extractInstructionBody(s, "Initialize");
    for (const f of ["numbers.md", "target.md", "max_depth.md", "current_depth.md"]) {
      assert.match(init, new RegExp(`scoped/${escapeRegExp(f)}`), `Initialize missing scoped/${f}`);
    }
  });
  test("Initialize derives max_depth = N − 1 (R7)", () => {
    const s = readFileSync(resolve(INTERP, "INSTRUCTIONS.md"), "utf-8");
    const init = extractInstructionBody(s, "Initialize");
    assert.match(init, /N\s*-\s*1|count\s*-\s*1|wc\s+-w/);
  });
  test("Initialize appends root node n0 with parent_id=- depth=0 status=live (R8)", () => {
    const s = readFileSync(resolve(INTERP, "INSTRUCTIONS.md"), "utf-8");
    const init = extractInstructionBody(s, "Initialize");
    assert.match(init, /id:\s*n0/);
    assert.match(init, /parent_id:\s*-/);
    assert.match(init, /depth:\s*0/);
    assert.match(init, /status:\s*live/);
  });
  test("Initialize transitions to expanding with current_depth 0 (R9)", () => {
    const s = readFileSync(resolve(INTERP, "INSTRUCTIONS.md"), "utf-8");
    const init = extractInstructionBody(s, "Initialize");
    assert.match(init, /## State\s*\n\s*expanding/);
  });
});
