# Design: agent-workflows-phase-5

## Overview

A new interpreter at `interpreters/mas-papers/4-peer-collaboration/a-debate/` implements Multi-Agent Debate (Du et al., 2023). The strategy is a round coordinator over R rounds × N personas; each opinion is dispatched via a three-cycle **stage / push / absorb** pattern (chatdev-style) plus a dedicated **round-transition** cycle at every round boundary. Strict round isolation is enforced not by parallelism (the shell is sequential) but by the `transcript` push-arg the strategy constructs: it concatenates only completed prior-round snapshot files, deliberately excluding the in-progress current round. After R rounds, one inline concluding cycle synthesises the full transcript into `## Final Position`. One new dynamic (`opine.md`) is introduced; no existing dynamic is reused.

Core trade-off accepted in Phase 1: by-value push-args (not by-path) for `opine.md` simplify the contract and match other Group-1/Group-2 dynamics; transcript size at R=3, N=3 is small enough that this is comfortable.

## Requirement coverage

| R# | Summary | Addressed in |
| --- | --- | --- |
| R1 | Initialize parses PROGRAM.md → question, R, personas | §Architecture (Initialize), §Data model |
| R2 | Default R=3 when unspecified | §Architecture (Initialize), §Error handling |
| R3 | <2 personas → Pending Question + waiting_for_user | §Error handling |
| R4 | Persist parsed values to scoped files | §Data model |
| R5 | Transcript push-arg contains only rounds 1..R−1 | §Architecture (Stage cycle), §Test strategy |
| R6 | Round 1 transcript value indicates no prior opinions | §Architecture (Stage cycle) |
| R7 | Per-round snapshot exists before next round dispatch | §Data model, §Architecture (Absorb cycle) |
| R8 | One push per (round, agent) pair with required push-args | §Interfaces / API (opine.md push), §Architecture (Push cycle) |
| R9 | Absorb appends labelled opinion to transcript | §Architecture (Absorb cycle) |
| R10 | Exactly R×N opinions; no early termination | §Architecture (state machine) |
| R11 | Dedicated round-transition cycle when agent K=N | §Architecture (Round transition) |
| R12 | One inline concluding cycle → `## Final Position` | §Architecture (Concluding) |
| R13 | State `done` after concluding → shell halts | §Architecture (Concluding) |
| R14 | opine.md push-arg contract; missing → `unresolved-placeholder` | §Interfaces / API (opine.md) |
| R15 | opine.md single cycle empty→done; `## Return` with one key | §Interfaces / API (opine.md), §Architecture (opine.md flow) |
| R16 | opine.md does not push further dynamics | §Interfaces / API (opine.md) |
| R17 | Demo PROGRAM.md ships with question + 3 personas, defaults R | §Interfaces / API (PROGRAM.md schema), §Test strategy |
| R18 | Demo run produces 9 opinions + `## Final Position` | §Test strategy |
| R19 | No reuse of `reflect.md` from 1c | §Architecture (negative) |
| R20 | No aggregator / second dynamic alongside opine.md | §Architecture (negative) |

## Architecture

### File layout

```
interpreters/mas-papers/4-peer-collaboration/a-debate/
├── INSTRUCTIONS.md         # Strategy: round coordinator
├── PROGRAM.md              # Demo: Postgres-vs-SQLite + 3 personas
├── README.md               # Mechanism summary, refs Du et al. 2023
└── operators/
    └── opine.md            # The only dynamic. Stack depth 1.
```

### Strategy state machine

```
empty
  ↓ Initialize (parse PROGRAM, init scoped, agent=0, round=1)
dispatch_stage
  ↓ Stage (read counters + persona, build transcript, write scoped/staged/*)
dispatch_push
  ↓ Push (static-template MEMORY rewrite, sets state=dispatching, emits ## Push)
  ↓ ↓ (shell pushes opine.md, runs it, pops; state ← dispatching_completed)
dispatching_completed
  ↓ Absorb (append ## Opinion to transcript + per-round file; clear ## Opinion;
           increment agent counter; route)
  ├─ if agent < N → dispatch_stage  (more agents in this round)
  └─ if agent == N → round_transition

round_transition
  ↓ Round transition (reset agent=0, increment round, route)
  ├─ if round ≤ R → dispatch_stage  (more rounds)
  └─ if round > R → concluding

concluding
  ↓ Conclude (read scoped/transcript.md, write ## Final Position, set state=done)
done
  ↓ shell halts (stack.length == 1, state == done)
```

