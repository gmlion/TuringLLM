# Design: agent-workflows Phase 2 — Chain-of-Verification

## Overview

Phase 2 introduces the **arguments-via-INSTRUCTIONS** convention to
the shell (`## Push-Args` + `{{var}}` substitution at push time),
retrofits the existing `a`/`b`/`c` dynamics onto it, and ships a new
one-shot Chain-of-Verification interpreter at
`interpreters/mas-papers/1-iterative-refinement/d-cove/`. The convention
formalises the split between per-frame arguments (INSTRUCTIONS-local)
and shared heap (MEMORY), which is what makes `answer-independently.md`'s
no-access-to-draft guarantee load-bearing without inventing
shell-level memory isolation. The core trade-off accepted: the
guarantee is informal (a child could still `cat MEMORY.md` via bash),
but the child's instructions never *direct* it to do so, and that's
sufficient for the patterns in scope.

## Requirement coverage

| R#  | Summary                                                              | Addressed in                               |
| --- | -------------------------------------------------------------------- | ------------------------------------------ |
| R1  | Parse `## Push-Args` (key: value, YAML-ish, supports block scalars)  | §Architecture → push-args parser, §API     |
| R2  | Substitute `{{key}}` in loaded INSTRUCTIONS at push time             | §Architecture → applyPush flow, §API       |
| R3  | Unresolved `{{placeholder}}` fails the push (strip + log)            | §Error handling, §API                      |
| R4  | Successful push strips both `## Push` and `## Push-Args`             | §Architecture → applyPush flow             |
| R5  | No `## Push-Args` → behave exactly as today                          | §Architecture → applyPush flow             |
| R6  | Pure transforms in `src/call-stack.ts`, unit-tested in isolation     | §Architecture → file layout, §Test strategy|
| R7  | `self-critique.md` consumes `{{draft}}` argument                     | §Refactored dynamics → self-critique       |
| R8  | `evaluate.md` consumes `{{attempt}}` + `{{criterion}}`               | §Refactored dynamics → evaluate            |
| R9  | `reflect.md` consumes `{{attempt}}` + `{{verdict}}` + `{{feedback}}` | §Refactored dynamics → reflect             |
| R10 | a/b/c strategies emit `## Push-Args` populated from MEMORY heap      | §Strategy callsites                        |
| R11 | Byte-equality of evaluate.md (b vs c) preserved                      | §Refactored dynamics → evaluate, §Test     |
| R12 | Existing phase-1-*.test.ts updated and passing                       | §Test strategy → phase-1 retrofit          |
| R13 | Output MEMORY contracts unchanged                                    | §Refactored dynamics (table)               |
| R14 | d-cove deliverable layout                                            | §New CoVe interpreter → file layout        |
| R15 | d-cove strategy is one-shot                                          | §New CoVe interpreter → state machine      |
| R16 | verify.md fans out N>1 children, collects answers, emits ## Revised  | §New CoVe interpreter → verify.md          |
| R17 | No draft prose in verify.md's `## Push-Args`                         | §New CoVe interpreter → verify.md, §Risks  |
| R18 | answer-independently.md is single-instruction, references no caller MEMORY | §New CoVe interpreter → answer-independently.md |
| R19 | Specific knights-and-knaves PROGRAM.md                               | §Demo program                              |
| R20 | Stack depth = 2 while verify has child pushed; scripted test         | §Test strategy → push-args + cove          |
| R21 | CLAUDE.md documents `## Push-Args` + `{{var}}`                       | §Documentation                             |
| R22 | Group README updated for d-cove + arguments convention               | §Documentation                             |
| R23 | docs/agent-workflows/requirements.md §Phase 2 updated                | §Documentation                             |
| R24 | phase-2-notes.md created                                             | §Documentation                             |
| R25 | All 82 existing tests pass + new push-args/depth-2/d-cove tests      | §Test strategy                             |
| R26 | Live demo halts at `done` with `## Revised`, depth-2 in history      | §Test strategy → live demo                 |
| R27 | Retry-budget exhaustion uses existing exit path                      | §Error handling                            |

## Architecture

### File layout (delta vs. current tree)

