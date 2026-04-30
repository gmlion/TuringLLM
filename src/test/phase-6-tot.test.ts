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
