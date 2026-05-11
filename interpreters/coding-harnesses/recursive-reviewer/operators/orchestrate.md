# Operator: Recursive Reviewer Orchestrator

IMPORTANT: This operator file is the canonical strategy. Do not modify it via update_instructions; it is only loaded at push-time.

Receives push-args (root-operator bootstrap):
- `{{program}}` — the user's PROGRAM.md content (substituted in the **Program** section below).

Produces: `## State done` + `## Return` block with key `summary`.

## What this operator does

Drives a breadth-first review of every source file reachable from a chosen entry point, and any new files that prior refactors have created. For each file it:
1. Pushes `operators/reviewer.md` (which applies the praxis lenses and returns `## Suggestions`).
2. Pushes `operators/refiner.md` (which receives the file + the suggestions + the refactor log and returns a curated `## Refined` list plus a `log_entry` for long-term memory).
3. Applies the refined changes to the file in-place.
4. Runs the configured verification command. If verification fails, iterates a fix loop (read the failure tail → make a targeted fix → re-verify) **without a cap**: a broken build is shared across the workspace, so giving up would just mean every next file's verify fails too. Each fix attempt sees the latest verify tail plus an accumulated `./scoped/_fix_history.md` of prior attempts so it can change tack instead of repeating itself.
5. Loops to the next file in the queue once verify is green.

Test output never enters the long-term refactor log — the log is curated structural memory, not a transcript. The verify command's output is held in an ephemeral `./scoped/_verify_tail.md` (overwritten each attempt) for the fix step to read; the per-attempt summaries the fix step appends to `./scoped/_fix_history.md` give the next fix iteration a digest of what's been tried. Both are discarded once the file is finalised.

Configuration (source root, entry file, file extension, verification command) is parsed from the **Program** section below at bootstrap.

## Scoped files

- `./scoped/source_root.md` — single line: source root (e.g. `../../workspace/src/`)
- `./scoped/file_ext.md` — single line: file extension filter (e.g. `.ts`)
- `./scoped/verify_cmd.md` — single line: verification command, or empty to disable
- `./scoped/queue.md` — files awaiting review, one path per line, in BFS order; paths are relative to source_root
- `./scoped/visited.md` — files already pulled off the queue, one per line
- `./scoped/current_file.md` — single line: the file currently being processed
- `./scoped/suggestions.md` — last reviewer's `## Suggestions` payload (rewritten each round)
- `./scoped/refined.md` — last refiner's `## Refined` payload (rewritten each round)
- `./scoped/refactor_log.md` — long-term memory across files (NOT a transcript). Only files whose refiner emitted a non-empty `log_entry` get an entry; files with purely local refactors are skipped. Verify outcomes append to existing entries on PASS, or synthesize a fresh entry on FAIL. **MUST be appended via `>>` only** so prior entries survive
- `./scoped/summary.md` — one short bullet per file processed; **MUST be appended via `>>` only**
- `./scoped/_log_pending.md` — single-line marker (`yes` / `no`) that apply writes for verify to read; ephemeral, removed once a file is fully done
- `./scoped/_fix_attempts.md` — per-file fix-iteration counter (initialized to `0` at apply, incremented on each verify FAIL); ephemeral, removed once a file is fully done
- `./scoped/_verify_tail.md` — last verification command output (≤50 lines), written by verify and read by fix; ephemeral, overwritten each attempt
- `./scoped/_fix_history.md` — per-file accumulated trajectory of fix attempts: one short entry per attempt summarizing the error observed and the change tried. Initialised empty at apply, appended by the fix step (not verify), read by the next fix step so the LLM doesn't repeat itself. Ephemeral; never written to the long-term log

Program (substituted at push-time):
{{program}}

## Instruction: Bootstrap
**Condition:** MEMORY state is "empty"
**Action:** Parse the Program block above to extract `Source root`, `Entry file`, `File extension`, and `Verification command`. Initialize the scoped files (including an empty `refactor_log.md`) and seed the queue with the entry file. Set state to `select`.

