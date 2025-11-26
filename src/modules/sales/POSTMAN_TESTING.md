# Postman Testing Guide - Sales Module

## Prerequisites

1. **Start the server**: `pnpm run dev`
2. **Server URL**: `http://localhost:3000`
3. **Ensure migrations are run**: `pnpm run migrate`
4. **Get auth token**: Complete auth flow first (see `/POSTMAN_TESTING.md`)

---

## Test Setup

### Required Auth Token

You need to authenticate first using the Auth module:

```http
POST http://localhost:3000/v1/auth/login
Content-Type: application/json

{
  "phone": "+1234567890",
  "password": "Test123!"
}
```

**Save the `access_token` from the response** - you'll need it for all sales endpoints.

### Sample Menu Items (for testing)

You'll need menu item IDs from your menu module. Example IDs:
- Coffee: `menu-item-uuid-1`
- Sandwich: `menu-item-uuid-2`
- Salad: `menu-item-uuid-3`

---

## 🛒 Complete Sales Flow Test Cases

### 1. Create Draft Sale

**POST** `http://localhost:3000/v1/sales/drafts`

**Headers:**
```http
Content-Type: application/json
Authorization: Bearer YOUR_ACCESS_TOKEN
```

**Body:**
```json
{
  "clientUuid": "test-client-123e4567-e89b-12d3-a456-426614174000",
  "saleType": "dine_in",
  "fxRateUsed": 4100
}
```

**Expected Response (201 Created):**
```json
{
  "id": "sale-uuid-here",
  "clientUuid": "test-client-123e4567-e89b-12d3-a456-426614174000",
  "state": "draft",
  "saleType": "dine_in",
  "fxRateUsed": 4100,
  "items": [],
  "subtotalUsdExact": 0,
  "totalUsdExact": 0,
  "totalKhrExact": 0
}
```

**💡 Save the `id` as `{{saleId}}` for next requests**

---

### 2. Add Items to Cart

**POST** `http://localhost:3000/v1/sales/{{saleId}}/items`

**Headers:**
```http
Content-Type: application/json
Authorization: Bearer YOUR_ACCESS_TOKEN
```

**Body (Add Coffee):**
```json
{
  "menuItemId": "menu-item-coffee-uuid",
  "menuItemName": "Iced Latte",
  "unitPriceUsd": 3.50,
  "quantity": 2,
  "modifiers": [
    {
      "name": "Extra Shot",
      "priceUsd": 0.50
    }
  ]
}
```

**Expected Response (200 OK):**
```json
{
  "item": {
    "id": "item-uuid-here",
    "menuItemId": "menu-item-coffee-uuid",
    "menuItemName": "Iced Latte",
    "unitPriceUsd": 3.50,
    "quantity": 2,
    "lineTotalUsdExact": 7.00,
    "lineTotalKhrExact": 28700,
    "modifiers": [...]
  },
  "sale": {
    "id": "sale-uuid",
    "items": [...],
    "subtotalUsdExact": 7.00,
    "totalUsdExact": 7.00,
    "totalKhrExact": 28700
  }
}
```

**Add More Items:**

```json
{
  "menuItemId": "menu-item-sandwich-uuid",
  "menuItemName": "Club Sandwich",
  "unitPriceUsd": 8.00,
  "quantity": 1,
  "modifiers": []
}
```

---

### 3. Update Item Quantity

**PATCH** `http://localhost:3000/v1/sales/{{saleId}}/items/{{itemId}}/quantity`

**Headers:**
```http
Content-Type: application/json
Authorization: Bearer YOUR_ACCESS_TOKEN
```

**Body:**
```json
{
  "quantity": 3
}
```

**Set to 0 to remove:**
```json
{
  "quantity": 0
}
```

---

### 4. Delete Item from Cart

**DELETE** `http://localhost:3000/v1/sales/{{saleId}}/items/{{itemId}}`

**Headers:**
```http
Authorization: Bearer YOUR_ACCESS_TOKEN
```

