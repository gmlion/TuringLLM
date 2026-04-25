# Paxos (classic) for consensus

Paxos is a family of algorithms for reaching agreement among unreliable processors. The core protocol — Paxos made Simple (Lamport, 2001) — has two roles (proposer, acceptor) and two phases (prepare, accept). In phase 1 the proposer sends a proposal number `n`; an acceptor promises not to accept proposals numbered below `n`. In phase 2 the proposer sends a value `v`; acceptors accept `(n, v)` if they have not promised a higher number.

A value is chosen when a majority accept it. Paxos tolerates up to ⌊(N-1)/2⌋ failures and is safe under asynchrony. The original protocol is notoriously subtle; Multi-Paxos adds a stable leader to amortise phase 1 across many values.