```
src/
├── call-stack.ts              # ← extended (parse/sub/strip push-args)
└── memory.ts                  # ← extended (parsePushArgs, removePushArgs)

interpreters/mas-papers/1-iterative-refinement/
├── README.md                  # ← updated (add d-cove row + convention)
├── a-self-refine/
│   ├── INSTRUCTIONS.md        # ← updated (Request critique emits ## Push-Args)
│   └── operators/
│       └── self-critique.md   # ← refactored ({{draft}} arg)
├── b-evaluator-optimizer/
│   ├── INSTRUCTIONS.md        # ← updated (Request evaluation emits ## Push-Args)
│   └── operators/
│       └── evaluate.md        # ← refactored ({{attempt}}, {{criterion}}; canonical)
├── c-reflexion/
│   ├── INSTRUCTIONS.md        # ← updated (Request evaluation + Reflect emit ## Push-Args)
│   └── operators/
│       ├── evaluate.md        # ← byte-equal copy of b's refactored version
│       └── reflect.md         # ← refactored ({{attempt}}, {{verdict}}, {{feedback}})
└── d-cove/                    # ← NEW
    ├── INSTRUCTIONS.md        # one-shot strategy
    ├── PROGRAM.md             # knights-and-knaves demo
    ├── README.md              # leaf README in sibling format
    └── operators/
        ├── verify.md          # depth-1 dynamic, fans out depth-2 children
        └── answer-independently.md  # depth-2 leaf, {{question}} arg

src/test/
├── push-args.test.ts          # ← NEW (R1–R5 unit tests)
├── phase-2-cove.test.ts       # ← NEW (R14–R20 d-cove scripted integration)
├── phase-1-self-refine.test.ts        # ← updated push payload
├── phase-1-evaluator-optimizer.test.ts # ← updated push payload
├── phase-1-reflexion.test.ts          # ← updated push payload
└── phase-1-dynamics-identity.test.ts   # ← unchanged (still asserts b ≡ c)

docs/
├── agent-workflows/
│   ├── requirements.md        # ← §Phase 2 updated to final paths + reuse note
│   └── phase-2-notes.md       # ← NEW (analogous to phase-1-notes.md)
└── (CLAUDE.md at root)        # ← Dynamics section adds ## Push-Args
```

### `## Push-Args` parse format

`## Push-Args` follows `## Push` immediately and runs to the next
`## ` heading (or end of MEMORY). Two line-level forms:

- **Single-line value:**  `key: value`
  - `key` matches `[a-zA-Z_][a-zA-Z0-9_]*`
  - The value is the rest of the line after `: ` (one space), trailing newline stripped.
- **Block scalar (multi-line value):**  `key: |` on a line by itself,
  followed by zero or more lines indented by exactly 2 spaces. The value
  is the concatenation of those lines with the leading 2 spaces stripped,
  joined by newlines, no trailing newline.
  - The block ends at the first non-indented non-empty line.

Example:

```
## Push-Args
question: When was Alice born?
draft: |
  My answer to the puzzle.
  Line two.
  Line three.
proposed_assignment: Alice=knave, Bob=knave, Carol=knight, Dan=knight
```

This is a deliberately small subset of YAML — no nesting, no quoting,
no flow style, no comments. Adding `js-yaml` as a dependency was
considered and rejected on YAGNI grounds (we control both producer and
consumer).

### `applyPush` flow (extended)

```
input: stack, memory, instructions, readTarget
1. target = parsePush(memory)
   - if null → return { ok: false, reason: "no-push" }
2. args   = parsePushArgs(memory)        # may be {} if section absent
3. content = readTarget(target)
   - if null → return { ok: false, reason: "missing-target",
                        memory: removePush(removePushArgs(memory)) }
4. substituted, unresolved = substitutePlaceholders(content, args)
5. if unresolved.length > 0 →
     return { ok: false, reason: "unresolved-placeholder",
              target, placeholders: unresolved,
              memory: removePush(removePushArgs(memory)) }
6. push frame: stack' = stack + [{ returnState: parseState(memory),
                                    instructions }]
7. memory'  = setState(removePush(removePushArgs(memory)), "empty")
8. return { ok: true, stack: stack', memory: memory',
            instructions: substituted, target }
```

The order matters: parse args before reading target (cheap), substitute
before pushing the frame (so failure leaves stack untouched), strip
both sections in every exit path (success or failure).

### `substitutePlaceholders`

