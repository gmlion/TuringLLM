import { test, describe } from "node:test";
import { strict as assert } from "node:assert";
import { existsSync, readFileSync, readdirSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO = resolve(__dirname, "../..");
const INTERP = resolve(REPO, "interpreters/mas-papers/4-peer-collaboration/a-debate");

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
  test("operators/opine.md exists", () => {
    assert.ok(existsSync(resolve(INTERP, "operators/opine.md")), "opine.md missing");
  });

  test("opine.md declares all five push-arg placeholders (R14)", () => {
    const s = readFileSync(resolve(INTERP, "operators/opine.md"), "utf-8");
    for (const ph of ["{{round}}", "{{persona_name}}", "{{persona_description}}", "{{question}}", "{{transcript}}"]) {
      assert.match(s, new RegExp(escapeRegExp(ph)), `opine.md missing placeholder ${ph}`);
    }
  });

  test("opine.md is single-cycle empty -> done (R15)", () => {
    const s = readFileSync(resolve(INTERP, "operators/opine.md"), "utf-8");
    const headers = (s.match(/^## Instruction:/gm) || []);
    assert.equal(headers.length, 1, "opine.md must have exactly one instruction");
    assert.match(s, /MEMORY state is "empty"/);
    assert.match(s, /## State\s*\n\s*done/);
  });

  test("opine.md returns one key 'opinion' via ## Return (R15)", () => {
    const s = readFileSync(resolve(INTERP, "operators/opine.md"), "utf-8");
    assert.match(s, /## Return\s*\n\s*opinion:\s*\|/);
  });

  test("opine.md does not push further dynamics (R16)", () => {
    const s = readFileSync(resolve(INTERP, "operators/opine.md"), "utf-8");
    assert.doesNotMatch(s, /^## Push\s*\noperators\//m);
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

  test("INSTRUCTIONS.md is a single-line marker pointing at operators/debate.md (phase-7 R21)", () => {
    const inst = readFileSync(resolve(INTERP, "INSTRUCTIONS.md"), "utf-8").trim();
    assert.equal(inst, "operators/debate.md", "INSTRUCTIONS.md must be a single-line marker");
  });

  test("operators/debate.md has bimodal header (# Operator:) (phase-7 R20, R22)", () => {
    const s = readFileSync(resolve(INTERP, "operators/debate.md"), "utf-8");
    assert.match(s, /^# Operator:/m);
    assert.match(s, /^# Sub-instructions/m);
  });

  test("strategy does not reference reflect.md (R19)", () => {
    const s = readFileSync(resolve(INTERP, "operators/debate.md"), "utf-8");
    assert.doesNotMatch(s, /reflect\.md/);
  });

  test("Initialize references program/task input and writes the four scoped files (R1, R4)", () => {
    const s = readFileSync(resolve(INTERP, "operators/debate.md"), "utf-8");
    const init = extractInstructionBody(s, "Initialize");
    assert.match(init, /scoped\/personas\.md/);
    assert.match(init, /scoped\/rounds\.md/);
    assert.match(init, /scoped\/question\.md/);
  });

  test("Initialize defaults R to 3 when unspecified (R2)", () => {
    const s = readFileSync(resolve(INTERP, "operators/debate.md"), "utf-8");
    const init = extractInstructionBody(s, "Initialize");
    assert.match(init, /default[^.]*3/i);
  });

  test("Initialize handles fewer than two personas via Pending Questions + waiting_for_user (R3)", () => {
    const s = readFileSync(resolve(INTERP, "operators/debate.md"), "utf-8");
    const init = extractInstructionBody(s, "Initialize");
    assert.match(init, /## Pending Questions/);
    assert.match(init, /waiting_for_user/);
  });
});

describe("phase-5 a-debate: Stage instruction (R5, R6)", () => {
  test("Stage is matched on dispatch_stage state", () => {
    const s = readFileSync(resolve(INTERP, "operators/debate.md"), "utf-8");
    const stage = extractInstructionBody(s, "Stage");
    assert.ok(stage.length > 0, "Stage instruction missing");
  });

  test("Stage uses round-1 sentinel when round == 1 (R6)", () => {
    const s = readFileSync(resolve(INTERP, "operators/debate.md"), "utf-8");
    const stage = extractInstructionBody(s, "Stage");
    assert.match(stage, /\(none — round 1\)/);
  });

  test("Stage concatenates only prior-round files (R5)", () => {
    const s = readFileSync(resolve(INTERP, "operators/debate.md"), "utf-8");
    const stage = extractInstructionBody(s, "Stage");
    assert.match(stage, /round-\$i\.md|round-\${i}\.md/);
    assert.match(stage, /\[\s*"\$i"\s*-lt\s*"\$r"\s*\]|\[\s*\$i\s*-lt\s*\$r\s*\]/);
  });

  test("Stage transitions to dispatch_push", () => {
    const s = readFileSync(resolve(INTERP, "operators/debate.md"), "utf-8");
    const stage = extractInstructionBody(s, "Stage");
    assert.match(stage, /## State\s*\n\s*dispatch_push/);
  });

  test("Stage writes all five staged push-arg files", () => {
    const s = readFileSync(resolve(INTERP, "operators/debate.md"), "utf-8");
    const stage = extractInstructionBody(s, "Stage");
    for (const fname of ["round.md", "persona_name.md", "persona_description.md", "question.md", "transcript.md"]) {
      assert.match(stage, new RegExp(`scoped/staged/${escapeRegExp(fname)}`), `Stage missing staged/${fname}`);
    }
  });
});

describe("phase-5 a-debate: Push instruction (R8, R14)", () => {
  test("Push is matched on dispatch_push state", () => {
    const s = readFileSync(resolve(INTERP, "operators/debate.md"), "utf-8");
    const push = extractInstructionBody(s, "Push");
    assert.ok(push.length > 0, "Push instruction missing");
  });

  test("Push emits ## Push opine.md and ## Push-Args (R8)", () => {
    const s = readFileSync(resolve(INTERP, "operators/debate.md"), "utf-8");
    const push = extractInstructionBody(s, "Push");
    assert.match(push, /## Push\s*\n\s*operators\/opine\.md/);
    assert.match(push, /## Push-Args/);
  });

  test("Push declares all five push-args (R8, R14)", () => {
    const s = readFileSync(resolve(INTERP, "operators/debate.md"), "utf-8");
    const push = extractInstructionBody(s, "Push");
    for (const k of ["round:", "persona_name:", "persona_description:", "question:", "transcript:"]) {
      assert.match(push, new RegExp(`^\\s*${escapeRegExp(k)}`, "m"), `Push missing arg ${k}`);
    }
  });

  test("Push sets state to dispatching (so post-pop is dispatching_completed)", () => {
    const s = readFileSync(resolve(INTERP, "operators/debate.md"), "utf-8");
    const push = extractInstructionBody(s, "Push");
    assert.match(push, /## State\s*\n\s*dispatching\b/);
  });

  test("Push reads from scoped/staged/ files (the stage/push split)", () => {
    const s = readFileSync(resolve(INTERP, "operators/debate.md"), "utf-8");
    const push = extractInstructionBody(s, "Push");
    assert.match(push, /scoped\/staged\/round\.md/);
    assert.match(push, /scoped\/staged\/persona_name\.md/);
    assert.match(push, /scoped\/staged\/persona_description\.md/);
    assert.match(push, /scoped\/staged\/question\.md/);
    assert.match(push, /scoped\/staged\/transcript\.md/);
  });
});

describe("phase-5 a-debate: Absorb instruction (R7, R9, R11)", () => {
  test("Absorb is matched on dispatching_completed with ## Opinion", () => {
    const s = readFileSync(resolve(INTERP, "operators/debate.md"), "utf-8");
    const absorb = extractInstructionBody(s, "Absorb");
    assert.ok(absorb.length > 0, "Absorb instruction missing");
    assert.match(absorb, /dispatching_completed/);
    assert.match(absorb, /## Opinion/);
  });

  test("Absorb appends to both transcript.md and round-$r.md (R7, R9)", () => {
    const s = readFileSync(resolve(INTERP, "operators/debate.md"), "utf-8");
    const absorb = extractInstructionBody(s, "Absorb");
    assert.match(absorb, />>\s*\.\/scoped\/transcript\.md/);
    assert.match(absorb, />>\s*\.\/scoped\/round-\$r\.md/);
  });

  test("Absorb labels each opinion with round and persona name (R9)", () => {
    const s = readFileSync(resolve(INTERP, "operators/debate.md"), "utf-8");
    const absorb = extractInstructionBody(s, "Absorb");
    assert.match(absorb, /### Round \$r — \$name/);
  });

  test("Absorb routes to round_transition when agent counter hits N (R11)", () => {
    const s = readFileSync(resolve(INTERP, "operators/debate.md"), "utf-8");
    const absorb = extractInstructionBody(s, "Absorb");
    assert.match(absorb, /round_transition/);
    assert.match(absorb, /new_k.*-lt.*N|N.*-le.*new_k/);
  });

  test("Absorb increments scoped/agent.md", () => {
    const s = readFileSync(resolve(INTERP, "operators/debate.md"), "utf-8");
    const absorb = extractInstructionBody(s, "Absorb");
    assert.match(absorb, /echo\s+"?\$new_k"?\s+>\s+\.\/scoped\/agent\.md/);
  });
});

describe("phase-5 a-debate: Round transition instruction (R10, R11)", () => {
  test("Round transition is matched on round_transition state", () => {
    const s = readFileSync(resolve(INTERP, "operators/debate.md"), "utf-8");
    const rt = extractInstructionBody(s, "Round transition");
    assert.ok(rt.length > 0, "Round transition instruction missing");
    assert.match(rt, /MEMORY state is "round_transition"/);
  });

  test("Round transition increments round.md and resets agent.md to 0 (R11)", () => {
    const s = readFileSync(resolve(INTERP, "operators/debate.md"), "utf-8");
    const rt = extractInstructionBody(s, "Round transition");
    assert.match(rt, /new_r=\$\(\(\s*r\s*\+\s*1\s*\)\)/);
    assert.match(rt, /echo\s+"?\$new_r"?\s+>\s+\.\/scoped\/round\.md/);
    assert.match(rt, /echo\s+0\s+>\s+\.\/scoped\/agent\.md/);
  });

  test("Round transition routes to concluding when new_r > R (R10)", () => {
    const s = readFileSync(resolve(INTERP, "operators/debate.md"), "utf-8");
    const rt = extractInstructionBody(s, "Round transition");
    assert.match(rt, /concluding/);
    assert.match(rt, /new_r.*-le.*R|R.*-lt.*new_r/);
  });
});

describe("phase-5 a-debate: Conclude instruction (R12, R13)", () => {
  test("Conclude is matched on concluding state", () => {
    const s = readFileSync(resolve(INTERP, "operators/debate.md"), "utf-8");
    const conc = extractInstructionBody(s, "Conclude");
    assert.ok(conc.length > 0, "Conclude instruction missing");
    assert.match(conc, /MEMORY state is "concluding"/);
  });

  test("Conclude reads scoped/transcript.md (R12)", () => {
    const s = readFileSync(resolve(INTERP, "operators/debate.md"), "utf-8");
    const conc = extractInstructionBody(s, "Conclude");
    assert.match(conc, /scoped\/transcript\.md/);
  });

  test("Conclude writes ## Final Position in MEMORY (R12)", () => {
    const s = readFileSync(resolve(INTERP, "operators/debate.md"), "utf-8");
    const conc = extractInstructionBody(s, "Conclude");
    assert.match(conc, /## Final Position/);
  });

  test("Conclude does not push any further operator (R20 still holds)", () => {
    const s = readFileSync(resolve(INTERP, "operators/debate.md"), "utf-8");
    const conc = extractInstructionBody(s, "Conclude");
    assert.doesNotMatch(conc, /^\s*## Push\s*\n\s*operators\//m);
  });

  test("Conclude sets state to done (R13)", () => {
    const s = readFileSync(resolve(INTERP, "operators/debate.md"), "utf-8");
    const conc = extractInstructionBody(s, "Conclude");
    assert.match(conc, /## State\s*\n\s*done/);
  });

  test("Conclude requires neutral coordinator voice (no persona impersonation)", () => {
    const s = readFileSync(resolve(INTERP, "operators/debate.md"), "utf-8");
    const conc = extractInstructionBody(s, "Conclude");
    assert.match(conc, /neutral|coordinator|NOT impersonating/i);
  });

  test("Conclude emits ## Return answer: alongside ## Final Position (phase-7 R23, R24)", () => {
    const s = readFileSync(resolve(INTERP, "operators/debate.md"), "utf-8");
    const conc = extractInstructionBody(s, "Conclude");
    assert.match(conc, /## Return\s*\n\s*answer:/);
    assert.match(conc, /## Final Position/);
  });
});

describe("phase-5 a-debate: README + interpreter integrity (R18, R20)", () => {
  test("README.md exists and references Du et al. 2023", () => {
    assert.ok(existsSync(resolve(INTERP, "README.md")), "README.md missing");
    const s = readFileSync(resolve(INTERP, "README.md"), "utf-8");
    assert.match(s, /Du et al\.,?\s*2023/);
    assert.match(s, /Multi-Agent Debate/);
  });

  test("operators/ contains exactly opine.md and debate.md (phase-7 R22)", () => {
    const dyns = readdirSync(resolve(INTERP, "operators"));
    assert.deepEqual(dyns.sort(), ["debate.md", "opine.md"], `expected debate.md + opine.md, found ${dyns.join(", ")}`);
  });

  test("operators/debate.md has all six core strategy instructions (Initialize, Stage, Push, Absorb, Round transition, Conclude)", () => {
    const s = readFileSync(resolve(INTERP, "operators/debate.md"), "utf-8");
    for (const inst of ["Initialize", "Stage", "Push", "Absorb", "Round transition", "Conclude"]) {
      assert.match(s, new RegExp(`^## Instruction:\\s*${escapeRegExp(inst)}\\b`, "m"), `missing instruction: ${inst}`);
    }
  });

  test("Sub-instructions section is empty (this operator needs none)", () => {
    const s = readFileSync(resolve(INTERP, "operators/debate.md"), "utf-8");
    const idx = s.search(/^# Sub-instructions/m);
    assert.ok(idx >= 0, "# Sub-instructions section missing");
    const sub = s.slice(idx).replace(/^# Sub-instructions\s*\n/, "").trim();
    assert.match(sub, /\(none/, `sub-instructions section should declare "(none …)", got: ${sub.slice(0, 80)}`);
  });
});

describe("phase-7 a-debate: canonical operator migration (R20, R21, R22, R23, R24, R25, R27, R45, R46, R47)", () => {
  test("INSTRUCTIONS.md is a single-line marker pointing at operators/debate.md (R21, R46)", () => {
    const inst = readFileSync(resolve(INTERP, "INSTRUCTIONS.md"), "utf-8").trim();
    assert.equal(inst, "operators/debate.md");
  });

  test("operators/debate.md exists (R22)", () => {
    assert.ok(existsSync(resolve(INTERP, "operators/debate.md")), "operators/debate.md missing");
  });

  test("operators/debate.md has bimodal push-args: {{program}} and {{task}} + {{prior_answer}} (R47)", () => {
    const s = readFileSync(resolve(INTERP, "operators/debate.md"), "utf-8");
    assert.match(s, /\{\{program\}\}/);
    assert.match(s, /\{\{task\}\}/);
    assert.match(s, /\{\{prior_answer\}\}/);
  });

  test("operators/debate.md Initialize detects mode via {{task}} grep (R47)", () => {
    const s = readFileSync(resolve(INTERP, "operators/debate.md"), "utf-8");
    const init = extractInstructionBody(s, "Initialize");
    assert.match(init, /grep.*\{\{task\}\}/);
  });

  test("operators/debate.md Initialize does NOT hardcode cat ../../PROGRAM.md (R23)", () => {
    const s = readFileSync(resolve(INTERP, "operators/debate.md"), "utf-8");
    const init = extractInstructionBody(s, "Initialize");
    assert.doesNotMatch(init, /cat\s+\.\.\/\.\.\/PROGRAM\.md/);
  });

  test("operators/debate.md Conclude preserves ## Final Position AND adds ## Return answer: (R23, R24)", () => {
    const s = readFileSync(resolve(INTERP, "operators/debate.md"), "utf-8");
    const conc = extractInstructionBody(s, "Conclude");
    assert.match(conc, /## Final Position/);
    assert.match(conc, /## Return\s*\n\s*answer:/);
  });

  test("operators/debate.md internal sub-push uses operators/opine.md (R25)", () => {
    const s = readFileSync(resolve(INTERP, "operators/debate.md"), "utf-8");
    assert.match(s, /## Push\s*\n\s*operators\/opine\.md/);
  });

  test("operators/debate.md has # Operator: header (R45)", () => {
    const s = readFileSync(resolve(INTERP, "operators/debate.md"), "utf-8");
    assert.match(s, /^# Operator:/m);
  });

  test("operators/debate.md describes both standalone and aflow-lite invocation modes (R27)", () => {
    const s = readFileSync(resolve(INTERP, "operators/debate.md"), "utf-8");
    assert.match(s, /mode 1.*standalone|standalone.*mode 1/i);
    assert.match(s, /mode 2.*aflow|aflow.*mode 2/i);
  });
});
