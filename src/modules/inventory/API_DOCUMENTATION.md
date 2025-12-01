# Inventory Module API Documentation

Complete API reference for the Inventory Management module.

**Base URL**: `/v1/inventory`

**Authentication**: All endpoints require Bearer token authentication (except internal endpoints which are module-to-module only).

---

## Table of Contents

1. [Stock Items](#stock-items) - Manage inventory items (products, ingredients, supplies)
2. [Branch Stock](#branch-stock) - Assign items to branches and set thresholds
3. [Inventory Journal](#inventory-journal) - Track all inventory movements
4. [Menu Stock Map](#menu-stock-map) - Link menu items to ingredients
5. [Store Policy](#store-policy) - Configure automatic inventory deduction
6. [Internal Endpoints](#internal-endpoints) - Sales module integration

---

## Stock Items

Manage inventory items that can be tracked (flour, sugar, plates, etc.)

### Create Stock Item

Create a new inventory item for the tenant.

**Endpoint**: `POST /v1/inventory/stock-items`

**Request Body**:

```json
{
  "name": "Premium Flour", // Required: Item name
  "unitText": "kg", // Required: Unit of measure (kg, liter, pcs, etc.)
  "barcode": "FLOUR001", // Optional: Barcode/SKU
  "defaultCostUsd": 5.5, // Optional: Default cost per unit
  "isActive": true // Required: Whether item is active
}
```

**Response** (201 Created):

```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "tenantId": "uuid",
    "name": "Premium Flour",
    "unitText": "kg",
    "barcode": "FLOUR001",
    "defaultCostUsd": 5.5,
    "isActive": true,
    "createdAt": "2025-01-15T10:00:00Z",
    "updatedAt": "2025-01-15T10:00:00Z"
  }
}
```

**Use Cases**:

- Adding new products to track
- Setting up ingredients for recipes
- Registering supplies (plates, napkins, etc.)

---

### Update Stock Item

Update an existing stock item's details.

**Endpoint**: `PUT /v1/inventory/stock-items/:id`

**Path Parameters**:

- `id` (string): Stock item ID

**Request Body**:

```json
{
  "name": "Super Premium Flour", // Optional: Updated name
  "unitText": "kg", // Optional: Updated unit
  "barcode": "FLOUR002", // Optional: Updated barcode
  "defaultCostUsd": 6.0, // Optional: Updated cost
  "isActive": false // Optional: Deactivate item
}
```

**Response** (200 OK):

```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "tenantId": "uuid",
    "name": "Super Premium Flour",
    "unitText": "kg",
    "barcode": "FLOUR002",
    "defaultCostUsd": 6.0,
    "isActive": false,
    "createdAt": "2025-01-15T10:00:00Z",
    "updatedAt": "2025-01-15T11:00:00Z"
  }
}
```

**Use Cases**:

- Updating prices
- Correcting item names
- Deactivating discontinued items

---

### Get Stock Items

Retrieve all stock items for the tenant with optional filtering.

**Endpoint**: `GET /v1/inventory/stock-items`

**Query Parameters**:

- `q` (string): Search by name (fuzzy match)
- `isActive` (boolean): Filter by active status
- `page` (number): Page number (default: 1)
- `pageSize` (number): Items per page (default: 20)

**Examples**:

```
GET /v1/inventory/stock-items
GET /v1/inventory/stock-items?q=flour
GET /v1/inventory/stock-items?isActive=true
GET /v1/inventory/stock-items?q=sugar&page=2&pageSize=10
```

**Response** (200 OK):

```json
{
  "success": true,
  "data": {
    "items": [
      {
        "id": "uuid",
        "tenantId": "uuid",
        "name": "Premium Flour",
        "unitText": "kg",
        "barcode": "FLOUR001",
        "defaultCostUsd": 5.5,
        "isActive": true,
        "createdAt": "2025-01-15T10:00:00Z",
        "updatedAt": "2025-01-15T10:00:00Z"
      }
    ],
    "nextPage": 2 // Only present if more pages exist
  }
}
```

**Use Cases**:

- Viewing all inventory items
- Searching for specific items
- Building stock selection dropdowns

---

## Branch Stock

Assign stock items to branches and configure minimum thresholds.

### Assign Stock Item to Branch

Make a stock item available at a specific branch with low-stock threshold.

**Endpoint**: `POST /v1/inventory/branch/stock-items`

**Request Body**:

```json
{
  "stockItemId": "uuid", // Required: Stock item to assign
  "minThreshold": 10 // Required: Low stock alert threshold (>= 0)
}
```

**Response** (201 Created):

```json
{
  "success": true,
  "data": {
    "tenantId": "uuid",
    "branchId": "uuid",
    "stockItemId": "uuid",
    "minThreshold": 10,
    "createdAt": "2025-01-15T10:00:00Z",
    "updatedAt": "2025-01-15T10:00:00Z"
  }
}
```

**Use Cases**:

- Setting up inventory for new branch
- Configuring low-stock alerts per branch
- Enabling tracking for specific items at a location

**Business Rules**:

- Stock item must exist
- Stock item must belong to same tenant
- minThreshold must be >= 0

---

### Get Branch Stock Items

Get all stock items assigned to the current user's branch.

**Endpoint**: `GET /v1/inventory/branch/stock-items`

**Response** (200 OK):

```json
{
  "success": true,
  "data": [
    {
      "stockItemId": "uuid",
      "name": "Premium Flour",
      "unitText": "kg",
      "minThreshold": 10,
      "barcode": "FLOUR001",
      "defaultCostUsd": 5.5,
      "isActive": true
    }
  ]
}
```

**Use Cases**:

- Viewing items tracked at current branch
- Building inventory selection lists
- Checking which items are configured

---

## Inventory Journal

Track all inventory movements (receipts, waste, corrections, sales, etc.)

### Receive Stock

Record incoming inventory (deliveries, purchases, returns).

**Endpoint**: `POST /v1/inventory/journal/receive`

**Request Body**:

```json
{
  "stockItemId": "uuid", // Required: Item being received
  "qty": 50, // Required: Quantity (must be positive)
  "note": "Weekly delivery" // Optional: Reason/reference
}
```

**Response** (201 Created):

```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "tenantId": "uuid",
    "branchId": "uuid",
    "stockItemId": "uuid",
    "reason": "RECEIVE",
    "delta": 50,
    "balanceAfter": 150,
    "note": "Weekly delivery",
    "refSaleId": null,
    "actorId": "uuid",
    "occurredAt": "2025-01-15T10:00:00Z"
  }
}
```

**Use Cases**:

- Recording supplier deliveries
- Adding stock from other branches
- Processing customer returns

---

### Waste Stock

Record inventory loss (spoilage, breakage, expiration).

**Endpoint**: `POST /v1/inventory/journal/waste`

**Request Body**:

```json
{
  "stockItemId": "uuid", // Required: Item being wasted
  "qty": 5, // Required: Quantity wasted (positive, will be negated)
  "note": "Expired batch - 2025-01-10" // Required: Reason for waste
}
```

**Response** (201 Created):

```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "tenantId": "uuid",
    "branchId": "uuid",
    "stockItemId": "uuid",
    "reason": "WASTE",
    "delta": -5,
    "balanceAfter": 145,
    "note": "Expired batch - 2025-01-10",
    "refSaleId": null,
    "actorId": "uuid",
    "occurredAt": "2025-01-15T11:00:00Z"
  }
}
```

**Use Cases**:

- Recording expired items
- Tracking breakage/damage
- Documenting theft/loss

**Business Rules**:

- Note is mandatory (waste must be documented)
- Quantity is entered as positive but stored as negative

---

### Correct Stock

Adjust inventory to match physical count (positive or negative).

**Endpoint**: `POST /v1/inventory/journal/correct`

**Request Body**:

```json
{
  "stockItemId": "uuid", // Required: Item being corrected
  "delta": 3, // Required: Adjustment (positive = add, negative = subtract)
  "note": "Physical count adjustment - found extra" // Required: Reason for correction
}
```

**Response** (201 Created):

```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "tenantId": "uuid",
    "branchId": "uuid",
    "stockItemId": "uuid",
    "reason": "CORRECT",
    "delta": 3,
    "balanceAfter": 148,
    "note": "Physical count adjustment - found extra",
    "refSaleId": null,
    "actorId": "uuid",
    "occurredAt": "2025-01-15T12:00:00Z"
  }
}
```

**Use Cases**:

- Physical inventory counts
- Reconciling system vs actual stock
- Fixing data entry errors

**Business Rules**:

- Note is mandatory (corrections must be documented)
- Delta can be positive or negative

---

### Get On-Hand Inventory

Get current inventory balances for all items at the branch.

**Endpoint**: `GET /v1/inventory/journal/on-hand`

**Query Parameters**:

- `stockItemId` (string): Optional - filter to specific item

**Response** (200 OK):

```json
{
  "success": true,
  "data": {
    "branchId": "uuid",
    "items": [
      {
        "stockItemId": "uuid",
        "name": "Premium Flour",
        "unitText": "kg",
        "onHand": 148,
        "minThreshold": 10,
        "lowStock": false
      },
      {
        "stockItemId": "uuid2",
        "name": "Sugar",
        "unitText": "kg",
        "onHand": 8,
        "minThreshold": 10,
        "lowStock": true
      }
    ]
  }
}
```

**Use Cases**:

- Viewing current stock levels
- Checking inventory before ordering
- Dashboard displays

---

### Get Inventory Journal

Query transaction history with filtering.

**Endpoint**: `GET /v1/inventory/journal`

**Query Parameters**:

- `stockItemId` (string): Filter by item
- `reason` (string): Filter by transaction type (RECEIVE, WASTE, CORRECT, SALE_DEDUCTION, VOID_REVERSAL, REOPEN_DEDUCTION)
- `fromDate` (ISO 8601): Start date filter
- `toDate` (ISO 8601): End date filter
- `page` (number): Page number
- `pageSize` (number): Items per page

**Examples**:

```
GET /v1/inventory/journal
GET /v1/inventory/journal?stockItemId=uuid
GET /v1/inventory/journal?reason=WASTE
GET /v1/inventory/journal?fromDate=2025-01-01&toDate=2025-01-31
```

**Response** (200 OK):

```json
{
  "success": true,
  "data": {
    "branchId": "uuid",
    "items": [
      {
        "id": "uuid",
        "stockItemId": "uuid",
        "reason": "RECEIVE",
        "delta": 50,
        "balanceAfter": 150,
        "note": "Weekly delivery",
        "refSaleId": null,
        "actorId": "uuid",
        "occurredAt": "2025-01-15T10:00:00Z"
      }
    ],
    "nextPage": 2
  }
}
```

**Use Cases**:

- Audit trails
- Transaction history reports
- Investigating discrepancies

---

### Get Low Stock Alerts

Get items below their minimum threshold.

**Endpoint**: `GET /v1/inventory/branch/alerts/low-stock`

**Response** (200 OK):

```json
{
  "success": true,
  "data": {
    "branchId": "uuid",
    "items": [
      {
        "stockItemId": "uuid",
        "name": "Sugar",
        "unitText": "kg",
        "onHand": 8,
        "minThreshold": 10
      }
    ]
  }
}
```

**Use Cases**:

- Generating reorder reports
- Dashboard alerts
- Automated notifications

---

### Get Inventory Exceptions

Get problematic inventory situations.

**Endpoint**: `GET /v1/inventory/branch/alerts/exceptions`

**Response** (200 OK):

```json
{
  "success": true,
  "data": {
    "branchId": "uuid",
    "negativeStock": [
      {
        "type": "negative_stock",
        "stockItemId": "uuid",
        "name": "Milk",
        "unitText": "liter",
        "onHand": -2,
        "minThreshold": 5
      }
    ],
    "unmappedSales": [
      {
        "type": "unmapped_sale",
        "saleId": "uuid",
        "menuItemId": "uuid",
        "occurredAt": "2025-01-15T14:00:00Z"
      }
    ]
  }
}
```

**Exception Types**:

1. **Negative Stock**: Items with on-hand quantity below zero (oversold)
2. **Unmapped Sales**: Sales with menu items that have no stock mappings configured

**Use Cases**:

- Identifying data integrity issues
- Finding configuration gaps
- Troubleshooting inventory problems

---

## Menu Stock Map

Link menu items to their ingredient stock items (recipes).

### Set Menu Stock Map

Create or update a mapping between a menu item and stock item.

**Endpoint**: `POST /v1/inventory/menu-stock-map`

**Request Body**:

```json
{
  "menuItemId": "uuid", // Required: Menu item (e.g., Pizza)
  "stockItemId": "uuid", // Required: Stock item (e.g., Flour)
  "qtyPerSale": 0.5 // Required: Quantity used per sale (must be > 0)
}
```

**Response** (201 Created):

```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "tenantId": "uuid",
    "menuItemId": "uuid",
    "stockItemId": "uuid",
    "qtyPerSale": 0.5,
    "createdBy": "uuid",
    "createdAt": "2025-01-15T10:00:00Z"
  }
}
```

**Use Cases**:

- Setting up recipes (Pizza = 0.5kg flour + 0.3kg cheese + 0.2kg sauce)
- Configuring ingredient deductions
- Building bill of materials

**Business Rules**:

- One menu item can have multiple stock items (one-to-many)
- Stock item must exist and belong to tenant
- qtyPerSale must be positive
- Upserts automatically (updates if mapping exists)

---

### Get Menu Stock Map

Get all stock mappings for a menu item.

**Endpoint**: `GET /v1/inventory/menu-stock-map/:menuItemId`

**Path Parameters**:

- `menuItemId` (string): Menu item ID

**Response** (200 OK):

```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "tenantId": "uuid",
      "menuItemId": "uuid",
      "stockItemId": "uuid-flour",
      "qtyPerSale": 0.5,
      "createdBy": "uuid",
      "createdAt": "2025-01-15T10:00:00Z"
    },
    {
      "id": "uuid2",
      "tenantId": "uuid",
      "menuItemId": "uuid",
      "stockItemId": "uuid-cheese",
      "qtyPerSale": 0.3,
      "createdBy": "uuid",
      "createdAt": "2025-01-15T10:05:00Z"
    }
  ]
}
```

**Use Cases**:

- Viewing recipe ingredients
- Editing menu item configurations
- Calculating inventory requirements

---

### Get All Menu Stock Maps

Get all stock mappings for the tenant.

**Endpoint**: `GET /v1/inventory/menu-stock-map`

**Response** (200 OK):

```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "tenantId": "uuid",
      "menuItemId": "uuid-pizza",
      "stockItemId": "uuid-flour",
      "qtyPerSale": 0.5,
      "createdBy": "uuid",
      "createdAt": "2025-01-15T10:00:00Z"
    }
  ]
}
```

**Use Cases**:

- Bulk exports
- System-wide recipe review
- Data migration

---

### Delete Menu Stock Map

Remove a stock mapping.

**Endpoint**: `DELETE /v1/inventory/menu-stock-map/:id`

**Path Parameters**:

- `id` (string): Mapping ID

**Response** (204 No Content)

**Use Cases**:

- Removing incorrect mappings
- Changing recipes
- Discontinuing ingredient tracking

---

## Store Policy

Configure automatic inventory deduction behavior.

### Get Store Policy Inventory

Get current inventory policy settings for the tenant.

**Endpoint**: `GET /v1/inventory/policy`

**Response** (200 OK):

```json
{
  "success": true,
  "data": {
    "tenantId": "uuid",
    "inventorySubtractOnFinalize": true,
    "branchOverrides": [
      {
        "branchId": "uuid",
        "inventorySubtractOnFinalize": false
      }
    ],
    "excludeMenuItemIds": ["uuid-service-fee", "uuid-gift-wrap"],
    "createdBy": "uuid",
    "createdAt": "2025-01-15T10:00:00Z",
    "updatedBy": "uuid",
    "updatedAt": "2025-01-15T11:00:00Z"
  }
}
```

**Fields**:

- `inventorySubtractOnFinalize`: Default policy for all branches (true = auto-deduct)
- `branchOverrides`: Branch-specific overrides to default policy
- `excludeMenuItemIds`: Menu items that never trigger auto-deduction

**Use Cases**:

- Checking current policy
- Understanding deduction behavior
- Troubleshooting why items aren't deducting

**Note**: If policy doesn't exist, it's created with defaults:

- `inventorySubtractOnFinalize`: true
- `branchOverrides`: []
- `excludeMenuItemIds`: []

---

### Update Store Policy Inventory

Update inventory deduction settings.

**Endpoint**: `PUT /v1/inventory/policy`

**Request Body**:

```json
{
  "inventorySubtractOnFinalize": true,
  "branchOverrides": [
    {
      "branchId": "uuid-branch-downtown",
      "inventorySubtractOnFinalize": false // Downtown branch uses manual inventory
    }
  ],
  "excludeMenuItemIds": [
    "uuid-service-fee", // Don't deduct for service fees
    "uuid-gift-wrap", // Don't deduct for gift wrapping
    "uuid-loyalty-reward" // Don't deduct for free loyalty items
  ]
}
```

**Response** (200 OK):

```json
{
  "success": true,
  "data": {
    "tenantId": "uuid",
    "inventorySubtractOnFinalize": true,
    "branchOverrides": [...],
    "excludeMenuItemIds": [...],
    "createdBy": "uuid",
    "createdAt": "2025-01-15T10:00:00Z",
    "updatedBy": "uuid",
    "updatedAt": "2025-01-15T12:00:00Z"
  }
}
```

**Use Cases**:

- Enabling/disabling auto-deduction globally
- Configuring branch-specific policies
- Excluding non-inventory items from deduction

**Policy Evaluation**:

1. Check if menu item is in `excludeMenuItemIds` → Skip deduction
2. Check if branch has override → Use override policy
3. Otherwise → Use default `inventorySubtractOnFinalize`

---

## Internal Endpoints

**⚠️ Module-to-Module Only**: These endpoints are for internal service communication. They should NOT be called from frontend applications.

### Architecture: Event-Driven with Fallback

The inventory module uses an **event-driven architecture** for automatic inventory deduction:

**Primary Flow (Event-Driven):**

```
1. Sale Finalized (Sales Module)
   → Publishes: sales.sale_finalized event to outbox table

2. Event Bus (Background Processing)
   → Reads: event from outbox
   → Dispatches: to registered handlers

3. SaleFinalizedHandler (Inventory Module)
   → Checks: Store policy (creates default if missing)
   → Evaluates: Should deduct? (global setting, branch overrides, excluded items)
   → If YES: Gets menu stock maps → Calls internal deduction use case
   → If NO: Skips deduction (logs reason)

4. Result
   → Inventory deducted automatically
   → Journal entries created with reason=SALE_DEDUCTION
   → Event: inventory.stock_sale_deducted published
```

**Fallback Flow (Direct Endpoints):**

The internal endpoints exist for:

- **Manual corrections** - Admin needs to trigger deduction manually
- **Integration testing** - Test inventory deduction independently
- **Troubleshooting** - Replay failed deductions
- **Backwards compatibility** - Legacy systems that don't use events

**Policy Checking:**

Store policy is checked **inside the event handler**, not by the sales module:

- Sales doesn't need to know about inventory policy
- Inventory owns its own business rules
- Policy created lazily on first access (default: auto-deduction enabled)

---

### Record Sale Deductions

Deduct inventory when a sale is finalized.

**Endpoint**: `POST /v1/inventory/_internal/journal/sale`

**Request Body**:

```json
{
  "refSaleId": "uuid", // Required: Sale reference
  "lines": [
    // Required: Items to deduct
    {
      "stockItemId": "uuid",
      "qtyDeducted": 0.5 // Positive value (will be negated)
    }
  ]
}
```

**Response** (201 Created):

```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "tenantId": "uuid",
      "branchId": "uuid",
      "stockItemId": "uuid",
      "reason": "SALE_DEDUCTION",
      "delta": -0.5,
      "balanceAfter": 147.5,
      "note": null,
      "refSaleId": "uuid",
      "actorId": null,
      "occurredAt": "2025-01-15T14:00:00Z"
    }
  ]
}
```

**Called By**: Sales module when sale is finalized

**Business Rules**:

- Validates stock policy first
- Checks branch overrides
- Skips excluded menu items
- Creates journal entries with reason=SALE_DEDUCTION

---

### Record Void Reversals

Restore inventory when a sale is voided.

**Endpoint**: `POST /v1/inventory/_internal/journal/void`

**Request Body**:

```json
{
  "refSaleId": "uuid", // Required: Original sale ID
  "originalLines": [
    // Required: Original deducted lines
    {
      "stockItemId": "uuid",
      "qtyDeducted": 0.5
    }
  ]
}
```

**Response** (201 Created):

```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "tenantId": "uuid",
      "branchId": "uuid",
      "stockItemId": "uuid",
      "reason": "VOID_REVERSAL",
      "delta": 0.5, // Positive (restored)
      "balanceAfter": 148,
      "note": null,
      "refSaleId": "uuid",
      "actorId": null,
      "occurredAt": "2025-01-15T15:00:00Z"
    }
  ]
}
```

**Called By**: Sales module when sale is voided/cancelled

**Business Rules**:

- Reverses original deductions
- Creates journal entries with reason=VOID_REVERSAL
- Restores exact quantities that were deducted

---

### Record Reopen Deductions

Re-deduct inventory when a voided sale is reopened.

**Endpoint**: `POST /v1/inventory/_internal/journal/reopen`

**Request Body**:

```json
{
  "originalSaleId": "uuid", // Required: Original voided sale
  "newSaleId": "uuid", // Required: New sale ID after reopen
  "lines": [
    // Required: Items to re-deduct
    {
      "stockItemId": "uuid",
      "qtyDeducted": 0.5
    }
  ]
}
```

**Response** (201 Created):

```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "tenantId": "uuid",
      "branchId": "uuid",
      "stockItemId": "uuid",
      "reason": "REOPEN_DEDUCTION",
      "delta": -0.5,
      "balanceAfter": 147.5,
      "note": null,
      "refSaleId": "uuid-new-sale",
      "actorId": null,
      "occurredAt": "2025-01-15T16:00:00Z"
    }
  ]
}
```

**Called By**: Sales module when voided sale is reopened

**Business Rules**:

- Re-applies deductions with new sale ID
- Creates journal entries with reason=REOPEN_DEDUCTION
- Uses newSaleId as reference

---

## Error Responses

All endpoints follow a consistent error format:

```json
{
  "success": false,
  "error": "Error message here"
}
```

**Common HTTP Status Codes**:

- `400 Bad Request` - Validation error or business rule violation
- `401 Unauthorized` - Missing or invalid authentication token
- `403 Forbidden` - User lacks permission for the operation
- `404 Not Found` - Resource doesn't exist
- `500 Internal Server Error` - Server-side error (check logs)

**Common Error Messages**:

- `"Stock item not found"` - Invalid stockItemId
- `"Stock item does not belong to this tenant"` - Tenant mismatch
- `"Minimum threshold cannot be negative"` - Validation failure
- `"Quantity per sale must be positive"` - Invalid qtyPerSale
- `"Permission denied"` - Authorization failure

---

## Store Policy Configuration

The store policy controls automatic inventory deduction behavior:

### Default Policy

When a tenant first accesses the policy endpoint, a default policy is auto-created:

```json
{
  "inventorySubtractOnFinalize": true, // Enable auto-deduction
  "branchOverrides": {}, // No branch-specific rules
  "excludeMenuItemIds": [] // No excluded items
}
```

### Policy Evaluation Order

When a sale is finalized, the policy is checked in this order:

1. **Check Excluded Items**

   - If ANY menu item in sale is in `excludeMenuItemIds` → **Skip deduction**
   - Example: Service fees, gift cards, loyalty rewards

2. **Check Branch Override**

   - If branch has override in `branchOverrides[branchId]` → **Use override**
   - Example: Downtown branch uses manual inventory

3. **Use Tenant Default**
   - Otherwise → **Use `inventorySubtractOnFinalize`**

### Example Configurations

**Scenario 1: Most branches auto-deduct, one manual**

```json
{
  "inventorySubtractOnFinalize": true,
  "branchOverrides": {
    "branch-downtown-uuid": {
      "inventorySubtractOnFinalize": false // Manual inventory only
    }
  },
  "excludeMenuItemIds": []
}
```

**Scenario 2: Exclude non-inventory items**

```json
{
  "inventorySubtractOnFinalize": true,
  "branchOverrides": {},
  "excludeMenuItemIds": [
    "menu-service-fee-uuid",
    "menu-gift-wrap-uuid",
    "menu-loyalty-free-uuid"
  ]
}
```

**Scenario 3: All branches manual inventory**

```json
{
  "inventorySubtractOnFinalize": false,
  "branchOverrides": {},
  "excludeMenuItemIds": []
}
```

### Policy in Event Handlers

The event handler checks policy **before** deducting:

```typescript
// SaleFinalizedHandler.handle()
const policy = await getStorePolicyUseCase.executeWithDefault(tenantId);

if (!shouldDeductInventory(policy, branchId, menuItemIds)) {
  console.log("Policy blocks deduction");
  return; // Skip deduction
}

// Proceed with deduction...
```

Logs explain why deduction was skipped:

- `"Menu item {id} is excluded from inventory deduction"`
- `"Using branch override for {branchId}: false"`
- `"Policy blocks inventory deduction for sale {saleId}"`

---

## Event Publishing

The inventory module publishes domain events via the outbox pattern for reliable delivery:

**Published Events**:

- `inventory.stock_item_created` - New stock item created
- `inventory.stock_item_updated` - Stock item details changed
- `inventory.branch_stock_assigned` - Item assigned to branch
- `inventory.stock_received` - Stock received/delivered
- `inventory.stock_wasted` - Stock wasted/lost
- `inventory.stock_corrected` - Stock level adjusted
- `inventory.stock_sale_deducted` - Stock deducted for sale
- `inventory.stock_voided` - Sale voided, stock restored
- `inventory.stock_reopened` - Voided sale reopened, stock re-deducted
- `inventory.menu_stock_map_set` - Menu item linked to stock
- `inventory.store_policy_inventory_updated` - Policy settings changed

Other modules can subscribe to these events for cross-module workflows.

---

## Best Practices

### 1. Always Set Up Branch Stock First

Before recording transactions, assign stock items to branches:

```
1. Create stock item
2. Assign to branch with minThreshold
3. Now can receive/waste/correct
```

### 2. Use Meaningful Notes

For waste and corrections, always provide clear notes:

```json
// Good
{"note": "Expired batch #1234 - Best before 2025-01-10"}

// Bad
{"note": "waste"}
```

### 3. Configure Menu Stock Maps Before Sales

Set up recipes before enabling auto-deduction:

```
1. Create stock items (flour, cheese, sauce)
2. Create menu item (Pizza)
3. Map menu item to stock items with qtyPerSale
4. Enable auto-deduction policy
5. Sales will now deduct automatically
```

### 4. Use Store Policy Wisely

- Enable `inventorySubtractOnFinalize` for automatic inventory management
- Use `branchOverrides` for branches with different workflows
- Add service fees to `excludeMenuItemIds` to prevent unnecessary deductions

### 5. Monitor Exceptions Regularly

Check `/branch/alerts/exceptions` daily:

- Fix negative stock situations immediately
- Configure missing menu stock maps
- Prevent data integrity issues

### 6. Audit Journal Regularly

Use `/journal` endpoint to:

- Review large transactions
- Investigate discrepancies
- Generate audit reports

---

## Integration Guide

### Event-Driven Integration (Primary)

The inventory module subscribes to sales events for automatic inventory management:

**Event Subscriptions:**

```typescript
// Registered in server.ts at startup
eventBus.subscribe("sales.sale_finalized", saleFinalizedHandler);
eventBus.subscribe("sales.sale_voided", saleVoidedHandler);
eventBus.subscribe("sales.sale_reopened", saleReopenedHandler);
```

**Event Flow:**

1. **Sale Finalized:**

```typescript
// Sales module publishes event
await publishToOutbox({
  type: 'sales.sale_finalized',
  v: 1,
  tenantId, branchId, saleId,
  lines: [{ menuItemId, qty }],
  totals: { ... },
  finalizedAt: '...'
});

// Inventory handler automatically:
// 1. Checks store policy
// 2. Gets menu stock maps
// 3. Deducts inventory if policy allows
// 4. Logs reason if skipped
```

2. **Sale Voided:**

```typescript
// Sales module publishes event
await publishToOutbox({
  type: "sales.sale_voided",
  v: 1,
  tenantId,
  branchId,
  saleId,
  lines: [{ menuItemId, qty }],
  reason: "...",
});

// Inventory handler automatically:
// 1. Gets menu stock maps
// 2. Reverses original deductions
// 3. Restores inventory
```

3. **Sale Reopened:**

```typescript
// Sales module publishes event
await publishToOutbox({
  type: "sales.sale_reopened",
  v: 1,
  tenantId,
  branchId,
  originalSaleId,
  newSaleId,
  reason: "...",
});

// Inventory handler automatically:
// 1. Checks store policy
// 2. Re-deducts inventory with new sale ID
```

**Benefits:**

- ✅ Loose coupling (modules don't know about each other)
- ✅ Reliable delivery (outbox pattern with retries)
- ✅ Async processing (doesn't slow down sales)
- ✅ Event history (audit trail)
- ✅ Easy to add more subscribers (reporting, analytics)

---

### Direct Integration (Fallback)

For manual corrections or testing, call internal endpoints directly:

```typescript
// Manual deduction (admin correction)
async manuallyDeductInventory(saleId: string) {
  // Get sale details
  const sale = await getSale(saleId);

  // Get menu stock mappings
  const lines = await calculateStockDeductions(sale.items);

  // Manually trigger deduction
  await inventoryClient.post('/_internal/journal/sale', {
    refSaleId: saleId,
    lines: lines
  });
}

// Manual reversal (admin correction)
async manuallyRestoreInventory(saleId: string) {
  // Get original deductions
  const originalLines = await getOriginalDeductions(saleId);

  // Manually trigger reversal
  await inventoryClient.post('/_internal/journal/void', {
    refSaleId: saleId,
    originalLines: originalLines
  });
}
```

**When to use direct endpoints:**

- Admin dashboard manual corrections
- Testing/debugging inventory flows
- Data migration scripts
- Replaying failed deductions

**Do NOT use for:**

- Normal sale finalization (use events)
- Frontend applications (not exposed publicly)
- Real-time inventory updates (use events)---

## Glossary

**Stock Item**: A physical item that can be tracked in inventory (ingredients, supplies, products)

**Branch Stock**: Assignment of a stock item to a specific branch with a minimum threshold

**Inventory Journal**: Complete transaction history of all inventory movements

**Journal Entry**: Single record of inventory change (receive, waste, sale, etc.)

**On-Hand**: Current quantity of a stock item at a branch

**Menu Stock Map**: Recipe linking a menu item to its ingredient stock items

**Quantity Per Sale**: Amount of stock item consumed when menu item is sold

**Store Policy**: Tenant-level configuration for automatic inventory deduction

**Branch Override**: Branch-specific policy that overrides tenant default

**Exclude Menu Items**: List of menu items that never trigger automatic deduction

**Delta**: Change in quantity (positive = increase, negative = decrease)

**Balance After**: On-hand quantity after transaction is applied

**Reason**: Transaction type (RECEIVE, WASTE, CORRECT, SALE_DEDUCTION, etc.)

**Reference Sale ID**: Links journal entry to a specific sale transaction

**Low Stock Alert**: Warning when on-hand drops below minimum threshold

**Negative Stock**: Exception when on-hand quantity is below zero (oversold)

**Unmapped Sale**: Exception when sold menu item has no stock mappings configured

---

## Support

For questions, issues, or feature requests related to the Inventory module:

- Check the module README at `/src/modules/inventory/README.md`
- Review the architecture docs at `/context/inventory_*.md`
- Contact the development team

---

## Event Handlers

The inventory module includes event handlers that automatically process sales events:

### SaleFinalizedHandler

**Triggered By**: `sales.sale_finalized` event

**Process:**

1. Get store policy (creates default if missing)
2. Check if deduction allowed:
   - Skip if menu items excluded
   - Use branch override if configured
   - Otherwise use tenant default
3. Get menu stock maps for all items in sale
4. Calculate total stock deductions (qtyPerSale × quantity sold)
5. Record deductions via `RecordSaleDeductionsUseCase`
6. Publish `inventory.stock_sale_deducted` event

**Logging:**

- Info: Sale being processed, policy decisions, deductions recorded
- Warn: Missing stock mappings, no items to deduct
- Error: Policy check failed, deduction failed (triggers retry)

---

### SaleVoidedHandler

**Triggered By**: `sales.sale_voided` event

**Process:**

1. Get menu stock maps for all voided items
2. Calculate original deductions that need reversal
3. Record reversals via `RecordVoidUseCase`
4. Publish `inventory.stock_voided` event

**Logging:**

- Info: Void being processed, inventory restored
- Warn: Missing stock mappings, no items to restore
- Error: Reversal failed (triggers retry)

---

### SaleReopenedHandler

**Triggered By**: `sales.sale_reopened` event

**Process:**

1. Fetch original sale line items from database
2. Get store policy (creates default if missing)
3. Check if deduction allowed:
   - Skip if menu items excluded
   - Use branch override if configured
   - Otherwise use tenant default
4. Get menu stock maps for all items
5. Calculate deductions (qtyPerSale × quantity sold)
6. Re-deduct inventory via `RecordReopenUseCase` with new sale ID
7. Publish `inventory.stock_reopened` event

**Current Implementation:**

- Fetches sale data directly from `sales` table (cross-module database dependency)
- Works but creates coupling between modules

**Recommended Improvement:**

Update `SaleReopenedV1` event to include `lines: Array<{menuItemId, qty}>` field:

- Remove database dependency
- Follow event-driven principles
- Enable microservices architecture

See `app/event-handlers/README.md` for detailed migration guide.

---

**Last Updated**: December 1, 2025  
**API Version**: 1.0  
**Architecture**: Event-Driven with Outbox Pattern
