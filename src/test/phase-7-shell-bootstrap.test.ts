import { test, describe } from "node:test";
import { strict as assert } from "node:assert";
import { existsSync, readFileSync, writeFileSync, mkdirSync, mkdtempSync, rmSync } from "fs";
import { join, resolve, dirname } from "path";
import { fileURLToPath, pathToFileURL } from "url";
import { tmpdir } from "os";
import { execSync } from "child_process";


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

describe("R14: absent .root-operator → clean error", () => {
  test("startupBootstrap throws with the canonical message when .root-operator is missing", async () => {
    const dir = mkdtempSync(join(tmpdir(), "turing-bootstrap-"));
    writeFileSync(join(dir, "PROGRAM.md"), "anything");
    try {
      const { startupBootstrap } = await import(pathToFileURL(resolve(REPO, "dist/main.js")).href);
      assert.throws(
        () => startupBootstrap(dir),
        (err: Error) => /no \.root-operator configured/i.test(err.message),
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("startupBootstrap throws with canonical message even when .call-stack.json exists (no legacy fallback)", async () => {
    const dir = mkdtempSync(join(tmpdir(), "turing-bootstrap-"));
    writeFileSync(join(dir, "PROGRAM.md"), "anything");
    // Pre-existing call stack — must NOT save us
    writeFileSync(join(dir, ".call-stack.json"), JSON.stringify({ nextCounter: 1, stack: [{ returnState: "<root>", frameDir: "frames/f000-strategy" }] }));
    try {
      const { startupBootstrap } = await import(pathToFileURL(resolve(REPO, "dist/main.js")).href);
      assert.throws(
        () => startupBootstrap(dir),
        (err: Error) => /no \.root-operator configured/i.test(err.message),
      );
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

describe("R8/R15/R16/R51: new-instance.sh creates .root-operator and copies operators/+workspace/", () => {
  test("invoking new-instance.sh on a synthetic interpreter creates expected layout", () => {
    const tmpInterpDir = mkdtempSync(join(tmpdir(), "turing-interp-"));
    // Synthetic interpreter with marker INSTRUCTIONS.md, operators/, workspace/
    writeFileSync(join(tmpInterpDir, "INSTRUCTIONS.md"), "operators/test-canonical.md\n");
    writeFileSync(join(tmpInterpDir, "PROGRAM.md"), "demo program");
    mkdirSync(join(tmpInterpDir, "operators"));
    writeFileSync(join(tmpInterpDir, "operators", "test-canonical.md"), "# Test op\n");
    writeFileSync(join(tmpInterpDir, "operators", "helper.md"), "# helper\n");
    mkdirSync(join(tmpInterpDir, "workspace"));
    writeFileSync(join(tmpInterpDir, "workspace", "fixture.txt"), "data");

    const instanceName = `_phase7_test_${Date.now()}`;
    try {
      execSync(`bash new-instance.sh ${instanceName} ${tmpInterpDir.replace(/\\/g, "/")}`, { cwd: REPO, encoding: "utf-8" });
      const dir = resolve(REPO, "instances", instanceName);
      // .root-operator exists with marker content
      assert.ok(existsSync(join(dir, ".root-operator")), ".root-operator missing");
      assert.equal(readFileSync(join(dir, ".root-operator"), "utf-8").trim(), "operators/test-canonical.md");
      // operators/ copied
      assert.ok(existsSync(join(dir, "operators", "test-canonical.md")));
      assert.ok(existsSync(join(dir, "operators", "helper.md")));
      // PROGRAM.md copied
      assert.ok(existsSync(join(dir, "PROGRAM.md")));
      // workspace/ copied
      assert.ok(existsSync(join(dir, "workspace", "fixture.txt")));
      // No frames/f000-strategy/ pre-created
      assert.ok(!existsSync(join(dir, "frames", "f000-strategy")), "frames/f000-strategy should NOT be pre-created");
      // No .call-stack.json pre-created
      assert.ok(!existsSync(join(dir, ".call-stack.json")), ".call-stack.json should NOT be pre-created");
    } finally {
      execSync(`rm -rf instances/${instanceName}`, { cwd: REPO });
      rmSync(tmpInterpDir, { recursive: true, force: true });
    }
  });
});

describe("R55: phase-7-shell-bootstrap.test.ts covers all bootstrap requirements", () => {
  test("file exists and has assertions for R11-R19", () => {
    const path = resolve(REPO, "src/test/phase-7-shell-bootstrap.test.ts");
    assert.ok(existsSync(path));
    const s = readFileSync(path, "utf-8");
    for (const r of [11, 12, 13, 14, 15, 16, 17, 18, 19]) {
      assert.match(s, new RegExp(`R${r}`), `R${r} not pinned in test descriptions`);
    }
  });
});
