# Interpreters — patterns guide

This directory ships a working catalogue of agent-design patterns from the literature. Each subdirectory is a runnable interpreter (a strategy + dynamics) that exercises one pattern end-to-end against a demo `PROGRAM.md`.

This README is the pedagogical entry point. Read it first; then dive into the per-group READMEs (`<group>/README.md`) and per-leaf READMEs (`<group>/<leaf>/README.md`) for the structural and contractual details.

For the literature taxonomy and citations, see `docs/agent-workflows/patterns.md`. For the implementation roadmap and what's still to come, see `docs/agent-workflows/requirements.md`.

---

## 1. The five families in plain terms

Five pattern families are shipped. Each is a different way of getting an LLM to solve a problem that's hard to solve in a single prompt.

### Group 1 — Iterative refinement (`1-iterative-refinement/`)

> *Write something. Look at it. Decide it's not good enough. Rewrite. Repeat until it is.*

You write a draft, then either you (the same model) or someone else (a separate critic) judges it, and you iterate until the judge accepts the draft. The four leaves differ in **who critiques**, **what's remembered between iterations**, and **how the critique is structured**:

- **`a-self-refine/`** — same model judges its own draft in plain prose.
- **`b-evaluator-optimizer/`** — a separate "evaluator" judges the draft against an explicit pass/fail criterion.
- **`c-reflexion/`** — like `b`, but on a fail the model writes a one-line *verbal lesson* that gets read by the next attempt. Cross-iteration memory.
- **`d-cove/`** — Chain-of-Verification. The draft gets decomposed into atomic factual claims, each claim is checked *independently* (in a clean prompt that doesn't see the original draft, so the model can't sycophantically defend itself), then the draft is revised from the verifications.

### Group 2 — Planning & decomposition (`2-planning-decomposition/`)

> *If the task is small, just do it. If it's big, break it into pieces and do each piece the same way.*

Given a goal, the agent decides whether the goal is small enough to do with one tool call. If yes, it does it. If no, it calls a planner to break the goal into 3–7 sub-goals, then recursively tackles each sub-goal the same way. When all sub-goals are done, it synthesizes a final answer. The recursion *is* the architecture: the same dynamic handles a goal at every level of the tree. The three leaves are byte-identical interpreters distinguished only by their demo PROGRAM:

- **`a-plan-execute/`** — minimal TypeScript project setup (shallow tree, ≤ 2 levels).
- **`b-orchestrator-workers/`** — summarise 5 input files (1 level fan-out).
- **`c-deep-research/`** — compare Raft/Paxos/Multi-Paxos (2–3 levels of recursion).

### Group 3 — Search (`3-search/`)

> *Don't commit to one path. Branch. Score the branches. Keep the good ones. Repeat.*

The agent maintains a tree of partial solutions. At each step it picks where to grow next, generates several alternatives, scores them, and prunes the weak ones. Two leaves with materially different scheduling:

- **`a-tot/`** — Tree of Thoughts. Breadth-first: at each depth, expand every live node into k=5 candidates, score each 3 times against a `sure/likely/impossible` rubric, keep the top 5. Exhaustive, deterministic.
- **`b-lats/`** — Language Agent Tree Search. MCTS-driven: descend via UCT, expand one leaf, play forward to a terminal state, score the result, back-propagate visit counts, harvest a verbal lesson on failure (reflexion-style). Selective, non-deterministic, memory-augmented.

### Group 4 — Peer collaboration (`4-peer-collaboration/`)

> *Run several agents on the same task and let them shape each other's answers.*

Multiple agents work the *same* task from different angles. The task isn't decomposed; perspectives are multiplied. The shipped variant:

- **`a-debate/`** — Multi-Agent Debate. N personas (specified in PROGRAM.md) each give an opinion. Across rounds, each agent sees prior rounds' transcripts and can update its position. Within a round, agents are isolated from each other. Convergence by mutual critique.

