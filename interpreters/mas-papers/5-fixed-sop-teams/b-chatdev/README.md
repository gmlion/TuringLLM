# b-chatdev

*ChatDev (Qian et al., 2023). See
`docs/agent-workflows/patterns.md` §Group 5.*

## What's modeled

A small simulated software company. The work to satisfy the user
program is split into four sequential phases — **design, coding,
testing, documenting** — and each phase is a multi-turn
conversation between a pair of named specialists rather than a
single agent's monologue. The phase-by-phase shape is fixed; the
content of each conversation is not.

| Phase | Pair | Acceptance gate |
| --- | --- | --- |
| Design | CEO ↔ CTO | none |
| Coding | Coder ↔ Reviewer | yes |
| Testing | Tester ↔ Reviewer | yes |
| Documenting | Writer ↔ Reviewer | yes |

A phase ends when the pair declares consensus *and* (for the
gated phases) an independent reviewer signs off on what's
actually on disk in `workspace/`. A failed sign-off restarts the
same phase as a fresh conversation, with the reviewer's feedback
handed in. There is no cap on retries — convergence is the
reviewer's judgement.

## Three orchestrators, three contexts

At any moment exactly one of three entities is driving the next
LLM cycle. Knowing which one is the difference between
understanding what the strategy did and being lost in the trace.

| Driver | When it's active | What it can see | What it produces |
| --- | --- | --- | --- |
| **Strategy** (`f000-strategy`) | Between phases — at startup, after each pop, between retry-stage and retry-push | Its own state, marker sections (`## Dialogue`, `## Verdict`, `## Feedback`) spliced from a popped child, files in `workspace/.chatdev/` | A new push (the next phase's dialogue or its retry), or `done` |
| **Dialogue** (`fNNN-dialogue`) | Inside a phase, alternating turns between the two role agents | Its own scoped files (transcript, turn counter, topic, input, output path), workspace files via `bash` | Turns appended to the transcript; eventually a consensus and (for gated phases) a push of `evaluate.md` |
| **Evaluator** (`fNNN-evaluate`) | Right after a gated dialogue declares consensus | The dialogue's `attempt` (extracted from the transcript), the criterion (the dialogue's topic), the actual files in `workspace/` (it inspects them via `bash ls`/`cat`) | A `pass`/`fail` verdict + concrete feedback |

A new context is created on every push and destroyed on the
matching pop. **Nothing is preserved between two dialogue
contexts** — a retry replaces the entire conversation; there's no
shared "history of attempts" across retries beyond what gets
re-handed in via `input`. The evaluator's verdict travels back to
the strategy through `## Return` splicing; the strategy decides
what to do with it.

Peak stack depth is therefore 2 — 3 frames: `strategy → dialogue →
evaluate`. Coding/testing/documenting reach depth 2 on the
acceptance gate; design pops directly back to the strategy frame (no gate).

## How the dialogue actually works

A dialogue is a sequence of single-turn LLM cycles. The dialogue
context's state machine — not the strategy — drives the
alternation. Each turn is a fresh LLM invocation; nothing
persists in the model's working memory across turns. Continuity
comes from disk:

- `./scoped/transcript.md` — every turn appended in order, headed
  `### Turn N — <speaker>`.
- `./scoped/turns.md` — the integer turn counter.
- `./scoped/topic.md`, `./scoped/input.md`, `./scoped/output_path.md`
  — the immutable context written once when the dialogue starts.

**Two-agent isolation is enforced in prompting, not architecture.**
On each turn the dialogue's instructions tell the model: "you are
participant X for this turn; read only `roles/X.md`, never
`roles/Y.md`." The shared transcript is interpreted *from X's
perspective*: X's prior turns are read as the model's own
"assistant" history, Y's turns are read as "user" messages
addressed to X. The two role agents therefore never internalize
each other's persona, even though they're contributing to a
shared file.

A turn ends in one of three ways:

1. **Continue.** The model writes a turn (2–5 sentences),
   increments the counter, leaves state at `turning`. The next
   cycle picks the other participant.
2. **Consensus.** The model prefixes its turn with `<SOLUTION>`.
   The dialogue moves to `decide_accept`.
3. **Cap.** After 10 turns without consensus, the dialogue moves
   to `decide_accept` anyway (paper §3.2 hard cap).

Side effects matter. The role agents are expected to use the
Bash tool to write real files into `workspace/` (source, tests,
README). Their turn body should *describe* what they wrote, not
just contain bash code as text — that distinction is enforced
later by the evaluator, which inspects disk.

## What the evaluator does

