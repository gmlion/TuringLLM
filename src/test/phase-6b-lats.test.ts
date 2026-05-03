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
  test("interpreter has INSTRUCTIONS.md, PROGRAM.md, README.md, operators/ (R1)", () => {
    for (const f of ["INSTRUCTIONS.md", "PROGRAM.md", "README.md"]) {
      assert.ok(existsSync(resolve(INTERP, f)), `${f} missing`);
    }
    assert.ok(existsSync(resolve(INTERP, "operators")), "operators/ missing");
  });
  test("operators/ does NOT contain score.md (R5, R77)", () => {
    assert.ok(!existsSync(resolve(INTERP, "operators/score.md")),
      "score.md must NOT be shipped in b-lats/operators/");
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
  test("operators/expand-node.md is byte-equal to a-tot post-refactor copy (R6)", () => {
    const canon = readFileSync(resolve(REPO, "interpreters/3-search/a-tot/operators/expand-node.md"));
    const here = readFileSync(resolve(INTERP, "operators/expand-node.md"));
    assert.ok(canon.equals(here), "expand-node.md diverged from a-tot canonical");
  });
  test("operators/evaluate.md is byte-equal to canonical 1b copy (R7)", () => {
    const canon = readFileSync(resolve(REPO, "interpreters/1-iterative-refinement/b-evaluator-optimizer/operators/evaluate.md"));
    const here = readFileSync(resolve(INTERP, "operators/evaluate.md"));
    assert.ok(canon.equals(here), "evaluate.md diverged from canonical");
  });
  test("operators/reflect.md is byte-equal to canonical 1c copy (R8)", () => {
    const canon = readFileSync(resolve(REPO, "interpreters/1-iterative-refinement/c-reflexion/operators/reflect.md"));
    const here = readFileSync(resolve(INTERP, "operators/reflect.md"));
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
  const path = resolve(INTERP, "operators/rollout.md");

  test("operators/rollout.md exists", () => {
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

describe("phase-6b b-lats: Compose-partial-state primitive (R48, R66)", () => {
  const s = readFileSync(resolve(INTERP, "INSTRUCTIONS.md"), "utf-8");

  test("preamble defines a compose_partial_state function or primitive (R48)", () => {
    assert.match(s, /compose_partial_state/);
  });

  test("primitive walks parent chain (while … parent_id) (R48, R66)", () => {
    assert.match(s, /while[\s\S]+parent_id/);
  });

  test("primitive concatenates lessons from all ancestors including cursor (R66)", () => {
    assert.match(s, /lessons-\$\{?[A-Z_]+\}?\.md/);
  });

  test("primitive emits 'Lessons learned along this branch' header (R48)", () => {
    assert.match(s, /Lessons learned along this branch/);
  });
});

describe("phase-6b b-lats: lessons append-only convention (R64, R65)", () => {
  const s = readFileSync(resolve(INTERP, "INSTRUCTIONS.md"), "utf-8");

  test("lessons files are written with >> (append) anywhere they're touched (R65)", () => {
    const lessonWriteLines = s.split("\n").filter((l) => l.includes("lessons-"));
    for (const l of lessonWriteLines) {
      if (/>\s*[\.\$]/.test(l) && !/>>\s*[\.\$]/.test(l) && !l.trim().startsWith("#")) {
        assert.ok(!/^[^#]*\s>\s*['"]?[\.\$]/.test(l),
          `lessons file written with single > (clobber): ${l}`);
      }
    }
  });
});

describe("phase-6b b-lats: Select (R44, R45, R46)", () => {
  const s = readFileSync(resolve(INTERP, "INSTRUCTIONS.md"), "utf-8");
  const sel = extractInstructionBody(s, "Select");

  test("Select declares condition state == selecting (R44)", () => {
    assert.match(s, /## Instruction:\s*Select\b[\s\S]+?\*\*Condition:\*\*[^\n]*"selecting"/);
  });

  test("Select reads uct_c from ./scoped/uct_c.md (R44)", () => {
    assert.match(sel, /\.\/scoped\/uct_c\.md/);
  });

  test("Select uses bc -l for UCT computation (R44)", () => {
    assert.match(sel, /bc\s+-l/);
  });

  test("Select picks leftmost unvisited (n == 0) child first (R45)", () => {
    assert.match(sel, /\bn\s*=\s*0\b|\bn\s*==\s*0\b|\bN\s*=\s*"?0"?/);
    assert.match(sel, /sort[^\n]*head\s+-n\s+1/);
  });

  test("Select terminates at childless leaf and writes ./scoped/cursor.md (R46)", () => {
    assert.match(sel, /\.\/scoped\/cursor\.md/);
    assert.match(sel, /while\s+true|while\s+\[/);
  });

  test("Select transitions to expanding (R46)", () => {
    assert.match(sel, /## State\s*\n\s*expanding/);
  });
});

describe("phase-6b b-lats: Expand-push (R47)", () => {
  const s = readFileSync(resolve(INTERP, "INSTRUCTIONS.md"), "utf-8");
  const ep = extractInstructionBody(s, "Expand-push");

  test("Expand-push pushes operators/expand-node.md (R47)", () => {
    assert.match(ep, /## Push\s*\n\s*operators\/expand-node\.md/);
  });

  test("Expand-push push-args are partial_state and task only (R47)", () => {
    assert.match(ep, /partial_state:\s*\|/);
    assert.match(ep, /task:\s*\|/);
    assert.doesNotMatch(ep, /target:/);
    assert.doesNotMatch(ep, /numbers_remaining:/);
  });

  test("Expand-push uses compose_partial_state primitive (R47, R48)", () => {
    assert.match(ep, /compose_partial_state\b/);
  });
});

describe("phase-6b b-lats: Expand-absorb (R49, R50)", () => {
  const s = readFileSync(resolve(INTERP, "INSTRUCTIONS.md"), "utf-8");
  const ea = extractInstructionBody(s, "Expand-absorb");

  test("Expand-absorb writes ./scoped/state-${NEW_ID}.md per child (R49)", () => {
    assert.match(ea, /\.\/scoped\/state-\$\{?[A-Z_]+\}?\.md/);
  });

  test("Expand-absorb appends ledger blocks with q=0, n=0, status=live (R49)", () => {
    const m = ea.match(/<< (?:NODE_EOF|CHILD_EOF|ENTRY_EOF)([\s\S]+?)(?:NODE_EOF|CHILD_EOF|ENTRY_EOF)/);
    assert.ok(m, "Expand-absorb must contain a node-block heredoc");
    const body = m[1];
    for (const line of [/q:\s*0/, /n:\s*0/, /status:\s*live/]) {
      assert.match(body, line);
    }
  });

  test("Expand-absorb sets chosen_child to leftmost new child (R49)", () => {
    assert.match(ea, /\.\/scoped\/chosen_child\.md/);
  });

  test("Expand-absorb transitions to simulating on success (R49)", () => {
    assert.match(ea, /## State\s*\n\s*simulating/);
  });

  test("Expand-absorb R50 zero-children fallback marks cursor terminal_fail and re-enters selecting", () => {
    assert.match(ea, /terminal_fail/);
    assert.match(ea, /## State\s*\n\s*selecting/);
  });

  test("Expand-absorb appends ## Pending Questions on malformed (R50)", () => {
    assert.match(ea, /## Pending Questions/);
    assert.doesNotMatch(ea, /## State\s*\n\s*waiting_for_user/);
  });

  test("Expand-absorb does NOT use buggy IFS=$(printf newline) idiom", () => {
    assert.doesNotMatch(ea, /IFS=["']\$\(printf/);
    assert.doesNotMatch(ea, /<<<EOE>>>/);
  });
});

describe("phase-6b b-lats: Simulate-push (R51)", () => {
  const s = readFileSync(resolve(INTERP, "INSTRUCTIONS.md"), "utf-8");
  const sp = extractInstructionBody(s, "Simulate-push");

  test("Simulate-push pushes operators/rollout.md (R51)", () => {
    assert.match(sp, /## Push\s*\n\s*operators\/rollout\.md/);
  });

  test("Simulate-push reads from chosen_child not cursor (R51)", () => {
    assert.match(sp, /\.\/scoped\/chosen_child\.md/);
  });

  test("Simulate-push push-args are partial_state and task only (R51)", () => {
    assert.match(sp, /partial_state:\s*\|/);
    assert.match(sp, /task:\s*\|/);
  });
});

describe("phase-6b b-lats: Simulate-absorb (R52, R53)", () => {
  const s = readFileSync(resolve(INTERP, "INSTRUCTIONS.md"), "utf-8");
  const sa = extractInstructionBody(s, "Simulate-absorb");

  test("Simulate-absorb persists ## Terminal State to ./scoped/last_terminal.md (R52)", () => {
    assert.match(sa, /\.\/scoped\/last_terminal\.md/);
  });

  test("Simulate-absorb pushes evaluate.md with attempt and criterion (R52)", () => {
    assert.match(sa, /## Push\s*\n\s*operators\/evaluate\.md/);
    assert.match(sa, /attempt:\s*\|/);
    assert.match(sa, /criterion:\s*\|/);
  });

  test("Simulate-absorb criterion is ./scoped/task.md (R67)", () => {
    assert.match(sa, /\.\/scoped\/task\.md/);
    assert.doesNotMatch(sa, /\.\.\/\.\.\/workspace/);
  });

  test("Simulate-absorb R53 malformed branch synthesises fail verdict + Pending Questions", () => {
    assert.match(sa, /## Pending Questions/);
    assert.doesNotMatch(sa, /## State\s*\n\s*waiting_for_user/);
  });
});

describe("phase-6b b-lats: Back-prop primitive (R55)", () => {
  const s = readFileSync(resolve(INTERP, "INSTRUCTIONS.md"), "utf-8");

  test("preamble defines a backprop function (R55)", () => {
    assert.match(s, /\bbackprop\b/);
  });

  test("backprop walks parent chain (while … parent_id) (R55)", () => {
    const m = s.match(/backprop\s*\(\)\s*\{[\s\S]+?\n\}/);
    assert.ok(m, "backprop function body missing");
    assert.match(m[0], /while/);
    assert.match(m[0], /parent_id/);
  });

  test("backprop increments n and adds reward to q (R55)", () => {
    const m = s.match(/backprop\s*\(\)\s*\{[\s\S]+?\n\}/);
    assert.ok(m, "backprop function body missing");
    assert.match(m[0], /N\s*\+\s*1|n\s*=\s*N\s*\+\s*1|\$\(\(\s*N\s*\+\s*1\s*\)\)/);
    assert.match(m[0], /Q\s*\+\s*\$REWARD|\$Q\s*\+\s*\$REWARD/);
  });
});

describe("phase-6b b-lats: Evaluate-absorb (R54, R56, R57, R82)", () => {
  const s = readFileSync(resolve(INTERP, "INSTRUCTIONS.md"), "utf-8");
  const ea = extractInstructionBody(s, "Evaluate-absorb");

  test("Evaluate-absorb maps verdict to reward 0/1 (R54)", () => {
    assert.match(ea, /pass\)\s+REWARD=1/);
    assert.match(ea, /fail\)\s+REWARD=0/);
  });

  test("Evaluate-absorb invokes backprop with chosen_child (R55)", () => {
    assert.match(ea, /backprop\s+"\$CC"\s+"\$REWARD"|backprop\s+\$CC\s+\$REWARD/);
  });

  test("reward=1 marks chosen_child terminal_pass and emits ## Solution + done (R56)", () => {
    assert.match(ea, /terminal_pass/);
    assert.match(ea, /## Solution/);
    assert.match(ea, /## State\s*\n\s*done/);
  });

  test("reward=0 transitions to reflecting and does NOT mark terminal_fail (R57)", () => {
    assert.match(ea, /reflecting/);
    assert.match(ea, /NEXT_STATE\s*=\s*reflecting|state\s*\n\s*reflecting/);
  });

  test("Record-A: no rollout intermediate states are appended to tree.md (R82)", () => {
    assert.doesNotMatch(ea, /cat\s*>>\s*\.\/scoped\/tree\.md/);
    assert.doesNotMatch(ea, />>\s*\.\/scoped\/tree\.md/);
  });
});

describe("phase-6b b-lats: Reflect-push (R58)", () => {
  const s = readFileSync(resolve(INTERP, "INSTRUCTIONS.md"), "utf-8");
  const rp = extractInstructionBody(s, "Reflect-push");

  test("Reflect-push pushes operators/reflect.md (R58)", () => {
    assert.match(rp, /## Push\s*\n\s*operators\/reflect\.md/);
  });

  test("Reflect-push push-args attempt + verdict=fail + feedback (R58)", () => {
    assert.match(rp, /attempt:\s*\|/);
    assert.match(rp, /verdict:\s*fail/);
    assert.match(rp, /feedback:\s*\|/);
  });
});

describe("phase-6b b-lats: Reflect-absorb (R59, R60, R61, R63)", () => {
  const s = readFileSync(resolve(INTERP, "INSTRUCTIONS.md"), "utf-8");
  const ra = extractInstructionBody(s, "Reflect-absorb");

  test("Reflect-absorb appends to ./scoped/lessons-${CC}.md with >> (R59, R65)", () => {
    assert.match(ra, />>\s*"?\.\/scoped\/lessons-/);
  });

  test("Reflect-absorb increments iter_count and writes back (R61)", () => {
    assert.match(ra, /\.\/scoped\/iter_count\.md/);
    assert.match(ra, /ITER\s*\+\s*1|\$\(\(\s*ITER\s*\+\s*1\s*\)\)/);
  });

  test("Reflect-absorb compares iter_count vs max_iterations (R61)", () => {
    assert.match(ra, /\.\/scoped\/max_iterations\.md/);
    assert.match(ra, /-ge\s+"\$MAX"|\bge\b/);
  });

  test("Budget exhaustion emits ## No Solution Found and done (R61, R63)", () => {
    assert.match(ra, /## No Solution Found/);
    assert.match(ra, /## State\s*\n\s*done/);
  });

  test("Non-exhausted path transitions to selecting for next iteration (R61)", () => {
    assert.match(ra, /## State\s*\n\s*selecting/);
  });

  test("Malformed Lesson handling: Pending Questions, no waiting_for_user (R60)", () => {
    assert.match(ra, /## Pending Questions/);
    assert.doesNotMatch(ra, /## State\s*\n\s*waiting_for_user/);
  });
});

describe("phase-6b b-lats: termination invariants (R62, R63)", () => {
  const s = readFileSync(resolve(INTERP, "INSTRUCTIONS.md"), "utf-8");

  test("every state==done write co-occurs with Solution or No Solution Found (R63)", () => {
    const heredocs = s.match(/cat\s*>\s*\.\/MEMORY\.md\s*<<\s*[A-Z_]+_EOF[\s\S]+?[A-Z_]+_EOF/g) || [];
    for (const h of heredocs) {
      if (/## State\s*\n\s*done/.test(h)) {
        assert.ok(
          /## Solution/.test(h) || /## No Solution Found/.test(h),
          "found state==done heredoc without Solution/No-Solution-Found: " + h.slice(0, 200),
        );
      }
    }
  });
});

describe("phase-6b b-lats: leaf README content (R3)", () => {
  const readme = readFileSync(resolve(INTERP, "README.md"), "utf-8");

  test("README cites Zhou et al. arXiv:2310.04406 (R3)", () => {
    assert.match(readme, /Zhou\s+et\s+al/i);
    assert.match(readme, /2310\.04406/);
  });

  test("README has state-machine summary (R3)", () => {
    for (const st of ["selecting", "expanding", "simulating", "evaluating", "reflecting", "done"]) {
      assert.match(readme, new RegExp(`\\b${st}\\b`));
    }
  });

  test("README has dynamics-and-contracts table (R3)", () => {
    for (const dy of ["expand-node.md", "rollout.md", "evaluate.md", "reflect.md"]) {
      assert.match(readme, new RegExp(escapeRegExp(dy)));
    }
  });

  test("README has Run-it section with new-instance.sh and run.sh (R3)", () => {
    assert.match(readme, /new-instance\.sh.*b-lats/);
    assert.match(readme, /run\.sh/);
  });

  test("README has Notable behaviour section (R3)", () => {
    assert.match(readme, /## Notable behaviour/);
    assert.match(readme, /score\.md/i);
    assert.match(readme, /pruning/i);
    assert.match(readme, /ancestor/i);
    assert.match(readme, /record-A|materiali[sz]e/i);
  });

  test("README mentions Solution / No Solution Found terminal sections (R70 witness)", () => {
    assert.match(readme, /## Solution/);
    assert.match(readme, /## No Solution Found/);
  });
});

describe("phase-6b b-lats: negative-requirement pins (R76–R83)", () => {
  const inst = readFileSync(resolve(INTERP, "INSTRUCTIONS.md"), "utf-8");

  test("strategy never references workspace/ (R76)", () => {
    assert.doesNotMatch(inst, /\.\.\/\.\.\/workspace/);
    assert.doesNotMatch(inst, /\bworkspace\//);
  });

  test("operators/ does not contain score.md (R77)", () => {
    assert.ok(!existsSync(resolve(INTERP, "operators/score.md")));
  });

  test("strategy declares no Prune instruction (R78)", () => {
    assert.doesNotMatch(inst, /^## Instruction:\s*Prune\b/m);
  });

  test("strategy never uses 'pruning' as a state (R78)", () => {
    assert.doesNotMatch(inst, /## State\s*\n\s*pruning/);
  });

  test("hyperparameters not parsed from PROGRAM.md (R79)", () => {
    const init = extractInstructionBody(inst, "Initialize");
    assert.doesNotMatch(init, /grep[^\n]*max_iterations[^\n]*PROGRAM\.md/);
    assert.doesNotMatch(init, /grep[^\n]*uct_c[^\n]*PROGRAM\.md/);
    const lines = init.split("\n").filter((l) => l.includes("PROGRAM.md"));
    for (const l of lines) {
      assert.ok(/cp\s+\.\.\/\.\.\/PROGRAM\.md/.test(l) || l.trim().startsWith("#"),
        `PROGRAM.md touched by non-cp instruction: ${l}`);
    }
  });

  test("strategy uses no concurrency primitives (R80)", () => {
    assert.doesNotMatch(inst, /xargs\s+-P\b/);
    assert.doesNotMatch(inst, /\sparallel\b/);
    const lines = inst.split("\n");
    for (const l of lines) {
      if (/\s&\s*$/.test(l) && !/&&\s*$/.test(l)) {
        assert.fail(`Line ends with backgrounding &: ${l}`);
      }
    }
  });

  test("strategy never reads/writes ../scoped or ../../scoped (R81)", () => {
    assert.doesNotMatch(inst, /\.\.\/scoped/);
    assert.doesNotMatch(inst, /\.\.\/\.\.\/scoped/);
    assert.doesNotMatch(inst, /frames\/f\d+/);
  });

  test("INSTRUCTIONS.md vocabulary check (R83)", () => {
    const banned = [
      "Game of 24", "arithmetic", "+", "−", "×", "÷",
      "maze", "code", "function", "test suite", "puzzle numbers",
    ];
    for (const word of banned) {
      if (word.length > 1) {
        assert.ok(!inst.includes(word), `INSTRUCTIONS.md contains banned domain word: "${word}"`);
      }
    }
  });

  test("operators/ vocabulary check — none of the four contains domain vocab (R83)", () => {
    const dyns = ["expand-node.md", "rollout.md", "evaluate.md", "reflect.md"];
    const banned = ["Game of 24", "Game-of-24", "arithmetic", "maze", "function", "test suite"];
    for (const dy of dyns) {
      const s = readFileSync(resolve(INTERP, "operators", dy), "utf-8");
      for (const word of banned) {
        assert.ok(!s.includes(word), `${dy} contains banned domain word: "${word}"`);
      }
    }
  });
});

describe("phase-6b: parent doc updates (R73, R74, R75)", () => {
  const parent = readFileSync(resolve(REPO, "docs/agent-workflows/requirements.md"), "utf-8");

  test("dynamics table has expand-node.md row with Partial State and Task (R73)", () => {
    assert.match(parent, /\|\s*`expand-node\.md`\s*\|\s*6\s*\|\s*## Partial State[^|]*## Task/);
  });

  test("dynamics table has score.md row with Partial State and Task (R73)", () => {
    assert.match(parent, /\|\s*`score\.md`\s*\|\s*6\s*\|\s*## Partial State[^|]*## Task/);
  });

  test("dynamics table has rollout.md row at Phase 6b (R73)", () => {
    assert.match(parent, /\|\s*`rollout\.md`\s*\|\s*6b\s*\|\s*## Partial State[^|]*## Task[^|]*\|\s*## Terminal State/);
  });

  test("Phase 6b section mentions rollout.md as a new operator (R74)", () => {
    const m6b = parent.match(/## Phase 6b[^]+?(?=^## Phase 7|\z)/m);
    assert.ok(m6b, "Phase 6b section missing");
    assert.match(m6b[0], /rollout\.md/);
    assert.match(m6b[0], /one new operator/i);
  });

  test("Phase 6b section no longer claims 'no new dynamics' (R74)", () => {
    const m6b = parent.match(/## Phase 6b[^]+?(?=^## Phase 7|\z)/m);
    assert.ok(m6b, "Phase 6b section missing");
    assert.doesNotMatch(m6b[0], /no new operators/i);
  });

  test("Phase 6 section mentions generalisation in Phase 6b (R75)", () => {
    const m6 = parent.match(/## Phase 3 — Planning[^]*?## Phase 6 —[^]+?(?=^## Phase 6b|\z)/m);
    assert.ok(m6, "Phase 6 section missing");
    assert.match(m6[0], /Generalised in Phase 6b|generalised in Phase 6b/i);
  });
});

describe("phase-6b: backwards compatibility (R28, R85, R86)", () => {
  const PHASE6_SPEC = resolve(REPO, "docs/specs/2026-04-30-agent-workflows-phase-6");

  test("Phase 6 spec dir still has all three artefacts (R28, R85)", () => {
    for (const f of ["requirements.md", "design.md", "tasks.md"]) {
      assert.ok(existsSync(resolve(PHASE6_SPEC, f)), `Phase 6 spec ${f} missing`);
    }
  });

  test("Phase 6 spec requirements.md still mentions its own R IDs unchanged (R28, R85)", () => {
    const s = readFileSync(resolve(PHASE6_SPEC, "requirements.md"), "utf-8");
    assert.match(s, /\*\*R11\*\*/);
    assert.match(s, /\*\*R29\*\*/);
    assert.match(s, /\*\*R35\*\*/);
    assert.match(s, /\*\*R51\*\*/);
    assert.match(s, /\*\*R57\*\*/);
    assert.match(s, /LATS \(Phase 6b\)/);
  });

  test("new-instance.sh copies dynamics at creation (R86 supports backward compat)", () => {
    const sh = readFileSync(resolve(REPO, "new-instance.sh"), "utf-8");
    assert.match(sh, /cp\s+-r\s+"\$INTERP_DIR\/dynamics"\s+"\$DIR\/dynamics"/);
  });
});
