import { test, describe } from "node:test";
import { strict as assert } from "node:assert";
import { mkdtempSync, writeFileSync } from "fs";
import { join, resolve } from "path";
import { tmpdir } from "os";
import { executeTool } from "../tools.js";

describe("executeTool bash cwd", () => {
  test("runs without error when no cwd passed", async () => {
    // Confirm bash runs correctly when cwd is omitted (inherits process.cwd()).
    const result = await executeTool("bash", { command: "echo ok" }, "/dev/null");
    assert.equal(result.error, false);
    assert.match(result.output.trim(), /ok/);
  });

  test("runs in the specified cwd when cwd is passed", async () => {
    const dir = mkdtempSync(join(tmpdir(), "turing-tools-test-"));
    // Write a sentinel file in the temp dir
    writeFileSync(join(dir, "sentinel.txt"), "hello", "utf-8");

    const result = await executeTool(
      "bash",
      { command: "ls sentinel.txt" },
      "/dev/null",
      undefined,
      dir
    );
    assert.equal(result.error, false, `unexpected error: ${result.output}`);
    assert.match(result.output.trim(), /sentinel\.txt/);
  });

  test("bash in wrong cwd fails to find file in the right cwd", async () => {
    const dir = mkdtempSync(join(tmpdir(), "turing-tools-test-"));
    writeFileSync(join(dir, "unique-sentinel.txt"), "hello", "utf-8");

    // Run WITHOUT passing the dir as cwd — the file should not be found
    const result = await executeTool(
      "bash",
      { command: "ls unique-sentinel.txt" },
      "/dev/null"
      // no cwd
    );
    // Should fail since unique-sentinel.txt doesn't exist in process.cwd()
    assert.ok(
      result.error || result.output.includes("No such file") || result.output.includes("exit code"),
      `expected ls to fail outside the temp dir, got: ${result.output}`
    );
  });

  test("frame dir plumbing: resolving memoryPath to frameDir gives correct cwd for bash", async () => {
    // Simulate what providers do: frameDir = resolve(memoryPath, "..")
    const dir = mkdtempSync(join(tmpdir(), "turing-tools-test-frame-"));
    const memoryPath = join(dir, "MEMORY.md");
    writeFileSync(memoryPath, "## State\nempty\n", "utf-8");
    writeFileSync(join(dir, "frame-marker.txt"), "marker", "utf-8");

    const frameDir = resolve(memoryPath, "..");
    assert.equal(frameDir, dir);

    const result = await executeTool(
      "bash",
      { command: "ls frame-marker.txt" },
      join(dir, "INSTRUCTIONS.md"),
      undefined,
      frameDir
    );
    assert.equal(result.error, false, `unexpected error: ${result.output}`);
    assert.match(result.output.trim(), /frame-marker\.txt/);
  });
});
