# v0 Access Control Action Catalog (F2)

Status: In use (F2 completed, F3 in progress)
Date: 2026-02-15

This artifact defines route-to-action mapping and action metadata used by the centralized access-control hook.

## Action Metadata

Legend:
- Scope: `GLOBAL | TENANT | BRANCH`
- Effect: `READ | WRITE`
- Roles: optional allow-list; if omitted, any active membership role is allowed

| Action Key | Scope | Effect | Roles | Entitlement |
|---|---|---|---|---|
| `auth.context.tenants.list` | GLOBAL | READ | - | - |
| `auth.context.tenant.select` | TENANT | READ | - | - |
| `auth.context.branches.list` | TENANT | READ | - | - |
| `auth.context.branch.select` | BRANCH | READ | - | - |
| `org.membership.invite` | TENANT | WRITE | OWNER, ADMIN | - |
| `org.membership.invitations.list` | GLOBAL | READ | - | - |
| `org.membership.invitation.accept` | GLOBAL | WRITE | - | - |
| `org.membership.invitation.revoke` | GLOBAL | WRITE | - | - |
| `org.membership.role.change` | TENANT | WRITE | OWNER, ADMIN | - |
| `org.membership.revoke` | TENANT | WRITE | OWNER, ADMIN | - |
| `hr.staff.branch.assign` | TENANT | WRITE | OWNER, ADMIN | - |
| `org.tenant.provision` | GLOBAL | WRITE | - | - |
| `tenant.provision` (compat alias) | GLOBAL | WRITE | - | - |
| `attendance.checkIn` | BRANCH | WRITE | - | `module.workforce` |
| `attendance.checkOut` | BRANCH | WRITE | - | `module.workforce` |
| `attendance.listMine` | BRANCH | READ | - | `module.workforce` |
| `org.tenant.current.read` | TENANT | READ | - | - |
| `org.branches.accessible.read` | TENANT | READ | - | - |
| `org.branch.current.read` | BRANCH | READ | - | - |
| `org.branch.activation.initiate` | TENANT | WRITE | OWNER, ADMIN | - |
| `org.branch.activation.confirm` | TENANT | WRITE | OWNER, ADMIN | - |
| `subscription.state.current.read` | TENANT | READ | - | - |
| `subscription.entitlements.currentBranch.read` | BRANCH | READ | - | - |
| `audit.view` | TENANT | READ | OWNER, ADMIN | - |
| `policy.currentBranch.read` | BRANCH | READ | - | - |
| `policy.currentBranch.update` | BRANCH | WRITE | OWNER, ADMIN | - |
| `menu.items.list` | BRANCH | READ | - | `core.pos` |
| `menu.items.listAll` | TENANT | READ | OWNER, ADMIN, MANAGER | `core.pos` |
| `menu.items.read` | BRANCH | READ | - | `core.pos` |
| `menu.items.create` | BRANCH | WRITE | OWNER, ADMIN, MANAGER | `core.pos` |
| `menu.items.update` | BRANCH | WRITE | OWNER, ADMIN, MANAGER | `core.pos` |
| `menu.items.archive` | BRANCH | WRITE | OWNER, ADMIN, MANAGER | `core.pos` |
| `menu.items.restore` | BRANCH | WRITE | OWNER, ADMIN, MANAGER | `core.pos` |
| `menu.items.visibility.set` | TENANT | WRITE | OWNER, ADMIN, MANAGER | `core.pos` |
| `menu.categories.list` | TENANT | READ | - | `core.pos` |
| `menu.categories.create` | TENANT | WRITE | OWNER, ADMIN, MANAGER | `core.pos` |
| `menu.categories.update` | TENANT | WRITE | OWNER, ADMIN, MANAGER | `core.pos` |
| `menu.categories.archive` | TENANT | WRITE | OWNER, ADMIN, MANAGER | `core.pos` |
| `menu.modifierGroups.list` | TENANT | READ | - | `core.pos` |
| `menu.modifierGroups.create` | TENANT | WRITE | OWNER, ADMIN, MANAGER | `core.pos` |
| `menu.modifierGroups.update` | TENANT | WRITE | OWNER, ADMIN, MANAGER | `core.pos` |
| `menu.modifierGroups.archive` | TENANT | WRITE | OWNER, ADMIN, MANAGER | `core.pos` |
| `menu.modifierOptions.create` | TENANT | WRITE | OWNER, ADMIN, MANAGER | `core.pos` |
| `menu.modifierOptions.update` | TENANT | WRITE | OWNER, ADMIN, MANAGER | `core.pos` |
| `menu.modifierOptions.archive` | TENANT | WRITE | OWNER, ADMIN, MANAGER | `core.pos` |
| `menu.composition.upsert` | TENANT | WRITE | OWNER, ADMIN, MANAGER | `core.pos` |
| `menu.composition.evaluate` | TENANT | READ | - | `core.pos` |

## Route Mapping

