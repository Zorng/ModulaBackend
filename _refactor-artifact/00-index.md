# Refactor Artifact Index

## Active Artifacts

| Domain | Artifact | Status | Path |
|---|---|---|---|
| Platform | Platform Foundation Rollout | In Progress (F7 Deferred) | `_refactor-artifact/01-platform/platform-foundation-rollout.md` |
| Platform | Access Control Action Catalog v0 | Active | `_refactor-artifact/01-platform/access-control-action-catalog-v0.md` |
| Platform | Entitlement Catalog v0 | Active | `_refactor-artifact/01-platform/entitlement-catalog-v0.md` |
| Platform | v0 Command Outbox Event Catalog | Active | `_refactor-artifact/01-platform/v0-command-outbox-event-catalog.md` |
| Platform | Observability Baseline Rollout v0 | Completed baseline (O6 deferred) | `_refactor-artifact/01-platform/observability-baseline-rollout-v0.md` |
| Platform | Observability Contract v0 | Active | `_refactor-artifact/01-platform/observability-contract-v0.md` |
| Platform | Observability Thresholds v0 | Active | `_refactor-artifact/01-platform/observability-thresholds-v0.md` |
| Platform | Observability Dashboard + Alert Starter v0 | Active | `_refactor-artifact/01-platform/observability-dashboard-alert-starter-v0.md` |
| Platform | Operational Notification Rollout v0 | Completed | `_refactor-artifact/01-platform/operational-notification-rollout-v0.md` |
| Platform | Push Sync Foundation Rollout v0 | Completed | `_refactor-artifact/01-platform/push-sync-foundation-rollout-v0.md` |
| Platform | Offline-First Rollout v0 | In progress (OF1 completed) | `_refactor-artifact/01-platform/offline-first-rollout-v0.md` |
| Platform | OF2 Sync State Infrastructure Plan v0 | Drafted | `_refactor-artifact/01-platform/of2-sync-state-infrastructure-plan-v0.md` |
| Platform | KHQR Production Readiness Rollout v0 | In Progress (P0) | `_refactor-artifact/01-platform/khqr-production-readiness-rollout-v0.md` |
| Boundary | Module Boundary Realignment v0 | Completed through B6 | `_refactor-artifact/02-boundary/module-boundary-realignment-v0.md` |
| Boundary | Module Boundary Template v0 | Template | `_refactor-artifact/02-boundary/module-boundary-template-v0.md` |
| Boundary | Policy Boundary v0 | Active (Phase 1-5 lock) | `_refactor-artifact/02-boundary/policy-boundary-v0.md` |
| Boundary | Menu Boundary v0 | Active (rolled out module boundary) | `_refactor-artifact/02-boundary/menu-boundary-v0.md` |
| Boundary | Operational Notification Boundary v0 | Locked (N1) | `_refactor-artifact/02-boundary/operational-notification-boundary-v0.md` |
| Boundary | Push Sync Boundary v0 | Locked (S1) | `_refactor-artifact/02-boundary/push-sync-boundary-v0.md` |
| Boundary | Inventory Boundary v0 | Locked (Phase 1) | `_refactor-artifact/02-boundary/inventory-boundary-v0.md` |
| OrgAccount | OrgAccount Overhaul + POS Readiness | In Progress | `_refactor-artifact/03-orgaccount/orgaccount-overhaul-pos-readiness.md` |
| OrgAccount | Branch Billable Workspaces Rollout v0 | Completed | `_refactor-artifact/03-orgaccount/branch-billable-workspaces-rollout-v0.md` |
| Auth | SaaS Multi-Tenant Overhaul | Completed | `_refactor-artifact/04-auth/saas-multi-tenant-overhaul.md` |
| HR | HR Module Build Order v0 | Active execution | `_refactor-artifact/06-hr/00_hr-module-build-order-v0.md` |
| HR | StaffManagement Rollout v0 | In progress (baseline live) | `_refactor-artifact/06-hr/01_staff-management-rollout-v0.md` |
| HR | Attendance Rollout v0 | In progress (baseline live) | `_refactor-artifact/06-hr/02_attendance-rollout-v0.md` |
| HR | Shift Rollout v0 | Not started | `_refactor-artifact/06-hr/03_shift-rollout-v0.md` |
| HR | Work Review Rollout v0 | Not started | `_refactor-artifact/06-hr/04_work-review-rollout-v0.md` |
| POS | POS Module Build Order v0 | Active execution | `_refactor-artifact/05-pos/00_pos-module-build-order-v0.md` |
| POS | Offline-First DoD Template v0 | Template | `_refactor-artifact/05-pos/00_offline-first-dod-template-v0.md` |
| POS | Policy Rollout v0 | Completed | `_refactor-artifact/05-pos/01_policy-rollout-v0.md` |
| POS | Menu Rollout v0 | Completed | `_refactor-artifact/05-pos/02_menu-rollout-v0.md` |
| POS | Discount Rollout v0 | Completed | `_refactor-artifact/05-pos/03_discount-rollout-v0.md` |
| POS | Cash Session Rollout v0 | Completed | `_refactor-artifact/05-pos/04_cash-session-rollout-v0.md` |
| POS | Inventory Rollout v0 | In progress | `_refactor-artifact/05-pos/05_inventory-rollout-v0.md` |
| POS | Sale-Order Rollout v0 | Active (remodel planning) | `_refactor-artifact/05-pos/06_sale-order-rollout-v0.md` |
| POS | Receipt Rollout v0 | Completed | `_refactor-artifact/05-pos/07_receipt-rollout-v0.md` |
| POS | Reporting Rollout v0 | Not started | `_refactor-artifact/05-pos/08_reporting-rollout-v0.md` |
| POS | Push Sync Rollout v0 | Not started | `_refactor-artifact/05-pos/09_push-sync-rollout-v0.md` |
| POS | Printing Rollout v0 | Not started | `_refactor-artifact/05-pos/10_printing-rollout-v0.md` |

## Next Recommended Artifact

- Start HR implementation from `_refactor-artifact/06-hr/01_staff-management-rollout-v0.md` (Phase 0 and Phase 1 lock) using `_refactor-artifact/06-hr/00_hr-module-build-order-v0.md` as sequence guard.
- Continue attendance expansion in `_refactor-artifact/06-hr/02_attendance-rollout-v0.md` after StaffManagement contract/read surface is locked.
- Keep POS sale-order remodel work paused/parallelized until HR command/event surfaces needed by notifications are stabilized.

## Filename Redirects

- `_refactor-artifact/01-platform/offline-sync-foundation-rollout-v0.md` -> `_refactor-artifact/01-platform/push-sync-foundation-rollout-v0.md`
- `_refactor-artifact/02-boundary/offline-sync-boundary-v0.md` -> `_refactor-artifact/02-boundary/push-sync-boundary-v0.md`
- `_refactor-artifact/05-pos/09_offline-sync-rollout-v0.md` -> `_refactor-artifact/05-pos/09_push-sync-rollout-v0.md`
