import { test, describe } from "node:test";
import { strict as assert } from "node:assert";
import { existsSync, readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO = resolve(__dirname, "../..");
const INTERP = resolve(REPO, "interpreters/mas-papers/2-planning-decomposition/c-deep-research-hitl");
const ORIGINAL = resolve(REPO, "interpreters/mas-papers/2-planning-decomposition/c-deep-research");

describe("c-deep-research-hitl: layout + HITL semantics", () => {
  test("required files exist", () => {
    for (const f of [
      "INSTRUCTIONS.md",
      "PROGRAM.md",
      "README.md",
      "operators/plan-execute-clarify.md",
      "operators/tackle.md",
      "operators/plan.md",
    ]) {
      assert.ok(existsSync(resolve(INTERP, f)), `${f} missing`);
    }
  });

  test("INSTRUCTIONS.md points at the new HITL operator (single-line marker)", () => {
    const m = readFileSync(resolve(INTERP, "INSTRUCTIONS.md"), "utf-8").trim();
    assert.equal(m, "operators/plan-execute-clarify.md");
  });

  test("tackle.md is byte-equal to c-deep-research/operators/tackle.md", () => {
    const a = readFileSync(resolve(INTERP, "operators/tackle.md"));
    const b = readFileSync(resolve(ORIGINAL, "operators/tackle.md"));
    assert.ok(a.equals(b), "tackle.md drifted from c-deep-research");
  });

  test("plan.md is byte-equal to c-deep-research/operators/plan.md", () => {
    const a = readFileSync(resolve(INTERP, "operators/plan.md"));
    const b = readFileSync(resolve(ORIGINAL, "operators/plan.md"));
    assert.ok(a.equals(b), "plan.md drifted from c-deep-research");
  });

  test("plan-execute-clarify.md writes ## Pending Questions in Initialize without setting waiting_for_user", () => {
    const op = readFileSync(resolve(INTERP, "operators/plan-execute-clarify.md"), "utf-8");
    // Initialize section uses ## Pending Questions in its MEMORY rewrite...
    assert.match(op, /Initialize[\s\S]*## Pending Questions/);
    // ...and explicitly says NOT to set waiting_for_user there.
    assert.match(op, /DO NOT set state to `waiting_for_user`/);
  });

  test("plan-execute-clarify.md has a graceful fallback to waiting_for_user once background is exhausted", () => {
    const op = readFileSync(resolve(INTERP, "operators/plan-execute-clarify.md"), "utf-8");
    // The (c) branch of the gathering loop sets state to waiting_for_user.
    assert.match(op, /Background sufficient BUT some answers still missing[\s\S]*waiting_for_user/);
  });

  test("plan-execute-clarify.md still pushes tackle.md once the goal is refined", () => {
    const op = readFileSync(resolve(INTERP, "operators/plan-execute-clarify.md"), "utf-8");
    assert.match(op, /## Push\s*\n\s*operators\/tackle\.md/);
  });

  test("plan-execute-clarify.md enforces surgical-append for ./scoped/background.md", () => {
    const op = readFileSync(resolve(INTERP, "operators/plan-execute-clarify.md"), "utf-8");
    // The instructions warn against wholesale rewrites of background.md.
    assert.match(op, /background\.md[\s\S]*surgical|Never wholesale-rewrite[\s\S]*background\.md/i);
  });

  test("PROGRAM.md is intentionally under-specified to invite clarifying questions", () => {
    const p = readFileSync(resolve(INTERP, "PROGRAM.md"), "utf-8");
    assert.match(p, /clarifying questions/i);
    assert.match(p, /must not block/i);
  });

  test("README explains non-blocking + frame-aware routing + graceful fallback", () => {
    const r = readFileSync(resolve(INTERP, "README.md"), "utf-8");
    assert.match(r, /non-blocking/i);
    assert.match(r, /question-router/i);
    assert.match(r, /waiting_for_user/);
    assert.match(r, /tackle\.md/);
  });
});
