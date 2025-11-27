# Swagger API Testing Quick Reference - Sales Module

## Quick Start

1. **Start the server**:

   ```bash
   pnpm dev
   ```

2. **Open Swagger UI**:

   ```text
   http://localhost:3000/api-docs
   ```

3. **Authenticate First**:
   - Use Auth module to login and get access token
   - Click 🔓 **Authorize** button
   - Enter: `Bearer YOUR_ACCESS_TOKEN`
   - Click **Authorize**, then **Close**

---

## 🎯 Quick Test Flow (5 Minutes)

### Step 1: Create Draft Sale

**Endpoint**: `POST /v1/sales/drafts`

**Body**:

```json
{
  "clientUuid": "test-123e4567-e89b-12d3-a456-426614174000",
  "saleType": "dine_in",
  "fxRateUsed": 4100
}
```

**Copy from response**: `id` (this is your saleId)

---

### Step 2: Add Items to Cart

**Endpoint**: `POST /v1/sales/{saleId}/items`

**Body** (repeat 2-3 times with different items):

```json
{
  "menuItemId": "your-menu-item-uuid",
  "menuItemName": "Iced Latte",
  "unitPriceUsd": 3.50,
  "quantity": 2,
  "modifiers": []
}
```

---

### Step 3: Pre-Checkout

**Endpoint**: `POST /v1/sales/{saleId}/pre-checkout`

**Body**:

```json
{
  "tenderCurrency": "KHR",
  "paymentMethod": "cash",
  "cashReceived": 100000
}
```

**Check response for**:

- `totalUsdExact`
- `totalKhrRounded`
- `changeGivenKhr`
- `vatAmountUsd`

---

### Step 4: Finalize Sale

**Endpoint**: `POST /v1/sales/{saleId}/finalize`

**Body**:

```json
{
  "actorId": "your-employee-uuid-from-auth"
}
```

**✅ Sale is now finalized and immutable!**

---

### Step 5: Track Fulfillment

**Endpoint**: `PATCH /v1/sales/{saleId}/fulfillment`

**Body** (Mark as ready):

```json
{
  "status": "ready",
  "actorId": "your-employee-uuid"
}
```

**Body** (Mark as delivered):

```json
{
  "status": "delivered",
  "actorId": "your-employee-uuid"
}
```

---

## 📋 Common Test Scenarios

### Scenario 1: Complete Dine-In Order

1. Create draft → Get `saleId`
2. Add 3 different items
3. Pre-checkout with KHR cash
4. Finalize
5. Set to "ready"
6. Set to "delivered"

### Scenario 2: Take-Away Order

1. Create draft with `"saleType": "take_away"`
2. Add items
3. Pre-checkout with USD payment
4. Finalize
5. Set to "ready" (customer picks up)

### Scenario 3: Update Cart

1. Create draft
2. Add item with quantity 1
3. Update quantity to 3 using `PATCH /items/{itemId}/quantity`
4. Delete an item using `DELETE /items/{itemId}`
5. Add new items
6. Pre-checkout and finalize

### Scenario 4: Void Sale (Same-Day)

1. Finalize a sale
2. Immediately void it: `POST /v1/sales/{saleId}/void`

   ```json
   {
     "actorId": "your-employee-uuid",
     "reason": "Customer changed mind"
   }
   ```

### Scenario 5: Reopen & Correct

1. Finalize a sale
2. Reopen it: `POST /v1/sales/{saleId}/reopen`

   ```json
   {
     "actorId": "your-employee-uuid",
     "reason": "Wrong quantity entered"
   }
   ```

3. Edit items in the new draft
4. Finalize again

---

## 🔍 Query Endpoints

### Get Single Sale

**Endpoint**: `GET /v1/sales/{saleId}`

Shows complete sale details with all items, totals, and timestamps.

### Get Sales List

**Endpoint**: `GET /v1/sales`

**Query Parameters**:

- `status`: `draft`, `finalized`, `voided`, `reopened`
- `saleType`: `dine_in`, `take_away`, `delivery`
- `startDate`: `2025-11-22`
- `endDate`: `2025-11-22`
- `page`: `1`
- `limit`: `20`

### Get Today's Branch Sales

**Endpoint**: `GET /v1/sales/branch/today`

Returns all sales for your branch today with summary totals.

---

## 💡 Key Features to Test

### 1. Dual Currency Support

**Test both currencies**:

USD Payment:

```json
{
  "tenderCurrency": "USD",
  "paymentMethod": "cash",
  "cashReceived": 20.00
}
```

KHR Payment:

```json
{
  "tenderCurrency": "KHR",
  "paymentMethod": "cash",
  "cashReceived": 100000
}
```

