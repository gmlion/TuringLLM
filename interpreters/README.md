# Interpreters — TuringLLM examples

This directory is a catalogue of *example* strategies that run on top
of the TuringLLM shell. They are not part of the shell — they're
ordinary user code (markdown and a bit of bash) that the shell
executes via push/pop on the call stack.

If you've never run TuringLLM before, picking an example here is the
fastest way to see the shell in action. If you're authoring your own
strategy, the runnable interpreters here are the closest thing to a
reference implementation — copy one, gut it, and reshape.

The shell itself is documented at the [repository
README](../README.md) and in [`CLAUDE.md`](../CLAUDE.md). Read those
for the cycle loop, push/pop semantics, and well-known MEMORY
sections.

The two example families currently shipped:

- [`mas-papers/`](./mas-papers/) — implementations of agent-design
  patterns from the multi-agent systems literature. Iterative
  refinement, planning & decomposition, search, peer collaboration,
  fixed-SOP teams (i.e. teams that follow a fixed standard
  operating procedure — a predetermined phase sequence),
  meta-frameworks.
- [`coding-harnesses/`](./coding-harnesses/) — coding-oriented
  harnesses. Currently ships `recursive-reviewer`, a per-file
  code-review walk with verification and a fix loop.

---

## 1. The MAS-paper families in plain terms

`mas-papers/` collects five families of strategies, each a different
way of getting an LLM to solve a problem that's hard to solve in a
single prompt. The numbering follows the taxonomy in
`patterns.md`.

### Group 1 — Iterative refinement (`mas-papers/1-iterative-refinement/`)

> *Write something. Look at it. Decide it's not good enough. Rewrite. Repeat until it is.*

You write a draft, then either you (the same model) or someone else (a separate critic) judges it, and you iterate until the judge accepts the draft. The four interpreters in this group differ in **who critiques**, **what's remembered between iterations**, and **how the critique is structured**:

- **`a-self-refine/`** — same model judges its own draft in plain prose.
- **`b-evaluator-optimizer/`** — a separate "evaluator" judges the draft against an explicit pass/fail criterion.
- **`c-reflexion/`** — like `b`, but on a fail the model writes a one-line *verbal lesson* that gets read by the next attempt. Cross-iteration memory.
- **`d-cove/`** — Chain-of-Verification. The draft gets decomposed into atomic factual claims, each claim is checked *independently* (in a clean prompt that doesn't see the original draft, so the model can't sycophantically defend itself), then the draft is revised from the verifications.

### Group 2 — Planning & decomposition (`mas-papers/2-planning-decomposition/`)

> *If the task is small, just do it. If it's big, break it into pieces and do each piece the same way.*

Given a goal, the agent decides whether the goal is small enough to do with one tool call. If yes, it does it. If no, it calls a planner to break the goal into 3–7 sub-goals, then recursively tackles each sub-goal the same way. When all sub-goals are done, it synthesizes a final answer. The recursion *is* the architecture: the same dynamic handles a goal at every level of the tree. The three interpreters here are byte-identical, distinguished only by their demo PROGRAM:

- **`a-plan-execute/`** — minimal TypeScript project setup (shallow tree, ≤ 2 levels).
- **`b-orchestrator-workers/`** — summarise 5 input files (1 level fan-out).
- **`c-deep-research/`** — compare Raft/Paxos/Multi-Paxos (2–3 levels of recursion).

### Group 3 — Search (`mas-papers/3-search/`)

> *Don't commit to one path. Branch. Score the branches. Keep the good ones. Repeat.*

The agent maintains a tree of partial solutions. At each step it picks where to grow next, generates several alternatives, scores them, and prunes the weak ones. Two interpreters here, with materially different scheduling:

- **`a-tot/`** — Tree of Thoughts. Breadth-first: at each depth, expand every live node into k=5 candidates, score each 3 times against a `sure/likely/impossible` rubric, keep the top 5. Exhaustive, deterministic.
- **`b-lats/`** — Language Agent Tree Search. MCTS-driven: descend via UCT, expand one leaf, play forward to a terminal state, score the result, back-propagate visit counts, harvest a verbal lesson on failure (reflexion-style). Selective, non-deterministic, memory-augmented.

### Group 4 — Peer collaboration (`mas-papers/4-peer-collaboration/`)

> *Run several agents on the same task and let them shape each other's answers.*

Multiple agents work the *same* task from different angles. The task isn't decomposed; perspectives are multiplied. The shipped variant:

