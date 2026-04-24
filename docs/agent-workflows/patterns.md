# Agentic patterns — a survey

A reference catalogue of LLM-agent design patterns and frameworks, organised
conceptually. Written as a standalone reading — it does not presuppose any
particular execution engine or harness.

The goal is to name the patterns, explain what each one does, and make the
relationships between them visible. Sources are listed at the end.

---

## How to read this document

Agentic patterns differ along two mostly-orthogonal axes.

**Axis A — What varies across execution.** The pattern's "unit of work".
- A single answer being refined.
- A plan being executed and adjusted.
- A search tree being expanded.
- A team being assembled and coordinated.
- A workflow being searched or evolved.

**Axis B — Who participates.**
- One role, reasoning with itself.
- Two fixed roles in a paired protocol.
- A fixed pipeline of specialists.
- A dynamically composed team.
- A meta-agent that produces other agents.

The groups below are defined primarily by Axis A. Axis B is noted per entry.

---

## Taxonomy at a glance

| Group | Core idea | Representative patterns |
|---|---|---|
| Building blocks — Prompting techniques | Squeeze more out of a single LLM call | CoT, Self-Consistency, ReAct, Self-Discover |
| 1. Iterative refinement | Rework the same answer until it is good | Self-Refine, Evaluator–Optimizer, Reflexion, Chain-of-Verification |
| 2. Planning & decomposition | Break the task, execute the parts | Plan-and-Execute (incl. Orchestrator–Workers, Deep Research, XAgent), ReWOO, Voyager, AutoGPT/BabyAGI, SWE-agent/OpenHands |
| 3. Search | Explore alternative solutions, prune | Tree of Thoughts, Graph of Thoughts, LATS |
| 4. Peer collaboration | Multiple roles work the same task from different angles | CAMEL, Multi-Agent Debate, Generative Agents, Mixture of Agents, SPP |
| 5. Fixed-SOP teams | Hard-coded pipeline of specialists | MetaGPT, ChatDev, nWave |
| 6. Dynamic teams | Roles assembled or generated per task | AgentVerse, AutoAgents, XAgents |
| 7. Meta-frameworks | The workflow itself is the output | AFlow, ADAS, EvoAgentX, DyLAN, GPTSwarm |
| 8. Libraries (not patterns) | Infrastructure that hosts the above | AutoGen, Superpowers, DSPy, LangGraph, CrewAI |
| Addenda | Patterns that straddle the taxonomy | MemGPT, Computer Use / Operator |

---

## Building blocks — Prompting techniques

Not agents. A single LLM call dressed up. Included because more complex
patterns cite them as baselines and because many higher-level patterns use
them as building blocks inside each call. Unnumbered because the rest of
the taxonomy is about agents — these are infrastructure for what follows.

### Chain-of-Thought (CoT)
Wei et al., 2022. Ask the model to reason step by step before answering.

### Self-Consistency
Wang et al., 2022. Sample N CoT traces, majority-vote the final answer.

### ReAct
*Yao et al., ICLR 2023 (arXiv:2210.03629).* Interleaves
`Thought: → Action: → Observation:` tuples in a single prompting loop. The
model reasons, picks a tool, sees the result, reasons again. Foundational
substrate for almost every tool-using agent (Plan-and-Execute, AutoGPT,
SWE-agent). If you had to name one prompting pattern that made modern
agents possible, this is it.

### Self-Discover
*Zhou et al., 2024 (arXiv:2402.03620).* The model selects, adapts, and
composes reasoning modules (decomposition, analogy, critique, …) into a
**task-specific reasoning structure** *before* solving. Structural
prompting: the scaffold is the output of the first stage.

---

## Group 1 — Iterative refinement

All four patterns in this group share a single shape:

> **generate → critique → revise**, repeated until a stop criterion is met.

They differ in *who critiques*, *what is remembered between iterations*, and
*how the critique is structured*. Calling them "different tiers" is a mistake
— they are variants of one architectural pattern.

### Self-Refine
*Madaan et al., NeurIPS 2023.* One role. The same model generates, critiques
its own output, and revises. Useful as the minimal case.

