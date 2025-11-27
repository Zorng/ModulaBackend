# Sales Module - Complete Documentation

Fast, reliable checkout for F&B with sale type, policy-driven discounts, tenant-controlled VAT, dual-currency totals, KHR tender rounding, optional inventory subtraction, offline sync, and lightweight fulfillment tracking.

## Architecture

This module follows Clean Architecture principles:

- **Domain Layer** (`domain/entities/`): Core business entities and rules
- **Application Layer** (`app/`): Use cases and business logic orchestration  
- **Infrastructure Layer** (`infra/`): Database repositories and external adapters
- **API Layer** (`api/`): REST controllers, routes, DTOs, and middleware

## Features

### ✅ Core Functionality

- **Draft Sale Management**: Create and manage draft sales with client UUID for offline support
- **Cart Operations**: Add, remove, update item quantities with real-time total calculation
- **Discount Policies**: Automatic application of item-level and order-level discounts
- **VAT Calculation**: Configurable VAT with rate snapshots per sale
- **Dual Currency**: Display totals in both USD and KHR using tenant FX rate
- **KHR Rounding**: Smart rounding for KHR tender (nearest 100, always up, or off)
- **Pre-Checkout Validation**: Required fields before finalization
- **Sale Finalization**: Immutable sale record with audit trail
- **Fulfillment Tracking**: In-Prep → Ready → Delivered → Cancelled states
- **Same-Day Void**: Void finalized sales on the same day with reason
- **Same-Day Reopen**: Reopen finalized sales for correction with full history

### 🔐 Security & Audit

- **Role-Based Access**: Cashier, Manager, Admin permissions
- **Audit Logging**: All critical actions logged with actor, reason, old/new values
- **Same-Day Enforcement**: Void and reopen restricted to sales finalized on current date
- **Immutable History**: Original sales preserved when reopened

### 📊 Reporting & Analytics

- **Subtotal Tracking**: Pre-discount and post-discount subtotals
- **Policy Application**: Track which discount policies were applied
- **Currency Breakdown**: Exact USD and KHR totals plus rounding delta
- **Payment Details**: Cash received and change given
- **Fulfillment Timestamps**: Track order preparation and delivery times

## API Endpoints

All endpoints documented with OpenAPI/Swagger annotations available at `/api-docs`

### Draft Management

```
POST   /v1/sales/drafts
  Body: { clientUuid, saleType, fxRateUsed }
  → Create new draft sale

GET    /v1/sales/drafts/:clientUuid
  → Get or create draft sale for offline client
```

### Cart Operations

```

POST   /v1/sales/:saleId/items
  Body: { menuItemId, menuItemName, unitPriceUsd, quantity, modifiers }
  → Add item to cart (auto-applies item discounts)

PATCH  /v1/sales/:saleId/items/:itemId/quantity
  Body: { quantity }
  → Update item quantity (0 to remove)

DELETE /v1/sales/:saleId/items/:itemId
  → Remove item from cart
```

### Checkout Flow

```
POST   /v1/sales/:saleId/pre-checkout
  Body: { tenderCurrency, paymentMethod, cashReceived? }
  → Apply discounts, VAT, rounding; set payment details

POST   /v1/sales/:saleId/finalize
  Body: { actorId }
  → Finalize sale (triggers inventory events, audit log)
```

### Fulfillment

```
PATCH  /v1/sales/:saleId/fulfillment
  Body: { status, actorId }
  Status: in_prep | ready | delivered | cancelled
  → Update order fulfillment status
```

### Corrections

```
POST   /v1/sales/:saleId/void
  Body: { actorId, reason }
  → Void sale (same-day only, based on finalized_at)

POST   /v1/sales/:saleId/reopen
  Body: { actorId, reason }
  → Reopen sale for correction (same-day only, creates new draft)
```

### Queries

```
GET    /v1/sales/:saleId
  → Get sale with all items and details

GET    /v1/sales
  Query: status, saleType, startDate, endDate, page, limit
  → Get paginated sales list

GET    /v1/sales/branch/today
  → Get all sales for current branch today
```

## Business Rules

### Discount Application

