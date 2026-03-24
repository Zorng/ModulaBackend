# Operational Notification Account-Scope Cutover (v0)

Status: Completed  
Owner: backend  
Started: 2026-03-24

## Goal

Move in-app operational notifications from tenant-scoped inbox semantics:

- `(tenantId, accountId)`

to account-scoped inbox semantics:

- `(accountId)`

while preserving strict recipient authorization and branch-aware emission rules.

## Why this cutover exists

Tenant-scoped notifications are coherent on the backend, but they create a UX boundary mismatch for frontend shell design:

- the bell wants to behave like a true account/global utility
- the current contract still requires tenant context to make the inbox meaningful
- this creates awkward behavior before tenant selection and during tenant/branch handoff

If notifications are intended to live on account/global shell surfaces, account scope is the cleaner long-term model.

## Current state (baseline)

Implemented today:

- inbox/count/detail/read/read-all/stream are tenant-scoped
- scope = `(tenantId, accountId)`
- branch remains origin metadata
- recipient resolution remains branch-aware at emit time

Current references:

- `api_contract/operational-notification-v0.md`
- `src/modules/v0/platformSystem/operationalNotification/api/router.ts`
- `src/modules/v0/platformSystem/operationalNotification/app/service.ts`
- `src/modules/v0/platformSystem/operationalNotification/app/realtime.ts`
- `src/modules/v0/platformSystem/operationalNotification/infra/repository.ts`

## Locked target (account scope)

### Inbox scope

- `GET /v0/notifications/inbox`
- `GET /v0/notifications/unread-count`
- `GET /v0/notifications/:notificationId`
- `POST /v0/notifications/:notificationId/read`
- `POST /v0/notifications/read-all`
- `GET /v0/notifications/stream`

Target scope:

- `(accountId)`

### Authorization rule

Account scope does not broaden access.

Visibility rule:

- an account only sees notifications for which it has a recipient row
- recipient resolution remains based on existing business rules at emit time
- account scope changes aggregation only, not authorization breadth

### Required origin metadata

Notification payloads must include:

- `tenantId`
- `tenantName`
- `branchId`
- `branchName`

Tenant and branch become metadata and optional filter dimensions, not primary inbox scope.

### Recommended list filters

- `tenantId`
- `branchId`
- `unreadOnly`
- `type`
- `limit`
- `offset`

## Explicitly out of scope

- push/email/SMS channels
- changing producer-side notification types
- changing recipient-resolution business rules
- deep-link UX policy for tenant/branch handoff
- workflow/task ownership features

## Main design implications

### 1) Access-control scope model

Current access-control scope model is built around:

- `GLOBAL`
- `TENANT`
- `BRANCH`

Account-scoped notifications likely require one of:

- adding a first-class `ACCOUNT` read/write scope, or
- a tightly-scoped notification-specific exception path

Preferred direction:

- add explicit account-level access-control scope support rather than hiding account scope behind tenant/global shortcuts

### 2) Auth/context behavior

Current tenant-scoped notification endpoints rely on tenant-context tokens.

Account-scoped notifications must work:

- before tenant selection
- without selected branch
- across all authorized recipient rows for the authenticated account

This means the notification read surface must accept account-authenticated context even when `tenantId = null` in the current token.

### 3) Realtime keying

Current stream key is tenant/account scoped.

Target stream key:

- `(accountId)`

Realtime payload must carry enough origin metadata for frontend to render rows without extra lookups:

- `tenantId`
- `tenantName`
- `branchId`
- `branchName`

## Execution phases

### Phase A1 — Contract + boundary relock

- update `api_contract/operational-notification-v0.md` from tenant scope to account scope
- update `_refactor-artifact/02-boundary/operational-notification-boundary-v0.md`
- lock account-scope semantics, filters, and payload metadata
- lock `tenantName` + `branchName` as required notification-origin fields

### Phase A2 — Access-control + auth context support

