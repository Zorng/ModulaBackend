# Access Control (`/v0`) — Reason Codes Contract

This document defines centralized authorization error codes returned by the `/v0` access-control middleware.

These codes are returned in the standard error envelope:

```json
{
  "success": false,
  "error": "CODE",
  "code": "CODE"
}
```

## Reason Codes

| Code | HTTP | Meaning |
|---|---|---|
| `INVALID_ACCESS_TOKEN` | 401 | Missing/invalid bearer token for protected `/v0` route. |
| `ACCESS_CONTROL_ROUTE_NOT_REGISTERED` | 403 | Route is not in access-control registry (fail-closed behavior). |
| `TENANT_CONTEXT_REQUIRED` | 403 | Action requires tenant context, but none is available from token/body/path source. |
| `BRANCH_CONTEXT_REQUIRED` | 403 | Action requires branch context, but none is available. |
| `TENANT_NOT_FOUND` | 404 | Referenced tenant does not exist. |
| `TENANT_NOT_ACTIVE` | 403 | Tenant is not active for this write action (e.g., frozen). |
| `SUBSCRIPTION_UPGRADE_REQUIRED` | 403 | Tenant subscription is `PAST_DUE`; upgrade-only actions are blocked until payment recovery. |
| `SUBSCRIPTION_FROZEN` | 403 | Subscription state is frozen; write operation is blocked. |
| `NO_MEMBERSHIP` | 403 | Actor has no active membership in tenant. |
| `BRANCH_NOT_FOUND` | 404 | Referenced branch does not exist under tenant. |
| `NO_BRANCH_ACCESS` | 403 | Actor has no active branch assignment in tenant. |
| `BRANCH_FROZEN` | 403 | Branch is frozen; write operation is blocked. |
| `PERMISSION_DENIED` | 403 | Actor role is not allowed for action. |
| `ENTITLEMENT_BLOCKED` | 403 | Action blocked by entitlement policy. |
| `ENTITLEMENT_READ_ONLY` | 403 | Write action blocked because entitlement is read-only. |
| `ACCESS_CONTROL_CONFIG_ERROR` | 500 | Route references undefined action metadata (server misconfiguration). |
| `ACCESS_CONTROL_FAILURE` | 500 | Unexpected failure inside access-control pipeline. |

## Behavior Notes

- `/v0` is fail-closed for protected route registration:
  - if endpoint is not mapped in route registry, it is denied.
- Branch freeze semantics:
  - branch `WRITE` => denied with `BRANCH_FROZEN`
  - branch `READ` => allowed if membership + assignment pass.
- Entitlement codes are wired and reserved for F3 enforcement rollout.
