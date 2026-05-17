# User Service — Overview

This document describes the production User Service that the POC is meant to mock.

## Purpose

The User Service is responsible for storing user identity records and validating credentials at sign-in time. It is consumed by the front-end web app, the mobile API gateway, and the internal admin tool. The team wants a local mock to enable contract-level testing of consumers without spinning up the real service or its database.

## External interfaces

### HTTP API (consumed by web + mobile gateway)

- `POST /users` — create a new user.
  - Body: `{ email: string, password: string, displayName: string }`.
  - Returns 201 with `{ id: string, email: string, displayName: string, createdAt: ISO8601 }`.
  - Returns 409 if the email already exists.
  - Returns 422 if the password fails the rules (min 12 chars, must include a digit).
- `POST /sessions` — sign-in.
  - Body: `{ email, password }`.
  - Returns 200 with `{ token: string, expiresAt: ISO8601 }` on success.
  - Returns 401 on bad credentials.
- `GET /users/me` — current user.
  - Requires `Authorization: Bearer <token>` header.
  - Returns 200 with `{ id, email, displayName, createdAt }`.
  - Returns 401 if the token is missing, expired, or revoked.
- `DELETE /sessions/current` — sign out.
  - Requires the bearer token; revokes it.
  - Returns 204.

### Admin gRPC (consumed by internal admin tool, NOT mocked in the POC)

The real service exposes a separate gRPC interface for administrative reads and lockouts. The POC does not need to mock this — admin operations are out of scope for the POC.

## Internal subsystems

- **Repository** — persists user records. Backed by Postgres in production; the mock uses an in-memory map.
- **Hasher** — argon2id-based credential hashing. The mock should use the same algorithm so test vectors round-trip.
- **Token manager** — issues opaque session tokens with a 24-hour TTL; tracks revocations in a small set.
- **Rate limiter** — production rate-limits sign-in attempts at 5 per minute per IP. **The POC does NOT need to mock rate limiting**; consumers under test should not depend on it.

## Data model

- `User { id: UUIDv4, email: string (unique, lowercased), displayName: string, passwordHash: string, createdAt: ISO8601 }`.
- `Session { token: string (opaque, 32 base64url chars), userId: UUIDv4, expiresAt: ISO8601, revoked: boolean }`.

## Behaviours to preserve in the mock

1. POST /users creates a user and returns 201 with the canonical fields.
2. POST /users returns 409 when the email already exists (case-insensitive).
3. POST /users returns 422 with field errors when password rules are not met.
4. POST /sessions returns 200 + token + expiresAt on correct credentials.
5. POST /sessions returns 401 on bad credentials.
6. GET /users/me returns the current user when the bearer token is valid.
7. GET /users/me returns 401 when the bearer token is missing, malformed, expired, or revoked.
8. DELETE /sessions/current revokes the current token; subsequent /users/me calls with that token return 401.
9. Tokens expire after 24 hours.

## Behaviours intentionally NOT mocked

1. The admin gRPC interface.
2. Rate limiting (real service rate-limits sign-in to 5/min/IP).
3. Email verification flows (the real service sends a verification email after sign-up; the mock skips it).
4. Persistence across mock restarts (the mock can be in-memory only).

## Notes from the team

- Argon2id parameters in production: `t=3, m=2^16, p=1`. Cypress contract tests rely on this exact configuration.
- A second doc (`auth-flows.md`) covers the OAuth providers; OAuth is out of scope for the POC.
