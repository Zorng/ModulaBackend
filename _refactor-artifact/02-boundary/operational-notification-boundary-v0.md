# Operational Notification Module Boundary (v0)

Status: Account-scope implemented and relocked  
Owner context: `PlatformSystem`  
Canonical route prefix: `/v0/notifications`

## 1) Module Identity

- Module name: `operationalNotification`
- Primary KB references:
  - modSpec: `knowledge_base/BusinessLogic/5_modSpec/60_PlatformSystems/operationalNotification_module.md`
  - process: `knowledge_base/BusinessLogic/4_process/60_PlatformSystems/30_operational_notification_emission_process.md`
  - domain: `knowledge_base/BusinessLogic/2_domain/60_PlatformSystems/operational_notification_domain.md`
  - edge cases: `knowledge_base/BusinessLogic/3_contract/10_edgecases/operational_notification_edge_case_sweep.md`

## 2) Owned Facts (Source of Truth)

- Owned tables/projections (planned):
  - `v0_operational_notifications`
  - `v0_operational_notification_recipients`
- Invariants:
  - `(tenant_id, dedupe_key)` unique to guarantee idempotent emission
  - `(notification_id, recipient_account_id)` unique to avoid duplicate recipient rows
  - notifications are immutable after insert (read state is recipient-level mutation)
  - read/unread state is per recipient only

## 3) Consumed Facts (Read Dependencies)

- Access Control:
  - consumed fact: recipient eligibility in `(tenant_id, branch_id)`
  - why: compute approver/oversight recipient pool without leakage
  - consistency mode: strong at emission/read time
- Auth context:
  - consumed fact: `accountId` from authenticated access token
  - why: scope account-level inbox reads and mark-read commands
  - consistency mode: strong
- OrgAccount membership/assignment:
  - consumed fact: current active membership + branch assignment for recipients
  - why: avoid cross-tenant/branch recipient leakage on account-scoped reads
  - consistency mode: strong (through access control)

## 4) Commands (Write Surface)

- Endpoint: `POST /v0/notifications/:notificationId/read`
  - Action key: `operationalNotification.read.mark`
  - Scope/effect: `ACCOUNT / WRITE`
  - Allowed roles: authenticated account only; visibility constrained by recipient row + active access
  - Idempotency required: no (idempotent by state transition)
- Endpoint: `POST /v0/notifications/read-all`
  - Action key: `operationalNotification.read.markAll`
  - Scope/effect: `ACCOUNT / WRITE`
  - Allowed roles: authenticated account only; visibility constrained by recipient row + active access
  - Idempotency required: no

Internal command seam (best-effort producer API, no public HTTP):
- `EmitOperationalNotification`
  - inputs: `tenantId`, `branchId`, `type`, `subjectType`, `subjectId`, `dedupeKey`, payload
  - behavior: insert notification + recipients idempotently; failures logged, not business-blocking

## 5) Queries (Read Surface)

- Endpoint: `GET /v0/notifications/inbox`
  - Action key: `operationalNotification.inbox.list`
  - Scope/effect: `ACCOUNT / READ`
- Endpoint: `GET /v0/notifications/unread-count`
  - Action key: `operationalNotification.inbox.unreadCount`
  - Scope/effect: `ACCOUNT / READ`
- Endpoint: `GET /v0/notifications/:notificationId`
  - Action key: `operationalNotification.read`
  - Scope/effect: `ACCOUNT / READ`

## 6) Event Contract

Produced (platform observational):
- `OPERATIONAL_NOTIFICATION_EMITTED`
- `OPERATIONAL_NOTIFICATION_READ`

Subscribed (business transitions):
- `CASH_SESSION_CLOSED` (ON-04 baseline)
- `VOID_REQUEST_CREATED_PENDING` (ON-01, when sale module is available)
- `SALE_VOIDED` (ON-02, when sale module is available)
- `SALE_VOID_REJECTED` (ON-03, when sale module is available)

Trigger guard (locked):
- do not emit ON-01 from `sale.status=VOID_PENDING` transition by itself.
- ON-01 must be keyed to explicit pending-approval request creation only.

## 7) Access Control Mapping (Locked Target)

- `GET /notifications/inbox` -> `operationalNotification.inbox.list`
- `GET /notifications/unread-count` -> `operationalNotification.inbox.unreadCount`
- `GET /notifications/:notificationId` -> `operationalNotification.read`
- `POST /notifications/:notificationId/read` -> `operationalNotification.read.mark`
- `POST /notifications/read-all` -> `operationalNotification.read.markAll`

Visibility baseline:
- account-scoped reads/writes are allowed only over recipient rows still backed by active membership + branch access

## 8) Failure/Reason Codes (Module-specific)

- `NOTIFICATION_NOT_FOUND`
- `NOTIFICATION_ACCESS_DENIED`
- `NOTIFICATION_EMISSION_FAILED` (internal telemetry classification; not business rollback trigger)

## 9) API Contract Docs

- Canonical contract file: `api_contract/operational-notification-v0.md`
