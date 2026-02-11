# Inventory Event Handlers

This directory contains event handlers that automatically process sales events for inventory management.

## Handlers

### 1. SaleFinalizedHandle
**Triggered by**: `sales.sale_finalized`

Automatically deducts inventory when a sale is finalized.

**Process:**

1. Gets store policy (creates default if missing)
2. Checks if deduction is allowed (policy evaluation)
3. Gets menu stock mappings for all items
4. Calculates deductions (qtyPerSale × quantity sold)
5. Records deductions via `RecordSaleDeductionsUseCase`
6. Publishes `inventory.stock_sale_deducted` event

**Policy Evaluation:**

- Skip if any menu items are in `excludeMenuItemIds`
- Use branch override if configured in `branchOverrides[branchId]`
- Otherwise use tenant default `inventorySubtractOnFinalize`

---

### 2. SaleVoidedHandler

**Triggered by**: `sales.sale_voided`

Automatically restores inventory when a sale is voided.

**Process:**

1. Gets menu stock mappings for voided items
2. Calculates original deductions to reverse
3. Records reversals via `RecordVoidUseCase`
4. Publishes `inventory.stock_voided` event

**Note:** No policy check needed - always reverse when voided.

---

### 3. SaleReopenedHandler

**Triggered by**: `sales.sale_reopened`

Automatically re-deducts inventory when a voided sale is reopened.

**Current Implementation:**

- Fetches original sale from database to get line items
- This creates a cross-module database dependency (not ideal)

**Process:**

1. Fetches original sale line items from `sales` table
2. Gets store policy
3. Checks if deduction is allowed (same as SaleFinalizedHandler)
4. Gets menu stock mappings
5. Records re-deductions via `RecordReopenUseCase` with new sale ID
6. Publishes `inventory.stock_reopened` event

---

## Improving SaleReopenedHandler

### Current Problem

The handler fetches data directly from the `sales` table:

```typescript
const result = await this.pool.query(`SELECT items FROM sales WHERE id = $1`, [
  saleId,
]);
```

**Issues:**

- ❌ Cross-module database coupling
- ❌ Violates bounded context principles
- ❌ Breaks if sales schema changes
- ❌ Can't work in microservices architecture

### Recommended Solution

Update the `SaleReopenedV1` event schema to include line items:

```typescript
// In src/shared/events.ts
export type SaleReopenedV1 = {
  type: "sales.sale_reopened";
  v: 1;
  tenantId: string;
  branchId: string;
  originalSaleId: string;
  newSaleId: string;
  lines: Array<{ menuItemId: string; qty: number }>; // ADD THIS
  actorId: string;
  reason: string;
  timestamp: string;
};
```

Then update sales module to include lines when publishing:

```typescript
// In sales.service.ts - reopenSale()
await publishToOutbox(
  {
    type: "sales.sale_reopened",
    v: 1,
    tenantId: originalSale.tenantId,
    branchId: originalSale.branchId,
    originalSaleId: originalSale.id,
    newSaleId: reopenedSale.id,
    lines: originalSale.items.map((item) => ({
      // ADD THIS
      menuItemId: item.menuItemId,
      qty: item.quantity,
    })),
    actorId: cmd.actorId,
    reason: cmd.reason,
    timestamp: new Date().toISOString(),
  },
  trx
);
```

Finally, remove database fetching from handler:

```typescript
// In sale-reopened.handler.ts
async handle(event: SaleReopenedV1): Promise<void> {
  const { tenantId, branchId, originalSaleId, newSaleId, lines } = event;

  // No need to fetch - lines are in the event!
  if (!lines || lines.length === 0) {
    console.warn('No line items in event');
    return;
  }

  // Continue with policy check and deduction...
}
```

**Benefits:**

- ✅ No cross-module coupling
- ✅ Works in microservices
- ✅ Event is self-contained
- ✅ Follows event-driven principles

---

## Event Registration

Handlers are registered in `server.ts`:

```typescript
eventBus.subscribe("sales.sale_finalized", saleFinalizedHandler.handle);
eventBus.subscribe("sales.sale_voided", saleVoidedHandler.handle);
eventBus.subscribe("sales.sale_reopened", saleReopenedHandler.handle);
```

Events are processed by the outbox dispatcher which:

1. Polls `platform_outbox` table every 1 second
2. Finds unprocessed events
3. Dispatches to registered handlers
4. Marks as processed on success
5. Retries on failure (with exponential backoff)

---

## Error Handling

All handlers throw errors to trigger retry:

```typescript
if (!result.ok) {
  console.error("Failed to process event:", result.error);
  throw new Error(result.error); // Triggers retry via outbox
}
```

**Retry Strategy:**

- Failed events remain in outbox
- Dispatcher retries with exponential backoff
- Maximum retries: configured in outbox dispatcher
- Dead letter queue: events that fail after max retries

---

## Logging

All handlers log at appropriate levels:

**INFO**: Normal operations

- `Processing sale {saleId} for tenant {tenantId}`
- `Successfully deducted inventory for sale {saleId}`
- `Policy blocks deduction for sale {saleId}`

**WARN**: Expected issues (not failures)

- `No stock mapping found for menu item {menuItemId}`
- `No stock items to deduct (no mappings found)`

**ERROR**: Failures that need investigation

- `Failed to get store policy: {error}`
- `Failed to deduct inventory: {error}`

---

## Testing Event Handlers

### Unit Tests

Mock dependencies and test logic:

```typescript
describe("SaleFinalizedHandler", () => {
  it("should skip deduction when policy blocks", async () => {
    const mockPolicy = {
      inventorySubtractOnFinalize: false,
      branchOverrides: {},
      excludeMenuItemIds: [],
    };

    // Mock use case to return blocking policy
    // Assert recordSaleDeductionsUseCase not called
  });

  it("should deduct when policy allows", async () => {
    // Mock use case to return allowing policy
    // Assert recordSaleDeductionsUseCase called with correct lines
  });
});
```

### Integration Tests

Publish events and verify database changes:

```typescript
describe("Inventory Event Integration", () => {
  it("should deduct inventory on sale finalized", async () => {
    // Publish sales.sale_finalized event
    await publishToOutbox({
      type: "sales.sale_finalized",
      // ... event data
    });

    // Wait for processing
    await waitForOutboxProcessing();

    // Assert inventory journal entries created
    // Assert on-hand quantities reduced
  });
});
```

---

## Migration Path (if updating event schema)

1. **Add lines to SaleReopenedV1** (backwards compatible):

   ```typescript
   lines?: Array<{ menuItemId: string; qty: number }>;  // Optional
   ```

2. **Update sales module** to include lines when publishing

3. **Update handler** to use lines from event first, fallback to database:

   ```typescript
   const lines = event.lines || (await this.fetchSaleLines(originalSaleId));
   ```

4. **Deploy and verify** both old and new events work

5. **Remove fallback** once all events include lines:

   ```typescript
   if (!event.lines) {
     throw new Error("Event missing required lines field");
   }
   ```

6. **Make lines required** in event schema

---

## Performance Considerations

**Batch Processing:**

- Handlers process events one at a time
- For high-volume scenarios, consider batching

**Deduplication:**

- Outbox ensures at-least-once delivery
- Handlers should be idempotent
- Check if journal entry already exists for sale ID

**Async Processing:**

- Inventory deduction happens asynchronously
- Sales finalization doesn't wait for inventory
- Eventual consistency (usually < 1 second)

---

## Troubleshooting

**Deduction not happening?**

1. Check store policy settings
2. Check menu stock mappings exist
3. Check outbox for failed events
4. Check handler logs for policy blocks

**Wrong quantities deducted?**

1. Verify menu stock map `qtyPerSale` values
2. Check sale quantities are correct
3. Review journal entries for calculation

**Events not processing?**

1. Verify outbox dispatcher is running
2. Check database connection
3. Review error logs
4. Check event schema matches handler expectations
