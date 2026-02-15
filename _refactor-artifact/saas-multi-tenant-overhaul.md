# SaaS Multi-Tenant Overhaul (Restart, KB-Aligned)

Status: **In Progress (Phase 8)**

This document lives in `_refactor-artifact/` to preserve implementation context, coordinate parallel dev work, and log progress.

This plan has been rewritten to align with the updated KB authentication model:
- self-registration (user-owned credentials)
- explicit tenant membership **invite + accept**
- invitation inbox + “zero memberships” flows

Related tracking docs:
- `_handbook/backend-workflow.md` (how we work: KB -> tests -> implementation; frontend-consumable conventions)
- `_handbook/dev-setup-wizard.md` (CLI wizard for fast demo + fixed OTP policy)

---

## Hard Decisions (Locked)

- **We will ship the restart under `/v0`** (capstone phase; unstable contract).
- The existing `/v1` prototype contract is considered **broken/legacy** (prototype repo; no production data).
- `/v0` context propagation uses a **working context in token** model:
  - access tokens carry optional `tenantId` and `branchId`
  - tenant/branch selection (and switching) re-issues tokens
  - feature endpoints do not accept `tenantId` / `branchId` overrides via query/body/headers
- We will **adopt KB strictly** for IdentityAccess + OrgAccount + WorkForce + AccessControl.
- We will not mutate KB to fit the codebase.
  - Repo-level deviations and implementation choices go under `_implementation_decisions/`.

---

## Goal (What “Multi-Tenant SaaS” Means Here)

Support **one global identity** (`AuthAccount`) operating across **multiple tenants** safely, with:
- strict tenant isolation (no cross-tenant reads/writes)
- explicit tenant selection (post-auth)
- explicit branch selection for branch-scoped work
- deterministic branch access enforcement via **explicit branch assignment**
- central authorization surface (fail closed)
- invite/accept onboarding (no admin-set passwords)

Authoritative product intent is in `knowledge_base/BusinessLogic/`:
- `BusinessLogic/4_process/20_IdentityAccess/10_identity_activation_recovery_orchestration.md`
- `BusinessLogic/4_process/20_OrgAccount/10_tenant_membership_administration_process.md`
- `BusinessLogic/4_process/10_WorkForce/05_staff_provisioning_orchestration.md`
- `BusinessLogic/5_modSpec/10_IdentityAccess/authentication_module.md`
- `BusinessLogic/5_modSpec/10_IdentityAccess/accessControl_module.md`
- `BusinessLogic/2_domain/10_Identity&Authorization/tenant_membership_domain.md`

---

## Non-Goals (For This Pass)

- Full Subscription/Billing engine implementation (we will keep the decision surface compatible with entitlements).
- Device fleet / terminal identity management.
- SSO / OAuth.
- Refactor of legacy “prototype modules” not required for the new vertical slice (example: `accountSettings`).

---

## KB Model Summary (What Changed vs Prototype)

### Identity (AuthAccount)
- One global identity per human.
- Phone-first (Phase 0), OTP verification.
- **Basic profile fields live in AuthAccount** (first name, last name, gender, DOB).
- Credentials are **user-owned**:
  - owner/admin never creates or knows staff passwords

### Tenant Membership (Belonging + Role)
- Membership is a stable fact: `(tenant_id, auth_account_id)`.
- Tenant-scoped `role_key` (extendable, consumed by Access Control).
- Membership lifecycle includes `INVITED`, `ACTIVE`, `DISABLED`, `ARCHIVED`.
- Invite/accept is explicit:
  - Invite creates membership in `INVITED`.
  - Accept changes to `ACTIVE`.

### WorkForce (Operational View)
- Staff profile + branch assignments are created **after** invite acceptance.
- Branch access is always explicit (no implicit “admin can access all branches”).

### Context Selection (Post-Auth)
From `10_identity_activation_recovery_orchestration.md`:
- 0 ACTIVE memberships:
  - user can create tenant (run business), or
  - open invitation inbox (accept/reject pending invites)
- 1 ACTIVE membership:
  - auto-select tenant
- 2+ ACTIVE memberships:
  - user must select tenant
- Branch resolution:
  - 0 eligible branches: no branch-scoped operations
  - 1 eligible branch: auto-select
  - 2+ eligible branches: user must select branch

---

## Target State (To-Be)

### AuthN (Authentication)
- Owns:
  - register, OTP verify, login
  - sessions (issue/refresh/revoke)
  - password lifecycle (set/reset/change)
  - issues access tokens that carry the “working context” (`tenantId`, `branchId`) when selected
- Consumes:
  - tenant memberships (ACTIVE/INVITED) for context resolution
  - branch assignments for context resolution