**Expected Response (200 OK):**
```json
{
  "message": "Item removed successfully",
  "sale": {
    "id": "sale-uuid",
    "items": [...],
    "subtotalUsdExact": 15.00
  }
}
```

---

### 5. Pre-Checkout (Apply Discounts, VAT, Rounding)

**POST** `http://localhost:3000/v1/sales/{{saleId}}/pre-checkout`

**Headers:**
```http
Content-Type: application/json
Authorization: Bearer YOUR_ACCESS_TOKEN
```

**Body (KHR Cash Payment):**
```json
{
  "tenderCurrency": "KHR",
  "paymentMethod": "cash",
  "cashReceived": 100000
}
```

**Body (USD Payment):**
```json
{
  "tenderCurrency": "USD",
  "paymentMethod": "cash",
  "cashReceived": 20.00
}
```

**Body (QR Payment - No Cash):**
```json
{
  "tenderCurrency": "KHR",
  "paymentMethod": "qr"
}
```

**Expected Response (200 OK):**
```json
{
  "sale": {
    "id": "sale-uuid",
    "state": "draft",
    "subtotalUsdExact": 15.00,
    "vatEnabled": true,
    "vatRate": 0.10,
    "vatAmountUsd": 1.50,
    "vatAmountKhrExact": 6150,
    "totalUsdExact": 16.50,
    "totalKhrExact": 67650,
    "tenderCurrency": "KHR",
    "khrRoundingApplied": true,
    "totalKhrRounded": 67700,
    "roundingDeltaKhr": 50,
    "paymentMethod": "cash",
    "cashReceivedKhr": 100000,
    "changeGivenKhr": 32300
  },
  "validation": {
    "canFinalize": true,
    "missingFields": []
  }
}
```

---

### 6. Finalize Sale

**POST** `http://localhost:3000/v1/sales/{{saleId}}/finalize`

**Headers:**
```http
Content-Type: application/json
Authorization: Bearer YOUR_ACCESS_TOKEN
```

**Body:**
```json
{
  "actorId": "employee-uuid-from-auth"
}
```

**Expected Response (200 OK):**
```json
{
  "sale": {
    "id": "sale-uuid",
    "state": "finalized",
    "finalizedAt": "2025-11-22T10:30:00Z",
    "fulfillmentStatus": "in_prep",
    "subtotalUsdExact": 15.00,
    "totalUsdExact": 16.50,
    "totalKhrExact": 67650,
    "totalKhrRounded": 67700,
    "cashReceivedKhr": 100000,
    "changeGivenKhr": 32300
  },
  "message": "Sale finalized successfully"
}
```

**💡 This triggers:**
- Inventory deduction event
- Audit log entry
- Sale becomes immutable (except fulfillment status)

---

## 📦 Fulfillment Tracking

### 7. Update Fulfillment Status

**PATCH** `http://localhost:3000/v1/sales/{{saleId}}/fulfillment`

**Headers:**
```http
Content-Type: application/json
Authorization: Bearer YOUR_ACCESS_TOKEN
```

**Set to "Ready":**
```json
{
  "status": "ready",
  "actorId": "employee-uuid"
}
```

**Set to "Delivered":**
```json
{
  "status": "delivered",
  "actorId": "employee-uuid"
}
```

**Cancel Order:**
```json
{
  "status": "cancelled",
  "actorId": "employee-uuid"
}
```

**Expected Response (200 OK):**
```json
{
  "sale": {
    "id": "sale-uuid",
    "fulfillmentStatus": "ready",
    "readyAt": "2025-11-22T10:45:00Z"
  }
}
```

---

## ↩️ Corrections & Void

### 8. Void Sale (Same-Day Only)

**POST** `http://localhost:3000/v1/sales/{{saleId}}/void`

**Headers:**
```http
Content-Type: application/json
Authorization: Bearer YOUR_ACCESS_TOKEN
```

**Body:**
```json
{
  "actorId": "employee-uuid",
  "reason": "Customer request - wrong order"
}
```