(Mixture of Agents — MoA — is planned next under this group: N proposers in independent contexts, an aggregator blends their answers, layers can stack.)

### Group 5 — Fixed-SOP teams (`5-fixed-sop-teams/`)

> *A simulated software team running through a hardcoded process: design → code → test → ship.*

A small simulated team with hard-coded phases. The strategy walks through the phases in order, spawning a child context per phase. The two leaves differ in **what runs inside each phase**:

- **`a-metagpt/`** — *Document hand-off.* One specialist role per phase (PM → Architect → Engineer → QA), acting alone. Each phase produces a typed document (PRD, Design, Tasks, Code Review) consumed by the next.
- **`b-chatdev/`** — *Phase dialogue.* Each phase is a dialogue between two roles (CEO↔CTO, coder↔reviewer, etc.). The phase output is the dialogue's distilled consensus.

Both ship byte-identical demos so their outputs are directly comparable.

---

## 2. Execution context — the mechanics that everyone shares

Every interpreter, regardless of pattern, runs on the same shell primitives. Understanding these is essential for reasoning about what each "operation" can and cannot see.

### The basics: one cycle = one LLM call

The shell loops forever. Each cycle:
1. Identifies the active frame (the top of the call stack).
2. Reads that frame's `MEMORY.md` and `INSTRUCTIONS.md`, builds a prompt, calls the LLM.
3. The LLM finds the first `## Instruction` in INSTRUCTIONS.md whose **Condition** matches MEMORY's `## State`, runs that instruction's **Action** (typically a bash heredoc that writes a new MEMORY.md), and returns.
4. The shell reads MEMORY.md, processes any shell-intercepted sections (`## Push`, `## Return`, `## Pending Questions`), commits to git, and loops.

The LLM's "memory" across cycles is **whatever the previous LLM call wrote into MEMORY.md or scoped/ files**. There is no implicit conversational continuity. Each cycle starts a fresh prompt with the current MEMORY content baked in.

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

### Per-group execution-context highlights

The shared mechanics above hold for every interpreter, but each pattern uses them differently. Read these alongside the per-group READMEs:

- **Group 1 (refinement).** Strategy frame holds the draft and iteration counter in scoped/ files. Each iteration pushes a single dynamic (`self-critique.md`, `evaluate.md`, `reflect.md`, `verify.md`) with the relevant slice of context (just the draft, just the attempt+criterion, just the attempt+verdict+feedback). The dynamic returns its verdict/critique/lesson and pops; the strategy decides whether to iterate. **CoVe is the only interpreter in this group that nests two levels deep**: `verify.md` itself pushes `answer-independently.md` once per atomic claim — and crucially each `answer-independently.md` push gets a clean context with only the question, **not the original draft** (so the verifier can't be biased by knowing what the drafter wrote).

- **Group 2 (planning).** Strategy is a thin shim: it pushes `tackle.md(goal=program body)` and waits for the result. `tackle.md` decides per-call whether the goal is atomic (one tool call) or composite (push `plan.md` for sub-goals, then push `tackle.md` recursively per sub-goal). Each `tackle.md` push gets a clean context with only the goal — it does not see the parent goal, the sibling sub-goals, or anything else from the broader tree. The recursion is genuinely "same dynamic, every level".

- **Group 3 (search).** Strategy holds the entire tree in `scoped/tree.md` (an append-only YAML-block ledger) and per-node partial states in `scoped/state-<id>.md`. Dynamics (`expand-node.md`, `score.md`, `rollout.md`, `evaluate.md`, `reflect.md`) are stateless: each push gets the relevant partial state plus the task description; none of them sees the rest of the tree. LATS additionally threads ancestor lessons into the partial_state push-arg via a Compose-partial-state primitive — so a deep node's expansion sees its ancestor chain's accumulated lessons, but never its siblings'.

- **Group 4 (peer collaboration).** Strategy holds the round transcript. **Round isolation is the strategy's job**: per-round it pushes `opine.md` once per persona, where each push receives the question, persona, round number, and **prior** rounds' transcript — but **NOT** current-round siblings' opinions yet (they're still being generated). Only after a round completes does the strategy splice in that round's opinions for the next round to see.

