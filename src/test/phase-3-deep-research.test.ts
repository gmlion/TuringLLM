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
      "operators/plan.md",
      "operators/tackle.md",
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

  test("tackle.md contains the recursion branch (Try → composite path pushes plan.md; iteration pushes tackle.md recursively)", () => {
    const t = readFileSync(resolve(INTERP, "operators/tackle.md"), "utf-8");
    // Composite path -> plan.md
    assert.match(t, /## Push[\s\S]*operators\/plan\.md/);
    // Recursive -> tackle.md
    assert.match(t, /## Push[\s\S]*operators\/tackle\.md/);
    // Adversarial classification language somewhere in Try
    assert.match(t, /atomic|composite|single tool call/i);
  });

  test("README names Deep Research AND all four framings", () => {
    const r = readFileSync(resolve(INTERP, "README.md"), "utf-8");
    assert.match(r, /Deep Research/);
    assert.match(r, /Self-Ask/);
    assert.match(r, /Plan-and-Execute/);
    assert.match(r, /Orchestrator.Workers/);
    assert.match(r, /XAgent/);
  });

  test("README mentions recursion (this leaf is the one that exercises recursive sub-tackling)", () => {
    const r = readFileSync(resolve(INTERP, "README.md"), "utf-8");
    assert.match(r, /recursi/i);
  });
});