- **`a-debate/`** — Multi-Agent Debate. N personas (specified in PROGRAM.md) each give an opinion. Across rounds, each agent sees prior rounds' transcripts and can update its position. Within a round, agents are isolated from each other. Convergence by mutual critique.

(Mixture of Agents — MoA — is a likely future addition under this group: N proposers in independent contexts, an aggregator blends their answers, layers can stack.)

### Group 5 — Fixed-SOP teams (`mas-papers/5-fixed-sop-teams/`)

> *A simulated software team running through a hardcoded process: design → code → test → ship.*

A small simulated team with hard-coded phases. The strategy walks through the phases in order, spawning a child context per phase. The two interpreters here differ in **what runs inside each phase**:

- **`a-metagpt/`** — *Document hand-off.* One specialist role per phase (PM → Architect → Engineer → QA), acting alone. Each phase produces a typed document (PRD, Design, Tasks, Code Review) consumed by the next.
- **`b-chatdev/`** — *Phase dialogue.* Each phase is a dialogue between two roles (CEO↔CTO, coder↔reviewer, etc.). The phase output is the dialogue's distilled consensus.

Both ship byte-identical demos so their outputs are directly comparable.

### Group 7 — Meta-frameworks (`mas-papers/7-meta-framework/`)

> *Treat the operator library itself as a search space — search and learn over compositions of other operators.*

Strategies that don't solve a task directly but instead search for the best combination of other operators to solve it. Two members:

- **`a-aflow-lite/`** — AFlow-lite (Zhang et al., arXiv:2410.10762). MCTS over candidate workflows drawn from a five-operator library (`refine`, `reflexion`, `cove`, `plan-execute`, `debate`). Each MCTS iteration selects a promising workflow, expands it via an LLM-driven `expand-workflow.md` call (k=5 children), simulates the candidate by running its operators on a 3-item GSM8K sample, and back-propagates the reward. The MCTS controller is adapted from `3-search/b-lats/`. v1 has no meta-reflexion and no nested shell instances — all workflow execution happens via push/pop within one shell instance.
- **`b-adas-lite/`** — ADAS-lite, after Hu et al. 2024 (arXiv:2408.08435). Searches over **operator code** rather than compositions: an LLM proposer reads an archive of past candidates and writes a new operator markdown file; the shell tests it on a 30-item GSM8K search set, evaluates the winner against a disjoint 30-item held-out set. Reports search vs. held-out scores so generalisation drift is visible.

---

## 2. The `coding-harnesses/` family

`coding-harnesses/recursive-reviewer/` is a code-review interpreter
that walks a codebase's import graph from a chosen entry file and,
for every file reached, applies a two-stage review (a "reviewer"
pass that produces suggestions, a "refiner" pass that vets them
against the actual code and a cross-file refactor log), applies the
survivors, runs a configurable verification command, and iterates a
targeted fix loop if verification breaks. The refactor log
accumulates cross-cutting decisions across files; per-file failure
output stays ephemeral. See the interpreter's README for full mechanics.

This family is the natural home for future harnesses that aren't
mirroring a published MAS pattern — internal coding workflows,
refactor passes, migration tooling, etc.

---

## 3. Execution context — the mechanics every example shares

Every interpreter, regardless of pattern, runs on the same shell primitives. Understanding these is essential for reasoning about what each "operation" can and cannot see. The cycle loop, push/pop semantics, and well-known MEMORY sections are documented in the [root README](../README.md). This section focuses on the patterns the examples rely on most.

### Frames and the call stack

The active frame's path is `instances/<name>/frames/f<NNN>-<slug>/`. Each frame has its own:

- `INSTRUCTIONS.md` — the program for that frame. Strategy frames carry the orchestrator; dynamic frames carry the dynamic's body.
- `MEMORY.md` — the state. Persistent within the frame across cycles; never visible to other frames.
- `scoped/` — a private directory for structured per-frame state (drafts, ledgers, lessons).

Across frames, none of these are shared. A dynamic frame **cannot** read its parent's MEMORY or scoped/. The shared filesystem is `../../PROGRAM.md` (read-only) and `../../workspace/` (the LLM-controlled project).

### How dynamics get input

When the strategy writes `## Push <path>` (optionally with `## Push-Args key: value`) in MEMORY, the shell:
1. Saves the current frame on the stack (with a `returnState`).
2. Loads `<path>` as the new frame's INSTRUCTIONS.md, substituting any `{{key}}` placeholders with the corresponding push-arg value.
3. Sets the new frame's MEMORY.md to `## State\nempty`.
4. Strips `## Push` and `## Push-Args` from the parent's MEMORY (they don't reappear next cycle).

