# Module Spec: Inventory (Capstone 1 – Journal-Only)
## Purpose & Scope
Track stock per branch using an append-only inventory journal (single source of truth). Support: receive, sale deduction (policy-controlled), waste, correction, void/reopen reversals, low-stock alerts, and clean audit trails. Keep schema simple now but future-proof for batches/FEFO, COGS, transfers, and POs.
## On-hand (definition)
On-hand = real-time balance of an item at a branch:
Σ(receive) − Σ(sale) − Σ(waste) ± Σ(correction) ± Σ(void/reopen).
Derived from the journal; never stored as a mutable column.

## Actors & Permissions
Admin (tenant): Create stock items, assign to branches, set thresholds, toggle sale-deduction policy, perform/approve adjustments, view all branches.
Manager (branch): View branch stock, record receive/waste/correction for their branch, set branch thresholds.
Cashier (branch): No inventory edits; sales finalize may auto-deduct if policy ON.
System: Applies queued offline deductions, computes balances, writes reversals on void/reopen.

## User Stories & Acceptance Criteria
Create Stock Item (Admin)
Define name, unit, (opt) barcode/cost, active flag.
✅ Saved globally; visible once assigned to branches.
Assign to Branch & Threshold (Admin/Manager)
Link item to branch and set min threshold.
✅ Branch sees item in inventory view; threshold used for alerts.
Receive Stock (Manager/Admin)
Record +quantity per item/branch; optional note (supplier/invoice/expiry text).
✅ Journal +delta, reason=receive.
Waste / Spill (Manager/Admin)
Reduce quantity with mandatory note.
✅ Journal -delta, reason=waste.
Correction / Count Adjustment (Manager/Admin)
Apply +/- delta with reason + note (e.g., “count correction”).
✅ Journal ±delta, reason=correction.
Automatic Sale Deduction (System, Policy-controlled)
When Inventory → Subtract on Finalize = ON, finalizing a sale posts journal entries from menu_stock_map.
✅ delta = qty_per_sale × line_qty (negative). Voids create compensating positives; reopen reverses then re-applies.
Low-Stock Alerts (Manager/Admin)
Show items where on_hand ≤ min_threshold.
✅ Alert badges in branch inventory; sortable list.
Offline Sales (System)
Sales completed offline queue deduction intents and apply on reconnect idempotently.
✅ No duplicate deductions; on-hand becomes correct after sync.

## Functional Requirements
Branch-Scoped Inventory: Every journal row carries tenant_id, branch_id, stock_item_id.
Inventory Journal (authoritative): Append-only rows for receive|sale|waste|correction|void|reopen with actor/timestamp and optional note.
Design hook: include nullable batch_id and unit_cost_usd for future FEFO/COGS.
On-hand Computation: Query-time SUM(delta) grouped by (tenant, branch, item). Optionally expose a read API.
Sale Deduction Policy (StorePolicy → Inventory Behavior):
inventory_subtract_on_finalize (tenant default, bool)
optional branch_overrides (JSON)
optional exclude_menu_item_ids (JSON)
Resolution snapshot stored on sale.
Menu Mapping: menu_item_id → stock_item_id, qty_per_sale (Capstone 1: 0..1 mapping per menu item).
Voids/Reopens: Always write compensating rows; never mutate existing rows.
Exceptions: Allow negative on-hand but flag in an “Exceptions” view; log unmapped sold items.

## Non-Functional Requirements
Performance: Movement write <150 ms; per-branch on-hand query <300 ms for typical café volumes.
Reliability: Idempotent offline apply keyed by sale_id (or client_uuid+line_hash).
Security: Role + branch scoping on every endpoint.
Auditability: All actions logged with actor_id, timestamps, and reason/note.
Usability: Simple forms (Receive/Waste/Correction), clear alerts, item search, CSV export (optional).
Scalability: Ready to add materialized on-hand views when volume grows.

## Data Model (Capstone 1, with future hooks)
stock_items: id, tenant_id, name, unit_text, barcode?, default_cost_usd?, is_active, created_at
branch_stock: id, tenant_id, branch_id, stock_item_id, min_threshold, created_at (no quantity here)
inventory_journal:
id, tenant_id, branch_id, stock_item_id, delta, reason('receive'|'sale'|'waste'|'correction'|'void'|'reopen'), ref_sale_id?, note?, actor_id?, batch_id?, unit_cost_usd?, created_at
menu_stock_map: menu_item_id (PK), stock_item_id, qty_per_sale, created_at
store_policy_inventory: tenant_id (PK), inventory_subtract_on_finalize, branch_overrides JSONB, exclude_menu_item_ids JSONB, updated_by, updated_at
audit_log (shared): id, tenant_id, actor_id, action, payload_json, created_at

