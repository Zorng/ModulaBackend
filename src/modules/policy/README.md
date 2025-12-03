# Policy Module

**Responsibility:** Tenant-level policy configuration matching the frontend settings UI

## Overview

The policy module manages tenant-level configuration settings that control the behavior of various modules across the application. Only includes policies that are displayed in the frontend settings screen.

**Integration Status:** ✅ Connected to **Sales** and **Inventory** modules. See `INTEGRATION_STATUS.md` for details.

## Database Tables (Separate Table Per Policy Type)

Each policy category has its own table:

- `sales_policies` - Tax, currency, and rounding settings
- `inventory_policies` - Stock management settings  
- `cash_session_policies` - Cash handling settings
- `attendance_policies` - Shift and attendance settings

## Module Structure

```text
policy/
├── api/
│   ├── controller/
│   │   └── policyController.ts    # HTTP request handlers
│   ├── router.ts                   # Route definitions
│   └── schemas.ts                  # Zod validation schemas
├── app/
│   └── use-cases.ts                # Business logic use cases
├── domain/
│   ├── entities.ts                 # Policy entity definitions
│   └── factory.ts                  # Use case factory
├── infra/
│   └── repository.ts               # Database access layer
└── index.ts                        # Module exports
```

## Policy Categories

### 1. Tax & Currency (Sales Policies)

Controls tax and currency settings:

- **Apply VAT:** Enable/disable VAT at checkout
- **VAT Rate:** Percentage (e.g., 10 for 10%)
- **KHR per USD:** Exchange rate (default: 4100)
- **Rounding Mode:** How to round KHR totals (NEAREST, UP, DOWN)

### 2. Inventory Behavior

Controls inventory management:

- **Subtract stock on sale:** Automatically deduct inventory
- **Expiry tracking:** Enable expiry date tracking

### 3. Cash Sessions Control

Controls cash handling:

- **Require cash session to sell:** Must have active session
- **Allow paid-out:** Enable paid-out transactions
- **Cash refund approval:** Require approval for refunds
- **Manual cash adjustment:** Allow manual adjustments

### 4. Attendance & Shifts

Controls attendance management:

- **Cash Session Attendance:** Auto-mark attendance from cash session
- **Out of shift approval:** Require approval for out-of-shift actions
- **Early check-in buffer:** Allow early check-in with buffer period
- **Manager edit permission:** Allow managers to edit attendance

## API Endpoints

### Retrieving Policies

```text
GET /v1/policies                     # Get all tenant policies
GET /v1/policies/sales               # Get sales policies
GET /v1/policies/inventory           # Get inventory policies
GET /v1/policies/cash-sessions       # Get cash session policies
GET /v1/policies/attendance          # Get attendance policies
```

### Modifying Policies

```text
PATCH /v1/policies                   # Update any tenant policies (partial)
```

**Example Request:**

```json
{
  "saleVatEnabled": true,
  "saleVatRatePercent": 10,
  "saleFxRateKhrPerUsd": 4100,
  "saleKhrRoundingMode": "NEAREST",
  "inventoryAutoSubtractOnSale": true,
  "inventoryExpiryTrackingEnabled": false
}
```

All fields are optional for partial updates. The system automatically routes updates to the appropriate policy tables.

## Use Cases

### Get Use Cases

- `GetTenantPoliciesUseCase` - Get all policies (combined view)
- `GetSalesPoliciesUseCase` - Get sales-specific policies
- `GetInventoryPoliciesUseCase` - Get inventory policies
- `GetCashSessionPoliciesUseCase` - Get cash session policies
- `GetAttendancePoliciesUseCase` - Get attendance policies

### Update Use Cases

- `UpdateTenantPoliciesUseCase` - Update policies (partial update across multiple tables)
  - Automatically categorizes updates by policy type
  - Updates only the relevant tables
  - Validates all inputs
  - Returns combined updated policies

## Repository

The `PgPolicyRepository` handles database operations across multiple policy tables:

### Key Methods

