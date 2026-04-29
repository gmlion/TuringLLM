# Dynamic: Tackle

Receives push-arg: `goal`.
Produces: `## Return` with key `result` (the artefact of accomplishing the goal — the atomic action's output, or the synthesized sub-results for a composite goal).
State flow: `empty` → (`done` for atomic) | (`decomposing` → `iterating` → `done` for composite).
Stack: 1 (atomic Try); 2 momentarily (composite — pushes `plan.md`); then 1 between sub-goals; then 1 + N recursive (each sub-goal that turns out composite recurses by pushing `tackle.md`).

`tackle.md` is the recursive workhorse. Given a goal, it:
- assesses feasibility based on a single-tool-call heuristic;
- if atomic (one tool call suffices): performs the call and returns;
- if composite: pushes `plan.md` to decompose, iterates `tackle.md` recursively over each sub-goal, synthesizes the sub-results, returns.

The atomic-vs-composite decision is made adversarially — by the same agent that just considered the goal, BEFORE doing any work. There is no pre-classification by the planner; the heuristic is concrete (one tool call) and the decision is grounded in what the goal would actually require.

Scoped files (only created if the composite path is taken):
- `./scoped/sub-goals.md` — the bullet list returned by `plan.md` (wholesale write).
- `./scoped/cursor.md` — integer index of the sub-goal currently being tackled (0-based).
- `./scoped/sub-results.md` — accumulating sub-results, **surgical append only** (`echo` / `>>` redirect; never wholesale rewrite).
- `./scoped/result.md` — the synthesized final result before pop (wholesale write).

## Instruction: Try
**Condition:** MEMORY state is "empty"
**Action:** Read the goal:

    {{goal}}

**Assess feasibility BEFORE doing any work.** Could the goal be accomplished with a SINGLE tool call (one bash command, one Write, one WebSearch / WebFetch, etc.)? Use this as your heuristic for atomic vs. composite:

- **Atomic** — the goal corresponds to one concrete action: write a specific file, run one command, fetch one URL, summarize one specific document, etc.
- **Composite** — the goal would require multiple distinct tool calls, has multiple sub-tasks, or asks for something synthesizing multiple inputs (a comparison, a multi-section report, a multi-file project setup, etc.).

If the assessment is composite, **do not perform any partial work** — defer entirely to decomposition.

**Atomic path:** perform the single tool call. Capture its relevant output. Then wholesale-rewrite MEMORY (single heredoc — the `## Return` block MUST be in the same write as the state change):

```
cat > ./MEMORY.md << 'MEMEOF'
## State
done
## Matched Instruction
Try (atomic)
## Last Action
Executed single tool call for the goal.
## Result
<short one-line description of what was done>
## Return
result: |
  <description of what was done plus the tool's relevant output (file path written, command output, fetched content, etc.), every line indented two spaces>
MEMEOF
```

**Composite path:** wholesale-rewrite MEMORY to push `plan.md` (single heredoc — the `## Push` block MUST be in the same write as the state change):

```
cat > ./MEMORY.md << 'MEMEOF'
## State
decomposing
## Matched Instruction
Try (composite — deferring to plan.md)
## Last Action
Assessed goal as too broad for a single tool call; pushing plan.md to decompose.
## Result
Decomposition queued.
## Push
dynamics/plan.md
## Push-Args
goal: |
  <verbatim {{goal}}, every line indented two spaces>
MEMEOF
```

## Instruction: Iterate
**Condition:** MEMORY state is "decomposing_completed" and `## Plan` is present
**Action:** Read `## Plan` body from MEMORY. Wholesale-write `./scoped/sub-goals.md` with the bullet list (one bullet per line, each starting with `- `). Initialize `./scoped/cursor.md` with the literal `0` and create empty `./scoped/sub-results.md`:

    awk '/^## Plan$/{f=1; next} /^## /{f=0} f' ./MEMORY.md > ./scoped/sub-goals.md
    echo 0 > ./scoped/cursor.md
    : > ./scoped/sub-results.md

Read the FIRST bullet's body (everything after `- ` on the first non-empty line of `./scoped/sub-goals.md`). Wholesale-rewrite MEMORY to push `tackle.md` for that sub-goal (single heredoc):

```
cat > ./MEMORY.md << 'MEMEOF'
## State
iterating
## Matched Instruction
Iterate
## Last Action
Wrote N sub-goals to ./scoped/sub-goals.md; pushing tackle.md for sub-goal 1.
## Result
First sub-goal queued.
## Push
dynamics/tackle.md
## Push-Args
goal: |
  <body of the first bullet (after stripping leading "- "), every line indented two spaces>
MEMEOF
```

## Instruction: Continue
**Condition:** MEMORY state is "iterating_completed" AND `## Result` is present AND the cursor in `./scoped/cursor.md` is less than `(number of bullets in ./scoped/sub-goals.md - 1)`
**Action:** This is a non-final sub-result. Append it surgically to `./scoped/sub-results.md`, advance the cursor, and push the next sub-goal:

    CURRENT=$(cat ./scoped/cursor.md)
    NEXT=$((CURRENT + 1))
    {
      echo ""
      echo "### Sub-result $((CURRENT + 1)):"
      awk '/^## Result$/{f=1; next} /^## /{f=0} f' ./MEMORY.md
    } >> ./scoped/sub-results.md
    echo $NEXT > ./scoped/cursor.md

Read the bullet at line `(NEXT + 1)` of `./scoped/sub-goals.md` (1-indexed: `awk -v n=$((NEXT+1)) 'NR==n' ./scoped/sub-goals.md`), strip leading `- `. Wholesale-rewrite MEMORY:

```
cat > ./MEMORY.md << 'MEMEOF'
## State
iterating
## Matched Instruction
Continue
## Last Action
Recorded sub-result <CURRENT+1>; pushing tackle.md for sub-goal <NEXT+1>.
## Result
Next sub-goal queued.
## Push
dynamics/tackle.md
## Push-Args
goal: |
  <body of the bullet at line (NEXT+1) (after stripping leading "- "), every line indented two spaces>
MEMEOF
```

## Instruction: Synthesize
**Condition:** MEMORY state is "iterating_completed" AND `## Result` is present AND the cursor in `./scoped/cursor.md` equals `(number of bullets in ./scoped/sub-goals.md - 1)`
**Action:** This is the LAST sub-result. Append it, then synthesize:

    CURRENT=$(cat ./scoped/cursor.md)
    {
      echo ""
      echo "### Sub-result $((CURRENT + 1)):"
      awk '/^## Result$/{f=1; next} /^## /{f=0} f' ./MEMORY.md
    } >> ./scoped/sub-results.md

Read `./scoped/sub-goals.md` and `./scoped/sub-results.md`. Synthesize a consolidated result that addresses the original `{{goal}}` at the appropriate level of granularity. The synthesis should:

- combine the sub-results into a coherent whole appropriate to what the original goal asked for (a structured report, a list of files written, a single summary, etc.);
- if the original goal mentioned a specific output file (e.g. "write to ../../workspace/report.md"), write that file via bash as part of this synthesis step.

Wholesale-write `./scoped/result.md` with the synthesized output, then write MEMORY with the return block (single heredoc — the `## Return` MUST be in the same write as the state change):

```
cat > ./MEMORY.md << 'MEMEOF'
## State
done
## Matched Instruction
Synthesize
## Last Action
Synthesized N sub-results into final result; popping back to caller.
## Result
Sub-results synthesized.
## Return
result: |
  <verbatim ./scoped/result.md body, every line indented two spaces>
MEMEOF
```