1. **Item Policies First**: Applied per line item before subtotal
2. **Order Policies Second**: Applied to discounted subtotal
3. **Best Policy Wins**: If multiple policies match, apply the one with maximum benefit
4. **No Negative Totals**: Discounts cannot make totals negative
5. **Policy Snapshots**: Policy IDs stored per sale for audit

### VAT Calculation

1. Applied to **post-discount subtotal**
2. Rate and enabled flag snapshotted per sale
3. Exact amounts calculated in both USD and KHR
4. Rounding applied **after** VAT

### KHR Rounding

1. **Only for KHR Tender**: Rounding not applied when tender_currency = USD
2. **Nearest 100** (default): Round to closest 100 riel
3. **Always Up**: Always round up to next 100 riel
4. **Off**: No rounding (exact total)
5. **Rounding Delta**: Tracked separately for reporting (not VAT-able)
6. **Change Calculation**: Based on rounded total when applicable

### Same-Day Operations

**Void**:

- Only sales finalized today (based on `finalized_at` date, not `created_at`)
- Requires reason for audit
- Publishes inventory reversal event
- Sets state to 'voided' and fulfillment to 'cancelled'
- Writes to `sales_audit_log`

**Reopen**:

- Only sales finalized today (based on `finalized_at` date, not `created_at`)
- Creates new draft with reference to original (`ref_previous_sale_id`)
- Copies all items, discounts, VAT settings, payment methods
- Original sale marked as 'reopened' (immutable)
- Both actions logged in audit trail
- Inventory adjustments tracked

### State Transitions

```
draft → finalized → voided
              ↓
        reopened (creates new draft with ref_previous_sale_id)
```

## Database Schema

### `sales` Table

```sql
-- Core identifiers
id UUID PRIMARY KEY
client_uuid UUID NOT NULL
tenant_id, branch_id, employee_id

-- Sale context
sale_type (dine_in | take_away | delivery)
state (draft | finalized | voided | reopened)
ref_previous_sale_id UUID  -- Links reopened sales to original

-- VAT snapshot
vat_enabled BOOLEAN
vat_rate DECIMAL(5,4)
vat_amount_usd DECIMAL(12,2)
vat_amount_khr_exact INTEGER

-- Discounts
applied_policy_ids JSONB  -- Array of policy IDs
order_discount_type (percentage | fixed)
order_discount_amount DECIMAL(10,2)
policy_stale BOOLEAN  -- Flag for offline cache staleness

-- Currency & totals
fx_rate_used DECIMAL(10,4)
subtotal_usd_exact DECIMAL(12,2)
subtotal_khr_exact INTEGER
total_usd_exact DECIMAL(12,2)
total_khr_exact INTEGER

-- Tender & rounding
tender_currency (KHR | USD)
khr_rounding_applied BOOLEAN
total_khr_rounded INTEGER
rounding_delta_khr INTEGER

-- Payment
payment_method (cash | qr | transfer | other)
cash_received_khr, cash_received_usd
change_given_khr, change_given_usd

-- Fulfillment
fulfillment_status (in_prep | ready | delivered | cancelled)

-- Timestamps
created_at, updated_at, finalized_at
in_prep_at, ready_at, delivered_at, cancelled_at
```

### `sale_items` Table

```sql
id UUID PRIMARY KEY
sale_id UUID REFERENCES sales(id)
menu_item_id UUID

-- Snapshots (immutable after finalize)
menu_item_name VARCHAR(255)
unit_price_usd DECIMAL(10,2)
unit_price_khr_exact INTEGER
modifiers JSONB

-- Quantities & totals
quantity INTEGER CHECK (quantity > 0)
line_total_usd_exact DECIMAL(12,2)
line_total_khr_exact INTEGER

-- Line discounts
line_discount_type (percentage | fixed)
line_discount_amount DECIMAL(10,2)
line_applied_policy_id UUID

created_at, updated_at
```

### `discount_policies` Table

