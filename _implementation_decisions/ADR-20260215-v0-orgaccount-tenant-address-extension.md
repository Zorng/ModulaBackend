# ADR-20260215 — v0 OrgAccount Tenant Address Extension

## Metadata

- Date: 2026-02-15
- Status: Accepted
- Owners: backend
- Related KB Docs:
  - `knowledge_base/BusinessLogic/2_domain/20_OrgAccount/tenant_domain_consistency_patched.md`
  - `knowledge_base/BusinessLogic/5_modSpec/20_OrgAccount/tenant_module.md`
- Related Code:
  - `migrations/010_v0_org_account_profile_fields.sql`
  - `src/modules/v0/orgAccount/app/service.ts`
  - `api_contract/tenant-v0.md`

## Context

During F1 OrgAccount implementation, we needed backend-owned profile hydration fields for selected context.

Business requirement for tenant profile now includes:
- tenant name
- optional tenant address
- optional contact number
- optional logo URL

Current KB tenant profile description does not explicitly include tenant address.

## Decision

Add optional `tenantAddress` to v0 tenant profile now as an additive field.

Implementation details:
- DB column: `tenants.address` (nullable)
- API field: `tenantAddress` (nullable)

This is treated as a forward-compatible additive extension, not a behavior break.

## Alternatives Considered

- Option A: Keep strict KB shape (no tenant address) and defer until KB patch
  - Rejected: blocks practical profile hydration needs and causes immediate follow-up patch churn.
- Option B: Add tenant address now with ADR tracking (chosen)
  - Accepted: unblocks implementation while keeping KB mutation discipline.

## Consequences

- Positive:
  - frontend can render fuller tenant profile from backend source of truth.
  - avoids later schema/contract retrofit across modules.
- Negative:
  - temporary mismatch between KB doc wording and implemented profile shape.
- Risks:
  - drift if not promoted back to KB.

## Rollout / Migration Notes

- Non-breaking additive DB migration.
- Non-breaking additive API field.
- Existing clients can ignore the new nullable field safely.

## KB Promotion Plan

When stable, patch:

- Target KB path(s):
  - `knowledge_base/BusinessLogic/2_domain/20_OrgAccount/tenant_domain_consistency_patched.md`
  - `knowledge_base/BusinessLogic/5_modSpec/20_OrgAccount/tenant_module.md`
- Promotion criteria:
  - OrgAccount profile shape is accepted by product/backend/frontend and used in active UI flows.
