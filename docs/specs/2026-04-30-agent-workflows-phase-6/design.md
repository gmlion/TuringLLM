# Design: agent-workflows-phase-6

## Overview

The Tree-of-Thoughts interpreter is a single strategy frame that drives a level-wise BFS over partial Game-of-24 states, dispatching each node action to one of three single-cycle dynamics (`expand-node.md`, `score.md`, `evaluate.md`) via the existing push/pop machinery. The growing search tree lives in the strategy frame's `./scoped/tree.md` as an append-only YAML-block ledger; field updates (value, samples, status) are performed by awk-based surgical edits without ever wholesale-rewriting the ledger after the root node is written. The core trade-off is **paper fidelity over cycle economy**: scoring each child 3× per Yao et al. costs ~165 score dispatches per Game of 24 puzzle (~500 LLM cycles total via the strategy's two-cycle push/absorb pattern), accepted as the explicit price of comparability with the published benchmark.

## Requirement coverage

| R# | Summary | Addressed in |
| -- | ------- | ------------ |
| R1 | Interpreter directory layout | §Architecture, §Test strategy |
| R2 | Group-level README at `interpreters/3-search/README.md` | §Architecture, §Test strategy |
| R3 | Leaf README content | §Architecture, §Test strategy |
| R4 | Source-spec dynamics-table update | §Architecture (Source-spec mutation) |
| R5 | Parse PROGRAM.md for numbers and target | §Interfaces (Initialize), §Error handling |
| R6 | Insufficient-input fallback to `waiting_for_user` | §Error handling |
| R7 | Persist numbers, target, max_depth | §Data model (Scoped files), §Interfaces (Initialize) |
| R8 | Append root node block to tree.md | §Data model (Tree ledger), §Interfaces (Initialize) |
| R9 | Transition to `expanding` with depth=0 | §Interfaces (Initialize) |
| R10 | tree.md as YAML-block sequence | §Data model (Tree ledger) |
| R11 | Required keys per node block | §Data model (Tree ledger) |
| R12 | Surgical-edit-only after root | §Data model (Tree ledger), §Interfaces (Update primitives) |
| R13 | Monotonic `n<index>` IDs | §Data model (Tree ledger), §Interfaces (Append node) |
| R14 | Status enum and one-way transitions | §Data model (Tree ledger) |
| R15 | Pick unexpanded live node at current depth | §Interfaces (Expand-push) |
| R16 | Push expand-node.md with three push-args | §Interfaces (Expand-push) |
| R17 | Append children on _completed | §Interfaces (Expand-absorb) |
| R18 | Transition out of `expanding` | §Interfaces (Expand-absorb) |
| R19 | Pick unscored live child | §Interfaces (Score-push) |
| R20 | Push score.md with two push-args | §Interfaces (Score-push) |
| R21 | Increment samples, add weighted value | §Interfaces (Score-absorb), §Data model (Weight mapping) |
| R22 | Transition to pruning when level fully scored | §Interfaces (Score-absorb) |
| R23 | Free interleaving of expand/score | §Interfaces (Phase-routing) |
| R24 | Prune by value desc, keep top b=5 | §Interfaces (Prune) |
| R25 | Transition to advancing | §Interfaces (Prune) |
| R26 | Increment depth, advance to expanding | §Interfaces (Advance) |
| R27 | Transition to goal_checking at max_depth | §Interfaces (Advance) |
| R28 | Pick live terminal candidate | §Interfaces (Goal-push) |
| R29 | Reconstruct expression by walking parent chain | §Interfaces (Goal-push), §Interfaces (Walk-parents primitive) |
| R30 | Push evaluate.md with attempt and criterion | §Interfaces (Goal-push) |
| R31 | Mark terminal_pass and transition to solved | §Interfaces (Goal-absorb) |
| R32 | Mark terminal_fail and remain in goal_checking | §Interfaces (Goal-absorb) |
| R33 | Malformed verdict → fail + Pending Questions | §Error handling |
| R34 | Exhaustion → No Solution Found + done | §Interfaces (Goal-absorb) |
| R35 | Solved → write Solution + done | §Interfaces (Solved) |
| R36 | Halt at stack depth 1 | §Architecture (Stack discipline) |
| R37 | Empty-frontier dead-end at pruning | §Interfaces (Prune) |
| R38 | expand-node.md push-arg declaration | §Interfaces (expand-node.md) |
| R39 | expand-node.md single-cycle, k=5 children | §Interfaces (expand-node.md) |
| R40 | expand-node.md no further pushes | §Interfaces (expand-node.md) |
| R41 | score.md push-arg declaration | §Interfaces (score.md) |
| R42 | score.md single-cycle, three-label return | §Interfaces (score.md) |
| R43 | score.md no further pushes | §Interfaces (score.md) |
| R44 | Malformed label → impossible + Pending Questions | §Error handling |
| R45 | evaluate.md byte-equal copy | §Architecture, §Test strategy |
| R46 | Identity test extension | §Test strategy |
| R47 | Malformed expand-node output handling | §Error handling |
| R48 | Demo PROGRAM.md as free prose | §Architecture (Demo), §Interfaces (Initialize parsing) |
| R49 | Solvable puzzle at max_depth | §Architecture (Demo) |
| R50 | Demo end-state shape | §Test strategy |
| R51 | phase-6-tot.test.ts content | §Test strategy |
| R52 | No workspace tree state | §Architecture |
| R53 | k, b not configurable | §Architecture (Hardcoded constants) |
| R54 | No GoT variant | §Architecture |
| R55 | No retry/budget/restart beyond BFS | §Architecture (Stack discipline) |
| R56 | No pushed-frame access to parent scoped/ | §Architecture (Stack discipline), §Interfaces (Push-args contract) |
| R57 | No concurrency primitives | §Architecture |