- extend access-control scope model for account-scoped notification reads/writes
- update route registry metadata for notification endpoints
- update context resolution so notification routes can run without selected tenant/branch
- keep authorization recipient-row based

Likely files:

- `src/platform/access-control/types.ts`
- `src/platform/access-control/context-resolvers.ts`
- `src/platform/access-control/action-catalog.ts`
- `src/platform/access-control/route-registry/reports-notification-sync-routes.ts`
- auth/session context services if needed

### Phase A3 — Query + command surface cutover

- change inbox/count/detail/read/read-all from tenant/account scope to account scope
- add optional `tenantId` filter to inbox
- add `tenantName` joins to inbox/detail payloads
- ensure mark-read and mark-all-read operate over current account recipient rows only

Likely files:

- `src/modules/v0/platformSystem/operationalNotification/api/router.ts`
- `src/modules/v0/platformSystem/operationalNotification/app/service.ts`
- `src/modules/v0/platformSystem/operationalNotification/infra/repository.ts`

### Phase A4 — Realtime cutover

- change stream from tenant/account scope to account scope
- change broker keying to account scope
- include `tenantName` in `notification.created`
- ensure `ready.unreadCount` is account-wide unread count

Likely files:

- `src/modules/v0/platformSystem/operationalNotification/app/realtime.ts`
- `src/modules/v0/platformSystem/operationalNotification/api/router.ts`
- `src/modules/v0/platformSystem/operationalNotification/app/service.ts`

### Phase A5 — Tests + rollout close-out

- integration coverage for account-level unread count without tenant selection
- integration coverage for cross-tenant aggregation limited to recipient rows
- integration coverage for `tenantId` and `branchId` inbox filters
- integration coverage for detail/read/read-all without tenant selection
- SSE test for account-level stream receiving notifications from multiple tenants
- frontend handoff examples for inbox/detail/stream payloads

Likely files:

- `src/integration-tests/v0-operational-notification.int.test.ts`
- `src/modules/v0/platformSystem/operationalNotification/tests/unit/realtime.test.ts`

## Risks / decision points

### Risk 1 — Access-control ambiguity

If account scope is introduced without a clear ACL model, notification routes may bypass the repo's current tenant-scoped protection assumptions.

Mitigation:

- make account scope explicit in access-control types and route metadata

### Risk 2 — Cross-tenant leakage

Account-scoped aggregation must never become blanket visibility across all tenants.

Mitigation:

- all reads remain restricted to recipient rows belonging to the authenticated account
- no query path should infer visibility from tenant membership alone

### Risk 3 — Tenant name resolution drift

Once scope becomes account-wide, `tenantName` becomes required render metadata.

Mitigation:

- join tenant/branch labels in repository reads and realtime payload construction

## Rollout rule

Do not partially advertise account-scoped notifications in the contract until the access-control and runtime behavior actually support no-tenant-selection reads.

## Tracking

| Phase | Status | Notes |
|---|---|---|
| A1 Contract + boundary relock | Completed | Updated `api_contract/operational-notification-v0.md` and `_refactor-artifact/02-boundary/operational-notification-boundary-v0.md` to lock account scope with tenant/branch origin metadata. |
| A2 Access-control + auth context support | Completed | Added `ACCOUNT` access-control scope and moved notification routes to account-authenticated access in `src/platform/access-control/*`. |
| A3 Query + command surface cutover | Completed | Inbox/count/detail/read/read-all now aggregate by `accountId` with optional `tenantId` / `branchId` filters and current-access recipient visibility in `src/modules/v0/platformSystem/operationalNotification/*`. |
| A4 Realtime cutover | Completed | Stream broker now keys by `accountId` and emits `tenantName` + `branchName` metadata. |
| A5 Tests + rollout close-out | Completed | Verified with targeted unit and integration coverage for account-token unread/inbox/detail/read/read-all/stream across tenants. |
