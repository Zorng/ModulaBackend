# POS Module Build Order (KB-Aligned, v0)

Status: Active planning
Owner: backend
Last updated: 2026-02-17

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
7. `receipt` (immutable receipt snapshot from finalized sale)
8. `reporting` (read-only management projections)
9. `offlineSync` (queue + replay for allowed operations)
10. `printing` (operational effects; best-effort)

## Why this order

- `sale-order` is integration-heavy and depends on policy/menu/discount/cash/inventory seams.
- `receipt` must render sale snapshots, so it follows sale snapshot finalization rules.
- `reporting` must aggregate stable facts from prior modules, so it follows write models.
- `offlineSync` and `printing` are resilience/effect layers and should bind to stable command/event contracts.

## Execution rules

- Keep **one module tracker in-progress at a time**.
- Before each module starts, apply `_refactor-artifact/02-boundary/module-boundary-template-v0.md`.
- For each write command, enforce atomic `business + audit + outbox` transaction contract.
- Update `api_contract/*-v0.md` in the same phase as endpoint implementation.

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
| 9 | offlineSync | `_refactor-artifact/05-pos/09_offline-sync-rollout-v0.md` |
| 10 | printing | `_refactor-artifact/05-pos/10_printing-rollout-v0.md` |

## Tracking board

| Module | Status | Notes |
|---|---|---|
| policy | In progress (Phase 3 complete) | command/query + access-control mapping done |
| menu | Not started | depends on policy limits + branch context |
| discount | Not started | depends on menu refs + branch scope |
| cashSession | Not started | depends on access control + sale hooks |
| inventory | Not started | self-contained ledger first; sale hooks later |
| sale-order | Not started | integrate finalize/void orchestrations |
| receipt | Not started | consume finalized sale snapshot only |
| reporting | Not started | read-only aggregation only |
| offlineSync | Not started | queue/replay over stable commands |
| printing | Not started | best-effort operational effects |
