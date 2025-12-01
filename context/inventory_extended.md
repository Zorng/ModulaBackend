# Mod Spec: Inventory Extended (Capstone 1 – Journal-Only + Categories)
## Purpose & Scope

Branch-scoped stock tracking via an append-only inventory journal, with simple categories to organize items and power basic grouping/filters in UI and reports.

## On-hand (reminder)

On-hand = Σ(receive) − Σ(sale) − Σ(waste) ± Σ(correction) ± Σ(void/reopen).
Derived from the journal; never stored as a mutable column.

## Actors & Permissions
Admin (tenant): CRUD stock items, CRUD categories, assign item→category, set thresholds, toggle sale-deduction policy, view all branches.
Manager (branch): View branch stock, record receive/waste/correction, set branch thresholds, view categories.
Cashier: No inventory edits; sales finalize may auto-deduct if policy ON.
System: Applies offline queues; writes compensating entries for void/reopen.

## User Stories (added/affected)
Create Stock Item (Admin) – unchanged.
Assign to Branch & Threshold – unchanged.
Receive / Waste / Correction – unchanged.
Automatic Sale Deduction (Policy-controlled) – unchanged.
Low-Stock Alerts – unchanged.
Offline Sales – unchanged.
NEW: Create Category (Admin)
Create simple category (name).
✅ Appears in filters and reports.
NEW: Assign Item to Category (Admin)
Set/clear category_id on a stock item.
✅ Lists and reports show the category; “Uncategorized” if null.

## Functional Requirements (delta)
Categories are optional; existing items remain valid with category_id = null.
Filtering: Inventory lists support category_id filter; On-Hand and Movements can group/filter by category.
Reporting tie-in: Waste & Corrections and On-Hand can group by category.
Deletion guard: Cannot delete a category while items are assigned (or choose safe mode: set their category_id = null).

## Data Model (Capstone 1)
inventory_categories (NEW)
id BIGSERIAL PK
tenant_id UUID NOT NULL
name TEXT NOT NULL
display_order INT DEFAULT 0
is_active BOOLEAN DEFAULT TRUE
created_at TIMESTAMPTZ DEFAULT now(), created_by UUID
stock_items (UPDATED)
id, tenant_id, name, unit_text, barcode?, default_cost_usd?, is_active, created_at
category_id BIGINT NULL REFERENCES inventory_categories(id)
branch_stock: id, tenant_id, branch_id, stock_item_id, min_threshold, created_at
inventory_journal: id, tenant_id, branch_id, stock_item_id, delta, reason, ref_sale_id?, note?, actor_id?, batch_id?, unit_cost_usd?, created_at
menu_stock_map: menu_item_id (PK), stock_item_id, qty_per_sale
store_policy_inventory: as previously defined
audit_log: as previously defined

## APIs (additive)

Categories
GET  /inventory/categories
POST /inventory/categories
  { "name":"Dairy", "display_order":10, "is_active":true }
PATCH /inventory/categories/{category_id}
DELETE /inventory/categories/{category_id}  // reject if items assigned (or nullify on safe mode)
Stock Items (category field)
GET   /inventory/stock-items?category_id=&q=&is_active=
PATCH /inventory/stock-items/{stock_item_id}
  { "category_id": 123 }  // or null to clear
Reports (filters/grouping)
GET /reports/inventory/onhand?branch_id=&category_id?
GET /reports/inventory/waste-summary?branch_id=&from=&to=&group_by=item|category|actor
GET /reports/inventory/movements?...&category_id?

## UI/UX (Tenant Admin Portal)
Inventory → Items:
Add Category column (pill), inline edit, and filter dropdown.
Bulk action: “Assign Category”.
Inventory → Categories (new page):
Simple list (name, active toggle, drag to reorder).
Reports:
On-Hand: filter by Category; optional “Group by Category” view.
Waste & Corrections: grouping by Category.

## Validation & Guardrails
Category name: 2–40 chars, unique per tenant (case-insensitive recommended).
Deactivation hides from dropdowns but keeps historical references valid.
Category delete rules:
Strict mode (default Capstone 1): block delete if items assigned.
Safe mode (configurable): set assigned items’ category_id = null and log.
Activity Log:
INV_CATEGORY_CREATED|UPDATED|DEACTIVATED|DELETED
STOCK_ITEM_CATEGORY_ASSIGNED (old→new)

## Performance
Index: stock_items(category_id) for filters.
Category joins add negligible overhead at Capstone scale.
Targets unchanged: on-hand query <300 ms per branch; ledger paged <1 s.

## Out of Scope (still)
Hierarchies (parent/child categories), tags, supplier mapping by category, category-level thresholds/policies.
(All possible later without breaking changes.)

## Scenario (quick)
Admin creates categories: Dairy, Packaging, Produce.
Assigns Milk 1L → Dairy, Cups 16oz → Packaging, Oranges → Produce.
On-Hand (Branch A) filtered by Packaging shows Cups, Straws only.
Waste Summary grouped by Category shows Produce waste spiking this week.

Result: You now match a key expectation of mature POS systems (basic inventory categorization) with one small table and no risk to your Capstone 1 journal design.
