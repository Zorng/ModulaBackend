# ADR — Multi-Tenant Context Switching (Employee-Scoped Sessions For Now)

## Metadata
- Date: 2026-02-11
- Status: Accepted
- Owners: Backend
- Related KB Docs:
  - `knowledge_base/BusinessLogic/2_domain/10_Identity&Authorization/authentication_domain_consistency_patched.md`
  - `knowledge_base/BusinessLogic/4_process/20_IdentityAccess/10_identity_activation_recovery_orchestration.md`
- Related Code:
  - `src/modules/auth/app/auth.service.ts`
  - `src/modules/auth/api/controllers/auth.controller.ts`
  - `src/modules/auth/api/routes/auth.routes.ts`

## Context

KB intent:
- one global identity can belong to multiple tenants (SaaS)
- after authentication, the user must select a working tenant and (when required) branch context
- context selection should not require an admin-known password

Current implementation reality:
- Sessions are stored in `sessions` table keyed by `employee_id` (tenant-scoped membership/profile).
- JWT access tokens are scoped to `{ employeeId, tenantId, branchId, role }`.
- Login supports a `selection_token` flow when multiple memberships exist, but there was no way to switch tenant/branch after login without re-auth.

## Decision

Implement **context switching** by issuing new session tokens (new refresh token + access token) for the chosen membership/branch, while keeping the underlying session model **employee-scoped** for now.

Added endpoints (authenticated):
- `GET /v1/auth/memberships`
- `POST /v1/auth/switch-tenant`
- `POST /v1/auth/switch-branch`

This provides SaaS usability (switch business / branch) without requiring a database migration of session ownership yet.

## Alternatives Considered

- Option A: Migrate sessions to be `account_id`-scoped (KB-aligned), store `tenant_id`/`branch_id` as session context.
  - Pros: closest to KB, cleaner separation of identity vs membership.
  - Cons: requires DB migration, token claims redesign, and wider changes across middleware and modules; higher regression risk.

- Option B: Force logout + re-login to switch tenant/branch.
  - Pros: minimal backend change.
  - Cons: poor UX, increases auth load, not SaaS-friendly.

## Consequences

- Positive:
  - Multi-tenant users can switch contexts without re-entering credentials.
  - No migration required immediately.
  - Backward-compatible with existing JWT/middleware patterns.

- Negative:
  - Can accumulate multiple active sessions per user because switching creates new refresh tokens and the old session is not revoked automatically.
  - Identity vs membership separation remains incomplete (session ownership is still membership-scoped).

- Risks:
  - Without centralized Access Control enforcement, some endpoints may still allow cross-branch reads via `branchId` query params. This ADR does not solve authorization drift by itself.

## Rollout / Migration Notes

- Switching issues new tokens; clients must replace stored tokens on success.
- Old refresh tokens remain valid until expiry or explicit logout.
- Future enhancement: include `session_id` in JWT or require current `refresh_token` in switch endpoints to revoke the “current” session deterministically.

## KB Promotion Plan

Not promoted to KB yet (implementation choice).

Promotion criteria:
- After Access Control is centralized and session ownership is revisited, update KB ModSpec for Authentication to reflect the final context switching mechanism.

