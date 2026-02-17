# Module Boundary Realignment Plan (`/v0`)

Status: Draft (Ready to Execute)
Owner: backend
Date: 2026-02-17

## 1) Why this artifact exists

We already stabilized core platform seams (Access Control, Entitlements, Idempotency, Audit, Outbox).
Current drift is now mainly boundary drift:
- `auth` still owns OrgAccount responsibilities.
- command/action/event ownership is mixed (`auth.membership.*`, `tenant.provision` under `/v0/auth/*`).
- future modules will copy this drift if we do not lock boundaries now.

This artifact defines:
- the current boundary assessment,
- the KB-aligned target boundary,
- a phased realignment plan,
- command/event ownership rules for implemented and future modules.

## 2) Source of truth used

- `knowledge_base/BusinessLogic/5_modSpec/10_IdentityAccess/authentication_module.md`
- `knowledge_base/BusinessLogic/5_modSpec/10_IdentityAccess/accessControl_module.md`
- `knowledge_base/BusinessLogic/5_modSpec/20_OrgAccount/tenant_module.md`
- `knowledge_base/BusinessLogic/5_modSpec/20_OrgAccount/branch_module.md`
- `knowledge_base/BusinessLogic/5_modSpec/30_HR/staffManagement_module.md`
- `knowledge_base/BusinessLogic/4_process/20_OrgAccount/05_tenant_provisioning_orchestration.md`
- `knowledge_base/BusinessLogic/4_process/20_OrgAccount/10_tenant_membership_administration_process.md`
- `knowledge_base/BusinessLogic/4_process/20_IdentityAccess/10_identity_activation_recovery_orchestration.md`
- `knowledge_base/BusinessLogic/2_domain/10_Identity&Authorization/tenant_membership_domain.md`
- `_implementation_decisions/ADR-20260217-v0-audit-vs-observability-separation.md`

## 3) Current-state boundary assessment

## 3.1 What is currently implemented

- `src/modules/v0/auth`
- `src/modules/v0/orgAccount`
- `src/modules/v0/attendance`
- `src/modules/v0/subscription`
- `src/modules/v0/audit`

## 3.2 Drift summary

### `auth` module currently includes multiple bounded contexts

Observed in `src/modules/v0/auth/api/router.ts` + `src/modules/v0/auth/app/*`:
- AuthN flows (expected): register/login/refresh/logout/OTP.
- Context selection (acceptable in Auth process boundary): tenant/branch selection + token re-issue.
- Tenant provisioning (OrgAccount responsibility): `POST /v0/auth/tenants`.
- Membership administration (OrgAccount responsibility): invite/accept/reject/role/revoke.
- Branch assignment writes (HR StaffManagement responsibility): assign membership branches.
- Staff projection writes (HR responsibility) from Auth repo methods:
  - `ensureStaffProfileForMembership`
  - pending branch assignment operations
  - branch assignment operations

### `orgAccount` module is read-only only

Observed in `src/modules/v0/orgAccount/*`:
- only current tenant/branch profile reads.
- no tenant provisioning command.
- no membership administration command.
- no branch lifecycle/profile update command.

### Access-control/action catalog follows current drift

Observed in `src/platform/access-control/route-registry.ts` and `src/platform/access-control/action-catalog.ts`:
- membership actions are currently named under `auth.membership.*`.
- tenant provisioning action is currently called `tenant.provision` but routed via `/v0/auth/tenants`.
- route ownership signals do not match KB module ownership.

### Event catalog mirrors drift

Observed in `_refactor-artifact/v0-command-outbox-event-catalog.md`:
- membership events are `AUTH_MEMBERSHIP_*`.
- tenant provisioning endpoint metadata references `/v0/auth/tenants`.

## 4) Target boundary model (KB-aligned)

## 4.1 Module ownership map

### IdentityAccess

#### `Auth` (AuthN only)
Owns:
- register/login/refresh/logout.
- OTP + password lifecycle.
- session issuance/revocation.
- context selection process outputs (tenant/branch selected in token).

Does not own:
- tenant creation.
- membership lifecycle.
- branch assignment lifecycle.

### OrgAccount

#### `Tenant`
Owns:
- tenant lifecycle and profile.
- tenant provisioning command (`Create Business`).
- tenant status facts.

#### `TenantMembership`
Owns:
- membership facts + lifecycle (`INVITED/ACTIVE/DISABLED/ARCHIVED`).
- membership governance facts (`membership_kind`, `role_key`).
- membership admin commands (invite/accept/reject/role/revoke).