### Evaluator–Optimizer
*Anthropic, "Building Effective Agents", 2024.* Two roles (generator and
evaluator), separate prompts. Critique is external, structured feedback. No
memory across iterations beyond the feedback from the prior round.

### Reflexion
*Shinn et al., NeurIPS 2023. "Reflexion: Language Agents with Verbal
Reinforcement Learning".* Evaluator–Optimizer plus a **self-reflection** step
that distils each failed attempt into a verbal lesson stored in an episodic
memory. Next attempt starts with the accumulated lessons in context — "verbal
RL".

### Chain-of-Verification (CoVe)
*Dhuliawala et al., Meta, 2023.* Draft answer → generate verification
questions → answer each independently → revise the draft. The critique is
decomposed into standalone verification steps, reducing hallucination
contagion between the main answer and its checks.

### How they relate

| | Critic | Memory across iterations | Critique structure |
|---|---|---|---|
| Self-Refine | self | none | free-form |
| Evaluator–Optimizer | separate role | none | structured feedback |
| Reflexion | separate role | verbal lessons | feedback + lesson |
| Chain-of-Verification | self (decomposed) | none | verification Q&A |

---

## Group 2 — Planning & decomposition

The task is split into subtasks. Execution is sequential, recursive, or
delegated. Workers are typically generic (not distinct personas).

### Plan-and-Execute (includes Orchestrator–Workers, Deep Research, XAgent)
*Wang et al., 2023 ("Plan-and-Solve", arXiv:2305.04091); popularised by
LangChain; spiritual ancestor of AutoGPT and BabyAGI. Also: Anthropic,
"Building Effective Agents", 2024 ("Orchestrator–Workers"); OpenAI Deep
Research, Anthropic Research, Perplexity Pro (product pattern); academically
close to Self-Ask, Press et al., arXiv:2210.03350; OpenBMB / Tsinghua,
XAgent tech report, 2023.*

Four widely-cited framings of the same shape:
**decompose → per-unit execute (possibly recursive) → synthesise**.

- **Plan-and-Execute** (Wang et al.). A planner emits an ordered list of
  steps, an executor performs them one at a time, a replanner updates the
  list in light of each result. If a step is too coarse, it can spawn its
  own sub-plan.
- **Orchestrator–Workers** (Anthropic). A central LLM dynamically breaks
  the task down — subtasks are not pre-defined, they are determined by the
  orchestrator per input — delegates each to a worker, synthesises results.
  The "canonical fan-out" pattern.
- **Deep Research** (product pattern). Question → decompose into
  sub-questions → search/read/synthesise each → aggregate. Recursive when
  a sub-question is still too broad. Output is typically a report.
- **XAgent** (OpenBMB / Tsinghua). Three-component framing: **Dispatcher**
  routes subtasks, **Outer-Loop Planner** generates and rectifies the plan
  at any cycle (not just on step failure), **Inner-Loop Actor** executes
  tools in a sandbox. Its own paper describes it as "functionally a Plan-
  and-Execute with the planner/executor split explicit and the planner
  allowed to rewrite the plan at any time." The sandboxed execution is a
  tool-surface concern (cf. SWE-agent/OpenHands), orthogonal to the
  control flow. Compared against AutoGPT on ~50 real-world tasks.

The four framings differ in four prompting-level choices: (a) whether the
decomposition is materialised once up-front (Plan-and-Execute, XAgent) or
emitted subtask-by-subtask (Orchestrator–Workers); (b) whether per-unit
execution is a single executor or fan-out to generic workers (Orchestrator–
Workers); (c) whether the output is state-in-the-world or an aggregated
report (Deep Research); (d) how often replanning is invited — reactively on
failure (Plan-and-Execute) or at any cycle (XAgent). Under **sequential**
execution these differences collapse to prompting and output-channel
choices — sequential fan-out is indistinguishable from sequential single-
executor, on-the-fly decomposition and up-front planning with replans yield
identical traces, and report aggregation is a terminal synthesise step.
Fan-out becomes structurally distinct only when executed in parallel.