### AuthZ (Access Control)
- Single decision surface (central gate):
  - `Authorize(actorAuthAccountId, tenantId, branchId?, actionKey) -> ALLOW/DENY (+ reason)`
- Mandatory rules:
  - branch context required for BRANCH-scoped actions
  - branch assignment required for BRANCH-scoped actions
  - fail closed if required facts cannot be verified

### Data Isolation
- Every query is scoped by `tenant_id` (and `branch_id` when branch-scoped).
- “By ID” lookups always include tenant guard (and branch guard where applicable).

---

## API Surface Strategy

All new endpoints for the restart live under:
- **`/v0/*`**

Rationale:
- this is a capstone-phase backend, and `/v0` communicates “expect breaking changes”
- we avoid the false promise that `/v1` implies a stable contract

Notes:
- Existing `/v1/*` endpoints (prototype) may be removed or left as legacy during transition, but are not part of the new contract.

---

## MVP Action Catalog (AccessControl)

We need a minimal set of stable action keys early to unblock module work.

Proposed baseline (expand later):
- `auth.session.refresh`
- `tenant.create`
- `tenant.membership.invite`
- `tenant.membership.accept`
- `tenant.membership.reject`
- `tenant.membership.changeRole`
- `tenant.membership.revoke`
- `branch.create`
- `branch.assignStaff`
- `attendance.checkIn`
- `attendance.checkOut`
- `cashSession.open`
- `cashSession.close`
- `sale.create`
- `sale.finalize`
- `reports.view`

Note:
- The exact list is not the KB source of truth, but it must stay compatible with `accessControl_module.md`.

---

## Phased Plan (Restart Build)

### Phase 0 — Reset + Guard Rails
- Define the new module boundaries and folder structure for the restart.
- Confirm `/v0` routing + any temporary legacy `/v1` passthrough (if we keep it at all).
- Establish migration tracking (no “re-apply all SQL every run”).
- Add a minimal cross-tenant safety test harness (ID guessing must fail).

Deliverables:
- app boots with DB migrations
- a basic `GET /health` endpoint
- empty access-control middleware hook in request pipeline

### Phase 1 — AuthAccount + Session (Self-Registration First)
- Register (collect phone, password, basic profile fields).
- OTP send + OTP verify (rate-limited).
- Login (phone + password) issues session.
- Refresh token flow (rotation preferred).
- Logout revokes session.
- Audit events for security actions.

Acceptance:
- A self-registered user can authenticate even with **zero tenant memberships**.

### Phase 2 — Tenant Membership (Invite + Inbox + Accept/Reject)
- Invite member by phone:
  - resolves/provisions `auth_account_id` by phone
  - creates membership in `INVITED`
  - records invited_by + invited_at
- Invitation inbox:
  - list INVITED memberships for current auth account
  - accept invite (INVITED -> ACTIVE)
  - reject invite (implementation choice: mark rejected or archive)
- Role change + revoke membership flows (admin/owner).

Acceptance:
- Invite/accept produces ACTIVE membership and is immediately visible to Access Control.

### Phase 3 — Tenant Provisioning (Create Business)
- Create tenant (OWNER membership created for the creator).
- Add first branch (or “activate first branch” flow).

Acceptance:
- User with 0 memberships can create tenant and immediately become ACTIVE owner/admin.

### Phase 4 — WorkForce Provisioning (After Acceptance)
From `05_staff_provisioning_orchestration.md`:
- After membership acceptance:
  - create StaffProfile (operational view)
  - create BranchAssignment(s) from pending assignment list
- Admin/owner can assign a member to branches (explicit).

Open design point:
- where to store “pending branch list” on invitation (membership metadata vs dedicated table).

Acceptance:
- After accepting an invite, the user has explicit branch assignments and can resolve branch context.

### Phase 5 — Context Resolution (Tenant + Branch Selection)
Implement Flow C/D from `10_identity_activation_recovery_orchestration.md`:
- List ACTIVE memberships for tenant selection.
- Represent “0 memberships” state explicitly (create tenant, invitation inbox).
- List eligible branches for branch selection:
  - ACTIVE assignments + ACTIVE branches only
  - return “no branch assigned” state clearly
- Issue a new access token bound to the selected tenant/branch context.

Acceptance:
- Multi-tenant identity can select/switch tenant.
- Multi-branch identity can select/switch branch.
- Branch-scoped actions cannot proceed without branch context.

### Phase 6 — Access Control (Central Gate)
Implement `Authorize(...)` per `accessControl_module.md`:
- action metadata (scope/effect)
- tenant/branch status gates (basic scaffolding)
- membership gate (ACTIVE only)
- branch assignment gate (BRANCH actions)
- role policy mapping (code-defined for MVP)