## Architecture

### Component layout

```
interpreters/3-search/
├── README.md                     # group-level: Group 3 — Search                 (R2)
└── a-tot/
    ├── INSTRUCTIONS.md           # strategy: BFS controller                       (R1)
    ├── PROGRAM.md                # demo: free prose Game of 24 puzzle             (R1, R48, R49)
    ├── README.md                 # leaf: pattern citation, state machine, etc.   (R1, R3)
    └── dynamics/
        ├── expand-node.md        # NEW: generates k=5 children                   (R38–R40)
        ├── score.md              # NEW: returns sure/likely/impossible           (R41–R44)
        └── evaluate.md           # COPY: byte-equal of 1b/dynamics/evaluate.md   (R45, R46)
```

### Stack discipline (R36, R55, R56, R57)

The strategy is the only frame on the stack at rest; a single push to one of the three dynamics raises stack depth to 2 for one cycle, after which the dynamic pops back to 1. **Effective stack depth never exceeds 2.** No dynamic ever pushes another dynamic (R40, R43; evaluate.md is already known to be leaf).

The strategy never executes anything in parallel: each cycle dispatches at most one push, and the BFS schedule (k=5, b=5, max_depth = N − 1) is the only termination guarantee — there is no separate cycle budget, retry counter, or restart loop.

Pushed frames receive everything they need via `## Push-Args` and emit results via `## Return`. The strategy frame's `./scoped/` is **never reached into** by a child frame; the shell does not provide that affordance and the design does not introduce a workaround.

### Source-spec mutation (R4)

`docs/agent-workflows/requirements.md` is updated as part of this phase to fix the dynamics-table row that prefigured ToT before the contracts were finalised. The replacement reads:

> | `expand-node.md` | 6 | `## Parent Thought` | `## Children` | 1 |
> | `score.md` | 6 | `## Thought` | `## Value` | 1 |

A short paragraph beneath the table records the rationale: graded ranking is structurally distinct from terminal pass/fail and would mangle `evaluate.md`'s contract (a 4-consumer shared dynamic), so two single-purpose dynamics replace one. This is a deliberate deviation from guiding principle 5 ("no speculative dynamics") that LATS (Phase 6b) is expected to validate by also consuming `score.md`.

### Hardcoded constants (R53)

The constants `k=5`, `b=5`, weight mapping `{sure: 20, likely: 1, impossible: 0.001}`, and the score-sampling count `3` are written into `INSTRUCTIONS.md` as bash literals; `PROGRAM.md` does not declare any of them. `max_depth` is the only run-time-derived parameter (= len(numbers) − 1).

### Demo PROGRAM.md (R48, R49)

Free-prose puzzle statement, e.g.:

> Find an arithmetic expression using **4, 5, 6, and 10** exactly once that evaluates to **24** using only `+`, `−`, `×`, `÷` and parentheses.

The numeric content is literally embedded in the prose; `Initialize` extracts the four numbers and the target via a `grep -oE '[0-9]+'` pipeline (see §Interfaces — Initialize).

The chosen puzzle `4 5 6 10 → 24` has at least one solution (e.g. `4 + 6 × (10 − 5) − ... ` is illustrative; any one valid expression suffices). The PROGRAM.md prose mentions only the four numbers and target — no hint at a specific solution path.

## Data model

### Tree ledger — `./scoped/tree.md` (R10–R14)

A sequence of YAML-style blocks separated by `---` lines, one block per node, in append order:

```
---
id: n0
parent_id: -
depth: 0
op: -
left: 4 5 6 10
value: 0
samples: 0
status: live
---
id: n1
parent_id: n0
depth: 1
op: 4 + 5 = 9
left: 9 6 10
value: 0
samples: 0
status: live
…
```

**Field definitions:**

| Field | Type | Range | Semantics |
| ----- | ---- | ----- | --------- |
| `id` | string | `n0`, `n1`, … | monotonic node id (R13) |
| `parent_id` | string | `-` for root, otherwise existing `n<i>` | edge to parent |
| `depth` | int | `0..max_depth` | BFS level |
| `op` | string | `-` for root, otherwise `<a> <op> <b> = <result>` | the binary op that produced this state |
| `left` | string | space-separated ints | numbers remaining to combine |
| `value` | float | `[0, 60]` | sum of weighted score labels (3 samples max) |
| `samples` | int | `0..3` | how many times `score.md` has scored this node |
| `status` | enum | `live`, `pruned`, `terminal_pass`, `terminal_fail` | R14 transitions: `live → pruned`, `live → terminal_pass`, `live → terminal_fail`, no reverse |

