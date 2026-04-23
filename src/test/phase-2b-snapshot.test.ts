import { test, describe, beforeEach, afterEach } from "node:test";
import { strict as assert } from "node:assert";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, existsSync, readFileSync, cpSync } from "fs";
import { resolve } from "path";
import { tmpdir } from "os";

describe("frames/ snapshot via cpSync", () => {
  let tmp: string;
  beforeEach(() => { tmp = mkdtempSync(resolve(tmpdir(), "turing-snap-")); });
  afterEach(() => { rmSync(tmp, { recursive: true, force: true }); });

  test("recursive copy preserves nested frame content", () => {
    mkdirSync(resolve(tmp, "frames/f000-strategy/scoped"), { recursive: true });
    writeFileSync(resolve(tmp, "frames/f000-strategy/MEMORY.md"), "root memory", "utf-8");
    writeFileSync(resolve(tmp, "frames/f000-strategy/scoped/draft.md"), "a draft", "utf-8");
    mkdirSync(resolve(tmp, "frames/f001-verify/scoped"), { recursive: true });
    writeFileSync(resolve(tmp, "frames/f001-verify/MEMORY.md"), "verify memory", "utf-8");
    writeFileSync(resolve(tmp, "frames/f001-verify/scoped/verifications.md"), "- V1: pending\n", "utf-8");

    mkdirSync(resolve(tmp, "history/0001-abc"), { recursive: true });
    cpSync(resolve(tmp, "frames"), resolve(tmp, "history/0001-abc/frames"), { recursive: true });

    assert.ok(existsSync(resolve(tmp, "history/0001-abc/frames/f000-strategy/MEMORY.md")));
    assert.ok(existsSync(resolve(tmp, "history/0001-abc/frames/f000-strategy/scoped/draft.md")));
    assert.ok(existsSync(resolve(tmp, "history/0001-abc/frames/f001-verify/scoped/verifications.md")));
    assert.equal(
      readFileSync(resolve(tmp, "history/0001-abc/frames/f001-verify/scoped/verifications.md"), "utf-8"),
      "- V1: pending\n",
    );
  });
});