```sql
id UUID PRIMARY KEY
tenant_id UUID
name VARCHAR(255)
type (per_item | per_branch)
value_type (percentage | fixed)
value DECIMAL(10,2) CHECK (value >= 0)
scope_branches JSONB  -- Array of branch IDs
target_item_ids JSONB  -- Array of menu item IDs (for per_item)
starts_at TIMESTAMPTZ
ends_at TIMESTAMPTZ
status (active | inactive | scheduled)
version INTEGER  -- For policy versioning
created_at, updated_at
```

### `inventory_journal` Table

```sql
id UUID PRIMARY KEY
branch_id UUID
stock_item_id UUID  -- References menu items or stock items
delta INTEGER  -- Negative for sale, positive for void/reopen
reason (sale | void | reopen | adjustment)
ref_sale_id UUID REFERENCES sales(id)
created_at TIMESTAMPTZ
```

### `sales_audit_log` Table

```sql
id UUID PRIMARY KEY
tenant_id, branch_id, sale_id, actor_id UUID
action VARCHAR(50) CHECK (action IN (
  'create_draft', 'finalize', 'void', 'reopen',
  'set_ready', 'set_delivered', 'revert_fulfillment'
))
reason TEXT
old_values JSONB
new_values JSONB
created_at TIMESTAMPTZ
```

## Event Publishing

The sales service publishes domain events for cross-module integration:

### `sales.draft_created`

Triggered when a new draft sale is created (first item added)

### `sales.sale_finalized`

Triggered when sale is finalized. Includes:

- Line items for inventory deduction
- Totals for revenue reporting
- Payment/tender details
- Applied discount policies

### `sales.sale_voided`

Triggered when sale is voided. Includes:

- Line items for inventory restoration
- Actor and reason for audit
- Original sale totals

### `sales.sale_reopened`

Triggered when sale is reopened. Includes:

- Original and new sale IDs
- Reason for correction
- Link between sales via ref_previous_sale_id

### `sales.fulfillment_updated`

Triggered when fulfillment status changes (ready, delivered, etc.)

## Usage Scenarios

### Scenario 1: Making a Sale in a Café

**Context**: Customer orders at Leaf & Latte Café

1. **Start**: Cashier taps first menu item
   - System silently creates draft sale with client UUID

2. **Build Cart**: Add 2× Iced Latte, 1× Brown Sugar Boba + Aloe Vera
   - Item discounts auto-applied (Iced Latte has 15% promotion)
   - Cart updates live with discounted prices

3. **Pre-Checkout**: Required fields
   - Sale Type: Dine-In
   - Payment Method: Cash
   - Tender Currency: KHR

4. **Totals Display**:
   ```
   Subtotal:        $7.75
   VAT (10%):       +$0.78
   Total (exact):   $8.53 (≈ 34,952 KHR)
   Rounding:        +48 KHR
   Final Total:     35,000 KHR
   ```

5. **Checkout**: Enter cash received 40,000 KHR
   - System calculates change: 5,000 KHR
   - Sale finalized (immutable)
   - Order moves to In-Prep
   - Audit log entry created
   - Inventory event published

6. **Fulfillment**: Barista marks Ready → Delivered

### Scenario 2: Voiding a Sale

**Context**: Customer cancels before preparation

1. **Request**: Customer cancels immediately after payment
2. **Void**: Manager opens sale → Void → Enter reason
   - "Customer cancelled — no oat milk available"
3. **System Actions**:
   - Validates sale was finalized today (checks `finalized_at`)
   - State → 'voided'
   - Fulfillment → 'cancelled'
   - Audit log entry with reason
   - Inventory event published (+2 Iced Latte restored)
   - Sale excluded from revenue reports

### Scenario 3: Reopening a Sale

**Context**: Wrong item was ordered

1. **Discovery**: Customer reports Americano instead of Latte
2. **Manager Review**: Opens Today's Sales → Select sale → Reopen
3. **Reason**: "Customer changed order (wanted Latte not Americano)"
4. **System Actions**:
   - Validates sale was finalized today (checks `finalized_at`)
   - Original sale → 'reopened' (locked, immutable)
   - New draft created with `ref_previous_sale_id` pointing to original
   - All items, discounts, VAT, payment method copied
   - Audit log entries for both sales
   - Cashier edits: Remove Americano, Add Latte
   - Re-finalize new sale
   - Inventory: +1 Americano (returned), -1 Latte (sold)