```ts
substitutePlaceholders(template: string, args: Record<string, string>):
  { result: string; unresolved: string[] }
```

Behaviour:
- Replace every literal `{{key}}` (key matching `[a-zA-Z_][a-zA-Z0-9_]*`)
  with `args[key]` if present.
- After all known substitutions, scan the result for any remaining
  `{{<identifier>}}` matching the same key regex; collect them into
  `unresolved` (deduplicated, in source order).
- No escape syntax supported (R5: no Push-Args means no substitution
  attempted, so a dynamic that genuinely wants `{{foo}}` in its prose
  text never has one).

## Data model

### MEMORY sections introduced

| Section          | Producer                | Consumer                   | Lifetime                                     |
| ---------------- | ----------------------- | -------------------------- | -------------------------------------------- |
| `## Push-Args`   | caller strategy/dynamic | shell (`applyPush`)        | Stripped on every push outcome (success/fail)|
| `## Verifications` | d-cove `verify.md`     | d-cove `verify.md`         | Internal to verify.md; cleared before pop    |
| `## Answer`      | d-cove `answer-independently.md` | d-cove `verify.md` | One per child push; consumed and cleared by Record-answer instruction |
| `## Revised`     | d-cove `verify.md`      | d-cove strategy            | Returned to caller; survives until halt      |
| `## Draft`       | d-cove strategy         | d-cove strategy            | Heap section (durable across the run)        |

### `StackEntry` (unchanged)

```ts
type StackEntry = { returnState: string; instructions: string };
```

The frame still saves the caller's `instructions` *as it was after
substitution* (i.e. the running INSTRUCTIONS the caller sees), so
re-entering the caller after pop restores its already-substituted
view. This matters for nested push chains where the parent itself was
loaded via push-args (e.g. depth-3 hypothetically). Phase 2 only uses
depth-2 in practice but the design generalises.

### `PushResult` discriminated union (extended)

```ts
type PushResult =
  | { ok: true; stack: StackEntry[]; memory: string;
      instructions: string; target: string }
  | { ok: false; memory: string; reason: "no-push" }
  | { ok: false; memory: string; reason: "missing-target"; target: string }
  | { ok: false; memory: string; reason: "unresolved-placeholder";
      target: string; placeholders: string[] };  // ← NEW
```

## Interfaces / API

### `src/memory.ts` additions

```ts
// satisfies: R1
export function parsePushArgs(memory: string): Record<string, string>;

// satisfies: R4
export function removePushArgs(memory: string): string;
```

`parsePushArgs` returns `{}` (not `null`) when the section is absent —
distinguishes "no args" (legitimate) from a parse error. Malformed
lines inside the section log a warning and are skipped (defensive but
permissive — `applyPush` will still surface the unresolved placeholder
later if a needed arg is missing).

### `src/call-stack.ts` additions

```ts
// satisfies: R2, R3
export function substitutePlaceholders(
  template: string,
  args: Record<string, string>,
): { result: string; unresolved: string[] };

// applyPush signature unchanged; behaviour extended per §Architecture
export function applyPush(
  stack: StackEntry[],
  memory: string,
  instructions: string,
  readTarget: (path: string) => string | null,
): PushResult;
```

### `src/main.ts` (cycle-loop) additions

The shell logs the new failure mode alongside the existing
`missing-target` log (`src/main.ts:371`):

```ts
} else if (pushed.reason === "missing-target") {
  log(`  [push] missing target: ${pushed.target}`);
} else if (pushed.reason === "unresolved-placeholder") {  // ← NEW
  log(`  [push] unresolved placeholders in ${pushed.target}: ${pushed.placeholders.join(", ")}`);
}
```

In both failure paths, `pushed.memory` (with both sections stripped)
is written back to disk so the LLM doesn't see the failed `## Push`
again on the next cycle.

## Refactored dynamics

### `self-critique.md` (a) — satisfies R7, R10, R13

Header changes: `Receives argument: {{draft}}.` Body folds the draft
into each instruction's Action text via the placeholder.