- `getTenantPolicies()` - Queries all 4 policy tables and combines results
- `getSalesPolicies()` - Queries sales_policies table
- `getInventoryPolicies()` - Queries inventory_policies table
- `getCashSessionPolicies()` - Queries cash_session_policies table
- `getAttendancePolicies()` - Queries attendance_policies table
- `updateTenantPolicies()` - Updates policies across multiple tables based on input
- `ensureDefaultPolicies()` - Creates default policies in all tables if they don't exist

### Update Strategy

When updating policies, the repository:

1. Categorizes each field by policy type (sales, inventory, cash, attendance)
2. Builds separate update queries for each affected table
3. Executes all updates in parallel for performance
4. Returns the combined updated policies

## Frontend Integration

The frontend application displays these policies in the settings UI:

### Cash Sessions Control

- Require cash session to sell (ON)
- Allow paid-out (ON)
- Cash refund approval (OFF)
- Manual cash adjustment (OFF)

### Tax & Currency

- Apply VAT (ON with 10%)
- KHR per USD (4100)
- Rounding mode (Nearest)

### Inventory Behavior

- Subtract stock on sale (ON)
- Expiry tracking (OFF)

### Attendance & Shifts

- Cash Session Attendance (OFF)
- Out of shift approval (OFF)
- Early check-in buffer (OFF)
- Manager edit permission (Coming soon)

## Default Values

All policies have sensible defaults defined in the migration:

### Sales Policies

- VAT enabled: OFF
- VAT rate: 10%
- FX rate: 4100 KHR per USD
- KHR rounding mode: NEAREST

### Inventory Policies

- Auto subtract on sale: ON
- Expiry tracking: OFF

### Cash Session Policies

- Require session: ON
- Allow paid-out: ON
- Require refund approval: OFF
- Allow adjustments: OFF

### Attendance Policies

- Auto from cash session: OFF
- Require out-of-shift approval: OFF
- Early check-in buffer: OFF (15 min)
- Allow manager edits: OFF

## Module Integrations

The policy module is connected to other modules:

### Sales Module

- **VAT:** Sales module reads from `sales_policies.vat_enabled` and `vat_rate_percent`
- **FX Rate:** Sales module reads from `sales_policies.fx_rate_khr_per_usd`
- **Rounding:** Sales module reads from `sales_policies.khr_rounding_mode`

See `src/modules/sales/infra/adapters/policy.adapter.ts` for implementation details.

### Inventory Module

- **Auto-Subtract:** Policy module's `inventory_policies.auto_subtract_on_sale` syncs to inventory module's `store_policy_inventory.inventory_subtract_on_finalize`
- **Sync Adapter:** `InventorySyncAdapter` ensures both tables stay in sync
- **Rich Policies:** Inventory module extends with branch overrides and menu item exclusions

See `src/modules/inventory/POLICY_INTEGRATION.md` for complete documentation.

## Testing

To test the policy module:

### 1. Run Migration

```bash
pnpm migrate
```

### 2. Test API Endpoints

Get all policies:

```bash
curl -H "Authorization: Bearer <token>" http://localhost:3000/v1/policies
```

Get specific policy category:

```bash
curl -H "Authorization: Bearer <token>" http://localhost:3000/v1/policies/sales
```

Update policies:

```bash
curl -X PATCH \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"saleVatEnabled": true, "saleVatRatePercent": 15}' \
  http://localhost:3000/v1/policies
```

### 3. Verify in Database

```sql
-- Check all policy tables
SELECT * FROM sales_policies WHERE tenant_id = '<tenant_id>';
SELECT * FROM inventory_policies WHERE tenant_id = '<tenant_id>';
SELECT * FROM cash_session_policies WHERE tenant_id = '<tenant_id>';
SELECT * FROM attendance_policies WHERE tenant_id = '<tenant_id>';
```

## Notes

- The policy module only includes settings displayed in the frontend UI
- Cash session and attendance modules are TODO for future implementation
- All policy tables have `created_at` and `updated_at` timestamps with automatic update triggers
- Default policies are automatically created for new tenants
- The module follows the same architectural pattern as other modules (menu, inventory, etc.)
