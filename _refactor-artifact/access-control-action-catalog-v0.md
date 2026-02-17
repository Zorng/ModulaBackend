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
| `org.membership.invitation.reject` | GLOBAL | WRITE | - | - |
| `org.membership.role.change` | TENANT | WRITE | OWNER, ADMIN | - |
| `org.membership.revoke` | TENANT | WRITE | OWNER, ADMIN | - |
| `hr.staff.branch.assign` | TENANT | WRITE | OWNER, ADMIN | - |
| `tenant.provision` | GLOBAL | WRITE | - | - |
| `attendance.checkIn` | BRANCH | WRITE | - | `module.workforce` |
| `attendance.checkOut` | BRANCH | WRITE | - | `module.workforce` |
| `attendance.listMine` | BRANCH | READ | - | `module.workforce` |
| `org.tenant.current.read` | TENANT | READ | - | - |
| `org.branches.accessible.read` | TENANT | READ | - | - |
| `org.branch.current.read` | BRANCH | READ | - | - |
| `org.branch.firstActivation.initiate` | TENANT | WRITE | OWNER, ADMIN | - |
| `org.branch.firstActivation.confirm` | TENANT | WRITE | OWNER, ADMIN | - |
| `subscription.state.current.read` | TENANT | READ | - | - |
| `subscription.entitlements.currentBranch.read` | BRANCH | READ | - | - |
| `audit.view` | TENANT | READ | OWNER, ADMIN | - |

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
| POST | `/auth/memberships/invitations/:id/reject` | `org.membership.invitation.reject` | - | - |
| POST | `/org/memberships/invitations/:id/reject` | `org.membership.invitation.reject` | - | - |
| POST | `/auth/memberships/:id/role` | `org.membership.role.change` | `path.membershipId` | - |
| POST | `/org/memberships/:id/role` | `org.membership.role.change` | `path.membershipId` | - |
| POST | `/auth/memberships/:id/revoke` | `org.membership.revoke` | `path.membershipId` | - |
| POST | `/org/memberships/:id/revoke` | `org.membership.revoke` | `path.membershipId` | - |
| POST | `/hr/staff/memberships/:id/branches` | `hr.staff.branch.assign` | `path.membershipId` | - |
| POST | `/auth/memberships/:id/branches` | `hr.staff.branch.assign` | `path.membershipId` | - |
| POST | `/auth/tenants` | `tenant.provision` | - | - |
| POST | `/org/tenants` | `tenant.provision` | - | - |
| POST | `/attendance/check-in` | `attendance.checkIn` | `token` | `token` |
| POST | `/attendance/check-out` | `attendance.checkOut` | `token` | `token` |
| GET | `/attendance/me` | `attendance.listMine` | `token` | `token` |
| GET | `/org/tenant/current` | `org.tenant.current.read` | `token` | - |
| GET | `/org/branches/accessible` | `org.branches.accessible.read` | `token` | - |
| GET | `/org/branch/current` | `org.branch.current.read` | `token` | `token` |
| POST | `/org/branch/first-activation/initiate` | `org.branch.firstActivation.initiate` | `token` | - |
| POST | `/org/branch/first-activation/confirm` | `org.branch.firstActivation.confirm` | `token` | - |
| GET | `/subscription/state/current` | `subscription.state.current.read` | `token` | - |
| GET | `/subscription/entitlements/current-branch` | `subscription.entitlements.currentBranch.read` | `token` | `token` |
| GET | `/audit/events` | `audit.view` | `token` | - |

## Notes

- `/v0` now fails closed for unregistered routes:
  - request to an unknown `/v0/*` path is denied with `ACCESS_CONTROL_ROUTE_NOT_REGISTERED`.
- Canonical entitlement key set and planned action expansion are tracked in:
  - `_refactor-artifact/entitlement-catalog-v0.md`
- Entitlement checks are now wired to `v0_branch_entitlements` for actions with `entitlementKey`.
  - `DISABLED_VISIBLE` => `ENTITLEMENT_BLOCKED`
  - `READ_ONLY` + write action => `ENTITLEMENT_READ_ONLY`
- Subscription state gate behavior:
  - `WRITE` when subscription is `FROZEN` => deny `SUBSCRIPTION_FROZEN`
- Branch status gate behavior:
  - `WRITE` on frozen branch => deny `BRANCH_FROZEN`
  - `READ` on frozen branch => allowed if assignment/membership gates pass.