### HR

#### `StaffManagement`
Owns:
- staff profile lifecycle.
- explicit branch assignment lifecycle.
- pending branch assignment intent (before invite acceptance).

#### `Attendance`
Owns:
- attendance records and attendance-specific rules.

### PlatformSystems

Owns cross-cutting or platform concerns:
- AccessControl authorization decision surface.
- SubscriptionEntitlements read model and enforcement state.
- Idempotency gate.
- Audit logging.
- Outbox dispatch.
- later: JobScheduler, WebhookGateway, Policy, OfflineSync, Notification, Printing.

### POSOperation / Reporting (future)

Owns business domains only:
- Menu, Inventory, Sale, CashSession, Receipt, Report.
- must consume platform and org facts, not re-own them.

## 4.2 Folder-level target structure (v0)

Recommended target under `src/modules/v0/`:
- `auth/` (AuthN + context-selection read/issue)
- `orgAccount/tenant/`
- `orgAccount/membership/`
- `hr/staffManagement/`
- `hr/attendance/`
- `subscription/`
- `audit/`

Note:
- Keep current top-level modules runnable during migration.
- Structure above can be reached incrementally (no big-bang rewrite required).

## 4.3 PlatformSystems split (to remove ambiguity)

PlatformSystems in KB currently mixes two kinds of modules. We should name them explicitly in repo/workflow:

### A) Backend Platform Foundations (cross-cutting runtime primitives)

- Access Control
- Idempotency Gate
- Offline Sync
- Job Scheduler
- Webhook Gateway
- Fair-Use Limits
- System Observability (logs/metrics/traces)

Characteristics:
- no product-facing business ownership (they enforce/guard, not sell/operate business workflows)
- consumed by many modules
- mostly technical invariants (security, integrity, reliability)

### B) Product Platform Capabilities (business-facing platform modules)

- Subscription & Entitlements
- Policy
- Printing & Peripherals
- Operational Notification
- Audit Logging (business governance audit trail)

Characteristics:
- still cross-module, but they carry business semantics visible to product behavior
- drive user-visible capabilities and commercial enforcement outcomes
- should have clear domain contracts, not be treated as infra utilities

### Boundary rule

Backend Platform Foundations must not own business state machines.
Product Platform Capabilities may own business-facing facts, but must not absorb Identity, OrgAccount, HR, or POS module truths.

### Audit separation rule (locked)

Use two separate logging systems:

- `Business Audit Log` (product capability)
  - purpose: tenant/branch governance and owner/admin accountability
  - data: actor/action/outcome/entity refs with tenant/branch scope
  - access: tenant-scoped privileged users only

- `System Observability` (backend foundation)
  - purpose: reliability/performance/security monitoring
  - data: request and runtime telemetry (latency/errors/throughput), minimal business context
  - access: engineering/ops only

They may share correlation IDs (`request_id`, `idempotency_key`, `outbox_id`) but must not be stored as one mixed log stream.

### Implementation placement rule (`src/`)

- Backend Platform Foundations live under `src/platform/*`.
- Product Platform Capabilities live under `src/modules/v0/*` (with module APIs/contracts like other business modules).
- Shared low-level ports/types remain under `src/shared/*`.

## 5) Command/API ownership target

## 5.1 API boundary target

### Keep in `/v0/auth/*`
- register/login/refresh/logout/OTP
- context list/select endpoints

### Move out of `/v0/auth/*`
- `POST /v0/auth/tenants` -> OrgAccount (`/v0/org/tenants`)
- all membership admin endpoints -> OrgAccount membership surface
- membership branch assignment write endpoint -> HR StaffManagement surface

## 5.2 Action-key target direction

Current keys are functional but boundary-noisy.
Target naming for new work should follow domain ownership:
- `org.tenant.provision`
- `org.membership.invite`
- `org.membership.invitation.accept`
- `org.membership.invitation.reject`
- `org.membership.role.change`
- `org.membership.revoke`
- `hr.staff.branch.assign`

Migration note:
- keep compatibility aliases in AccessControl during transition.
- remove old keys only after endpoint migration + test parity.

## 6) Event ownership target

Outbox event naming should indicate the owning module of the state change.

Suggested direction:
- tenant provisioning: `ORG_TENANT_PROVISIONED`
- membership lifecycle: `ORG_MEMBERSHIP_*`
- staff branch assignment lifecycle: `HR_STAFF_BRANCH_*`
- attendance remains `ATTENDANCE_*`

