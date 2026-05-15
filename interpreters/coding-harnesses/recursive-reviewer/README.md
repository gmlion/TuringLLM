# Recursive Reviewer

*Per-file two-stage code review under the praxis lens (stratified programming, functional first principles, event-based communication, Onion architecture), with verification, an unbounded fix loop, and a curated long-term refactor log.*

## What's modeled

A breadth-first walk of a codebase's import graph from a chosen entry file. For every file reached: review it under the praxis lenses, vet the suggestions against the actual code and prior structural decisions, apply the survivors, then verify with a build/test command. If verify breaks, iterate fixes until the build is green again. Decisions worth remembering across files (extractions, deletions, renames, new cross-cutting patterns) accrue in a refactor log that subsequent reviews see; purely local refactors don't.

## Pipeline per file

| Step | Driver | What it sees | What it produces |
| --- | --- | --- | --- |
| **Reviewer** (`operators/reviewer.md`, pushed) | The file content + the cumulative refactor log so far | `## Suggestions`: a numbered list of file-line-anchored proposals under the four praxis lenses, no edits |
| **Refiner** (`operators/refiner.md`, pushed) | The file + the reviewer's suggestions + the cumulative refactor log | `## Refined` (curated `KEEP:` / `DROP:` / `ADDED:` / `FLAGS:` blocks the orchestrator can act on) **plus** `## Log_entry` (a short, deliberate note for *future* refiners on *other* files — `(none)` if the refactor was purely local) |
| **Apply** (orchestrator) | The refined list and the file | The file edited in place; the refiner's `log_entry` appended to the long-term log if non-empty |
| **Verify** (orchestrator) | Exit code and last 50 lines of the configured verification command | A PASS marker in the log entry (if any), or a transition into the fix loop on failure |
| **Fix** (orchestrator, only on verify FAIL) | The latest verify tail + the per-file accumulated `_fix_history.md` | A targeted regression fix that preserves the structural intent; loops back to verify |

Stack depth never exceeds 1 — the orchestrator at `f000-orchestrate` pushes the reviewer (popped after `## Suggestions` returns), then later pushes the refiner (popped after `## Refined` + `## Log_entry` return). Apply / verify / fix all run inline in the orchestrator's frame.

## State machine

```
empty ──► select ──► review ──► review_completed ──► refine
                                                         │
                                                         ▼
                                                 refine_completed
                                                         │
                                                         ▼
                                                       apply
                                                         │
                                                         ▼
                                                      verify ◄────┐
                                                         │        │
                                          ┌──────────────┴──┐     │
                                       PASS or         FAIL │     │
                                     no command             ▼     │
                                          │               fix     │
                                          ▼                 │     │
                                       select ◄─────┐      └──────┘
                                          │         │
                                  (queue empty)     │
                                          │         │
                                          ▼         │
                                      summarize ────┘
                                          │
                                          ▼
                                        done
```

## The refactor log (`./scoped/refactor_log.md`)

Long-term memory across files, deliberately curated by the refiner — **not** a transcript:

- Files whose refiner emitted `log_entry: (none)` (purely local refactor, nothing cross-cutting worth remembering) get **no** entry. The log stays small and signal-dense.
- Files with structural impact get a short entry: `## File: <path>` followed by the refiner's bullets and a verify status (`### Verify: PASS` only when the file ended with a logged entry).
- **Test output never enters the log.** Verify command output lives ephemerally in `./scoped/_verify_tail.md` for the fix loop to consume, then gets discarded once the file finalises.

The log is passed back to both the reviewer and the refiner on every subsequent file via push-args, so prior decisions stay visible (e.g. an extracted helper from an earlier file isn't re-suggested as if it didn't exist).

## The fix loop (no cap)

When verify fails, the orchestrator transitions into `fix`. The LLM in fix mode reads:

- `./scoped/_verify_tail.md` — the *current* failure (last 50 lines of the verify command's output)
- `./scoped/_fix_history.md` — *all prior fix attempts on this file*, summarized one paragraph each: error observed, fix tried

It then makes a targeted edit, appends its own `### Attempt N` entry to `_fix_history.md`, and transitions back to `verify`. There is **no attempt cap**: a broken build is shared across the workspace, so giving up on one file would mean every subsequent file's verify also fails. We keep iterating until the build is green; if a fix is genuinely impossible the user can Ctrl-C and inspect.

`_verify_tail.md` and `_fix_history.md` are both ephemeral — they live for the duration of the fix loop on a single file and get cleaned up when verify finally passes (or, formally, when the file leaves the verify state).

## File creation and deletion

A refactor may extract a new file, delete an existing one, or rename one:

- **Missing files** — if a queued file no longer exists at select time (a prior refactor deleted it), the orchestrator skips it gracefully and logs a `### Skipped` note. If it goes missing at apply time, same treatment.
- **New files** — at the end of `verify` (only after the file is fully final, post-fix-loop), the orchestrator re-runs import-discovery on the just-finalised file. A refactor that extracted a new module typically added an `import` for it in the same edit, so the new file is picked up there and queued for a future cycle. Traversal stays import-following from the entry; there is **no global rescan** of the source tree.

## Stop condition

The BFS queue is empty after a select pass — every file reachable from the entry point via the import graph has been reviewed exactly once, including modules created by intermediate refactors.

## Return value

The orchestrator returns a single `summary` key via `## Return`:

- One bullet per file processed, with the chief structural change (or `(no changes)` if the refined list was empty)
- Any `[FLAG]` entries the refiner surfaced (`bug:`, `cross-cutting:`, `conflict:`)
- A trailing line counting `### Verify: PASS` markers in the log

The shell splices this into the instance's `OUTPUT.md` on halt.

## Scoped files

| Path | Purpose | Lifetime |
| --- | --- | --- |
| `./scoped/source_root.md` | Single line: source root path (e.g. `../../workspace/src/`) | Whole run |
| `./scoped/file_ext.md` | Single line: file extension filter (e.g. `.ts`) | Whole run |
| `./scoped/verify_cmd.md` | Single line: verification command, or empty | Whole run |
| `./scoped/queue.md` | Files awaiting review, BFS order, paths relative to source_root | Whole run |
| `./scoped/visited.md` | Files already pulled off the queue | Whole run |
| `./scoped/refactor_log.md` | Long-term memory (curated, not transcript) | Whole run; **append-only** |
| `./scoped/summary.md` | One short bullet per file processed, plus FLAG surfaces | Whole run; **append-only** |
| `./scoped/current_file.md` | Single line: file currently being processed | Per-file |
| `./scoped/suggestions.md` | Last reviewer's `## Suggestions` payload | Per-file |
| `./scoped/refined.md` | Last refiner's `## Refined` payload | Per-file |
| `./scoped/_log_pending.md` | Marker (`yes`/`no`) — did apply write a log entry? | Per-file (cleaned up when verify finalises) |
| `./scoped/_fix_attempts.md` | Per-file fix-iteration counter | Per-file |
| `./scoped/_verify_tail.md` | Last verify command output (≤50 lines) | Per fix iteration (overwritten) |
| `./scoped/_fix_history.md` | Per-file accumulated trajectory of fix attempts | Per-file fix loop |

Per the surgical-edit rule (`CLAUDE.md`), `refactor_log.md` and `summary.md` MUST be appended via `>>` so prior entries survive. The fix-history file is also appended-only within a single file's loop, then deleted on verify-PASS.

## Dynamics in this interpreter

| File | Receives (push-args) | Returns | Stack depth from caller |
| --- | --- | --- | --- |
| `operators/reviewer.md` | `file_path`, `refactor_log` | `suggestions` | 1 (no further push) |
| `operators/refiner.md` | `file_path`, `suggestions`, `refactor_log` | `refined`, `log_entry` | 1 (no further push) |

## Demo `PROGRAM.md`

The default `PROGRAM.md` configures a review of `workspace/src/` starting at `main.ts`, with `npm run build && npm test` as the verification gate.

## Run it

```bash
./new-instance.sh interpreters/coding-harnesses/recursive-reviewer my-rev
# place the codebase you want to review under instances/my-rev/workspace/
instances/my-rev/run.sh
```

## Notable behaviour

- **Refiner spec drift.** The refiner is asked to emit two return keys (`refined`, `log_entry`); LLMs occasionally drift from this format (one observed case emitted three top-level keys without the required `|` block-scalar markers, producing zero parseable entries). When that happens the splice is empty, no `## Refined` appears in the orchestrator, and the run pauses at `waiting_for_user`. The orchestrator does not attempt to recover automatically; tighten the refiner prompt or restart the run if it occurs.
- **Fix loop has no cap.** Stubborn regressions can spin indefinitely. This is intentional — a broken build affects every subsequent file, so giving up is worse than retrying. Ctrl-C is safe; per-file ephemeral state is rebuilt on resume.
- **Import-graph traversal only.** Files that aren't reachable via relative imports from the entry file are not reviewed (e.g. test files that nothing imports). Add them as additional entry points by editing `./scoped/queue.md` directly if needed.

## Layout note

`INSTRUCTIONS.md` is a single-line marker pointing at the canonical operator file `operators/orchestrate.md`. The strategy body lives in the canonical operator. This pattern lets the same operator be invoked standalone (via `.root-operator` bootstrap) AND, in principle, reused inside meta-frameworks.
