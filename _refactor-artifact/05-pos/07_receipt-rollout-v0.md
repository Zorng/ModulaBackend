# Receipt Module Rollout (v0)

Status: Completed
Owner context: POSOperation

## Goal

Implement this module on `/v0` with boundary-safe ownership, atomic command contract (`business + audit + outbox`), and canonical API contracts in `api_contract/`.

## Primary KB references

- `knowledge_base/BusinessLogic/5_modSpec/40_POSOperation/receipt_module_patched.md`
- `knowledge_base/BusinessLogic/4_process/30_POSOperation/10_finalize_sale_orch.md`
- `knowledge_base/BusinessLogic/4_process/60_PlatformSystems/55_printing_effects_dispatch_process.md`

## Offline-first DoD gates (standardized)

Template:
- `_refactor-artifact/05-pos/00_offline-first-dod-template-v0.md`

- Replay parity: receipt-producing writes (from sale finalize pipeline) must be replay-safe.
- Pull deltas: receipt projection updates must emit sync changes for receipt hydration.
- Conflict taxonomy: deterministic failure codes for sale-state availability and print dispatch.
- Convergence tests: replayed finalize operations produce receipt data visible via pull.
- Observability baseline: replay outcome counters by code.

## Execution phases

### Phase 0 — Offline-first DoD gate
- lock replay operation mappings affecting receipt generation
- lock pull entity map for receipt projections
- lock conflict code/resolution mapping
- lock convergence test matrix

### Phase 1 — Boundary + Contract lock
- confirm owned facts vs consumed facts
- define canonical route prefix + action keys + event names
- draft/lock `api_contract/receipt-v0.md`

### Phase 2 — Data model + repositories
- migrations for owned tables/projections
- repo methods only for owned tables
- idempotency anchor definitions for write commands

### Phase 3 — Commands/queries + access control
- command handlers with transaction boundaries
- query handlers with branch/tenant scoping
- access-control route registry + action catalog mappings

### Phase 4 — Integration + reliability
- atomic rollback coverage (`business + audit + outbox`)
- idempotency duplicate/conflict coverage
- cross-module event publish/subscribe coverage

### Phase 5 — Close-out
- update rollout tracker status
- update `_refactor-artifact/01-platform/v0-command-outbox-event-catalog.md` (if producer/subscriber changed)
- update frontend rollout notes in `api_contract/`

## Tracking

| Phase | Status | Notes |
|---|---|---|
| 0 Offline-first DoD gate | Completed | Receipt reads are projection-only from sale truth; replay parity and pull deltas are covered by sale-order finalize commands. Receipt write surface is print/reprint only (idempotent observational effects). |
| 1 Boundary + Contract lock | Completed | Locked module boundary in `_refactor-artifact/02-boundary/receipt-boundary-v0.md`; drafted canonical API contract in `api_contract/receipt-v0.md` with route prefix `/v0/receipts`, action/event naming, sale-derived receipt projection rules, and print/reprint effect semantics. |
| 2 Data model + repositories | Completed | Implemented sale-derived receipt repository reads under `src/modules/v0/posOperation/receipt/infra/repository.ts` (from `v0_sales` + `v0_sale_lines`) and command-contract scaffolding under `src/modules/v0/posOperation/receipt/app/command-contract.ts` for print/reprint writes. |
| 3 Commands/queries + access control | Completed | Implemented `V0ReceiptService` command/query surface and `createV0ReceiptRouter` endpoints on `/v0/receipts` (`GET /sales/:saleId`, `GET /:receiptId`, `POST /:receiptId/print`, `POST /:receiptId/reprint`) with idempotent write transactions (`business + audit + outbox`). Wired module bootstrap/mount and access-control metadata + protected route registrations for `receipt.*` actions. |
| 4 Integration + reliability | Completed | Shifted receipt handling to a non-blocking adapter model: finalized sale responses now include a receipt-ready payload (`data.receipt`) for immediate local print without extra round-trip; finalize paths do not write receipt-owned tables. Added integration coverage in `src/integration-tests/v0-sale-order.int.test.ts` for receipt payload presence on cash finalize/pay-later cash checkout/KHQR confirm and for absence of legacy `receipt.snapshot.create` outbox actions. |
| 5 Close-out | Completed | Marked receipt rollout complete, synced outbox catalog with active receipt events (`RECEIPT_PRINT_REQUESTED`, `RECEIPT_REPRINT_REQUESTED`), and refreshed frontend notes in `api_contract/receipt-v0.md` to sale-derived receipt IDs (`receiptId == saleId`). |
