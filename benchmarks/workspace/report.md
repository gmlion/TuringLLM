# Distributed Consensus Comparison: Raft, Paxos, and Multi-Paxos

## Executive Summary

This report compares three major consensus algorithms used in distributed systems: Raft, Paxos, and Multi-Paxos. While Paxos is the foundational consensus protocol, Raft was designed to improve understandability, and Multi-Paxos optimizes Paxos for practical systems with multiple consensus decisions. All three guarantee safety under the same fault-tolerance model (tolerating up to (N−1)/2 failures in an N-node cluster) but differ significantly in implementation complexity, leader election mechanisms, and operational behavior.

---

## 1. Leader Election

### Raft: Explicit and Deterministic

**Mechanism:**
Raft uses a **strong leader model** where leader election is a mandatory, well-defined phase. In normal operation, a leader sends periodic **heartbeat messages** (empty `AppendEntries` RPCs) to all followers. Each server maintains a **randomized election timeout** (typically 150–300 milliseconds) on its local clock.

**Failure Detection and Transition:**
- When a follower fails to receive a heartbeat within its election timeout, it transitions to **candidate** status and initiates an election.
- A candidate increments its **term counter**, votes for itself, and sends `RequestVote` RPCs to all other servers.
- Raft uses randomized election timeouts to prevent split votes; servers become candidates at different times, reducing the probability of simultaneous elections.

**Three Outcomes for Candidates:**
1. **Success:** Candidate receives majority votes → becomes new leader
2. **Defeat:** Candidate receives message from a server with higher term number → reverts to follower
3. **Split Vote:** Neither majority reached → new term begins, new election starts

**Advantages:**
- Simple, deterministic process reduces ambiguity in leader selection
- Randomized timeouts efficiently prevent split votes
- Leader is guaranteed to have an up-to-date log (only servers with up-to-date logs can win elections)

**Failure Modes:**
The system remains safe but unavailable if the leader fails and a partition prevents a majority from being elected. Raft prioritizes safety over liveness.

---

### Paxos: Implicit and Flexible

**Mechanism:**
Unlike Raft, Paxos does not mandate an explicit leader election phase. Instead, any server may act as a **Proposer**. In basic Paxos, consensus occurs when a proposer convinces a quorum of **Acceptors** to accept a value through two phases:
- **Phase 1 (Prepare):** Proposer sends prepare(n) with a unique proposal number to all acceptors
- **Phase 2 (Accept):** Proposer sends accept(n, v) to acceptors that promised to accept from it

A server may propose "I am the leader" using these phases; if a quorum accepts, it is recognized as leader. However, Paxos leaves leader election details to implementations—in practice, systems often use a separate leader-election oracle (e.g., based on server IDs) or eventually elect a leader through the consensus mechanism itself.

**Failure Modes:**
- If a proposer crashes, another proposer can take over without violating correctness
- If no proposer emerges (e.g., multiple proposers interleave), the system may livelock without making progress (liveness is not guaranteed)
- The two-phase process is more tolerant of asynchrony but more complex to reason about

**Role-Based Flexibility:**
Paxos defines three roles—Proposer, Acceptor, and Learner—that can coexist on the same node. This separation permits nodes to fail in specific roles without global failure, though implementations often collapse roles onto single processes.

---

### Multi-Paxos: Leader Optimization

**Mechanism:**
Multi-Paxos extends Paxos by introducing a **stable leader** that persists for multiple consensus decisions. Once a leader is elected through the first Phase 1 (Prepare), subsequent proposals skip Phase 1 entirely, proceeding directly to Phase 2 (Accept). This reduces message overhead significantly.

**Optimization Effect:**
- **Classical Paxos:** Three message rounds per decision (Prepare, Promise, Accept, Accepted)
- **Multi-Paxos with stable leader:** One message round per decision (Accept, Accepted) after leader election
- Latency reduction: ~50% compared to repeated single-decree Paxos

**Failure Handling:**
When the leader fails, Multi-Paxos reverts to full Paxos to elect a new leader, then resumes the optimization.

---

## 2. Log Replication

### Raft: Simple, Strong Ordering