- **Group 5 (fixed-SOP teams).** Strategy walks SOP phases in order. MetaGPT pushes one role-`<name>.md` dynamic per phase; each role sees only the prior role's spliced section as `partial_state`. ChatDev pushes one `dialogue.md` per phase, parameterised by the role pair (`{{participants}}`); the dialogue sees the prior phase's distilled output.

The recurring theme: **how much "shared state" each operation sees** is precisely what differentiates the patterns. CoVe verifies in clean contexts on purpose. MoA proposers are isolated on purpose. Debate is round-isolated on purpose. The strategy-vs-dynamic split lets the orchestrator decide what to expose.

---

## 3. Operators vs final implementations

Not every shipped interpreter is "operator-shaped" — and the distinction matters because Phase 7 (the meta-framework, `aflow-lite/`) will compose operators from a library. To be useful as a meta-framework operator, an interpreter must be **slot-in composable** — you can wrap it around or insert it into another workflow without breaking either side.

The criteria are:

1. **Composability.** The operator must accept a well-defined input (a draft, a goal, a partial state, a question…) and return a well-defined output (a critique, a result, a verdict…) without depending on the surrounding workflow's internals.
2. **One representative per distinct capability.** Two operators that do roughly the same thing waste search-space slots. Pick the cleaner / more reusable one.
3. **Distinct capability per operator.** Each chosen operator should bring something none of the others does.
4. **No recursion.** Don't include search patterns themselves as operators in a meta-search library — Phase 7 *is* a search, so adding ToT/LATS as building blocks would mean searching over searches over searches. Conceptually allowed but practically intractable.
5. **Skip end-to-end pipelines.** Some interpreters are "complete agents" rather than building blocks — usually the fixed-SOP ones. They're valuable to ship as runnable artefacts, but you can't easily slot them into a larger workflow.

Applying these criteria to the catalogue:

### Operator candidates (the Phase 7 shortlist)

These six are the recommended seed for the meta-framework's operator library. Each one is composable, brings a distinct capability, and is non-recursive.

