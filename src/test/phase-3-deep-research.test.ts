import { test, describe } from "node:test";
import { strict as assert } from "node:assert";
import { existsSync, readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO = resolve(__dirname, "../..");
const INTERP = resolve(REPO, "interpreters/2-planning-decomposition/c-deep-research");

describe("phase-3 c-deep-research: layout, PROGRAM, recursion support", () => {
  test("required files exist", () => {
    for (const f of [
      "INSTRUCTIONS.md",
      "PROGRAM.md",
      "README.md",
      "dynamics/plan.md",
      "dynamics/execute-step.md",
      "dynamics/synthesize.md",
    ]) {
      assert.ok(existsSync(resolve(INTERP, f)), `${f} missing`);
    }
  });

  test("PROGRAM.md names Raft, Paxos, Multi-Paxos", () => {
    const p = readFileSync(resolve(INTERP, "PROGRAM.md"), "utf-8");
    assert.match(p, /Raft/);
    assert.match(p, /Paxos/);
    assert.match(p, /Multi.Paxos/);
    assert.match(p, /report\.md/);
  });

  test("execute-step.md contains the recursion branch (push plan.md inside frame)", () => {
    const e = readFileSync(resolve(INTERP, "dynamics/execute-step.md"), "utf-8");
    assert.match(e, /## Push[\s\S]*dynamics\/plan\.md/);
    // Must make the recursion conditional on broad/coarse steps:
    assert.match(e, /broad|coarse|sub-plan|decompose|research area/i);
  });

  test("README names Deep Research AND all four framings (R45 + R65)", () => {
    const r = readFileSync(resolve(INTERP, "README.md"), "utf-8");
    assert.match(r, /Deep Research/);
    assert.match(r, /Self-Ask/);
    assert.match(r, /Plan-and-Execute/);
    assert.match(r, /Orchestrator.Workers/);
    assert.match(r, /XAgent/);
  });

  test("README mentions stack depth 2 and the recursive plan-push behaviour", () => {
    const r = readFileSync(resolve(INTERP, "README.md"), "utf-8");
    assert.match(r, /depth 2|stack.*2|recursive/i);
  });
});