**Weight mapping** (R21): `sure → 20`, `likely → 1`, `impossible → 0.001`. Range `[0.003, 60]` after 3 samples.

**Append-only invariant** (R12): the only operation that *adds bytes anywhere except at end-of-file* is the awk-based surgical update of `value`, `samples`, or `status` of an existing block; that update changes byte length only of the targeted line.

### Scoped files — strategy frame's `./scoped/` (R7)

| File | Lifetime | Content | Edit pattern |
| ---- | -------- | ------- | ------------ |
| `./scoped/tree.md` | whole run | YAML-block ledger described above | append + awk-update only |
| `./scoped/numbers.md` | whole run | space-separated integers from PROGRAM.md | wholesale-write at Initialize, never again |
| `./scoped/target.md` | whole run | one integer (the puzzle target) | wholesale-write at Initialize, never again |
| `./scoped/max_depth.md` | whole run | one integer (= N − 1) | wholesale-write at Initialize, never again |
| `./scoped/current_depth.md` | whole run | one integer | wholesale-write at each Advance |
| `./scoped/cursor.md` | whole run | one node id (the node being acted on this cycle) | wholesale-write each push instruction |
| `./scoped/staged/parent_thought.md` | per-dispatch | push-arg staging | wholesale-write each Expand-push |
| `./scoped/staged/numbers_remaining.md` | per-dispatch | push-arg staging | wholesale-write each Expand-push |
| `./scoped/staged/thought.md` | per-dispatch | push-arg staging | wholesale-write each Score-push |
| `./scoped/staged/attempt.md` | per-dispatch | reconstructed expression | wholesale-write each Goal-push |
| `./scoped/staged/criterion.md` | per-dispatch | synthesized criterion | wholesale-write each Goal-push |

The strategy never holds tree-shaped state in MEMORY; MEMORY exists only to drive the state machine (see below).

### MEMORY layout (per-cycle)

Wholesale-rewritten each strategy cycle via single heredoc:

```
## State
<expanding | scoring | pruning | advancing | goal_checking | solved | done | …_completed>

## Matched Instruction
<instruction label>

## Last Action
<one short sentence>

## Result
<one short sentence>
```

Spliced sections appear transiently after a dynamic pop:

- After `expand-node.md` pop: `## Children` (consumed and dropped by the absorb instruction)
- After `score.md` pop: `## Value` (consumed and dropped)
- After `evaluate.md` pop: `## Verdict` and `## Feedback` (consumed and dropped)

`## Pending Questions` is appended (never replaced) when malformed dynamic output is detected (R33, R44, R47); the strategy never sets state to `waiting_for_user` for these soft errors, only for the R6 hard input failure.

## Interfaces / API

### Strategy state machine (overview)

```
empty                      → Initialize        → expanding (depth=0)
expanding                  → Expand-push       → expanding (state stays; shell will set _completed on pop)
expanding_completed        → Expand-absorb     → expanding | scoring | pruning
scoring                    → Score-push        → scoring (shell sets _completed on pop)
scoring_completed          → Score-absorb      → scoring | expanding | pruning
pruning                    → Prune             → advancing | done (R37)
advancing                  → Advance           → expanding | goal_checking
goal_checking              → Goal-push         → goal_checking (shell sets _completed on pop)
goal_checking_completed    → Goal-absorb       → goal_checking | solved | done (R34)
solved                     → Solved            → done
done                       → (shell halts)
```

Eleven instructions total (Initialize, Expand-push, Expand-absorb, Score-push, Score-absorb, Prune, Advance, Goal-push, Goal-absorb, Solved, plus a Phase-router internal helper that all `_completed` instructions invoke; see below).

### Initialize (R5–R9)

**Condition:** `state == empty`

**Action:** parse PROGRAM.md, persist scoped files, append root block, transition to `expanding`.

```bash
# Extract integers from PROGRAM.md prose
NUMBERS=$(grep -oE '\b[0-9]+\b' ../../PROGRAM.md | head -n 5 | tr '\n' ' ')   # head -n 5 captures 4 numbers + target
COUNT=$(echo $NUMBERS | wc -w)
if [ "$COUNT" -lt 3 ]; then
  # R6: insufficient input → waiting_for_user
  ...append ## Pending Questions and set state waiting_for_user...
fi

# By convention the LAST integer is the target; the rest are puzzle numbers.
TARGET=$(echo $NUMBERS | awk '{print $NF}')
PUZZLE=$(echo $NUMBERS | awk '{$NF=""; print}' | sed 's/ *$//')
N=$(echo $PUZZLE | wc -w)
MAX_DEPTH=$((N - 1))

echo "$PUZZLE"    > ./scoped/numbers.md
echo "$TARGET"    > ./scoped/target.md
echo "$MAX_DEPTH" > ./scoped/max_depth.md
echo 0            > ./scoped/current_depth.md

cat > ./scoped/tree.md << ROOT_EOF
---
id: n0
parent_id: -
depth: 0
op: -
left: $PUZZLE
value: 0
samples: 0
status: live
ROOT_EOF
```

