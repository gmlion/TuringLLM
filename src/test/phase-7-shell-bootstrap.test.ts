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

describe("R12: {{program}} substitution at bootstrap — edge cases", () => {
  test("multi-line PROGRAM.md substitutes correctly", async () => {
    const dir = makeTmpInstance(
      "operators/test-op.md\n",
      "Line one\nLine two\nLine three",
      "# Op\nThe program is:\n{{program}}\n",
    );
    try {
      const { startupBootstrap } = await import(pathToFileURL(resolve(REPO, "dist/main.js")).href);
      startupBootstrap(dir);
      const inst = readFileSync(join(dir, "frames/f000-test-op/INSTRUCTIONS.md"), "utf-8");
      assert.match(inst, /Line one\nLine two\nLine three/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
  test("operator file with no {{program}} placeholder is left intact", async () => {
    const dir = makeTmpInstance(
      "operators/test-op.md\n",
      "anything",
      "# Op\nNo placeholder here.\n",
    );
    try {
      const { startupBootstrap } = await import(pathToFileURL(resolve(REPO, "dist/main.js")).href);
      startupBootstrap(dir);
      const inst = readFileSync(join(dir, "frames/f000-test-op/INSTRUCTIONS.md"), "utf-8");
      assert.match(inst, /No placeholder here\./);
      assert.doesNotMatch(inst, /\{\{program\}\}/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("R13/R18/R19: OUTPUT.md emission on halt", () => {
  test("done@depth1 with ## Return\\nanswer: writes ## Answer to OUTPUT.md", async () => {
    const dir = mkdtempSync(join(tmpdir(), "turing-bootstrap-"));
    try {
      const { emitOutputMd } = await import(pathToFileURL(resolve(REPO, "dist/main.js")).href);
      const fakeMemory = "## State\ndone\n## Return\nanswer: 42\n";
      emitOutputMd(dir, fakeMemory);
      const out = readFileSync(join(dir, "OUTPUT.md"), "utf-8");
      assert.match(out, /## Answer\n42/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("done@depth1 with no ## Return writes diagnostic", async () => {
    const dir = mkdtempSync(join(tmpdir(), "turing-bootstrap-"));
    try {
      const { emitOutputMd } = await import(pathToFileURL(resolve(REPO, "dist/main.js")).href);
      const fakeMemory = "## State\ndone\n## Last Action\nfoo\n";
      emitOutputMd(dir, fakeMemory);
      const out = readFileSync(join(dir, "OUTPUT.md"), "utf-8");
      assert.match(out, /# OUTPUT \(no return values\)/);
      assert.match(out, /halted without a ## Return/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("done@depth1 with multiple ## Return keys writes multiple sections", async () => {
    const dir = mkdtempSync(join(tmpdir(), "turing-bootstrap-"));
    try {
      const { emitOutputMd } = await import(pathToFileURL(resolve(REPO, "dist/main.js")).href);
      const fakeMemory = "## State\ndone\n## Return\nanswer: 18\nverdict: pass\n";
      emitOutputMd(dir, fakeMemory);
      const out = readFileSync(join(dir, "OUTPUT.md"), "utf-8");
      assert.match(out, /## Answer\n18/);
      assert.match(out, /## Verdict\npass/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
