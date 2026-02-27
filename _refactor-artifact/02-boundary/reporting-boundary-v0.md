# Reporting Module Boundary (v0)

Status: Phase 1 locked  
Owner context: `Reporting`  
Canonical route prefix: `/v0/reports`

## 1) Module Identity

- Module name: `reporting`
- Primary KB references:
  - domain: `knowledge_base/BusinessLogic/2_domain/50_Reporting/reporting_domain.md`
  - modSpec: `knowledge_base/BusinessLogic/5_modSpec/50_Reporting/report_module.md`
  - process:
    - `knowledge_base/BusinessLogic/4_process/50_Reporting/10_sales_reporting_process.md`
    - `knowledge_base/BusinessLogic/4_process/50_Reporting/20_restock_spend_reporting_process.md`
    - `knowledge_base/BusinessLogic/4_process/10_WorkForce/40_attendance_report.md`

## 2) Owned Facts (Source of Truth)

- Owned facts:
  - reporting query contracts and deterministic aggregation rules
  - reporting scope resolution semantics (`BRANCH` vs `ALL_BRANCHES`)
  - optional reporting projections/indexes/materialized views (future; read-only derivation)
- Invariants:
  - reporting is read-only (no mutation of operational truths)
  - same scope + same source facts => same report output
  - historical totals are derived from stored finalized snapshots (no retroactive recompute from current policy/menu state)
  - provisional states (`VOID_PENDING`) are visible and never silently merged into confirmed totals

## 3) Consumed Facts (Read Dependencies)

- SaleOrder:
  - finalized sale snapshots, sale lines, payment/tender snapshots, sale status transitions
  - why: sales summary + drill-down + exception visibility
  - consistency mode: strong read
- Inventory:
  - restock batches + optional purchase cost metadata
  - why: restock spend summary + unknown-cost visibility
  - consistency mode: strong read
- WorkReview / Attendance:
  - work review records + attendance evidence snapshots
  - why: attendance insight summary + drill-down
  - consistency mode: strong read
- CashSession:
  - X/Z artifacts (owned by cash session)
  - why: reporting UI navigation/supporting read-only context only
  - consistency mode: strong read
- OrgAccount:
  - branch metadata + branch frozen status
  - why: scope labeling and frozen-history semantics
  - consistency mode: strong read
- AccessControl:
  - `reports.view` permission + branch-scope enforcement
  - why: role/scope enforcement and `ALL_BRANCHES` gate
  - consistency mode: strong read

## 4) Commands (Write Surface)

- No public business write commands in reporting baseline.
- Observational access audit (`REPORT_VIEWED`) is emitted by reporting query handlers via audit pipeline.

## 5) Queries (Read Surface)

- `GET /v0/reports/sales/summary`
  - action key: `reports.sales.summary`
- `GET /v0/reports/sales/drill-down`
  - action key: `reports.sales.drillDown`
- `GET /v0/reports/restock-spend/summary`
  - action key: `reports.restockSpend.summary`
- `GET /v0/reports/restock-spend/drill-down`
  - action key: `reports.restockSpend.drillDown`
- `GET /v0/reports/attendance/summary`
  - action key: `reports.attendance.summary`
- `GET /v0/reports/attendance/drill-down`
  - action key: `reports.attendance.drillDown`

Scope baseline:
- `OWNER`, `ADMIN`, `MANAGER` with `reports.view`
- manager: `BRANCH` scope only
- owner/admin: `BRANCH` or `ALL_BRANCHES` (only when full-branch-access check passes)

## 6) Event Contract

### Produced events

- `REPORT_VIEWED` (observational audit event)
  - includes report type + scope metadata
  - no operational state mutation

### Subscribed events

- none in baseline (reporting is query-driven)

## 7) Access Control Mapping

- Route registry entries (target):
  - `GET /reports/sales/summary` -> `reports.sales.summary`
  - `GET /reports/sales/drill-down` -> `reports.sales.drillDown`
  - `GET /reports/restock-spend/summary` -> `reports.restockSpend.summary`
  - `GET /reports/restock-spend/drill-down` -> `reports.restockSpend.drillDown`
  - `GET /reports/attendance/summary` -> `reports.attendance.summary`
  - `GET /reports/attendance/drill-down` -> `reports.attendance.drillDown`
- Action catalog entries:
  - all `READ`, scope `TENANT` (with branch-scope filters validated by service)
- Entitlement bindings:
  - baseline `reports.view`
- Branch status gates:
  - frozen branches stay readable and must be labeled as frozen in response scope

## 8) API Contract Docs

- Canonical contract file: `api_contract/reporting-v0.md`
- Compatibility aliases: none
- OpenAPI: `N/A` (markdown contract policy)

## 9) Test Plan (Required)

### Unit tests (module-local)
- scope parser/validator (`BRANCH` vs `ALL_BRANCHES`, window validation)
- deterministic aggregate calculators
- reason-code mapping for invalid filters/scope

### Integration tests
- sales confirmed vs provisional partitioning (`FINALIZED` vs `VOID_PENDING`/`VOIDED`)
- historical stability (menu/policy edits do not rewrite historical aggregates)
- restock spend unknown-cost handling (unknown != zero)
- attendance fair degradation when shift planning is missing
- access-control scope tests (manager denied `ALL_BRANCHES`, owner/admin conditional allow)
- frozen branch historical reads

## 10) Boundary Guard Checklist

- [x] No cross-module table writes in reporting repositories
- [x] Canonical route prefix locked (`/v0/reports`)
- [x] Action-key namespace locked (`reports.*`)
- [x] Event ownership locked (`REPORT_VIEWED` observational)
- [x] Canonical contract target locked (`api_contract/reporting-v0.md`)
- [x] Test matrix defined

## 11) Rollout Notes

- Frontend consumption:
  - use reporting summary endpoints for dashboard cards/charts
  - use drill-down endpoints for lists only on demand
  - avoid client-side whole-dataset aggregation for primary management dashboards