The genuinely distinct siblings below — ReWOO, Voyager, AutoGPT/BabyAGI,
SWE-agent/OpenHands — each add a mechanism the baseline lacks
(batched-placeholder execution, a permanent skill library, task-queue
simplification, or a curated tool surface).

### ReWOO
*Xu et al., 2023 (arXiv:2305.18323).* **R**easoning **W**ith**O**ut
**O**bservation. Emits a full plan up-front with placeholder tokens
(`#E1`, `#E2`, …) for tool outputs, executes all tools in a batch, then
substitutes the results before a final synthesis. Reduces token cost and
the cascade failures that interleaved ReAct suffers from when an early
observation derails later reasoning.

### Voyager
*Wang et al., NVIDIA, 2023 (arXiv:2305.16291).* Lifelong learning agent in
Minecraft. Three components: an **automatic curriculum** that picks the
next skill to learn, a **skill library** of callable code (each skill is
saved as a JavaScript function), and an iterative prompting loop that
refines a skill by running it in the environment and incorporating the
error traceback. Canonical "skill library" pattern — the only Group 2
member in which successful subtasks are **permanently installed** and
reused on later tasks.

### AutoGPT / BabyAGI
*Richards, 2023; Nakajima, 2023.* Community projects that turned LLM
agents into a mainstream topic. **AutoGPT** = task queue + executor +
objective. **BabyAGI** = create-task / execute-task / prioritise-task
cycle. Both are simpler and less principled than Plan-and-Execute, but
historically the spark: they showed that a loop of LLM calls with tool
access plus a persistent TODO list produces surprisingly useful
behaviour.

### SWE-agent / OpenHands
*Yang et al., Princeton, 2024 (arXiv:2405.15793); OpenHands (formerly
OpenDevin) 2024 community project.* Coding-specific agents. Main
contribution is the **Agent–Computer Interface (ACI)**: a deliberately
small, LLM-ergonomic tool set (file viewer with scroll, edit-at-line,
directory search, bash) rather than raw shell access. Strong SWE-bench
performance without novel planning — the lesson is that **tool surface
design matters as much as the planner**.

---

## Group 3 — Search

Explicit exploration of alternative solutions. Distinct from iteration
(Group 1, which improves one solution) and from decomposition (Group 2,
which splits the task without branching).

### Tree of Thoughts (ToT)
*Yao et al., NeurIPS 2023.* At each step, generate k candidate "thoughts",
evaluate their value, expand the best (BFS or DFS), prune weak branches.
Strongest on problems with a clear value function (Game of 24, small
puzzles, constrained code search).

### Graph of Thoughts (GoT)
*Besta et al., 2023 (arXiv:2308.09687).* Generalises ToT by allowing
thoughts to form an arbitrary **DAG** instead of a tree. Edges are typed
operations — generate, aggregate, refine, backtrack — so independently
explored branches can be merged. Expresses strategies ToT cannot, such
as "solve two sub-problems in parallel, then combine".

### LATS — Language Agent Tree Search
*Zhou et al., 2023 (arXiv:2310.04406).* **MCTS** over ToT-style thoughts,
with Reflexion-style self-reflection at evaluation time and environment
feedback as the reward signal. A three-way crossover of Group 3 (ToT),
Group 1 (Reflexion), and Group 7 (tree search as meta-loop). Typically
stronger than plain ToT when the environment returns executable
feedback.

---

## Group 4 — Peer collaboration

Multiple agents work **the same task** from different angles. The task is
not decomposed; perspectives are multiplied.

### CAMEL
*Li et al., NeurIPS 2023.* Two LLMs with locked roles: **AI user** gives
instructions, **AI assistant** executes. Driven by a task prompt that
establishes the pair (e.g. Python programmer + stock trader). Purely
conversational.

### Multi-Agent Debate
*Du et al., 2023; with antecedents in Irving et al., 2018.* N agents produce
answers, read each other's, revise for one or more rounds. Convergence by
mutual critique. Known to improve factuality on knowledge-heavy tasks.

