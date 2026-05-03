import { test, describe } from "node:test";
import { strict as assert } from "node:assert";
import { existsSync, readFileSync } from "fs";
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
