import { test, describe } from "node:test";
import { strict as assert } from "node:assert";
import { existsSync, readFileSync, readdirSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO = resolve(__dirname, "../..");
const GROUP = resolve(REPO, "interpreters/3-search");
const INTERP = resolve(GROUP, "b-lats");

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

describe("phase-6b b-lats: directory layout (R1, R4, R5)", () => {
  test("interpreter dir interpreters/3-search/b-lats/ exists (R1)", () => {
    assert.ok(existsSync(INTERP), "interpreter directory missing");
  });
  test("interpreter has INSTRUCTIONS.md, PROGRAM.md, README.md, dynamics/ (R1)", () => {
    for (const f of ["INSTRUCTIONS.md", "PROGRAM.md", "README.md"]) {
      assert.ok(existsSync(resolve(INTERP, f)), `${f} missing`);
    }
    assert.ok(existsSync(resolve(INTERP, "dynamics")), "dynamics/ missing");
  });
  test("dynamics/ does NOT contain score.md (R5, R77)", () => {
    assert.ok(!existsSync(resolve(INTERP, "dynamics/score.md")),
      "score.md must NOT be shipped in b-lats/dynamics/");
  });
});

describe("phase-6b b-lats: group README delta (R2)", () => {
  const groupReadme = readFileSync(resolve(GROUP, "README.md"), "utf-8");
  test("group README lists b-lats as Shipped (R2)", () => {
    assert.match(groupReadme, /b-lats/);
    assert.match(groupReadme, /Shipped\s*\(Phase\s*6b\)/);
  });
  test("group README cites Zhou et al. arXiv:2310.04406 (R2)", () => {
    assert.match(groupReadme, /Zhou\s+et\s+al/i);
    assert.match(groupReadme, /2310\.04406/);
  });
});

describe("phase-6b b-lats: reused dynamics byte-equality (R6, R7, R8)", () => {
  test("dynamics/expand-node.md is byte-equal to a-tot post-refactor copy (R6)", () => {
    const canon = readFileSync(resolve(REPO, "interpreters/3-search/a-tot/dynamics/expand-node.md"));
    const here = readFileSync(resolve(INTERP, "dynamics/expand-node.md"));
    assert.ok(canon.equals(here), "expand-node.md diverged from a-tot canonical");
  });
  test("dynamics/evaluate.md is byte-equal to canonical 1b copy (R7)", () => {
    const canon = readFileSync(resolve(REPO, "interpreters/1-iterative-refinement/b-evaluator-optimizer/dynamics/evaluate.md"));
    const here = readFileSync(resolve(INTERP, "dynamics/evaluate.md"));
    assert.ok(canon.equals(here), "evaluate.md diverged from canonical");
  });
  test("dynamics/reflect.md is byte-equal to canonical 1c copy (R8)", () => {
    const canon = readFileSync(resolve(REPO, "interpreters/1-iterative-refinement/c-reflexion/dynamics/reflect.md"));
    const here = readFileSync(resolve(INTERP, "dynamics/reflect.md"));
    assert.ok(canon.equals(here), "reflect.md diverged from canonical");
  });
});

describe("phase-6b b-lats: demo PROGRAM.md (R69)", () => {
  test("b-lats/PROGRAM.md is byte-equal to a-tot/PROGRAM.md (R69)", () => {
    const canon = readFileSync(resolve(REPO, "interpreters/3-search/a-tot/PROGRAM.md"));
    const here  = readFileSync(resolve(INTERP, "PROGRAM.md"));
    assert.ok(canon.equals(here), "PROGRAM.md diverged from a-tot");
  });
});

describe("phase-6b b-lats: rollout.md dynamic (R10, R11, R12, R13)", () => {
  const path = resolve(INTERP, "dynamics/rollout.md");

  test("dynamics/rollout.md exists", () => {
    assert.ok(existsSync(path), "rollout.md missing");
  });

  test("rollout.md declares only {{partial_state}} and {{task}} push-args (R10)", () => {
    const s = readFileSync(path, "utf-8");
    assert.match(s, /\{\{partial_state\}\}/);
    assert.match(s, /\{\{task\}\}/);
    assert.doesNotMatch(s, /\{\{target\}\}/);
    assert.doesNotMatch(s, /\{\{numbers_remaining\}\}/);
    assert.doesNotMatch(s, /\{\{thought\}\}/);
    assert.doesNotMatch(s, /\{\{parent_thought\}\}/);
  });

  test("rollout.md is single-cycle (## Instruction count == 1) (R11)", () => {
    const s = readFileSync(path, "utf-8");
    const matches = s.match(/^## Instruction:/gm) || [];
    assert.equal(matches.length, 1);
  });

  test("rollout.md returns ## State done + ## Return terminal_state: | (R11)", () => {
    const s = readFileSync(path, "utf-8");
    assert.match(s, /## State\s*\n\s*done/);
    assert.match(s, /## Return\s*\n\s*terminal_state:\s*\|/);
  });

  test("rollout.md does not push any further dynamic (R12)", () => {
    const s = readFileSync(path, "utf-8");
    assert.doesNotMatch(s, /^## Push\s*$/m);
  });

  test("rollout.md prose is domain-agnostic (R13)", () => {
    const s = readFileSync(path, "utf-8");
    for (const banned of [
      "Game of 24", "arithmetic", "numbers", "target",
      "maze", "code", "function", "test suite",
      "parent_thought", "numbers_remaining", "thought",
    ]) {
      assert.ok(!s.includes(banned), `rollout.md contains banned domain word: "${banned}"`);
    }
  });
});