```
mkdir -p ./scoped

SOURCE_ROOT=$(grep -E '^- \*\*Source root:\*\*' ./INSTRUCTIONS.md | head -1 | sed -E 's/.*`([^`]+)`.*/\1/')
ENTRY=$(grep -E '^- \*\*Entry file:\*\*' ./INSTRUCTIONS.md | head -1 | sed -E 's/.*`([^`]+)`.*/\1/')
EXT=$(grep -E '^- \*\*File extension:\*\*' ./INSTRUCTIONS.md | head -1 | sed -E 's/.*`([^`]+)`.*/\1/')
VERIFY_CMD=$(grep -E '^- \*\*Verification command:\*\*' ./INSTRUCTIONS.md | head -1 | sed -E 's/.*`([^`]+)`.*/\1/')

echo "$SOURCE_ROOT" > ./scoped/source_root.md
echo "$EXT" > ./scoped/file_ext.md
echo "$VERIFY_CMD" > ./scoped/verify_cmd.md
echo "$ENTRY" > ./scoped/queue.md
: > ./scoped/visited.md
: > ./scoped/refactor_log.md
: > ./scoped/summary.md

cat > ./MEMORY.md << MEMEOF
## State
select
## Matched Instruction
Bootstrap
## Last Action
Parsed configuration (source_root=$SOURCE_ROOT, entry=$ENTRY, ext=$EXT, verify_cmd=$VERIFY_CMD) and seeded queue with entry file.
## Result
Ready to begin BFS traversal.
MEMEOF
```

## Instruction: Select next file and request review
**Condition:** MEMORY state is "select"
**Action:** Two sub-steps in one cycle: (1) pop queue heads, skipping any file that no longer exists on disk (logging the skip in `refactor_log.md`); (2) when a valid file is found, discover its relative imports and queue them, then push the reviewer with the file path and the refactor log so far. Files that a refactor newly creates are queued by the apply step (where the creation actually happens), not here — so traversal stays import-following from the entry file rather than sweeping the whole source tree.

```
SOURCE_ROOT=$(cat ./scoped/source_root.md)
EXT=$(cat ./scoped/file_ext.md)
QUEUE=./scoped/queue.md
VISITED=./scoped/visited.md
LOG=./scoped/refactor_log.md

# (1) Pop queue heads, skipping non-existent files.
NEXT=""
while [ -z "$NEXT" ]; do
  HEAD=$(head -n 1 "$QUEUE")
  [ -z "$HEAD" ] && break
  tail -n +2 "$QUEUE" > "$QUEUE.tmp" && mv "$QUEUE.tmp" "$QUEUE"
  if [ ! -f "$SOURCE_ROOT/$HEAD" ]; then
    {
      echo ""
      echo "## File: $HEAD"
      echo "### Skipped"
      echo "File no longer exists at select time."
    } >> "$LOG"
    echo "- $HEAD: (skipped — file missing)" >> ./scoped/summary.md
    continue
  fi
  NEXT="$HEAD"
done

if [ -z "$NEXT" ]; then
  cat > ./MEMORY.md << MEMEOF
## State
summarize
## Matched Instruction
Select next file and request review
## Last Action
Queue is empty after skip pass.
## Result
All reachable files processed.
MEMEOF
  exit 0
fi

echo "$NEXT" >> "$VISITED"
echo "$NEXT" > ./scoped/current_file.md

FILE_PATH="$SOURCE_ROOT/$NEXT"
FILE_DIR=$(dirname "$NEXT")

# (2) Discover relative imports of the selected file.
while IFS= read -r imp; do
  [ -z "$imp" ] && continue
  candidate="${imp%.js}$EXT"
  resolved=$(cd "$SOURCE_ROOT" 2>/dev/null && (cd "$FILE_DIR" && realpath -m --relative-to="$(realpath -m "$SOURCE_ROOT")" "$candidate" 2>/dev/null)) || resolved=""
  [ -z "$resolved" ] && continue
  [ ! -f "$SOURCE_ROOT/$resolved" ] && continue
  grep -qFx "$resolved" "$VISITED" 2>/dev/null && continue
  grep -qFx "$resolved" "$QUEUE" 2>/dev/null && continue
  echo "$resolved" >> "$QUEUE"
done < <(grep -E "^(import|export).*from ['\"]\\.[^'\"]+['\"]" "$FILE_PATH" \
          | sed -E "s/.*from ['\"]([^'\"]+)['\"].*/\\1/")
```

Now write MEMORY transitioning to state `review` and request the push (passing the refactor log so far):

```
NEXT=$(cat ./scoped/current_file.md)
SOURCE_ROOT=$(cat ./scoped/source_root.md)
FILE_PATH="$SOURCE_ROOT/$NEXT"
INDENTED_LOG=$(sed 's/^/  /' ./scoped/refactor_log.md)
[ -z "$(echo "$INDENTED_LOG" | tr -d '[:space:]')" ] && INDENTED_LOG="  (empty — first file)"

cat > ./MEMORY.md << MEMEOF
## State
review
## Matched Instruction
Select next file and request review
## Last Action
Selected $NEXT; discovered imports and queued unvisited ones.
## Result
Pushing reviewer for $NEXT.
## Push
operators/reviewer.md
## Push-Args
file_path: $FILE_PATH
refactor_log: |
$INDENTED_LOG
MEMEOF
```

## Instruction: Process reviewer suggestions and request refinement
**Condition:** MEMORY state is "review_completed" and `## Suggestions` is present in MEMORY
**Action:** Save the spliced `## Suggestions` to `./scoped/suggestions.md`, then push the refiner with the file path, the suggestions, and the cumulative refactor log.

```
sed -n '/^## Suggestions$/,$p' ./MEMORY.md \
  | sed '1d' \
  | sed -n '/^## /q;p' \
  > ./scoped/suggestions.md

NEXT=$(cat ./scoped/current_file.md)
SOURCE_ROOT=$(cat ./scoped/source_root.md)
FILE_PATH="$SOURCE_ROOT/$NEXT"
INDENTED_SUGGESTIONS=$(sed 's/^/  /' ./scoped/suggestions.md)
INDENTED_LOG=$(sed 's/^/  /' ./scoped/refactor_log.md)
[ -z "$(echo "$INDENTED_LOG" | tr -d '[:space:]')" ] && INDENTED_LOG="  (empty — first file)"

cat > ./MEMORY.md << MEMEOF
## State
refine
## Matched Instruction
Process reviewer suggestions and request refinement
## Last Action
Stored reviewer's suggestions for $NEXT.
## Result
Pushing refiner for $NEXT.
## Push
operators/refiner.md
## Push-Args
file_path: $FILE_PATH
suggestions: |
$INDENTED_SUGGESTIONS
refactor_log: |
$INDENTED_LOG
MEMEOF
```

## Instruction: Process refined list
**Condition:** MEMORY state is "refine_completed" and `## Refined` is present in MEMORY
**Action:** Save the spliced `## Refined` to `./scoped/refined.md` and transition to state `apply`.

```
sed -n '/^## Refined$/,$p' ./MEMORY.md \
  | sed '1d' \
  | sed -n '/^## /q;p' \
  > ./scoped/refined.md

NEXT=$(cat ./scoped/current_file.md)

cat > ./MEMORY.md << MEMEOF
## State
apply
## Matched Instruction
Process refined list
## Last Action
Stored refined list for $NEXT.
## Result
Ready to apply changes.
MEMEOF
```

## Instruction: Apply refined changes
**Condition:** MEMORY state is "apply"
**Action:** Read `./scoped/current_file.md`, `./scoped/source_root.md`, and `./scoped/refined.md`. The refined list is structured as `KEEP:` / `DROP:` / `ADDED:` / `FLAGS:` blocks (see `operators/refiner.md`).

If the source file no longer exists at apply time (it may have been deleted or moved by a *previous* file's refactor that we just learned about via `KEEP:`), record that fact in `./scoped/refactor_log.md` and skip directly to `verify` — there's nothing left to apply on a vanished file.

Otherwise apply only the items under `KEEP:` and `ADDED:` to the file at `<source_root>/<current_file>`, in order. Each item has the shape `N. <path:line> [<lens>] <proposal>. <rationale>.` — read each, locate the spot in the source, and apply the proposed change with the most surgical tool available (`sed -i` for one-line edits, `write_file` for full replacements, `Edit` for non-destructive in-context edits if your provider has it). The proposal text is allowed to describe extracting a new file or deleting an existing one; do that. Import re-discovery for newly-extracted modules happens at the end of `verify`, once the file is actually final (i.e. after any fix iterations have settled), not here. Missing files are skipped gracefully on the next select pass.

`FLAGS:` entries are **not** applied — they're surfaced into the summary so the user sees them.

After applying, conditionally append to `./scoped/refactor_log.md`. The refactor log is *long-term memory* for future refiners on *other files* — not a per-cycle transcript. The refiner's `log_entry` return value is the authoritative summary; the orchestrator just appends it (skipping silently when `log_entry` is empty or `(none)`, meaning the refactor was purely local). Verify status is appended below in the verify step, conditionally:

```
NEXT=$(cat ./scoped/current_file.md)
SOURCE_ROOT=$(cat ./scoped/source_root.md)
FILE_PATH="$SOURCE_ROOT/$NEXT"
LOG=./scoped/refactor_log.md

# Did the file exist at apply time? Log skip if not — a deleted-by-prior-refactor
# file IS cross-cutting signal worth remembering.
if [ ! -f "$FILE_PATH" ]; then
  {
    echo ""
    echo "## File: $NEXT"
    echo "### Skipped"
    echo "File missing at apply time (likely deleted by a prior refactor)."
  } >> "$LOG"
  echo "- $NEXT: (skipped — file missing at apply)" >> ./scoped/summary.md
  echo "yes" > ./scoped/_log_pending.md
else
  KEPT_COUNT=$(awk '/^[[:space:]]*KEEP:/{f=1;next} /^[[:space:]]*(DROP|ADDED|FLAGS):/{f=0} f && /^[[:space:]]*[0-9]+\./{c++} END{print c+0}' ./scoped/refined.md)
  ADDED_COUNT=$(awk '/^[[:space:]]*ADDED:/{f=1;next} /^[[:space:]]*(KEEP|DROP|FLAGS):/{f=0} f && /^[[:space:]]*-/{c++} END{print c+0}' ./scoped/refined.md)
  FLAG_BLOCK=$(awk '/^[[:space:]]*FLAGS:/{f=1;next} /^[[:space:]]*(KEEP|DROP|ADDED):/{f=0} f' ./scoped/refined.md)

  # Refiner's log_entry — its summary of what's worth remembering for future
  # files. Empty body or `(none)` means: purely local refactor, skip the log
  # entirely. The log is long-term memory across files, not a transcript.
  LOG_ENTRY=$(sed -n '/^## Log_entry$/,$p' ./MEMORY.md \
              | sed '1d' \
              | sed -n '/^## /q;p')
  LOG_ENTRY_TRIMMED=$(echo "$LOG_ENTRY" | tr -d '[:space:]')

  if [ -n "$LOG_ENTRY_TRIMMED" ] && [ "$LOG_ENTRY_TRIMMED" != "(none)" ]; then
    {
      echo ""
      echo "## File: $NEXT"
      echo "$LOG_ENTRY"
    } >> "$LOG"
    echo "yes" > ./scoped/_log_pending.md
  else
    echo "no" > ./scoped/_log_pending.md
  fi

  if [ "$KEPT_COUNT" -gt 0 ] || [ "$ADDED_COUNT" -gt 0 ]; then
    echo "- $NEXT: applied $KEPT_COUNT kept + $ADDED_COUNT added" >> ./scoped/summary.md
  else
    echo "- $NEXT: (no changes)" >> ./scoped/summary.md
  fi

  # Surface flags into the summary too.
  while IFS= read -r line; do
    case "$line" in
      *bug:*|*cross-cutting:*|*conflict:*) echo "- $NEXT [FLAG] $line" >> ./scoped/summary.md ;;
    esac
  done <<< "$FLAG_BLOCK"

  # Initialize fix counter and history — verify→fix iterates without cap until
  # the build is green again. A broken build would poison every subsequent
  # file's verify, so capping isn't safe; we keep going until tests pass.
  echo "0" > ./scoped/_fix_attempts.md
  : > ./scoped/_fix_history.md
fi

cat > ./MEMORY.md << MEMEOF
## State
verify
## Matched Instruction
Apply refined changes
## Last Action
Recorded refactor log entry for $NEXT.
## Result
Ready to verify.
MEMEOF
```

## Instruction: Verify
**Condition:** MEMORY state is "verify"
**Action:** Run the configured verification command (if any), then branch on the outcome.

- **PASS (or no command configured):** the file is final. Append `### Verify: PASS` to the log *only if* apply wrote a `## File:` entry for this file (signalled by `./scoped/_log_pending.md`). Re-discover relative imports of the (now-final) file and queue any unvisited ones — a refactor that extracted a new module typically added an import for it. Clean up the ephemeral markers and transition to `select`.
- **FAIL:** increment `./scoped/_fix_attempts.md`, persist the verify output to `./scoped/_verify_tail.md` for the fix step to read, and transition to `fix`. **There is no cap.** A failing build poisons every subsequent file's verify (the build is shared across the workspace), so giving up here just means every next file would also fail. We keep retrying until verify passes; if a fix is genuinely impossible the user can Ctrl-C and inspect. **Test output is never written to the long-term log** — it's transient diagnostic.

```
NEXT=$(cat ./scoped/current_file.md)
SOURCE_ROOT=$(cat ./scoped/source_root.md)
FILE_PATH="$SOURCE_ROOT/$NEXT"
VERIFY_CMD=$(cat ./scoped/verify_cmd.md)
LOG=./scoped/refactor_log.md

PENDING=$(cat ./scoped/_log_pending.md 2>/dev/null || echo "no")
ATTEMPTS=$(cat ./scoped/_fix_attempts.md 2>/dev/null || echo "0")

# Run verify (or treat absence of a command as PASS).
if [ -z "$VERIFY_CMD" ]; then
  EXIT=0
  : > ./scoped/_verify_tail.md
else
  OUT=$(mktemp)
  EXIT=0
  bash -c "$VERIFY_CMD" > "$OUT" 2>&1 || EXIT=$?
  tail -n 50 "$OUT" > ./scoped/_verify_tail.md
  rm -f "$OUT"
fi

if [ "$EXIT" -eq 0 ]; then
  # File is final. Mark PASS if there's already an entry for it.
  if [ "$PENDING" = "yes" ]; then
    echo "### Verify: PASS" >> "$LOG"
  fi
  # Re-discover imports of the now-final file (post-fix-loop). A refactor
  # that extracted a new module typically added an import for it.
  if [ -f "$FILE_PATH" ]; then
    EXT=$(cat ./scoped/file_ext.md)
    QUEUE=./scoped/queue.md
    VISITED=./scoped/visited.md
    FILE_DIR=$(dirname "$NEXT")
    while IFS= read -r imp; do
      [ -z "$imp" ] && continue
      candidate="${imp%.js}$EXT"
      resolved=$(cd "$SOURCE_ROOT" 2>/dev/null && (cd "$FILE_DIR" && realpath -m --relative-to="$(realpath -m "$SOURCE_ROOT")" "$candidate" 2>/dev/null)) || resolved=""
      [ -z "$resolved" ] && continue
      [ ! -f "$SOURCE_ROOT/$resolved" ] && continue
      grep -qFx "$resolved" "$VISITED" 2>/dev/null && continue
      grep -qFx "$resolved" "$QUEUE" 2>/dev/null && continue
      echo "$resolved" >> "$QUEUE"
    done < <(grep -E "^(import|export).*from ['\"]\\.[^'\"]+['\"]" "$FILE_PATH" \
              | sed -E "s/.*from ['\"]([^'\"]+)['\"].*/\\1/")
  fi
  rm -f ./scoped/_log_pending.md ./scoped/_fix_attempts.md ./scoped/_verify_tail.md ./scoped/_fix_history.md
  NEXT_STATE="select"
else
  # Always go to fix. No cap — see Action description above.
  ATTEMPTS=$((ATTEMPTS + 1))
  echo "$ATTEMPTS" > ./scoped/_fix_attempts.md
  NEXT_STATE="fix"
fi

if [ "$NEXT_STATE" = "fix" ]; then
  cat > ./MEMORY.md << MEMEOF
## State
fix
## Matched Instruction
Verify
## Last Action
Verification failed for $NEXT (attempt $ATTEMPTS/$FIX_CAP); regression tail saved to ./scoped/_verify_tail.md.
## Result
Transitioning to fix.
MEMEOF
else
  cat > ./MEMORY.md << MEMEOF
## State
select
## Matched Instruction
Verify
## Last Action
Verification finalised for $NEXT (exit $EXIT after $ATTEMPTS fix attempts).
## Result
Ready to select next file.
MEMEOF
fi
```

## Instruction: Fix regression
**Condition:** MEMORY state is "fix"
**Action:** A previous verify attempt failed for `current_file`. Diagnose what broke and fix it. Preserve the structural intent of the refactor — don't undo the extraction/rename; address the regression it introduced (missing import, wrong reference, broken signature, etc). When the edit is done, transition back to `verify` so the orchestrator can re-run the verification command.

There is **no attempt cap** — verify→fix iterates until the build is green. Don't repeat fixes you already tried; if the same error keeps surfacing, change tack. Use `./scoped/_fix_history.md` (your accumulated trajectory across this file's fix attempts) to avoid repeating yourself.

Read the failure context and your prior attempts:

```
NEXT=$(cat ./scoped/current_file.md)
SOURCE_ROOT=$(cat ./scoped/source_root.md)
FILE_PATH="$SOURCE_ROOT/$NEXT"
ATTEMPTS=$(cat ./scoped/_fix_attempts.md)

echo "=== Latest verify failure tail ==="
cat ./scoped/_verify_tail.md
echo ""
echo "=== Prior fix attempts on this file ==="
if [ -s ./scoped/_fix_history.md ]; then
  cat ./scoped/_fix_history.md
else
  echo "(this is the first attempt)"
fi
echo ""
echo "=== File under refactor ==="
echo "$FILE_PATH (current attempt: $ATTEMPTS)"
```

Then read the file (and any other workspace files implicated by the failure tail) and make the targeted edit. Use the most surgical tool available — `sed -i` for one-line fixes, `Edit` for precise in-context edits, `write_file` only when a wholesale rewrite is genuinely needed.

After applying the edit, **append a one-paragraph entry to `./scoped/_fix_history.md`** so the next fix attempt (if needed) can see what you tried and the error you were responding to. Keep it short — the next iteration will scan all prior entries:

```
{
  echo ""
  echo "### Attempt $ATTEMPTS"
  echo "- Error observed: <one-sentence summary distilled from the verify tail>"
  echo "- Fix tried: <one-sentence summary of the change you just made>"
} >> ./scoped/_fix_history.md
```

(Replace the angle-bracketed placeholders with concrete text — the orchestrator does NOT substitute these, you do, in your write_file/Edit/heredoc.)

Finally transition to `verify`:

```
cat > ./MEMORY.md << MEMEOF
## State
verify
## Matched Instruction
Fix regression
## Last Action
Applied targeted fix for $NEXT to address verification failure (attempt $ATTEMPTS).
## Result
Re-running verification.
MEMEOF
```

## Instruction: Summarize and return
**Condition:** MEMORY state is "summarize"
**Action:** Build the `summary` return value from `./scoped/summary.md` and the verification outcomes in the refactor log. Write the FULL done state in a single heredoc — the `## Return` block MUST be in the same heredoc:

```
PASS_COUNT=$(grep -c '^### Verify: PASS$' ./scoped/refactor_log.md 2>/dev/null || echo 0)

# Header line summarising verification across the whole run. Note: PASS_COUNT
# only counts files that had a structural log entry; files with purely-local
# refactors don't appear in the log even when verify passed (that's the design).
# Failures don't appear here either — the fix loop has no cap, so any file
# that completed reached PASS by the time it left the verify state.
{
  echo ""
  echo "**Verification:** $PASS_COUNT logged passes (purely-local refactors don't appear in the log even when verify passed)."
} >> ./scoped/summary.md

INDENTED_SUMMARY=$(sed 's/^/  /' ./scoped/summary.md)

cat > ./MEMORY.md << MEMEOF
## State
done
## Matched Instruction
Summarize and return
## Last Action
All files processed; emitting summary.
## Result
Recursive review complete.
## Return
summary: |
$INDENTED_SUMMARY
MEMEOF
```
