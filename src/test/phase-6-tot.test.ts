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

describe("phase-6 a-tot: Score-push + Score-absorb (R19–R23, R44)", () => {
  const s = readFileSync(resolve(INTERP, "INSTRUCTIONS.md"), "utf-8");

  test("Score-push matches state == scoring (R19)", () => {
    const sp = extractInstructionBody(s, "Score-push");
    assert.ok(sp.length > 0, "Score-push missing");
    assert.match(sp, /MEMORY state is "scoring"/);
  });

  test("Score-push selects child at current_depth+1 with samples<3 (R19)", () => {
    const sp = extractInstructionBody(s, "Score-push");
    assert.match(sp, /samples\s*<\s*3|samples\s*<\s*"3"|samples<3/);
  });

  test("Score-push pushes dynamics/score.md with thought + target (R20)", () => {
    const sp = extractInstructionBody(s, "Score-push");
    assert.match(sp, /## Push\s*\ndynamics\/score\.md/);
    for (const a of ["thought", "target"]) {
      assert.match(sp, new RegExp(`^\\s*${a}:`, "m"), `Score-push missing arg ${a}`);
    }
  });

  test("Score-absorb matches state == scoring_completed with ## Value present (R21)", () => {
    const sa = extractInstructionBody(s, "Score-absorb");
    assert.ok(sa.length > 0, "Score-absorb missing");
    assert.match(sa, /scoring_completed/);
    assert.match(sa, /## Value/);
  });

  test("Score-absorb declares the weight mapping sure=20 likely=1 impossible=0.001 (R21)", () => {
    const sa = extractInstructionBody(s, "Score-absorb");
    assert.match(sa, /sure[^=]*=?[^0-9]*20\b/);
    assert.match(sa, /likely[^=]*=?[^0-9]*1\b/);
    assert.match(sa, /impossible[^=]*=?[^0-9]*0\.001/);
  });

  test("Score-absorb increments samples by 1 and adds weight to value (R21)", () => {
    const sa = extractInstructionBody(s, "Score-absorb");
    assert.match(sa, /samples\s*\+\s*1|\$\(\(\s*\$?CURRENT_SAMPLES\s*\+\s*1\s*\)\)|new_samples=/i);
    assert.match(sa, /bc\b|awk.*\+/);
  });

  test("Score-absorb treats malformed label as impossible (R44)", () => {
    const sa = extractInstructionBody(s, "Score-absorb");
    assert.match(sa, /\bimpossible\b/);
    assert.match(sa, /## Pending Questions/);
    assert.doesNotMatch(sa, /## State\s*\n\s*waiting_for_user/);
  });

  test("Score-absorb routes via Phase-router (scoring | expanding | pruning) (R22, R23)", () => {
    const sa = extractInstructionBody(s, "Score-absorb");
    for (const target of ["scoring", "expanding", "pruning"]) {
      assert.match(sa, new RegExp(`\\b${target}\\b`), `Score-absorb router missing target ${target}`);
    }
  });
});

describe("phase-6 a-tot: Prune instruction (R24, R25, R37)", () => {
  const s = readFileSync(resolve(INTERP, "INSTRUCTIONS.md"), "utf-8");

  test("Prune instruction exists and matches state == pruning", () => {
    const p = extractInstructionBody(s, "Prune");
    assert.ok(p.length > 0, "Prune missing");
    assert.match(p, /MEMORY state is "pruning"/);
  });

  test("Prune sorts by value desc, id asc, retains top 5 (R24)", () => {
    const p = extractInstructionBody(s, "Prune");
    assert.match(p, /sort.*-k1,1nr.*-k2,2|sort.*-rn|sort.*--reverse/);
    assert.match(p, /tail\s+-n\s+\+6|tail\s+-n6\b|head\s+-n\s+5/);
  });

  test("Prune marks losers as status: pruned (R24)", () => {
    const p = extractInstructionBody(s, "Prune");
    assert.match(p, /status:?\s*pruned|"pruned"/);
  });

  test("Prune transitions to advancing on success (R25)", () => {
    const p = extractInstructionBody(s, "Prune");
    assert.match(p, /## State\s*\n\s*advancing/);
  });

  test("Prune emits ## No Solution Found on empty frontier dead-end (R37)", () => {
    const p = extractInstructionBody(s, "Prune");
    assert.match(p, /## No Solution Found/);
    assert.match(p, /## State\s*\n\s*done/);
  });
});

describe("phase-6 a-tot: Advance instruction (R26, R27)", () => {
  const s = readFileSync(resolve(INTERP, "INSTRUCTIONS.md"), "utf-8");

  test("Advance instruction exists and matches state == advancing", () => {
    const a = extractInstructionBody(s, "Advance");
    assert.ok(a.length > 0, "Advance missing");
    assert.match(a, /MEMORY state is "advancing"/);
  });

  test("Advance increments current_depth when next ≤ max_depth (R26)", () => {
    const a = extractInstructionBody(s, "Advance");
    assert.match(a, /scoped\/current_depth\.md/);
    assert.match(a, /-le|-lt|<=/);
    assert.match(a, /\bexpanding\b/);
  });

  test("Advance routes to goal_checking when next > max_depth (R27)", () => {
    const a = extractInstructionBody(s, "Advance");
    assert.match(a, /\bgoal_checking\b/);
  });
});

describe("phase-6 a-tot: Goal-push + Goal-absorb (R28–R34)", () => {
  const s = readFileSync(resolve(INTERP, "INSTRUCTIONS.md"), "utf-8");

  test("Goal-push matches state == goal_checking (R28)", () => {
    const gp = extractInstructionBody(s, "Goal-push");
    assert.ok(gp.length > 0, "Goal-push missing");
    assert.match(gp, /MEMORY state is "goal_checking"/);
  });

  test("Goal-push selects live node at depth == max_depth (R28)", () => {
    const gp = extractInstructionBody(s, "Goal-push");
    assert.match(gp, /scoped\/max_depth\.md/);
    assert.match(gp, /\blive\b/);
  });

  test("Goal-push reconstructs expression by walking parent_id chain (R29)", () => {
    const gp = extractInstructionBody(s, "Goal-push");
    assert.match(gp, /parent_id|walk/i);
    assert.match(gp, /scoped\/staged\/attempt\.md/);
  });

  test("Goal-push pushes dynamics/evaluate.md with attempt + criterion (R30)", () => {
    const gp = extractInstructionBody(s, "Goal-push");
    assert.match(gp, /## Push\s*\ndynamics\/evaluate\.md/);
    for (const a of ["attempt", "criterion"]) {
      assert.match(gp, new RegExp(`^\\s*${a}:`, "m"), `Goal-push missing arg ${a}`);
    }
  });

  test("Goal-push criterion text mentions 'use each of' and 'evaluate to' (R30)", () => {
    const gp = extractInstructionBody(s, "Goal-push");
    assert.match(gp, /use each of/i);
    assert.match(gp, /evaluate(?:s)? to/i);
  });

  test("Goal-absorb matches state == goal_checking_completed with ## Verdict (R31, R32)", () => {
    const ga = extractInstructionBody(s, "Goal-absorb");
    assert.ok(ga.length > 0, "Goal-absorb missing");
    assert.match(ga, /goal_checking_completed/);
    assert.match(ga, /## Verdict/);
  });

  test("Goal-absorb maps pass → terminal_pass and routes to solved (R31)", () => {
    const ga = extractInstructionBody(s, "Goal-absorb");
    assert.match(ga, /\bterminal_pass\b/);
    assert.match(ga, /\bsolved\b/);
  });

  test("Goal-absorb maps fail → terminal_fail and stays in goal_checking (R32)", () => {
    const ga = extractInstructionBody(s, "Goal-absorb");
    assert.match(ga, /\bterminal_fail\b/);
    assert.match(ga, /\bgoal_checking\b/);
  });

  test("Goal-absorb treats malformed verdict as fail with Pending Questions (R33)", () => {
    const ga = extractInstructionBody(s, "Goal-absorb");
    assert.match(ga, /## Pending Questions/);
    assert.doesNotMatch(ga, /## State\s*\n\s*waiting_for_user/);
  });

  test("Exhaustion path emits ## No Solution Found and sets state done (R34)", () => {
    const gp = extractInstructionBody(s, "Goal-push");
    const ga = extractInstructionBody(s, "Goal-absorb");
    const combined = gp + "\n" + ga;
    assert.match(combined, /## No Solution Found/);
  });
});

describe("phase-6 a-tot: Solved instruction (R35, R36)", () => {
  const s = readFileSync(resolve(INTERP, "INSTRUCTIONS.md"), "utf-8");

  test("Solved instruction exists and matches state == solved", () => {
    const sv = extractInstructionBody(s, "Solved");
    assert.ok(sv.length > 0, "Solved missing");
    assert.match(sv, /MEMORY state is "solved"/);
  });

  test("Solved emits ## Solution containing winning expression and counts (R35)", () => {
    const sv = extractInstructionBody(s, "Solved");
    assert.match(sv, /## Solution/);
    assert.match(sv, /grep\s+-c\s+'?\^id:\s*n'?/);
    assert.match(sv, /grep\s+-c\s+'?\^status:\s*pruned'?/);
  });

  test("Solved sets state done (R35, R36)", () => {
    const sv = extractInstructionBody(s, "Solved");
    assert.match(sv, /## State\s*\n\s*done/);
  });

  test("All eleven instructions are present (full state machine)", () => {
    const expected = [
      "Initialize", "Expand-push", "Expand-absorb",
      "Score-push", "Score-absorb", "Prune", "Advance",
      "Goal-push", "Goal-absorb", "Solved",
    ];
    for (const inst of expected) {
      assert.match(s, new RegExp(`^## Instruction:\\s*${escapeRegExp(inst)}\\b`, "m"), `missing instruction: ${inst}`);
    }
  });
});

describe("phase-6 a-tot: demo PROGRAM.md (R48, R49)", () => {
  test("PROGRAM.md exists", () => {
    assert.ok(existsSync(resolve(INTERP, "PROGRAM.md")), "PROGRAM.md missing");
  });
  test("PROGRAM.md contains exactly four puzzle integers + the target 24 (R48)", () => {
    const s = readFileSync(resolve(INTERP, "PROGRAM.md"), "utf-8");
    const nums = (s.match(/\b\d+\b/g) || []).map(Number);
    assert.equal(nums.length, 5, `expected 5 integers in PROGRAM.md prose, got ${nums.length}: ${nums.join(",")}`);
    assert.equal(nums[nums.length - 1], 24, `last integer (target) must be 24, got ${nums[nums.length - 1]}`);
  });
  test("PROGRAM.md mentions Game of 24 or 'evaluates to 24' (R49)", () => {
    const s = readFileSync(resolve(INTERP, "PROGRAM.md"), "utf-8");
    assert.match(s, /Game of 24|evaluate(?:s)? to 24|equal(?:s)? 24/i);
  });
});

describe("phase-6 a-tot: negative requirements (R52–R57)", () => {
  const sInst = readFileSync(resolve(INTERP, "INSTRUCTIONS.md"), "utf-8");

  test("strategy never references workspace/ for tree state (R52)", () => {
    assert.doesNotMatch(sInst, /workspace\/(tree|frontier|nodes|search)/);
    assert.doesNotMatch(sInst, /git\s+(checkout|branch).*workspace/);
  });

  test("k=5 and b=5 are bash literals, not parsed from PROGRAM.md (R53)", () => {
    assert.match(sInst, /\bk\s*=\s*5\b|\b5\b.*candidates|exactly\s+5/i);
    const sProg = readFileSync(resolve(INTERP, "PROGRAM.md"), "utf-8");
    assert.doesNotMatch(sProg, /\bk\s*[=:]\s*\d|\bb\s*[=:]\s*\d/i);
  });

  test("no Graph-of-Thoughts variant in dynamics/ (R54)", () => {
    const dyns = readdirSync(resolve(INTERP, "dynamics"));
    for (const d of dyns) {
      assert.doesNotMatch(d, /aggregate|graph|merge/i, `unexpected GoT-style dynamic ${d}`);
    }
  });

  test("no retry/budget/restart/early-termination beyond BFS schedule (R55)", () => {
    assert.doesNotMatch(sInst, /\b(retry|attempts_left|budget|max_iterations|time_limit)\b/i);
  });

  test("dynamics never reach into parent scoped/ (R56)", () => {
    for (const dyn of ["expand-node.md", "score.md", "evaluate.md"]) {
      const s = readFileSync(resolve(INTERP, "dynamics", dyn), "utf-8");
      assert.doesNotMatch(s, /\.\.\/scoped\//);
      assert.doesNotMatch(s, /frames\/f000-strategy\/scoped/);
    }
  });

  test("no concurrency primitives in INSTRUCTIONS.md or dynamics (R57)", () => {
    const allFiles = [
      sInst,
      readFileSync(resolve(INTERP, "dynamics/expand-node.md"), "utf-8"),
      readFileSync(resolve(INTERP, "dynamics/score.md"), "utf-8"),
      readFileSync(resolve(INTERP, "dynamics/evaluate.md"), "utf-8"),
    ];
    for (const f of allFiles) {
      assert.doesNotMatch(f, /xargs\s+-P\b/);
      assert.doesNotMatch(f, /parallel\s+--/);
      assert.doesNotMatch(f, /\&\s*$/m);
    }
  });
});

describe("phase-6 a-tot: leaf README content (R3, R50)", () => {
  const path = resolve(INTERP, "README.md");
  test("leaf README cites Yao et al. arXiv:2305.10601 (R3)", () => {
    const s = readFileSync(path, "utf-8");
    assert.match(s, /Yao\s+et\s+al/i);
    assert.match(s, /2305\.10601/);
  });
  test("leaf README contains a state-machine summary (R3)", () => {
    const s = readFileSync(path, "utf-8");
    assert.match(s, /Initialize/);
    assert.match(s, /Expand-push|expanding/);
    assert.match(s, /Score-push|scoring/);
    assert.match(s, /Prune|pruning/);
    assert.match(s, /Advance|advancing/);
    assert.match(s, /Goal-push|goal_checking/);
    assert.match(s, /Solved|solved/);
  });
  test("leaf README contains the dynamics-and-contracts table (R3)", () => {
    const s = readFileSync(path, "utf-8");
    assert.match(s, /expand-node\.md/);
    assert.match(s, /score\.md/);
    assert.match(s, /evaluate\.md/);
  });
  test("leaf README contains run instructions (R3)", () => {
    const s = readFileSync(path, "utf-8");
    assert.match(s, /new-instance\.sh/);
    assert.match(s, /run\.sh/);
  });
  test("leaf README has Notable behaviour section with cycle-cost note (R3)", () => {
    const s = readFileSync(path, "utf-8");
    assert.match(s, /Notable behaviour/i);
    assert.match(s, /cycle|dispatch/);
  });
  test("leaf README mentions 3× sampling fidelity choice and the weight mapping (R3)", () => {
    const s = readFileSync(path, "utf-8");
    assert.match(s, /3[× ]\s*sampl|3\s*samples?|three samples/i);
    assert.match(s, /sure\s*=\s*20|sure.*20/);
  });
  test("leaf README includes Run-it smoke check covering R50 demo end-state shape", () => {
    const s = readFileSync(path, "utf-8");
    assert.match(s, /## Solution|## No Solution Found/);
    assert.match(s, /scoped\/tree\.md/);
  });
});

describe("phase-6 source-spec dynamics-table (R4)", () => {
  const SOURCE = resolve(REPO, "docs/agent-workflows/requirements.md");
  test("source spec dynamics table has a row for expand-node.md returning ## Children only (R4)", () => {
    const s = readFileSync(SOURCE, "utf-8");
    assert.match(s, /\|\s*`expand-node\.md`\s*\|\s*6\s*\|[^|]*\|\s*`?##\s*Children`?\s*\|\s*1\s*\|/);
  });
  test("source spec dynamics table has a row for score.md returning ## Value (R4)", () => {
    const s = readFileSync(SOURCE, "utf-8");
    assert.match(s, /\|\s*`score\.md`\s*\|\s*6\s*\|[^|]*\|\s*`?##\s*Value`?\s*\|\s*1\s*\|/);
  });
  test("source spec no longer has the deprecated combined row 'expand-node.md … ## Children, ## Value … N' (R4)", () => {
    const s = readFileSync(SOURCE, "utf-8");
    assert.doesNotMatch(s, /\|\s*`expand-node\.md`\s*\|[^|]*\|[^|]*\|\s*`?##\s*Children`?\s*,\s*`?##\s*Value`?\s*\|/);
  });
  test("source spec includes a rationale paragraph mentioning evaluate.md and graded ranking (R4)", () => {
    const s = readFileSync(SOURCE, "utf-8");
    assert.match(s, /graded\s+ranking|grading.*pass\/fail|two\s+(?:single-purpose\s+)?dynamics/i);
  });
});
