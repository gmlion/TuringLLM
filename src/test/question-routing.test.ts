import { test, describe, beforeEach, afterEach } from "node:test";
import { strict as assert } from "node:assert";
import { mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { QuestionRouter } from "../question-router.js";
import { planAnswerRouting } from "../interaction.js";

let tmp: string;

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), "qrr-"));
});

afterEach(() => {
  rmSync(tmp, { recursive: true, force: true });
});

describe("planAnswerRouting (frame-aware HITL routing)", () => {
  test("routes answer to the frame that asked, not the active one", () => {
    // Scenario: parent frame F asked Q1; child frame G is now active.
    // The Q1 answer must land in F, not G.
    const router = new QuestionRouter(tmp);
    router.recordAsker("Q1", "frames/f000-strategy");
    const liveFrames = new Set(["frames/f000-strategy", "frames/f001-tackle"]);
    const answers = new Map([["Q1", "the user's reply"]]);

    const { routed, orphans } = planAnswerRouting(["Q1"], answers, liveFrames, router);

    assert.equal(orphans.length, 0);
    assert.equal(routed.size, 1);
    assert.deepEqual(routed.get("frames/f000-strategy"), [
      { qid: "Q1", answer: "the user's reply" },
    ]);
    assert.equal(routed.get("frames/f001-tackle"), undefined);
  });

  test("groups multiple answers by their asking frames", () => {
    const router = new QuestionRouter(tmp);
    router.recordAsker("Q1", "frames/f000-a");
    router.recordAsker("Q2", "frames/f000-a");
    router.recordAsker("Q3", "frames/f001-b");

    const liveFrames = new Set(["frames/f000-a", "frames/f001-b"]);
    const answers = new Map([
      ["Q1", "ans1"],
      ["Q2", "ans2"],
      ["Q3", "ans3"],
    ]);

    const { routed, orphans } = planAnswerRouting(
      ["Q1", "Q2", "Q3"],
      answers,
      liveFrames,
      router,
    );

    assert.equal(orphans.length, 0);
    assert.equal(routed.get("frames/f000-a")?.length, 2);
    assert.equal(routed.get("frames/f001-b")?.length, 1);
  });

  test("orphans answer when the asker has been popped from the stack", () => {
    // Scenario: F asked Q1, then F was popped. Only the root frame remains.
    const router = new QuestionRouter(tmp);
    router.recordAsker("Q1", "frames/f005-popped");
    const liveFrames = new Set(["frames/f000-strategy"]);
    const answers = new Map([["Q1", "too late"]]);

    const { routed, orphans } = planAnswerRouting(["Q1"], answers, liveFrames, router);

    assert.equal(routed.size, 0);
    assert.equal(orphans.length, 1);
    assert.equal(orphans[0].qid, "Q1");
    assert.equal(orphans[0].answer, "too late");
    assert.equal(orphans[0].asker, "frames/f005-popped");
  });

  test("orphans answer when no asker was ever recorded", () => {
    // Edge case: an answer arrives for a qid the router has never seen
    // (e.g. across a restart that lost the .question-router.json).
    const router = new QuestionRouter(tmp);
    const liveFrames = new Set(["frames/f000-strategy"]);
    const answers = new Map([["Q9", "ghost"]]);

    const { routed, orphans } = planAnswerRouting(["Q9"], answers, liveFrames, router);

    assert.equal(routed.size, 0);
    assert.equal(orphans.length, 1);
    assert.equal(orphans[0].asker, null);
  });

  test("ignores qids without a corresponding answer in the session map", () => {
    const router = new QuestionRouter(tmp);
    router.recordAsker("Q1", "frames/f000-a");
    const liveFrames = new Set(["frames/f000-a"]);
    const answers = new Map<string, string>(); // empty

    const { routed, orphans } = planAnswerRouting(["Q1"], answers, liveFrames, router);

    assert.equal(routed.size, 0);
    assert.equal(orphans.length, 0);
  });

  test("does not orphan an answer just because its frame is on the stack at depth >1", () => {
    // The asker can be any frame on the stack, not just the top.
    const router = new QuestionRouter(tmp);
    router.recordAsker("Q1", "frames/f000-strategy");
    // strategy is at the bottom; tackle and verify are above it
    const liveFrames = new Set([
      "frames/f000-strategy",
      "frames/f001-tackle",
      "frames/f002-verify",
    ]);
    const answers = new Map([["Q1", "still routable"]]);

    const { routed, orphans } = planAnswerRouting(["Q1"], answers, liveFrames, router);

    assert.equal(orphans.length, 0);
    assert.deepEqual(routed.get("frames/f000-strategy"), [
      { qid: "Q1", answer: "still routable" },
    ]);
  });
});
