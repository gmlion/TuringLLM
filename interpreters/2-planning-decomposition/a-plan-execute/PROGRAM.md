# Goal

Set up a minimal TypeScript Node.js project under `../../workspace/` that has all of the following:

1. `src/index.ts` that exports a function `add(a: number, b: number): number` and, when run directly, logs the result of `add(2, 3)` to stdout.
2. `src/index.test.ts` using `node:test` that verifies `add(2, 3) === 5` and at least one other case.
3. `tsconfig.json` targeting ES2022, `module: "esnext"`, `moduleResolution: "node"`, output directory `dist/`.
4. `package.json` of type `module` with:
   - `scripts.build` = `tsc`
   - `scripts.test` = `tsc && node --test "dist/**/*.test.js"`
   - a dev dependency on `typescript@^5`.
5. `.github/workflows/ci.yml` that installs dependencies with `npm ci`, then runs `npm test`, on push events.

After setting the project up, verify it by running `npm ci && npm test` from the workspace root. Do not claim success without seeing the tests pass.
