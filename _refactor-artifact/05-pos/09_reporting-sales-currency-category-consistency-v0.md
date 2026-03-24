# Reporting Sales Currency + Category Consistency (v0)

Status: Completed  
Owner context: Reporting / SaleOrder  
Started: 2026-03-24

## Goal

Fix the current sales-reporting consistency gaps around:

- KHR rounding truth
- mixed currency semantics in report payloads
- missing sale-line category snapshots

so frontend can render reporting without guessing which fields are:

- separately counted operational values
- stored sale snapshots
- or report-time FX conversions

## Why this follow-up exists

The baseline reporting rollout is complete, but current sales reporting still has three correctness/contract gaps:

1. category breakdown can collapse to `"Uncategorized"` because sale lines are not being populated with category snapshots on normal sale writes
2. KHR values are not consistently modeled as the same business truth between sale display and reporting
3. report payload semantics are under-specified, especially when both USD and KHR appear in the same object

## Current observed gaps

### Gap 1 — Category breakdown is backed by a snapshot column that sale writes do not fill

Reporting groups category breakdown by:

- `v0_sale_lines.menu_category_name_snapshot`

Current query:

- `src/modules/v0/reporting/infra/repository.ts`

The reporting support migration added:

- `menu_category_id_snapshot`
- `menu_category_name_snapshot`

to `v0_sale_lines`, but the normal sale write path still does not populate them.

Effect:

- category breakdown can return `"Uncategorized"` for everything even when menu items belong to categories

### Gap 2 — KHR rounding is not canonical in persisted sale/report values

Current sale write logic computes KHR values from USD using FX conversion and `roundMoney(...)`, but it does not apply the configured:

- `saleKhrRoundingEnabled`
- `saleKhrRoundingMode`
- `saleKhrRoundingGranularity`

as the canonical persisted truth for reportable sale amounts.

Effect:

- user-facing sale display may imply rounded KHR values
- persisted/reported KHR values can remain unrounded operational FX numbers
- reports therefore surface values that look unrealistic to operators

### Gap 3 — Reporting mixes stored KHR snapshots with report-time derived KHR

Current sales summary behavior is mixed:

- sale-level totals (`confirmed`, `paymentBreakdown`, `saleTypeBreakdown`, drill-down) sum stored sale snapshot fields
- `topItems.revenueKhr` and `categoryBreakdown.revenueKhr` are currently derived from:
  - `line_total_amount * sale_fx_rate_khr_per_usd`

Effect:

- one response object can contain both:
  - stored sale snapshot KHR
  - derived conversion KHR
- frontend cannot reliably infer the semantics just from field names

## Working target

### 1) Canonical KHR truth

Reporting should use the same effective KHR truth that sale history intends to preserve.

Working target:

- persisted sale snapshot KHR must be canonical for reporting
- if sale rounding is enabled, persisted reportable KHR values must reflect the effective rounded business value

This prevents reporting from reconstructing alternate KHR values later.

### 2) Line-level reporting consistency

Top-item and category KHR should not be ad-hoc FX derivations if the business wants rounded KHR reporting to match cashier-facing history.

Working target:

- add line-level KHR snapshot support for reporting, or equivalent canonical item/category KHR snapshot source

### 3) Category snapshot correctness

Sale-line writes must populate category snapshot fields from the menu snapshot available at sale time.

### 4) Contract clarity

`api_contract/reporting-v0.md` must explicitly label which fields are:

- stored sale snapshot totals
- tender-separated totals
- derived FX fields, if any remain

Frontend should not have to guess from names like:

- `totalGrandUsd`
- `totalGrandKhr`
- `revenueUsd`
- `revenueKhr`

## Out of scope

- changing historical rows already written in production without an explicit migration/backfill plan
- BI-grade multi-currency analytics beyond current management reporting baseline
- changing tender settlement logic itself
- redesigning the whole reporting module

## Execution phases

### Phase R1 — Contract + semantic relock

- document current ambiguity in `api_contract/reporting-v0.md`
- relock field semantics for:
  - confirmed totals
  - payment breakdown
  - cash tender breakdown
  - sale type breakdown
  - top items
  - category breakdown
- explicitly state whether a field is:
  - sale snapshot
  - tender amount
  - report-time derived conversion

Deliverable:

- contract doc no longer leaves mixed-currency fields semantically ambiguous

### Phase R2 — Sale-line snapshot correctness

- update sale-line creation to persist:
  - `menu_category_id_snapshot`
  - `menu_category_name_snapshot`
- ensure all sale creation paths write those snapshot fields:
  - online checkout cash
  - online checkout KHQR finalization path
  - replay / offline-supported sale creation paths

Deliverable:

- category breakdown uses real category snapshots instead of falling through to `"Uncategorized"`

### Phase R3 — Canonical KHR rounding truth

- decide and implement canonical persistence rule for KHR snapshots
- ensure persisted KHR sale totals reflect the same business truth used for sale history presentation
- add explicit tests for:
  - rounding enabled
  - rounding disabled
  - granularity `100`
  - granularity `1000`
  - mode `NEAREST | UP | DOWN`