**Expected Response (200 OK):**
```json
{
  "sale": {
    "id": "sale-uuid",
    "state": "voided",
    "fulfillmentStatus": "cancelled",
    "voidedAt": "2025-11-22T11:00:00Z"
  },
  "message": "Sale voided successfully"
}
```

**⚠️ Requirements:**
- Sale must be finalized TODAY (based on `finalized_at`)
- Reason is required
- Triggers inventory reversal event

**Error Response (403 Forbidden - Not Same Day):**
```json
{
  "error": "Sale can only be voided on the same day it was finalized"
}
```

---

### 9. Reopen Sale (Same-Day Only)

**POST** `http://localhost:3000/v1/sales/{{saleId}}/reopen`

**Headers:**
```http
Content-Type: application/json
Authorization: Bearer YOUR_ACCESS_TOKEN
```

**Body:**
```json
{
  "actorId": "employee-uuid",
  "reason": "Need to correct item quantity"
}
```

**Expected Response (200 OK):**
```json
{
  "originalSale": {
    "id": "original-sale-uuid",
    "state": "reopened"
  },
  "newDraft": {
    "id": "new-draft-uuid",
    "state": "draft",
    "refPreviousSaleId": "original-sale-uuid",
    "items": [...],
    "subtotalUsdExact": 15.00
  },
  "message": "Sale reopened. Make corrections to the new draft."
}
```

**💡 What happens:**
- Original sale marked as "reopened" (immutable)
- New draft created with all items copied
- `refPreviousSaleId` links to original
- You can now edit the new draft and re-finalize

---

## 🔍 Queries & Reports

### 10. Get Single Sale

**GET** `http://localhost:3000/v1/sales/{{saleId}}`

**Headers:**
```http
Authorization: Bearer YOUR_ACCESS_TOKEN
```

**Expected Response (200 OK):**
```json
{
  "id": "sale-uuid",
  "clientUuid": "...",
  "state": "finalized",
  "saleType": "dine_in",
  "items": [
    {
      "id": "item-uuid",
      "menuItemName": "Iced Latte",
      "quantity": 2,
      "unitPriceUsd": 3.50,
      "lineTotalUsdExact": 7.00
    }
  ],
  "subtotalUsdExact": 15.00,
  "vatAmountUsd": 1.50,
  "totalUsdExact": 16.50,
  "totalKhrRounded": 67700,
  "finalizedAt": "2025-11-22T10:30:00Z",
  "fulfillmentStatus": "delivered"
}
```

---

### 11. Get Sales List (Paginated)

**GET** `http://localhost:3000/v1/sales?status=finalized&saleType=dine_in&page=1&limit=20`

**Query Parameters:**
- `status`: `draft` | `finalized` | `voided` | `reopened`
- `saleType`: `dine_in` | `take_away` | `delivery`
- `startDate`: ISO date (e.g., `2025-11-22`)
- `endDate`: ISO date
- `page`: Page number (default: 1)
- `limit`: Results per page (default: 20)

**Headers:**
```http
Authorization: Bearer YOUR_ACCESS_TOKEN
```

**Expected Response (200 OK):**
```json
{
  "data": [
    {
      "id": "sale-uuid-1",
      "state": "finalized",
      "saleType": "dine_in",
      "totalUsdExact": 16.50,
      "finalizedAt": "2025-11-22T10:30:00Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 45,
    "totalPages": 3
  }
}
```

---

### 12. Get Today's Sales for Branch

**GET** `http://localhost:3000/v1/sales/branch/today`

**Headers:**
```http
Authorization: Bearer YOUR_ACCESS_TOKEN
```

**Expected Response (200 OK):**
```json
{
  "date": "2025-11-22",
  "branchId": "branch-uuid",
  "sales": [
    {
      "id": "sale-uuid-1",
      "state": "finalized",
      "totalUsdExact": 16.50,
      "finalizedAt": "2025-11-22T08:30:00Z"
    },
    {
      "id": "sale-uuid-2",
      "state": "finalized",
      "totalUsdExact": 25.00,
      "finalizedAt": "2025-11-22T09:15:00Z"
    }
  ],
  "summary": {
    "totalSales": 2,
    "totalRevenueUsd": 41.50,
    "totalRevenueKhr": 170150
  }
}
```