Per-debate cycle count for R=3, N=3: 1 (Initialize) + 27 (9 dispatches × stage/push/absorb) + 3 (round transitions) + 1 (Conclude) = **32 cycles**.

### Dispatch (stage / push / absorb)

The three-cycle dispatch isolates one focused responsibility per cycle, matching the rationale that motivated b-chatdev's two-cycle stage/push split (avoid the LLM forgetting to emit a push template while computing values).

**Stage cycle** (`state=dispatch_stage`). Read counters and the indexed persona:

```bash
r=$(cat ./scoped/round.md)
k=$(cat ./scoped/agent.md)            # 0-indexed
# Extract the k-th persona block from scoped/personas.md:
#   awk over "### " headers, count blocks, emit body of the (k+1)-th
```

Build the transcript push-arg:

```bash
if [ "$r" -eq 1 ]; then
  printf '%s\n' '(none — round 1)' > ./scoped/staged/transcript.md
else
  : > ./scoped/staged/transcript.md
  for i in $(seq 1 $((r-1))); do
    cat ./scoped/round-$i.md >> ./scoped/staged/transcript.md
  done
fi
```

Stage one file per push-arg under `./scoped/staged/`: `round.md`, `persona_name.md`, `persona_description.md`, `question.md` (re-staged each cycle for completeness; cheap), `transcript.md`. Then transition state to `dispatch_push`. **No MEMORY rewrite that includes `## Push`** — that's the next cycle's job.

**Push cycle** (`state=dispatch_push`). The MEMORY rewrite is a STATIC template; bash interpolates values from staged files into the heredoc. Bash variable expansion is one-shot (it inserts the literal contents of $VAR — no recursive shell-metachar interpretation), so transcript content can safely contain `$`, backticks, etc.

```bash
ROUND=$(cat ./scoped/staged/round.md)
PERSONA_NAME=$(cat ./scoped/staged/persona_name.md)
PERSONA_DESC=$(sed 's/^/  /' ./scoped/staged/persona_description.md)
QUESTION=$(sed 's/^/  /' ./scoped/staged/question.md)
TRANSCRIPT=$(sed 's/^/  /' ./scoped/staged/transcript.md)

cat > ./MEMORY.md << MEM_EOF
## State
dispatching
## Matched Instruction
Push
## Last Action
Pushed opine.md for $PERSONA_NAME in round $ROUND.
## Result
Push queued.
## Push
operators/opine.md
## Push-Args
round: $ROUND
persona_name: $PERSONA_NAME
persona_description: |
$PERSONA_DESC
question: |
$QUESTION
transcript: |
$TRANSCRIPT
MEM_EOF
```

The shell saves `dispatching` as the returnState; on pop, state becomes `dispatching_completed`.

The block-scalar indentation rule: `key: |` at column 0 of the section; body lines at column 2. `sed 's/^/  /'` adds two leading spaces to every body line; the heredoc places `$VAR` at column 0; the substituted lines therefore land at column 2.

**Absorb cycle** (`state=dispatching_completed`, `## Opinion` present). Append the returned opinion to two files (cumulative transcript + per-round snapshot), then route. Surgical append (per CLAUDE.md surgical-edit convention):

```bash
r=$(cat ./scoped/round.md)
k=$(cat ./scoped/agent.md)
name=$(cat ./scoped/staged/persona_name.md)

# (Extract the body of ## Opinion from MEMORY into a temp via awk on header boundaries.)
awk '/^## Opinion$/{f=1; next} /^## [A-Z]/ && f {exit} f' ./MEMORY.md > /tmp/opinion.txt

{ echo ""; echo "### Round $r — $name"; cat /tmp/opinion.txt; } >> ./scoped/transcript.md
{ echo ""; echo "### Round $r — $name"; cat /tmp/opinion.txt; } >> ./scoped/round-$r.md

# Bump agent counter; decide route.
new_k=$((k + 1))
echo "$new_k" > ./scoped/agent.md

# Personas count N — derived from scoped/personas.md once at init, persisted in scoped/N.md.
N=$(cat ./scoped/N.md)
if [ "$new_k" -lt "$N" ]; then NEXT_STATE=dispatch_stage; else NEXT_STATE=round_transition; fi
```