Then wholesale-rewrite MEMORY with `state: expanding`. Note: the LLM is *not* free-form parsing — `grep -oE` extracts integers deterministically; the prose convention is "puzzle numbers, then target" (R48 style: "using 4, 5, 6, and 10 … evaluates to 24" yields `4 5 6 10 24`).

### Update primitives (R12, R13)

These bash idioms are referenced by multiple instructions; they live inline in the relevant instruction bodies.

**Append a node block:**

```bash
cat >> ./scoped/tree.md << NODE_EOF
---
id: $NEW_ID
parent_id: $PARENT_ID
depth: $DEPTH
op: $OP
left: $LEFT
value: 0
samples: 0
status: live
NODE_EOF
```

**Compute next monotonic id (R13):**

```bash
NEXT_INDEX=$(grep -c '^id: n' ./scoped/tree.md)   # count of existing ids = next index
NEW_ID="n$NEXT_INDEX"
```

**Update a single field of a single node (R12):**

```bash
ID=$1; FIELD=$2; NEW_VAL=$3
awk -v ID="$ID" -v F="$FIELD" -v V="$NEW_VAL" '
  /^---$/ { in_block = 0; print; next }
  /^id:/  { in_block = ($2 == ID); print; next }
  in_block && $1 == F":" { print F": " V; next }
  { print }
' ./scoped/tree.md > ./scoped/tree.md.tmp && mv ./scoped/tree.md.tmp ./scoped/tree.md
```

The `mv` is byte-precise: only the targeted line changes, every other line is byte-identical to the original (R12's "exclusively by surgical edit" is satisfied — `awk` is named in the requirement).

**Find first matching node by predicate** (used by Expand-push, Score-push, Goal-push):

```bash
# Two-pass: pass 1 builds the set of parent_ids referenced; pass 2 finds the match.
HAS_CHILD=$(awk '/^parent_id:/ {print $2}' ./scoped/tree.md | sort -u)

# Pass 2: state-driven block reader; print first id matching predicate.
awk -v D="$DEPTH" -v EXCL="$HAS_CHILD" '
  BEGIN { n=split(EXCL, arr, "\n"); for (i=1; i<=n; i++) excl[arr[i]] = 1 }
  /^---$/ {
    if (id != "" && d == D && s == "live" && !(id in excl)) { print id; exit }
    id = ""; d = ""; s = ""; next
  }
  /^id:/      { id = $2 }
  /^depth:/   { d = $2 }
  /^status:/  { s = $2 }
  END {
    if (id != "" && d == D && s == "live" && !(id in excl)) print id
  }
' ./scoped/tree.md
```

Variant predicates (replace the condition body):

- *Unscored live child at depth D:* `d == D && s == "live" && samples < 3` (samples extracted analogously)
- *Live terminal at depth D:* `d == D && s == "live"` (no `excl` filter — terminals are leaves)

**Walk parent chain (R29):**

```bash
ID=$1
EXPR=""
CURRENT="$ID"
while [ "$CURRENT" != "n0" ] && [ "$CURRENT" != "-" ]; do
  OP=$(awk -v ID="$CURRENT" '
    /^---$/ { in_block = 0; next }
    /^id:/  { in_block = ($2 == ID) }
    in_block && /^op:/ { sub(/^op: /, ""); print; exit }
  ' ./scoped/tree.md)
  PARENT=$(awk -v ID="$CURRENT" '
    /^---$/ { in_block = 0; next }
    /^id:/  { in_block = ($2 == ID) }
    in_block && /^parent_id:/ { print $2; exit }
  ' ./scoped/tree.md)
  EXPR="($OP)$([ -n "$EXPR" ] && echo " ; $EXPR")"
  CURRENT="$PARENT"
done
echo "$EXPR" > ./scoped/staged/attempt.md
```

The reconstructed expression is a parenthesised semicolon-joined trace of binary ops in the order they were applied. `evaluate.md` (text-only mode — no workspace paths in the criterion) judges whether this trace witnesses an expression that uses each puzzle number once and reaches the target. Producing a single-line expression like `(4 + 6) × (10 − 5) − 26 = 24` is acceptable but optional; the trace form is sufficient for the LLM-based evaluator to verify.

### Expand-push (R15, R16)

**Condition:** `state == expanding`

**Action:** find first unexpanded live node at `current_depth`; if none, route via Phase-router; otherwise stage push-args, emit `## Push` with `parent_thought`, `target`, `numbers_remaining`.

```bash
DEPTH=$(cat ./scoped/current_depth.md)
TARGET=$(cat ./scoped/target.md)
ID=$(<find first unexpanded live at DEPTH using primitive>)

if [ -z "$ID" ]; then
  # No more unexpanded at this depth — phase router decides next state
  ...route...
else
  echo "$ID" > ./scoped/cursor.md
  OP=$(awk_extract_field "$ID" "op")
  LEFT=$(awk_extract_field "$ID" "left")
  printf 'op: %s\nleft: %s\n' "$OP" "$LEFT" > ./scoped/staged/parent_thought.md
  echo "$LEFT" > ./scoped/staged/numbers_remaining.md
fi
```

Then emit MEMORY containing `## Push`:

```
## State
expanding
## Push
dynamics/expand-node.md
## Push-Args
parent_thought: |
  <parent_thought file content, two-space-indented>
target: <TARGET>
numbers_remaining: <LEFT>
```

The state value `expanding` is the returnState; on pop the shell sets state to `expanding_completed` (R17 hook).

### Expand-absorb (R17, R18)

**Condition:** `state == expanding_completed AND ## Children present`

**Action:** parse `## Children` block; for each well-formed child entry (two consecutive `op: …` and `left: …` lines), append a node block to `tree.md` with `parent_id = cursor`, `depth = current_depth + 1`, `value: 0`, `samples: 0`, `status: live`. Drop `## Children` from MEMORY rewrite. If fewer than 5 well-formed entries parsed, append a non-blocking `## Pending Questions` (R47).

Then route via the Phase-router (below) to one of `expanding | scoring | pruning`.

### Phase-router (R18, R22, R23)

A small bash decision invoked at the end of every `_completed` instruction. It consults `tree.md` and decides the next state:

```bash
DEPTH=$(cat ./scoped/current_depth.md)
NEXT_DEPTH=$((DEPTH + 1))

# Are there any unexpanded live nodes at DEPTH?
UNEXPANDED=$(<find first unexpanded live at DEPTH>)
# Are there any unscored live children at NEXT_DEPTH?
UNSCORED=$(<find first live at NEXT_DEPTH with samples<3>)

if [ -n "$UNEXPANDED" ]; then
  if [ -n "$UNSCORED" ]; then
    NEXT_STATE=scoring     # ordering is unspecified per R23 — we pick scoring to balance cycles
  else
    NEXT_STATE=expanding
  fi
elif [ -n "$UNSCORED" ]; then
  NEXT_STATE=scoring
else
  NEXT_STATE=pruning
fi
```

The choice between `expanding` and `scoring` when both are non-empty is the strategy's design call. We pick `scoring` first — this front-loads scoring of already-emitted children so pruning can fire as early as possible (still within R23's freedom).

