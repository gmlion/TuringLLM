import { test, describe, beforeEach, afterEach } from "node:test";
import { strict as assert } from "node:assert";
import { mkdtempSync, readFileSync, rmSync, existsSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { resolve, join } from "path";
import { QuestionRouter } from "../question-router.js";

let tmp: string;

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), "qr-"));
});

afterEach(() => {
  rmSync(tmp, { recursive: true, force: true });
});

describe("QuestionRouter", () => {
  test("recordAsker + frameForQuestion round-trip", () => {
    const r = new QuestionRouter(tmp);
    r.recordAsker("Q1", "frames/f000-strategy");
    assert.equal(r.frameForQuestion("Q1"), "frames/f000-strategy");
  });

  test("frameForQuestion returns null for unknown qid", () => {
    const r = new QuestionRouter(tmp);
    assert.equal(r.frameForQuestion("Q42"), null);
  });

  test("recordAsker is idempotent for the same pair", () => {
    const r = new QuestionRouter(tmp);
    r.recordAsker("Q1", "frames/f000-a");
    r.recordAsker("Q1", "frames/f000-a");
    assert.equal(r.frameForQuestion("Q1"), "frames/f000-a");
  });

  test("recordAsker overwrites when frameDir changes for the same qid", () => {
    const r = new QuestionRouter(tmp);
    r.recordAsker("Q1", "frames/f000-a");
    r.recordAsker("Q1", "frames/f001-b");
    assert.equal(r.frameForQuestion("Q1"), "frames/f001-b");
  });

  test("forget removes a mapping", () => {
    const r = new QuestionRouter(tmp);
    r.recordAsker("Q1", "frames/f000-a");
    r.forget("Q1");
    assert.equal(r.frameForQuestion("Q1"), null);
  });

  test("forget on unknown qid is a no-op (does not throw)", () => {
    const r = new QuestionRouter(tmp);
    assert.doesNotThrow(() => r.forget("Q999"));
  });

  test("state persists to disk across instantiations", () => {
    const r1 = new QuestionRouter(tmp);
    r1.recordAsker("Q1", "frames/f000-a");
    r1.recordAsker("Q2", "frames/f001-b");

    const r2 = new QuestionRouter(tmp);
    assert.equal(r2.frameForQuestion("Q1"), "frames/f000-a");
    assert.equal(r2.frameForQuestion("Q2"), "frames/f001-b");
  });

  test("forget persists across instantiations", () => {
    const r1 = new QuestionRouter(tmp);
    r1.recordAsker("Q1", "frames/f000-a");
    r1.forget("Q1");

    const r2 = new QuestionRouter(tmp);
    assert.equal(r2.frameForQuestion("Q1"), null);
  });

  test("recordOrphan appends a block to orphaned-answers.md including qid + asker + answer", () => {
    const r = new QuestionRouter(tmp);
    r.recordOrphan("Q1", "the answer text", "frames/f005-verify");

    const orphan = readFileSync(resolve(tmp, "orphaned-answers.md"), "utf-8");
    assert.match(orphan, /## Q1/);
    assert.match(orphan, /frames\/f005-verify/);
    assert.match(orphan, /the answer text/);
  });

  test("recordOrphan handles unknown asker (null) gracefully", () => {
    const r = new QuestionRouter(tmp);
    r.recordOrphan("Q1", "answer", null);

    const orphan = readFileSync(resolve(tmp, "orphaned-answers.md"), "utf-8");
    assert.match(orphan, /## Q1/);
    assert.match(orphan, /answer/);
    assert.doesNotMatch(orphan, /asker frame/);
  });

  test("recordOrphan appends multiple entries without overwriting", () => {
    const r = new QuestionRouter(tmp);
    r.recordOrphan("Q1", "first", "frames/f001-a");
    r.recordOrphan("Q2", "second", "frames/f002-b");

    const orphan = readFileSync(resolve(tmp, "orphaned-answers.md"), "utf-8");
    assert.match(orphan, /Q1/);
    assert.match(orphan, /Q2/);
    assert.match(orphan, /first/);
    assert.match(orphan, /second/);
  });

  test("malformed .question-router.json is treated as empty", () => {
    // Pre-seed with garbage.
    writeFileSync(resolve(tmp, ".question-router.json"), "{not valid json", "utf-8");

    const r = new QuestionRouter(tmp);
    assert.equal(r.frameForQuestion("Q1"), null);
    // And it should be writable (next save replaces the garbage).
    r.recordAsker("Q1", "frames/f000-a");
    assert.equal(r.frameForQuestion("Q1"), "frames/f000-a");
  });

  test(".question-router.json is created on first save", () => {
    const r = new QuestionRouter(tmp);
    assert.equal(existsSync(resolve(tmp, ".question-router.json")), false);
    r.recordAsker("Q1", "frames/f000-a");
    assert.equal(existsSync(resolve(tmp, ".question-router.json")), true);
  });
});
