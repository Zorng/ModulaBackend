# ADR-20260215 — `/v0` Context Hydration On Selection

Status: **Accepted**

Date: **2026-02-15**

## Decision

When a client selects tenant or branch context, backend should return a **hydrated context snapshot** from backend source-of-truth in the select response.

Applies to:
- `POST /v0/auth/context/tenant/select`
- `POST /v0/auth/context/branch/select`

The response should include:
- re-issued tokens (existing behavior)
- selected context IDs (existing behavior)
- hydrated display profile data for selected tenant/branch (new behavior, when supporting OrgAccount module is available)

## Context

Current `/v0` implementation already returns readable labels in list endpoints:
- `GET /v0/auth/context/tenants` returns `tenantName`
- `GET /v0/auth/context/branches` returns `branchName`

But current select endpoints return only token + IDs. This is safe and low-traffic, but it makes frontend depend on cached list payload for display hydration.

For predictable UX and single source of truth, selection responses should be authoritative for current context profile data.

## Consequences

- Frontend can treat select responses as canonical context state after switching.
- Reduces risk of stale UI labels after tenant/branch profile changes.
- Requires OrgAccount-backed read model/profile endpoints (not yet implemented in current `/v0` scope).

## Transitional Rule (Now)

Until OrgAccount context profile data is available:
- keep current select response shape (token + context IDs),
- use context list endpoints for display labels.

## Follow-ups

- Extend select response contract in `api_contract/auth-v0.md` once OrgAccount profile read model lands.
- Add integration tests to assert hydration payload on both tenant and branch selection.