### Score-push (R19, R20)

**Condition:** `state == scoring`

**Action:** find first live unscored child (`depth == current_depth + 1 AND status == live AND samples < 3`); stage `thought` and `target`; emit `## Push dynamics/score.md`.

```
## State
scoring
## Push
dynamics/score.md
## Push-Args
thought: |
  op: <child's op>
  left: <child's left>
target: <TARGET>
```

If no live unscored child exists at `current_depth + 1`, the Phase-router routes to `pruning` directly without emitting a push.

### Score-absorb (R21, R22)

**Condition:** `state == scoring_completed AND ## Value present`

**Action:** read the cursor id; read the returned label; convert label → weight per the mapping; surgical-update the cursor's `samples` (+1) and `value` (+ weight). Drop `## Value`. If the label is malformed, treat as `impossible` and append a non-blocking `## Pending Questions` (R44). Route via Phase-router.

```bash
ID=$(cat ./scoped/cursor.md)
LABEL=$(awk '/^## Value$/{f=1; next} /^## /{f=0} f && /[a-z]/{print; exit}' ./MEMORY.md)
case "$LABEL" in
  sure)       WEIGHT=20 ;;
  likely)     WEIGHT=1 ;;
  impossible) WEIGHT=0.001 ;;
  *)          WEIGHT=0.001
              # Append Pending Questions per R44, do not transition to waiting_for_user
              ;;
esac

CURRENT_VALUE=$(<extract value field of ID>)
NEW_VALUE=$(echo "$CURRENT_VALUE + $WEIGHT" | bc -l)
CURRENT_SAMPLES=$(<extract samples field of ID>)
NEW_SAMPLES=$((CURRENT_SAMPLES + 1))

<surgical-update ID value $NEW_VALUE>
<surgical-update ID samples $NEW_SAMPLES>
```

### Prune (R24, R25, R37)

**Condition:** `state == pruning`

**Action:** select all `live` nodes at `current_depth + 1`, sort by `value` descending then `id` ascending, mark `status: pruned` on all but the top b=5 via surgical update.

```bash
DEPTH=$(cat ./scoped/current_depth.md)
NEXT_DEPTH=$((DEPTH + 1))

# Extract (id, value) pairs for live nodes at NEXT_DEPTH
LIVE_NODES=$(awk -v D="$NEXT_DEPTH" '
  /^---$/ { id=""; d=""; v=""; s="" }
  /^id:/      { id=$2 }
  /^depth:/   { d=$2 }
  /^value:/   { v=$2 }
  /^status:/  { s=$2; if (id != "" && d == D && s == "live") printf "%s %s\n", v, id }
' ./scoped/tree.md)

# Sort by value desc, id asc; keep tail (= losers)
LOSERS=$(echo "$LIVE_NODES" | sort -k1,1nr -k2,2 | tail -n +6 | awk '{print $2}')

if [ -z "$LIVE_NODES" ]; then
  # R37: empty frontier → No Solution Found
  ...emit ## No Solution Found, set state done...
fi

for L in $LOSERS; do
  <surgical-update L status pruned>
done
```

