# POS Module Build Order (KB-Aligned, v0)

Status: Active execution (inventory ready)
Owner: backend
Last updated: 2026-02-19

## Why this exists

Phase O4 in `_refactor-artifact/03-orgaccount/orgaccount-overhaul-pos-readiness.md` is too broad to execute safely in one thread.
This artifact locks a dependency-first build order and assigns a dedicated tracker file per module to keep context windows small.

## Inputs used from KB

- `knowledge_base/BusinessLogic/5_modSpec/40_POSOperation/*`
- `knowledge_base/BusinessLogic/5_modSpec/50_Reporting/report_module.md`
- `knowledge_base/BusinessLogic/5_modSpec/60_PlatformSystems/policy_module.md`
- `knowledge_base/BusinessLogic/5_modSpec/60_PlatformSystems/offlineSync_module.md`
- `knowledge_base/BusinessLogic/5_modSpec/60_PlatformSystems/printing_module.md`
- `knowledge_base/BusinessLogic/4_process/30_POSOperation/*`
- `knowledge_base/BusinessLogic/4_process/50_Reporting/*`
- `knowledge_base/BusinessLogic/4_process/60_PlatformSystems/{10,20,55,60,70}_*.md`
- `knowledge_base/BusinessLogic/_maps/*_story_coverage_map.md`

## Locked execution order

1. `policy` (branch-scoped VAT/FX/rounding + pay-later toggle)
2. `menu` (catalog + composition truth)
3. `discount` (eligibility rules only)
4. `cashSession` (drawer lifecycle + movement ledger)
5. `inventory` (ledger + projections; self-contained first)
6. `sale-order` (finalize orchestration integrating policy/menu/discount/cash/inventory)
7. `receipt` (sale-derived receipt projection from finalized sale)
8. `reporting` (read-only management projections)
9. `pushSync` (queue + replay for allowed operations)
10. `printing` (operational effects; best-effort)

## Why this order

- `sale-order` is integration-heavy and depends on policy/menu/discount/cash/inventory seams.
- `receipt` is derived from sale truth, so it follows sale finalization/void lifecycle rules.
- `reporting` must aggregate stable facts from prior modules, so it follows write models.
- `pushSync` and `printing` are resilience/effect layers and should bind to stable command/event contracts.

## Pre-Inventory prerequisite (locked and completed)

Before starting `inventory`, these platform foundations must be completed:
- `_refactor-artifact/01-platform/operational-notification-rollout-v0.md`
- `_refactor-artifact/01-platform/push-sync-foundation-rollout-v0.md`

Reason:
- inventory + sale-order would otherwise need replay/notification retrofits after implementation.

Completion (2026-02-19):
- both platform preflight trackers are now completed; inventory is unblocked.

## Execution rules

- Keep **one module tracker in-progress at a time**.
- Before each module starts, apply `_refactor-artifact/02-boundary/module-boundary-template-v0.md`.
- For each write command, enforce atomic `business + audit + outbox` transaction contract.
- Update `api_contract/*-v0.md` in the same phase as endpoint implementation.
- KHQR prerequisite for sale-order:
  - lock/payment foundation under `_refactor-artifact/01-platform/khqr-payment-foundation-rollout-v0.md`
  - minimum required before KHQR finalize acceptance: `K1-K6`

## Offline-First Standard Gate (applies to every POS rollout)

- Add a module-specific **Phase 0** before boundary lock.
- Use template:
  - `_refactor-artifact/05-pos/00_offline-first-dod-template-v0.md`
- Phase 0 must lock:
  - replay parity (`/v0/sync/push` op mapping for all write commands),
  - pull delta emission (`/v0/sync/pull` UPSERT/TOMBSTONE behavior),
  - deterministic conflict taxonomy (`code + resolution`),
  - convergence tests (replay + pull),
  - minimum observability counters for replay outcomes.
- Read-only modules (for example reporting) can mark replay parity as N/A but must still define pull/hydration expectations.

## Module trackers

| Order | Module | Tracker |
|---|---|---|
| 1 | policy | `_refactor-artifact/05-pos/01_policy-rollout-v0.md` |
| 2 | menu | `_refactor-artifact/05-pos/02_menu-rollout-v0.md` |
| 3 | discount | `_refactor-artifact/05-pos/03_discount-rollout-v0.md` |
| 4 | cashSession | `_refactor-artifact/05-pos/04_cash-session-rollout-v0.md` |
| 5 | inventory | `_refactor-artifact/05-pos/05_inventory-rollout-v0.md` |
| 6 | sale-order | `_refactor-artifact/05-pos/06_sale-order-rollout-v0.md` |
| 7 | receipt | `_refactor-artifact/05-pos/07_receipt-rollout-v0.md` |
| 8 | reporting | `_refactor-artifact/05-pos/08_reporting-rollout-v0.md` |
| 9 | pushSync | `_refactor-artifact/05-pos/09_push-sync-rollout-v0.md` |
| 10 | printing | `_refactor-artifact/05-pos/10_printing-rollout-v0.md` |

## Tracking board

| Module | Status | Notes |
|---|---|---|
| policy | Completed | Phase 1-5 completed (boundary lock, migration/repo, command/query + ACL, integration reliability, close-out). |
| menu | Completed | Phase 1-5 completed (boundary, contract, schema/repo, full endpoint surface + ACL, reliability tests, close-out sync). |
| discount | Completed | phase 1-5 completed (boundary/contract lock, schema/repository, commands/queries + ACL, integration reliability, close-out sync) |
| cashSession | Completed | Phase 1-5 completed (boundary/contract, schema/repo, command/query/ACL, integration reliability, close-out sync). |
| inventory | In progress | Phase 0+1 locked (`05_inventory-rollout-v0.md`, `inventory-boundary-v0.md`, `api_contract/inventory-v0.md`) |
| sale-order | In progress (remodel) | Legacy server-cart rollout artifacts were archived under `_refactor-artifact/05-pos/_archived/`. Active tracker is `_refactor-artifact/05-pos/06_sale-order-rollout-v0.md` with source-of-truth remodel spec `_refactor-artifact/05-pos/06_sale-order-checkout-remodel-spec-v0.md` and pending remodel contract sections in `api_contract/sale-order-v0.md` + `api_contract/khqr-payment-v0.md`. |
| receipt | Completed | Phase 0-5 completed (`07_receipt-rollout-v0.md`, `receipt-boundary-v0.md`, `api_contract/receipt-v0.md`, receipt service/router + ACL mappings, sale-derived receipt reads, receipt-ready finalize response payload + reliability tests, close-out sync). |
| reporting | Not started | read-only aggregation only |
| pushSync | Not started | queue/replay over stable commands |
| printing | Not started | best-effort operational effects |
