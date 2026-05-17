# Auth Flows — Companion Doc

This document covers authentication flows. Some are in scope for the User Service POC, some are not.

## Sign-up / sign-in flows (in scope)

The HTTP API flows are detailed in `user-service-overview.md`. The mock should preserve all observable behaviour of those flows (status codes, field shapes, error responses).

Idempotency: POST /users is **not** idempotent on the email — a second call with the same email returns 409. This matches the production semantics and consumers depend on it for sign-up error handling.

## OAuth flows (NOT in scope)

In production the User Service supports OAuth sign-in via Google and Apple. These flows hit `/sessions/oauth/google/callback` and `/sessions/oauth/apple/callback`. The POC does **not** need to mock OAuth — local consumers are expected to use password sign-in only when developing against the mock.

## Password reset (NOT in scope)

The real service supports a password-reset email flow via `POST /password-resets`. The POC does **not** need to mock this; consumer tests for the reset flow run against a separate test fixture.

## Token format

Production tokens are opaque (not JWTs) and look like 32 base64url-encoded characters. The mock should match this format so existing consumer code that validates the format (regex, length) continues to work.
