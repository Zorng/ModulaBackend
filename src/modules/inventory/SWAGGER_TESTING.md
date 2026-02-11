# Inventory Module - Swagger/OpenAPI Testing Guide

Complete guide for testing the Inventory Module API using Swagger UI.

**Base URL**: `/v1/inventory`  
**Swagger UI**: `http://localhost:3000/api-docs`  
**Authentication**: Bearer token required for all endpoints

---

## Table of Contents

1. [Quick Start](#quick-start)
2. [Complete Testing Flow](#complete-testing-flow)
3. [API Endpoint Reference](#api-endpoint-reference)
4. [Testing Scenarios](#testing-scenarios)
5. [Policy Integration Testing](#policy-integration-testing)
6. [Troubleshooting](#troubleshooting)

---

## Quick Start

### Step 1: Get Authentication Token

```http
POST /v1/auth/login
{
  "phone": "+1234567890",
  "password": "your-password"
}
```

**Copy the `access_token` from the response.**

### Step 2: Authorize in Swagger

1. Open Swagger UI: `http://localhost:3000/api-docs`
2. Click the **"Authorize"** button (🔒 icon at top-right)
3. Enter: `Bearer {your-access-token}`
4. Click **"Authorize"** then **"Close"**

### Step 3: Test Your First Endpoint

```http
GET /v1/inventory/stock-items
```

Click **"Try it out"** → **"Execute"**

---

## Complete Testing Flow

Follow this step-by-step flow to test the entire inventory system:

### Phase 1: Setup Stock Items

#### 1.1 Create a Stock Item (Ingredient)

```http
POST /v1/inventory/stock-items
```

**Request Body:**

```json
{
  "name": "Premium Flour",
  "unitText": "kg",
  "barcode": "FLOUR001",
  "pieceSize": 5.0,
  "isIngredient": true,
  "isSellable": false,
  "isActive": true
}
```

**Response:** ✅ 201 Created

```json
{
  "success": true,
  "data": {
    "id": "stock-item-uuid-1",
    "tenantId": "tenant-uuid",
    "name": "Premium Flour",
    "unitText": "kg",
    "barcode": "FLOUR001",
    "pieceSize": 5.0,
    "isIngredient": true,
    "isSellable": false,
    "isActive": true,
    "createdAt": "2024-12-03T10:00:00Z",
    "updatedAt": "2024-12-03T10:00:00Z"
  }
}
```

**💾 Save the `stock-item-uuid-1` for next steps!**

---

#### 1.2 Create More Stock Items

Create additional items for testing:

**Sugar (Ingredient):**

```json
{
  "name": "White Sugar",
  "unitText": "kg",
  "isIngredient": true,
  "isSellable": false,
  "isActive": true
}
```

**Bottled Water (Sellable):**

```json
{
  "name": "Bottled Water 500ml",
  "unitText": "pcs",
  "isIngredient": false,
  "isSellable": true,
  "isActive": true
}
```

---

#### 1.3 List All Stock Items

```http
GET /v1/inventory/stock-items
```

**Query Parameters (Optional):**

- `q=flour` - Search by name
- `isActive=true` - Filter by status
- `isIngredient=true` - Filter by type
- `page=1&pageSize=20` - Pagination

**Response:**

```json
{
  "success": true,
  "data": {
    "items": [
      {
        "id": "stock-item-uuid-1",
        "name": "Premium Flour",
        "unitText": "kg",
        "isIngredient": true,
        "isSellable": false,
        "isActive": true
      }
    ],
    "nextPage": null
  }
}
```

---

### Phase 2: Assign Stock to Branch

#### 2.1 Assign Stock Item to Branch

```http
POST /v1/inventory/branch/stock-items
```

**Request Body:**

```json
{
  "stockItemId": "stock-item-uuid-1",
  "minThreshold": 10
}
```

**What this does:**

- Makes the stock item trackable at your branch
- Sets low-stock alert threshold to 10 kg
- Allows receiving/wasting/correcting this item

**Response:** ✅ 201 Created

```json
{
  "success": true,
  "data": {
    "tenantId": "tenant-uuid",
    "branchId": "branch-uuid",
    "stockItemId": "stock-item-uuid-1",
    "minThreshold": 10,
    "createdAt": "2024-12-03T10:05:00Z",
    "updatedAt": "2024-12-03T10:05:00Z"
  }
}
```

---

#### 2.2 Get Branch Stock Items

```http
GET /v1/inventory/branch/stock-items
```

**Response:**

```json
{
  "success": true,
  "data": [
    {
      "stockItemId": "stock-item-uuid-1",
      "name": "Premium Flour",
      "unitText": "kg",
      "minThreshold": 10,
      "barcode": "FLOUR001",
      "isActive": true
    }
  ]
}
```

---

### Phase 3: Inventory Transactions

#### 3.1 Receive Stock (Incoming Delivery)

```http
POST /v1/inventory/journal/receive
```

**Request Body:**

```json
{
  "stockItemId": "stock-item-uuid-1",
  "qty": 50,
  "note": "Weekly delivery from supplier"
}
```

**Response:** ✅ 201 Created

```json
{
  "success": true,
  "data": {
    "id": "journal-uuid-1",
    "tenantId": "tenant-uuid",
    "branchId": "branch-uuid",
    "stockItemId": "stock-item-uuid-1",
    "reason": "receive",
    "delta": 50,
    "balanceAfter": 50,
    "note": "Weekly delivery from supplier",
    "refSaleId": null,
    "actorId": "employee-uuid",
    "occurredAt": "2024-12-03T10:10:00Z"
  }
}
```

**Key Fields:**

- `delta`: +50 (positive = increase)
- `balanceAfter`: 50 (total on-hand after transaction)
- `reason`: "receive" (type of transaction)

---

#### 3.2 Waste Stock (Spoilage, Breakage, Loss)

```http
POST /v1/inventory/journal/waste
```

**Request Body:**

```json
{
  "stockItemId": "stock-item-uuid-1",
  "qty": 5,
  "note": "Expired batch - Best before 2024-12-01"
}
```

**Important:**

- Enter quantity as **positive** (it will be stored as negative)
- **Note is required** for waste (must document reason)

**Response:**

```json
{
  "success": true,
  "data": {
    "id": "journal-uuid-2",
    "reason": "waste",
    "delta": -5,
    "balanceAfter": 45,
    "note": "Expired batch - Best before 2024-12-01"
  }
}
```

---

#### 3.3 Correct Stock (Physical Count Adjustment)

```http
POST /v1/inventory/journal/correct
```

**Request Body:**

```json
{
  "stockItemId": "stock-item-uuid-1",
  "delta": 3,
  "note": "Physical count found 3 extra bags"
}
```

**Key Differences:**

- `delta` can be **positive** or **negative**
- Positive delta = found extra stock
- Negative delta = found less stock than expected
- **Note is required** (must document reason for adjustment)

**Response:**

```json
{
  "success": true,
  "data": {
    "reason": "correction",
    "delta": 3,
    "balanceAfter": 48
  }
}
```

---

### Phase 4: Check Inventory Levels

#### 4.1 Get On-Hand Inventory

```http
GET /v1/inventory/journal/on-hand
```

**Optional Query:** `?stockItemId=stock-item-uuid-1` (filter to specific item)

**Response:**

```json
{
  "success": true,
  "data": {
    "branchId": "branch-uuid",
    "items": [
      {
        "stockItemId": "stock-item-uuid-1",
        "name": "Premium Flour",
        "unitText": "kg",
        "onHand": 48,
        "minThreshold": 10,
        "lowStock": false
      }
    ]
  }
}
```

**Key Fields:**

- `onHand`: 48 - Current quantity available
- `lowStock`: false - Not below threshold yet

---

#### 4.2 Get Inventory Journal (Transaction History)

```http
GET /v1/inventory/journal
```

**Query Parameters (Optional):**

- `stockItemId=uuid` - Filter by item
- `reason=waste` - Filter by transaction type (receive, waste, correction, sale, void, reopen)
- `fromDate=2024-12-01` - Start date filter
- `toDate=2024-12-31` - End date filter
- `page=1&pageSize=20` - Pagination

**Response:**

```json
{
  "success": true,
  "data": {
    "branchId": "branch-uuid",
    "items": [
      {
        "id": "journal-uuid-1",
        "stockItemId": "stock-item-uuid-1",
        "reason": "receive",
        "delta": 50,
        "balanceAfter": 50,
        "note": "Weekly delivery from supplier",
        "occurredAt": "2024-12-03T10:10:00Z"
      },
      {
        "id": "journal-uuid-2",
        "reason": "waste",
        "delta": -5,
        "balanceAfter": 45,
        "note": "Expired batch",
        "occurredAt": "2024-12-03T10:15:00Z"
      }
    ],
    "nextPage": null
  }
}
```

---

### Phase 5: Menu Stock Mapping (Recipes)

#### 5.1 Create Menu Stock Map

**Prerequisites:** You need a menu item ID from the Menu module.

```http
POST /v1/inventory/menu-stock-map
```

**Request Body:**

```json
{
  "menuItemId": "menu-pizza-uuid",
  "stockItemId": "stock-item-uuid-1",
  "qtyPerSale": 0.5
}
```

**What this means:**

- When 1 Pizza is sold: Deduct 0.5 kg of Flour
- Supports multiple ingredients per menu item

**Response:** ✅ 201 Created

```json
{
  "success": true,
  "data": {
    "id": "mapping-uuid-1",
    "tenantId": "tenant-uuid",
    "menuItemId": "menu-pizza-uuid",
    "stockItemId": "stock-item-uuid-1",
    "qtyPerSale": 0.5,
    "createdBy": "employee-uuid",
    "createdAt": "2024-12-03T10:20:00Z"
  }
}
```

---

#### 5.2 Create Multiple Mappings for Same Menu Item

Add more ingredients to the Pizza recipe:

**Cheese:**

```json
{
  "menuItemId": "menu-pizza-uuid",
  "stockItemId": "stock-cheese-uuid",
  "qtyPerSale": 0.3
}
```

**Tomato Sauce:**

```json
{
  "menuItemId": "menu-pizza-uuid",
  "stockItemId": "stock-sauce-uuid",
  "qtyPerSale": 0.2
}
```

---

#### 5.3 Get Menu Stock Map (View Recipe)

```http
GET /v1/inventory/menu-stock-map/{menuItemId}
```

**Path Parameter:** Replace `{menuItemId}` with actual UUID

**Response:**

```json
{
  "success": true,
  "data": [
    {
      "id": "mapping-uuid-1",
      "menuItemId": "menu-pizza-uuid",
      "stockItemId": "stock-item-uuid-1",
      "qtyPerSale": 0.5
    },
    {
      "id": "mapping-uuid-2",
      "menuItemId": "menu-pizza-uuid",
      "stockItemId": "stock-cheese-uuid",
      "qtyPerSale": 0.3
    }
  ]
}
```

---

#### 5.4 Get All Menu Stock Maps

```http
GET /v1/inventory/menu-stock-map
```

Returns all mappings for the tenant.

---

#### 5.5 Delete Menu Stock Map

```http
DELETE /v1/inventory/menu-stock-map/{id}
```

**Response:** ✅ 204 No Content

---

### Phase 6: Policy Configuration

#### 6.1 Get Store Policy (Inventory Auto-Deduct Settings)

```http
GET /v1/inventory/policy
```

**Response:**

```json
{
  "success": true,
  "data": {
    "tenantId": "tenant-uuid",
    "inventorySubtractOnFinalize": true,
    "branchOverrides": {},
    "excludeMenuItemIds": [],
    "updatedBy": "system",
    "updatedAt": "2024-12-03T10:00:00Z"
  }
}
```

**Key Fields:**

- `inventorySubtractOnFinalize`: true = Auto-deduct when sale finalized
- `branchOverrides`: Branch-specific rules
- `excludeMenuItemIds`: Items that never trigger deduction

---

#### 6.2 Update Store Policy (Simple - Enable/Disable)

```http
PUT /v1/inventory/policy
```

**Disable Auto-Deduct:**

```json
{
  "inventorySubtractOnFinalize": false,
  "branchOverrides": {},
  "excludeMenuItemIds": []
}
```

**Response:**

```json
{
  "success": true,
  "data": {
    "inventorySubtractOnFinalize": false,
    "updatedAt": "2024-12-03T10:30:00Z"
  }
}
```

---

#### 6.3 Update Policy (Advanced - Branch Overrides)

**Scenario:** Auto-deduct for all branches EXCEPT downtown

```json
{
  "inventorySubtractOnFinalize": true,
  "branchOverrides": {
    "branch-downtown-uuid": {
      "inventorySubtractOnFinalize": false
    }
  },
  "excludeMenuItemIds": []
}
```

**Result:**

- All branches: Auto-deduct enabled
- Downtown branch: Manual inventory only

---

#### 6.4 Update Policy (Advanced - Menu Exclusions)

**Scenario:** Auto-deduct for products, but NOT service fees or gift cards

```json
{
  "inventorySubtractOnFinalize": true,
  "branchOverrides": {},
  "excludeMenuItemIds": [
    "menu-service-fee-uuid",
    "menu-gift-card-uuid",
    "menu-delivery-fee-uuid"
  ]
}
```

**Result:**

- Sales with only products: Deduct inventory
- Sales containing excluded items: Skip deduction entirely

---

### Phase 7: Alerts and Exceptions

#### 7.1 Get Low Stock Alerts

```http
GET /v1/inventory/branch/alerts/low-stock
```

**Response:**

```json
{
  "success": true,
  "data": {
    "branchId": "branch-uuid",
    "items": [
      {
        "stockItemId": "stock-sugar-uuid",
        "name": "White Sugar",
        "unitText": "kg",
        "onHand": 8,
        "minThreshold": 10
      }
    ]
  }
}
```

**Shows items where:** `onHand < minThreshold`

---

#### 7.2 Get Inventory Exceptions

```http
GET /v1/inventory/branch/alerts/exceptions
```

**Response:**

```json
{
  "success": true,
  "data": {
    "branchId": "branch-uuid",
    "negativeStock": [
      {
        "type": "negative_stock",
        "stockItemId": "stock-milk-uuid",
        "name": "Milk",
        "unitText": "liter",
        "onHand": -2,
        "minThreshold": 5
      }
    ],
    "unmappedSales": [
      {
        "type": "unmapped_sale",
        "saleId": "sale-uuid",
        "menuItemId": "menu-new-item-uuid",
        "occurredAt": "2024-12-03T09:00:00Z"
      }
    ]
  }
}
```

**Exception Types:**

1. **Negative Stock** - Items with on-hand < 0 (oversold)
2. **Unmapped Sales** - Sales with menu items that have no stock mappings

---

## API Endpoint Reference

### Stock Items

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/v1/inventory/stock-items` | Create stock item |
| PUT | `/v1/inventory/stock-items/:id` | Update stock item |
| GET | `/v1/inventory/stock-items` | List stock items |

### Branch Stock

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/v1/inventory/branch/stock-items` | Assign item to branch |
| GET | `/v1/inventory/branch/stock-items` | Get branch items |

### Inventory Journal

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/v1/inventory/journal/receive` | Receive stock |
| POST | `/v1/inventory/journal/waste` | Waste stock |
| POST | `/v1/inventory/journal/correct` | Correct stock |
| GET | `/v1/inventory/journal` | Get transaction history |
| GET | `/v1/inventory/journal/on-hand` | Get current inventory |

### Menu Stock Map

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/v1/inventory/menu-stock-map` | Create/update mapping |
| GET | `/v1/inventory/menu-stock-map/:menuItemId` | Get mappings for menu item |
| GET | `/v1/inventory/menu-stock-map` | Get all mappings |
| DELETE | `/v1/inventory/menu-stock-map/:id` | Delete mapping |

### Store Policy

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/v1/inventory/policy` | Get policy settings |
| PUT | `/v1/inventory/policy` | Update policy settings |

### Alerts

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/v1/inventory/branch/alerts/low-stock` | Get low stock items |
| GET | `/v1/inventory/branch/alerts/exceptions` | Get inventory issues |

---

## Testing Scenarios

### Scenario 1: Complete Ingredient Setup

**Goal:** Set up flour as an ingredient for pizza

1. ✅ Create stock item (flour)
2. ✅ Assign to branch (threshold: 10 kg)
3. ✅ Receive initial stock (50 kg)
4. ✅ Create menu stock map (pizza → flour: 0.5 kg)
5. ✅ Verify on-hand (should show 50 kg)

---

### Scenario 2: Manual Inventory Operations

**Goal:** Track manual adjustments

1. ✅ Receive stock (100 units)
2. ✅ Waste some (10 units - damaged)
3. ✅ Do physical count
4. ✅ Correct discrepancy (+5 or -5)
5. ✅ Review journal entries

---

### Scenario 3: Low Stock Alerting

**Goal:** Test threshold alerts

1. ✅ Create item with threshold: 10
2. ✅ Receive: 15 units
3. ✅ Check alerts (should be empty)
4. ✅ Waste: 8 units (balance: 7)
5. ✅ Check alerts (should appear)

---

### Scenario 4: Recipe Management

**Goal:** Create a complex recipe

1. ✅ Create menu item (Burger)
2. ✅ Create stock items: Bun, Patty, Cheese, Lettuce
3. ✅ Map menu item to stock items:
    - Bun: 1 pcs
    - Patty: 1 pcs
    - Cheese: 2 slices
    - Lettuce: 0.05 kg
4. ✅ Get menu stock map (verify all mappings)

---

## Policy Integration Testing

### Test 1: Auto-Deduct Enabled (Default)

**Setup:**

```http
PUT /v1/inventory/policy
{
  "inventorySubtractOnFinalize": true,
  "branchOverrides": {},
  "excludeMenuItemIds": []
}
```

**Test:**

1. Create sale with Pizza (mapped to flour: 0.5 kg)
2. Finalize sale
3. Check journal: Should see `reason: "sale"` entry
4. Check on-hand: Should decrease by 0.5 kg

**Expected:** ✅ Inventory auto-deducted

---

### Test 2: Auto-Deduct Disabled

**Setup:**

```http
PUT /v1/inventory/policy
{
  "inventorySubtractOnFinalize": false
}
```

**Test:**

1. Create and finalize sale
2. Check journal: Should NOT see sale deduction
3. Check on-hand: Should NOT change

**Expected:** ✅ No automatic deduction

---

### Test 3: Branch Override

**Setup:**

```json
{
  "inventorySubtractOnFinalize": true,
  "branchOverrides": {
    "{your-branch-id}": {
      "inventorySubtractOnFinalize": false
    }
  }
}
```

**Test:**

1. Create sale at your branch
2. Finalize sale
3. Check journal: Should NOT deduct (override blocks it)

**Expected:** ✅ Branch override works

---

### Test 4: Menu Item Exclusion

**Setup:**

```json
{
  "inventorySubtractOnFinalize": true,
  "excludeMenuItemIds": ["menu-service-fee-uuid"]
}
```

**Test:**

1. Create sale with Pizza + Service Fee
2. Finalize sale
3. Check journal: Should NOT deduct (excluded item blocks entire sale)

**Expected:** ✅ Exclusion blocks deduction

---

## Troubleshooting

### Issue: 401 Unauthorized

**Solution:**

1. Check token is valid: `GET /v1/auth/me`
2. Re-authorize in Swagger with fresh token
3. Ensure token has `Bearer` prefix

---

### Issue: 404 Stock item not found

**Solution:**

1. Verify stock item was created: `GET /v1/inventory/stock-items`
2. Check you're using correct UUID
3. Ensure item belongs to your tenant

---

### Issue: Can't receive stock

**Error:** `Stock item not assigned to branch`

**Solution:**

1. Assign item to branch first: `POST /v1/inventory/branch/stock-items`
2. Then receive stock: `POST /v1/inventory/journal/receive`

---

### Issue: Inventory not auto-deducting

**Check:**

1. Policy enabled: `GET /v1/inventory/policy`
2. Menu stock map exists: `GET /v1/inventory/menu-stock-map/{menuItemId}`
3. Check branch override isn't blocking
4. Check menu item isn't excluded
5. Review server logs for event handler output

---

### Issue: Negative stock

**This is allowed** (system won't block sales even if out of stock)

**To fix:**

1. Check exceptions: `GET /v1/inventory/branch/alerts/exceptions`
2. Receive more stock: `POST /v1/inventory/journal/receive`
3. Or correct: `POST /v1/inventory/journal/correct`

---

## Quick Reference Card

```bash
# Authentication
POST /v1/auth/login > Get token > Authorize in Swagger

# Basic Flow
1. POST /v1/inventory/stock-items > Create item
2. POST /v1/inventory/branch/stock-items > Assign to branch
3. POST /v1/inventory/journal/receive > Add stock
4. GET /v1/inventory/journal/on-hand > Check balance

# Recipe Setup
1. POST /v1/inventory/menu-stock-map > Link menu item to ingredients
2. GET /v1/inventory/menu-stock-map/{menuItemId} > Verify mappings

# Policy Control
GET /v1/inventory/policy → Check current settings
PUT /v1/inventory/policy → Update settings

# Monitoring
GET /v1/inventory/branch/alerts/low-stock → Check low inventory
GET /v1/inventory/branch/alerts/exceptions → Check problems
GET /v1/inventory/journal → View transaction history
```

---

**Need More Help?**

- Full API documentation: [API_DOCUMENTATION.md](./API_DOCUMENTATION.md)
- Integration with Policy module: [Policy Module README](../policy/README.md)
- Event-driven deduction: Check event handler logs for `[SaleFinalizedHandler]`

---

**Last Updated:** December 2024  
**Swagger UI:** <http://localhost:3000/api-docs>  
**Module Version:** 1.0
