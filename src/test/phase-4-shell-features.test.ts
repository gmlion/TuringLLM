import { test, describe } from "node:test";
import { strict as assert } from "node:assert";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO = resolve(__dirname, "../..");

describe("R40: shell features re-homed from game-team", () => {
  test("R40 (a) fuzzy NL conditions used in at least one Phase-3/4 strategy", () => {
    const candidates = [
      "interpreters/2-planning-decomposition/a-plan-execute/INSTRUCTIONS.md",
      "interpreters/5-fixed-sop-teams/a-metagpt/INSTRUCTIONS.md",
      "interpreters/5-fixed-sop-teams/b-chatdev/INSTRUCTIONS.md",
    ];
    const fuzzyRe = /suggests|indicates|appears|is successful|looks|signals|reads as/i;
    const hits = candidates.filter((c) => fuzzyRe.test(readFileSync(resolve(REPO, c), "utf-8")));
    assert.ok(hits.length >= 1, `no Phase-3/4 strategy uses fuzzy NL condition phrasing; candidates: ${candidates.join(", ")}`);
  });

  test("R40 (b) non-blocking Pending Questions used by at least one Phase-3/4 strategy", () => {
    const candidates = [
      "interpreters/2-planning-decomposition/a-plan-execute/INSTRUCTIONS.md",
      "interpreters/5-fixed-sop-teams/a-metagpt/INSTRUCTIONS.md",
    ];
    const pqRe = /## Pending Questions/;
    const notWaitingRe = /DO NOT set state to "waiting_for_user"|non-blocking|do not.*waiting_for_user/i;
    let hit = false;
    for (const c of candidates) {
      const s = readFileSync(resolve(REPO, c), "utf-8");
      if (pqRe.test(s) && notWaitingRe.test(s)) { hit = true; break; }
    }
    assert.ok(hit, "no Phase-3/4 strategy demonstrates non-blocking ## Pending Questions");
  });

  test("R40 (c) strategy-level push present in every new strategy", () => {
    const strategies = [
      "interpreters/2-planning-decomposition/a-plan-execute/INSTRUCTIONS.md",
      "interpreters/5-fixed-sop-teams/a-metagpt/INSTRUCTIONS.md",
      "interpreters/5-fixed-sop-teams/b-chatdev/INSTRUCTIONS.md",
    ];
    for (const s of strategies) {
      const body = readFileSync(resolve(REPO, s), "utf-8");
      assert.match(body, /## Push\s*\n\s*dynamics\//, `${s} does not emit a strategy-level ## Push`);
    }
  });
});
