# Offline-First Architecture in Modula v0

Date: 2026-02-19  
Scope: Modula backend/frontend sync model under `/v0`

## Purpose

This document explains how offline-first works in this project so team members can:
- reason about sync behavior correctly,
- explain the architecture in capstone defense/reporting,
- implement frontend and backend changes without breaking convergence.

## High-Level Overview

Modula v0 uses an offline-first **dual-lane** model:

1. **Direct online lane**
- Frontend calls feature endpoints directly when online for immediate UX.

2. **Offline replay lane**
- Frontend stores write intents locally while offline.
- When online, frontend sends queued writes to:
  - `POST /v0/sync/push`

3. **State hydration lane**
- Frontend syncs server-authoritative deltas via:
  - `POST /v0/sync/pull`

4. **Realtime trigger**
- Frontend uses SSE to know when to pull:
  - `GET /v0/notifications/stream`
- SSE is a nudge trigger, not authoritative data transfer.

## Endpoints (Current v0)

- Push writes: `POST /v0/sync/push`
- Push batch read: `GET /v0/sync/push/batches/:batchId`
- Pull deltas: `POST /v0/sync/pull`
- Realtime trigger: `GET /v0/notifications/stream`

Compatibility note:
- `/v0/sync/replay*` remains as compatibility alias.

## Process Flow (Low-Level)

## A) Frontend local write path

1. User performs action (e.g., open cash session, check in, etc.).
2. UI updates optimistically in local state.
3. Frontend stores operation in local queue with:
   - `clientOpId`, `operationType`, `occurredAt`, `payload`, optional `dependsOn`.
4. Queue item status starts as `PENDING`.

## B) Push processing path (`/v0/sync/push`)

For each queued operation:

1. Backend validates auth and token context (`accountId`, `tenantId`, `branchId`).
2. Backend validates payload and operation contract.
3. Backend enforces replay identity by `(tenantId, branchId, clientOpId)`.
4. Backend executes operation through domain services (same business invariants as online path).
5. Backend writes atomically (transactional boundary):
   - business state changes,
   - audit event,
   - outbox event,
   - sync change records for pull.
6. Backend returns per-op result:
   - `APPLIED`, `DUPLICATE`, or `FAILED` (+ deterministic code/resolution hints).
7. Frontend updates local queue:
   - `APPLIED`/`DUPLICATE` -> `DONE`
   - retryable failure -> retry state
   - permanent/manual failure -> user/system action required

## C) Pull hydration path (`/v0/sync/pull`)

1. Frontend calls pull with cursor/module scopes.
2. Backend returns ordered changes + next cursor:
   - `UPSERT` changes (create/update),
   - `TOMBSTONE` changes (deletion/archive markers).
3. Frontend applies all changes locally in sequence order.
4. Frontend persists returned cursor only after successful apply.
5. If `hasMore=true`, frontend continues pulling until caught up.

## D) Triggering pull

Frontend should trigger pull on:
- app start/resume,
- context switch (tenant/branch),
- successful push,
- SSE incoming notification/sync hint,
- periodic fallback timer while online.

## Consistency Model

- **Server is source of truth** for business invariants.
- Delivery of sync changes is **at-least-once**.
- Client merge must be idempotent.
- Replay identity prevents duplicate writes for same operation intent.

## Terminology

- **Offline-first**: app remains usable without network and converges later.
- **Push sync**: client sends queued write intents to server.
- **Pull sync**: client fetches authoritative server deltas.
- **Dual-lane**: direct online writes + replay writes both exist.
- **Operation**: one write intent from client queue (with `clientOpId`).
- **Batch**: one push request containing ordered operations.
- **Idempotency identity**: unique key that prevents reapplying same intent.
- **Cursor**: bookmark/position in server change stream for incremental pull.
- **Checkpoint**: stored last-known sync progress for device/context.
- **Tombstone**: delete/archive marker in pull feed (`data = null`).
- **UPSERT**: create-or-update change in pull feed.
- **DependsOn**: operation dependency on earlier operation(s).
- **Replay**: server re-executes offline-captured operation in canonical backend logic.
- **Convergence**: frontend local state becomes equal to server truth.
- **SSE (Server-Sent Events)**: one-way realtime stream used as pull trigger.

## Design Rationale (Why this shape)

- Keeps shipping speed high for v0.
- Avoids forcing immediate heavy refactor to pure single-lane write architecture.
- Aligns with how mature POS systems commonly operate (hybrid online + offline replay).
- Preserves correctness via transactional backend command handling + deterministic sync protocol.

## Related Docs

- `api_contract/push-sync-v0.md`
- `api_contract/sync-v0.md`
- `api_contract/operational-notification-v0.md`
- `_academic/idempotency-in-modula-v0.md`
- `_academic/outbox-pattern-in-modula-v0.md`
- `_implementation_decisions/ADR-20260219-v0-sse-as-sync-pull-trigger.md`
- `_academic/offline-first-sync-interface-and-industry-notes.md`