5. **Receipt**: Shows "Reopened from Sale #A000478"

### Scenario 4: Next-Day Reopen Attempt (Blocked)

1. **Attempt**: Manager tries to reopen yesterday's sale
2. **System Response**: 
   ```
   ⚠️ "Only same-day sales can be reopened. 
   This sale was finalized on a different day."
   ```
3. **Audit Log**: Denied attempt NOT recorded (validation happens before audit)
4. **Solution**: Record manual adjustment in daily report

## Testing

```bash
# Run sales module tests
pnpm test src/modules/sales/tests/sales.test.ts

# All tests
pnpm test
```

### Test Coverage

- ✅ Draft sale creation
- ✅ Add/remove/update cart items
- ✅ Total calculation with discounts and VAT
- ✅ KHR rounding logic
- ✅ Same-day void validation (finalized_at based)
- ✅ Same-day reopen validation (finalized_at based)
- ✅ Audit log integration
- ✅ Event publishing
- ✅ Subtotal tracking
- ✅ Reopened sale links via ref_previous_sale_id

## Integration Points

### With Auth Module

- Uses `AuthRequest` interface for actor identification
- All endpoints protected with JWT authentication
- Role checks enforced (cashier vs manager permissions)

### With Inventory Module (Future)

- `sales.sale_finalized` event triggers stock deduction
- `sales.sale_voided` event triggers stock restoration
- `sales.sale_reopened` event adjusts inventory for corrections
- Records written to `inventory_journal` table

### With Reporting Module (Future)

- Sales data includes all required fields for analytics
- Subtotal and total breakdowns for revenue tracking
- Applied policies for discount analysis
- Fulfillment timestamps for performance metrics
- Rounding deltas for reconciliation

## Configuration

Tenant-level settings managed via `PolicyPort`:

```typescript
interface PolicyPort {
  getCurrentFxRate(tenantId: string): Promise<number>;
  getVatPolicy(tenantId: string): Promise<{ enabled: boolean; rate: number }>;
  getRoundingPolicy(tenantId: string): Promise<{ enabled: boolean; method: string }>;
  getItemDiscountPolicies(tenantId, branchId, menuItemId): Promise<Policy[]>;
  getOrderDiscountPolicies(tenantId, branchId): Promise<Policy[]>;
}
```

## Performance

- Item operations: <150ms
- Finalize: <1s (excluding network)
- Idempotent finalize via client_uuid
- Optimized indexes on:
  - tenant_id, branch_id (composite)
  - state
  - fulfillment_status
  - finalized_at
  - client_uuid
- Partial index for active orders (state='finalized' AND fulfillment IN ('in_prep','ready'))

## Requirements Compliance

✅ **All requirements from spec met**:

- Draft sale with client UUID for offline
- Sale type (dine_in, take_away, delivery)
- Policy-driven discounts (item + order level)
- Tenant VAT control with snapshots
- Dual currency (USD + KHR)
- KHR rounding (nearest 100/always up/off)
- Pre-checkout validation
- Immutable finalized sales
- Same-day void (finalized_at based)
- Same-day reopen (finalized_at based) with ref_previous_sale_id
- Fulfillment tracking (in_prep → ready → delivered)
- Audit logging (all actions, actor, reason, old/new values)
- Event publishing for inventory integration
- Subtotal tracking for reporting
- Policy staleness flag for offline scenarios

## Out of Scope (Phase 1)

- Payment gateway integration
- Split tenders / multiple payment methods per sale
- Table management
- Delivery addresses
- Manual line-level discounts by cashier
- Coupon / BOGO / promo codes engine
- Printer / cash drawer integration
- Recipe-level stock deduction
- Multi-currency tender split

---

**Module Status**: ✅ Production Ready - All Spec Requirements Met

**Last Updated**: November 22, 2025
**Tests**: All Passing ✅
**TypeScript**: No Errors ✅
**Database**: Migrated Successfully ✅
**API Docs**: Available at /api-docs ✅
