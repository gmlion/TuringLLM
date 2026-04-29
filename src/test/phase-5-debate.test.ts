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

describe("phase-5 a-debate: demo PROGRAM.md (R17)", () => {
  test("PROGRAM.md exists", () => {
    assert.ok(existsSync(resolve(INTERP, "PROGRAM.md")), "PROGRAM.md missing");
  });

  test("PROGRAM.md mentions the canonical Postgres-vs-SQLite question (R17)", () => {
    const s = readFileSync(resolve(INTERP, "PROGRAM.md"), "utf-8");
    assert.match(s, /Postgres or SQLite/i);
  });

  test("PROGRAM.md names exactly three persona blocks (R17)", () => {
    const s = readFileSync(resolve(INTERP, "PROGRAM.md"), "utf-8");
    const personaHeaders = (s.match(/^### \w/gm) || []);
    assert.equal(personaHeaders.length, 3, `expected 3 persona ### headers, found ${personaHeaders.length}`);
  });
});

describe("phase-5 a-debate: strategy preamble + Initialize (R1-R4, R19)", () => {
  test("INSTRUCTIONS.md exists", () => {
    assert.ok(existsSync(resolve(INTERP, "INSTRUCTIONS.md")), "INSTRUCTIONS.md missing");
  });

  test("strategy is bounded by # Strategy / # Sub-instructions and is verbatim-required", () => {
    const s = readFileSync(resolve(INTERP, "INSTRUCTIONS.md"), "utf-8");
    assert.match(s, /^# Strategy/m);
    assert.match(s, /^# Sub-instructions/m);
    assert.match(s, /VERBATIM into every update_instructions call/);
  });

  test("strategy does not reference reflect.md (R19)", () => {
    const s = readFileSync(resolve(INTERP, "INSTRUCTIONS.md"), "utf-8");
    assert.doesNotMatch(s, /reflect\.md/);
  });

  test("Initialize references PROGRAM.md and writes the four scoped files (R1, R4)", () => {
    const s = readFileSync(resolve(INTERP, "INSTRUCTIONS.md"), "utf-8");
    const init = extractInstructionBody(s, "Initialize");
    assert.match(init, /PROGRAM\.md/);
    assert.match(init, /scoped\/personas\.md/);
    assert.match(init, /scoped\/rounds\.md/);
    assert.match(init, /scoped\/question\.md/);
  });

  test("Initialize defaults R to 3 when unspecified (R2)", () => {
    const s = readFileSync(resolve(INTERP, "INSTRUCTIONS.md"), "utf-8");
    const init = extractInstructionBody(s, "Initialize");
    assert.match(init, /default[^.]*3/i);
  });

  test("Initialize handles fewer than two personas via Pending Questions + waiting_for_user (R3)", () => {
    const s = readFileSync(resolve(INTERP, "INSTRUCTIONS.md"), "utf-8");
    const init = extractInstructionBody(s, "Initialize");
    assert.match(init, /## Pending Questions/);
    assert.match(init, /waiting_for_user/);
  });
});

describe("phase-5 a-debate: Stage instruction (R5, R6)", () => {
  test("Stage is matched on dispatch_stage state", () => {
    const s = readFileSync(resolve(INTERP, "INSTRUCTIONS.md"), "utf-8");
    const stage = extractInstructionBody(s, "Stage");
    assert.ok(stage.length > 0, "Stage instruction missing");
  });

  test("Stage uses round-1 sentinel when round == 1 (R6)", () => {
    const s = readFileSync(resolve(INTERP, "INSTRUCTIONS.md"), "utf-8");
    const stage = extractInstructionBody(s, "Stage");
    assert.match(stage, /\(none — round 1\)/);
  });

  test("Stage concatenates only prior-round files (R5)", () => {
    const s = readFileSync(resolve(INTERP, "INSTRUCTIONS.md"), "utf-8");
    const stage = extractInstructionBody(s, "Stage");
    assert.match(stage, /round-\$i\.md|round-\${i}\.md/);
    assert.match(stage, /\[\s*"\$i"\s*-lt\s*"\$r"\s*\]|\[\s*\$i\s*-lt\s*\$r\s*\]/);
  });

  test("Stage transitions to dispatch_push", () => {
    const s = readFileSync(resolve(INTERP, "INSTRUCTIONS.md"), "utf-8");
    const stage = extractInstructionBody(s, "Stage");
    assert.match(stage, /## State\s*\n\s*dispatch_push/);
  });

  test("Stage writes all five staged push-arg files", () => {
    const s = readFileSync(resolve(INTERP, "INSTRUCTIONS.md"), "utf-8");
    const stage = extractInstructionBody(s, "Stage");
    for (const fname of ["round.md", "persona_name.md", "persona_description.md", "question.md", "transcript.md"]) {
      assert.match(stage, new RegExp(`scoped/staged/${escapeRegExp(fname)}`), `Stage missing staged/${fname}`);
    }
  });
});
