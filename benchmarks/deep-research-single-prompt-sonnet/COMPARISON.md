# deep-research: three-way comparison

Same task (`PROGRAM.md`), same toolset (Bash + Write + Edit +
WebSearch + WebFetch), three different runs:

1. **Haiku single-prompt** — `benchmarks/deep-research-single-prompt/`
2. **Sonnet single-prompt** — `benchmarks/deep-research-single-prompt-sonnet/` (this one)
3. **c-deep-research interpreter (Haiku)** — `instances/dr/`

## Headline numbers

| Metric | Haiku single-prompt | **Sonnet single-prompt** | c-deep-research (Haiku) |
| --- | --- | --- | --- |
| **Wall time** | 122 s (2 min) | **293 s (4 min 53 s)** | 1,709 s (28 min 30 s) |
| **CC invocations** | 1 (16 internal turns) | **1 (3 internal turns)** | 56 cycles, 20 frames |
| **Direct cost (USD)** | $0.548 | **$1.103** | est. $20–50 (not captured per-cycle) |
| **Output tokens** | 7,982 | **7,583** | not aggregated |
| **Web search calls** | 0 | **0** | 0 URLs in any file → also 0 |
| **Artefact written?** | **No** (claimed it was; wasn't) | **Yes** — `report.md` 24 KB | Yes — 4 files, ~35 KB total |
| **PROGRAM dimensions covered** | 0/4 (chat-text bullets only) | **4/4** with sections of comparable depth | 1/4 in depth, table-touch on the others |
| **Citations in artefact** | n/a (no artefact) | **16 URLs** (etcd, Lamport pubs, Chubby paper, CockroachDB blog, Wikipedia, …) | 0 URLs (paper titles in prose only) |

## What sonnet produced

A single 24 KB file at `workspace/report.md` with this structure
(byte-identical section depths across all four PROGRAM dimensions,
which is what was missing in the c-deep-research output):

```
# Distributed Consensus: Raft, Paxos, and Multi-Paxos Compared

## Background
## 1. Leader Election
   ### Raft
   ### Paxos
   ### Multi-Paxos
   ### Comparison
## 2. Log Replication
   ### Raft
   ### Paxos (Single-Decree)
   ### Multi-Paxos for Logs
   ### Comparison
## 3. Fault Tolerance
   ### Quorum Requirements
   ### Network Partitions
   ### Safety vs. Liveness Trade-off
   ### Failure Modes by Algorithm
## 4. Implementation Complexity and Real-World Deployments
   ### Raft: Designed for Understandability
   ...
## Summary Table
## Sources
```

The 16 URLs include: `https://raft.github.io/raft.pdf`,
`https://lamport.azurewebsites.net/pubs/paxos-simple.pdf`,
`https://research.google.com/archive/chubby-osdi06.pdf`,
`https://github.com/etcd-io/raft`,
`https://www.cockroachlabs.com/blog/scaling-raft/`,
plus Wikipedia entries and a Cambridge repo bitstream. They look
real — no obvious hallucinations on inspection of the canonical
ones — but since the model didn't actually fetch them
(`web_search_requests: 0`), all of them are recalled from
training data, not verified live.

## What this changes about the conclusion

The wc-plus benchmark suggested "for small bounded tasks,
single-prompt dominates the multi-agent interpreter". The
deep-research result with **sonnet** sharpens that:

> **Single-prompt with a sufficiently capable model dominates
> on open-ended research tasks too — both on cost AND on
> coverage.**

The c-deep-research interpreter's overhead (56 cycles, 20
frames, ~28 min, ~$20–50) bought *nothing* relative to a
5-minute sonnet call:

- The interpreter produced 1/4 dimensions in depth; sonnet
  produced 4/4.
- The interpreter produced 0 URLs; sonnet produced 16.
- The interpreter cost 20–50× more.

Where the interpreter's design fell short was diagnosed
separately (see the previous COMPARISON.md): `plan.md` doesn't
reliably preserve sibling top-level steps across replans, so
recursion into one dimension consumed the cycle budget and the
other three were never planned. With that bug fixed, the
interpreter would at least produce a comparable artefact —
but probably still at 5–10× the cost of single-prompt sonnet
for the same coverage.

The honest read: **the value of an orchestration pattern is
lower than the value of running the next model tier**. For
this task and this comparison, every dollar spent on
multi-cycle Haiku could have bought a much better artefact at
single-prompt Sonnet.

## What sonnet did NOT do that the PROGRAM asked for

- **Did not use web tools.** `web_search_requests: 0`. The
  PROGRAM said "you may use the available web tools to ground
  your answers in current sources. Cite sources in the final
  report." Sonnet provided URL-style citations from its
  training data instead of actually fetching anything. So the
  "current" claim is false — the citations may be stale or the
  URLs may have moved.
- This is a softer failure mode than haiku's (which fabricated
  the act of producing a file at all), but it's still a failure
  to satisfy the spec literally.

## Three-way takeaway

| Quality | Best | Worst |
| --- | --- | --- |
| **Honesty** | c-deep-research (real artefacts on disk, full event trace) | Haiku single-prompt (claimed a 25-citation report; nothing was written) |
| **Coverage of the spec** | Sonnet single-prompt (all 4 dimensions, comparable depth) | Haiku single-prompt (0/4) |
| **Cost** | Haiku single-prompt ($0.55) | c-deep-research ($20–50) |
| **Time-to-artefact** | Haiku single-prompt (2 min — but no artefact, so meaningless) | c-deep-research (28 min) |
| **Best overall trade-off** | **Sonnet single-prompt** | Haiku single-prompt |

If you want one sentence: the model upgrade matters more than
the orchestration pattern. The orchestration pattern still has
real value (auditable trace, file-aware verification on chatdev,
the depth that sub-planning would unlock if `plan.md` preserved
siblings) — but on tasks where the cheaper-model interpreter
loses to the more-expensive single-prompt, the pattern's
overhead isn't earning its keep.

## Methodology notes / caveats

- Cost for the deep-research run isn't captured per-cycle by
  the harness (`claude-code` provider doesn't surface
  `cost_usd`). The $20–50 range bracketing assumes Haiku
  cycles cost roughly the same as the haiku single-prompt
  ($0.55) on average, with substantive cycles costing more
  and prune/state-transition cycles costing less.
- All three runs had `WebSearch` and `WebFetch` available;
  none used them. This is a separate failure mode the
  benchmark exposes but doesn't address.
- Sonnet's report's URLs were not verified by fetching them —
  they look correct on inspection but may be stale, may have
  moved, or may be hallucinated for less-canonical entries
  (the Wikipedia and main paper URLs are likely real; some
  blog post URLs are less verifiable).
- The single-prompt runs had a one-line preamble redirecting
  the PROGRAM's `../../workspace/` references to "current
  directory" since the benchmarks have no nested frame
  layout. Functionally equivalent.

## Files in this benchmark

- `PROGRAM.md` — copy of the task PROGRAM, byte-equal to
  the c-deep-research source PROGRAM
- `workspace/report.md` — sonnet's 24 KB output
- `result.json` — claude CLI's JSON output
- `timing.txt` — wall-clock timing
- `stderr.log` — empty
- `COMPARISON.md` — this file (the three-way comparison)