| Method | Path Pattern | Action Key | Tenant Source | Branch Source |
|---|---|---|---|---|
| GET | `/auth/context/tenants` | `auth.context.tenants.list` | - | - |
| POST | `/auth/context/tenant/select` | `auth.context.tenant.select` | `body.tenantId` | - |
| GET | `/auth/context/branches` | `auth.context.branches.list` | `token` | - |
| POST | `/auth/context/branch/select` | `auth.context.branch.select` | `token` | `body.branchId` |
| POST | `/auth/memberships/invite` | `org.membership.invite` | `body.tenantId` | - |
| POST | `/org/memberships/invite` | `org.membership.invite` | `body.tenantId` | - |
| GET | `/auth/memberships/invitations` | `org.membership.invitations.list` | - | - |
| GET | `/org/memberships/invitations` | `org.membership.invitations.list` | - | - |
| POST | `/auth/memberships/invitations/:id/accept` | `org.membership.invitation.accept` | - | - |
| POST | `/org/memberships/invitations/:id/accept` | `org.membership.invitation.accept` | - | - |
| POST | `/auth/memberships/invitations/:id/reject` | `org.membership.invitation.revoke` | - | - |
| POST | `/org/memberships/invitations/:id/reject` | `org.membership.invitation.revoke` | - | - |
| POST | `/auth/memberships/:id/role` | `org.membership.role.change` | `path.membershipId` | - |
| POST | `/org/memberships/:id/role` | `org.membership.role.change` | `path.membershipId` | - |
| POST | `/auth/memberships/:id/revoke` | `org.membership.revoke` | `path.membershipId` | - |
| POST | `/org/memberships/:id/revoke` | `org.membership.revoke` | `path.membershipId` | - |
| POST | `/hr/staff/memberships/:id/branches` | `hr.staff.branch.assign` | `path.membershipId` | - |
| POST | `/auth/memberships/:id/branches` | `hr.staff.branch.assign` | `path.membershipId` | - |
| POST | `/auth/tenants` | `org.tenant.provision` | - | - |
| POST | `/org/tenants` | `org.tenant.provision` | - | - |
| POST | `/attendance/check-in` | `attendance.checkIn` | `token` | `token` |
| POST | `/attendance/check-out` | `attendance.checkOut` | `token` | `token` |
| GET | `/attendance/me` | `attendance.listMine` | `token` | `token` |
| GET | `/org/tenant/current` | `org.tenant.current.read` | `token` | - |
| GET | `/org/branches/accessible` | `org.branches.accessible.read` | `token` | - |
| GET | `/org/branch/current` | `org.branch.current.read` | `token` | `token` |
| POST | `/org/branches/activation/initiate` | `org.branch.activation.initiate` | `token` | - |
| POST | `/org/branches/activation/confirm` | `org.branch.activation.confirm` | `token` | - |
| GET | `/subscription/state/current` | `subscription.state.current.read` | `token` | - |
| GET | `/subscription/entitlements/current-branch` | `subscription.entitlements.currentBranch.read` | `token` | `token` |
| GET | `/audit/events` | `audit.view` | `token` | - |
| GET | `/policy/current-branch` | `policy.currentBranch.read` | `token` | `token` |
| PATCH | `/policy/current-branch` | `policy.currentBranch.update` | `token` | `token` |
| GET | `/menu/items` | `menu.items.list` | `token` | `token` |
| GET | `/menu/items/all` | `menu.items.listAll` | `token` | - |
| GET | `/menu/items/:id` | `menu.items.read` | `token` | `token` |
| POST | `/menu/items` | `menu.items.create` | `token` | `token` |
| PATCH | `/menu/items/:id` | `menu.items.update` | `token` | `token` |
| POST | `/menu/items/:id/archive` | `menu.items.archive` | `token` | `token` |
| POST | `/menu/items/:id/restore` | `menu.items.restore` | `token` | `token` |
| PUT | `/menu/items/:id/visibility` | `menu.items.visibility.set` | `token` | - |
| GET | `/menu/categories` | `menu.categories.list` | `token` | - |
| POST | `/menu/categories` | `menu.categories.create` | `token` | - |
| PATCH | `/menu/categories/:id` | `menu.categories.update` | `token` | - |
| POST | `/menu/categories/:id/archive` | `menu.categories.archive` | `token` | - |
| GET | `/menu/modifier-groups` | `menu.modifierGroups.list` | `token` | - |
| POST | `/menu/modifier-groups` | `menu.modifierGroups.create` | `token` | - |
| PATCH | `/menu/modifier-groups/:id` | `menu.modifierGroups.update` | `token` | - |
| POST | `/menu/modifier-groups/:id/archive` | `menu.modifierGroups.archive` | `token` | - |
| POST | `/menu/modifier-groups/:id/options` | `menu.modifierOptions.create` | `token` | - |
| PATCH | `/menu/modifier-groups/:id/options/:optionId` | `menu.modifierOptions.update` | `token` | - |
| POST | `/menu/modifier-groups/:id/options/:optionId/archive` | `menu.modifierOptions.archive` | `token` | - |
| PUT | `/menu/items/:id/composition` | `menu.composition.upsert` | `token` | - |
| POST | `/menu/items/:id/composition/evaluate` | `menu.composition.evaluate` | `token` | - |

## Notes

- `/v0` now fails closed for unregistered routes:
  - request to an unknown `/v0/*` path is denied with `ACCESS_CONTROL_ROUTE_NOT_REGISTERED`.
- Canonical entitlement key set and planned action expansion are tracked in:
  - `_refactor-artifact/01-platform/entitlement-catalog-v0.md`
- Entitlement checks are now wired to `v0_branch_entitlements` for actions with `entitlementKey`.
  - `DISABLED_VISIBLE` => `ENTITLEMENT_BLOCKED`
  - `READ_ONLY` + write action => `ENTITLEMENT_READ_ONLY`
- Subscription state gate behavior:
  - `WRITE` when subscription is `FROZEN` => deny `SUBSCRIPTION_FROZEN`
  - `WRITE` upgrade actions (`org.branch.activation.*`) when subscription is `PAST_DUE` => deny `SUBSCRIPTION_UPGRADE_REQUIRED`
- Branch status gate behavior:
  - `WRITE` on frozen branch => deny `BRANCH_FROZEN`
  - `READ` on frozen branch => allowed if assignment/membership gates pass.
