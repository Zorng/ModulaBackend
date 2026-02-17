# ADR-20260215 — v0 Tenant Provisioning Fair-Use Guards

## Status
Accepted

## Context

`POST /v0/auth/tenants` previously allowed unbounded tenant provisioning per account and had no request-frequency guard.

With self-registration enabled, this creates a resource-exhaustion risk (bot or runaway automation), and conflicts with the Fair-Use Limits domain intent in KB.

## Decision

Add fair-use enforcement directly in the tenant provisioning command path with two controls:

1. `tenant_count_per_account` hard limit
2. `tenant.provision` rate limit

### Enforcement contract

- Hard limit denial:
  - HTTP: `409`
  - code: `FAIRUSE_HARD_LIMIT_EXCEEDED`
- Rate limit denial:
  - HTTP: `429`
  - code: `FAIRUSE_RATE_LIMITED`

### Baseline config (env)

- `V0_FAIRUSE_TENANT_COUNT_PER_ACCOUNT_HARD` (default: `20`)
- `V0_FAIRUSE_TENANT_PROVISION_RATE_LIMIT` (default: `10`)
- `V0_FAIRUSE_TENANT_PROVISION_WINDOW_SECONDS` (default: `3600`)

### Persistence

- Added `v0_fair_use_events` for write-attempt frequency tracking.
- Tenant hard-limit count uses owner memberships (`role_key='OWNER'`) as account-owned tenant fact.

## Consequences

- Tenant provisioning now fails closed under abuse patterns with stable reason codes.
- API contract gains deterministic fair-use denial semantics for frontend handling.
- This is a safety guardrail, not billing/monetization policy.