So **the dynamic gets a clean context**: a fresh MEMORY (state=empty), an INSTRUCTIONS.md baked with its push-args, an empty scoped/. The only thing it knows about the world is what the parent literally typed into the push-args.

### How dynamics return

A dynamic that finishes its work writes:
```
## State
done
## Return
<key>: <value>
<key>: |
  <multi-line block scalar>
```

When the shell sees `state == done` on a non-root frame, it pops:
1. Removes the frame's directory from the live stack.
2. Splices each `## Return` entry into the caller's MEMORY as `## <CapitalizedKey>` sections.
3. Renames the caller's state to `<returnState>_completed` (so the caller's `_completed` instruction can match).

So **return values flow through MEMORY sections, not function-call return**. The caller's next cycle sees the spliced sections and runs its absorb instruction.

### What this means for "execution context"

| Aspect | Strategy frame | Dynamic frame |
|---|---|---|
| Lifetime | Whole run | Single dispatch (push → done → pop) |
| MEMORY persistence across cycles | Yes (within the frame) | Yes (within the frame, until it pops) |
| Sees parent's MEMORY? | n/a (it's the root) | **No** |
| Sees parent's scoped/? | n/a | **No** |
| Receives input via | PROGRAM.md, prior cycle's MEMORY, scoped/ files | **Only push-args** baked into INSTRUCTIONS.md |
| Returns output via | (terminal — emits `## Solution` etc.) | **Only `## Return`** spliced into caller's MEMORY |
| Can write `workspace/`? | Yes | Yes (shared across all frames) |

The asymmetry between strategy and dynamic is the point: **strategies own state and orchestrate; dynamics are pure functions over their push-args**. This is what makes dynamics composable. A dynamic that depended on its caller's scoped/ files would only work for one caller.

### Root-operator bootstrap

Every interpreter directory contains an `INSTRUCTIONS.md` that is a single-line marker pointing at the canonical operator file, e.g. `operators/refine.md`. When `new-instance.sh <interpreter-dir> <name>` creates an instance, it reads that marker and writes the resolved path to `instances/<name>/.root-operator`.

At startup (before the first cycle), the shell:

1. Reads `.root-operator` and the canonical operator file at the named path.
2. Substitutes `{{program}}` (the content of `instances/<name>/PROGRAM.md`) into the operator text.
3. Writes the substituted operator to `frames/f000-<slug>/INSTRUCTIONS.md` and initialises the call stack with one root frame.
4. Enters the cycle loop.

When the root frame transitions to `state == done`, the shell parses the `## Return` block from that frame's MEMORY and writes one section per key to `instances/<name>/OUTPUT.md` (e.g. `## Answer`). If the operator halts without a `## Return`, OUTPUT.md receives a diagnostic.

This unification means a meta-framework operator like `aflow-lite.md` is invoked the same way as any other operator — pass `{{program}}`, enter at `state == empty` — but internally it pushes operators from the library to materialise and evaluate candidate workflows.

### Per-group execution-context highlights

The shared mechanics above hold for every interpreter, but each pattern uses them differently. Read these alongside the per-group READMEs:

- **Group 1 (refinement).** Strategy frame holds the draft and iteration counter in scoped/ files. Each iteration pushes a single dynamic (`self-critique.md`, `evaluate.md`, `reflect.md`, `verify.md`) with the relevant slice of context (just the draft, just the attempt+criterion, just the attempt+verdict+feedback). The dynamic returns its verdict/critique/lesson and pops; the strategy decides whether to iterate. **CoVe is the only interpreter in this group that nests two levels deep**: `verify.md` itself pushes `answer-independently.md` once per atomic claim — and crucially each `answer-independently.md` push gets a clean context with only the question, **not the original draft** (so the verifier can't be biased by knowing what the drafter wrote).

- **Group 2 (planning).** Strategy is a thin shim: it pushes `tackle.md(goal=program body)` and waits for the result. `tackle.md` decides per-call whether the goal is atomic (one tool call) or composite (push `plan.md` for sub-goals, then push `tackle.md` recursively per sub-goal). Each `tackle.md` push gets a clean context with only the goal — it does not see the parent goal, the sibling sub-goals, or anything else from the broader tree. The recursion is genuinely "same dynamic, every level".

- **Group 3 (search).** Strategy holds the entire tree in `scoped/tree.md` (an append-only YAML-block ledger) and per-node partial states in `scoped/state-<id>.md`. Dynamics (`expand-node.md`, `score.md`, `rollout.md`, `evaluate.md`, `reflect.md`) are stateless: each push gets the relevant partial state plus the task description; none of them sees the rest of the tree. LATS additionally threads ancestor lessons into the partial_state push-arg via a Compose-partial-state primitive — so a deep node's expansion sees its ancestor chain's accumulated lessons, but never its siblings'.

- **Group 4 (peer collaboration).** Strategy holds the round transcript. **Round isolation is the strategy's job**: per-round it pushes `opine.md` once per persona, where each push receives the question, persona, round number, and **prior** rounds' transcript — but **NOT** current-round siblings' opinions yet (they're still being generated). Only after a round completes does the strategy splice in that round's opinions for the next round to see.