Then wholesale-rewrite MEMORY with `state=$NEXT_STATE` and **without** `## Opinion` (the shell does not strip it on pop; the absorb cycle is responsible).

**Critical:** R7 (per-round snapshot before next round dispatch) is satisfied because the absorb cycle for agent N writes the final entry to `./scoped/round-$r.md` *before* setting state to `round_transition`. By the time stage runs again for round r+1, the snapshot is complete on disk.

### Round transition

A separate cycle so each cycle has one job (per the brainstorm). Read `r`, increment, decide route:

```bash
r=$(cat ./scoped/round.md)
R=$(cat ./scoped/rounds.md)
new_r=$((r + 1))
echo "$new_r" > ./scoped/round.md
echo 0 > ./scoped/agent.md
if [ "$new_r" -le "$R" ]; then NEXT_STATE=dispatch_stage; else NEXT_STATE=concluding; fi
```

Then wholesale-rewrite MEMORY with the new state.

### Concluding

One inline cycle (`state=concluding`). The LLM reads `./scoped/transcript.md` and `./scoped/question.md`, then writes a wholesale MEMORY rewrite containing a `## Final Position` section in a **neutral coordinator voice** (NOT impersonating any persona) — summarising consensus where it exists and naming remaining disagreements where it doesn't. State is set to `done` in the same rewrite. Shell halts at depth 1.

### Negative architectural choices (R19, R20)

- **No reuse of `reflect.md` from 1c.** Its contract requires `{{attempt}}, {{verdict}}, {{feedback}}` — debate has no verdict. Inter-round nudging is deferred (out of scope per requirements.md).
- **No aggregator dynamic.** Synthesis is the strategy's own inline cycle, not a pushed dynamic. This keeps Phase 5 inside Group 4 and prevents drift toward Group 7 (meta-frameworks) or Phase 5b's MoA aggregator.

### opine.md flow

Single instruction (state=empty), one cycle, one heredoc that writes `## State done` and `## Return opinion: |` together. No internal state machine; no further pushes. R15, R16 satisfied by construction.

## Data model

### Scoped files (in strategy frame `f000-strategy/scoped/`)

| File | Lifetime | Format | Why |
|---|---|---|---|
| `question.md` | written once at Initialize, read in Stage and Concluding | free-form prose extracted verbatim from PROGRAM.md | satisfies R1, R4 |
| `rounds.md` | written once at Initialize, read in Round transition | single integer R (default 3) | satisfies R2, R4 |
| `personas.md` | written once at Initialize, read in Stage | N blocks of form `### <name>\n<description>\n\n` | satisfies R1, R4 |
| `N.md` | written once at Initialize, read in Absorb | single integer (count of persona blocks) | precomputed for absorb's route decision (R11) |
| `round.md` | overwritten by Initialize and Round transition | single integer (current round, 1-indexed) | drives state machine |
| `agent.md` | overwritten by Initialize, Absorb, Round transition | single integer (current agent within round, 0-indexed) | drives state machine |
| `transcript.md` | initialized empty at Initialize, surgically appended by Absorb, read by Concluding | sequence of `### Round R — Name\n<opinion body>\n` blocks | cumulative log; user-facing artefact (R9) |
| `round-1.md` … `round-R.md` | per round: emerges during round R via Absorb appends | sequence of `### Round R — Name\n<body>\n` blocks for round R only | satisfies R5, R7 — Stage cycle reads only completed prior-round files |
| `staged/round.md`, `staged/persona_name.md`, `staged/persona_description.md`, `staged/question.md`, `staged/transcript.md` | overwritten by each Stage cycle | one push-arg value per file (block-scalar values multi-line) | A3 separation between Stage (extract) and Push (emit static template) |

### MEMORY.md sections owned by the strategy

| Section | Set when | Read when | Lifetime |
|---|---|---|---|
| `## State` | every cycle | every cycle | every cycle |
| `## Matched Instruction` | every cycle | observability only | every cycle |
| `## Last Action`, `## Result` | every cycle | observability only | every cycle |
| `## Push`, `## Push-Args` | Push cycle only | shell consumes between cycles | one cycle |
| `## Opinion` | written by shell on pop from opine.md | read and stripped by Absorb cycle | one cycle |
| `## Final Position` | written by Concluding | terminal artefact (visible in halt snapshot) | persists to halt |
| `## Pending Questions`, `## Answers` | only in error path (R3) | shell well-known-state machinery | as needed |

