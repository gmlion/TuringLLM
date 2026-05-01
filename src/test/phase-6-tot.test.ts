import { test, describe } from "node:test";
import { strict as assert } from "node:assert";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { resolve, dirname, join } from "path";
import { fileURLToPath } from "url";
import { execFileSync } from "child_process";

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

describe("phase-6 a-tot: Initialize post-refactor (R17, R18, R19)", () => {
  const path = resolve(INTERP, "INSTRUCTIONS.md");
  const s = readFileSync(path, "utf-8");
  const init = extractInstructionBody(s, "Initialize");

  test("Initialize copies PROGRAM.md to ./scoped/task.md (R17)", () => {
    assert.match(init, /cp\s+\.\.\/\.\.\/PROGRAM\.md\s+\.\/scoped\/task\.md/);
  });

  test("Initialize root node block has only post-refactor schema fields (R18)", () => {
    const m = init.match(/<< ROOT_EOF([\s\S]+?)ROOT_EOF/);
    assert.ok(m, "Initialize must contain a ROOT_EOF heredoc for tree.md root block");
    const body = m[1];
    for (const k of ["id:", "parent_id:", "depth:", "value:", "samples:", "status:"]) {
      assert.ok(body.includes(k), `root block missing field: ${k}`);
    }
    for (const k of ["op:", "left:"]) {
      assert.ok(!body.includes(k), `root block must NOT contain pre-refactor field: ${k}`);
    }
  });

  test("Initialize creates ./scoped/state-n0.md (R19)", () => {
    assert.match(init, /\.\/scoped\/state-n0\.md/);
  });
});

describe("phase-6 a-tot: tree ledger schema post-refactor (R24)", () => {
  const path = resolve(INTERP, "INSTRUCTIONS.md");
  const s = readFileSync(path, "utf-8");
  const init = extractInstructionBody(s, "Initialize");

  test("Initialize body does not mention `op:` or `left:` as ledger fields (R18, R24, scoped to T3)", () => {
    assert.doesNotMatch(init, /^\s*op:\s/m);
    assert.doesNotMatch(init, /^\s*left:\s/m);
  });

  test("INSTRUCTIONS.md references ./scoped/state-<id> per-node files (R25)", () => {
    assert.match(s, /\.\/scoped\/state-/);
  });
});

