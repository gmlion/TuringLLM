# Replication

Replication keeps multiple copies of data on different nodes for availability and read scaling. In a leader–follower scheme one node accepts writes; followers asynchronously or synchronously apply the same writes. Synchronous replication blocks the writer until acknowledged by one or more followers (lower throughput, higher durability); asynchronous replication is faster but can lose the tail of writes on leader failure.

Multi-leader (multi-master) replication allows writes on any node and resolves conflicts after the fact; leaderless schemes like Dynamo use quorums (write to W of N, read from R of N with R+W>N). Replication interacts with sharding: each shard is usually replicated 3× to tolerate individual node loss.
