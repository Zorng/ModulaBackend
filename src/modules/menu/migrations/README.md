# Menu Module Migrations

## Overview

These migrations create the database schema for the Menu & Category module, following the modular architecture playbook.

## Migration Order

Run migrations in this exact order (numbered sequentially):

1. **0001_create_categories.sql** - Menu categories table
2. **0002_create_menu_items.sql** - Menu items table (depends on categories)
3. **0003_create_modifiers.sql** - Modifier groups and options
4. **0004_create_menu_modifier_map.sql** - Junction table linking items to modifiers
5. **0005_create_branch_menu_items.sql** - Branch-specific overrides
6. **0006_create_tenant_limits.sql** - Quota/limits configuration
7. **0007_create_menu_stock_map.sql** - Inventory integration mapping
8. **0008_create_platform_outbox.sql** - Event outbox (platform-level)

## Running Migrations

### Development

```bash
# Using your migration runner (platform/db/migrate.ts)
pnpm migrate

# Or manually with psql
psql -U your_user -d modula_dev -f 0001_create_categories.sql
psql -U your_user -d modula_dev -f 0002_create_menu_items.sql
# ... etc
```

### Key Features

#### Automatic Timestamps

All tables have `created_at` and `updated_at` columns with automatic triggers.

#### Multi-tenancy

Every table includes `tenant_id` for data isolation. When adding RLS (Row Level Security) in production:

```sql
ALTER TABLE menu_categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON menu_categories
  USING (tenant_id = current_setting('app.tenant_id')::UUID);
```

#### Quota Enforcement

Menu quotas are stored in the unified `tenant_limits` table (shared across menu + inventory + staff):

- Max 8 categories (soft), 12 (hard)
- Max 75 items (soft), 120 (hard)
- Max 5 modifier groups per item
- Max 12 options per group
- Max 30 total options per item

Usage counting is implemented in application queries (no DB helper function required).

#### Constraints

- Unique category/item names per tenant (case-insensitive)
- Unique option labels within modifier groups
- Price validation (must be >= 0)
- Modifier group limit (≤5 per item) enforced at DB level

## Dependencies

### External References (will be added when modules are ready)

- `tenants(id)` - from tenant module
- `branches(id)` - from tenant module
- `users(id)` - from auth module (for created_by, updated_by)
- `inventory.stock_items(id)` - from inventory module

For now, these are UUID fields without foreign key constraints. Add constraints when modules are integrated.

## Rollback

To rollback migrations (development only):

```sql
DROP TABLE IF EXISTS platform_outbox CASCADE;
DROP TABLE IF EXISTS menu_stock_map CASCADE;
DROP TABLE IF EXISTS tenant_limits CASCADE;
DROP TABLE IF EXISTS menu_branch_items CASCADE;
DROP TABLE IF EXISTS menu_item_modifier_groups CASCADE;
DROP TABLE IF EXISTS menu_modifier_options CASCADE;
DROP TABLE IF EXISTS menu_modifier_groups CASCADE;
DROP TABLE IF EXISTS menu_items CASCADE;
DROP TABLE IF EXISTS menu_categories CASCADE;
DROP FUNCTION IF EXISTS update_menu_categories_timestamp CASCADE;
DROP FUNCTION IF EXISTS check_modifier_group_limit CASCADE;
DROP FUNCTION IF EXISTS cleanup_sent_outbox_events CASCADE;
```

## Testing

After running migrations, verify with:

```sql
-- Check all tables exist
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public' AND table_name LIKE 'menu_%';

-- Check indexes
SELECT indexname FROM pg_indexes
WHERE tablename LIKE 'menu_%';

-- Test quota function
INSERT INTO tenant_limits (tenant_id)
VALUES ('00000000-0000-0000-0000-000000000001');
```

## Phase 2 Extensions

Future migrations will add:

- `menu_recipe_bom` - Multi-ingredient recipes (Bill of Materials)
- `menu_scheduled_availability` - Time-based menu availability
- `menu_location_pricing` - Geographic pricing zones
- Materialized views for reporting
