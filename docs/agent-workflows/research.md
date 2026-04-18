# Agentic workflow patterns — research notes

Survey of existing agentic patterns and frameworks to inform which
interpreters to build on top of the Turing-machine shell (cycle loop + push/pop
call stack, see `../../CLAUDE.md`).

The goal is to adopt established patterns rather than invent new ones. Every
entry below includes a mapping to the shell's primitives: **strategy**
(`INSTRUCTIONS.md`), **dynamics** (pushed instruction files), **memory
sections** (how the caller hands context to the dynamic), and expected **stack
depth**.

---

## Taxonomy

Two orthogonal axes.

### Axis A — Level of abstraction (L0 → L7)

Ordered from "single prompt trick" to "framework that writes frameworks".

| Level | What it is | Examples |
|---|---|---|
| L0 | Prompting technique (single LLM call, no agent) | CoT, Self-Consistency, Self-Refine, Chain-of-Verification |
| L1 | Single-agent loop with memory/reflection | Reflexion, Plan-and-Execute |
| L2 | Explicit search over solutions | Tree of Thoughts, Deep Research |
| L3 | Two fixed roles | CAMEL, Evaluator–Optimizer |
| L4 | Multi-agent team with hard-coded SOP | MetaGPT, ChatDev, nWave |
| L5 | Multi-agent team with dynamic composition | Orchestrator–Workers, AgentVerse, AutoAgents, XAgent, Multi-Agent Debate |
| L6 | Meta-framework: the workflow itself is the output | AFlow, ADAS, EvoAgentX, DyLAN |
| L7 | Library/harness (not a pattern, infrastructure) | AutoGen, Superpowers |

### Axis B — Who decides the workflow

- **Author** (hard-coded): MetaGPT, ChatDev, nWave, CAMEL, Self-Refine, CoVe.
- **LLM at runtime** (emergent from task): Plan-Execute, Orchestrator-Workers, AutoAgents, XAgent, AgentVerse.
- **Search/optimisation process** (offline or online): AFlow, ADAS, EvoAgentX, DyLAN.

### Axis B' — Stack-depth pressure on the shell

| Topology | Examples | Typical depth |
|---|---|---|
| Flat iterative loop | Self-Refine, Reflexion, Evaluator-Optimizer, CoVe | 1 |
| Fixed pipeline | MetaGPT, ChatDev, nWave | 1 (serial) |
| Tree / recursion | ToT, Deep Research, CoVe's verify→answer nested | N |
| Planner + executor | Plan-Execute, XAgent | 1–2 |
| Dynamic fan-out | Orchestrator-Workers, AgentVerse, AutoAgents | 1 wide |
| Conversation | CAMEL, AutoGen, Debate | 0 (ping-pong, not nested calls) |
| Meta over workflow | AFlow, ADAS, EvoAgentX, DyLAN | 2+ (meta-loop above task-loop) |

---

## L0 — Prompting techniques

These are not agents. They live inside the shell as **reusable dynamics** that
any higher-level interpreter can push.

### Self-Refine
*Madaan et al., NeurIPS 2023.* Same model generates → critiques → refines,
iteratively, until a stop criterion is met.

- **Push target:** `dynamics/self-refine.md`.
- **Caller contract:** writes `## Draft` to MEMORY before pushing.
- **Return contract:** dynamic writes `## Refined` and sets state `done`.
- **Depth:** 1.

### Chain-of-Verification (CoVe)
*Dhuliawala et al., Meta, 2023.* Draft answer → generate verification questions
→ answer each independently → revise. Reduces hallucination.

- **Push target:** `dynamics/verify.md`.
- **Nesting:** internally pushes `dynamics/answer-independently.md` per
  question ⇒ depth 2.

### CoT / Self-Consistency
*Wei et al., 2022; Wang et al., 2022.* Explicit reasoning, optionally voted
across N samples. No stack needed — these are prompt affordances, not
dynamics. Record here only because AFlow uses them as baselines.

---

## L1 — Single-agent loops

### Reflexion
*Shinn et al., NeurIPS 2023. "Reflexion: Language Agents with Verbal
Reinforcement Learning".*

Actor attempts a task → Evaluator judges → Self-Reflection produces a verbal
lesson → Actor retries with the lesson in memory. The lesson persists across
attempts (episodic memory).

