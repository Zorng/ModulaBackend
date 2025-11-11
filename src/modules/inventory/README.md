# Inventory Module

**Responsibility:** Stock items, branch stock, restock batches, inventory journal

## Structure

- `api/` - HTTP routes and controllers
- `app/` - Use cases (stock adjustments, restocking)
- `domain/` - StockItem, BranchStock entities
- `infra/` - Inventory repository
- `migrations/` - Inventory-related database tables
- `tests/` - Module tests

## Key Features

- Stock item management
- Branch-level stock tracking
- Inventory journal (audit trail)
- Restock batches with expiry/lot tracking
- Event subscriber: deduct stock on sale finalized

## Tables

- `inventory.stock_item` - Item definitions
- `inventory.branch_stock` - Live balance per branch
- `inventory.inventory_journal` - Immutable movement log
- `inventory.menu_stock_map` - Recipe mapping
- `inventory.restock_batches` - Delivery batches
