# POC: user-service-mock

## Mode
attended

## Source documents
- workspace/inputs/user-service-overview.md — Overview of the production User Service to be mocked
- workspace/inputs/auth-flows.md — Companion doc describing in-scope vs out-of-scope auth flows

## Constraints
- The POC must run as a Node.js service (Node 20+) with no external infrastructure (no database, no Redis).
- The mock must be a single npm-installable package, runnable via `npm start`.
- All state can be in-memory; persistence across restarts is not required.
- Existing consumer test suites depend on the exact HTTP shapes described in the source documents — do not change response field names or status codes.

## Out of scope (hints)
- The admin gRPC interface from user-service-overview.md.
- OAuth flows and password-reset flows from auth-flows.md.
- Rate limiting.
- Email-verification flows.
