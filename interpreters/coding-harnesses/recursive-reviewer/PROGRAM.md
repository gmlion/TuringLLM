# Goal

Run the recursive-reviewer pipeline over the codebase under `workspace/`, starting from the configured entry file and traversing relative imports breadth-first. Each reachable file gets reviewed once; structural decisions accumulate into the curated refactor log so later files can take prior decisions into account.

See `README.md` (in this interpreter directory) for the full pipeline description, state machine, and behaviour notes.

## Configuration

- **Source root:** `../../workspace/src/`
- **Entry file:** `main.ts`
- **File extension:** `.ts`
- **Verification command:** `cd ../../workspace && npm run build && npm test`

The source root is interpreted relative to the active frame directory, so `../../workspace/src/` resolves to `<instance>/workspace/src/`. Place the codebase you want to review under `<instance>/workspace/`. The verification command is run after each per-file apply step; leave blank to disable.