**Observe**:

- USD: No rounding applied
- KHR: Automatic rounding to nearest 100 riel

### 2. VAT Calculation

Pre-checkout applies VAT to the post-discount subtotal:

- Check `vatEnabled` flag
- Check `vatRate` (e.g., 0.10 for 10%)
- Check `vatAmountUsd` and `vatAmountKhrExact`

### 3. KHR Rounding

Only applies when `tenderCurrency = "KHR"`:

- `totalKhrExact`: Precise total (e.g., 67,650)
- `totalKhrRounded`: Rounded (e.g., 67,700)
- `roundingDeltaKhr`: Difference (e.g., 50)

### 4. Change Calculation

When paying with cash:

- Provide `cashReceived` greater than total
- Response shows `changeGivenKhr` or `changeGivenUsd`
- Based on rounded total for KHR

### 5. Fulfillment States

Track order progress:

```text
finalized → in_prep → ready → delivered
                 ↓
            cancelled
```

### 6. Same-Day Void/Reopen

**Important**: Can only void or reopen sales finalized TODAY

- Test immediately after finalization ✅
- Test with older sale ❌ (should fail with 403)

---

## 🎨 Endpoint Categories

### 🌐 Draft Management

- `POST /v1/sales/drafts` - Create new draft
- `GET /v1/sales/drafts/{clientUuid}` - Get or create by client UUID

### 🛒 Cart Operations

- `POST /v1/sales/{saleId}/items` - Add item
- `PATCH /v1/sales/{saleId}/items/{itemId}/quantity` - Update quantity
- `DELETE /v1/sales/{saleId}/items/{itemId}` - Remove item

### 💳 Checkout

- `POST /v1/sales/{saleId}/pre-checkout` - Calculate totals, discounts, VAT
- `POST /v1/sales/{saleId}/finalize` - Complete sale

### 📦 Fulfillment

- `PATCH /v1/sales/{saleId}/fulfillment` - Update status

### ↩️ Corrections

- `POST /v1/sales/{saleId}/void` - Void sale (same-day)
- `POST /v1/sales/{saleId}/reopen` - Reopen for editing (same-day)

### 🔍 Queries

- `GET /v1/sales/{saleId}` - Get single sale
- `GET /v1/sales` - List sales with filters
- `GET /v1/sales/branch/today` - Today's branch sales

---

## ⚠️ Common Errors & Solutions

### "Cannot finalize sale with no items"

**Solution**: Add at least one item before finalizing

### "Sale can only be voided on the same day"

**Solution**: Void is restricted to sales finalized today (based on `finalized_at`)

### "Cannot modify finalized sale"

**Solution**: Use reopen flow to create editable draft

### "Cash received must be >= total"

**Solution**: Increase `cashReceived` amount

### "Invalid quantity"

**Solution**: Quantity must be > 0 (or use DELETE endpoint to remove)

---

## 🧪 Advanced Testing

### Test Offline Sync

Use consistent `clientUuid`:

```bash
1. GET /v1/sales/drafts/{clientUuid}  # Creates if not exists
2. Add items
3. Sync again with same UUID  # Returns existing draft
```

### Test Discount Policies

If you have discount policies configured:

1. Add items that match policy criteria
2. Pre-checkout automatically applies best discount
3. Check `appliedPolicyIds` in response

### Test Inventory Integration

1. Finalize sale → Check inventory levels decrease
2. Void sale → Check inventory levels increase back

### Test Audit Trail

After void/reopen:

1. Query `sales_audit_log` table
2. Check `action`, `reason`, `old_values`, `new_values`
3. Verify `actor_id` is logged

---

## 📊 Response Structure

### Draft Sale Response

```json
{
  "id": "uuid",
  "state": "draft",
  "items": [...],
  "subtotalUsdExact": 15.00,
  "totalUsdExact": 15.00
}
```

### Finalized Sale Response

```json
{
  "id": "uuid",
  "state": "finalized",
  "finalizedAt": "2025-11-22T10:30:00Z",
  "subtotalUsdExact": 15.00,
  "vatAmountUsd": 1.50,
  "totalUsdExact": 16.50,
  "totalKhrRounded": 67700,
  "fulfillmentStatus": "in_prep"
}
```

---

## 🚀 Performance Tips

- Reuse `clientUuid` for offline sync
- Batch item additions when possible
- Pre-checkout before finalize (validates everything)
- Use pagination for large lists

---

## 📚 Related Documentation

- **Complete API Docs**: See `README_COMPLETE.md`
- **Postman Guide**: See `POSTMAN_TESTING.md`
- **Database Schema**: See `README_COMPLETE.md` (Database Schema section)

---
