import { test, describe } from "node:test";
import { strict as assert } from "node:assert";
import { existsSync, readFileSync, readdirSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO = resolve(__dirname, "../..");
const INTERP = resolve(REPO, "interpreters/4-peer-collaboration/a-debate");

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

describe("phase-5 a-debate: opine.md dynamic (R14, R15, R16)", () => {
  test("dynamics/opine.md exists", () => {
    assert.ok(existsSync(resolve(INTERP, "dynamics/opine.md")), "opine.md missing");
  });

  test("opine.md declares all five push-arg placeholders (R14)", () => {
    const s = readFileSync(resolve(INTERP, "dynamics/opine.md"), "utf-8");
    for (const ph of ["{{round}}", "{{persona_name}}", "{{persona_description}}", "{{question}}", "{{transcript}}"]) {
      assert.match(s, new RegExp(escapeRegExp(ph)), `opine.md missing placeholder ${ph}`);
    }
  });

  test("opine.md is single-cycle empty -> done (R15)", () => {
    const s = readFileSync(resolve(INTERP, "dynamics/opine.md"), "utf-8");
    const headers = (s.match(/^## Instruction:/gm) || []);
    assert.equal(headers.length, 1, "opine.md must have exactly one instruction");
    assert.match(s, /MEMORY state is "empty"/);
    assert.match(s, /## State\s*\n\s*done/);
  });

  test("opine.md returns one key 'opinion' via ## Return (R15)", () => {
    const s = readFileSync(resolve(INTERP, "dynamics/opine.md"), "utf-8");
    assert.match(s, /## Return\s*\n\s*opinion:\s*\|/);
  });

  test("opine.md does not push further dynamics (R16)", () => {
    const s = readFileSync(resolve(INTERP, "dynamics/opine.md"), "utf-8");
    assert.doesNotMatch(s, /^## Push\s*\ndynamics\//m);
  });
});