- **Group 5 (fixed-SOP teams).** Strategy walks SOP phases in order. MetaGPT pushes one role-`<name>.md` dynamic per phase; each role sees only the prior role's spliced section as `partial_state`. ChatDev pushes one `dialogue.md` per phase, parameterised by the role pair (`{{participants}}`); the dialogue sees the prior phase's distilled output.

- **Coding-harnesses (`recursive-reviewer`).** Strategy holds the BFS queue, the visited set, and a curated cross-file refactor log. Per file, it pushes `reviewer.md` and then `refiner.md` (each receives just the file content plus the cumulative log so far), applies the curated suggestions, then runs verification inline. On failure it transitions into a `fix` state with the verify tail + a per-file fix history; the fix loop is uncapped (a broken build affects every subsequent file).

The recurring theme: **how much "shared state" each operation sees** is precisely what differentiates the patterns. CoVe verifies in clean contexts on purpose. MoA proposers are isolated on purpose. Debate is round-isolated on purpose. The strategy-vs-dynamic split lets the orchestrator decide what to expose.

---

## 4. Operators vs final implementations

Not every shipped interpreter is "operator-shaped" — and the distinction matters because Group 7 (the meta-frameworks) compose operators from a library. To be useful as a meta-framework operator, an interpreter must be **slot-in composable** — you can wrap it around or insert it into another workflow without breaking either side.

The criteria are:

1. **Composability.** The operator must accept a well-defined input (a draft, a goal, a partial state, a question…) and return a well-defined output (a critique, a result, a verdict…) without depending on the surrounding workflow's internals.
2. **One representative per distinct capability.** Two operators that do roughly the same thing waste search-space slots. Pick the cleaner / more reusable one.
3. **Distinct capability per operator.** Each chosen operator should bring something none of the others does.
4. **No recursion.** Don't include search patterns themselves as operators in a meta-search library — the meta-framework *is* a search, so adding ToT/LATS as building blocks would mean searching over searches over searches. Conceptually allowed but practically intractable.
5. **Skip end-to-end pipelines.** Some interpreters are "complete agents" rather than building blocks — usually the fixed-SOP ones. They're valuable to ship as runnable artefacts, but you can't easily slot them into a larger workflow.

Applying these criteria to the catalogue:

### Operator candidates (the meta-framework shortlist)

These six are the recommended seed for a meta-framework's operator library. Each one is composable, brings a distinct capability, and is non-recursive.