Migration note:
- keep accepting old event types in subscribers until all producers are moved.

## 7) Realignment phases

## Phase B0 — Lock boundaries + naming policy

Deliverables:
- this artifact approved.
- ownership matrix approved.
- naming policy approved (actions/events/routes).

Exit criteria:
- no new `/v0` endpoint is added without explicit owner module.

## Phase B1 — Extract tenant provisioning from Auth to OrgAccount

Scope:
- move tenant provisioning service/repo methods out of `auth`.
- expose OrgAccount command endpoint for tenant provision.
- keep temporary route alias in `auth` that delegates (compat mode).

Exit criteria:
- source of truth for tenant provisioning is OrgAccount.
- tests pass with both canonical route and temporary alias.

## Phase B2 — Extract membership lifecycle from Auth to OrgAccount

Scope:
- move membership command handlers from `auth` to OrgAccount membership module.
- keep Auth limited to identity/session/context.
- keep atomic command contract unchanged.

Exit criteria:
- OrgAccount owns membership commands and repository writes.
- access-control route registry and action catalog point to OrgAccount ownership.

## Phase B3 — Extract branch assignment + staff projection to HR StaffManagement

Scope:
- move pending/active branch assignment writes to HR StaffManagement.
- move `ensureStaffProfileForMembership` ownership to HR.
- OrgAccount membership acceptance triggers HR side effects through defined process contract.

Execution rule:
- keep transactional consistency via orchestration boundary (single transaction in modular monolith).

Exit criteria:
- Auth and OrgAccount no longer write HR tables directly.

## Phase B4 — AccessControl and contract realignment

Scope:
- update route registry ownership and action keys.
- keep alias keys for compatibility during rollout.
- update `api_contract/*` to canonical paths/keys.

Exit criteria:
- access-control metadata reflects final ownership model.

## Phase B5 — Outbox event catalog realignment

Scope:
- update producer event types and endpoint metadata in payload.
- keep temporary subscriber compatibility for old event names.
- update `_refactor-artifact/v0-command-outbox-event-catalog.md`.

Exit criteria:
- event catalog labels are boundary-consistent.

## Phase B6 — Scaffold boundary template for not-yet-implemented modules

Scope:
- add a lightweight module-boundary template for future modules.
- include required sections: owner facts, consumed facts, action keys, event types, API surface, tests.

Exit criteria:
- new POS/Reporting modules follow the same boundary contract from first commit.

## 8) Testing strategy during realignment

- Unit tests stay local to each module (`src/modules/v0/*/tests/unit`).
- Integration tests stay under `src/integration-tests/*` and verify:
  - old route alias compatibility (temporary)
  - canonical route behavior
  - AccessControl reason-code parity
  - command atomicity parity (business + audit + outbox)
- Remove alias tests only when compatibility routes are deleted.

## 9) Guardrails to prevent boundary drift

- Guardrail 1: no cross-module table writes in repositories.
  - each module repo writes only owned tables.
- Guardrail 2: cross-module side effects must be explicit orchestration (command process) or outbox subscriber.
- Guardrail 3: API route prefix must match ownership module.
- Guardrail 4: action key prefix must match ownership module.
- Guardrail 5: outbox event type prefix must match ownership module.
- Guardrail 6: every new endpoint must include owner + consumed facts in its contract doc.

## 10) Immediate next execution step

Start with **Phase B1** (tenant provisioning extraction), because it gives the highest ownership clarity with lowest blast radius.

## 11) Tracking

| Phase | Status | Notes |
|---|---|---|
| B0 Lock boundaries | Completed | Ownership split locked, including audit vs observability separation. |
| B1 Tenant provisioning extraction | Completed | Canonical command route moved to `POST /v0/org/tenants`; `POST /v0/auth/tenants` kept as compatibility alias. |
| B2 Membership extraction | In progress | Canonical membership lifecycle routes run under `/v0/org/memberships/*`; legacy `/v0/auth/memberships/*` aliases delegate to canonical OrgAccount commands and emit canonical `org.membership.*` actions/events. Remaining cleanup: move membership write internals from Auth-owned app/repo into OrgAccount-owned app/repo. |
| B3 Staff assignment/profile extraction | Not started |  |
| B4 AccessControl/contract realignment | Not started |  |
| B5 Outbox event naming realignment | Not started |  |
| B6 Future module template | Not started |  |