```markdown
# Dynamic: Self-Critique

Receives argument: {{draft}}.
Produced MEMORY: ## Critique, ## Refined.
Return: state done → caller sees {caller_state}_completed.

## Instruction: Critique
**Condition:** MEMORY state is "empty"
**Action:** Critique the draft below — describe concrete strengths,
weaknesses, and specific improvements to make. Write ## Critique in
MEMORY. Set state to "critiqued".

Draft:
{{draft}}

## Instruction: Refine
**Condition:** MEMORY state is "critiqued" and ## Critique is present
**Action:** Read ## Critique. Produce an improved version of the
draft below that addresses every critique point and write it to
## Refined. Set state to "done".

Draft:
{{draft}}
```

The placeholder appears twice on purpose — both Critique and Refine
need to see the draft, and substitution at push time means both
substituted copies are identical.

### `evaluate.md` (b canonical, c byte-equal) — satisfies R8, R10, R11, R13

```markdown
# Dynamic: Evaluate

Receives arguments: {{attempt}}, {{criterion}}.
Produced MEMORY: ## Verdict (literal "pass" or "fail"), ## Feedback.
Return: state done → caller sees {caller_state}_completed.

## Instruction: Judge
**Condition:** MEMORY state is "empty"
**Action:** Judge whether the attempt below meets every bullet of the
criterion. Write ## Verdict with the literal text `pass` or `fail` on
its own line (no other content in that section). Write ## Feedback
describing concretely what is right or wrong, citing specific
criterion bullets by number. Set state to "done".

Attempt:
{{attempt}}

Criterion:
{{criterion}}
```

### `reflect.md` (c) — satisfies R9, R10, R13

```markdown
# Dynamic: Reflect

Receives arguments: {{attempt}}, {{verdict}}, {{feedback}}.
Produced MEMORY: ## Lesson.
Return: state done → caller sees {caller_state}_completed.

## Instruction: Distil lesson
**Condition:** MEMORY state is "empty"
**Action:** Read the attempt, verdict, and feedback below. Write
## Lesson as one short verbal rule the next attempt should apply —
one or two sentences, phrased as a directive ("always X", "avoid Y"),
not a restatement of the feedback. Set state to "done".

Attempt:
{{attempt}}

Verdict:
{{verdict}}

Feedback:
{{feedback}}
```

## Strategy callsites (a/b/c) — satisfies R10

Each callsite Action text changes from "Write `## Push` …" to "Write
`## Push` and `## Push-Args` …". The transformation is mechanical —
every existing strategy that pushes now also names the arguments it
passes. Example for `a-self-refine/INSTRUCTIONS.md` "Request critique":

```markdown
## Instruction: Request critique
**Condition:** MEMORY state is "drafted" and ## Draft is present
**Action:** Append the following to MEMORY (do not change state):

    ## Push
    operators/self-critique.md
    ## Push-Args
    draft: |
      <current ## Draft content, indented two spaces>
```

The same transformation applies to:
- b-evaluator-optimizer "Request evaluation" → push evaluate.md with
  `attempt: |` + `criterion: |`
- c-reflexion "Request evaluation" → same as b
- c-reflexion "Reflect" → push reflect.md with `attempt: |` +
  `verdict: |` + `feedback: |`

The `_completed` handlers (Evaluate refinement, Handle verdict, Route
on verdict, Accumulate lesson) are unchanged — they still read
output sections (`## Refined`, `## Verdict`, `## Feedback`,
`## Lesson`) from MEMORY heap.

## New CoVe interpreter

### Strategy state machine — satisfies R14, R15

```
empty ─► (Initialize)            ─► drafted
drafted ─► (Request verification: push verify.md, args=draft)
                                 ─► [verify dynamic runs]
drafted_completed ─► (Finalize)  ─► done
done ─► (Finish: halt)
```

Four strategy instructions: `Initialize`, `Request verification`,
`Finalize`, `Finish`. No loop — `drafted_completed` transitions
directly to `done`.

### `verify.md` state machine — satisfies R16, R17, R20

verify.md runs at stack depth 1 and pushes `answer-independently.md`
at depth 2 once per question.

```
empty ─► (Pose questions)         ─► asking
asking ─► (Ask next: push answer-independently with one question)
                                  ─► [child runs at depth 2]
asking_completed ─► (Record answer; more pending? → asking, else → revising)
revising ─► (Build revised: synthesise ## Revised) ─► done
```

Four instructions:

- **Pose questions** (state `empty`):
  Read `{{draft}}` (from substituted INSTRUCTIONS). Decompose it into
  N atomic claims (N > 1; for the demo, N = 4 — one per islander).
  Write `## Verifications` to MEMORY as a numbered list:
  ```
  - V1: <question to verify claim 1>; pending
  - V2: <question to verify claim 2>; pending
  ...
  ```
  Set state to "asking".

- **Ask next** (state `asking`):
  Find the first V_i whose status is "pending". Append to MEMORY:
  ```
  ## Push
  operators/answer-independently.md
  ## Push-Args
  question: |
    <V_i question text, with any minimum premise context required>
  ```
  Do not change state.

- **Record answer** (state `asking_completed` and `## Answer` is
  present): Mark the most recently asked V_i as `answered: <Answer
  content>` in `## Verifications`. Remove `## Answer` from MEMORY.
  If any V_i is still `pending`, set state to "asking". Otherwise set
  state to "revising".

- **Build revised** (state `revising`): Compare the verified answers
  in `## Verifications` against the claims in `{{draft}}`. Write
  `## Revised` containing the corrected answer (claims confirmed by
  verification kept; claims contradicted by verification replaced with
  the verified value). Remove `## Verifications` from MEMORY. Set
  state to "done".

`{{draft}}` is referenced in three of the four instructions (pose,
build); it's substituted once at push time and persists in
INSTRUCTIONS for the dynamic's lifetime, exactly as `{{draft}}` does
in `self-critique.md`.

### `answer-independently.md` — satisfies R17, R18

```markdown
# Dynamic: Answer Independently

Receives argument: {{question}}.
Produced MEMORY: ## Answer.
Return: state done → caller sees {caller_state}_completed.

## Instruction: Answer in isolation
**Condition:** MEMORY state is "empty"
**Action:** Answer the question below using only:
  (a) the premises in PROGRAM.md (you may read PROGRAM.md);
  (b) general world knowledge applicable to the question.
You have no draft, no prior reasoning, and no access to other MEMORY
sections produced by the caller. Do not read MEMORY.md beyond
checking your own ## State header — write your answer and set state
to "done".

Write your answer to ## Answer in MEMORY (one sentence preferred,
short paragraph maximum). Set state to "done".

Question:
{{question}}
```

This is the load-bearing isolation primitive of CoVe. The structural
guarantee: `answer-independently.md` never references `## Draft`,
`## Verifications`, or any other caller-produced section by name.
The LLM has no instructed reason to read them. The informal nature
of the guarantee is deliberately accepted — see §Risks.

## Demo program — satisfies R19

`interpreters/mas-papers/1-iterative-refinement/d-cove/PROGRAM.md`:

```markdown
# Goal

Solve the following knights-and-knaves puzzle.

## Premises

Four islanders — Alice, Bob, Carol, Dan. Each is either a knight
(always tells the truth) or a knave (always lies). They make these
statements:

- Alice: "Bob and I are of different types."
- Bob: "Carol is a knave."
- Carol: "Dan is a knight."
- Dan: "Alice is a knave."

## Task

Determine the type (knight or knave) of each islander. Return your
final assignment as exactly four lines, one per islander, in this
form:

    Alice: <knight|knave>
    Bob:   <knight|knave>
    Carol: <knight|knave>
    Dan:   <knight|knave>
```

The unique solution is `Alice=knave, Bob=knave, Carol=knight,
Dan=knight`. The first-pass failure mode (Case 1: Alice=knight)
violates Dan's statement under derivation, but fluent first-draft
reasoning sometimes ships an inconsistent assignment without
rechecking.

## Error handling

| Trigger                                                      | Mitigation                                                                                                                                                | R#  |
| ------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------- | --- |
| Push target file does not exist or is empty                  | `applyPush` returns `missing-target`; shell strips both `## Push` and `## Push-Args`, logs error, leaves stack/INSTRUCTIONS unchanged. (Existing path.)   | R3 (analog), R4 |
| `{{placeholder}}` in target not satisfied by `## Push-Args`  | `applyPush` returns `unresolved-placeholder` with the list of unresolved keys; shell strips both sections, logs error, leaves stack/INSTRUCTIONS unchanged.| R3, R4         |
| Malformed `## Push-Args` line (e.g. no `: `)                  | `parsePushArgs` skips the line; the missing argument surfaces later as an unresolved placeholder via R3.                                                   | R3              |
| `## Push-Args` present but `## Push` absent                   | `parsePush` returns `null` → `no-push`; `## Push-Args` is left in MEMORY untouched (no push happens, so no caller intent to honour). The next cycle's instruction is responsible for cleaning it up if needed. | R5 (negative)   |
| Demo run exhausts retry budget without state advancement      | Existing retry-exhaustion path in `src/main.ts` (no new code).                                                                                            | R27             |
| Verify dynamic emits `## Push` to a malformed dynamic name    | Same `missing-target` path; verify enters `asking_completed` without `## Answer` present, the Record-answer instruction's condition fails to match → shell flags unmatched state → `waiting_for_user` (existing behaviour). | R3, R27         |