Then transition to `advancing` (R25).

### Advance (R26, R27)

**Condition:** `state == advancing`

**Action:** read `current_depth.md`; if `current_depth + 1 ≤ max_depth`, increment current_depth and transition to `expanding`; else transition to `goal_checking`.

```bash
DEPTH=$(cat ./scoped/current_depth.md)
MAX=$(cat ./scoped/max_depth.md)
NEXT=$((DEPTH + 1))
if [ "$NEXT" -le "$MAX" ]; then
  echo "$NEXT" > ./scoped/current_depth.md
  NEXT_STATE=expanding
else
  NEXT_STATE=goal_checking
fi
```

### Goal-push (R28, R29, R30)

**Condition:** `state == goal_checking`

**Action:** find first live terminal (`depth == max_depth AND status == live`); reconstruct expression via parent-walk primitive; synthesize criterion; emit `## Push dynamics/evaluate.md`.

```bash
MAX=$(cat ./scoped/max_depth.md)
ID=$(<find first live at depth MAX>)

if [ -z "$ID" ]; then
  # No live terminals remain — exhaustion handled by Goal-absorb on prior _completed,
  # but if we reach goal_checking with zero live terminals (e.g. immediate after pruning at last depth)
  # we go straight to the no-solution path.
  ...emit ## No Solution Found, set state done...
fi

echo "$ID" > ./scoped/cursor.md
<walk parent chain → ./scoped/staged/attempt.md>
NUMBERS=$(cat ./scoped/numbers.md)
TARGET=$(cat ./scoped/target.md)
printf 'Expression must use each of %s exactly once and evaluate to %s.\n' \
  "$NUMBERS" "$TARGET" > ./scoped/staged/criterion.md
```

Emit MEMORY:

```
## State
goal_checking
## Push
dynamics/evaluate.md
## Push-Args
attempt: |
  <attempt file, two-space indented>
criterion: |
  <criterion file, two-space indented>
```

### Goal-absorb (R31, R32, R33, R34)

**Condition:** `state == goal_checking_completed AND ## Verdict present`

**Action:** read cursor id; read `## Verdict`; on `pass` → surgical-update status `terminal_pass`, transition to `solved`. On `fail` → surgical-update status `terminal_fail`, transition to `goal_checking`. On malformed → treat as fail, append non-blocking `## Pending Questions` (R33). After updating, if the new state is `goal_checking` and no live terminals remain, the next Goal-push detects exhaustion and writes `## No Solution Found`, halting (R34). Drop `## Verdict` and `## Feedback` from MEMORY rewrite.

### Solved (R35)

**Condition:** `state == solved`

**Action:** find the (necessarily single) `terminal_pass` node; reconstruct its expression; count total nodes and pruned nodes; write `## Solution`; transition to `done`.

```bash
PASS_ID=$(awk '/^---$/{id=""; s=""} /^id:/{id=$2} /^status:/{s=$2; if (s=="terminal_pass") {print id; exit}}' ./scoped/tree.md)
<walk parent chain of PASS_ID → EXPRESSION>
TOTAL=$(grep -c '^id: n' ./scoped/tree.md)
PRUNED=$(grep -c '^status: pruned$' ./scoped/tree.md)
```

Emit:

```
## State
done
## Matched Instruction
Solved
## Last Action
Reconstructed winning expression for $PASS_ID and emitted ## Solution.
## Result
Search complete with verified solution.
## Solution
Expression: $EXPRESSION
Total nodes expanded: $TOTAL
Nodes pruned: $PRUNED
```

The shell intercepts `state == done` at stack depth 1 and halts (R36).

### `expand-node.md` (R38–R40)

**Push-args declared** (R38): `{{parent_thought}}`, `{{target}}`, `{{numbers_remaining}}`.

**Single instruction matching `state == empty`** (R39): generates exactly k=5 candidate next moves, each consuming two of the `numbers_remaining` and replacing them with the binary-op result. Returns `## State done` and `## Return children: |` containing five `op: …\nleft: …` pairs.

```
You are generating candidate next steps for a Game of 24 search at parent state {{parent_thought}}, target {{target}}, with numbers remaining {{numbers_remaining}}.

Generate exactly k=5 candidate next moves. For each move:
  - Pick two distinct numbers from numbers_remaining.
  - Apply one of +, −, ×, ÷ to produce a new number.
  - The new "left" set is the remaining numbers plus the result.

Output exactly five entries in this format:

  op: <a> <op> <b> = <result>
  left: <space-separated remaining numbers>

Return via:

  ## State
  done
  ## Return
  children: |
    op: <…>
    left: <…>
    op: <…>
    left: <…>
    … (5 pairs)
```

**No further pushes** (R40): the dynamic body emits a single MEMORY heredoc with the `## Return` block; it never writes `## Push`.

### `score.md` (R41–R44)

**Push-args declared** (R41): `{{thought}}`, `{{target}}`.

