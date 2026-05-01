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
