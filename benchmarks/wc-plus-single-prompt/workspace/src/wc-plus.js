#!/usr/bin/env node

import fs from 'fs';
import path from 'path';

function countWords(content) {
  return content.split(/\s+/).filter(word => word.length > 0).length;
}

function countLines(content) {
  if (content.length === 0) return 0;
  return content.split('\n').length - (content.endsWith('\n') ? 1 : 0);
}

function countBytes(content) {
  return Buffer.byteLength(content, 'utf8');
}

function printHelp() {
  console.log(`Usage: wc-plus [--help] [--json] <file>

Count lines, words, and bytes in a file.

Options:
  --help     Show this help message and exit
  --json     Output results in JSON format`);
}

function processFile(filePath, jsonFormat) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const lines = countLines(content);
    const words = countWords(content);
    const bytes = countBytes(content);

    if (jsonFormat) {
      console.log(JSON.stringify({
        lines,
        words,
        bytes,
        file: filePath
      }));
    } else {
      console.log(`${lines}\t${words}\t${bytes}\t${filePath}`);
    }
  } catch (error) {
    if (error.code === 'ENOENT') {
      console.error(`wc-plus: ${filePath}: no such file`);
      process.exit(1);
    }
    throw error;
  }
}

function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes('--help')) {
    printHelp();
    process.exit(0);
  }

  let jsonFormat = false;
  let filePath = null;

  for (const arg of args) {
    if (arg === '--json') {
      jsonFormat = true;
    } else if (!arg.startsWith('--')) {
      filePath = arg;
    }
  }

  if (!filePath) {
    console.error('wc-plus: missing file operand');
    process.exit(1);
  }

  processFile(filePath, jsonFormat);
}

main();
