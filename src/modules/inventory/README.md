# Inventory Module

**Responsibility:** Stock items, branch stock, restock batches, inventory journal

## Structure

- `api/` - HTTP routes and controllers
- `app/` - Use cases (stock adjustments, restocking)
- `domain/` - StockItem, BranchStock entities
- `infra/` - Inventory repository & policy adapters
- `migrations/` - Inventory-related database tables
- `tests/` - Module tests

## Key Features

- Stock item management
- Branch-level stock tracking
- Inventory journal (audit trail)
- Menu stock mapping (recipes)
- **Automatic inventory deduction** (policy-driven)
- Branch-specific policy overrides
- Menu item exclusions
- Event-driven architecture (subscribes to sales events)

## Policy Integration

The inventory module integrates with the **Policy Module** for automatic inventory deduction control.

**Key Features:**
- ✅ Tenant-level auto-subtract setting (synced with Policy Module)
- ✅ Branch-specific overrides (manual inventory for specific branches)
- ✅ Menu item exclusions (skip deduction for service fees, gift cards, etc.)
- ✅ Event-driven deduction (automatic on sale finalization)

**See:** [POLICY_INTEGRATION.md](./POLICY_INTEGRATION.md) for complete documentation.

## Tables

- `stock_items` - Item definitions
- `branch_stock` - Live balance per branch
- `inventory_journal` - Immutable movement log
- `menu_stock_map` - Recipe mapping
- `store_policy_inventory` - Rich policy configuration (synced with policy module)
