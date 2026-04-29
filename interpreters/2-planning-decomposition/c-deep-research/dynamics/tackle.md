# Dynamic: Tackle

Receives push-args: `goal` (the current sub-goal to address), `original_goal` (the user's PROGRAM body — invariant across all recursion), `parent_chain` (the trail of broader goals leading to the current sub-goal, or "(none — this is the root tackle)" at the top).
Produces: `## Return` with key `result` (the artefact of accomplishing the goal — the atomic action's output, or the synthesized sub-results for a composite goal).
State flow: `empty` → (`done` for atomic) | (`decomposing` → `iterating` → `done` for composite).

`tackle.md` is the recursive workhorse. Given a goal + anchors, it:
- assesses feasibility based on a single-tool-call heuristic, with the anchors visible so it can resist drifting into tangential topics;
- if atomic (one tool call suffices, AND meaningfully serves the original_goal): performs the call and returns;
- if composite: pushes `plan.md` (forwarding all anchors) to decompose, iterates `tackle.md` recursively over each sub-goal (extending the parent_chain with the current goal), synthesizes the sub-results addressing the original_goal, returns.

The atomic-vs-composite decision is made adversarially — by the same agent that just considered the goal, BEFORE doing any work. There is no pre-classification by the planner; the heuristic is concrete (one tool call) and the decision is grounded in what the goal would actually require AND in whether the work meaningfully serves the original_goal.

Scoped files (only created if the composite path is taken):
- `./scoped/sub-goals.md` — the bullet list returned by `plan.md` (wholesale write).
- `./scoped/cursor.md` — integer index of the sub-goal currently being tackled (0-based).
- `./scoped/sub-results.md` — accumulating sub-results, **surgical append only** (`echo` / `>>` redirect; never wholesale rewrite).
- `./scoped/result.md` — the synthesized final result before pop (wholesale write).
- `./scoped/child_chain.md` — the parent_chain to forward to children (= our parent_chain + our own goal). Composed once in Iterate, reused by every Continue.

## Instruction: Try
**Condition:** MEMORY state is "empty"
**Action:** Read the anchoring context first:

The user's original goal (root, invariant throughout recursion):

    {{original_goal}}

The trail of broader goals that led here:

    {{parent_chain}}

The current goal to address:

    {{goal}}

**Assess feasibility BEFORE doing any work.** Could the current goal be accomplished with a SINGLE tool call (one bash command, one Write, one WebSearch / WebFetch, etc.)? Use this as your heuristic for atomic vs. composite:

- **Atomic** — the goal corresponds to one concrete action: write a specific file, run one command, fetch one URL, summarize one specific document, etc.
- **Composite** — the goal would require multiple distinct tool calls, has multiple sub-tasks, or asks for something synthesizing multiple inputs (a comparison, a multi-section report, a multi-file project setup, etc.).

**Anti-drift check (critical).** Before deciding "composite", verify the current goal still meaningfully serves the original_goal. If the parent_chain shows you've drifted away from the original topic — for example, your goal is now about a generic concept tangentially related to the original — DO NOT recurse further. Either attempt the goal directly with a single tool call (best effort) or wholesale-rewrite MEMORY with a brief result that says the chain has drifted off-topic and the recursion should unwind. The recursive pattern has no other defense against semantic drift; if the planner produces sub-goals that drift, this instruction is where to catch and stop it.

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

**Composite path:** wholesale-rewrite MEMORY to push `plan.md` (single heredoc — forward all three anchors, with the current goal as the goal-to-decompose):

```
cat > ./MEMORY.md << 'MEMEOF'
## State
decomposing
## Matched Instruction
Try (composite — deferring to plan.md)
## Last Action
Assessed goal as too broad for a single tool call; pushing plan.md to decompose, anchored to the original_goal.
## Result
Decomposition queued.
## Push
dynamics/plan.md
## Push-Args
goal: |
  <verbatim {{goal}}, every line indented two spaces>
original_goal: |
  <verbatim {{original_goal}}, every line indented two spaces>
parent_chain: |
  <verbatim {{parent_chain}}, every line indented two spaces>
MEMEOF
```

## Instruction: Iterate
**Condition:** MEMORY state is "decomposing_completed" and `## Plan` is present
**Action:** Read `## Plan` body from MEMORY. Wholesale-write `./scoped/sub-goals.md` with the bullet list (one bullet per line, each starting with `- `). Initialize `./scoped/cursor.md` with the literal `0` and create empty `./scoped/sub-results.md`:

    awk '/^## Plan$/{f=1; next} /^## /{f=0} f' ./MEMORY.md > ./scoped/sub-goals.md
    echo 0 > ./scoped/cursor.md
    : > ./scoped/sub-results.md

Compose the chain that children will see (= the chain we received + our own goal as a new entry). Write it once to `./scoped/child_chain.md`:

```
cat > ./scoped/child_chain.md << 'CHAIN_EOF'
{{parent_chain}}
- {{goal}}
CHAIN_EOF
```

(If `{{parent_chain}}` was the literal `(none — this is the root tackle)`, the new chain replaces that with just `- {{goal}}` — i.e., overwrite the placeholder with the first real entry.)

Read the FIRST bullet's body (everything after `- ` on the first non-empty line of `./scoped/sub-goals.md`). Wholesale-rewrite MEMORY to push `tackle.md` for that sub-goal, forwarding `original_goal` and the new `child_chain` as the child's `parent_chain` (single heredoc):

```
cat > ./MEMORY.md << 'MEMEOF'
## State
iterating
## Matched Instruction
Iterate
## Last Action
Wrote N sub-goals to ./scoped/sub-goals.md and composed child_chain; pushing tackle.md for sub-goal 1.
## Result
First sub-goal queued.
## Push
dynamics/tackle.md
## Push-Args
goal: |
  <body of the first bullet (after stripping leading "- "), every line indented two spaces>
original_goal: |
  <verbatim {{original_goal}}, every line indented two spaces>
parent_chain: |
  <verbatim contents of ./scoped/child_chain.md, every line indented two spaces>
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

Read the bullet at line `(NEXT + 1)` of `./scoped/sub-goals.md` (1-indexed: `awk -v n=$((NEXT+1)) 'NR==n' ./scoped/sub-goals.md`), strip leading `- `. Wholesale-rewrite MEMORY, reusing `./scoped/child_chain.md` as the child's parent_chain:

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
original_goal: |
  <verbatim {{original_goal}}, every line indented two spaces>
parent_chain: |
  <verbatim contents of ./scoped/child_chain.md, every line indented two spaces>
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

Read `./scoped/sub-goals.md` and `./scoped/sub-results.md`, plus the anchoring context for synthesis quality:

The user's original goal (the synthesis must address THIS, not just the immediate {{goal}}):

    {{original_goal}}

The current goal at this level (one decomposition of the original):

    {{goal}}

Synthesize a consolidated result that addresses the current `{{goal}}` at the appropriate level of granularity AND traces back to advance the `{{original_goal}}`. The synthesis should:

- combine the sub-results into a coherent whole appropriate to what the current goal asked for (a structured report section, a list of files written, a single summary, etc.);
- if the original_goal mentioned a specific output file (e.g. "write to ../../workspace/report.md") AND this is the root tackle (parent_chain is `(none — this is the root tackle)`), write that file via bash as part of this synthesis step. (Non-root tackles produce intermediate results, not the final user-facing artefact.)

Wholesale-write `./scoped/result.md` with the synthesized output, then write MEMORY with the return block (single heredoc — the `## Return` MUST be in the same write as the state change):

```
cat > ./MEMORY.md << 'MEMEOF'
## State
done
## Matched Instruction
Synthesize
## Last Action
Synthesized N sub-results into final result anchored to the original_goal; popping back to caller.
## Result
Sub-results synthesized.
## Return
result: |
  <verbatim ./scoped/result.md body, every line indented two spaces>
MEMEOF
```