## Test strategy

### New tests

- **`src/test/push-args.test.ts`** — pure transform tests for R1–R5
  - `parsePushArgs` of `key: value` form returns the right map
  - `parsePushArgs` of `key: |` block scalar returns multi-line value
    with leading 2 spaces stripped
  - `parsePushArgs` of empty / missing section returns `{}`
  - `removePushArgs` strips the section between `## Push-Args` and
    next `## ` (or end)
  - `substitutePlaceholders` substitutes known keys, returns unresolved
    list for unknown ones
  - `applyPush` succeeds when all placeholders resolve; strips both
    `## Push` and `## Push-Args`; sets state to `empty`; pushes one
    frame
  - `applyPush` fails with `unresolved-placeholder` when a placeholder
    has no arg; strips both sections; stack and instructions
    unchanged
  - `applyPush` succeeds with no `## Push-Args` section (R5
    backwards-compat)
  - `applyPush` fails with `missing-target` when target file empty;
    strips both sections

- **`src/test/phase-2-cove.test.ts`** — d-cove scripted integration
  (R14–R20)
  - Files exist at `interpreters/mas-papers/1-iterative-refinement/d-cove/`
  - Strategy declares the four required states (`empty`, `drafted`,
    `drafted_completed`, `done`)
  - `verify.md` declares the four required states (`empty`, `asking`,
    `asking_completed`, `revising`, `done`)
  - `answer-independently.md` is single-instruction
  - **Stack-depth-2 invariant (R20):** simulate strategy push of
    `verify.md`, then verify push of `answer-independently.md`; assert
    stack length == 2 between push and pop
  - End-to-end push-pop trace through one full cycle with mocked
    `## Answer` produced by the depth-2 child

### Updated tests (R12)

- **`src/test/phase-1-self-refine.test.ts`** — the constructed push
  memory string changes from
  ```
  ## State\ndrafted\n## Draft\n...\n## Push\noperators/self-critique.md
  ```
  to
  ```
  ## State\ndrafted\n## Draft\n...\n## Push\noperators/self-critique.md\n## Push-Args\ndraft: |\n  ...
  ```
  Tests still assert push succeeds, stack depth = 1, instructions
  loaded, etc.
- **`src/test/phase-1-evaluator-optimizer.test.ts`** — same shape,
  with `attempt:` and `criterion:` args.
- **`src/test/phase-1-reflexion.test.ts`** — same, plus reflect's
  `attempt`/`verdict`/`feedback` args.
- **`src/test/phase-1-dynamics-identity.test.ts`** — unchanged (still
  asserts `b/operators/evaluate.md` byte-equals `c/operators/evaluate.md`
  after the refactor; R11).

### Live demo gate (R26)

Run `instances/p2-cove/run.sh` end-to-end against `claude-code` with
Haiku. Pass criteria:
- `## State: done` in final MEMORY.md
- `## Revised` section present
- At least one snapshot in `history/` whose `.call-stack.json` has
  length 2 (depth-2 evidence)
- Final `## Revised` content matches `Alice=knave, Bob=knave,
  Carol=knight, Dan=knight` (acceptable variance: case, formatting,
  surrounding prose)

If the live demo fails the assignment but the verification cycle ran
correctly (depth-2 stack observed, all four V_i answered), record in
`phase-2-notes.md` analogous to phase-1-notes.md §c reflexion's R11
discussion.

## Open questions

(none — the requirements gate resolved iteration shape, isolation
mechanism, reuse story, and demo content. Ambiguities surfaced
during implementation will be captured in `phase-2-notes.md`.)