### Generative Agents
*Park et al., Stanford, 2023 (arXiv:2304.03442).* The "Smallville" paper.
Each agent keeps a **memory stream** (a timestamped log of observations
and actions), runs a **reflection** step that summarises the stream into
higher-order insights, and a **planning** step conditioned on both. Goal
is believable simulation rather than task-solving, but the memory+
reflection+planning triple is now a reference architecture for any
long-running persona-based agent.

### Mixture of Agents (MoA)
*Wang et al., 2024 (arXiv:2406.04692).* Layered architecture: N
**proposer** LLMs independently answer the prompt, an **aggregator** LLM
synthesises them, and layers can be stacked so one layer's aggregate is
the next layer's prompt. Agents within a layer do **not** see each other
(unlike Debate) — ensembling rather than argumentation. Reported SOTA on
AlpacaEval using open models.

### Solo Performance Prompting (SPP)
*Wang et al., 2023 (arXiv:2307.05300).* A single LLM dynamically
identifies useful personas for the task and stages a "conversation"
among them inside one context window. The single-agent limit of Group 4
— peer collaboration without actually spawning peers. Useful when
multi-agent infrastructure is unavailable.

---

## Group 5 — Fixed-SOP teams

Roles and phases are hard-coded by the framework author. The task walks a
predetermined pipeline. Distinct from Group 6 (dynamic teams) in that the
cast is known before the task begins.

### MetaGPT
*Hong et al., ICLR 2024.* Software-company SOP: Product Manager → Architect
→ Project Manager → Engineer → QA. Each role consumes and produces
standardised documents (PRD, design spec, task list, code, review). The
contract between roles is document shape, not conversation.

### ChatDev
*Qian et al., 2023.* Same idea, different protocol: each phase is a
**dialogue** between two roles — CEO ↔ CTO for design, coder ↔ reviewer for
coding, etc. Phases: design, coding, testing, documenting. ChatDev's atom
is a conversation; MetaGPT's is a hand-off.

### nWave
Open-source framework (`nwave.ai`, `github.com/nWave-ai/nWave`). Seven
sequential **waves** — discover, diverge, discuss, design, devops, distill,
deliver — each ending in a human-reviewable artefact. ~40 specialised
agents, TDD + peer review + mutation testing mandated. The most
production-oriented framework in this group; assumes a human in the loop
between waves.

---

## Group 6 — Dynamic teams

Roles are assembled, recruited, or generated **per task** at runtime.
Shares "split the work" with Group 2 but adds "the participants are distinct
personas", and shares "multiple personas" with Group 4 but adds "the task is
decomposed".

### AgentVerse
*Chen et al., 2023.* Expert **recruitment**: a recruiter agent inspects the
task and chooses which specialists to convene from a library, then runs a
collaborative phase and a verification phase.

### AutoAgents
*Chen et al., IJCAI 2024.* Dynamically **generates** task-specific agents —
role descriptions and toolsets are synthesised for the task at hand — plus
an **Observer** role that reflects on plans and agent outputs and iterates.
The first framework in this list in which the agent library is produced by
the framework itself.

### XAgents (plural)
*Hailong Yang et al., Jiangnan Univ., 2024.* Distinct from XAgent
(singular). Rule-based **IF-THEN** multi-agent cooperation: Domain Analyst,
Domain Expert, Fusion, Global Expert. Explicit symbolic rules govern role
interaction.

---

## Group 7 — Meta-frameworks

The framework does not solve the task. It **produces or optimises a
workflow** that then solves the task. The workflow is the output.

### AFlow
*Zhang et al., ICLR 2025 Oral (arXiv:2410.10762), DeepWisdom / MetaGPT team.*
Workflow = code-represented graph of **nodes** (LLM invocations with
prompt, temperature, output format) connected by edges, grouped into
reusable **Operators** (Ensemble, Review, Revise, …). Search is **Monte
Carlo Tree Search** over the workflow space: soft mixed-probability
selection, LLM-driven expansion of nodes, execution-based evaluation,
experience back-propagation. Smaller models beat GPT-4o on HumanEval at
~4.5% of the cost. Named in the spirit of Apache Airflow. Baselines: IO,
CoT, Self-Consistency, MultiPersona Debate, Self-Refine, MedPrompt, ADAS.