Once the dialogue reaches `decide_accept` *and* the phase is
gated (`acceptance: true`), the dialogue pushes `operators/evaluate.md`
with the extracted attempt, the criterion (= the dialogue's
topic), and the output path. The evaluator runs as its own
context with no role bias — it sees the inputs as data, not as
an interlocutor. It then:

1. Lists `workspace/` and `workspace/.chatdev/`.
2. Reads the file at `output_path` (the consensus artefact).
3. For every workspace path the criterion mentions, verifies the
   file exists with appropriate content.
4. Returns `pass` if all checks hold, otherwise `fail` with
   concrete file-citation feedback.

Crucially, the evaluator distrusts the textual `attempt`. A role
agent that pasted a `cat > … << EOF` block as turn text — without
actually executing it — gets caught here, because the file it
"wrote" doesn't exist on disk.

## Phase transitions are split across two cycles

Each phase boundary in the strategy is two cycles, not one:

1. **Stage.** The strategy extracts whatever needs to be carried
   forward (e.g. reviewer feedback into
   `workspace/.chatdev/last_rejection.md`), prunes the
   `## Dialogue` / `## Verdict` / `## Feedback` markers from its
   MEMORY, and parks at an intermediate state (e.g.
   `coding_retry_pushing`, `coding_to_testing_pushing`).
2. **Push.** The next cycle wholesale-rewrites MEMORY with the
   phase's static `## Push` template — no inline substitution
   from prior MEMORY content, no variable interpolation. The
   shell sees the push and creates the new dialogue context.

The split exists because a single cycle that combined "extract
feedback, prune memory, emit a multi-line push, set state" was
unreliable: the model would sometimes narrate the push while
silently skipping the textual emission, leaving the strategy
half-transitioned and stranded.

## Where artefacts live

Phase artefacts live in `workspace/`, not in MEMORY. Each phase's
dialogue is given an `output_path` push-arg and writes its
consensus body directly there:

| Phase | Consensus artefact | Side-effect files |
| --- | --- | --- |
| Design | `workspace/.chatdev/design.md` | (none — design phase is talk only) |
| Coding | `workspace/.chatdev/code.md` (description) | `workspace/<source files>` written by the coder via Bash |
| Testing | `workspace/.chatdev/test_report.md` | `workspace/<test files>` written by the tester via Bash |
| Documenting | `workspace/.chatdev/documentation.md` | `workspace/README.md` (and similar) written by the writer via Bash |

The strategy's MEMORY stays small across phases — no `## Code` /
`## Test Report` accumulation, no parsing of artefact bodies. On
a retry, the previous attempt's `workspace/.chatdev/<phase>.md`
gets overwritten by the new dialogue.

## Dynamics in this interpreter

| File | Receives (push-args) | Returns | Stack depth from caller |
| --- | --- | --- | --- |
| `operators/dialogue.md` | `participants`, `topic`, `input`, `output_path`, `acceptance` | `dialogue` (path marker), and on gated phases also `verdict` + `feedback` | 1 (2 when `acceptance=true` and the dialogue pushes `evaluate.md`) |
| `operators/evaluate.md` | `attempt`, `criterion`, `output_path` | `verdict`, `feedback` | 1 (no further push; byte-equal copy of the shared evaluator) |

Role descriptions live under `./roles/` (`ceo.md`, `cto.md`,
`coder.md`, `reviewer.md`, `tester.md`, `writer.md`).

## Demo `PROGRAM.md`

Build `wc-plus` — same task as `../a-metagpt/PROGRAM.md`
(byte-equal). Running both interpreters on the same PROGRAM.md
is the comparison the group exists for.

## Run it

```bash
./new-instance.sh interpreters/mas-papers/5-fixed-sop-teams/b-chatdev my-chatdev
instances/my-chatdev/run.sh
```

## Notable trade-offs vs. the paper

- **No `ComposedPhase.cycle_num` cap on retries.** The paper
  bounds retries to bound GPT-4 spend; here convergence is the
  reviewer's judgement, consistent with the other iterative
  interpreters in this repo.
- **Per-turn fresh LLM invocation, not a long-lived agent.** A
  ChatDev "agent" in our setup is a persona file plus the
  per-turn instruction *"act as this persona"*. We get the
  pairwise dynamic without long-lived in-memory agents because
  every cycle is one-shot anyway.

## Layout note

`INSTRUCTIONS.md` is a single-line marker pointing at the canonical operator file `operators/chatdev.md`. The strategy body lives in the canonical operator. This pattern lets the same operator be invoked standalone (via `.root-operator` bootstrap) AND as a library operator inside meta-frameworks like `aflow-lite`.

For this interpreter the canonical operator is `operators/chatdev.md`.