## Validation & Guardrails
Enforce sign by reason: receive >0, sale <0, waste <0, correction ≠0, void >0, reopen ±.
Disallow deleting journal rows; deactivation instead of delete for stock items.
Block zero quantities; require notes for waste/correction.
If mapping missing, do not block sale; log exception.
Policy change affects future sales only; policy changes audited.

## Edge Cases
Negative stock permitted (flagged) to avoid blocking sales.
Time stored in UTC; display in branch local time.
Items can be assigned to some branches and not others (on-hand computed only where movements exist).
Sale void after partial FEFO consumption (future): handled by compensating rows per consumed chunk (batch_id hook already present).

## Out of Scope (Capstone 1)
Multi-SKU recipes (BOM) and ingredient-level deductions.
Receive batches (header/lines), FEFO logic, expiry enforcement.
Purchase Orders, supplier master, COGS/valuation.
Inter-branch transfers and stocktake sessions/approvals.

## Scenarios of Use
Initial setup: Admin creates items (Milk 1L, Cups, Straws, Beans, Oranges), assigns to Branch A/B with thresholds. Manager posts receive entries. On-hand shows accurate balances per branch.
Sales day: Policy ON → Iced Latte auto-deducts Cups; Orange Juice auto-deducts Oranges. Low-stock alert triggers when thresholds crossed.
Voids & corrections: A mistaken sale is voided → compensating +delta restores stock. Nightly count finds +2 Cups → correction +2 with note.

## Migration Path (no rebuild later)
Add receive_batches + receive_lines; start dual-writing receives to batch tables & journal; begin FEFO using batch_id.
Add BOM (menu→multiple stock lines) and extend sale deduction to multiple journal rows.
Add materialized on-hand for performance, COGS via unit_cost_usd, POs/transfers via new reasons.

# API CONTRACT
## Conventions
Base URL: /api/v1
Auth: Authorization: Bearer <jwt>
Roles: admin, manager, cashier, system
Ids: UUID v4
Time: ISO-8601 UTC
Idempotency: Idempotency-Key header for mutating requests (recommended)
Errors:
{ "error": { "code": "LIMIT_EXCEEDED", "message": "Human-readable", "details": {...} } }

## 0) Policy (Inventory Behavior)

### GET /store-policy/inventory
Roles: admin
Response 200
{
  "inventory_subtract_on_finalize": true,
  "branch_overrides": { "3333-...-3333": true },
  "exclude_menu_item_ids": []
}
### PUT /store-policy/inventory
Roles: admin
Body
{
  "inventory_subtract_on_finalize": true,
  "branch_overrides": { "3333-...-3333": false },
  "exclude_menu_item_ids": ["cccccccc-cccc-4ccc-8ccc-cccccccccccc"]
}
200 updated, 409 version conflict (use If-Match with ETag if desired)

## 1) Stock Items (master)

### POST /inventory/stock-items
Roles: admin
Body
{ "name":"Milk 1000ml","unit_text":"pcs","barcode":null,"default_cost_usd":null,"is_active":true }
201
{ "id":"4444-...-4444","name":"Milk 1000ml","unit_text":"pcs","barcode":null,"default_cost_usd":null,"is_active":true,"created_at":"..." }
### GET /inventory/stock-items
Roles: admin, manager
Query: q?, is_active?, page?, page_size?
200
{ "items":[{ "id":"4444-...","name":"Milk 1000ml","unit_text":"pcs","is_active":true }], "next_page": null }
### PATCH /inventory/stock-items/{stock_item_id}
Roles: admin
Body (any subset)
{ "name":"Milk 1L","unit_text":"pcs","barcode":"MILK-1L","is_active":true }
200 updated

## 2) Branch Stock (link + threshold)

### PUT /inventory/branches/{branch_id}/stock-items/{stock_item_id}
Roles: admin, manager (own branch)
Body
{ "min_threshold": 6 }
200 upserted link

### GET /inventory/branches/{branch_id}/stock-items
Roles: admin, manager (own branch)
200
{
  "items":[
    { "stock_item_id":"4444-...","name":"Milk 1000ml","unit_text":"pcs","min_threshold":6 }
  ]
}

## 3) Menu ↔ Stock Mapping (0..1 per menu item in Capstone 1)