- **Strategy:** Actor loop.
- **Dynamics:** `evaluate.md` (push after each attempt, pop with verdict);
  `reflect.md` (push when evaluate fails, pop with lesson written to MEMORY).
- **Caller state consumes `{state}_completed`** as per shell convention.
- **Depth:** 1 (2 at the most, if reflect pushes evaluate).

### Plan-and-Execute
*Wang et al., 2023 (Plan-and-Solve); LangChain implementation; conceptual
ancestor of AutoGPT/BabyAGI.*

Planner emits ordered step list → Executor performs one step → Replanner
updates the list in light of the result. Each step is a subroutine; if a step
is too coarse, the executor itself pushes a sub-planner (natural recursion).

- **Strategy:** planner/replanner, keeps `## Plan` in MEMORY.
- **Dynamics:** `execute-step.md` (parameterised via `## Current Step`).
- **Recursion:** execute-step may push another plan-execute frame.
- **Depth:** variable, driven by task decomposition.

---

## L2 — Search over solutions

### Tree of Thoughts (ToT)
*Yao et al., NeurIPS 2023.* At each step, generate k candidate "thoughts",
evaluate their value, expand the best (BFS/DFS), prune weak branches.

- **Strategy:** search controller holding frontier in MEMORY.
- **Dynamics:** `expand-node.md` (push per node, pop with value + children).
- **Git trick:** the project-git inside `workspace/` can snapshot alternative
  branches (one git branch per ToT branch), matching what game-team already
  did for parallel exploration.
- **Depth:** equal to the search depth.

### Deep Research (product pattern)
No single canonical paper; closest academic kin is *Self-Ask* (Press et al.)
and *ReWOO* (Xu et al.). The pattern is now visible in OpenAI Deep Research,
Anthropic Research, and Perplexity Pro.

Question → decompose into sub-questions → for each, search/read/synthesise →
aggregate into final report. Recursive when a sub-question is still too broad.

- **Strategy:** researcher holding `## Open Questions` and `## Findings`.
- **Dynamics:** `investigate.md` (may push itself recursively);
  `synthesize.md` for the final write-up.
- **Output:** a report file inside `workspace/`.
- **Depth:** dictated by question granularity.

---

## L3 — Two fixed roles

### CAMEL
*Li et al., NeurIPS 2023. "Communicative Agents for Mind Exploration".*

Two LLMs with locked roles — **AI user** gives instructions, **AI assistant**
executes — driven by a task prompt. Purely conversational; maps weakly onto
the stack.

- **Possible mapping:** `dynamics/ai-user-turn.md` and
  `dynamics/ai-assistant-turn.md` alternated by strategy. Or skip the stack
  entirely and implement it as a single interpreter with two states.
- **Depth:** 0–1.

### Evaluator–Optimizer
*Anthropic, "Building Effective Agents", 2024.* Generator produces output,
evaluator gives structured feedback, generator revises. Loop until accepted.

- **Strategy:** Generator.
- **Dynamics:** `evaluate.md` (reusable with Reflexion).
- **Vs. Reflexion:** no long-term memory of lessons — simpler and cleaner for
  tasks with a crisp acceptance criterion.
- **Depth:** 1.

---

## L4 — Multi-agent team with hard-coded SOP

This is the territory `interpreters/game-team` currently occupies, and which
is being replaced. These frameworks are *not* optional — they are mainstream
production patterns and must be represented.

### MetaGPT
*Hong et al., ICLR 2024.* Software house SOP: Product Manager → Architect →
Project Manager → Engineer → QA. Each role consumes and produces standardised
documents (PRD, design spec, tasks, code, tests).

- **Strategy:** SOP driver that walks the role chain.
- **Dynamics:** one per role — `pm.md`, `architect.md`, `engineer.md`,
  `qa.md`. Each reads a named MEMORY section produced by the prior role and
  writes its own.
- **Contract between roles:** typed by document shape, not by conversation.
- **Why adopt:** well-known baseline, frequently cited.

### ChatDev
*Qian et al., 2023.* Similar roles, different protocol: each phase is a
**dialogue** between two roles (e.g. CEO ↔ CTO for design, coder ↔ reviewer
for coding). Phases: design, coding, testing, documenting.

- **Strategy:** phase sequencer.
- **Dynamics:** `dialogue.md` parameterised by `{roleA, roleB, topic}` in
  MEMORY.
- **Depth:** 1.
- **Contrast with MetaGPT:** ChatDev's atom is a *conversation*, MetaGPT's is
  a *document hand-off*.