describe("phase-6 a-tot: expand-node.md dynamic (post-refactor R14, R30)", () => {
  const path = resolve(INTERP, "dynamics/expand-node.md");

  test("dynamics/expand-node.md exists", () => {
    assert.ok(existsSync(path), "expand-node.md missing");
  });

  test("expand-node.md declares only {{partial_state}} and {{task}} push-args (R14, R30)", () => {
    const s = readFileSync(path, "utf-8");
    assert.match(s, /\{\{partial_state\}\}/);
    assert.match(s, /\{\{task\}\}/);
    // Must NOT contain pre-refactor placeholders
    assert.doesNotMatch(s, /\{\{parent_thought\}\}/);
    assert.doesNotMatch(s, /\{\{target\}\}/);
    assert.doesNotMatch(s, /\{\{numbers_remaining\}\}/);
  });

  test("expand-node.md returns ## Return children: | with state: entries (R30)", () => {
    const s = readFileSync(path, "utf-8");
    assert.match(s, /## Return\s*\n\s*children:\s*\|/);
    assert.match(s, /state:\s*\|/);
    // Must NOT contain pre-refactor return shape
    assert.doesNotMatch(s, /^op:\s/m);
    assert.doesNotMatch(s, /^left:\s/m);
  });

  test("expand-node.md is single-cycle and pushes nothing further (R33)", () => {
    const s = readFileSync(path, "utf-8");
    // single ## Instruction matching "Generate children" or similar
    const matches = s.match(/^## Instruction:/gm) || [];
    assert.equal(matches.length, 1, "expand-node.md must have exactly one instruction");
    // No further push
    assert.doesNotMatch(s, /^## Push\s*$/m);
  });

  test("expand-node.md prose is domain-agnostic (R32)", () => {
    const s = readFileSync(path, "utf-8");
    for (const banned of ["Game of 24", "arithmetic", "numbers_remaining", "parent_thought"]) {
      assert.ok(!s.includes(banned), `expand-node.md contains banned domain word: "${banned}"`);
    }
    // The Game-of-24 op symbols must not appear as bullet items / rule statements
    for (const sym of ["+", "−", "×", "÷"]) {
      // permissive: allow these in surrounding markdown noise (none expected); strict check elsewhere
      assert.ok(!s.includes(`Apply one of`), "expand-node.md must not enumerate operators");
    }
  });
});

describe("phase-6 a-tot: Expand-push post-refactor (R20)", () => {
  const path = resolve(INTERP, "INSTRUCTIONS.md");
  const s = readFileSync(path, "utf-8");
  const ep = extractInstructionBody(s, "Expand-push");

  test("Expand-push push-args are partial_state and task only (R20)", () => {
    assert.match(ep, /partial_state:\s*\|/);
    assert.match(ep, /task:\s*\|/);
    assert.doesNotMatch(ep, /parent_thought:/);
    assert.doesNotMatch(ep, /numbers_remaining:/);
    assert.doesNotMatch(ep, /^\s*target:\s/m);
  });

  test("Expand-push reads partial_state from ./scoped/state-${ID}.md (R20)", () => {
    assert.match(ep, /\.\/scoped\/state-\$\{?ID\}?\.md/);
  });

  test("Expand-push reads task from ./scoped/task.md (R20)", () => {
    assert.match(ep, /\.\/scoped\/task\.md/);
  });
});

describe("phase-6 a-tot: Expand-absorb post-refactor (R21)", () => {
  const path = resolve(INTERP, "INSTRUCTIONS.md");
  const s = readFileSync(path, "utf-8");
  const ea = extractInstructionBody(s, "Expand-absorb");

  test("Expand-absorb parses ## Children as state: entries (R21)", () => {
    assert.match(ea, /state:/);
    assert.doesNotMatch(ea, /op:/);
    assert.doesNotMatch(ea, /left:/);
  });

  test("Expand-absorb writes per-node state files for each child (R19, R21)", () => {
    assert.match(ea, /\.\/scoped\/state-/);
  });

  test("Expand-absorb appends ledger blocks without op/left fields (R18, R21)", () => {
    const m = ea.match(/<< (?:NODE_EOF|CHILD_EOF)([\s\S]+?)(?:NODE_EOF|CHILD_EOF)/);
    assert.ok(m, "Expand-absorb must contain a node-block heredoc");
    const body = m[1];
    for (const k of ["id:", "parent_id:", "depth:", "value:", "samples:", "status:"]) {
      assert.ok(body.includes(k), `child block missing field: ${k}`);
    }
    for (const k of ["op:", "left:"]) {
      assert.ok(!body.includes(k), `child block must NOT contain pre-refactor field: ${k}`);
    }
  });

  test("Expand-absorb still appends ## Pending Questions on malformed (R47, preserved per R84)", () => {
    assert.match(ea, /## Pending Questions/);
    assert.doesNotMatch(ea, /## State\s*\n\s*waiting_for_user/);
  });
});

describe("phase-6 a-tot: score.md dynamic (post-refactor R15, R31)", () => {
  const path = resolve(INTERP, "dynamics/score.md");

  test("dynamics/score.md exists", () => {
    assert.ok(existsSync(path), "score.md missing");
  });

  test("score.md declares only {{partial_state}} and {{task}} push-args (R15, R31)", () => {
    const s = readFileSync(path, "utf-8");
    assert.match(s, /\{\{partial_state\}\}/);
    assert.match(s, /\{\{task\}\}/);
    assert.doesNotMatch(s, /\{\{thought\}\}/);
    assert.doesNotMatch(s, /\{\{target\}\}/);
  });

  test("score.md returns ## Return value: with sure/likely/impossible enum (R31)", () => {
    const s = readFileSync(path, "utf-8");
    assert.match(s, /## Return\s*\n\s*value:/);
    for (const lbl of ["sure", "likely", "impossible"]) {
      assert.ok(s.includes(lbl), `score.md missing label: ${lbl}`);
    }
  });

  test("score.md is single-cycle and pushes nothing further (R33)", () => {
    const s = readFileSync(path, "utf-8");
    const matches = s.match(/^## Instruction:/gm) || [];
    assert.equal(matches.length, 1);
    assert.doesNotMatch(s, /^## Push\s*$/m);
  });

  test("score.md prose is domain-agnostic (R32)", () => {
    const s = readFileSync(path, "utf-8");
    for (const banned of ["Game of 24", "arithmetic", "thought", "{1, 1, 1}", "{12, 2}"]) {
      assert.ok(!s.includes(banned), `score.md contains banned domain word: "${banned}"`);
    }
  });
});

describe("phase-6 a-tot: Score-push post-refactor (R20)", () => {
  const path = resolve(INTERP, "INSTRUCTIONS.md");
  const s = readFileSync(path, "utf-8");
  const sp = extractInstructionBody(s, "Score-push");

  test("Score-push push-args are partial_state and task only (R20)", () => {
    assert.match(sp, /partial_state:\s*\|/);
    assert.match(sp, /task:\s*\|/);
    assert.doesNotMatch(sp, /thought:/);
    assert.doesNotMatch(sp, /^\s*target:\s/m);
  });
});

describe("phase-6 a-tot: refactored dynamics vocabulary check (R26)", () => {
  test("expand-node.md prose has no Game-of-24 vocabulary (R26)", () => {
    const s = readFileSync(resolve(INTERP, "dynamics/expand-node.md"), "utf-8");
    for (const banned of ["Game of 24", "arithmetic", "numbers_remaining", "parent_thought", "target"]) {
      assert.ok(!s.includes(banned), `expand-node.md contains: ${banned}`);
    }
  });

  test("score.md prose has no Game-of-24 vocabulary (R26)", () => {
    const s = readFileSync(resolve(INTERP, "dynamics/score.md"), "utf-8");
    for (const banned of ["Game of 24", "arithmetic", "thought", "target"]) {
      assert.ok(!s.includes(banned), `score.md contains: ${banned}`);
    }
  });
});

describe("phase-6 a-tot: Score-absorb (R21–R23, R44)", () => {
  const s = readFileSync(resolve(INTERP, "INSTRUCTIONS.md"), "utf-8");

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

describe("phase-6 a-tot: Goal-push post-refactor (R22)", () => {
  const path = resolve(INTERP, "INSTRUCTIONS.md");
  const s = readFileSync(path, "utf-8");
  const gp = extractInstructionBody(s, "Goal-push");

  test("Goal-push reads attempt from leaf state file (R22)", () => {
    assert.match(gp, /\.\/scoped\/state-/);
  });

  test("Goal-push criterion is ./scoped/task.md (R22)", () => {
    assert.match(gp, /\.\/scoped\/task\.md/);
  });

  test("Goal-push has no parent-walk while loop (R22)", () => {
    assert.doesNotMatch(gp, /while\s+\[\s+"\$CURRENT"\s+!=\s+"n0"/);
  });
});

describe("phase-6 a-tot: Goal-absorb (R31–R34)", () => {
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

  test("Goal-push pushes dynamics/evaluate.md with attempt + criterion (R30)", () => {
    const gp = extractInstructionBody(s, "Goal-push");
    assert.match(gp, /## Push\s*\ndynamics\/evaluate\.md/);
    for (const a of ["attempt", "criterion"]) {
      assert.match(gp, new RegExp(`^\\s*${a}:`, "m"), `Goal-push missing arg ${a}`);
    }
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

describe("phase-6 a-tot: Solved post-refactor (R23)", () => {
  const path = resolve(INTERP, "INSTRUCTIONS.md");
  const s = readFileSync(path, "utf-8");
  const so = extractInstructionBody(s, "Solved");

  test("Solved reads solution from terminal_pass leaf state file (R23)", () => {
    assert.match(so, /\.\/scoped\/state-/);
  });

  test("Solved has no parent-walk while loop (R23)", () => {
    assert.doesNotMatch(so, /while\s+\[\s+"\$CURRENT"\s+!=\s+"n0"/);
  });

  test("Solved still emits ## Solution with node counts (R35, preserved per R84)", () => {
    assert.match(so, /## Solution/);
    assert.match(so, /Total nodes expanded:/);
    assert.match(so, /Nodes pruned:/);
  });
});

describe("phase-6 a-tot: Solved instruction baseline (R35, R36)", () => {
  const s = readFileSync(resolve(INTERP, "INSTRUCTIONS.md"), "utf-8");

  test("Solved instruction exists and matches state == solved", () => {
    const sv = extractInstructionBody(s, "Solved");
    assert.ok(sv.length > 0, "Solved missing");
    assert.match(sv, /MEMORY state is "solved"/);
  });

  test("Solved emits ## Solution with grep-derived counts (R35)", () => {
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

// -----------------------------------------------------------------------------
// Executable parser test (R21, R47): runs the actual Expand-absorb bash against
// a fixture ## Children block. Guards against regressions in the bash bodies
// that pure markdown-shape tests can't catch (e.g. the IFS=$(printf '\n')
// subshell-strips-trailing-newline bug, line-vs-entry walk, and dropped blank
// lines in block-scalar payloads).
// -----------------------------------------------------------------------------

/**
 * Extract the parser-and-loop bash from the Expand-absorb instruction body.
 * The bash is fenced as an indented (4-space) markdown code block. We grab
 * everything from the first `awk '/^## Children$/...` line through the
 * `MISSING=$((5 - WELL_FORMED))` line, then strip the 4-space indent.
 */
function extractExpandAbsorbParserBash(): string {
  const path = resolve(INTERP, "INSTRUCTIONS.md");
  const src = readFileSync(path, "utf-8");
  const ea = extractInstructionBody(src, "Expand-absorb");
  // Find start of the parser bash block.
  const startMarker = /^    awk '\/\^## Children\$\/.*$/m;
  const startMatch = ea.match(startMarker);
  assert.ok(startMatch, "could not locate parser start in Expand-absorb body");
  const startIdx = startMatch.index!;
  // Find end (the `MISSING=` line, inclusive).
  const endMarker = /^    MISSING=\$\(\(5 - WELL_FORMED\)\)\s*$/m;
  const endMatch = ea.slice(startIdx).match(endMarker);
  assert.ok(endMatch, "could not locate parser end (MISSING line)");
  const block = ea.slice(startIdx, startIdx + endMatch.index! + endMatch[0].length);
  // Strip the 4-space indent from each line.
  return block
    .split(/\r?\n/)
    .map((ln) => (ln.startsWith("    ") ? ln.slice(4) : ln))
    .join("\n");
}

describe("phase-6 a-tot: Expand-absorb executable parser (R21, R47)", () => {
  test("parser ingests 3 multi-line state: | entries (one with blank line); preserves payloads exactly", () => {
    // Sanity: bash must be available.
    let bashAvailable = true;
    try {
      execFileSync("bash", ["-c", "true"], { stdio: "ignore" });
    } catch {
      bashAvailable = false;
    }
    if (!bashAvailable) {
      console.warn("bash unavailable; skipping executable parser test");
      return;
    }

    const tmp = mkdtempSync(join(tmpdir(), "tot-parser-"));
    try {
      // Build a fixture frame layout: ./scoped/, ./MEMORY.md, ./scoped/tree.md.
      const scoped = join(tmp, "scoped");
      execFileSync("bash", ["-c", `mkdir -p "${scoped.replace(/\\/g, "/")}"`], {
        stdio: "ignore",
      });

      // Fixture payloads. Entry 2 contains a deliberately blank line in the
      // middle of its payload to verify blank-line preservation.
      const entry1 = "{1, 2, 3}\nstep: start with three numbers\nremaining: 3\n";
      const entry2 = "{4, 5}\n\nstep: combined two numbers\nremaining: 2\n";
      const entry3 = "{6}\nstep: terminal single number\nremaining: 1\n";

      // Build the ## Children block with each payload 4-space indented under
      // its `state: |` block-scalar header (per the dynamics' return shape).
      const indent = (s: string) =>
        s
          .split("\n")
          .map((ln) => (ln.length === 0 ? "" : "    " + ln))
          .join("\n");

      // Strip trailing newline so the indenter doesn't emit a stray "    " line.
      const stripTrail = (s: string) => s.replace(/\n+$/, "");

      const childrenBlock =
        "## Children\n" +
        "children: |\n" +
        "  state: |\n" +
        indent(stripTrail(entry1)) +
        "\n" +
        "  state: |\n" +
        indent(stripTrail(entry2)) +
        "\n" +
        "  state: |\n" +
        indent(stripTrail(entry3)) +
        "\n" +
        "## Sentinel\n" +
        "trailing-section-after-children\n";

      writeFileSync(join(tmp, "MEMORY.md"), childrenBlock, "utf-8");

      // Seed cursor + tree with a root node n0 (parent for these children).
      writeFileSync(join(scoped, "cursor.md"), "n0\n", "utf-8");
      writeFileSync(join(scoped, "current_depth.md"), "0\n", "utf-8");
      writeFileSync(
        join(scoped, "tree.md"),
        "---\nid: n0\nparent_id: -\ndepth: 0\nvalue: 0\nsamples: 0\nstatus: live\n",
        "utf-8",
      );

      // Build the runnable script: prelude (DEPTH/NEXT_DEPTH/PARENT) + parser.
      const parser = extractExpandAbsorbParserBash();
      const script =
        "set -e\n" +
        'cd "$1"\n' +
        "DEPTH=$(cat ./scoped/current_depth.md)\n" +
        "NEXT_DEPTH=$((DEPTH + 1))\n" +
        "PARENT=$(cat ./scoped/cursor.md)\n" +
        parser +
        "\n" +
        'echo "WELL_FORMED=$WELL_FORMED" > ./_result.txt\n' +
        'echo "MISSING=$MISSING" >> ./_result.txt\n';

      const scriptPath = join(tmp, "_run.sh");
      writeFileSync(scriptPath, script, "utf-8");

      // Convert Windows path to forward-slash form for bash.
      const tmpFwd = tmp.replace(/\\/g, "/");
      const scriptFwd = scriptPath.replace(/\\/g, "/");
      execFileSync("bash", [scriptFwd, tmpFwd], { stdio: "pipe" });

      // Verify: WELL_FORMED == 3, MISSING == 2.
      const resultTxt = readFileSync(join(tmp, "_result.txt"), "utf-8");
      assert.match(resultTxt, /WELL_FORMED=3\b/, `expected WELL_FORMED=3, got: ${resultTxt}`);
      assert.match(resultTxt, /MISSING=2\b/, `expected MISSING=2, got: ${resultTxt}`);

      // Verify: tree.md gained 3 child blocks (n1, n2, n3) with the 6-field
      // post-refactor schema and parent_id=n0, depth=1.
      const tree = readFileSync(join(scoped, "tree.md"), "utf-8");
      for (const id of ["n1", "n2", "n3"]) {
        assert.ok(
          new RegExp(`^id: ${id}$`, "m").test(tree),
          `tree.md missing node id: ${id}\n${tree}`,
        );
      }
      // Each new child must declare parent_id: n0, depth: 1, value: 0,
      // samples: 0, status: live. There must be at least 3 occurrences of each.
      const countLines = (re: RegExp) => (tree.match(re) || []).length;
      assert.ok(
        countLines(/^parent_id: n0$/gm) >= 3,
        "expected >= 3 child nodes with parent_id: n0",
      );
      assert.ok(countLines(/^depth: 1$/gm) >= 3, "expected >= 3 child nodes at depth 1");
      // Pre-refactor fields must NOT appear.
      assert.doesNotMatch(tree, /^op:/m);
      assert.doesNotMatch(tree, /^left:/m);

      // Verify: state-n1.md, state-n2.md, state-n3.md exist with EXACT payloads
      // (including blank lines).
      const expected = [entry1, entry2, entry3];
      for (let i = 0; i < expected.length; i++) {
        const stateFile = join(scoped, `state-n${i + 1}.md`);
        assert.ok(existsSync(stateFile), `state-n${i + 1}.md missing`);
        const got = readFileSync(stateFile, "utf-8");
        assert.equal(
          got,
          expected[i],
          `state-n${i + 1}.md payload mismatch.\nexpected (${expected[i].length} bytes):\n${JSON.stringify(expected[i])}\ngot (${got.length} bytes):\n${JSON.stringify(got)}`,
        );
      }

      // Verify: blank-line preservation specifically in entry 2.
      const got2 = readFileSync(join(scoped, "state-n2.md"), "utf-8");
      assert.match(got2, /\n\n/, "entry-2 blank line was dropped");

      // Verify: scratch _entry-*.txt files were cleaned up.
      const leftover = readdirSync(scoped).filter((f) => /^_entry-\d+\.txt$/.test(f));
      assert.equal(leftover.length, 0, `scratch entry files not cleaned: ${leftover.join(",")}`);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  test("parser does NOT contain the IFS=$(printf '\\n') subshell bug", () => {
    const path = resolve(INTERP, "INSTRUCTIONS.md");
    const src = readFileSync(path, "utf-8");
    const ea = extractInstructionBody(src, "Expand-absorb");
    // The buggy idiom must be gone.
    assert.doesNotMatch(
      ea,
      /IFS\s*=\s*"\$\(printf\s+'\\n'\)"/,
      'Expand-absorb still uses the buggy IFS="$(printf \'\\n\')" idiom',
    );
    // The sentinel idiom must be gone too.
    assert.doesNotMatch(
      ea,
      /<<<EOE>>>/,
      "Expand-absorb still uses the <<<EOE>>> sentinel idiom",
    );
  });
});

describe("phase-6 a-tot: README post-refactor delta (R27, R29)", () => {
  const readme = readFileSync(resolve(INTERP, "README.md"), "utf-8");

  test("README has 'Refactored in Phase 6b' bullet (R29)", () => {
    assert.match(readme, /Refactored in Phase 6b/);
    assert.match(readme, /docs\/specs\/2026-05-01-implement-phase-6b/);
  });

  test("README dynamics table uses post-refactor push-arg names (R27)", () => {
    assert.match(readme, /partial_state/);
    assert.match(readme, /task/);
    assert.doesNotMatch(readme, /numbers_remaining/);
    assert.doesNotMatch(readme, /parent_thought/);
  });
});

describe("phase-6 a-tot: BFS semantics preserved (R84 regression)", () => {
  const path = resolve(INTERP, "INSTRUCTIONS.md");
  const s = readFileSync(path, "utf-8");

  test("k=5 still hardcoded in expand-node related logic (R84)", () => {
    assert.match(s, /\b5\b/);
  });

  test("b=5 still in pruning logic (R84)", () => {
    const pr = extractInstructionBody(s, "Prune");
    assert.match(pr, /tail\s+-n\s+\+6/);
  });

  test("3-sample scoring still in Phase-router routing (R84)", () => {
    assert.match(s, /samples\s*<\s*3/);
  });

  test("weighted sum (sure=20, likely=1, impossible=0.001) preserved (R84)", () => {
    const sa = extractInstructionBody(s, "Score-absorb");
    assert.match(sa, /WEIGHT=20/);
    assert.match(sa, /WEIGHT=1\b/);
    assert.match(sa, /WEIGHT=0\.001/);
  });

  test("R6 (PROGRAM.md insufficient input → waiting_for_user) preserved (R84)", () => {
    const init = extractInstructionBody(s, "Initialize");
    assert.match(init, /waiting_for_user/);
  });

  test("R37 dead-end branch preserved in Prune (R84)", () => {
    const pr = extractInstructionBody(s, "Prune");
    assert.match(pr, /## No Solution Found/);
  });

  test("R34 exhaustion branch preserved in Goal-push (R84)", () => {
    const gp = extractInstructionBody(s, "Goal-push");
    assert.match(gp, /## No Solution Found/);
  });
});
