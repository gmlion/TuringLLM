# Group 4 — Peer collaboration

*See `docs/agent-workflows/patterns.md` §Group 4 for the
literature taxonomy (Du et al. 2023, Li et al. 2023, Park et al.
2023, Wang et al. 2024).*

## What's modeled at the family level

Multiple agents work **the same task** from different angles. The
task is not decomposed; perspectives are multiplied.

Each agent in the group maintains a distinct viewpoint and
contributes independently. The orchestrator collects all
contributions, and the final answer emerges from a synthesis or
convergence mechanism. What differs between variants is how
agents interact (e.g. synchronous rounds vs. asynchronous
streams) and what they see from each other (full transcript vs.
summary vs. nothing).

## The variants and their axis of variation

| Interpreter | Interaction | Synchrony | Termination | Stack depth |
| --- | --- | --- | --- | --- |
| [`a-debate/`](./a-debate/) | Multi-round, mutual critique | R synchronous rounds | After R rounds, synthesise | 2 |

Currently only **a-debate** is implemented. Future variants could
include **CAMEL** (role-locked dialogue), **generative agents**
(memory + reflection + planning), or **Mixture of Agents** (asynchronous
proposers + aggregator).

## Multi-Agent Debate (current variant)

**Debate** (Du et al., 2023) asks N independent agents to propose
answers, then allows them to read the previous round's proposals
and refine their positions for up to R rounds. The final answer
is a neutral synthesis from the full transcript.

### Mechanism

- **Round coordinator strategy** at `INSTRUCTIONS.md`. State
  machine: `empty` → `dispatch_stage` → `dispatch_push` →
  `dispatching_completed` → (`dispatch_stage` | `round_transition`)
  → … → `concluding` → `done`.
- **One operator** at `operators/opine.md`, depth 1. Receives one
  persona's context plus the prior-rounds transcript; returns one
  opinion via `## Return opinion: |`.
- **Strict round isolation** is enforced by the strategy: at
  dispatch time, the `transcript` push-arg includes only completed
  prior-round snapshot files (`scoped/round-1.md` …
  `scoped/round-{R-1}.md`). The in-progress current round is
  excluded.

### When to reach for debate

- Use **debate** when the acceptance criterion involves
  **convergence by critique** — e.g. a technical decision where
  multiple expert personas must reason together and cross-check
  each other's logic before a consensus emerges.

## Shared operators

No operators are shared with other groups yet. Debate's
`operators/opine.md` is its own canonical copy. Identity is
pinned by `src/test/` tests.

## Run debate

```bash
./new-instance.sh interpreters/mas-papers/4-peer-collaboration/a-debate debate-demo
instances/debate-demo/run.sh
```

Inspect `instances/debate-demo/frames/f000-strategy/scoped/transcript.md` for the full debate, and the final
cycle's `MEMORY.md` for the synthesised `## Final Position`.

## What the interpreter's README explains

The `a-debate/` README describes (1) the scenario, (2) the
orchestrator-by-orchestrator view of which context is driving
each LLM cycle, (3) the per-round trace end to end, (4) where
state lives across cycles, (5) the operator's push-arg/return
contract.

## Future directions in this group

**Mixture of Agents** — a layered architecture where N **proposer**
LLMs independently answer, an **aggregator** LLM synthesises them,
and layers can be stacked. Agents within a layer do **not** see
each other (unlike Debate) — ensembling rather than argumentation.
Pending per-prompt model selection in the shell.

## References

- Du, Yilun et al. *Improving Factuality and Reasoning in Language Models through Multiagent Debate*. arXiv:2305.14325. 2023.
- `docs/agent-workflows/patterns.md` § Group 4 — Peer Collaboration.
