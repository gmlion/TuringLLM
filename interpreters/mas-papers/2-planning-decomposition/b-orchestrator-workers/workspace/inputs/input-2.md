# Eventual consistency

Eventual consistency is a weaker consistency model used by many AP systems. It guarantees that if no new updates are made to a given data item, eventually all reads will return the last updated value.

Between a write and full propagation, reads may see older values. Many real systems offer tunable consistency — Cassandra lets each read or write specify a consistency level (`ONE`, `QUORUM`, `ALL`); DynamoDB has strong and eventually-consistent read modes. Conflict resolution is typically last-write-wins by timestamp, vector clocks, or CRDTs depending on the system.