---

## 📊 Advanced Test Scenarios

### Scenario 1: Complete Dine-In Order Flow

1. **Create draft** → Get sale ID
2. **Add 3 items** → Verify totals
3. **Update quantity** of 1 item → Verify recalculation
4. **Pre-checkout** with KHR cash → Verify VAT & rounding
5. **Finalize** → Check state change
6. **Update to "ready"** → Track fulfillment
7. **Update to "delivered"** → Complete order

### Scenario 2: Void & Correction Flow

1. **Finalize a sale** with wrong items
2. **Immediately void** with reason
3. **Verify inventory reversal**
4. **Create new sale** with correct items

### Scenario 3: Reopen & Edit Flow

1. **Finalize a sale**
2. **Reopen same day** with reason
3. **Edit items** in new draft
4. **Finalize again**
5. **Verify both sales** in history

### Scenario 4: Discount Application

1. **Create sale** with eligible items
2. **Add items** that match discount policies
3. **Pre-checkout** → Verify auto-applied discounts
4. **Check `appliedPolicyIds`** in response

### Scenario 5: Dual Currency Testing

1. **Create sale** with FX rate 4100
2. **Add items** totaling $15
3. **Pre-checkout USD** → No rounding
4. **Create another sale**
5. **Pre-checkout KHR** → Verify rounding to nearest 100

---

## 🔐 Permission Testing

### Manager/Admin Actions

✅ Can create drafts
✅ Can finalize sales
✅ Can void sales
✅ Can reopen sales
✅ Can view all branch sales

### Cashier Actions

✅ Can create drafts
✅ Can finalize sales
✅ Can update fulfillment
❌ Cannot void sales (Manager/Admin only)
❌ Cannot reopen sales (Manager/Admin only)

---

## ⚠️ Error Cases to Test

### 1. Finalize Without Items
```json
{
  "error": "Cannot finalize sale with no items"
}
```

### 2. Void Sale from Yesterday
```json
{
  "error": "Sale can only be voided on the same day it was finalized"
}
```

### 3. Edit Finalized Sale
```json
{
  "error": "Cannot modify finalized sale"
}
```

### 4. Invalid Quantity
```json
{
  "error": "Quantity must be greater than 0"
}
```

### 5. Insufficient Cash Received
```json
{
  "error": "Cash received must be greater than or equal to total"
}
```

---

## 🧪 Integration with Other Modules

### Inventory Module
- Sale finalization triggers `inventory.deduct` event
- Void triggers `inventory.restock` event
- Check inventory levels before/after sales

### Policy Module
- Discounts auto-applied based on policies
- Test active vs inactive policies
- Test item-level vs order-level discounts

### Reporting Module
- Daily sales summaries
- Branch performance
- VAT reports
- Payment method breakdown

---

## 📝 Notes

- **Same-Day Logic**: Based on `finalized_at`, not `created_at`
- **FX Rate**: Snapshotted per sale, doesn't change if tenant rate updates
- **VAT**: Applied to post-discount subtotal
- **Rounding**: Only for KHR tender, not USD
- **Immutability**: Finalized sales can't be edited (only voided/reopened)

---

## 🚀 Quick Test Collection

Use this order for complete flow testing:

```bash
1. POST /v1/sales/drafts
2. POST /v1/sales/{saleId}/items (3x different items)
3. PATCH /v1/sales/{saleId}/items/{itemId}/quantity
4. POST /v1/sales/{saleId}/pre-checkout
5. POST /v1/sales/{saleId}/finalize
6. PATCH /v1/sales/{saleId}/fulfillment (ready)
7. PATCH /v1/sales/{saleId}/fulfillment (delivered)
8. GET /v1/sales/{saleId}
9. GET /v1/sales/branch/today
```

---

**Happy Testing! 🎉**
