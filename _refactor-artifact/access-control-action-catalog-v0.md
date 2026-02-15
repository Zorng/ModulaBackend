# v0 Access Control Action Catalog (F2)

Status: Draft (F2 in progress)
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
| `auth.membership.invite` | TENANT | WRITE | OWNER, ADMIN | - |
| `auth.membership.invitations.list` | GLOBAL | READ | - | - |
| `auth.membership.invitation.accept` | GLOBAL | WRITE | - | - |
| `auth.membership.invitation.reject` | GLOBAL | WRITE | - | - |
| `auth.membership.role.change` | TENANT | WRITE | OWNER, ADMIN | - |
| `auth.membership.revoke` | TENANT | WRITE | OWNER, ADMIN | - |
| `auth.membership.branches.assign` | TENANT | WRITE | OWNER, ADMIN | - |
| `tenant.provision` | GLOBAL | WRITE | - | - |
| `attendance.checkIn` | BRANCH | WRITE | - | `attendance` |
| `attendance.checkOut` | BRANCH | WRITE | - | `attendance` |
| `attendance.listMine` | BRANCH | READ | - | `attendance` |
| `org.tenant.current.read` | TENANT | READ | - | - |
| `org.branches.accessible.read` | TENANT | READ | - | - |
| `org.branch.current.read` | BRANCH | READ | - | - |

## Route Mapping

| Method | Path Pattern | Action Key | Tenant Source | Branch Source |
|---|---|---|---|---|
| GET | `/auth/context/tenants` | `auth.context.tenants.list` | - | - |
| POST | `/auth/context/tenant/select` | `auth.context.tenant.select` | `body.tenantId` | - |
| GET | `/auth/context/branches` | `auth.context.branches.list` | `token` | - |
| POST | `/auth/context/branch/select` | `auth.context.branch.select` | `token` | `body.branchId` |
| POST | `/auth/memberships/invite` | `auth.membership.invite` | `body.tenantId` | - |
| GET | `/auth/memberships/invitations` | `auth.membership.invitations.list` | - | - |
| POST | `/auth/memberships/invitations/:id/accept` | `auth.membership.invitation.accept` | - | - |
| POST | `/auth/memberships/invitations/:id/reject` | `auth.membership.invitation.reject` | - | - |
| POST | `/auth/memberships/:id/role` | `auth.membership.role.change` | `path.membershipId` | - |
| POST | `/auth/memberships/:id/revoke` | `auth.membership.revoke` | `path.membershipId` | - |
| POST | `/auth/memberships/:id/branches` | `auth.membership.branches.assign` | `path.membershipId` | - |
| POST | `/auth/tenants` | `tenant.provision` | - | - |
| POST | `/attendance/check-in` | `attendance.checkIn` | `token` | `token` |
| POST | `/attendance/check-out` | `attendance.checkOut` | `token` | `token` |
| GET | `/attendance/me` | `attendance.listMine` | `token` | `token` |
| GET | `/org/tenant/current` | `org.tenant.current.read` | `token` | - |
| GET | `/org/branches/accessible` | `org.branches.accessible.read` | `token` | - |
| GET | `/org/branch/current` | `org.branch.current.read` | `token` | `token` |

## Notes

- `/v0` now fails closed for unregistered routes:
  - request to an unknown `/v0/*` path is denied with `ACCESS_CONTROL_ROUTE_NOT_REGISTERED`.
- Entitlement checks are currently a wired seam and return allow; enforcement is planned for F3.
- Branch status gate behavior:
  - `WRITE` on frozen branch => deny `BRANCH_FROZEN`
  - `READ` on frozen branch => allowed if assignment/membership gates pass.
