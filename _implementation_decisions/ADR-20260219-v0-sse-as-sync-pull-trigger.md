# ADR-20260219 — v0 Offline-First: Use SSE as Pull-Sync Trigger

Status: Accepted  
Date: 2026-02-19

## Context

Offline-first clients need a reliable way to know when to run `POST /v0/sync/pull` without aggressive polling.

Current platform state:
- Push lane exists: `POST /v0/sync/push`
- Pull lane exists: `POST /v0/sync/pull`
- Realtime channel already exists via SSE:
  - `GET /v0/notifications/stream`

We want fast delivery and low operational complexity for capstone-phase `/v0`.

## Decision

Use **SSE** as the primary near-realtime trigger for pull-sync, not WebSocket.

Trigger policy for frontend clients:
1. Run pull on app start/resume and context switch.
2. Run pull after successful push.
3. Run pull when SSE signals new relevant changes.
4. Keep periodic fallback polling (light interval) as safety net.

Backend behavior:
- SSE emits lightweight “sync hint” style signals (nudge), not full data synchronization payloads.
- Client still retrieves authoritative data via `POST /v0/sync/pull`.

## Alternatives Considered

### Option A — WebSocket as primary trigger
- Pros:
  - full duplex channel
  - richer protocol options
- Cons:
  - higher implementation/ops complexity
  - unnecessary for current one-way nudge requirement
- Decision: Rejected for `/v0`

### Option B — SSE as primary trigger + periodic fallback
- Pros:
  - simple to ship
  - fits existing HTTP auth/context model
  - enough for server->client sync nudges
- Cons:
  - client->server signaling still done via HTTP endpoints
  - reconnect handling required on client
- Decision: Accepted

### Option C — Polling only
- Pros:
  - simplest runtime model
- Cons:
  - slower convergence or higher request load
  - poorer near-realtime UX
- Decision: Rejected

## Consequences

Positive:
- Faster implementation timeline.
- Lower operational risk for capstone scope.
- Clean alignment with existing notification SSE channel.

Negative:
- Frontend must implement robust SSE reconnect lifecycle.
- Still requires periodic fallback pull loop.

## Implementation Notes

- Canonical data sync endpoints remain:
  - `POST /v0/sync/push`
  - `POST /v0/sync/pull`
- SSE is a trigger mechanism only; source-of-truth state is always from pull response.
- This ADR does not remove dual-lane write model in `/v0` (direct feature writes + sync push).
