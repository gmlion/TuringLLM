import { test, describe } from "node:test";
import { strict as assert } from "node:assert";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

// These tests validate the events.jsonl produced by the bl-a / bl-b / bl-c
// / bl-d demo instances. The instances themselves are local artefacts
// (instances/ is gitignored and gets cleaned up periodically), so when
// they're absent the test is skipped rather than failed — running the
// demos is operator work, not a CI prerequisite.

describe("better-logging live demos", () => {
  const instances = ["bl-a", "bl-b", "bl-c", "bl-d"];

  for (const name of instances) {
    const path = resolve(process.cwd(), "instances", name, "logs", "events.jsonl");
    const present = existsSync(path);

    test(`${name}/logs/events.jsonl exists and is valid JSONL`, { skip: !present && `instance ${name} not present (skipped)` }, () => {
      const lines = readFileSync(path, "utf-8").trim().split("\n");
      assert.ok(lines.length > 0, `${path} must contain at least one event`);
      for (const l of lines) JSON.parse(l);   // throws if any line is malformed
    });

    test(`${name}/logs/events.jsonl seqs strictly increase`, { skip: !present && `instance ${name} not present (skipped)` }, () => {
      const lines = readFileSync(path, "utf-8").trim().split("\n").map(l => JSON.parse(l));
      for (let i = 1; i < lines.length; i++) {
        assert.equal(lines[i].seq, lines[i - 1].seq + 1, `seq gap at line ${i}`);
      }
    });
  }

  const blDPath = resolve(process.cwd(), "instances", "bl-d", "logs", "events.jsonl");
  const blDPresent = existsSync(blDPath);
  test("bl-d reaches depth 2 (push event with depth: 2 present)", { skip: !blDPresent && "bl-d not present (skipped)" }, () => {
    const lines = readFileSync(blDPath, "utf-8").trim().split("\n").map(l => JSON.parse(l));
    const depth2Push = lines.find(e => e.type === "push" && e.depth === 2);
    assert.ok(depth2Push, "bl-d must reach depth 2 (only d-cove exercises depth-2)");
  });
});
