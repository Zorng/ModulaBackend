# Push Sync (Replay) Module Boundary (v0)

Status: Phase S1 locked  
Owner context: `PlatformSystem`  
Canonical route prefix: `/v0/sync/push`

## 1) Module Identity

- Module name: `pushSync`
- Primary KB references:
  - modSpec: `knowledge_base/BusinessLogic/5_modSpec/60_PlatformSystems/offlineSync_module.md`
  - domain: `knowledge_base/BusinessLogic/2_domain/60_PlatformSystems/offline_sync_domain.md`
  - processes:
    - `knowledge_base/BusinessLogic/4_process/60_PlatformSystems/60_offline_operation_queue_process.md`
    - `knowledge_base/BusinessLogic/4_process/60_PlatformSystems/70_offline_sync_replay_process.md`
    - `knowledge_base/BusinessLogic/4_process/60_PlatformSystems/65_offline_sync_pull_hydration_process.md` (sibling process; pull/hydration lane)
  - edge cases: `knowledge_base/BusinessLogic/3_contract/10_edgecases/offline_sync_edge_case_sweep.md`

## 2) Owned Facts (Source of Truth)

- Owned tables/projections (planned):
  - `v0_offline_sync_batches`
  - `v0_offline_sync_operations`
- Invariants:
  - each replay operation identity `(tenant_id, branch_id, client_op_id)` is unique
  - replay outcome is immutable per op (`APPLIED | FAILED`) once finalized
  - operations are processed FIFO within a batch
  - dependent failures are explicit (no silent skip)

## 3) Consumed Facts (Read Dependencies)

- Access Control:
  - consumed fact: authorization, role policy, membership/assignment, tenant/branch status
  - why: replay must revalidate as online command execution
  - consistency mode: strong
- Idempotency service:
  - consumed fact: existing command idempotency behavior for underlying write commands
  - why: exactly-once replay semantics
  - consistency mode: strong
- Business command handlers:
  - consumed seams: command entrypoints for supported op types
  - why: offline sync orchestrates replay; business modules remain source of truth

## 4) Commands (Write Surface)

- Endpoint: `POST /v0/sync/push`
  - Action key: `pushSync.apply`
  - Scope/effect: `BRANCH / WRITE`
  - Allowed roles: `OWNER`, `ADMIN`, `MANAGER`, `CASHIER`
  - Idempotency required: no per-request header; replay idempotency uses per-operation `clientOpId`

Supported operation types (locked target):
- `sale.finalize` (cash only baseline)
- `cashSession.open`
- `cashSession.movement`
- `cashSession.close`
- `attendance.startWork`
- `attendance.endWork`

Replay envelope fields (locked):
- `clientOpId`
- `operationType`
- `tenantId`
- `branchId`
- `occurredAt` (client timestamp, audit/reference only)
- `payload`

## 5) Queries (Read Surface)

- Endpoint: `GET /v0/sync/push/batches/:batchId`
  - Action key: `pushSync.read`
  - Scope/effect: `BRANCH / READ`
  - purpose: troubleshooting/reconciliation visibility for replay outcomes

## 6) Event Contract

Produced:
- `OFFLINE_SYNC_REPLAY_APPLIED`
- `OFFLINE_SYNC_REPLAY_FAILED`

Subscribed:
- none (HTTP-triggered replay pipeline in v0 baseline)

## 7) Access Control Mapping (Locked Target)

- `POST /sync/push` -> `pushSync.apply`
- `GET /sync/push/batches/:batchId` -> `pushSync.read`

Entitlement baseline:
- `core.pos` for replayed operational writes

## 8) Failure/Reason Codes (Module-specific + propagated)

Module-specific:
- `OFFLINE_SYNC_CONTEXT_MISMATCH`
- `OFFLINE_SYNC_OPERATION_NOT_SUPPORTED`
- `OFFLINE_SYNC_DEPENDENCY_MISSING`
- `OFFLINE_SYNC_PAYLOAD_INVALID`

Propagated deterministic denials:
- `BRANCH_FROZEN`
- `SUBSCRIPTION_FROZEN`
- `ENTITLEMENT_BLOCKED`
- `ENTITLEMENT_READ_ONLY`
- `NO_MEMBERSHIP`
- `NO_BRANCH_ACCESS`
- `PERMISSION_DENIED`

## 9) API Contract Docs

- Canonical contract file: `api_contract/push-sync-v0.md`