**Single instruction matching `state == empty`** (R42): one cycle, returns `## State done` and `## Return value: <label>` where label is one of `sure | likely | impossible`.

```
You are scoring a partial Game-of-24 state for reachability of target {{target}}.

State:
{{thought}}

Reasoning principles:
  - sure: the remaining numbers can definitely combine to make {{target}} (e.g. {24} or {12, 2}).
  - likely: feasible but not obvious (a single small number plus a near-target).
  - impossible: too big/small commonsense rules it out (e.g. {1, 1, 1} cannot reach 24).

Return:
  ## State
  done
  ## Return
  value: <one of: sure, likely, impossible>
```

**No further pushes** (R43).

### `evaluate.md` (R45, R46)

Byte-equal copy of `interpreters/1-iterative-refinement/b-evaluator-optimizer/dynamics/evaluate.md`. Push-args `{{attempt}}`, `{{criterion}}`. Returns `verdict` (`pass`/`fail`) and `feedback`. Identity is enforced by the extended `phase-dynamics-identity.test.ts` (see §Test strategy).

The `evaluate.md` will run in **text-only mode** for ToT (R30's criterion is plain prose with no `../../workspace/` paths), so no filesystem inspection is required.

### Push-args contract for all dynamics (R56)

All three dynamics in `interpreters/3-search/a-tot/dynamics/` declare their push-args explicitly via `{{var}}` placeholders in their text. The shell's `applyPush` substitution fails the push (with `unresolved-placeholder`) if the strategy omits any required arg — this is the boundary of strategy↔dynamic communication, and the design adds no other channel.

## Error handling

| Trigger | Mitigation | R# |
| ------- | ---------- | -- |
| PROGRAM.md has < 2 numbers or no target | Append `## Pending Questions` listing missing field; set state `waiting_for_user`; the shell prompts the user; the user-responded handler re-runs Initialize after they edit PROGRAM.md or supply values | R6 |
| `expand-node.md` returns < 5 well-formed children | Append the well-formed children that did parse; append non-blocking `## Pending Questions` naming the missing count; continue (parent has fewer than k=5 children for that expansion). State machine progresses normally — Phase-router routes to scoring next, etc. | R47 |
| `score.md` returns label other than sure/likely/impossible | Treat as `impossible` (weight 0.001), proceed with surgical update, append non-blocking `## Pending Questions` citing the malformed label. State machine progresses normally | R44 |
| `evaluate.md` returns Verdict other than pass/fail | Treat as `fail`, mark terminal `terminal_fail`, append non-blocking `## Pending Questions`, remain in goal_checking | R33 |
| Pruning produces zero live nodes at next depth | Emit `## No Solution Found` MEMORY section noting depth; set state `done`; halt | R37 |
| Goal_checking exhausts all terminals without a pass | Emit `## No Solution Found` MEMORY section listing terminal_fail count; set state `done`; halt | R34 |

The `## Pending Questions` non-blocking convention (matching b-evaluator-optimizer's malformed-verdict policy) is what keeps the loop progressing instead of stalling. The strategy never has a `user_responded` instruction beyond Initialize, so transitioning to `waiting_for_user` for soft errors would deadlock — hence "non-blocking" is structurally required.

## Test strategy

### `src/test/phase-6-tot.test.ts` — NEW (R51)

Following the file-pattern style of `phase-5-debate.test.ts` (no live LLM execution; assertions are regexes against the interpreter's text artefacts):

| Test group | Asserts | R# |
| ---------- | ------- | -- |
| Directory layout | `INSTRUCTIONS.md`, `PROGRAM.md`, `README.md`, `dynamics/expand-node.md`, `dynamics/score.md`, `dynamics/evaluate.md` exist; `dynamics/` contains exactly these three files | R1, R45 |
| Group README | `interpreters/3-search/README.md` exists; mentions ToT, GoT (deferred), LATS (Phase 6b) | R2 |
| Leaf README | mentions Yao et al. arXiv:2305.10601, contains a state-machine summary, run instructions, the 3× sampling note | R3 |
| Strategy preamble | `# Strategy` / `# Sub-instructions` boundaries present; "VERBATIM into every update_instructions call" preamble present | structural |
| State machine completeness | INSTRUCTIONS.md declares the 11 instructions (Initialize, Expand-push, Expand-absorb, Score-push, Score-absorb, Prune, Advance, Goal-push, Goal-absorb, Solved, plus Phase-router helper if separate) | R9, R15, R17, R19, R21, R24, R26, R28, R31, R35 |
| Initialize | references PROGRAM.md, writes scoped/{numbers,target,max_depth,current_depth,tree}.md, declares root id n0 with parent_id=-, depth=0, status=live; declares the waiting_for_user fallback for < 2 numbers (R6 path); confirms max_depth = N − 1 derivation | R5–R9 |
| Tree ledger schema | INSTRUCTIONS.md mentions all 8 required keys (`id`, `parent_id`, `depth`, `op`, `left`, `value`, `samples`, `status`), the four status values (`live`, `pruned`, `terminal_pass`, `terminal_fail`), and the `---` block separator | R10, R11, R14 |
| Surgical-edit primitive | INSTRUCTIONS.md uses `awk` (or `sed -i`) for in-place updates after the root; no wholesale `cat > ./scoped/tree.md` after Initialize | R12 |
| Monotonic IDs | INSTRUCTIONS.md computes new id via `grep -c '^id: n'` or equivalent monotonic counter | R13 |
| Expand path | Expand-push references `dynamics/expand-node.md` and stages `parent_thought`, `target`, `numbers_remaining`; Expand-absorb appends children with `value: 0`, `samples: 0`, `status: live`; transitions per Phase-router | R15–R18, R47 (well-formed-count check) |
| Score path | Score-push references `dynamics/score.md` and stages `thought`, `target`; Score-absorb cites the weight mapping `sure → 20`, `likely → 1`, `impossible → 0.001`; updates samples and value via surgical edit; treats malformed label as impossible | R19–R23, R44 |
| Pruning | Prune sorts live nodes at depth+1 by value desc / id asc, retains top 5, marks losers `status: pruned`; declares R37 dead-end branch | R24, R25, R37 |
| Advance | increments depth when ≤ max_depth, else routes to goal_checking | R26, R27 |
| Goal-checking | Goal-push references `dynamics/evaluate.md`; reconstructs expression via parent-walk; criterion text mentions "use each of … exactly once and evaluate to"; Goal-absorb branches on pass/fail, malformed treated as fail | R28–R34 |
| Termination | Solved emits `## Solution` containing winning expression + node counts; halts at stack depth 1 (state done at root frame); No-Solution path emits `## No Solution Found` and sets state done | R35, R36 |
| `expand-node.md` contract | declares `{{parent_thought}}`, `{{target}}`, `{{numbers_remaining}}` placeholders; single Instruction matching `state == empty`; returns `## State done` + `## Return children: |`; no `## Push dynamics/` | R38–R40 |
| `score.md` contract | declares `{{thought}}`, `{{target}}`; single instruction matching `state == empty`; returns `## State done` + `## Return value: |` with one of three labels; no further push | R41–R43 |
| Demo PROGRAM.md | exists; contains exactly four integer numbers in prose; mentions target 24 | R48, R49 |
| Negative properties | strategy never references `workspace/`; never references `git checkout`; never references concurrency primitives (`xargs -P`, `&` background, etc.); k and b are bash-literal `5`s in INSTRUCTIONS.md, not parsed from PROGRAM.md | R52–R57 |

The (R50)-style end-state shape (depth coverage, b=5 cap, samples invariant, history snapshot stack-depth ≤ 2) is *implied* by the structural assertions above:

- *Depth coverage* — guaranteed by the state machine reaching `goal_checking` only after `current_depth == max_depth`.
- *b=5 cap* — guaranteed by Prune marking losers in `tree.md`.
- *3-samples invariant* — guaranteed by Phase-router not routing to pruning until every live child has `samples == 3`.
- *Stack depth ≤ 2 in history* — guaranteed by R40, R43, and `evaluate.md`'s known leaf status.

If a future Phase-6 follow-up wants live-execution validation, the natural home is a manual smoke check in the README's Run-it section, not the unit-test file.

### `src/test/phase-dynamics-identity.test.ts` — EXTENDED (R46)

Append `interpreters/3-search/a-tot/dynamics/evaluate.md` to the existing `EVALUATE_PATHS` constant. The existing assertion ("evaluate.md is byte-equal across all consumers") then transparently covers ToT.

```typescript
const EVALUATE_PATHS = [
  "interpreters/1-iterative-refinement/b-evaluator-optimizer/dynamics/evaluate.md",
  "interpreters/1-iterative-refinement/c-reflexion/dynamics/evaluate.md",
  "interpreters/5-fixed-sop-teams/a-metagpt/dynamics/evaluate.md",
  "interpreters/5-fixed-sop-teams/b-chatdev/dynamics/evaluate.md",
  "interpreters/3-search/a-tot/dynamics/evaluate.md",   // NEW
];
```

### Manual smoke-check (out of test suite)

A Run-it section in the leaf README directs the user through:

1. `./new-instance.sh my-tot interpreters/3-search/a-tot`
2. `instances/my-tot/run.sh`
3. After completion, inspect `instances/my-tot/frames/f000-strategy/MEMORY.md` for `## Solution` and `instances/my-tot/frames/f000-strategy/scoped/tree.md` for the full search trace.

Cycle-cost expectation per puzzle (worst case, no early termination): ≤ 11 expand dispatches + ≤ 165 score dispatches + ≤ 5 evaluate dispatches ≈ 181 dispatches × ~3 LLM cycles per dispatch ≈ 540 LLM cycles. The leaf README's "Notable behaviour" section (R3) records this number and cross-references the 3× sampling fidelity choice; the "~200-cycle" phrasing in requirements R3 should be read as "~200 dispatches" (= ~540 LLM cycles), and the README clarifies this directly so future readers don't repeat the ambiguity.

## Open questions

(none — all 57 requirements are addressed by sections above; the dispatch-vs-cycle ambiguity in R3 is clarified in the leaf README per §Test strategy without altering R3's text)
