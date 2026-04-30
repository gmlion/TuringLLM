# Distributed Consensus: Raft, Paxos, and Multi-Paxos Compared

> A structured comparison across leader election, log replication, fault tolerance,
> and real-world deployment experience.

---

## Table of Contents

1. [Background](#background)
2. [Leader Election](#1-leader-election)
3. [Log Replication](#2-log-replication)
4. [Fault Tolerance](#3-fault-tolerance)
5. [Implementation Complexity and Real-World Deployments](#4-implementation-complexity-and-real-world-deployments)
6. [Summary Table](#summary-table)
7. [Sources](#sources)

---

## Background

Distributed consensus is the problem of getting a set of nodes to agree on a single value (or a sequence of values) even when some nodes fail or messages are delayed. Three algorithms dominate the literature and production landscape:

- **Paxos** — Leslie Lamport's original formulation (1989, published 1998). Describes a minimal single-decree protocol for choosing one value; deliberately leaves leader election and log management to implementors.
- **Multi-Paxos** — the practical extension of Paxos for replicated logs. Elects a stable leader and eliminates the prepare phase during steady-state operation, reducing latency and improving throughput.
- **Raft** — Diego Ongaro and John Ousterhout's 2014 redesign. Solves exactly the same problem as Multi-Paxos but decomposes consensus into three independent, easier-to-understand sub-problems: leader election, log replication, and membership changes.

All three are **crash-fault-tolerant (CFT)** protocols: they tolerate nodes that stop responding but not nodes that behave arbitrarily (Byzantine faults). All three require a majority quorum of **2f + 1** nodes to tolerate **f** simultaneous failures.

---

## 1. Leader Election

### Raft

Raft servers exist in one of three states: *leader*, *follower*, or *candidate*. The algorithm uses **randomized election timeouts** (typically 150–300 ms) to avoid perpetual vote splitting.

**Normal path:**

1. A follower starts an election timer when it stops receiving heartbeats from a leader.
2. On timeout, it increments its *term*, transitions to candidate, votes for itself, and broadcasts `RequestVote` RPCs.
3. A peer grants its vote only if:
   - It has not already voted in this term, **and**
   - The candidate's log is at least as up-to-date as the peer's log (compared by term of last entry, then by log length).
4. The candidate becomes leader on receiving votes from a majority.

**Log-currency constraint** is the critical safety invariant: because only candidates with the most up-to-date log can win, every committed entry is guaranteed to be present on the new leader before it takes over.

**Failure handling:** If an election produces a split vote, all candidates time out again (with fresh random delays) and restart. If a node receives any RPC with a higher term than its own, it immediately reverts to follower — this prevents stale leaders from issuing conflicting decisions.

### Paxos

Basic Paxos has **no built-in leader election**. The algorithm allows any node (called a *proposer*) to attempt to drive consensus at any time, using an ordered *ballot number* (proposal number) rather than a term.

**Competing proposers problem:** If two proposers attempt concurrent proposals with different ballot numbers, they can indefinitely preempt each other — one advancing the ballot number to defeat the other, which then advances it further. This *dueling proposers* livelock means Paxos sacrifices liveness in adversarial schedules, though exponential back-off with jitter mitigates it in practice.

**Phase 1 (Prepare) ensures safety on leader loss:** Before proposing a new value, a proposer must collect promises from a majority of acceptors that they will not accept lower-numbered ballots. Crucially, acceptors include any value they have already accepted; the new proposer must continue with the highest such value if one exists, preserving any consensus that may have been reached.

### Multi-Paxos

Multi-Paxos introduces a **distinguished proposer** (the leader) that is elected once — typically via an external mechanism or by running Phase 1 once and re-using the resulting ballot number for many log entries. The leader remains stable until it fails or a higher ballot number appears.

**Steady-state efficiency:** Because the leader's ballot number is already accepted by a majority, it can skip Phase 1 entirely for subsequent proposals. Only Phase 2 (Accept/Accepted) runs, reducing the round-trip count from 4 messages to 2 — matching Raft's normal-path message complexity.

**Failure:** If a leader fails, any peer that detects the absence (via timeout) can run Phase 1 with a higher ballot number, establishing itself as the new leader and discovering any values that the old leader may have half-committed.

### Comparison

| | Raft | Paxos | Multi-Paxos |
|---|---|---|---|
| Election mechanism | Randomized timeouts, term-based | External / any node proposes | External election; ballot re-use |
| Safety constraint | Log currency check on vote grant | Phase 1 ballot discovery | Phase 1 ballot discovery (once) |
| Liveness during split | Bounded via randomization | Not guaranteed (livelock possible) | Depends on election mechanism |
| Concept of leader | Explicit, single leader per term | Implicit (distinguished proposer optional) | Explicit stable leader |

---

## 2. Log Replication

### Raft

Raft's log replication is handled entirely by the leader. Followers are passive acceptors.

**Normal path:**

1. A client request arrives at the leader.
2. The leader appends the entry to its local log, tagged with the current term.
3. The leader issues `AppendEntries` RPCs to all followers, which may carry multiple entries (pipelining) plus the leader's current *commit index*.
4. Once a majority of nodes (including the leader) have written the entry to their logs, the leader advances its commit index and applies the entry to its state machine.
5. The next heartbeat propagates the new commit index to followers, which then apply the entry themselves.

**Conflict resolution:** When a follower's log diverges from the leader's (e.g., after a failed leader), the leader walks back through the follower's log until it finds a common prefix, then overwrites the divergent suffix with its own entries. This is safe because diverging entries were never committed.

**Ordering guarantees:**
- *Log Matching:* If two entries in any two logs have the same index and term, the logs are identical up to that point.
- *Leader Completeness:* A leader elected in term T contains every entry committed in any earlier term.
- *State Machine Safety:* No two state machines ever apply different commands at the same log index.

**Previous-term entries:** Raft never commits entries from a prior leader's term by counting replicas directly. Instead, it waits until it commits a current-term entry; the Log Matching property then implicitly commits the earlier entries. This prevents a subtle bug where entries could appear committed and then be overwritten.

### Paxos (Single-Decree)

Basic Paxos decides a single value, not a log. The two phases are:

**Phase 1 — Prepare/Promise:**
- Proposer sends `Prepare(n)` (ballot number) to a majority of acceptors.
- Each acceptor promises not to accept any ballot < n and returns `(highestAccepted, valueAccepted)` if it has accepted a value before.

**Phase 2 — Accept/Accepted:**
- Proposer picks a value: if any acceptor returned a prior acceptance, the proposer *must* use the value with the highest ballot number. Otherwise it may use its own proposed value.
- Proposer sends `Accept(n, v)` to a majority.
- Acceptors write the value and reply `Accepted`.
- When the proposer hears `Accepted` from a majority, consensus is reached. Learners are notified.

The two-phase design ensures that any previously committed value is preserved: Phase 1 discovers it, Phase 2 propagates it.

### Multi-Paxos for Logs

Multi-Paxos runs a separate Paxos instance per log index (slot). With a stable leader:

- Phase 1 is run once per ballot, covering all future slots (or a range of slots).
- For each new client request, only Phase 2 runs — the leader sends `Accept(slot, ballot, value)` to a majority and waits for `Accepted`.
- This achieves 2-message-delay commits, matching Raft's latency in steady state.
- Pipelining and batching are natural extensions: the leader can have multiple slots in-flight simultaneously.

**Ordering guarantee:** Each slot is independently decided; the state machine applies decisions in slot order. If a slot has no committed value (because a prior leader crashed mid-proposal), the new leader runs Phase 1 for that slot, discovers any in-flight value (or none), and either continues it or fills the slot with a no-op.

### Comparison

| | Raft | Multi-Paxos |
|---|---|---|
| Proposal initiator | Leader only | Leader only (steady state) |
| Commit round-trips (normal) | 1 (leader + majority write) | 1 (Phase 2 only) |
| Commit round-trips (election) | 1 election + 1 proposal | 1 Phase 1 + 1 Phase 2 |
| Conflict resolution | Leader overwrites divergent suffix | Phase 1 discovers and propagates prior value |
| Previous-term commit | Deferred to current-term entry | No-op fill for undecided slots |
| Pipelining | Yes (multiple in-flight AppendEntries) | Yes (multiple in-flight Accept) |

---

## 3. Fault Tolerance

### Quorum Requirements

All three algorithms require a majority quorum. For a cluster of **n = 2f + 1** nodes, **f** simultaneous failures are tolerated:

| Cluster size | Failures tolerated | Quorum |
|---|---|---|
| 3 | 1 | 2 |
| 5 | 2 | 3 |
| 7 | 3 | 4 |

### Network Partitions

**Safety is always guaranteed** across all three algorithms: no two nodes will ever commit different values at the same log index, regardless of partitions.

**Liveness depends on whether a majority exists:**

- The partition containing a majority can elect a leader and continue committing entries.
- The minority partition is unavailable for writes. Any leader there steps down when it cannot replicate to a quorum; Raft's term mechanism ensures it reverts to follower on the next contact with the majority-side leader.
- When partitions heal, the minority catches up by receiving committed entries from the new leader. No committed entry is ever lost: the log-currency constraint (Raft) and Phase 1 ballot discovery (Paxos/Multi-Paxos) both ensure the winning leader carries all committed history.

### Safety vs. Liveness Trade-off

The **Fischer-Lynch-Paterson (FLP) impossibility result** proves that no deterministic consensus algorithm can guarantee both safety and liveness in a fully asynchronous network with even one failure. All three algorithms respond to this by:

- **Guaranteeing safety unconditionally** (no two nodes ever disagree).
- **Sacrificing guaranteed liveness** when a majority is unavailable or when network conditions prevent progress.

In practice, the algorithms are deployed in partially synchronous networks (timing bounds eventually hold), which is sufficient for liveness in the common case.

**Raft** provides a slightly stronger liveness story in normal operation: the randomized timeout mechanism bounds the expected time to elect a new leader (typically one or two election timeout periods). **Paxos** without a stable leader is susceptible to dueling proposers, which can delay progress indefinitely in adversarial schedules.

### Failure Modes by Algorithm

**Raft specific:**
- *Stale leader:* A leader cut off from the majority keeps sending heartbeats that go unanswered; it cannot commit new entries and eventually steps down when it contacts the new term.
- *Log holes:* Cannot occur — the leader always fills any gaps before advancing the commit index.
- *Not Byzantine-fault-tolerant:* A single malicious node can corrupt state.

**Paxos specific:**
- *Dueling proposers / livelock:* Multiple concurrent proposers with escalating ballot numbers prevent any single value from being accepted. Mitigated by strong leadership (Multi-Paxos) or randomized back-off.
- *Learner delay:* A value can be decided without all learners knowing. A learner must actively query acceptors or wait for a notification.

**Multi-Paxos specific:**
- *Undecided slot discovery:* After leader change, new leader must Phase-1 each potentially undecided slot and may insert no-ops, causing brief log gaps visible to state machine.

---

## 4. Implementation Complexity and Real-World Deployments

### Raft: Designed for Understandability

Raft's design goal was explicit: *understandability first*. A controlled user study (Ongaro & Ousterhout, 2014) showed 33 of 43 students answered questions about Raft more correctly than corresponding questions about Paxos. The algorithm's decomposition into three independent sub-problems (leader election, log replication, safety) allows implementors to verify each part independently.

**etcd / etcd Raft library**

The [`etcd/raft`](https://github.com/etcd-io/raft) Go library is the most widely deployed Raft implementation in production. It powers:
- **etcd** itself (the metadata backbone of every Kubernetes cluster)
- **CockroachDB** (distributed SQL)
- **TiKV** (distributed key-value store, used by TiDB)
- **Consul** (service mesh and KV store)

The library is intentionally minimal: it implements only the core Raft state machine. Callers supply their own network transport and persistent storage, which makes the library portable but requires non-trivial integration work.

Key design lessons from etcd:
- **Three-state log entry lifecycle:** An entry moves from *proposed* → *persisted* (on disk) → *committed* (majority replicated) → *applied* (state machine updated). Conflating any two states is a common source of bugs.
- **Linearizable reads without log round-trips:** etcd implements read-index and lease-based read optimizations so that reads do not need to append a log entry on every request.
- **Leader lease:** The leader can serve stale-free reads without a round-trip by relying on the election timeout; no follower can elect itself leader within the lease period.

**CockroachDB: Multi-Raft at scale**

CockroachDB shards its keyspace into *ranges* (~512 MB each), and each range has its own Raft group. This *Multi-Raft* architecture (thousands of concurrent Raft instances per node) required several optimizations not in the original paper:

- **Heartbeat coalescing:** Instead of each Raft group sending individual heartbeat RPCs, CockroachDB coalesces all heartbeats to the same peer into a single message, reducing network traffic by orders of magnitude.
- **Joint consensus for membership changes:** The two-phase joint-consensus approach (Raft §4.3) is used to ensure safety when adding or removing nodes from a range's replication set.
- **Lease vs. Raft leadership:** CockroachDB separates the Raft leader (who drives log replication) from the *leaseholder* (who serves client reads). The leaseholder uses a time-bounded lease to serve reads without Raft round-trips; the leaseholder and leader are usually co-located but can differ.

**Lessons:** Multi-Raft scales well horizontally but requires careful attention to cross-shard coordination, leader placement (keeping the leaseholder close to clients), and back-pressure under replication lag.

### Paxos: Theoretical Power, Implementation Burden

The original Paxos paper deliberately omitted practical details — leader election, log management, recovery from failure — to focus on the core correctness argument. This made Paxos famously difficult to implement: Lamport's follow-up "Paxos Made Simple" (2001) is clearer but still leaves many engineering decisions open.

**Google Chubby**

Chubby is Google's internal lock service, used as the coordination backbone of GFS, BigTable, and Spanner. It uses a five-node Paxos-based replication group.

Key design lessons (from the OSDI 2006 paper):
- **Coarse-grained locks:** Chubby provides advisory locks lasting hours or days, not milliseconds. Fine-grained locks were found to impose too much overhead on both the lock service and callers.
- **Master leases:** The elected Paxos master holds a time-bounded lease. During the lease, replicas promise not to elect another master, allowing the master to serve reads locally without a Paxos round-trip.
- **Operational complexity dominates:** The Chubby authors found that the hardest problems in production were not the consensus algorithm but the surrounding engineering: caching, session management, event delivery, and monitoring. "Chubby works because of careful attention to operational details, not because of the consensus algorithm itself."
- **Small cluster assumption:** Chubby clusters are deliberately small (typically 5 replicas) and handle high-value, low-frequency coordination rather than high-throughput data replication.

**Google Spanner**

Spanner uses Paxos groups for each data shard and adds TrueTime (GPS/atomic-clock synchronized timestamps) to provide externally consistent transactions across datacenters. Each Paxos group has a long-lived leader; leader leases allow local reads. Spanner demonstrates that Paxos can underpin globally distributed, strictly serializable databases — but the engineering effort is enormous.

**Amazon DynamoDB**

DynamoDB uses Paxos for leader election and critical metadata operations. Its experience informed the design of the more accessible Raft algorithm.

### Multi-Paxos: Asymmetric Architectures

Multi-Paxos is particularly well-suited to architectures where **proposers and acceptors are distinct, possibly stateless, node types** — a separation that Raft's symmetric-peer model makes awkward.

**Neon's Safekeeper**

Neon (a serverless Postgres platform) uses a Multi-Paxos variant called *Safekeeper* for its Write-Ahead Log (WAL) replication layer. The insight driving the design:

- **Compute nodes (Postgres)** are the proposers. They are ephemeral and may not persist data across restarts.
- **Safekeepers** are the acceptors. They are stateful storage nodes.

This asymmetry is natural in Paxos (proposers and acceptors are different roles) but awkward in Raft (every node must be an equal peer that can become leader and replicates the full log). Neon's engineers explicitly evaluated Raft and concluded it required too many workarounds for the separated-compute model.

Neon combined:
- Multi-Paxos-style role separation (compute-proposer / safekeeper-acceptor)
- A Raft-like election procedure for simplicity
- TLA+ formal specification to verify correctness

**MySQL Group Replication**

MySQL Group Replication uses a Multi-Paxos variant (Mencius, a pipelined Multi-Paxos) to replicate the binary log across a group of replicas. It supports both single-primary (closest to classic Multi-Paxos leader) and multi-primary modes.

### ZooKeeper and ZAB (Related)

Apache ZooKeeper's **ZAB (ZooKeeper Atomic Broadcast)** protocol predates Raft (2007 vs. 2014) and is structurally similar: a leader broadcasts ordered transactions; followers acknowledge; the leader commits on majority. ZAB is not strictly Paxos or Raft but occupies the same design space. ZooKeeper underpins Kafka, Hadoop YARN, and many other distributed systems.

---

## Summary Table

| Dimension | Raft | Paxos | Multi-Paxos |
|---|---|---|---|
| **Leader election** | Randomized timeouts, log-currency vote guard | Not specified; any proposer can propose | External election; stable leader re-uses ballot |
| **Normal-path latency** | 1 round-trip (AppendEntries + majority ack) | 2 round-trips (Prepare + Accept) | 1 round-trip (Accept only) |
| **Log replication model** | Leader-driven, append-only, conflict resolution by overwrite | Per-slot instances; proposer enforces prior values | Per-slot instances; leader skips Phase 1 |
| **Failures tolerated** | f in 2f+1 nodes | f in 2f+1 acceptors | f in 2f+1 acceptors |
| **Network partition safety** | Yes (guaranteed) | Yes (guaranteed) | Yes (guaranteed) |
| **Liveness under partition** | Majority partition continues | Majority partition continues; minority stalls | Majority partition continues |
| **Dueling proposers risk** | No (single leader per term) | Yes (without stable leader) | No (stable leader) |
| **Implementation complexity** | Lower (decomposed, well-specified) | Higher (many decisions left open) | Medium (well-understood optimizations) |
| **Symmetric peers required** | Yes | No | No |
| **Notable open-source implementations** | etcd, CockroachDB, TiKV, Consul | (mostly proprietary: Chubby, Spanner) | MySQL Group Replication, Neon Safekeeper |
| **Preferred for new systems** | Yes | Rarely | Sometimes (asymmetric architectures) |

---

## Key Takeaways

1. **Raft and Multi-Paxos are algorithmically equivalent** in the sense that both maintain a replicated log with a stable leader and achieve one-round-trip commits in steady state. Their difference is presentation: Raft makes explicit what Multi-Paxos leaves implicit, at the cost of being less flexible architecturally.

2. **Basic Paxos is not a log protocol.** It is a single-decree consensus primitive. Building a replicated log on top of it requires Multi-Paxos, which in turn requires all the same engineering choices that Raft makes (leader election, log compaction, membership changes) — but without the specification spelling them out.

3. **Safety is unconditional in all three.** No committed entry is ever lost; no two nodes ever apply conflicting commands at the same log index. These guarantees hold even during partitions.

4. **Liveness requires a majority.** All three stall when a majority of nodes is unavailable. Raft's randomized election bounds the expected recovery time; Paxos without leadership is susceptible to livelock.

5. **Choose Raft for new systems** unless you have a specific architectural reason not to. The ecosystem (etcd, CockroachDB, TiKV, Consul) is mature, the specification is precise, and the correctness arguments are easier to audit.

6. **Choose Multi-Paxos for asymmetric architectures** (e.g., stateless proposers + stateful acceptors, as in Neon's separated compute/storage model). Paxos's explicit role separation is a better fit than Raft's symmetric-peer assumption.

7. **Paxos expertise is concentrated** in organizations (Google, Amazon) that built on it before Raft existed. For new projects, Raft provides equivalent guarantees with substantially lower implementation risk.

---

## Sources

### Primary Papers

- Ongaro, D. & Ousterhout, J. (2014). *In Search of an Understandable Consensus Algorithm.* USENIX ATC 2014. <https://raft.github.io/raft.pdf>
- Lamport, L. (2001). *Paxos Made Simple.* ACM SIGACT News. <https://lamport.azurewebsites.net/pubs/paxos-simple.pdf>
- Lamport, L. (1998). *The Part-Time Parliament.* ACM Transactions on Computer Systems. <https://lamport.azurewebsites.net/pubs/lamport-paxos.pdf>
- Burrows, M. (2006). *The Chubby Lock Service for Loosely-Coupled Distributed Systems.* OSDI 2006. <https://research.google.com/archive/chubby-osdi06.pdf>
- Howard, H. (2020). *Paxos vs Raft: Have we reached consensus on distributed consensus?* University of Cambridge. <https://www.repository.cam.ac.uk/bitstreams/14f1d94c-6022-4ef6-9175-33be465b80c0/download>

### Implementations and Engineering Write-Ups

- etcd Raft library. <https://github.com/etcd-io/raft>
- Cockroach Labs. *Scaling Raft.* <https://www.cockroachlabs.com/blog/scaling-raft/>
- Cockroach Labs. *Joint Consensus in CockroachDB.* <https://www.cockroachlabs.com/blog/joint-consensus-raft/>
- Cockroach Labs. *Replication Layer Architecture.* <https://www.cockroachlabs.com/docs/stable/architecture/replication-layer>
- Neon. *Why Neon Uses Paxos Instead of Raft.* <https://neon.com/blog/paxos>
- Bhayani, A. *Multi-Paxos: Consensus in Distributed Databases.* <https://arpitbhayani.me/blogs/multi-paxos/>

### Encyclopedic References

- *Raft (algorithm).* Wikipedia. <https://en.wikipedia.org/wiki/Raft_(algorithm)>
- *Paxos (computer science).* Wikipedia. <https://en.wikipedia.org/wiki/Paxos_(computer_science)>
- GeeksforGeeks. *Paxos vs Raft Algorithm in Distributed Systems.* <https://www.geeksforgeeks.org/system-design/paxos-vs-raft-algorithm-in-distributed-systems/>
- Raft Consensus Algorithm official site. <https://raft.github.io/>
