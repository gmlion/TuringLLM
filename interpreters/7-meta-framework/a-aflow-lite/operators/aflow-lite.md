# Operator: AFlow-lite (MCTS over operator workflows)

A lightweight meta-framework following Zhang et al. (arXiv:2410.10762) that runs Monte Carlo Tree Search over candidate workflows composed from a fixed library of five operators. Each tree node represents a candidate workflow (a comma-separated list of operator names); the root n0 is the empty workflow. Each MCTS iteration: Select a leaf via UCT, Expand it via `operators/expand-workflow.md` (k=5 children), Simulate each candidate by running its operators on 3 GSM8K items, Evaluate via mean fraction passing, Back-propagate the reward up the chosen-child path. Halts on the first 1.0 reward, or after `max_iterations`.

Receives push-args (mode 1: standalone via root-operator bootstrap):
  - `{{program}}` — the user's PROGRAM.md content.

(AFlow-lite is invoked only standalone in v1 — never as a sub-operator. The operator file does not contain `{{task}}` or `{{prior_answer}}` placeholders since AFlow-lite is not part of any other workflow.)

Produces: `## State done` + `## Return` block with key `answer` (the best workflow found and its score), alongside `## Solution` (winner) or `## No Solution Found` for human inspection.

## Architecture: bookkeeping in scripts, judgement in prose

Every state transition that is pure bookkeeping (UCT descent, advancing counters, scoring, back-prop, halt detection) lives in a checked-in shell script under `../../lib/*.sh`. Each instruction below invokes one script as a single bash tool call. **Do not summarise these scripts or rewrite their behaviour inline** — the whole point of the lib/ split is that bookkeeping is deterministic and out of the prompt. Only `Init-write-scorer` and the operator-pushing semantics involve LLM judgement; everything else is mechanical.

The scripts assume CWD is the active frame directory. They read and write `./scoped/*` and rewrite `./MEMORY.md` directly.

## Scoped files

| File | Lifetime | Content |
|------|----------|---------|
| `./scoped/tree.md` | whole run | YAML-block ledger of MCTS nodes (id, parent_id, depth, q, n, status) |
| `./scoped/task.md` | whole run | byte-equal copy of `../../PROGRAM.md` |
| `./scoped/max_iterations.md` | whole run | `10` |
| `./scoped/uct_c.md` | whole run | `1.41421356` |
| `./scoped/iter_count.md` | whole run | integer; bumped per iteration |
| `./scoped/benchmark_items.md` | whole run | the 3 sampled items as JSON lines |
| `./scoped/cursor.md` | whole run | one node id (selection target) |
| `./scoped/chosen_child.md` | whole run | one node id (rollout origin) |
| `./scoped/recent_scores.md` | whole run | last N (workflow, score) pairs, capped |
| `./scoped/state-<id>.md` | whole run | per-node workflow recipe (comma-separated) |
| `./scoped/scorer.sh` | whole run | per-program scorer; written once by Init-write-scorer |
| `./scoped/sim/*` | per-iteration | simulation tracking (current_item, current_op, scores, last_answer); wiped at evaluate time |

## Operator library

Hardcoded in `../../lib/common.sh`:

    LIBRARY="refine,reflexion,cove,plan-execute,debate"

The library does NOT include `self-refine` (subsumed by `refine`), `tot`/`lats` (search-over-search recursion), `metagpt`/`chatdev` (end-to-end pipelines), or `MoA` (deferred — blocked on per-prompt model selection in the harness).

## Scorer contract

`./scoped/scorer.sh` is the only program-specific code in this run. It is written once by the LLM at Init-write-scorer based on PROGRAM.md and the benchmark items.

Contract:
- **Input:** the operator chain's final answer text on stdin; the expected answer (verbatim from the fixture's `answer` field) as `$1`.
- **Output:** a single line on stdout — `1` for pass, `0` for fail.
- **No other side effects.** Must terminate. Must be idempotent.

Example (GSM8K, integer answers):