| # | Operator | Distinct capability | Why this one (not its sibling) |
|---|----------|---------------------|---------------------------------|
| 1 | **`mas-papers/1-iterative-refinement/b-evaluator-optimizer/`** | Externally-judged refinement loop with explicit pass/fail criterion. | Preferred over `a-self-refine` because the **judge interface is explicit** (`evaluate.md`'s push-args are `attempt` + `criterion`, return is `verdict` + `feedback`) and the same `evaluate.md` is reused across many other interpreters (1c, 4a/MetaGPT-QA, 4b/ChatDev-reviewer, 3a/ToT-goal-check, 3b/LATS-rollout-judge). Adopting `1b` makes the meta-framework's "judge" interface uniform with the rest of the codebase. `1a`'s self-critique is squishier (free-prose, same role both writes and judges) — fine for standalone use, weaker as a composable operator. |
| 2 | **`mas-papers/1-iterative-refinement/c-reflexion/`** | Cross-iteration verbal memory. Failed attempts produce one-line lessons that condition future attempts. | The only operator that brings *episodic memory across iterations*. No other operator can replicate this through composition. |
| 3 | **`mas-papers/1-iterative-refinement/d-cove/`** | Within-iteration **independent fact-checking** of decomposed atomic claims. | The only operator that does post-hoc verification by re-asking each claim in a clean prompt that doesn't see the original draft — defeats sycophantic self-confirmation that wrappers like self-refine cannot defeat. Particularly valuable on knowledge-heavy or high-precision tasks. |
| 4 | **`mas-papers/2-planning-decomposition/a-plan-execute/`** (or any of the three interpreters in this group; they're byte-identical) | Recursive goal decomposition. | The only operator that turns a goal into a tree of sub-goals and synthesizes the results of the recursion's leaves. |
| 5 | **`mas-papers/4-peer-collaboration/a-debate/`** | Adversarial multi-persona consensus with round isolation. | The only operator that does cross-perspective debate: agents shape each other's answers across rounds. Distinct from MoA's blend (no cross-visibility) and from self-refine's self-judgment (single perspective). |
| 6 | **MoA** *(future)* | Independent ensembling: N proposers under different system prompts, an aggregator blends. | Distinct from debate: in MoA proposers don't see siblings within a layer. The diversity comes from differing system prompts/models, not argumentation. Pending a per-prompt model-selection feature in the shell. |

### Why each excluded interpreter is excluded

| Interpreter | Excluded because |
|---|---|
| **`mas-papers/1-iterative-refinement/a-self-refine/`** | Same architectural shape as `1b` (draft → judge → revise) but with a less explicit judge interface. `1b` is the cleaner candidate; including both would consume two operator slots for one capability. |
| **Group 2 siblings `b-orchestrator-workers/` and `c-deep-research/`** | Byte-identical to `a-plan-execute/`, distinguished only by demo PROGRAM. Not separate operators — they're the same operator showcased on different inputs. |
| **`mas-papers/3-search/a-tot/`** and **`mas-papers/3-search/b-lats/`** | Group 7 *is* a search (MCTS over candidate workflows). Including search interpreters as operators in its library would create searches-over-searches. The meta-framework strategy *imports* MCTS helper code from `b-lats/INSTRUCTIONS.md`; it does not include `b-lats` as a building block. |
| **`mas-papers/5-fixed-sop-teams/a-metagpt/`** and **`b-chatdev/`** | End-to-end pipelines tied to "build a software project". Their internal SOPs (PM/Architect/Engineer/QA, design/coding/testing/documenting) are hard-coded for software construction; you cannot easily slot them into "solve a math word problem" or "answer a factual question". They're valuable as runnable artefacts that exercise shell features (typed hand-off, dialogue, file-aware evaluation), but they're not composable building blocks. |
| **`coding-harnesses/recursive-reviewer/`** | End-to-end coding harness with its own per-file BFS + verification + fix loop. Self-contained workflow, not a composable building block. |

### Final implementations

The interpreters above that *aren't* in the operator shortlist are still useful — they're **final implementations**: complete, runnable demonstrations of a pattern that you can launch as an instance and observe end-to-end. They're not building blocks for a meta-framework, but they are:

- **Pedagogical.** Each one is a clean, minimal embodiment of its pattern, useful for understanding the pattern's mechanics.
- **Comparison artefacts.** `a-tot` and `b-lats` both solve the same Game-of-24 puzzle so their search shapes can be diffed directly. MetaGPT and ChatDev both build the same `wc-plus` CLI tool so their hand-off styles can be diffed directly.
- **Shell-feature regression pins.** The fixed-SOP teams exercise typed hand-off, file-aware evaluation, and non-blocking pending questions — all shell features that other interpreters depend on.

The Group 7 meta-frameworks (`aflow-lite/`, `adas-lite/`) reference the operator shortlist above and treat the rest as out-of-library reference implementations.

---

## 5. Where to read next

| Want to... | Read |
|---|---|
| Understand the shell itself (cycle loop, push/pop, well-known sections) | [Root `README.md`](../README.md) |
| Understand a specific group's family-level architecture | `mas-papers/<group>/README.md` |
| Run a specific example interpreter and inspect its mechanics | `mas-papers/<group>/<interpreter>/README.md` or `coding-harnesses/<interpreter>/README.md` |

To run any shipped example:

```bash
./new-instance.sh interpreters/<family>/<...>/<interpreter> my-instance
instances/my-instance/run.sh
```

The instance directory is self-contained; inspect
`instances/my-instance/frames/f000-<slug>/MEMORY.md` after the run
for the final state.
