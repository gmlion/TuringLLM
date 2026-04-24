import { test, describe } from "node:test";
import { strict as assert } from "node:assert";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("better-logging live demos (R32)", () => {
  const instances = ["bl-a", "bl-b", "bl-c", "bl-d"];

  for (const name of instances) {
    test(`${name}/logs/events.jsonl exists and is valid JSONL`, () => {
      const path = resolve(process.cwd(), "instances", name, "logs", "events.jsonl");
      assert.equal(existsSync(path), true, `${path} must exist after running the demo`);
      const lines = readFileSync(path, "utf-8").trim().split("\n");
      assert.ok(lines.length > 0, `${path} must contain at least one event`);
      for (const l of lines) JSON.parse(l);   // throws if any line is malformed
    });

    test(`${name}/logs/events.jsonl seqs strictly increase`, () => {
      const path = resolve(process.cwd(), "instances", name, "logs", "events.jsonl");
      const lines = readFileSync(path, "utf-8").trim().split("\n").map(l => JSON.parse(l));
      for (let i = 1; i < lines.length; i++) {
        assert.equal(lines[i].seq, lines[i - 1].seq + 1, `seq gap at line ${i}`);
      }
    });
  }

  test("bl-d reaches depth 2 (push event with depth: 2 present)", () => {
    const path = resolve(process.cwd(), "instances", "bl-d", "logs", "events.jsonl");
    const lines = readFileSync(path, "utf-8").trim().split("\n").map(l => JSON.parse(l));
    const depth2Push = lines.find(e => e.type === "push" && e.depth === 2);
    assert.ok(depth2Push, "bl-d must reach depth 2 (R32: only d-cove exercises depth-2)");
  });
});
