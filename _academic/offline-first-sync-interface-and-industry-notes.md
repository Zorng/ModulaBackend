# Offline-First Sync Interface and Industry Evidence (Capstone Notes)

Date: 2026-02-19  
Purpose: reference notes for report/defense on why our backend keeps dual lanes (`feature endpoints` + `sync endpoints`) during offline-first rollout.

## 1) Frontend↔Backend Sync Interface (Practical Model)

For offline-first POS, the interface is typically:

1. `POST /v0/sync/push`
- Frontend sends a batch of queued write intents.
- Each operation carries `clientOpId` (idempotency identity), `operationType`, `occurredAt`, `payload`, optional `dependsOn`.
- Backend executes domain commands and returns per-op status (`APPLIED`, `DUPLICATE`, `FAILED`).

2. `POST /v0/sync/pull`
- Frontend fetches ordered deltas (`UPSERT` / `TOMBSTONE`) using cursor progression.
- Used for initial hydration and incremental catch-up.

3. Token-scoped working context
- `tenantId` / `branchId` come from access token context, not request overrides.

## 2) Why This Is Usually Dual-Lane (Not Single-Lane)

Even in strong offline products, vendors usually keep:
- direct online command/query endpoints for real-time UX and normal online operation, and
- offline queue/replay path for degraded connectivity.

So `sync/push` is a write transport for queued intents, not a full replacement for all feature APIs.

## 3) Public Vendor Evidence (Shopify / Square / Toast)

### Shopify POS
- Shopify documents offline card acceptance with later capture after reconnect.
- Orders can appear as pending/declined states after reconnect.
- This indicates local queue + deferred server processing, not a pure always-online path.

Source:
- https://help.shopify.com/en/manual/sell-in-person/shopify-pos/selling-offline
- https://help.shopify.com/en/manual/sell-in-person/shopify-pos/selling-offline/offline-payments

### Square POS
- Square documents offline payments stored locally and uploaded/processed when connectivity returns.
- They explicitly mention expiry/risk windows and pending uploads.
- This is clearly an offline replay flow coexisting with normal online processing.

Source:
- https://squareup.com/help/us/en/article/7777-process-card-payments-with-offline-mode

### Toast POS
- Toast documents offline mode and “offline mode with local sync”.
- In legacy offline mode, devices may not sync with each other while disconnected; local-sync mode improves that by using a local hub.
- They still reconcile to cloud/services after reconnection.

Source:
- https://doc.toasttab.com/doc/platformguide/platformOfflinePaymentsOverview.html
- https://doc.toasttab.com/doc/platformguide/adminOfflineModeOverview.html
- https://doc.toasttab.com/doc/platformguide/platformOfflineModeLocalSync.html

## 4) Defense-Ready Position (Short Form)

- Our current architecture is intentionally hybrid: direct feature APIs + push/pull sync.
- This mirrors how mature POS systems handle unreliable connectivity.
- It reduces migration risk now and allows future convergence if we later decide to enforce a stricter single-lane offline-first write path.

## 5) Modula Mapping (Current v0)

- Push writes: `POST /v0/sync/push` (with `/v0/sync/replay` compatibility alias).
- Pull hydration: `POST /v0/sync/pull`.
- Feature APIs remain active for online UX and module-level read/write surfaces.

## Related Docs

- `_academic/offline-first-architecture-modula-v0.md`
- `_academic/idempotency-in-modula-v0.md`
- `_academic/outbox-pattern-in-modula-v0.md`
