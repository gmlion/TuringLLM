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
| 1. Prompting techniques | Squeeze more out of a single LLM call | CoT, Self-Consistency |
| 2. Iterative refinement | Rework the same answer until it is good | Self-Refine, Evaluator–Optimizer, Reflexion, Chain-of-Verification |
| 3. Planning & decomposition | Break the task, execute the parts | Plan-and-Execute, Deep Research, Orchestrator–Workers, XAgent |
| 4. Search | Explore alternative solutions, prune | Tree of Thoughts |
| 5. Peer collaboration | Multiple roles work the same task from different angles | CAMEL, Multi-Agent Debate |
| 6. Fixed-SOP teams | Hard-coded pipeline of specialists | MetaGPT, ChatDev, nWave |
| 7. Dynamic teams | Roles assembled or generated per task | AgentVerse, AutoAgents, XAgents |
| 8. Meta-frameworks | The workflow itself is the output | AFlow, ADAS, EvoAgentX, DyLAN |
| 9. Libraries (not patterns) | Infrastructure that hosts the above | AutoGen, Superpowers |

---

## Group 1 — Prompting techniques

Not agents. A single LLM call dressed up. Included because more complex
patterns cite them as baselines and because many higher-level patterns use
them as building blocks inside each call.

### Chain-of-Thought (CoT)
Wei et al., 2022. Ask the model to reason step by step before answering.

### Self-Consistency
Wang et al., 2022. Sample N CoT traces, majority-vote the final answer.

---

## Group 2 — Iterative refinement

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

## Group 3 — Planning & decomposition

The task is split into subtasks. Execution is sequential, recursive, or
delegated. Workers are typically generic (not distinct personas).

### Plan-and-Execute
*Wang et al., 2023 ("Plan-and-Solve"); popularised by LangChain; spiritual
ancestor of AutoGPT and BabyAGI.* A planner emits an ordered list of steps,
an executor performs them one at a time, a replanner updates the list in
light of each result. If a step is too coarse, it can spawn its own
sub-plan.

### Deep Research
Product pattern (OpenAI Deep Research, Anthropic Research, Perplexity Pro);
academically close to *Self-Ask* (Press et al.) and *ReWOO* (Xu et al.).
Question → decompose into sub-questions → search/read/synthesise each →
aggregate. Recursive when a sub-question is still too broad. Output is
typically a report.

### Orchestrator–Workers
*Anthropic, "Building Effective Agents", 2024.* An orchestrator LLM
decomposes the task **dynamically** (unlike MetaGPT's fixed chain), delegates
each subtask to a worker, synthesises results. The canonical "fan-out"
pattern.

### XAgent
*OpenBMB / Tsinghua, tech report 2023.* Three components: **Dispatcher**
routes subtasks; **Outer-Loop Planner** generates and rectifies the plan;
**Inner-Loop Actor** executes via tools in a sandbox. Functionally a Plan-
and-Execute with the planner/executor split explicit and the planner
allowed to rewrite the plan at any time. Compared against AutoGPT on ~50
real-world tasks.

---

## Group 4 — Search

Explicit exploration of alternative solutions. Distinct from iteration
(Group 2, which improves one solution) and from decomposition (Group 3,
which splits the task without branching).

### Tree of Thoughts (ToT)
*Yao et al., NeurIPS 2023.* At each step, generate k candidate "thoughts",
evaluate their value, expand the best (BFS or DFS), prune weak branches.
Strongest on problems with a clear value function (Game of 24, small
puzzles, constrained code search).

---

## Group 5 — Peer collaboration

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

---

## Group 6 — Fixed-SOP teams

Roles and phases are hard-coded by the framework author. The task walks a
predetermined pipeline. Distinct from Group 7 (dynamic teams) in that the
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

## Group 7 — Dynamic teams

Roles are assembled, recruited, or generated **per task** at runtime.
Shares "split the work" with Group 3 but adds "the participants are distinct
personas", and shares "multiple personas" with Group 5 but adds "the task is
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

## Group 8 — Meta-frameworks

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
(not tree-based). Shares DNA with GPTSwarm (Zhuge et al., ICML 2024).

---

## Group 9 — Libraries / harnesses (infrastructure)

Not patterns. They host patterns.

### AutoGen
*Microsoft, 2023.* Library of "conversable agents" with arbitrary roles
(UserProxy, Assistant, GroupChatManager). Graph of messages, not a specific
protocol. Hosts Group 5 (peer collaboration) and Group 7 (dynamic teams)
cleanly.

### Superpowers
*Jesse Vincent (obra), 2025.* Claude Code plugin encoding a set of **skills**
(composable methodology modules): strict red/green/refactor TDD, 4-phase
systematic debugging (root cause before fix), Socratic brainstorming
pre-code, a meta-skill for authoring new skills. Accepted into the official
Claude plugin marketplace. More a **methodology registry** than an agent
design.

---

## Cross-cutting patterns worth naming

Several design moves recur across groups and deserve names of their own:

- **Evaluator as a reusable component.** A separate-role evaluator shows up
  in Evaluator–Optimizer, Reflexion, MetaGPT's QA, AgentVerse's verifier,
  and AFlow's execution scorer. Treat it as a pluggable sub-pattern.
- **Planner / executor split.** Plan-and-Execute, XAgent, and (implicitly)
  Orchestrator–Workers all separate "decide what to do" from "do it". The
  split is what makes replanning possible.
- **Memory of prior attempts.** Reflexion adds it to Group 2. ADAS adds it
  to Group 8 (the agent archive). Most other patterns operate stateless.
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