```bash
#!/usr/bin/env bash
EXPECTED="$1"
ANSWER=$(cat)
ACTUAL=$(printf '%s\n' "$ANSWER" | grep -oE '[-+]?[0-9]+' | tail -n 1)
[ "$ACTUAL" = "$EXPECTED" ] && echo 1 || echo 0
```

The LLM should adapt this to whatever the program's fixture demands (string match, regex extraction, structured comparison, etc.).

## Instruction: Initialize
**Condition:** MEMORY state is "empty"
**Action:** Run `bash ../../lib/initialize.sh`. The script copies PROGRAM.md, samples 3 benchmark items, seeds the tree, and transitions MEMORY to `init_scorer_pending`. Do not run any other commands or rewrite MEMORY yourself.

## Instruction: Init-write-scorer
**Condition:** MEMORY state is "init_scorer_pending"
**Action:** Read `./scoped/task.md` (the program) and `./scoped/benchmark_items.md` (3 JSON lines, each with `question` and `answer`). Decide how to compare an operator's textual output to the fixture's `answer` field. Write a small bash scorer to `./scoped/scorer.sh` honouring the contract above (stdin = answer text; `$1` = expected; stdout = `1` or `0`). For numeric benchmarks like GSM8K, "extract the last integer from stdin and compare to `$1`" is correct. Mark the scorer executable with `chmod +x`. Then wholesale-rewrite MEMORY to transition to `selecting`:

```
cat > ./MEMORY.md << EOF
## State
selecting
## Matched Instruction
Init-write-scorer
## Last Action
Wrote per-program scorer at ./scoped/scorer.sh.
## Result
Ready for first MCTS iteration.
EOF
```

# Sub-instructions

## Instruction: Select
**Condition:** MEMORY state is "selecting"
**Action:** Run `bash ../../lib/select.sh`. The script descends the MCTS tree via UCT, writes the leaf id to `./scoped/cursor.md`, and transitions MEMORY to `expanding`.

## Instruction: Expand-push
**Condition:** MEMORY state is "expanding"
**Action:** Run `bash ../../lib/expand_push.sh`. The script stages push-args (current workflow recipe, library, recent scores) and emits `## Push operators/expand-workflow.md`. The state value `expanding` is the returnState; on pop the shell sets state to `expanding_completed`, which Expand-absorb matches.

## Instruction: Expand-absorb
**Condition:** MEMORY state is "expanding_completed" and `## Children` is present in MEMORY
**Action:** Run `bash ../../lib/expand_absorb.sh`. The script parses the spliced `## Children` block (5 workflow recipes), allocates child nodes, writes `./scoped/state-<id>.md` per child, records the leftmost child as `./scoped/chosen_child.md`, and transitions MEMORY to `simulating`. On zero children, the cursor is marked `terminal_fail` and MEMORY transitions to `selecting`.

## Instruction: Simulate-push
**Condition:** MEMORY state is "simulating"
**Action:** Run `bash ../../lib/sim_push.sh`. The script reads simulation counters, picks the next operator from the chosen child's recipe, composes push-args (`task` from the current item, `prior_answer` from the previous operator's answer), and emits `## Push operators/<op>.md`.

## Instruction: Simulate-absorb
**Condition:** MEMORY state is "simulating_completed"
**Action:** Run `bash ../../lib/sim_absorb.sh`. The script captures the just-popped operator's `## Answer`, advances `current_op`, and (when the recipe is exhausted) scores the item via `./scoped/scorer.sh`, advances `current_item`, and either transitions to `evaluating` (all items done) or loops back to `simulating`.

## Instruction: Evaluate-absorb
**Condition:** MEMORY state is "evaluating"
**Action:** Run `bash ../../lib/eval_absorb.sh`. The script computes mean reward across the 3 item scores, back-propagates from chosen_child to root, appends to `./scoped/recent_scores.md`, wipes `./scoped/sim/`, and transitions MEMORY: to `done` with `## Solution` if reward == 1.0; to `done` with `## No Solution Found` if `iter_count` reached `max_iterations`; to `selecting` otherwise.
