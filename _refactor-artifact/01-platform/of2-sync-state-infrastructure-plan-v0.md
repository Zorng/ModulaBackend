# OF2 Sync State Infrastructure Plan (v0)

Status: Implemented (initial)  
Owner: backend  
Date: 2026-02-19

## Implementation snapshot

Completed in codebase:
- migrations `029_create_v0_sync_changes.sql`, `030_create_v0_sync_client_checkpoints.sql`, `031_create_v0_sync_indexes.sql`
- account-scope extension migration `032_v0_sync_changes_account_scope.sql`
- `POST /v0/sync/pull` endpoint and cursor/checkpoint flow
- integration coverage in `src/integration-tests/v0-sync.int.test.ts`
- producer wiring currently live for `policy`, `cashSession`, `menu`, `discount`, `attendance`, `operationalNotification`

## Objective

Implement server-side sync state so `POST /v0/sync/pull` can return deterministic, ordered, incremental changes with tombstones.

## Proposed data model

### 1) `v0_sync_changes`

Purpose:
- canonical change feed per `(tenant_id, branch_id)`
- supports cursor-based incremental pull

Columns:
- `id UUID PRIMARY KEY DEFAULT gen_random_uuid()`
- `sequence BIGSERIAL NOT NULL` (global monotonic sequence)
- `tenant_id UUID NOT NULL`
- `branch_id UUID NOT NULL`
- `module_key VARCHAR(64) NOT NULL`
- `entity_type VARCHAR(64) NOT NULL`
- `entity_id TEXT NOT NULL`
- `operation VARCHAR(16) NOT NULL` (`UPSERT | TOMBSTONE`)
- `revision TEXT NOT NULL` (opaque version token)
- `data JSONB NULL` (`NULL` for tombstone)
- `changed_at TIMESTAMPTZ NOT NULL`
- `source_outbox_id UUID NULL` (optional traceability)
- `created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`

Indexes:
- `(tenant_id, branch_id, sequence)`
- `(tenant_id, branch_id, module_key, sequence)`
- `(tenant_id, branch_id, entity_type, entity_id, sequence DESC)`
- optional unique on `source_outbox_id` when present

### 2) `v0_sync_client_checkpoints`

Purpose:
- track last acknowledged sequence per client context
- enable retention watermark and diagnostics

Columns:
- `id UUID PRIMARY KEY DEFAULT gen_random_uuid()`
- `account_id UUID NOT NULL`
- `device_id VARCHAR(128) NOT NULL`
- `tenant_id UUID NOT NULL`
- `branch_id UUID NOT NULL`
- `module_scope_hash CHAR(64) NOT NULL`
- `last_sequence BIGINT NOT NULL`
- `updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`

Constraints:
- unique `(account_id, device_id, tenant_id, branch_id, module_scope_hash)`

## Cursor model

- Cursor remains opaque in API.
- Internal cursor payload:
  - `lastSequence` (required)
  - `moduleScopeHash` (required)
  - `tenantId`, `branchId` (scope integrity check)
- Cursor encoding:
  - JSON -> base64url (signed in OF2.2 to prevent tampering)

## Pull query algorithm

1. Validate token scope (tenant/branch).
2. Decode cursor:
   - if absent: `lastSequence = 0`
3. Normalize module scopes and compute `moduleScopeHash`.
4. Query `v0_sync_changes`:
   - `tenant_id = token.tenant_id`
   - `branch_id = token.branch_id`
   - `sequence > lastSequence`
   - `module_key IN (...)`
   - ordered by `sequence ASC`
   - limit `N + 1` (for `hasMore`)
5. Return:
   - `changes[]` (first `N`)
   - `cursor` with last returned sequence
   - `hasMore`
6. Upsert checkpoint with returned sequence when client supplies `deviceId`.

## Retention policy (initial)

- Keep `v0_sync_changes` for `30 days` minimum.
- Cleanup job criteria:
  - `created_at < now() - retentionWindow`
  - and `sequence <= globalSafeWatermark`
- `globalSafeWatermark`:
  - min(`last_sequence`) from `v0_sync_client_checkpoints` updated within staleness window (e.g. 14 days)
- If no active checkpoints, skip aggressive cleanup and keep time-based minimum only.

## Migration plan

1. `029_create_v0_sync_changes.sql`
2. `030_create_v0_sync_client_checkpoints.sql`
3. `031_create_v0_sync_change_indexes.sql` (if split is preferred)

## Producer plan (first wave)

Write producers for already-active modules:
- policy
- menu
- discount
- cashSession
- attendance
- operationalNotification

Producer rule:
- emit change row in same DB transaction as business write (no eventual drift).

## Test plan

Integration:
1. Bootstrap pull returns ordered first-page snapshot.
2. Incremental pull returns only `sequence > cursor`.
3. Tombstone is returned with `data = null`.
4. Cross-tenant/branch isolation is enforced.
5. Module scope filter correctness.
6. Cursor tamper/invalid decode -> `SYNC_CURSOR_INVALID`.
7. `hasMore` correctness at page boundary.

Unit:
- cursor encode/decode/validation
- module scope hash determinism

## Non-goals in OF2

- Websocket/SSE sync push for read model
- full conflict resolution UX
- binary/media sync

## Open items

1. Decide signed cursor format (HMAC vs encrypted payload).
2. Finalize `deviceId` transport:
   - header (`X-Device-Id`) vs body field in pull request.
3. Decide global sequence strategy:
   - one global `BIGSERIAL` vs per-tenant sequences.
