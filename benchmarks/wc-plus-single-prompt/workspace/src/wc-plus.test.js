import { test } from 'node:test';
import assert from 'node:assert';
import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const toolPath = path.join(__dirname, 'wc-plus.js');
const testDir = path.join(__dirname, '../.test-files');

function runWcPlus(args) {
  return new Promise((resolve, reject) => {
    const proc = spawn('node', [toolPath, ...args], {
      cwd: testDir
    });

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    proc.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    proc.on('close', (code) => {
      resolve({ code, stdout: stdout.trim(), stderr: stderr.trim() });
    });

    proc.on('error', reject);
  });
}

test('setup: create test files', async () => {
  if (!fs.existsSync(testDir)) {
    fs.mkdirSync(testDir, { recursive: true });
  }

  // Simple file with known content
  fs.writeFileSync(path.join(testDir, 'simple.txt'), 'hello world\nfoo bar\n');

  // Empty file
  fs.writeFileSync(path.join(testDir, 'empty.txt'), '');

  // File with single line no newline
  fs.writeFileSync(path.join(testDir, 'single.txt'), 'one two three');

  // File with multiple spaces and tabs
  fs.writeFileSync(path.join(testDir, 'spaces.txt'), 'word1  word2\t\tword3\n');

  // File with multiple lines
  fs.writeFileSync(path.join(testDir, 'multiline.txt'), 'line1\nline2\nline3\n');
});

test('normal output with simple file', async () => {
  const { code, stdout, stderr } = await runWcPlus(['simple.txt']);
  assert.strictEqual(code, 0);
  assert.strictEqual(stderr, '');
  const [lines, words, bytes, file] = stdout.split('\t');
  assert.strictEqual(lines, '2');
  assert.strictEqual(words, '4');
  assert.strictEqual(file, 'simple.txt');
});

test('normal output with empty file', async () => {
  const { code, stdout, stderr } = await runWcPlus(['empty.txt']);
  assert.strictEqual(code, 0);
  assert.strictEqual(stderr, '');
  const [lines, words, bytes, file] = stdout.split('\t');
  assert.strictEqual(lines, '0');
  assert.strictEqual(words, '0');
  assert.strictEqual(bytes, '0');
  assert.strictEqual(file, 'empty.txt');
});

test('normal output with single line (no trailing newline)', async () => {
  const { code, stdout, stderr } = await runWcPlus(['single.txt']);
  assert.strictEqual(code, 0);
  assert.strictEqual(stderr, '');
  const [lines, words, bytes, file] = stdout.split('\t');
  assert.strictEqual(lines, '1');
  assert.strictEqual(words, '3');
  assert.strictEqual(file, 'single.txt');
});

test('normal output with multiple lines', async () => {
  const { code, stdout, stderr } = await runWcPlus(['multiline.txt']);
  assert.strictEqual(code, 0);
  assert.strictEqual(stderr, '');
  const [lines, words, bytes, file] = stdout.split('\t');
  assert.strictEqual(lines, '3');
  assert.strictEqual(words, '3');
  assert.strictEqual(file, 'multiline.txt');
});

test('JSON output with simple file', async () => {
  const { code, stdout, stderr } = await runWcPlus(['--json', 'simple.txt']);
  assert.strictEqual(code, 0);
  assert.strictEqual(stderr, '');
  const result = JSON.parse(stdout);
  assert.strictEqual(result.lines, 2);
  assert.strictEqual(result.words, 4);
  assert.strictEqual(result.file, 'simple.txt');
  assert.strictEqual(typeof result.bytes, 'number');
});

test('JSON output with empty file', async () => {
  const { code, stdout, stderr } = await runWcPlus(['--json', 'empty.txt']);
  assert.strictEqual(code, 0);
  assert.strictEqual(stderr, '');
  const result = JSON.parse(stdout);
  assert.strictEqual(result.lines, 0);
  assert.strictEqual(result.words, 0);
  assert.strictEqual(result.bytes, 0);
  assert.strictEqual(result.file, 'empty.txt');
});

test('--help exits 0 and prints help message', async () => {
  const { code, stdout, stderr } = await runWcPlus(['--help']);
  assert.strictEqual(code, 0);
  assert.strictEqual(stderr, '');
  assert(stdout.includes('Usage'));
});

test('file not found exits 1 with error message', async () => {
  const { code, stdout, stderr } = await runWcPlus(['nonexistent.txt']);
  assert.strictEqual(code, 1);
  assert(stderr.includes('wc-plus'));
  assert(stderr.includes('nonexistent.txt'));
  assert(stderr.includes('no such file'));
});

test('whitespace handling with multiple spaces and tabs', async () => {
  const { code, stdout, stderr } = await runWcPlus(['spaces.txt']);
  assert.strictEqual(code, 0);
  const [lines, words, bytes, file] = stdout.split('\t');
  assert.strictEqual(lines, '1');
  assert.strictEqual(words, '3');
  assert.strictEqual(file, 'spaces.txt');
});

test('cleanup: remove test files', async () => {
  if (fs.existsSync(testDir)) {
    fs.rmSync(testDir, { recursive: true });
  }
});
