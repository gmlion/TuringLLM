import { test, describe } from "node:test";
import { strict as assert } from "node:assert";
import { existsSync, readFileSync, writeFileSync, mkdirSync, mkdtempSync, rmSync } from "fs";
import { join, resolve, dirname } from "path";
import { fileURLToPath, pathToFileURL } from "url";
import { tmpdir } from "os";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

function makeTmpInstance(rootOperatorContent: string, programContent: string, operatorBody: string): string {
  const dir = mkdtempSync(join(tmpdir(), "turing-bootstrap-"));
  writeFileSync(join(dir, ".root-operator"), rootOperatorContent);
  writeFileSync(join(dir, "PROGRAM.md"), programContent);
  mkdirSync(join(dir, "operators"));
  writeFileSync(join(dir, "operators", "test-op.md"), operatorBody);
  return dir;
}

describe("R11/R12/R17: shell bootstrap reads .root-operator and creates frame f000-<slug>", () => {
  test("instance with .root-operator gets frames/f000-<slug>/INSTRUCTIONS.md created with {{program}} substituted", async () => {
    const dir = makeTmpInstance(
      "operators/test-op.md\n",
      "Hello world.",
      "# Operator\nProgram is: {{program}}\n## Instruction: Halt\n**Condition:** state empty\n**Action:** halt\n",
    );
    try {
      const { startupBootstrap } = await import(pathToFileURL(resolve(REPO, "dist/main.js")).href);
      startupBootstrap(dir);
      assert.ok(existsSync(join(dir, "frames/f000-test-op/INSTRUCTIONS.md")), "frame INSTRUCTIONS.md missing");
      const inst = readFileSync(join(dir, "frames/f000-test-op/INSTRUCTIONS.md"), "utf-8");
      assert.match(inst, /Program is: Hello world\./);
      assert.ok(existsSync(join(dir, "frames/f000-test-op/MEMORY.md")));
      const mem = readFileSync(join(dir, "frames/f000-test-op/MEMORY.md"), "utf-8");
      assert.match(mem, /## State\nempty/);
      // Call stack initialized
      assert.ok(existsSync(join(dir, ".call-stack.json")));
      const stack = JSON.parse(readFileSync(join(dir, ".call-stack.json"), "utf-8"));
      assert.equal(stack.stack.length, 1);
      assert.equal(stack.stack[0].frameDir, "frames/f000-test-op");
      assert.equal(stack.stack[0].returnState, "<root>");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
