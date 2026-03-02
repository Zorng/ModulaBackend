# Tenant vs Branch Context Scope Matrix (v0 Planning)

Status: Draft (planning only, no implementation)
Owner context: Cross-module (OrgAccount + POS + HR)

## Why this doc exists

From UX perspective, operators manage menu, staff, and inventory mostly at tenant level. Current backend enforcement is mixed: some endpoints are tenant-scoped while other related endpoints remain branch-scoped.

This document defines a planning matrix so we can align:
- UI/UX mental model
- API contract behavior
- access-control scope (action catalog + route registry)
- service-layer context guards

## Scope of this planning

Included in this discussion:
- Menu management
- Staff management
- Inventory management

Not included in this discussion:
- checkout / sale / cash session / attendance runtime operations
- payment provider integrations
- pull/push sync protocol changes

## Design principle (proposed)

Use a two-layer model:
1. Tenant-level master management
2. Branch-level operational execution

Meaning:
- Definitions and templates are tenant-owned.
- Daily execution facts are branch-owned.

## Current vs target matrix

| Domain | Capability | Current backend scope | UX target scope | Notes |
|---|---|---|---|---|
| Menu | Categories CRUD | TENANT | TENANT | Already aligned. |
| Menu | Modifier groups/options CRUD | TENANT | TENANT | Already aligned. |
| Menu | Item list (branch menu) | BRANCH (`menu.items.list`) | TENANT management + optional branch projection | Keep branch-filtered query, but management entry should not require branch context by default. |
| Menu | Item read/create/update/archive/restore | BRANCH (`menu.items.*`) | TENANT | Main mismatch. Visibility remains branch-aware overlay. |
| Menu | Item visibility set | TENANT | TENANT | Already aligned; overlay affects branch availability. |
| Menu | Composition upsert/evaluate | TENANT | TENANT | Already aligned. |
| Staff | Membership invite/role/revoke | TENANT | TENANT | Already aligned. |
| Staff | Staff profile/list/read/assignment | TENANT | TENANT | Aligned at ACL level. |
| Inventory | Stock categories/items CRUD | TENANT | TENANT | Already aligned. |
| Inventory | Branch stock read/journal/restock/adjustment | BRANCH | BRANCH | Keep as branch operations. |
| Inventory | Aggregate stock view | TENANT | TENANT | Already aligned for management reporting. |

## Proposed endpoint intent model (planning)

1. Tenant management endpoints
- Require tenant context.
- Must not require branch context.
- Used by admin/manager screens for cross-branch configuration.

2. Branch operation endpoints
- Require both tenant + branch context.
- Used by daily store operations and branch-local ledgers.

3. Bridge endpoints (tenant with optional branch filter)
- Tenant context required.
- Optional `branchId` in query/body to project branch-specific view.
- Examples: menu listing for a selected branch, inventory aggregate filtered by branch.

## Main gap to resolve

Menu item command/read flows are branch-scoped today while menu master-data intent is tenant-level.

Planned direction:
- Treat menu items as tenant-owned entities.
- Keep branch visibility as explicit overlay relation.
- For operational sale usage, resolve branch-visible items from tenant-owned catalog + branch overlay.

## What will need changes later (implementation checklist)

1. Access control metadata
- Move selected `menu.items.*` actions from `BRANCH` to `TENANT` where appropriate.

2. Route registry context mapping
- Tenant-management routes should use tenant source only.
- Keep branch source only for branch operations.

3. Service guards
- Remove hard branch assertions from tenant-management commands.
- Keep branch assertions for operation endpoints.

4. API contract docs
- Clarify which endpoints are tenant management vs branch operations.
- Define optional branch projection filters where needed.

5. Integration tests
- Add matrix tests for tenant-token-only success on management endpoints.
- Add deny tests for missing branch on branch-operation endpoints.

## Risks and trade-offs

1. Risk: accidental privilege expansion
- Changing scope to TENANT can broaden access if role checks are not tightened.

2. Risk: mixed old/new assumptions
- Existing clients may still send branch-scoped expectations for menu item commands.

3. Trade-off: simpler UX vs stricter isolation
- Tenant-level management is easier for operators.
- Branch-level enforcement remains necessary for operational correctness.

## Decisions to lock before coding

1. Menu item ownership
- Is menu item canonical owner tenant (recommended) or branch?

2. Listing behavior
- Should management list default to tenant-wide and accept optional `branchId` projection?

3. Role policy
- Can `MANAGER` mutate tenant-level menu/inventory master data, or read-only?

4. Migration policy
- Do we keep compatibility aliases for old branch-scoped menu routes during frontend migration window?

## Suggested next artifact

After decisions are locked, create an implementation rollout note:
- `_refactor-artifact/05-pos/11-tenant-management-scope-realignment-v0.md`

That artifact should carry phases for:
- ACL remap
- route context remap
- service guard refactor
- API contract update
- integration regression matrix
