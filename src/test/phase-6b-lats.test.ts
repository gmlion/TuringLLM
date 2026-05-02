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

describe("phase-6b b-lats: strategy preamble (structural)", () => {
  const s = readFileSync(resolve(INTERP, "INSTRUCTIONS.md"), "utf-8");
  test("strategy is bounded by # Strategy / # Sub-instructions and is verbatim-required", () => {
    assert.match(s, /^# Strategy/m);
    assert.match(s, /^# Sub-instructions/m);
    assert.match(s, /VERBATIM/);
  });
});

describe("phase-6b b-lats: Initialize (R34, R35, R36)", () => {
  const s = readFileSync(resolve(INTERP, "INSTRUCTIONS.md"), "utf-8");
  const init = extractInstructionBody(s, "Initialize");

  test("Initialize copies PROGRAM.md to ./scoped/task.md (R34)", () => {
    assert.match(init, /cp\s+\.\.\/\.\.\/PROGRAM\.md\s+\.\/scoped\/task\.md/);
  });

  test("Initialize writes max_iterations=30, uct_c=1.41421356, iter_count=0 (R34)", () => {
    assert.match(init, /echo\s+30\b[^\n]*max_iterations\.md/);
    assert.match(init, /echo\s+1\.41421356\b[^\n]*uct_c\.md/);
    assert.match(init, /echo\s+0\b[^\n]*iter_count\.md/);
  });

  test("Initialize appends root n0 with q=0, n=0, status=live (R34)", () => {
    const m = init.match(/<< ROOT_EOF([\s\S]+?)ROOT_EOF/);
    assert.ok(m, "Initialize must contain a ROOT_EOF heredoc");
    const body = m[1];
    for (const line of [
      /id:\s*n0/,
      /parent_id:\s*-/,
      /depth:\s*0/,
      /q:\s*0/,
      /n:\s*0/,
      /status:\s*live/,
    ]) {
      assert.match(body, line);
    }
  });

  test("Initialize creates empty ./scoped/state-n0.md (R34)", () => {
    assert.match(init, />\s*\.\/scoped\/state-n0\.md/);
  });

  test("Initialize transitions to selecting (R35)", () => {
    assert.match(init, /## State\s*\n\s*selecting/);
  });

  test("Initialize does NOT validate PROGRAM.md (R36)", () => {
    assert.doesNotMatch(init, /grep\s+-oE\s+'\\b\[0-9\]/);
    assert.doesNotMatch(init, /waiting_for_user/);
  });
});

describe("phase-6b b-lats: tree ledger primitives (R37, R38, R39, R40, R41)", () => {
  const s = readFileSync(resolve(INTERP, "INSTRUCTIONS.md"), "utf-8");

  test("strategy preamble documents the six required ledger keys (R38)", () => {
    for (const k of ["id", "parent_id", "depth", "q", "n", "status"]) {
      assert.match(s, new RegExp(`\\b${k}\\b`));
    }
  });

  test("status enum is {live, terminal_pass, terminal_fail} — no 'pruned' (R41, R78)", () => {
    for (const v of ["live", "terminal_pass", "terminal_fail"]) {
      assert.match(s, new RegExp(`\\b${v}\\b`));
    }
    assert.doesNotMatch(s, /status:\s*pruned/);
  });

  test("monotonic id primitive uses grep -c '^id: n' (R40)", () => {
    assert.match(s, /grep\s+-c\s+'\^id:\s*n'/);
  });

  test("INSTRUCTIONS.md uses awk-based surgical edits (R39)", () => {
    const initBody = extractInstructionBody(s, "Initialize");
    const sWithoutInit = s.replace(initBody, "");
    assert.doesNotMatch(sWithoutInit, /cat\s*>\s*\.\/scoped\/tree\.md\b/);
    assert.match(s, /awk[^\n]*tree\.md\.tmp/);
  });

  test("per-node state files referenced (R42, R43)", () => {
    assert.match(s, /\.\/scoped\/state-/);
  });
});