### PUT /inventory/menu-map/{menu_item_id}
Roles: admin
Body
{ "stock_item_id":"5555-...","qty_per_sale": -1 }
200 upsert

### GET /inventory/menu-map/{menu_item_id}
Roles: admin, manager
200
{ "menu_item_id":"aaaa-...","stock_item_id":"5555-...","qty_per_sale": -1 }

## 4) Journal Movements (single source of truth)

### POST /inventory/journal/receive
Roles: admin, manager (own branch)
Headers: Idempotency-Key: <uuid>
Body
{ "branch_id":"3333-...","stock_item_id":"4444-...","qty": 24, "note":"DairyCo | INV-0021 | EXP 2025-11-15" }
201
{ "id":"j-uuid","reason":"receive","delta":24,"created_at":"..." }
### POST /inventory/journal/waste
Roles: admin, manager (own branch)
Body
{ "branch_id":"3333-...","stock_item_id":"8888-...","qty": 2.5, "note":"Spoiled" }
201 (server records delta = -abs(qty))

### POST /inventory/journal/correction
Roles: admin, manager (own branch)
Body
{ "branch_id":"3333-...","stock_item_id":"5555-...","delta": 2, "note":"Counted extra 2" }
201

Sale/void/reopen journal writes are usually done by the Sales service via an internal API:

POST /_internal/inventory/journal/sale
{ "branch_id":"3333-...","lines":[{"stock_item_id":"5555-...","delta": -5,"ref_sale_id":"sale-uuid"}] }
POST /_internal/inventory/journal/void
{ "branch_id":"3333-...","lines":[{"stock_item_id":"5555-...","delta": +5,"ref_sale_id":"sale-uuid"}] }
POST /_internal/inventory/journal/reopen (optional if you split void/repost)

### GET /inventory/journal
Roles: admin, manager (own branch)
Query: branch_id, stock_item_id?, reason?, from?, to?, page?
200
{ "entries":[{"id":"j-uuid","branch_id":"3333-...","stock_item_id":"4444-...","reason":"receive","delta":24,"note":"...","created_at":"..."}], "next_page": null }

## 5) On-hand & Low-Stock

### GET /inventory/onhand
Roles: admin, manager (own branch)
Query: branch_id (required), stock_item_id?
200
{
  "branch_id":"3333-...",
  "items":[
    { "stock_item_id":"4444-...","name":"Milk 1000ml","unit_text":"pcs","on_hand":12, "min_threshold":6, "low_stock": false }
  ]
}
### GET /inventory/low-stock
Roles: admin, manager (own branch)
Query: branch_id
200
{
  "branch_id":"3333-...",
  "items":[
    { "stock_item_id":"5555-...","name":"Cups 16oz","on_hand":45,"min_threshold":50 }
  ]
}

## 6) Exceptions (quality & monitoring)

### GET /inventory/exceptions
Roles: admin, manager (own branch for scoped view)
Query: branch_id, type? (negative_stock|unmapped_sale), from?, to?
200
{
  "branch_id":"3333-...",
  "negative_stock":[
    { "stock_item_id":"8888-...","name":"Oranges","on_hand": -2 }
  ],
  "unmapped_sales":[
    { "sale_id":"sale-uuid","menu_item_id":"zzzz-...","occurred_at":"..." }
  ]
}

## 7) Security & Access Control
All endpoints require JWT with tenant_id claim.
Admin: full tenant scope.
Manager: limited to branch_ids in token claims.
Cashier: no write access here (sales writes go via Sales service).
Every write recorded in audit_log (middleware).

## 8) Rate Limits & Limits
Mutations: 30 req/min/tenant (burst 60).
Journal writes per request: max 200 lines (internal sale/void endpoints).
Payload size: ≤ 256 KB.
Soft item limits (enforced elsewhere): items ≤ 120, categories ≤ 12.

## 9) Versioning & Compatibility
Prefix version in URL (/api/v1).
Additive changes only in v1 (fields optional).
Breaking changes → /api/v2.

## 10) Sample Flows

Initial receive (Secondary branch)
Admin links items to branch + thresholds → PUT /inventory/branches/{branch}/stock-items/{item}
Manager posts receives → POST /inventory/journal/receive (milk, cups, oranges, beans, straws)
Verify on-hand → GET /inventory/onhand?branch_id=...

Sales day (auto-deduct ON)
Sales service finalizes order, calls /_internal/inventory/journal/sale with mapped deltas
On-hand reflects new balances; GET /inventory/low-stock for alerts

Void a line
Sales service calls /_internal/inventory/journal/void with compensating deltas
On-hand restored; audit trail intact.