Acceptance:
- All branch-scoped endpoints deny when branch assignment is missing.
- All tenant-scoped endpoints deny when membership is missing.

### Phase 7 — Tenant Isolation Sweep (New Code Only)
- Enforce a “tenant guard” rule in repositories:
  - no `WHERE id = $1` without tenant guard for tenant-owned entities
- Add negative tests:
  - a valid auth account cannot read another tenant’s resources by guessing IDs.

Acceptance:
- Cross-tenant access by ID guessing is not possible.

### Phase 8 — First Product Vertical Slice (To Prove the Platform)
Pick one branch-scoped workflow to validate the platform end-to-end:
- cash session open/close, or
- attendance check-in/out

Selected for this pass:
- attendance check-in/out

Acceptance:
- The workflow works only when:
  - authenticated
  - has ACTIVE membership for tenant
  - has ACTIVE assignment to branch
  - is authorized by role policy

---

## Open Questions (To Resolve Early)

- Do we keep any legacy `/v1/*` prototype endpoints mounted during the transition, or remove them immediately?
- Invitation rejection semantics: `REJECTED` vs `ARCHIVED` vs separate field.
- Do owners always get a StaffProfile + branch assignments by default?
- Minimum audit event set for membership and context selection (for later reconciliation).

---

## Progress Log

| Date (YYYY-MM-DD) | Note |
|---|---|
| 2026-02-11 | Prototype-era work: added `/v1/auth/*` context-switch endpoints. This will likely be discarded in the restart. |
| 2026-02-13 | Plan rewritten to align with KB update: self-registration + explicit invite/accept + invitation inbox + zero-membership flows. |
| 2026-02-13 | Locked `/v0` context propagation: working context is carried in access tokens; Auth selection/switch endpoints re-issue tokens. |
| 2026-02-13 | Phase 0 started: migration tracking added via `schema_migrations` checksum guard, `/v0/health` added, and `/v0` access-control middleware hook wired as a no-op placeholder. |
| 2026-02-13 | Phase 0 safety harness added: integration test for tenant-guarded reads/writes (`tenant-isolation-harness.int.test.ts`). |
| 2026-02-13 | Phase 1 started: added `/v0/auth` scaffold (register, OTP send/verify, login, refresh, logout) with fixed OTP support in non-production and account-level sessions. |
| 2026-02-13 | Locked fresh DB restart decision: active migration chain reset to v0 baseline; legacy SQL moved to `_archived`; auth phase decoupled from legacy `employees` table until membership phase lands. |
| 2026-02-13 | Phase 1 hardening: added OTP resend/rate controls, auth audit event table (`v0_auth_audit_events`), and `/v0` auth API contract doc (`api_contract/auth-v0.md`). |
| 2026-02-13 | Phase 2 commenced: added `v0_tenant_memberships`, invite/inbox/accept/reject/role-change/revoke endpoints, and JWT auth middleware for protected `/v0/auth/memberships/*` routes. |
| 2026-02-13 | Phase 3 commenced: added `/v0/auth/tenants` to provision tenant + owner membership + first branch in one operation, with integration coverage for zero-membership -> owner flow. |
| 2026-02-13 | Phase 4 commenced: added workforce projection tables (`v0_staff_profiles`, pending/active branch assignments), invite-accept hydration into staff/branch assignment, and explicit owner/admin branch assignment endpoint. |
| 2026-02-13 | Phase 5 commenced: added tenant/branch context resolution endpoints and token re-issue flows (`/v0/auth/context/*`) with integration coverage for 0/1/many membership and branch-selection states. |
| 2026-02-13 | Phase 6 commenced: replaced `/v0` access-control no-op with centralized gate enforcing ACTIVE tenant membership and branch assignment using route metadata + role policy, with dedicated integration coverage. |
| 2026-02-13 | Phase 7 commenced: hardened privileged membership mutations with requester-tenant-guarded repository lookup (`findMembershipForRequesterAction`) and added cross-tenant ID-guessing integration coverage (`v0-tenant-isolation.int.test.ts`). |
| 2026-02-13 | Auth provider pivot: `/v0/auth` account/otp/login flows now support Supabase Auth as primary provider (`V0_AUTH_PROVIDER=supabase`) with local provider fallback for integration tests. |
| 2026-02-15 | Phase 8 commenced with Attendance vertical slice: added `/v0/attendance` (check-in/check-out/me), `v0_attendance_records` migration, access-control route metadata for branch-scoped attendance actions, integration coverage (`v0-attendance.int.test.ts`), and API contract (`api_contract/attendance-v0.md`). |