| # | Operator | Distinct capability | Why this one (not its sibling) |
|---|----------|---------------------|---------------------------------|
| 1 | **`1-iterative-refinement/b-evaluator-optimizer/`** | Externally-judged refinement loop with explicit pass/fail criterion. | Preferred over `a-self-refine` because the **judge interface is explicit** (`evaluate.md`'s push-args are `attempt` + `criterion`, return is `verdict` + `feedback`) and the same `evaluate.md` is reused across many other interpreters (1c, 4a/MetaGPT-QA, 4b/ChatDev-reviewer, 3a/ToT-goal-check, 3b/LATS-rollout-judge). Adopting `1b` makes the meta-framework's "judge" interface uniform with the rest of the codebase. `1a`'s self-critique is squishier (free-prose, same role both writes and judges) — fine for standalone use, weaker as a composable operator. |
| 2 | **`1-iterative-refinement/c-reflexion/`** | Cross-iteration verbal memory. Failed attempts produce one-line lessons that condition future attempts. | The only operator that brings *episodic memory across iterations*. No other operator can replicate this through composition. |
| 3 | **`1-iterative-refinement/d-cove/`** | Within-iteration **independent fact-checking** of decomposed atomic claims. | The only operator that does post-hoc verification by re-asking each claim in a clean prompt that doesn't see the original draft — defeats sycophantic self-confirmation that wrappers like self-refine cannot defeat. Particularly valuable on knowledge-heavy or high-precision tasks. |
| 4 | **`2-planning-decomposition/a-plan-execute/`** (or any of the 2x leaves; they're byte-identical) | Recursive goal decomposition. | The only operator that turns a goal into a tree of sub-goals and synthesizes the leaves' results. ReWOO (2b in spec, deferred) brings batch-tool semantics but is not yet shipped. |
| 5 | **`4-peer-collaboration/a-debate/`** | Adversarial multi-persona consensus with round isolation. | The only operator that does cross-perspective debate: agents shape each other's answers across rounds. Distinct from MoA's blend (no cross-visibility) and from self-refine's self-judgment (single perspective). |
| 6 | **`4-peer-collaboration/b-moa/`** *(planned)* | Independent ensembling: N proposers under different system prompts, an aggregator blends. | Distinct from debate: in MoA proposers don't see siblings within a layer. The diversity comes from differing system prompts/models, not argumentation. Ships pending the per-prompt model-selection feature in the harness. |

### Why each excluded interpreter is excluded

| Interpreter | Excluded because |
|---|---|
| **`1-iterative-refinement/a-self-refine/`** | Same architectural shape as `1b` (draft → judge → revise) but with a less explicit judge interface. `1b` is the cleaner candidate; including both would consume two operator slots for one capability. |
| **Group 2 leaves `b-orchestrator-workers/` and `c-deep-research/`** | Byte-identical to `a-plan-execute/`, distinguished only by demo PROGRAM. Not separate operators — they're the same operator showcased on different inputs. |
| **`3-search/a-tot/`** and **`3-search/b-lats/`** | Phase 7 *is* a search (MCTS over candidate workflows). Including search interpreters as operators in its library would create searches-over-searches. The Phase 7 strategy *imports* MCTS helper code from `b-lats/INSTRUCTIONS.md`; it does not include `b-lats` as a building block. |
| **`5-fixed-sop-teams/a-metagpt/`** and **`b-chatdev/`** | End-to-end pipelines tied to "build a software project". Their internal SOPs (PM/Architect/Engineer/QA, design/coding/testing/documenting) are hard-coded for software construction; you cannot easily slot them into "solve a math word problem" or "answer a factual question". They're valuable as runnable artefacts that exercise shell features (typed hand-off, dialogue, file-aware evaluation), but they're not composable building blocks. |

### Final implementations

The interpreters above that *aren't* in the operator shortlist are still useful — they're **final implementations**: complete, runnable demonstrations of a pattern that you can launch as an instance and observe end-to-end. They're not building blocks for a meta-framework, but they are:

- **Pedagogical.** Each one is a clean, minimal embodiment of its pattern, useful for understanding the pattern's mechanics.
- **Comparison artefacts.** A-tot and b-lats both solve the same Game-of-24 puzzle so their search shapes can be diffed directly. MetaGPT and ChatDev both build the same `wc-plus` CLI tool so their hand-off styles can be diffed directly.
- **Shell-feature regression pins.** The fixed-SOP teams exercise typed hand-off, file-aware evaluation, and non-blocking pending questions — all shell features that other interpreters depend on.

When Phase 7 (`aflow-lite/`) ships, it will reference the operator shortlist above and treat the rest as out-of-library reference implementations.

---

## 4. Where to read next

| Want to... | Read |
|---|---|
| See the literature taxonomy and per-pattern citations | `docs/agent-workflows/patterns.md` |
| See the implementation roadmap and what's still planned | `docs/agent-workflows/requirements.md` |
| Understand a specific group's family-level architecture | `interpreters/<group>/README.md` |
| Run a specific interpreter and inspect its mechanics | `interpreters/<group>/<leaf>/README.md` |
| Understand the shell primitives (frames, push/return, scoped/) | `CLAUDE.md` (root) |
| See the meta-framework that will compose the operators above | `docs/agent-workflows/requirements.md` § Phase 7 (not yet shipped) |

To run any shipped interpreter:

```bash
./new-instance.sh my-instance interpreters/<group>/<leaf>
instances/my-instance/run.sh
```

The instance directory is self-contained; inspect `instances/my-instance/frames/f000-strategy/MEMORY.md` after the run for the final state.
