# Subscription & Entitlements (`/v0`) — API Contract

This document describes the current F3 baseline read endpoints for subscription state and branch entitlements.

Base path: `/v0/subscription`

## Conventions

- JSON casing: `camelCase`
- Envelope:
  - success: `{ "success": true, "data": ... }`
  - failure: `{ "success": false, "error": "..." }`
- Auth: `Authorization: Bearer <accessToken>`
- Context model:
  - subscription state endpoint uses tenant context from token.
  - entitlement endpoint uses tenant + branch context from token.

## Types

```ts
type SubscriptionState = "ACTIVE" | "PAST_DUE" | "FROZEN";
type EntitlementEnforcement = "ENABLED" | "READ_ONLY" | "DISABLED_VISIBLE";
```

## Endpoints

### 1) Get current tenant subscription state

`GET /v0/subscription/state/current`

Success `200`:

```json
{
  "success": true,
  "data": {
    "tenantId": "uuid",
    "state": "ACTIVE",
    "graceUntil": null,
    "updatedAt": "2026-02-15T12:00:00.000Z"
  }
}
```

Notes:
- If no explicit subscription row exists, backend returns default state `ACTIVE`.

Errors:
- `401` missing/invalid access token
- `403` `TENANT_CONTEXT_REQUIRED` or `NO_MEMBERSHIP`

### 2) Get current branch entitlement snapshot

`GET /v0/subscription/entitlements/current-branch`

Success `200`:

```json
{
  "success": true,
  "data": {
    "tenantId": "uuid",
    "branchId": "uuid",
    "entitlements": [
      {
        "entitlementKey": "module.workforce",
        "enforcement": "ENABLED",
        "updatedAt": "2026-02-15T12:00:00.000Z"
      }
    ]
  }
}
```

Errors:
- `401` missing/invalid access token
- `403` `TENANT_CONTEXT_REQUIRED` / `BRANCH_CONTEXT_REQUIRED` / `NO_MEMBERSHIP` / `NO_BRANCH_ACCESS`