### `.kiro-state.json`-equivalent (none — this is the runtime state file the shell maintains)

The shell already persists `.call-stack.json` after each cycle; no new persisted state is introduced.

## Interfaces / API

### `opine.md` push-arg contract — satisfies R8, R14, R15, R16

```yaml
# At push time, the strategy writes:
## Push
operators/opine.md
## Push-Args
round: <integer>                 # 1-indexed round number
persona_name: <single line>      # short label, e.g. "DBA"
persona_description: |           # multi-line; characterisation
  <indented body>
question: |                       # multi-line; verbatim from PROGRAM
  <indented body>
transcript: |                     # multi-line; concat of round-1..round-{r-1}.md
  <indented body>                  # OR the literal "(none — round 1)" when round == 1
```

Any missing key triggers the shell's `unresolved-placeholder` failure (R14) — the push is rejected, ## Push and ## Push-Args are stripped from MEMORY, and the strategy's state is unchanged. The strategy must re-stage and re-push.

### `opine.md` return contract — satisfies R15

```yaml
## State
done
## Return
opinion: |
  <multi-line opinion body, indented two spaces>
```

State `done` plus exactly one `## Return` key (`opinion`), in a single MEMORY heredoc, in a single cycle.

### `opine.md` instruction body (sketch — concrete wording is an implementation detail)

Single instruction, condition `MEMORY state is "empty"`. The LLM is instructed to:
- Adopt `{{persona_name}}` per `{{persona_description}}`
- Read `{{question}}`
- Read `{{transcript}}` (the literal `(none — round 1)` indicates first round; otherwise prior-round opinions)
- Produce 2–5 sentences responding from the persona's perspective, addressing prior-round opinions where present
- Write a single MEMORY heredoc with the return contract above

### PROGRAM.md schema — satisfies R17

Free-form prose. The strategy's Initialize cycle interprets it. Recommended structure (the demo follows this; not enforced):

- A few sentences stating the question and any context the personas need
- An optional "Run X rounds" / "X rounds of debate" mention (if absent, R defaults to 3 per R2)
- A list of personas, each with a name and a description (e.g. `### DBA\n<description>` blocks, or "Three experts: a DBA who … ; an App Dev who … ; an SRE who …" — the LLM extracts either way)