Deliverable:

- reportable KHR sale totals are no longer visually inconsistent with sale rounding policy

### Phase R4 — Item/category KHR consistency

- remove or reduce report-time KHR derivation from USD line totals where it conflicts with canonical persisted truth
- introduce line-level KHR snapshot source if needed
- ensure `topItems.revenueKhr` and `categoryBreakdown.revenueKhr` follow the same canonical rule as sale totals

Deliverable:

- `topItems` and `categoryBreakdown` no longer compute KHR using a different truth model than summary totals

### Phase R5 — Historical/backfill decision

- decide whether existing historical sale rows need:
  - no backfill
  - best-effort category snapshot backfill
  - best-effort line-level KHR backfill
- document tradeoffs and migration safety

Deliverable:

- explicit rollout decision for old data, rather than silent mixed behavior

### R5 Decision (Locked)

Decision:

- no automatic backfill for historical `menu_category_*_snapshot`
- no automatic backfill for historical `line_total_khr_snapshot`

Rationale:

- category snapshot fields are intended to preserve sale-time history
- reconstructing them from the current menu catalog would fabricate history after:
  - menu item rename
  - category rename
  - category reassignment
  - category deletion/archive
- historical line-level KHR truth is not reconstructable with high confidence from old rows alone
  - old rows did not store canonical line-level KHR snapshots
  - recomputing from `line_total_amount * sale_fx_rate_khr_per_usd` would simply freeze the previous approximation
  - proportional reallocation from sale-level KHR totals would invent line history that was never stored

Operational rule:

- new rows written after R2/R3/R4 are canonical
- historical rows remain readable under explicit fallback semantics:
  - missing category snapshot => `Uncategorized`
  - missing `line_total_khr_snapshot` => report-time FX fallback

Safety rule:

- do not mutate canonical historical sale/order rows in v0 baseline just to make reporting look cleaner
- if the business later wants best-effort historical normalization, do it as an explicit one-off offline backfill project with stakeholder sign-off and a date fence, not as a silent default migration

### Phase R6 — Integration tests + close-out

- add reporting integration coverage for:
  - category breakdown with categorized menu items
  - top item/category KHR consistency
  - sale rounding consistency in summary/drill-down
  - contract examples aligned to real semantics
- update rollout notes and frontend handoff guidance

## Likely implementation surfaces

Reporting:

- `src/modules/v0/reporting/infra/repository.ts`
- `src/modules/v0/reporting/app/service.ts`
- `src/integration-tests/v0-reporting.int.test.ts`
- `api_contract/reporting-v0.md`

Sale/order:

- `src/modules/v0/posOperation/saleOrder/app/service.ts`
- `src/modules/v0/posOperation/saleOrder/infra/repository.ts`
- any related migrations for line-level KHR/category snapshot persistence

Schema / migration:

- `migrations/*` follow-up migration(s) for:
  - sale-line category snapshot correctness
  - optional line-level KHR snapshot support

## Risks / decision points

### Risk 1 — Historical inconsistency remains after forward fix

Even if new writes are corrected, older rows may still produce mixed reporting behavior.

Mitigation:

- make backfill/no-backfill an explicit rollout decision in Phase R5

### Risk 2 — Double source of truth for KHR

If backend continues to store one KHR truth but report another, the inconsistency will persist.

Mitigation:

- lock one canonical persisted reporting truth for KHR

### Risk 3 — Contract remains ambiguous after code fix

Even correct code will still generate frontend confusion if the contract does not state whether amounts are:

- snapshots
- tender-separated values
- or FX-derived

Mitigation:

- Phase R1 is required, not optional documentation polish

## Tracking

| Phase | Status | Notes |
|---|---|---|
| R1 Contract + semantic relock | Completed | `api_contract/reporting-v0.md` now explicitly labels sale snapshot totals vs tender totals vs historical FX fallback semantics, and documents the `"Uncategorized"` category snapshot caveat for pre-fix rows. |
| R2 Sale-line snapshot correctness | Completed | Normal sale writes now persist sale-line category snapshots from the menu row at sale-line creation time, and reporting coverage includes a real checkout-to-reporting regression. |
| R3 Canonical KHR rounding truth | Completed | Persisted sale KHR snapshots now follow the configured sale rounding semantics at checkout time, and both sale-order and reporting regression coverage are in place. |
| R4 Item/category KHR consistency | Completed | New sale lines now persist a canonical line-level KHR snapshot, and `topItems` / `categoryBreakdown` read that stored value with historical fallback for older rows. |
| R5 Historical/backfill decision | Completed | Locked to no automatic historical backfill in v0 baseline; old rows keep explicit fallback semantics instead of fabricated snapshot reconstruction. |
| R6 Integration tests + close-out | Completed | Reporting integration coverage now includes real checkout category snapshots, rounded persisted KHR sale totals, and explicit historical FX fallback behavior for old sale lines without KHR snapshots; contract and rollout notes are synchronized. |
