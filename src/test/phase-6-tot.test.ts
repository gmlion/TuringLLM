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

describe("phase-6 a-tot: tree ledger contract (R10–R14)", () => {
  const s = readFileSync(resolve(INTERP, "INSTRUCTIONS.md"), "utf-8");

  test("INSTRUCTIONS.md declares all 8 required node-block keys (R11)", () => {
    for (const key of ["id:", "parent_id:", "depth:", "op:", "left:", "value:", "samples:", "status:"]) {
      assert.match(s, new RegExp(escapeRegExp(key)), `tree.md schema missing key ${key}`);
    }
  });

  test("INSTRUCTIONS.md declares the four status values (R14)", () => {
    for (const status of ["live", "pruned", "terminal_pass", "terminal_fail"]) {
      assert.match(s, new RegExp(`\\b${escapeRegExp(status)}\\b`), `status value ${status} not declared`);
    }
  });

  test("INSTRUCTIONS.md uses --- block separator in tree.md (R10)", () => {
    const init = extractInstructionBody(s, "Initialize");
    assert.match(init, /^---$/m, "Initialize must seed tree.md with a --- separator before the root block");
  });

  test("INSTRUCTIONS.md uses awk for surgical updates of tree.md after Initialize (R12)", () => {
    // Strategy outside Initialize must use awk (or sed) for in-place tree.md updates.
    // We assert at least one awk pipeline that writes back to ./scoped/tree.md.
    assert.match(s, /awk[^>]*\.\/scoped\/tree\.md[^|]*>\s*\.\/scoped\/tree\.md\.tmp/);
    assert.match(s, /mv\s+\.\/scoped\/tree\.md\.tmp\s+\.\/scoped\/tree\.md/);
  });

  test("INSTRUCTIONS.md computes monotonic n<index> ids (R13)", () => {
    // Look for the pattern that derives a new id from the count of existing ids.
    assert.match(s, /grep\s+-c\s+'?\^id:\s*n'?[^\n]*\.\/scoped\/tree\.md/);
    assert.match(s, /n"?\$/, "INSTRUCTIONS.md should construct new id as n<counter>");
  });
});

describe("phase-6 a-tot: expand-node.md dynamic (R38–R40)", () => {
  const path = resolve(INTERP, "dynamics/expand-node.md");

  test("dynamics/expand-node.md exists", () => {
    assert.ok(existsSync(path), "expand-node.md missing");
  });

  test("expand-node.md declares push-arg placeholders (R38)", () => {
    const s = readFileSync(path, "utf-8");
    for (const ph of ["{{parent_thought}}", "{{target}}", "{{numbers_remaining}}"]) {
      assert.match(s, new RegExp(escapeRegExp(ph)), `expand-node.md missing placeholder ${ph}`);
    }
  });

  test("expand-node.md is single-cycle empty -> done (R39)", () => {
    const s = readFileSync(path, "utf-8");
    const headers = (s.match(/^## Instruction:/gm) || []);
    assert.equal(headers.length, 1, "expand-node.md must have exactly one instruction");
    assert.match(s, /MEMORY state is "empty"/);
    assert.match(s, /## State\s*\n\s*done/);
  });

  test("expand-node.md returns one key 'children' via ## Return (R39)", () => {
    const s = readFileSync(path, "utf-8");
    assert.match(s, /## Return\s*\n\s*children:\s*\|/);
  });

  test("expand-node.md prompts for exactly k=5 child entries (R39)", () => {
    const s = readFileSync(path, "utf-8");
    assert.match(s, /\b5\b.*candidates|exactly\s+(?:k\s*=\s*)?5/i);
  });

  test("expand-node.md does not push further dynamics (R40)", () => {
    const s = readFileSync(path, "utf-8");
    assert.doesNotMatch(s, /^## Push\s*\ndynamics\//m);
  });
});

describe("phase-6 a-tot: Expand-push + Expand-absorb + Phase-router (R15–R18, R47)", () => {
  const s = readFileSync(resolve(INTERP, "INSTRUCTIONS.md"), "utf-8");

  test("Expand-push instruction exists and matches state == expanding (R15)", () => {
    const ep = extractInstructionBody(s, "Expand-push");
    assert.ok(ep.length > 0, "Expand-push missing");
    assert.match(ep, /MEMORY state is "expanding"/);
  });

  test("Expand-push pushes dynamics/expand-node.md with the three push-args (R16)", () => {
    const ep = extractInstructionBody(s, "Expand-push");
    assert.match(ep, /## Push\s*\ndynamics\/expand-node\.md/);
    for (const a of ["parent_thought", "target", "numbers_remaining"]) {
      assert.match(ep, new RegExp(`^\\s*${a}:`, "m"), `Expand-push missing arg ${a}`);
    }
  });

  test("Expand-push selects unexpanded live node at current_depth (R15)", () => {
    const ep = extractInstructionBody(s, "Expand-push");
    assert.match(ep, /scoped\/current_depth\.md/);
    assert.match(ep, /parent_id/);
  });

  test("Expand-absorb matches state == expanding_completed with ## Children present (R17)", () => {
    const ea = extractInstructionBody(s, "Expand-absorb");
    assert.ok(ea.length > 0, "Expand-absorb missing");
    assert.match(ea, /expanding_completed/);
    assert.match(ea, /## Children/);
  });

  test("Expand-absorb appends children with value 0, samples 0, status live (R17)", () => {
    const ea = extractInstructionBody(s, "Expand-absorb");
    assert.match(ea, /value:\s*0/);
    assert.match(ea, /samples:\s*0/);
    assert.match(ea, /status:\s*live/);
  });

  test("Expand-absorb appends Pending Questions on malformed children (R47)", () => {
    const ea = extractInstructionBody(s, "Expand-absorb");
    assert.match(ea, /## Pending Questions/);
    assert.doesNotMatch(ea, /## State\s*\n\s*waiting_for_user/);
  });

  test("Phase-router routes to expanding | scoring | pruning (R18)", () => {
    const ea = extractInstructionBody(s, "Expand-absorb");
    for (const target of ["expanding", "scoring", "pruning"]) {
      assert.match(ea, new RegExp(`\\b${target}\\b`), `Expand-absorb router missing target ${target}`);
    }
  });
});

describe("phase-6 a-tot: score.md dynamic (R41–R43)", () => {
  const path = resolve(INTERP, "dynamics/score.md");

  test("dynamics/score.md exists", () => {
    assert.ok(existsSync(path), "score.md missing");
  });

  test("score.md declares two push-arg placeholders (R41)", () => {
    const s = readFileSync(path, "utf-8");
    for (const ph of ["{{thought}}", "{{target}}"]) {
      assert.match(s, new RegExp(escapeRegExp(ph)), `score.md missing placeholder ${ph}`);
    }
  });

  test("score.md is single-cycle empty -> done (R42)", () => {
    const s = readFileSync(path, "utf-8");
    const headers = (s.match(/^## Instruction:/gm) || []);
    assert.equal(headers.length, 1, "score.md must have exactly one instruction");
    assert.match(s, /MEMORY state is "empty"/);
    assert.match(s, /## State\s*\n\s*done/);
  });

  test("score.md returns one key 'value' via ## Return (R42)", () => {
    const s = readFileSync(path, "utf-8");
    assert.match(s, /## Return\s*\n\s*value:/);
  });

  test("score.md prompts for one of sure/likely/impossible (R42)", () => {
    const s = readFileSync(path, "utf-8");
    assert.match(s, /\bsure\b/);
    assert.match(s, /\blikely\b/);
    assert.match(s, /\bimpossible\b/);
  });

  test("score.md does not push further dynamics (R43)", () => {
    const s = readFileSync(path, "utf-8");
    assert.doesNotMatch(s, /^## Push\s*\ndynamics\//m);
  });
});
