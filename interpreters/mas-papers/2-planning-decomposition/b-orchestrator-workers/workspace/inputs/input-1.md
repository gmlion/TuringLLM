# CAP theorem

Brewer's CAP theorem states that any distributed data store can provide at most two of the following three guarantees simultaneously: Consistency (every read receives the most recent write or an error), Availability (every request receives a non-error response, without guarantee it contains the most recent write), and Partition tolerance (the system continues to operate despite an arbitrary number of messages being dropped or delayed by the network).

Real-world distributed systems must tolerate partitions, so the practical choice is between C and A. Systems that favour consistency over availability (CP) return errors or time out during a partition (e.g. HBase, MongoDB with majority reads). Systems that favour availability (AP) keep serving requests that may be stale (e.g. Cassandra, DynamoDB in default mode).
