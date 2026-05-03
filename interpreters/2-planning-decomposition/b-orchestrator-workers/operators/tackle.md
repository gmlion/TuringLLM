# Dynamic: Tackle

Receives push-args: `goal` (the current sub-task to address), `original_goal` (the user's PROGRAM body — invariant across all recursion), `parent_chain` (the trail of broader goals leading to the current sub-task, or "(none — this is the root tackle)" at the top), `role` (the producer role identified at strategy Initialize, invariant throughout recursion).
Produces: `## Return` with key `result` (the artefact of accomplishing the sub-task — the atomic action's output, or the synthesized sub-results for a composite sub-task).
State flow: `empty` → (`done` for atomic) | (`decomposing` → `iterating` → `done` for composite).

`tackle.md` is the recursive workhorse. Given a sub-task + anchors + role, it:
- decides as the role would: produce this now, or split into sub-tasks?
- if produce now (atomic): performs the work in one tool call and returns;
- if split (composite): pushes `plan.md` (forwarding all anchors + role) to decompose, iterates `tackle.md` recursively over each sub-task (extending the parent_chain with the current sub-task), synthesizes the sub-results, returns.

The atomic-vs-composite decision is professional judgement — what the role would naturally do — not a rule-matching exercise. A researcher writing one section just writes it. An analyst summarizing one document just summarizes it. A developer writing one config file just writes it.

Scoped files:
- `./scoped/justification.md` — the short justification the model writes BEFORE deciding atomic vs. composite (always created in Try, regardless of branch — debugging artefact).

Scoped files (only created if the composite path is taken):
- `./scoped/sub-goals.md` — the bullet list returned by `plan.md` (wholesale write).
- `./scoped/cursor.md` — integer index of the sub-task currently being tackled (0-based).
- `./scoped/sub-results.md` — accumulating sub-results, **surgical append only** (`echo` / `>>` redirect; never wholesale rewrite).
- `./scoped/result.md` — the synthesized final result before pop (wholesale write).
- `./scoped/child_chain.md` — the parent_chain to forward to children (= our parent_chain + our own sub-task). Composed once in Iterate, reused by every Continue.

## Instruction: Try
**Condition:** MEMORY state is "empty"
**Action:** Read the anchoring context first:

You are: {{role}}.

The user's original goal (root, invariant throughout recursion):

    {{original_goal}}

The trail of broader sub-tasks that led here:

    {{parent_chain}}

The current sub-task to address:

    {{goal}}

**Architectural constraint you MUST honour when choosing composite.** Every child tackle runs in *complete isolation*. Each child receives only its own `goal` plus the same anchors (`original_goal`, `parent_chain`, `role`) — it cannot see its siblings' results, intermediate work, or this frame's accumulating notes. Sibling outputs are synthesized HERE, in this frame's Synthesize step, after all children have returned.

Consequence: composite is only valid if the proposed sub-tasks are **mutually independent**. Sequential workflow splits — "gather sources → analyse → write up", "design → implement → test", "collect data → visualise" — are *structurally broken* under this architecture: the second sub-task lands in a frame with no access to the first's output and will hallucinate or stall. If your decomposition has cross-sub-task dependencies, it is wrong; restructure into independent components, or choose atomic if no independent decomposition exists.

**Justify before choosing.** Wholesale-write `./scoped/justification.md` (short blob) framing the decision in terms of the FINAL ARTIFACT the {{role}} is producing for the original_goal:

- If you intend atomic: name the concrete output this single tool call will produce, and the specific part of the final artifact it advances.
- If you intend composite: name each proposed sub-task as a **parallel structural component** of the final artifact — whatever {{role}} naturally builds with (a section in a document, a file in a project, an entry in a list, an item in a comparison, a dimension to investigate). Each component must stand on its own without referring to its siblings.

Re-read your justification and check three failure modes:
- **Sequential phases:** if your sub-tasks form a workflow (do A, then with A's output do B) — invalid; the children run in isolation and B will not see A. Restructure into independent components, or choose atomic if no independent decomposition exists.
- **Over-decomposition:** if your composite sub-tasks read as sub-divisions inside a single component a {{role}} would naturally produce in one pass — choose atomic.
- **Wrong granularity (atomic case):** if your atomic case can't point to a specific part of the final artifact it serves, reconsider whether this sub-task should exist at all (or try composite if there really are independent components).

Now decide as {{role}} would: produce this now (atomic — one tool call yields the artefact), or split into mutually-independent sub-tasks (composite — push plan.md to decompose)? Professional judgement appropriate to the role.

If your decision is **atomic**: perform the single tool call. Capture its relevant output. Then wholesale-rewrite MEMORY (single heredoc — the `## Return` block MUST be in the same write as the state change):

```
cat > ./MEMORY.md << 'MEMEOF'
## State
done
## Matched Instruction
Try (atomic)
## Last Action
Executed single tool call as {{role}} for the sub-task.
## Result
<short one-line description of what was done>
## Return
result: |
  <description of what was done plus the tool's relevant output (file path written, command output, fetched content, etc.), every line indented two spaces>
MEMEOF
```

If your decision is **composite**: do not perform any partial work. Wholesale-rewrite MEMORY to push `plan.md` (forwarding all anchors + role; single heredoc — the `## Push` block MUST be in the same write as the state change):

```
cat > ./MEMORY.md << 'MEMEOF'
## State
decomposing
## Matched Instruction
Try (composite — deferring to plan.md)
## Last Action
Decided as {{role}} to split this sub-task; pushing plan.md to decompose, anchored to the original_goal.
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
role: |
  <verbatim {{role}}, every line indented two spaces>
MEMEOF
```

## Instruction: Iterate
**Condition:** MEMORY state is "decomposing_completed" and `## Plan` is present
**Action:** Read `## Plan` body from MEMORY. Wholesale-write `./scoped/sub-goals.md` with the bullet list (one bullet per line, each starting with `- `). Initialize `./scoped/cursor.md` with the literal `0` and create empty `./scoped/sub-results.md`:

    awk '/^## Plan$/{f=1; next} /^## /{f=0} f' ./MEMORY.md > ./scoped/sub-goals.md
    echo 0 > ./scoped/cursor.md
    : > ./scoped/sub-results.md

Compose the chain children will see (= the chain we received + our own sub-task as a new entry). Write it once to `./scoped/child_chain.md`:

```
cat > ./scoped/child_chain.md << 'CHAIN_EOF'
{{parent_chain}}
- {{goal}}
CHAIN_EOF
```

(If `{{parent_chain}}` was the literal `(none — this is the root tackle)`, the new chain replaces that placeholder with the first real entry: just `- {{goal}}`.)

Read the FIRST bullet's body (everything after `- ` on the first non-empty line of `./scoped/sub-goals.md`). Wholesale-rewrite MEMORY to push `tackle.md` for that sub-task, forwarding `original_goal`, `role`, and the new `child_chain` as the child's `parent_chain` (single heredoc):

```
cat > ./MEMORY.md << 'MEMEOF'
## State
iterating
## Matched Instruction
Iterate
## Last Action
Wrote N sub-tasks to ./scoped/sub-goals.md and composed child_chain; pushing tackle.md for sub-task 1.
## Result
First sub-task queued.
## Push
dynamics/tackle.md
## Push-Args
goal: |
  <body of the first bullet (after stripping leading "- "), every line indented two spaces>
original_goal: |
  <verbatim {{original_goal}}, every line indented two spaces>
parent_chain: |
  <verbatim contents of ./scoped/child_chain.md, every line indented two spaces>
role: |
  <verbatim {{role}}, every line indented two spaces>
MEMEOF
```

## Instruction: Continue
**Condition:** MEMORY state is "iterating_completed" AND `## Result` is present AND the cursor in `./scoped/cursor.md` is less than `(number of bullets in ./scoped/sub-goals.md - 1)`
**Action:** This is a non-final sub-result. Append it surgically to `./scoped/sub-results.md`, advance the cursor, and push the next sub-task:

    CURRENT=$(cat ./scoped/cursor.md)
    NEXT=$((CURRENT + 1))
    {
      echo ""
      echo "### Sub-result $((CURRENT + 1)):"
      awk '/^## Result$/{f=1; next} /^## /{f=0} f' ./MEMORY.md
    } >> ./scoped/sub-results.md
    echo $NEXT > ./scoped/cursor.md

Read the bullet at line `(NEXT + 1)` of `./scoped/sub-goals.md` (1-indexed: `awk -v n=$((NEXT+1)) 'NR==n' ./scoped/sub-goals.md`), strip leading `- `. Wholesale-rewrite MEMORY, reusing `./scoped/child_chain.md` as the child's parent_chain and forwarding `role`:

```
cat > ./MEMORY.md << 'MEMEOF'
## State
iterating
## Matched Instruction
Continue
## Last Action
Recorded sub-result <CURRENT+1>; pushing tackle.md for sub-task <NEXT+1>.
## Result
Next sub-task queued.
## Push
dynamics/tackle.md
## Push-Args
goal: |
  <body of the bullet at line (NEXT+1) (after stripping leading "- "), every line indented two spaces>
original_goal: |
  <verbatim {{original_goal}}, every line indented two spaces>
parent_chain: |
  <verbatim contents of ./scoped/child_chain.md, every line indented two spaces>
role: |
  <verbatim {{role}}, every line indented two spaces>
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

Read `./scoped/sub-goals.md` and `./scoped/sub-results.md`, plus the anchoring context for synthesis:

You are: {{role}}.

The user's original goal (the synthesis must address THIS, not just the immediate {{goal}}):

    {{original_goal}}

The current sub-task at this level (one decomposition of the original):

    {{goal}}

As {{role}}, synthesize a consolidated result that addresses the current sub-task at the appropriate level of granularity AND traces back to advance the original goal. The synthesis should:

- combine the sub-results into a coherent whole appropriate to what the current sub-task asked for;
- if the original_goal mentioned a specific output file (e.g. "write to ../../workspace/report.md") AND this is the root tackle (parent_chain is `(none — this is the root tackle)`), write that file via bash as part of this synthesis step. (Non-root tackles produce intermediate results, not the final user-facing artefact.)

Wholesale-write `./scoped/result.md` with the synthesized output, then write MEMORY with the return block (single heredoc — the `## Return` MUST be in the same write as the state change):

```
cat > ./MEMORY.md << 'MEMEOF'
## State
done
## Matched Instruction
Synthesize
## Last Action
Synthesized N sub-results into final result as {{role}}; popping back to caller.
## Result
Sub-results synthesized.
## Return
result: |
  <verbatim ./scoped/result.md body, every line indented two spaces>
MEMEOF
```
