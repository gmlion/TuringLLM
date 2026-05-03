import { test, describe } from "node:test";
import { strict as assert } from "node:assert";
import { existsSync, readFileSync, readdirSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { execSync } from "child_process";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

describe("R1: aflow-lite directory layout", () => {
  test("interpreters/7-meta-framework/a-aflow-lite/ exists", () => {
    assert.ok(existsSync(resolve(REPO, "interpreters/7-meta-framework/a-aflow-lite")));
  });
  test("INSTRUCTIONS.md is a single-line marker", () => {
    const inst = readFileSync(resolve(REPO, "interpreters/7-meta-framework/a-aflow-lite/INSTRUCTIONS.md"), "utf-8").trim();
    assert.equal(inst, "operators/aflow-lite.md");
  });
  test("operators/ dir exists", () => {
    assert.ok(existsSync(resolve(REPO, "interpreters/7-meta-framework/a-aflow-lite/operators")));
  });
  test("PROGRAM.md exists", () => {
    assert.ok(existsSync(resolve(REPO, "interpreters/7-meta-framework/a-aflow-lite/PROGRAM.md")));
  });
});

describe("R2: group README exists", () => {
  test("interpreters/7-meta-framework/README.md exists and mentions aflow-lite", () => {
    const p = resolve(REPO, "interpreters/7-meta-framework/README.md");
    assert.ok(existsSync(p));
    const content = readFileSync(p, "utf-8");
    assert.match(content, /aflow-lite/i);
  });
});

describe("R3: leaf README exists", () => {
  test("interpreters/7-meta-framework/a-aflow-lite/README.md exists", () => {
    assert.ok(existsSync(resolve(REPO, "interpreters/7-meta-framework/a-aflow-lite/README.md")));
  });
});

describe("R10: no 'dynamics/' substring outside frozen spec dirs", () => {
  test("git grep returns nothing", () => {
    const excludes = [
      ":!docs/specs/2026-04-23-agent-workflows-phase-2b-push-returns/",
      ":!docs/specs/2026-04-24-implement-phase-3-and-4/",
      ":!docs/specs/2026-04-30-agent-workflows-phase-6/",
      ":!docs/specs/2026-05-01-implement-phase-6b/",
      ":!docs/specs/2026-05-02-phase-7-including-cove-and-1b-in-addition-or-instead-of-1a/",
      ":!src/test/phase-7-aflow-lite.test.ts",
    ].join(" ");
    let out = "";
    try {
      out = execSync(`git grep -l "dynamics/" -- ${excludes}`, { cwd: REPO, encoding: "utf-8" }).trim();
    } catch (e: any) {
      out = "";
    }
    assert.equal(out, "", `unexpected 'dynamics/' references: ${out}`);
  });
});

describe("R48: workspace/gsm8k.jsonl fixture", () => {
  const FIXTURE = "interpreters/7-meta-framework/a-aflow-lite/workspace/gsm8k.jsonl";
  test("fixture exists", () => {
    assert.ok(existsSync(resolve(REPO, FIXTURE)));
  });
  test("fixture has exactly 20 lines, each parseable JSON with question (string) + answer (integer)", () => {
    const lines = readFileSync(resolve(REPO, FIXTURE), "utf-8").trim().split("\n");
    assert.equal(lines.length, 20, "expected 20 items");
    for (let i = 0; i < lines.length; i++) {
      const obj = JSON.parse(lines[i]);
      assert.equal(typeof obj.question, "string", `item ${i}: question not string`);
      assert.ok(obj.question.length > 10, `item ${i}: question too short`);
      assert.equal(typeof obj.answer, "number", `item ${i}: answer not number`);
      assert.ok(Number.isInteger(obj.answer), `item ${i}: answer not integer`);
    }
  });
});

describe("R49: PROGRAM.md is short prose pointing at fixture", () => {
  const PROG = "interpreters/7-meta-framework/a-aflow-lite/PROGRAM.md";
  test("PROGRAM.md exists and references workspace/gsm8k.jsonl", () => {
    const content = readFileSync(resolve(REPO, PROG), "utf-8");
    assert.match(content, /workspace\/gsm8k\.jsonl/);
    assert.match(content, /GSM8K/);
  });
});

describe("R28: aflow-lite.md is the canonical operator", () => {
  const OP = "interpreters/7-meta-framework/a-aflow-lite/operators/aflow-lite.md";
  test("operators/aflow-lite.md exists", () => {
    assert.ok(existsSync(resolve(REPO, OP)));
  });
  test("file has a strategy preamble naming the meta-framework", () => {
    const content = readFileSync(resolve(REPO, OP), "utf-8");
    assert.match(content, /# Operator: AFlow-lite/i);
    assert.match(content, /MCTS/);
    assert.match(content, /workflow/i);
  });
});

describe("R31: hardcoded operator library", () => {
  const OP = "interpreters/7-meta-framework/a-aflow-lite/operators/aflow-lite.md";
  test("library is exactly refine,reflexion,cove,plan-execute,debate", () => {
    const content = readFileSync(resolve(REPO, OP), "utf-8");
    assert.match(content, /LIBRARY="refine,reflexion,cove,plan-execute,debate"/);
  });
  test("library does NOT include MoA, self-refine, tot, lats, metagpt, chatdev", () => {
    const content = readFileSync(resolve(REPO, OP), "utf-8");
    assert.doesNotMatch(content, /LIBRARY=.*\bMoA\b/);
    assert.doesNotMatch(content, /LIBRARY=.*\bself-refine\b/);
    assert.doesNotMatch(content, /LIBRARY=.*\btot\b/);
    assert.doesNotMatch(content, /LIBRARY=.*\blats\b/);
    assert.doesNotMatch(content, /LIBRARY=.*\bmetagpt\b/);
    assert.doesNotMatch(content, /LIBRARY=.*\bchatdev\b/);
  });
});

describe("R28/R29/R30: scoped files schema and tree ledger setup", () => {
  const OP = "interpreters/7-meta-framework/a-aflow-lite/operators/aflow-lite.md";
  test("preamble lists scoped files: tree.md, task.md, max_iterations.md, uct_c.md, iter_count.md, benchmark_items.md, state-<id>.md", () => {
    const content = readFileSync(resolve(REPO, OP), "utf-8");
    for (const f of ["tree.md", "task.md", "max_iterations.md", "uct_c.md", "iter_count.md", "benchmark_items.md", "state-"]) {
      assert.match(content, new RegExp(f.replace(".", "\\.").replace("-", "\\-")), `preamble missing scoped/${f}`);
    }
  });
});

describe("R36/R50: Initialize loads fixture and samples 3 items deterministically", () => {
  const OP = "interpreters/7-meta-framework/a-aflow-lite/operators/aflow-lite.md";
  test("Initialize instruction matches state empty", () => {
    const content = readFileSync(resolve(REPO, OP), "utf-8");
    assert.match(content, /## Instruction: Initialize/);
    assert.match(content, /MEMORY state is "empty"/);
  });
  test("Initialize loads workspace/gsm8k.jsonl", () => {
    const content = readFileSync(resolve(REPO, OP), "utf-8");
    assert.match(content, /workspace\/gsm8k\.jsonl/);
  });
  test("Initialize writes max_iterations=10, uct_c≈1.41421356, iter_count=0", () => {
    const content = readFileSync(resolve(REPO, OP), "utf-8");
    assert.match(content, /max_iterations\.md.*10|10.*max_iterations\.md/s);
    assert.match(content, /1\.41421356/);
    assert.match(content, /iter_count\.md.*0|0.*iter_count\.md/s);
  });
  test("Initialize samples 3 items and persists to scoped/benchmark_items.md", () => {
    const content = readFileSync(resolve(REPO, OP), "utf-8");
    assert.match(content, /benchmark_items\.md/);
    // Some indication of 3-item sampling
    assert.match(content, /\b3\b/);
  });
  test("Initialize creates root n0 (empty workflow) and transitions to selecting", () => {
    const content = readFileSync(resolve(REPO, OP), "utf-8");
    assert.match(content, /n0/);
    assert.match(content, /state-n0\.md/);
    assert.match(content, /selecting/);
  });
});

describe("R29: aflow-lite has tree ledger primitives (Phase 6b reuse)", () => {
  const OP = "interpreters/7-meta-framework/a-aflow-lite/operators/aflow-lite.md";
  test("declares append_node helper or pattern — heredoc writing id/parent_id/depth/q/n/status", () => {
    const content = readFileSync(resolve(REPO, OP), "utf-8");
    // Heredoc that actually writes a node with all 6 fields
    assert.match(content, /cat >> .*tree\.md/);
    assert.match(content, /parent_id:/);
    assert.match(content, /depth:/);
    assert.match(content, /status: live/);
  });
  test("declares update-field helper or pattern (awk surgical in-place edit of q and n)", () => {
    const content = readFileSync(resolve(REPO, OP), "utf-8");
    // Must have awk-based surgical update with tree.md.tmp pattern (as in LATS)
    assert.match(content, /tree\.md\.tmp/);
    assert.match(content, /awk.*\bq:\b|awk.*print.*"q:/);
  });
  test("declares back-prop or walk-parents pattern as a named bash function", () => {
    const content = readFileSync(resolve(REPO, OP), "utf-8");
    // Must have a named backprop/walk-parents function definition
    assert.match(content, /backprop\s*\(\)|backprop\(\)/);
    // Must walk parent chain
    assert.match(content, /parent_id.*exit|exit.*parent_id/s);
  });
  test("next monotonic id helper uses grep -c pattern", () => {
    const content = readFileSync(resolve(REPO, OP), "utf-8");
    assert.match(content, /grep -c.*id: n|NEXT_INDEX/);
  });
});

describe("R26/R34: 12 operators copied byte-equal into aflow-lite", () => {
  const COPIES = [
    ["refine.md",                "interpreters/1-iterative-refinement/b-evaluator-optimizer/operators/refine.md"],
    ["reflexion.md",             "interpreters/1-iterative-refinement/c-reflexion/operators/reflexion.md"],
    ["cove.md",                  "interpreters/1-iterative-refinement/d-cove/operators/cove.md"],
    ["plan-execute.md",          "interpreters/2-planning-decomposition/a-plan-execute/operators/plan-execute.md"],
    ["debate.md",                "interpreters/4-peer-collaboration/a-debate/operators/debate.md"],
    ["evaluate.md",              "interpreters/1-iterative-refinement/b-evaluator-optimizer/operators/evaluate.md"],
    ["reflect.md",               "interpreters/1-iterative-refinement/c-reflexion/operators/reflect.md"],
    ["verify.md",                "interpreters/1-iterative-refinement/d-cove/operators/verify.md"],
    ["answer-independently.md",  "interpreters/1-iterative-refinement/d-cove/operators/answer-independently.md"],
    ["tackle.md",                "interpreters/2-planning-decomposition/a-plan-execute/operators/tackle.md"],
    ["plan.md",                  "interpreters/2-planning-decomposition/a-plan-execute/operators/plan.md"],
    ["opine.md",                 "interpreters/4-peer-collaboration/a-debate/operators/opine.md"],
  ];
  const AFLOW_DIR = "interpreters/7-meta-framework/a-aflow-lite/operators";
  for (const [name, source] of COPIES) {
    test(`${name} exists in aflow-lite operators/`, () => {
      assert.ok(existsSync(resolve(REPO, AFLOW_DIR, name)), `missing: ${name}`);
    });
    test(`${name} is byte-equal to canonical ${source}`, () => {
      const a = readFileSync(resolve(REPO, AFLOW_DIR, name), "utf-8");
      const b = readFileSync(resolve(REPO, source), "utf-8");
      assert.equal(a, b, `${name} not byte-equal to canonical`);
    });
  }
});

describe("R32: aflow-lite has compose_partial_state helper", () => {
  const OP = "interpreters/7-meta-framework/a-aflow-lite/operators/aflow-lite.md";
  test("compose_partial_state assembles current_workflow + library + recent_scores", () => {
    const content = readFileSync(resolve(REPO, OP), "utf-8");
    assert.match(content, /compose_partial_state|Compose.partial.state|## Partial State/i);
    // It must include the three pieces:
    assert.match(content, /current.workflow|state-\$\{?ID\}?\.md|workflow recipe/i);
    assert.match(content, /\$LIBRARY|library/);
    assert.match(content, /recent_scores/);
  });
});

describe("R29: aflow-lite Select instruction (UCT descent)", () => {
  const OP = "interpreters/7-meta-framework/a-aflow-lite/operators/aflow-lite.md";
  test("Select instruction matches state selecting", () => {
    const content = readFileSync(resolve(REPO, OP), "utf-8");
    assert.match(content, /## Instruction: Select/);
    assert.match(content, /MEMORY state is "selecting"/);
  });
  test("Select uses UCT formula", () => {
    const content = readFileSync(resolve(REPO, OP), "utf-8");
    assert.match(content, /UCT|sqrt.*log|q\/n/i);
    // Some indication of UCT computation (bc -l or similar)
    assert.match(content, /bc -l/);
  });
  test("Select writes cursor.md and transitions to expanding", () => {
    const content = readFileSync(resolve(REPO, OP), "utf-8");
    assert.match(content, /cursor\.md/);
    assert.match(content, /expanding/);
  });
  test("Select uses leftmost tiebreak (R45-equivalent)", () => {
    const content = readFileSync(resolve(REPO, OP), "utf-8");
    assert.match(content, /leftmost|first|tiebreak/i);
  });
});

describe("R32: aflow-lite Expand-push + Expand-absorb", () => {
  const OP = "interpreters/7-meta-framework/a-aflow-lite/operators/aflow-lite.md";
  test("Expand-push instruction matches state expanding and pushes operators/expand-workflow.md", () => {
    const content = readFileSync(resolve(REPO, OP), "utf-8");
    assert.match(content, /## Instruction: Expand-push|## Instruction: Expand push/);
    assert.match(content, /MEMORY state is "expanding"/);
    assert.match(content, /## Push\s*\n\s*operators\/expand-workflow\.md/);
  });
  test("Expand-push declares both push-args partial_state and task", () => {
    const content = readFileSync(resolve(REPO, OP), "utf-8");
    assert.match(content, /## Push-Args/);
    assert.match(content, /partial_state:\s*\|/);
    assert.match(content, /task:\s*\|/);
  });
  test("Expand-absorb instruction matches expanding_completed and parses ## Children", () => {
    const content = readFileSync(resolve(REPO, OP), "utf-8");
    assert.match(content, /## Instruction: Expand-absorb|## Instruction: Expand absorb/);
    assert.match(content, /expanding_completed/);
    assert.match(content, /## Children|Children/);
  });
  test("Expand-absorb writes state-<id>.md per child, sets chosen_child", () => {
    const content = readFileSync(resolve(REPO, OP), "utf-8");
    assert.match(content, /state-\$\{?ID\}?\.md|state-\$\w+\.md/);
    assert.match(content, /chosen_child\.md/);
  });
  test("Expand-absorb transitions to simulating", () => {
    const content = readFileSync(resolve(REPO, OP), "utf-8");
    assert.match(content, /simulating/);
  });
});

describe("R41/R42/R43/R44: expand-workflow.md operator", () => {
  const OP = "interpreters/7-meta-framework/a-aflow-lite/operators/expand-workflow.md";
  test("file exists", () => {
    assert.ok(existsSync(resolve(REPO, OP)));
  });
  test("R41: declares {{partial_state}} and {{task}} push-args", () => {
    const content = readFileSync(resolve(REPO, OP), "utf-8");
    assert.match(content, /\{\{partial_state\}\}/);
    assert.match(content, /\{\{task\}\}/);
  });
  test("R42: single-cycle — one Instruction matching state empty", () => {
    const content = readFileSync(resolve(REPO, OP), "utf-8");
    const instructions = content.match(/^## Instruction:/gm) || [];
    assert.equal(instructions.length, 1, `expected 1 instruction, found ${instructions.length}`);
    assert.match(content, /MEMORY state is "empty"/);
  });
  test("R42: emits ## Return\\nchildren: |", () => {
    const content = readFileSync(resolve(REPO, OP), "utf-8");
    assert.match(content, /## Return\s*\n\s*children:\s*\|/);
  });
  test("R43: domain-agnostic prose — no GSM8K, math, arithmetic, target, maze, code, etc.", () => {
    const content = readFileSync(resolve(REPO, OP), "utf-8");
    for (const word of ["GSM8K", "arithmetic", "Game of 24", "target", "maze", "test suite"]) {
      assert.doesNotMatch(content, new RegExp(`\\b${word}\\b`, "i"), `unexpected domain word: ${word}`);
    }
    // "math" is potentially too generic — accept it in the explicit "this operator is domain-agnostic" sense if any.
    // But strict mode: ensure the example/instruction text doesn't say "math problem"
    assert.doesNotMatch(content, /\bmath problem\b/i);
  });
  test("R44: no ## Push anywhere in the file body", () => {
    const content = readFileSync(resolve(REPO, OP), "utf-8");
    // Allow "## Push" only inside code-block fences if absolutely necessary; strictest: count zero
    const lines = content.split("\n");
    const pushLines = lines.filter(l => /^## Push/.test(l));
    assert.equal(pushLines.length, 0, `unexpected ## Push line(s): ${pushLines.join(", ")}`);
  });
});

describe("R33: aflow-lite Simulate phase pushes operators per-item with {{task}}+{{prior_answer}}", () => {
  const OP = "interpreters/7-meta-framework/a-aflow-lite/operators/aflow-lite.md";
  test("Simulate-push instruction matches state simulating", () => {
    const content = readFileSync(resolve(REPO, OP), "utf-8");
    assert.match(content, /## Instruction: Simulate-push|## Instruction: Simulate push/);
    assert.match(content, /MEMORY state is "simulating"/);
  });
  test("Simulate pushes a library operator (resolved from workflow recipe)", () => {
    const content = readFileSync(resolve(REPO, OP), "utf-8");
    // Should compose a push to operators/${OPNAME}.md based on workflow recipe
    assert.match(content, /operators\/\$\{?OP\w*\}?\.md|operators\/\$OP\w*\.md/);
  });
  test("Simulate-push declares task and prior_answer push-args", () => {
    const content = readFileSync(resolve(REPO, OP), "utf-8");
    assert.match(content, /task:\s*\|/);
    assert.match(content, /prior_answer:\s*\|/);
  });
  test("R35: integer extraction via regex [-+]?\\d+", () => {
    const content = readFileSync(resolve(REPO, OP), "utf-8");
    // Should grep or sed for an integer pattern
    assert.match(content, /\[-\+\]\?\\?d\+|grep.*-o.*[0-9]|grep -oE.*\[0-9\]/);
  });
  test("Simulate-absorb tracks 3 items and accumulates scores", () => {
    const content = readFileSync(resolve(REPO, OP), "utf-8");
    // Some indication of per-item iteration over 3 items
    assert.match(content, /current_item|item_index|sim\/scores/);
  });
});

describe("R37/R38: aflow-lite Evaluate-absorb computes reward and back-props", () => {
  const OP = "interpreters/7-meta-framework/a-aflow-lite/operators/aflow-lite.md";
  test("Evaluate-absorb instruction matches state evaluating", () => {
    const content = readFileSync(resolve(REPO, OP), "utf-8");
    assert.match(content, /## Instruction: Evaluate-absorb|## Instruction: Evaluate absorb/);
    assert.match(content, /MEMORY state is "evaluating"/);
  });
  test("R37: reward = mean fraction passing (0-1, three discrete tiers)", () => {
    const content = readFileSync(resolve(REPO, OP), "utf-8");
    // Some indication of computing mean of scores.md
    assert.match(content, /scores\.md/);
    // Some arithmetic for mean
    assert.match(content, /bc -l|awk.*\/3|awk.*sum/);
  });
  test("R38: termination on reward == 1.0", () => {
    const content = readFileSync(resolve(REPO, OP), "utf-8");
    assert.match(content, /## Solution/);
    // Termination on perfect score
    assert.match(content, /1\.0|\$REWARD" = "1|REWARD == 1|reward.*1\.0/i);
  });
  test("R38: termination on iter_count >= max_iterations", () => {
    const content = readFileSync(resolve(REPO, OP), "utf-8");
    assert.match(content, /max_iterations\.md/);
    assert.match(content, /## No Solution Found/);
  });
  test("R38: terminal cycle emits ## Return\\nanswer:", () => {
    const content = readFileSync(resolve(REPO, OP), "utf-8");
    // Both terminal paths should write ## Return answer:
    const matches = content.match(/## Return\s*\n\s*answer:/g) || [];
    assert.ok(matches.length >= 1, `expected at least one ## Return answer: block, found ${matches.length}`);
  });
});

describe("R39/R65: no meta-reflexion in aflow-lite", () => {
  const OP = "interpreters/7-meta-framework/a-aflow-lite/operators/aflow-lite.md";
  test("aflow-lite.md does NOT push reflect.md", () => {
    const content = readFileSync(resolve(REPO, OP), "utf-8");
    assert.doesNotMatch(content, /## Push\s*\n\s*operators\/reflect\.md/);
    assert.doesNotMatch(content, /## Push\s+operators\/reflect\.md/);
  });
});

describe("R40/R66: no nested shell instances", () => {
  const OP = "interpreters/7-meta-framework/a-aflow-lite/operators/aflow-lite.md";
  test("aflow-lite.md does not spawn child node processes", () => {
    const content = readFileSync(resolve(REPO, OP), "utf-8");
    // Check for shell invocations of node (e.g. "node script.js" or "node src/") — not the English word "node"
    assert.doesNotMatch(content, /\bnode\s+[./]/);
    assert.doesNotMatch(content, /spawn\(|execFile\(/);
    assert.doesNotMatch(content, /child_process/);
  });
});

describe("R72: no '## Aflow Answer' tag — uses canonical ## Return answer:", () => {
  const OP = "interpreters/7-meta-framework/a-aflow-lite/operators/aflow-lite.md";
  test("no ## Aflow Answer tag", () => {
    const content = readFileSync(resolve(REPO, OP), "utf-8");
    assert.doesNotMatch(content, /## Aflow Answer/i);
  });
});

describe("R2: group README full content", () => {
  const README = "interpreters/7-meta-framework/README.md";
  test("group README cites AFlow paper", () => {
    const content = readFileSync(resolve(REPO, README), "utf-8");
    assert.match(content, /Zhang et al/);
    assert.match(content, /arXiv:2410\.10762/);
  });
  test("group README lists aflow-lite as the v1 member", () => {
    const content = readFileSync(resolve(REPO, README), "utf-8");
    assert.match(content, /a-aflow-lite/);
  });
});

describe("R3: leaf README full content", () => {
  const README = "interpreters/7-meta-framework/a-aflow-lite/README.md";
  test("leaf README cites AFlow paper", () => {
    const content = readFileSync(resolve(REPO, README), "utf-8");
    assert.match(content, /arXiv:2410\.10762/);
  });
  test("leaf README documents operator library + exclusions", () => {
    const content = readFileSync(resolve(REPO, README), "utf-8");
    for (const op of ["refine", "reflexion", "cove", "plan-execute", "debate"]) {
      assert.match(content, new RegExp(`\\b${op}\\b`), `leaf README missing operator ${op}`);
    }
    // Exclusions mentioned (MoA in particular)
    assert.match(content, /MoA/);
  });
  test("leaf README has MCTS state machine summary", () => {
    const content = readFileSync(resolve(REPO, README), "utf-8");
    assert.match(content, /MCTS/);
    for (const phase of ["Select", "Expand", "Simulate", "Evaluate"]) {
      assert.match(content, new RegExp(`\\b${phase}`));
    }
  });
  test("leaf README has demo description (GSM8K) + run-it section", () => {
    const content = readFileSync(resolve(REPO, README), "utf-8");
    assert.match(content, /GSM8K/);
    assert.match(content, /Run.*it|Run instructions|## Run/i);
    assert.match(content, /new-instance\.sh/);
  });
  test("leaf README has Notable behaviour section (no MoA, no meta-reflexion)", () => {
    const content = readFileSync(resolve(REPO, README), "utf-8");
    assert.match(content, /Notable behaviour|Notable behavior/i);
    // Mentions the v1 limitations
    assert.match(content, /meta.?reflexion/i);
  });
});

describe("R56: source-spec parent doc updates", () => {
  const PARENT = "docs/agent-workflows/requirements.md";
  test("section heading: 'Reusable operators library'", () => {
    const content = readFileSync(resolve(REPO, PARENT), "utf-8");
    assert.match(content, /## Reusable operators library|# Reusable operators library/);
    // Old heading should be gone
    assert.doesNotMatch(content, /Reusable dynamics library/);
  });
  test("table row for expand-workflow.md", () => {
    const content = readFileSync(resolve(REPO, PARENT), "utf-8");
    assert.match(content, /\|\s*`expand-workflow\.md`\s*\|/);
  });
  test("Phase 7 section mentions actual deliverables (operator library, no nested shell)", () => {
    const content = readFileSync(resolve(REPO, PARENT), "utf-8");
    // The Phase 7 section should mention the real library and AFlow citation
    const phase7Match = content.match(/## Phase 7[\s\S]+?(?=## Phase 8|$)/);
    assert.ok(phase7Match, "Phase 7 section not found");
    const p7 = phase7Match[0];
    assert.match(p7, /aflow-lite/i);
    assert.match(p7, /arXiv:2410\.10762/);
    // Operator library list (refine,reflexion,cove,plan-execute,debate)
    for (const op of ["refine", "reflexion", "cove", "plan-execute", "debate"]) {
      assert.match(p7, new RegExp(`\\b${op}\\b`), `Phase 7 section missing operator ${op}`);
    }
    // No more speculative "evaluate-workflow nested shell" prose
    assert.doesNotMatch(p7, /nested shell invocation/i);
  });
});

describe("Negative pins R61–R72: aflow-lite is constrained as designed", () => {
  const OP = "interpreters/7-meta-framework/a-aflow-lite/operators/aflow-lite.md";
  const AFLOW_OPERATORS_DIR = "interpreters/7-meta-framework/a-aflow-lite/operators";

  test("R31: library is exactly refine,reflexion,cove,plan-execute,debate", () => {
    const content = readFileSync(resolve(REPO, OP), "utf-8");
    assert.match(content, /LIBRARY="refine,reflexion,cove,plan-execute,debate"/);
  });

  test("R61/R62/R63/R64: library excludes self-refine, MoA, tot, lats, metagpt, chatdev", () => {
    const content = readFileSync(resolve(REPO, OP), "utf-8");
    const libMatch = content.match(/LIBRARY="([^"]*)"/);
    assert.ok(libMatch, "LIBRARY assignment not found");
    const lib = libMatch[1];
    for (const excluded of ["self-refine", "MoA", "tot", "lats", "metagpt", "chatdev"]) {
      assert.ok(!lib.includes(excluded), `library should not include ${excluded}: ${lib}`);
    }
  });

  test("R39/R65: no meta-reflexion (no push to reflect.md from aflow-lite.md)", () => {
    const content = readFileSync(resolve(REPO, OP), "utf-8");
    // No literal "## Push reflect.md" or "## Push\n...operators/reflect.md" pattern
    assert.doesNotMatch(content, /## Push[^\n]*\n[^\n]*operators\/reflect\.md/);
    assert.doesNotMatch(content, /## Push\s+operators\/reflect\.md/);
  });

  test("R40/R66: no nested shell instances (no node, spawn, execFile, child_process)", () => {
    const content = readFileSync(resolve(REPO, OP), "utf-8");
    assert.doesNotMatch(content, /\bnode\s+[./]/);
    assert.doesNotMatch(content, /\bspawn\(/);
    assert.doesNotMatch(content, /\bexecFile\(/);
    assert.doesNotMatch(content, /child_process/);
  });

  test("R70: no concurrency primitives", () => {
    const content = readFileSync(resolve(REPO, OP), "utf-8");
    assert.doesNotMatch(content, /xargs\s+-P\b/);
    assert.doesNotMatch(content, /\bparallel\b\s+/);
    // No trailing & for backgrounding (excluding `&&` chains and `>&` redirections):
    // Match a `&` that's at end of line and not preceded by another `&` or `>`:
    const lines = content.split("\n");
    for (const line of lines) {
      // Skip non-shell context lines (e.g. prose). Heuristic: only check lines that look like indented bash.
      if (/^    /.test(line) && /[^&>]\s*&\s*$/.test(line)) {
        assert.fail(`apparent backgrounded process: ${line}`);
      }
    }
  });

  test("R71: domain-agnostic vocabulary except in explicit demo-specific block", () => {
    const content = readFileSync(resolve(REPO, OP), "utf-8");
    // The strategy may mention "GSM8K" only in the explicit demo/Initialize-demo context.
    // Soft check: every occurrence of GSM8K should be in or near a comment about the demo.
    // Strict version: count occurrences and accept up to a few inside Initialize.
    const gsm8kMatches = content.match(/GSM8K/g) || [];
    assert.ok(gsm8kMatches.length <= 3, `aflow-lite.md should mention GSM8K at most a few times (in Initialize fixture loading), found ${gsm8kMatches.length}`);
    // No "math problem", "arithmetic", "Game of 24", etc.
    for (const word of ["math problem", "arithmetic", "Game of 24", "Sudoku", "maze"]) {
      assert.doesNotMatch(content, new RegExp(`\\b${word}\\b`, "i"), `unexpected domain word: ${word}`);
    }
  });

  test("R72: no ## Aflow Answer tag — uses canonical ## Return answer:", () => {
    const content = readFileSync(resolve(REPO, OP), "utf-8");
    assert.doesNotMatch(content, /## Aflow Answer/i);
  });

  test("aflow-lite operators/ excludes search/SOP/single-mode operators", () => {
    const dir = resolve(REPO, AFLOW_OPERATORS_DIR);
    const files = readdirSync(dir);
    const excluded = ["score.md", "expand-node.md", "rollout.md", "tot.md", "lats.md", "metagpt.md", "chatdev.md", "self-refine.md"];
    for (const f of excluded) {
      assert.ok(!files.includes(f), `aflow-lite operators/ should not contain ${f}`);
    }
  });
});

describe("R57: interpreters/README.md updates", () => {
  const README = "interpreters/README.md";
  test("README mentions Phase 7 — Meta-frameworks", () => {
    const content = readFileSync(resolve(REPO, README), "utf-8");
    assert.match(content, /Phase 7|7-meta-framework|Meta-framework/i);
  });
  test("operator shortlist mentions the actual five v1 operators", () => {
    const content = readFileSync(resolve(REPO, README), "utf-8");
    // Should mention library and the five operator names somewhere
    for (const op of ["refine", "reflexion", "cove", "plan-execute", "debate"]) {
      assert.match(content, new RegExp(`\\b${op}\\b`), `interpreters README missing ${op}`);
    }
  });
  test("operator shortlist mentions MoA as future scope", () => {
    const content = readFileSync(resolve(REPO, README), "utf-8");
    assert.match(content, /MoA/);
  });
  test("execution-context section mentions root-operator bootstrap", () => {
    const content = readFileSync(resolve(REPO, README), "utf-8");
    assert.match(content, /root.operator/i);
    assert.match(content, /\.root-operator|root.operator bootstrap/);
  });
});
