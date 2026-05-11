# Sharding

Sharding (horizontal partitioning) splits a dataset across multiple nodes by a partition key. Each node owns a disjoint subset of keys, so reads and writes for a given key are routed to a single shard. Sharding scales writes (each shard handles its own fraction) and storage (total capacity is the sum of shards).

The partition function is usually a hash of the key (uniform but destroys locality) or a range over the key space (preserves locality but risks hot shards). Re-sharding — adding a new shard without downtime — is the hard part; consistent hashing and virtual buckets keep the number of re-assigned keys small. Cross-shard transactions require 2PC or application-level coordination.
