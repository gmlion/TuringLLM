# Goal

Build a CLI tool `wc-plus` in Node.js under `../../workspace/`. Requirements:

1. `wc-plus <file>` counts lines, words, and bytes in the given file and prints them as `<lines>\t<words>\t<bytes>\t<file>` to stdout (same column order as GNU `wc`).
2. `wc-plus --json <file>` outputs `{"lines": N, "words": N, "bytes": N, "file": "<path>"}` on a single line.
3. `wc-plus --help` prints usage and exits 0.
4. If the file does not exist, exit code 1 and stderr: `wc-plus: <file>: no such file`.

Structure expected:
- `src/wc-plus.js` — main implementation (Node, `type: module`).
- `src/wc-plus.test.js` — `node:test` covering all four behaviours above.
- `package.json` with `bin.wc-plus` pointing at `src/wc-plus.js` and a `test` script (`node --test src/*.test.js`).
- `README.md` documenting usage.

Verify by running `npm test` from the workspace root before claiming success.
