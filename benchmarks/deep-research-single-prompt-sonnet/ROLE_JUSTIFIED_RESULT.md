# deep-research: role-anchored + justified tackle (interpreter result)

This is the fourth data point on the same task (the
`c-deep-research` PROGRAM — compare Raft / Paxos / Multi-Paxos
across 4 dimensions and produce a structured report at
`workspace/report.md`). The other three are documented in
`COMPARISON.md` (single-prompt Haiku, single-prompt Sonnet,
original c-deep-research interpreter on Haiku).

This run uses Haiku 4.5 with the refactored Group 2 architecture
(commit `05734a4`):

- recursive `tackle.md` (atomic-or-decompose decision per frame)
- one-shot `plan.md` (decomposition only, no replan logic)
- anchor context propagated through every recursion: `goal`,
  `original_goal` (= PROGRAM body), `parent_chain` (trail),
  `role` (derived once at strategy Initialize)
- forced verbalization step before atomic-vs-composite: model
  writes `./scoped/justification.md` framing the choice in
  terms of the FINAL ARTIFACT structure, then re-reads it with
  two heuristics that catch over-decomposition and wrong
  granularity

Source: `instances/dr-deep2/`.

## Headline numbers

| Metric | Haiku single-prompt | Sonnet single-prompt | Original c-deep-research (Haiku) | **Role + Justified (Haiku, this run)** |
|---|---|---|---|---|
| Wall time | 122 s | 293 s | 1,709 s (28 min 30 s) | ~3,800 s and counting (~63 min so far) |
| CC invocations | 1 (16 internal turns) | 1 (3 internal turns) | 56 cycles, 20 frames | **73+ cycles, ≥39 frames** |
| Cost | $0.548 | $1.103 | est. $20–50 (not captured) | est. $20–40 (similar Haiku per-call basis) |
| Artefact written? | **No** (claimed; absent) | Yes — 24 KB report | Yes — 16 KB report | **Yes — 22.8 KB report** |
| Web search? | 0 / 0 | 0 / 0 (training-data citations) | 0 (no URLs) | 3 URLs (training-data citations) |
| PROGRAM dimensions covered | 0/4 (chat-text bullets) | **4/4** | 1/4 in depth | **4/4** |
| Peak stack depth | n/a (single call) | n/a | 3 | **6** (vs 13/21/69 in prior interpreter attempts) |

## What the report.md contains

22,817 bytes, 5 numbered top-level sections, three algorithm
sub-sections per dimension, plus a synthesis:

```
# Distributed Consensus Algorithms: A Comprehensive Comparison
   of Raft, Paxos, and Multi-Paxos

## Executive Summary
## 1. Leader Election
   ### Raft / Paxos (Single-Shot) / Multi-Paxos
## 2. Log Replication
   ### Raft / Paxos / Multi-Paxos
## 3. Fault Tolerance
   ### Raft / Paxos / Multi-Paxos
## 4. Implementation Complexity and Real-World Deployments
   ### Raft in Production / Paxos and Multi-Paxos in Production /
        Comparative Implementation Analysis
## 5. Synthesis: Key Insights for Practitioners
   ### When to Choose Raft / ...
```

Dimension coverage is real (not just header presence): 11
mentions of "leader election", 4 of "log replication", 2 of
"fault tolerance", 2 of "implementation complexity" in the
prose body. 3 URL citations.

This is **structurally equivalent to the Sonnet single-prompt
output** from the prior benchmark: 22.8 KB vs Sonnet's 24 KB,
both 5-section structure, both 4/4 dimensions, both
training-data citations rather than fetched.

## What changed across the four interpreter iterations

The four c-deep-research interpreter attempts on this same task
form a clean ablation:

| Iteration | Architecture change | Outcome |
|---|---|---|
| **1. Original** (`instances/dr/` from earlier session) | strategy iterates execute-step; recursive replan via execute-step re-pushing plan; bookkeeping in `## Plan` / `## Outcome` / `[REPLAN-TRIGGER]` | dimension-drop bug — only leader election covered; halt at depth 3 |
| **2. Recursive `tackle.md`, no anchors** | fused execute-step+synthesize into recursive tackle; planner is one-shot decomposer | **catastrophic semantic drift** at depth 22 ("Raft" → "consensus" → "node failure" → "Node.js process events") |
| **3. + Anchor context** (`original_goal`, `parent_chain`) | every recursion level sees PROGRAM and the trail | drift cured but recursion runaway: depth 69 with on-topic but academically over-thorough sub-topics (e.g. C wrappers for x86 TSC counters in service of consensus comparison) |
| **4. + Role + Justification** (this run) | role derived once from PROGRAM, propagated as 4th anchor; forced written justification before atomic-vs-composite, with re-read against artifact-structure heuristics | **report.md produced at depth 6 with 4/4 dimensions and clean structure** |

The two structural fixes that made the difference:

- **Anchor propagation** (iteration 3) — fixes drift but not
  depth. A "node" stays a distributed-system node, no
  reinterpretation as Node.js process. Necessary, not sufficient.
- **Forced verbalization with artifact-structure framing**
  (iteration 4) — the model has to name what *section / file /
  list-entry of the final artefact* each sub-task would become.
  At depth 6, the next would-be split's name reads as obviously
  absurd ("sub-section 4.5.2.1.7 of the implementation
  appendix"), and the re-read step catches it. Decision tally
  in this run: **13 ATOMIC, 6 COMPOSITE** unique frames —
  versus 0 atomic decisions visible in the unjustified depth-69
  run.

## What's still imperfect

1. **The run hasn't halted yet** at the time of writing
   (cycle 73, depth 6, 63 min wall). The report.md was
   produced by a deep atomic frame at cycle ~45, but the root
   tackle continues iterating its remaining sub-goals. Final
   synthesis at the root has not yet fired. The artefact is
   already on disk and complete; the recursion is still
   propagating.
2. **A deep atomic frame writing the final report** is a
   slight inversion of the intended flow (synthesis at the
   root should be the writer). It's not wrong — the artefact
   is correct — but it means the eventual synthesize step at
   the root will likely re-write or update report.md when it
   fires.
3. **Cost is still ~30-50× the Sonnet single-prompt** for
   structurally equivalent output. The interpreter's value
   proposition on this task remains: auditable trace
   (`scoped/justification.md` per frame), real recursion
   structure, ability to run on cheaper models. The cost
   premium is only worthwhile if those traceability /
   model-tier-substitution properties matter to the use case.

## Comparison vs Sonnet single-prompt specifically

Sonnet single-prompt produced a 24 KB / 4-dimension / 16-URL
report in 5 minutes for $1.10. Role+justified Haiku produced a
22.8 KB / 4-dimension / 3-URL report in 60+ minutes for ~$25–40.
Output quality is structurally similar; cost is ~25× higher;
wall time is ~12× higher.

The interpreter ran *the same task to a comparable artefact* on
a strictly cheaper model — the model-tier vs orchestration
trade-off is now genuinely ambiguous on this task rather than
clearly favoring single-prompt. For most practical use cases,
Sonnet single-prompt remains the right answer; the
role-justified interpreter is interesting if you specifically
want the auditable per-frame justification trace, or if you
want to run on Haiku for cost reasons and accept the wall-time
cost.

## Methodology / data quality notes

- Cost for the interpreter run isn't captured per-cycle by the
  harness; the $25-40 range bracketing assumes Haiku cycles at
  roughly the haiku single-prompt's $0.548 average, with this
  run being ~70 cycles.
- Web search wasn't actually invoked by any iteration. All
  citations and content are recalled from training data.
- The 4-dimension coverage check counts substring mentions in
  the report.md body; section headers exist for all four, but
  prose density skews toward leader election (11 mentions vs
  2 each for the other three). Not perfectly balanced.
- The run hasn't halted; final cycle/cost numbers will only
  reach final values when the recursion winds back to root.