### nWave
*Open-source framework on top of Claude Code — `nwave.ai`,
`github.com/nWave-ai/nWave`.* Seven sequential "waves" (discover, diverge,
discuss, design, devops, distill, deliver), each ending in a human-reviewable
artifact. ~40 specialised agents. TDD + peer review + mutation testing
mandatory.

- **Strategy:** 7-state machine over the waves.
- **Dynamics:** one per wave; each wave internally pushes role dynamics.
- **Depth:** 2 (wave → role).
- **Why adopt:** it is the most production-minded L4 framework and maps
  cleanly to the "human in the loop after each wave" style the shell already
  supports via `waiting_for_user`.

---

## L5 — Multi-agent team with dynamic composition

Roles are not pre-assigned by the framework author; they emerge from the task
at runtime. This is the **sweet spot for the shell's stack**: dynamic fan-out
with clean push/pop.

### Orchestrator–Workers
*Anthropic, "Building Effective Agents", 2024.* Canonical pattern. An
orchestrator LLM decomposes a task into subtasks **dynamically** (unlike
MetaGPT's fixed chain), delegates each to a worker LLM, synthesises results.

- **Strategy:** orchestrator holding `## Subtasks` and `## Results` in MEMORY.
- **Dynamics:** generic `worker.md`, parameterised via `## Current Subtask`.
- **Depth:** 1, but wide (many sequential pushes).
- **Future:** trivially generalises to parallel workers once the shell
  supports multiple stack frames — today it runs them in sequence.

### AgentVerse
*Chen et al., 2023.* **Expert recruitment**: a recruiter agent inspects the
task and chooses which specialists to convene, then runs a collaborative
phase, then verifies.

- **Strategy:** recruiter + coordinator.
- **Dynamics:** `expert.md` parameterised by role description.
- **Depth:** 1.

### AutoAgents
*Chen et al., IJCAI 2024, arXiv:2309.17288.* Dynamically **generates**
task-specific agents (role descriptions + toolsets), plus an **Observer** that
reflects on plans and agent outputs, iteratively improving them.

- **Strategy:** agent-generator + observer.
- **Dynamics:** `generated-agent.md` (constructed on the fly, written to disk,
  then pushed).
- **Depth:** 2 (observer wraps generation + execution).
- **Note:** this is the first framework in the list where the **dynamic
  itself is synthesised by the LLM** — a direct use of the shell's
  `update_instructions` tool plus a pre-push write.

### XAgent
*OpenBMB / Tsinghua, 2023. Tech report, not arXiv.* Three components:
**Dispatcher** assigns subtasks; **Outer-Loop Planner** generates and
rectifies the plan; **Inner-Loop Actor** executes via tools in a sandbox.
Compares to AutoGPT on ~50 real tasks.

- **Strategy:** Outer Planner.
- **Dynamics:** `actor.md` (push per subtask, pop with result);
  `replan.md` (push when actor reports deviation).
- **Depth:** 1–2.
- **Repo:** `github.com/OpenBMB/XAgent`.

### XAgents (plural, distinct paper)
*Hailong Yang et al., Jiangnan Univ., arXiv:2411.13932 (Nov 2024), successor
arXiv:2509.10054 (Sept 2025).* Rule-based IF-THEN multi-agent cooperation:
Domain Analyst / Domain Expert / Fusion / Global Expert.

Less about workflow generation, more about explicit rule-governed
cooperation. Listed for completeness; lower priority than XAgent (singular).

### Multi-Agent Debate
*Du et al., 2023; Irving et al., 2018.* N agents produce answers, read each
other's, revise. Convergence by mutual critique.

- **Strategy:** round coordinator holding `## Opinions` list.
- **Dynamics:** `opine.md` (push per participant, per round).
- **Depth:** 1, many pushes.

---

## L6 — Meta-frameworks

The framework does not directly solve the task. It produces or optimises a
workflow that then solves the task. These are the most ambitious mappings onto
the shell because a meta-loop sits above a task-loop.

### AFlow
*Zhang et al., arXiv:2410.10762, ICLR 2025 Oral. DeepWisdom / MetaGPT team.*

Workflow = code-represented graph of **nodes** (LLM invocations with
prompt/temperature/format) connected by edges, grouped into reusable
**Operators** (Ensemble, Review, Revise, …). **Monte Carlo Tree Search** over
the workflow space: soft mixed-probability selection, LLM-driven node
expansion, execution evaluation, experience back-propagation.

Reports smaller models beating GPT-4o on HumanEval at 4.55% of the cost.

- **Baselines compared** (natural candidates for our benchmark): IO, CoT,
  Self-Consistency CoT, MultiPersona Debate, Self-Refine, MedPrompt, ADAS.
- **Shell mapping:** meta-strategy holds the MCTS tree in MEMORY; dynamic
  `evaluate-workflow.md` pushed per candidate workflow — it materialises the
  candidate as a throwaway `INSTRUCTIONS.md` and runs it via a nested shell
  invocation.
- **Name inspiration:** Apache Airflow (older workflow-orchestration tool).
- **Repo:** `FoundationAgents/AFlow`.

### ADAS — Automated Design of Agentic Systems
*Hu, Lu, Clune, arXiv:2408.08435, ICLR 2025.* **Meta Agent Search**: a
meta-agent iteratively **programs new agents in code**, tests them on a task
distribution, archives the strong ones, builds on prior archive. Exploits
Turing-completeness to discover arbitrary designs.

- **Shell mapping:** philosophically the closest to this project. A
  meta-interpreter that writes new interpreters (literally generating new
  `INSTRUCTIONS.md` files into `interpreters/` at runtime).
- **Depth:** 2 (meta-loop wraps per-agent evaluation).

### EvoAgentX
*Yingxu Wang (MBZUAI) et al., arXiv:2507.03616, EMNLP 2025 Demos.* Open-source
platform that **evolves** multi-agent workflows. Integrates AFlow +
TextGrad + MIPRO to refine prompts, tools, and workflow topology. Effectively
a super-set of AFlow.

### DyLAN — Dynamic LLM-Agent Network
*Liu, Zhang, Li, Y. Liu, D. Yang — arXiv:2310.02170, COLM 2024.*
Constructs a **task-specific agent team and inference graph per query**.
Graph-based, not tree-based. Shares DNA with GPTSwarm.

---

## L7 — Libraries / harnesses (not patterns)

Listed for completeness, not candidates for interpreters.

- **AutoGen** (Microsoft, 2023) — conversable-agents library. Ruoli arbitrari,
  graph di messaggi. More framework-than-pattern.
- **Superpowers** (Jesse Vincent / obra) — Claude Code plugin encoding skills
  + methodologies (strict red/green/refactor TDD, 4-phase debugging with
  root-cause before fix, Socratic brainstorming pre-code). A **skills
  registry** rather than a single agent design. Its skills map 1:1 onto the
  shell's dynamics — it is a useful **source of reusable dynamic content**
  (e.g. a debugging dynamic directly modelled on Superpowers' 4-phase flow).
- **nWave** could also be read as L7 depending on viewpoint; filed under L4
  because its SOP is hard-coded.

---

## Cross-reference: what replaces what in this repo

| Old | Replaced by |
|---|---|
| `interpreters/game-team` (fuzzy NL conditions, hard-coded roles, user-as-peer) | Rebuilt at L4 as MetaGPT- and/or ChatDev-shaped interpreters. Fuzzy conditions and non-blocking user questions are kept (they are shell-level features, not game-team features). |

---

## Source pointers

- AFlow: arXiv:2410.10762, repo `FoundationAgents/AFlow`.
- ADAS: arXiv:2408.08435.
- EvoAgentX: arXiv:2507.03616.
- AutoAgents: arXiv:2309.17288.
- DyLAN: arXiv:2310.02170.
- XAgent: `github.com/OpenBMB/XAgent`.
- XAgents: arXiv:2411.13932, arXiv:2509.10054.
- Reflexion: arXiv:2303.11366.
- Self-Refine: arXiv:2303.17651.
- Chain-of-Verification: arXiv:2309.11495.
- Tree of Thoughts: arXiv:2305.10601.
- Plan-and-Solve: arXiv:2305.04091.
- CAMEL: arXiv:2303.17760.
- MetaGPT: arXiv:2308.00352.
- ChatDev: arXiv:2307.07924.
- AgentVerse: arXiv:2308.10848.
- Multi-Agent Debate: arXiv:2305.14325.
- Anthropic "Building Effective Agents": `anthropic.com/research/building-effective-agents`.
- Superpowers: `github.com/obra/superpowers`.
- nWave: `nwave.ai`, `github.com/nWave-ai/nWave`.
