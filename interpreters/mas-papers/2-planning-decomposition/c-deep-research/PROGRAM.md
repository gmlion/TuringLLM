# Goal

Compare the trade-offs among Raft, Paxos, and Multi-Paxos for distributed consensus. The final report must address each of the following dimensions for all three algorithms:

1. **Leader election** — how a leader is chosen, what happens on leader loss, and the failure modes.
2. **Log replication** — how entries are proposed, accepted, and committed; what ordering guarantees hold.
3. **Fault tolerance** — number of failures tolerated, behaviour under network partitions, safety versus liveness trade-offs.
4. **Implementation complexity and real-world deployments** — notable open-source implementations and the lessons learned from production.

Produce the final structured report at `../../workspace/report.md`. The question is deliberately broad: a naive plan that treats "compare Raft vs Paxos vs Multi-Paxos" as a single step will likely trigger recursive sub-planning from inside `execute-step.md` — that behaviour is expected and exercised by this demo.

You may use the available web tools (`web_search` / `web_fetch` under non-CC providers, or `WebSearch` / `WebFetch` under Claude Code) to ground your answers in current sources. Cite sources in the final report.