The demo `PROGRAM.md` will use a structured-but-prose layout (similar to b-chatdev's `wc-plus`) with three personas matching R17's example list.

## Error handling

| Trigger | Response | Satisfies |
|---|---|---|
| PROGRAM.md is missing or empty | LLM judgement at Initialize: append `## Pending Questions` asking the user for content; set state `waiting_for_user`. | (general; not a numbered R# but follows R3 pattern) |
| PROGRAM.md doesn't specify R | Initialize writes `3` to `scoped/rounds.md`. | R2 |
| PROGRAM.md names < 2 distinct personas | Initialize appends `## Pending Questions` ("name at least two personas with descriptions"); sets state `waiting_for_user`; does NOT advance to dispatch_stage. The shell's well-known-state handler prompts the user. | R3 |
| `## Opinion` missing in Absorb (opine.md returned but the splice didn't happen) | Append non-blocking `## Pending Questions` and stay in dispatching_completed for one cycle so the user can investigate; do NOT silently advance counters. (Mirrors how `Route after step` in 3a handles malformed `## Outcome`.) | (defensive — not directly required but expected of any production-shaped strategy) |
| `## Push` push fails (`unresolved-placeholder` or `missing-target`) | Shell strips ## Push and leaves state unchanged. Strategy stays in `dispatch_push`; the next cycle re-emits the static push (idempotent because staged files still exist on disk). | R14 |
| Counter inconsistency (e.g. agent.md > N) | Defensive guard in Absorb: if new_k > N, this is a bug — append a `## Pending Questions` rather than wrap-around. | (defensive) |

## Test strategy

The repository uses `node:test` for shell-level tests in `src/test/` and end-to-end interpreter validation by running an instance. Phase 5 has no shell-code changes, so all tests are at the interpreter / instance level.

### Unit-shaped tests (interpreter shape)

These read static files; no LLM. Live in `src/test/debate-interpreter.test.ts` (new file).

- **Test: dynamics directory contents** — assert exactly one file `operators/opine.md` exists; no other dynamics. *Satisfies R20 (negative — no second dynamic).*
- **Test: opine.md does not push** — read opine.md, assert no `## Push` section template appears in any code path. *Satisfies R16, R20.*
- **Test: opine.md push-arg contract** — read opine.md, assert it references `{{round}}`, `{{persona_name}}`, `{{persona_description}}`, `{{question}}`, `{{transcript}}` placeholders. *Satisfies R14.*
- **Test: opine.md single-cycle** — assert opine.md has exactly one instruction with condition `state is "empty"`, and its action body sets state directly to `done`. *Satisfies R15.*
- **Test: INSTRUCTIONS.md does not reference reflect.md** — grep INSTRUCTIONS.md for `reflect.md`; assert no match. *Satisfies R19.*
- **Test: INSTRUCTIONS.md state machine completeness** — assert there exist instructions matching each of: `state is "empty"`, `dispatch_stage`, `dispatch_push`, `dispatching_completed`, `round_transition`, `concluding`. *Satisfies R8, R10, R11, R12, R13.*
- **Test: PROGRAM.md demo structure** — assert demo PROGRAM.md mentions the literal phrase "Postgres or SQLite" and contains three persona-shaped sections. *Satisfies R17.*

### Integration-shaped tests (driven instance, mocked LLM)

In existing test scaffolding tradition, this repository runs interpreters end-to-end against real providers. A deterministic mocked-provider variant is preferable here so `R5/R6/R7` round-isolation properties can be asserted cycle-by-cycle.

If the test harness in `src/test/` does not already support a mocked provider, the test harness extension is **out of scope** for Phase 5 and these tests become manual / observation-driven on a real run (see Demo run below).

- **Test: Stage cycle in round 1 produces empty transcript** — drive the strategy through Initialize and one Stage cycle with a synthetic PROGRAM (3 personas, R=2). After Stage, inspect `./scoped/staged/transcript.md`; assert it equals `(none — round 1)`. *Satisfies R6.*
- **Test: Stage cycle in round 2 contains only round 1** — synthesise a `./scoped/round-1.md` fixture with three opinions; advance counters to round=2, agent=1; run Stage; assert `./scoped/staged/transcript.md` equals the concatenation of `./scoped/round-1.md` AND contains no agent-K=0 round-2 opinions. *Satisfies R5, R7.*
- **Test: Round transition is its own cycle** — assert from a history snapshot that the cycle following the absorb-of-agent-N has state `round_transition` (not `dispatch_stage`); the next cycle has `dispatch_stage` with `round.md` incremented. *Satisfies R11.*

### Demo run (manual, observation-driven)

The interpreter is shipped with a runnable demo. Validation is by running `instances/<name>/run.sh` after `./new-instance.sh debate-demo interpreters/mas-papers/4-peer-collaboration/a-debate` and inspecting outputs.

- **Demo: Postgres-vs-SQLite produces 9 labelled opinions** — after run completes, `./scoped/transcript.md` should contain exactly nine `### Round R — Name` headers with three distinct persona names appearing three times each. *Satisfies R18(a).*
- **Demo: Final Position present** — final MEMORY snapshot in `history/<last-N>-<hash>/MEMORY.md` should contain a `## Final Position` section in neutral voice. *Satisfies R12, R13, R18(b).*
- **Demo: state progression** — running through history snapshots, the cycle sequence should be: Initialize → 27 dispatch cycles (in 9 stage/push/absorb triples) → 3 round-transition cycles → 1 concluding → halt. *Satisfies R10.*

### Test files Phase 3 will produce or modify

- New: `src/test/debate-interpreter.test.ts` (unit-shaped tests above)
- New: `interpreters/mas-papers/4-peer-collaboration/a-debate/INSTRUCTIONS.md`, `operators/opine.md`, `PROGRAM.md`, `README.md`
- No changes to: `src/main.ts`, `src/call-stack.ts`, `src/memory.ts`, or any provider — Phase 5 needs no shell-level changes.

## Open questions

(none — every decision deferred from Phase 1 has been resolved here, and no new ambiguity surfaced during design)