### ADAS — Automated Design of Agentic Systems
*Hu, Lu, Clune, ICLR 2025 (arXiv:2408.08435).* **Meta Agent Search.** A
meta-agent iteratively writes **new agents in code**, tests them on a task
distribution, archives the strong ones, builds on the archive. Exploits
Turing-completeness — any agent design can in principle be discovered. The
philosophically strongest version of "the system designs itself".

### EvoAgentX
*Yingxu Wang et al., EMNLP 2025 Demos (arXiv:2507.03616).* Open-source
platform that **evolves** multi-agent workflows. Integrates AFlow +
TextGrad + MIPRO to refine prompts, tools, and workflow topology. Super-set
of AFlow in scope.

### DyLAN — Dynamic LLM-Agent Network
*Liu, Zhang, Li, Y. Liu, D. Yang, COLM 2024 (arXiv:2310.02170).* Constructs
a task-specific agent team **and inference graph** per query. Graph-based
(not tree-based). Close sibling of GPTSwarm.

### GPTSwarm
*Zhuge et al., ICML 2024.* Agents are nodes in a compositional
**swarm graph**; edges carry messages. A node-selection policy is
parameterised and optimised by **gradient descent** using
reward-weighted likelihood (REINFORCE-style). First meta-framework to
bring backprop-style optimisation to agent topology — the prompts stay
fixed, the wiring is learned.

---

## Group 8 — Libraries / harnesses (infrastructure)

Not patterns. They host patterns.

### AutoGen
*Microsoft, 2023.* Library of "conversable agents" with arbitrary roles
(UserProxy, Assistant, GroupChatManager). Graph of messages, not a specific
protocol. Hosts Group 4 (peer collaboration) and Group 6 (dynamic teams)
cleanly.

### Superpowers
*Jesse Vincent (obra), 2025.* Claude Code plugin encoding a set of **skills**
(composable methodology modules): strict red/green/refactor TDD, 4-phase
systematic debugging (root cause before fix), Socratic brainstorming
pre-code, a meta-skill for authoring new skills. Accepted into the official
Claude plugin marketplace. More a **methodology registry** than an agent
design.

### DSPy
*Khattab et al., Stanford, 2023–.* Programs declare **signatures** (typed
input→output specs) and **modules** (Predict, ChainOfThought, ReAct, …);
**compilers** (BootstrapFewShot, MIPROv2) auto-optimise prompts and
few-shot examples against a metric on a training set. Treats prompting
as programming. Arguably also a Group 7 entry — it does optimise a
workflow — but the "programming framework with a compiler" framing is
what makes it distinctive.

### LangGraph
*LangChain Inc., 2024.* Graph-based orchestration library: explicit
state machine with typed nodes, conditional edges, checkpointing, and
human-in-the-loop pauses. The dominant production harness for Groups
1–6; effectively the "Airflow of agentic workflows".

### CrewAI
*Moura, 2024.* Multi-agent orchestration library built around **crews**
of agents with roles, goals, and tasks. A simpler take on AutoGen's
conversable-agents model, with more opinionated defaults.

---

## Addenda — patterns that straddle the taxonomy

Two entries that do not fit the eight groups cleanly. They are included
because any honest survey has to name them.

### MemGPT
*Packer et al., 2023 (arXiv:2310.08560).* **Virtual context management**
modelled on OS virtual memory. The LLM issues explicit operations —
`recall`, `save`, `page-in`, `page-out` — against a tiered memory (main
context, recall buffer, archival store). Memory becomes **architectural**
rather than a concatenated prompt prefix. Orthogonal to every other
group: any planner or team can sit on top of a MemGPT-style memory.

### Computer Use / Operator
*Anthropic, 2024; OpenAI, 2025.* Agents that operate a real computer via
screenshots + mouse/keyboard actions. A **modality**, not a pattern: any
planning scheme (ReAct, Plan-and-Execute, Reflexion, …) can drive it.
Worth naming because the tool surface imposes its own constraints
(screen parsing, latency, partial observability, non-determinism) that
deserve separate treatment in any full review.

---

## Cross-cutting patterns worth naming

Several design moves recur across groups and deserve names of their own:

- **Evaluator as a reusable component.** A separate-role evaluator shows up
  in Evaluator–Optimizer, Reflexion, MetaGPT's QA, AgentVerse's verifier,
  and AFlow's execution scorer. Treat it as a pluggable sub-pattern.
- **Planner / executor split.** Plan-and-Execute — covering its
  Orchestrator–Workers, Deep Research, and XAgent framings — separates
  "decide what to do" from "do it". The split is what makes replanning
  possible.
- **Memory of prior attempts.** Reflexion adds it to Group 1. ADAS adds it
  to Group 7 (the agent archive). Most other patterns operate stateless.
- **Workflow as data.** AFlow, ADAS, EvoAgentX, DyLAN all treat the workflow
  as a first-class object — code, graph, or prompt — that can be searched
  over or evolved. This is the single biggest conceptual jump in the
  taxonomy.

---

## Sources

- **AFlow** — Zhang et al. arXiv:2410.10762. Repo: `FoundationAgents/AFlow`.
- **ADAS** — Hu, Lu, Clune. arXiv:2408.08435.
- **EvoAgentX** — Wang et al. arXiv:2507.03616.
- **DyLAN** — Liu et al. arXiv:2310.02170.
- **AutoAgents** — Chen et al. arXiv:2309.17288, IJCAI 2024.
- **XAgent** — `github.com/OpenBMB/XAgent`; technical report, 2023.
- **XAgents (plural)** — Yang et al. arXiv:2411.13932; successor arXiv:2509.10054.
- **Reflexion** — Shinn et al. arXiv:2303.11366.
- **Self-Refine** — Madaan et al. arXiv:2303.17651.
- **Chain-of-Verification** — Dhuliawala et al. arXiv:2309.11495.
- **Tree of Thoughts** — Yao et al. arXiv:2305.10601.
- **Plan-and-Solve** — Wang et al. arXiv:2305.04091.
- **CAMEL** — Li et al. arXiv:2303.17760.
- **MetaGPT** — Hong et al. arXiv:2308.00352.
- **ChatDev** — Qian et al. arXiv:2307.07924.
- **AgentVerse** — Chen et al. arXiv:2308.10848.
- **Multi-Agent Debate** — Du et al. arXiv:2305.14325.
- **Self-Ask** — Press et al. arXiv:2210.03350.
- **ReWOO** — Xu et al. arXiv:2305.18323.
- **GPTSwarm** — Zhuge et al. ICML 2024.
- **Anthropic, "Building Effective Agents"** — `anthropic.com/research/building-effective-agents`.
- **Superpowers** — `github.com/obra/superpowers`.
- **nWave** — `nwave.ai`, `github.com/nWave-ai/nWave`.
- **AutoGen** — `github.com/microsoft/autogen`.
- **ReAct** — Yao et al. arXiv:2210.03629.
- **Self-Discover** — Zhou et al. arXiv:2402.03620.
- **Voyager** — Wang et al. arXiv:2305.16291.
- **AutoGPT** — `github.com/Significant-Gravitas/AutoGPT`.
- **BabyAGI** — `github.com/yoheinakajima/babyagi`.
- **SWE-agent** — Yang et al. arXiv:2405.15793. `github.com/SWE-agent/SWE-agent`.
- **OpenHands** — `github.com/All-Hands-AI/OpenHands`.
- **Graph of Thoughts** — Besta et al. arXiv:2308.09687.
- **LATS** — Zhou et al. arXiv:2310.04406.
- **Generative Agents** — Park et al. arXiv:2304.03442.
- **Mixture of Agents** — Wang et al. arXiv:2406.04692.
- **Solo Performance Prompting** — Wang et al. arXiv:2307.05300.
- **MemGPT** — Packer et al. arXiv:2310.08560.
- **DSPy** — Khattab et al. `github.com/stanfordnlp/dspy`.
- **LangGraph** — `langchain-ai.github.io/langgraph/`.
- **CrewAI** — `github.com/crewAIInc/crewAI`.
- **Computer Use** — `anthropic.com/news/3-5-models-and-computer-use`.
- **Operator** — `openai.com/index/introducing-operator/`.