**Entry Lifecycle:**
1. **Client Request:** Client sends command to leader
2. **Log Append:** Leader appends entry to its own log, assigns a **log index** and **term number**
3. **Replication:** Leader sends `AppendEntries` RPCs to followers with the new entry
4. **Follower Persistence:** Followers append the entry to their logs and acknowledge
5. **Commitment:** Once a majority has replicated the entry, the leader marks it as **committed** and applies it to its state machine
6. **Follower Application:** Leader informs followers of the commit index in subsequent heartbeats; followers apply committed entries

**Ordering Guarantees:**
- **Total ordering:** All servers agree on the order of all entries in the log
- **Prefix property:** If two logs contain an entry at the same index with the same term, they are identical from the beginning up to that index
- **Log matching:** Leader maintains consistency by ensuring followers' logs match the leader's log before sending new entries; mismatches are corrected by truncating follower logs and resending entries

**Safety Mechanism:**
Raft ensures that entries already committed on a leader cannot be overwritten. When a new leader is elected, it must have all committed entries from previous terms, which Raft ensures because only servers with up-to-date logs can become leaders.

---

### Paxos: Decoupled Proposal and Acceptance

**Entry Lifecycle:**
1. **Proposer Sends Prepare:** Proposer(n) sends to all acceptors with unique proposal number n
2. **Acceptors Promise:** Acceptors respond with promise not to accept lower-numbered proposals, plus any value they've previously accepted
3. **Proposer Chooses Value:** Proposer selects the value from the highest-numbered promise (or proposes its own if no prior value)
4. **Proposer Sends Accept:** Proposer sends accept(n, v) to all acceptors
5. **Acceptors Accept and Learn:** Acceptors accept if no higher-numbered prepare received; send to learners
6. **Learner Decides:** Learner (or proposer monitoring acceptors) confirms decision when majority has accepted

**Ordering Guarantees:**
- **Single-decree guarantee:** Each instance of Paxos decides one value
- **Lack of natural ordering:** Basic Paxos decides one value per instance; to build a replicated log, instances must be run sequentially or in parallel with explicit index association (Multi-Paxos)
- **Implicit commitment:** Unlike Raft's explicit commit mechanism, Paxos considers a value learned once a majority of acceptors has accepted it

**Safety via Promises:**
Paxos achieves consistency through the promise mechanism: acceptors commit not to accept lower-numbered proposals, preventing conflicting decisions. This works with asynchronous networks but cannot guarantee progress (liveness).

---

### Multi-Paxos: Parallel Slots

**Extension to Replication:**
Multi-Paxos runs multiple Paxos instances in parallel, each bound to a **slot** (log index):
- Each slot has its own proposal number and decided value
- A stable leader uses the same proposal number across all slots
- Slot numbering provides total ordering (similar to Raft's log indices)

**Log Consistency:**
- The leader maintains a **firstUnchosenIndex** tracking which slots are decided
- Followers learn the decided values through learner messages
- Synchronization of unlearned slots is an implementation detail; some systems have the leader re-send Paxos proposals for missing slots

---

## 3. Fault Tolerance

### Failure Tolerance Capacity

**Theoretical Limit (both Paxos and Raft):**
Both algorithms can tolerate up to **(N−1)/2 failures** in an N-node cluster due to quorum-based consensus. Examples:
- 3-node cluster: tolerates 1 failure
- 5-node cluster: tolerates 2 failures
- 7-node cluster: tolerates 3 failures

This limit arises because a quorum must be a strict majority (>N/2 nodes) to ensure only one quorum can be formed among any partition.

### Behavior Under Network Partitions

Both Paxos and Raft follow the **CAP theorem** trade-off: they guarantee **Consistency and Partition tolerance** but sacrifice **Availability** when a partition occurs.

**Partitioned Majority (Safe):**
- Nodes in the majority partition can continue to elect leaders and decide values
- Minority partitions cannot achieve consensus and stall indefinitely
- No conflicting decisions are made; safety is preserved

**Example (5-node cluster):**
- 3 nodes in partition A, 2 in partition B
- Partition A forms a quorum, can continue operations
- Partition B stalls; read-only queries may be served but no new writes succeed

**Symmetric Behavior:**
Both Raft and Paxos provide **unconditional safety** (no conflicting values are ever committed) but conditional **liveness** (progress occurs only when a quorum is reachable). This is a fundamental consequence of the **FLP (Fischer-Lynch-Paterson) Impossibility Theorem**, which states that no asynchronous consensus protocol can guarantee both safety and liveness if even one process may crash.

---

### Safety Properties

**Raft:**
- Only servers with up-to-date logs can become leaders, preventing log divergence
- Once an entry is committed (replicated to a majority), it can never be overwritten
- Leader completeness ensures that all committed entries are on the new leader

**Paxos:**
- Safety is guaranteed through the prepare and promise phases; a quorum cannot be split
- Only one value can be decided per instance, even if proposals interleave
- Learners see committed values only after a majority has accepted

**Comparison:**
Raft's leader-based model makes safety more intuitive and easier to verify, while Paxos's role-based model is more abstract but equally correct.

---

### Liveness and Timely Failure Recovery

**Raft:**
- Progress depends on leader availability and functioning quorum
- Election timeout (150–300 ms typically) determines failure detection latency
- Leader is elected quickly once a quorum is reachable (typically within 300 ms for modern implementations)
- Recovery time is deterministic and short

**Paxos:**
- Basic Paxos does not guarantee liveness; multiple proposers may interleave indefinitely (livelock)
- Multi-Paxos mitigates this via leader stability, but leader failure recovery depends on external mechanisms
- Recovery can be slower and less deterministic without a dedicated leader-election mechanism

**Practical Implication:**
Raft's deterministic leader election makes recovery faster and more predictable, while Paxos (especially Multi-Paxos) requires careful engineering to avoid livelock situations.

---

## 4. Implementation Complexity and Real-World Deployments

### Implementation Difficulty

**Raft: Designed for Simplicity**
The Raft protocol was explicitly designed to improve understandability compared to Paxos. Its decomposition into three independent subproblems—leader election, log replication, and safety—provides a clear mental model.

- **Lines of Code:** Production Raft implementations typically range from 2,000 to 5,000 lines
- **Learning Curve:** Developers can implement Raft after reading the original paper, as evidenced by dozens of independent implementations
- **Testing:** Raft's deterministic leader election enables easier test case design and fault injection

**Paxos: Subtle and Complex**
Paxos is notoriously difficult to understand and implement correctly.

- **Lines of Code:** Google's Chubby (a Paxos-based system) implementation contains **several thousand lines of C++ code**, but the core Paxos protocol can be described on a single page
- **Gap Between Theory and Practice:** The difference between the theoretical one-page description and production implementation is substantial; handling disk failures, limited disk space, and system integration requires significant engineering effort
- **Byzantine Extensions:** Supporting Byzantine faults (arbitrary node failures) requires additional complexity and increases the number of required replicas

---

### Real-World Deployments and Lessons

#### Raft in Production

**etcd:**
- **Usage:** Kubernetes configuration store; manages distributed system configuration with strong consistency guarantees
- **Deployment Scale:** Powers tens of thousands of clusters daily
- **Implementation:** The etcd/raft library is the most widely used Raft implementation in production
- **Design Philosophy:** etcd/raft implements only the core Raft protocol; users must implement networking, storage, and state machine application
- **Lesson Learned:** Clean separation of consensus from system integration reduces coupling and enables reuse across different projects

**CockroachDB:**
- **Usage:** Distributed SQL database; uses Raft for data replication within ranges
- **Deployment Model:** Multi-Raft approach—each data range (shard) runs its own Raft consensus group, allowing a node to participate in hundreds of thousands of consensus groups
- **Optimization:** Parallel consensus groups yield higher throughput than single-system-wide Paxos
- **Lesson Learned:** Parallelizing consensus per-shard scales better than a single system-wide consensus mechanism

**Consul and Other Systems:**
- **Consul (HashiCorp):** Service discovery and configuration management
- **Redis, Kubernetes, Docker Swarm:** All adopted Raft for consensus
- **Widespread Adoption:** With ~100 open-source implementations, Raft has become the de-facto standard for modern distributed systems

**Key Lesson from Raft Deployments:**
Raft's simplicity enables rapid adoption and correct implementations. The algorithm's design choices (e.g., randomized election timeouts, strong leader constraint) map naturally to engineering best practices.

---

#### Paxos in Production

**Google Chubby:**
- **Purpose:** Distributed lock service used by GFS (Google File System), BigTable, and other Google infrastructure
- **Deployment:** Replicas placed at failure-independent sites (across racks/datacenters) to minimize correlated failures
- **Production Experience:** Over 100 machine-years of execution in production with impressively low failure rates
- **Implementation Complexity:** Despite the one-page theoretical description, the complete implementation contains several thousand lines of C++ code
- **Lesson Learned:** The gap between theory and practice is substantial; production Paxos systems require careful engineering for reliability

**MySQL Group Replication:**
- **Approach:** Uses a Paxos-based protocol called **eXtended COMmunications (XCOM)**
- **Function:** Manages consistency and membership changes for replicated MySQL instances
- **Design Tradeoff:** Chose Paxos for its theoretical guarantees but faced complexity in production tuning

**Historical Significance:**
Paxos was the consensus mechanism of choice for decades before Raft. Many systems (Google, Yahoo, Microsoft) built production systems on Paxos, but implementation difficulty meant that few organizations could build custom Paxos systems. Most systems either adopted existing implementations (like Chubby) or chose not to implement consensus themselves.

**Key Lesson from Paxos Deployments:**
Paxos works reliably in production but requires significant engineering effort and deep expertise. Organizations typically adopted Paxos by reusing existing implementations rather than building from scratch.

---

#### Multi-Paxos Deployments

Multi-Paxos is often used internally by companies building distributed databases and systems, but is less visible in open-source because the implementation complexity and the availability of Raft alternatives have reduced adoption.

- **Google**: Various internal systems use Multi-Paxos variants for fault-tolerant state management
- **Database Systems:** Some distributed SQL systems use Multi-Paxos, though Raft has become more popular in recent years
- **Optimization Tradeoff:** Multi-Paxos saves messages and latency after leader election, but the optimization is most visible at high request rates; for systems with bursty or moderate traffic, the additional complexity may not justify the gains

---

## Comparison Matrix

| Dimension | Raft | Paxos | Multi-Paxos |
|-----------|------|-------|-------------|
| **Leader Election** | Explicit, deterministic; randomized timeouts | Implicit, flexible; requires oracle or external mechanism | Stable leader with Paxos-based election |
| **Log Replication** | Strong leader appends entries; followers replicate | Decoupled proposers and acceptors; role flexibility | Parallel Paxos instances per log slot |
| **Failure Tolerance** | (N−1)/2 failures; stalls without majority | (N−1)/2 failures; livelock risk without leader oracle | (N−1)/2 failures; depends on leader stability |
| **Network Partitions** | Majority progresses, minority stalls (CP) | Majority progresses, minority stalls (CP) | Majority progresses, minority stalls (CP) |
| **Safety** | Unconditional; strong leader ensures no conflicts | Unconditional; quorum promises prevent conflicts | Unconditional; inherits Paxos safety |
| **Liveness** | Conditional (progress when majority reachable) | Conditional; livelock without external leader oracle | Conditional; depends on stable leader |
| **Implementation Complexity** | Low; 2,000–5,000 lines in production | High; thousands of lines despite one-page description | Moderate–High; more complex than Paxos |
| **Understanding** | Intuitive; clear mental model | Subtle; counterintuitive to many developers | Abstract; less documented than Raft |
| **Adoption** | De-facto standard (~100 implementations) | Legacy systems; rarely chosen for new projects | Specialized systems; less visible |
| **Deployment Scale** | Tens of thousands of clusters (etcd) | Hundreds of clusters (Google); declining adoption | Specialized use cases |
| **Real-World Success** | High; easy to implement correctly | High in specialized systems; difficult to implement | Moderate; optimized for high-throughput systems |

---

## Key Takeaways

1. **Raft Dominates Modern Systems:** Raft's explicit leader-election model and clear decomposition make it far easier to understand and implement correctly. Nearly all new distributed systems (etcd, Consul, CockroachDB, Kubernetes) now use Raft.

2. **Paxos Remains Theoretically Elegant:** Paxos is more flexible and role-based, but this flexibility comes at the cost of implementation complexity. Production Paxos systems work reliably but require deep expertise and careful engineering.

3. **Multi-Paxos Optimizes for Throughput:** By reusing leader elections across multiple consensus decisions, Multi-Paxos reduces latency and message overhead. However, this optimization is most beneficial in high-throughput scenarios; for many applications, Raft's simplicity is preferable.

4. **Safety vs. Liveness Trade-Off:** All three algorithms honor the FLP impossibility result: they guarantee safety but not liveness during network partitions. Systems must choose between strong consistency (Raft/Paxos) and availability (eventual consistency).

5. **Implementation Simplicity Matters:** The substantial gap between Paxos's theoretical description and production implementations demonstrates that algorithm design is not just about correctness—clarity and implementability are equally critical for adoption.

---

## Sources

- [Raft Consensus Algorithm](https://raft.github.io/)
- [Raft (algorithm) - Wikipedia](https://en.wikipedia.org/wiki/Raft_(algorithm))
- [Understanding Raft consensus algorithm](https://arorashu.github.io/posts/raft.html)
- [Paxos (computer science) - Wikipedia](https://en.wikipedia.org/wiki/Paxos_(computer_science))
- [Raft and Paxos: Consensus Algorithms for Distributed Systems - Medium](https://medium.com/@mani.saksham12/raft-and-paxos-consensus-algorithms-for-distributed-systems-138cd7c2d35a)
- [Multi-Paxos - Consensus in Distributed Databases](https://arpitbhayani.me/blogs/multi-paxos/)
- [Paxos vs Raft: Have we reached consensus on distributed consensus? - Cambridge](https://www.repository.cam.ac.uk/bitstreams/14f1d94c-6022-4ef6-9175-33be465b80c0/download)
- [Understanding etcd's Raft Implementation: A Deep Dive into Raft Log - DEV Community](https://dev.to/justlorain/understanding-etcds-raft-implementation-a-deep-dive-into-raft-log-bdn)
- [The Chubby lock service for loosely-coupled distributed systems - Google Research](https://research.google.com/archive/chubby-osdi06.pdf)
- [Paxos Made Live: An Engineering Perspective - Google Research](https://paxos-made-live.papers.dev/)
- [Scaling Raft - CockroachDB](https://www.cockroachlabs.com/blog/scaling-raft/)
- [Understanding Consensus Algorithms: CAP Theorem, Paxos, and Raft - Medium](https://charleswan111.medium.com/understanding-consensus-algorithms-cap-theorem-paxos-and-raft-2913ac2c1126)
- [MySQL: Good Leaders are game changers: Raft & Paxos](https://dev.mysql.com/blog-archive/good-leaders-are-game-changers-raft-paxos/)
- [How Consensus-Based Replication Works in Distributed Databases - YugabyteDB](https://www.yugabyte.com/blog/how-does-consensus-based-replication-work-in-distributed-databases/)
- [etcd versus other key-value stores](https://etcd.io/docs/v3.3/learning/why/)
- [Paxos Algorithm - ScienceDirect Topics](https://www.sciencedirect.com/topics/computer-science/paxos-algorithm)
- [Paxos - Martin Fowler's Patterns of Distributed Systems](https://martinfowler.com/articles/patterns-of-distributed-systems/paxos.html)
- [CS 262a Advanced Topics in Computer Systems Lecture 18 Paxos/RAFT - UC Berkeley](https://people.eecs.berkeley.edu/~kubitron/cs262/lectures/lec18-Paxos-Raft.pdf)
- [Fast Raft: Optimizations to the Raft Consensus Protocol](https://arxiv.org/html/2506.17793v1)
- [An Improved Raft Consensus Algorithm Based on Asynchronous Batch Processing - Springer](https://link.springer.com/chapter/10.1007/978-981-19-2456-9_44)
- [Implementing Raft: Part 1 - Elections - Eli Bendersky](https://eli.thegreenplace.net/2020/implementing-raft-part-1-elections/)
- [Understanding Raft Algorithm: Consensus and Leader Election Explained - Medium](https://medium.com/@jitenderkmr/understanding-raft-algorithm-consensus-and-leader-election-explained-faadf28fd047)
- [Paxos Made Simple - Leslie Lamport](https://lamport.azurewebsites.net/pubs/paxos-simple.pdf)
- [Consensus in the Cloud: Paxos Systems Demystified - University at Buffalo](https://cse.buffalo.edu/tech-reports/2016-02.pdf)
- [The Paxos algorithm, when presented in plain English, is very simple](https://www.mydistributed.systems/2021/04/paxos.html)
