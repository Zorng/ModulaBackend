# Migration Guide: Improving SaleReopenedHandler

## Current Issue

The `SaleReopenedHandler` currently fetches data directly from the `sales` table to get line items:

```typescript
// Current implementation (NOT IDEAL)
const result = await this.pool.query(`SELECT items FROM sales WHERE id = $1`, [
  saleId,
]);
```

**Problems:**

- ❌ Cross-module database coupling
- ❌ Violates bounded context principles
- ❌ Breaks if sales module changes schema
- ❌ Won't work in microservices architecture
- ❌ Creates tight coupling between inventory and sales

## Recommended Solution

Include line items in the `SaleReopenedV1` event so inventory module doesn't need to query sales database.

## Step-by-Step Migration

### Step 1: Update Event Schema (Backwards Compatible)

Make `lines` optional first to support both old and new events:

```typescript
// File: src/shared/events.ts

export type SaleReopenedV1 = {
  type: "sales.sale_reopened";
  v: 1;
  tenantId: string;
  branchId: string;
  originalSaleId: string;
  newSaleId: string;
  lines?: Array<{ menuItemId: string; qty: number }>; // ADD THIS (optional)
  actorId: string;
  reason: string;
  timestamp: string;
};
```

### Step 2: Update Sales Module to Publish Lines

```typescript
// File: src/modules/sales/app/services/sales.service.ts
// In the reopenSale() method

async reopenSale(cmd: ReopenSaleCommand): Promise<Sale> {
  return await this.transactionManager.withTransaction(async (trx) => {
    const originalSale = await this.salesRepo.findById(cmd.saleId, trx);
    // ... existing validation logic ...

    const reopenedSale = reopenSale(originalSale, cmd.actorId, cmd.reason);

    // Save sales and audit logs (existing code)
    await this.salesRepo.save(originalSale, trx);
    await this.salesRepo.save(reopenedSale, trx);
    // ... existing audit log code ...

    // UPDATED: Include lines in event
    await publishToOutbox({
      type: 'sales.sale_reopened',
      v: 1,
      tenantId: originalSale.tenantId,
      branchId: originalSale.branchId,
      originalSaleId: originalSale.id,
      newSaleId: reopenedSale.id,
      lines: originalSale.items.map((item: SaleItem) => ({  // ADD THIS
        menuItemId: item.menuItemId,
        qty: item.quantity
      })),
      actorId: cmd.actorId,
      reason: cmd.reason,
      timestamp: new Date().toISOString()
    }, trx);

    return reopenedSale;
  });
}
```

### Step 3: Update Handler to Prefer Event Lines (Backwards Compatible)

```typescript
// File: src/modules/inventory/app/event-handlers/sale-reopened.handler.ts

async handle(event: SaleReopenedV1): Promise<void> {
  const { tenantId, branchId, originalSaleId, newSaleId } = event;

  console.log(
    `[SaleReopenedHandler] Processing reopen for original sale ${originalSaleId}, new sale ${newSaleId}`
  );

  // UPDATED: Prefer event lines, fallback to database
  let lines: Array<{ menuItemId: string; qty: number }>;

  if (event.lines && event.lines.length > 0) {
    // New events include lines - use them directly
    lines = event.lines;
    console.log(`[SaleReopenedHandler] Using ${lines.length} lines from event`);
  } else {
    // Old events don't have lines - fetch from database (temporary)
    console.warn('[SaleReopenedHandler] Event missing lines, fetching from database');
    const sale = await this.fetchSaleLines(originalSaleId);
    if (!sale || sale.lines.length === 0) {
      console.warn(`[SaleReopenedHandler] Could not get lines for sale ${originalSaleId}`);
      return;
    }
    lines = sale.lines;
  }

  // Rest of handler logic remains the same...
  const policyResult = await this.getStorePolicyUseCase.executeWithDefault(tenantId, "system");
  // ... etc
}
```

### Step 4: Deploy and Verify

1. **Deploy changes** - Both old and new events will work
2. **Monitor logs** - Verify new events use lines from event
3. **Check database** - Old events should still fetch from DB
4. **Wait for migration period** - Ensure all old events processed

### Step 5: Make Lines Required (After Migration Period)

Once all old events are processed:

```typescript
// Update event schema to make lines required
export type SaleReopenedV1 = {
  type: "sales.sale_reopened";
  v: 1;
  tenantId: string;
  branchId: string;
  originalSaleId: string;
  newSaleId: string;
  lines: Array<{ menuItemId: string; qty: number }>; // REQUIRED NOW
  actorId: string;
  reason: string;
  timestamp: string;
};
```

```typescript
// Remove database fallback from handler
async handle(event: SaleReopenedV1): Promise<void> {
  const { tenantId, branchId, originalSaleId, newSaleId, lines } = event;

  // UPDATED: No more fallback - lines are required
  if (!lines || lines.length === 0) {
    console.warn('[SaleReopenedHandler] Event has no line items, skipping');
    return;
  }

  console.log(`[SaleReopenedHandler] Processing ${lines.length} line items from event`);

  // Rest of handler logic...
}
```

### Step 6: Remove Database Query Method

```typescript
// Remove the fetchSaleLines() method entirely
// Remove Pool dependency from constructor
export class SaleReopenedHandler {
  constructor(
    private getStorePolicyUseCase: GetStorePolicyInventoryUseCase,
    private getMenuStockMapUseCase: GetMenuStockMapUseCase,
    private recordReopenUseCase: RecordReopenUseCase
  ) // pool removed
  {}

  // fetchSaleLines() method removed
}
```

Update bootstrap:

```typescript
// File: src/modules/inventory/index.ts

const saleReopenedHandler = new SaleReopenedHandler(
  getStorePolicyInventoryUseCase,
  getMenuStockMapUseCase,
  recordReopenUseCase
  // pool parameter removed
);
```

## Benefits After Migration

✅ **No cross-module coupling** - Inventory doesn't query sales database  
✅ **Event is self-contained** - All needed data in the event  
✅ **Microservices ready** - Modules can be deployed separately  
✅ **Clean architecture** - Proper bounded contexts  
✅ **Better testability** - No database mocking needed  
✅ **Audit trail** - Event contains complete snapshot

## Rollback Plan

If issues occur:

1. **Revert Step 5** - Make lines optional again
2. **Keep database fallback** - Handler works with both old/new events
3. **Fix sales module** - Ensure lines are included correctly
4. **Retry migration** - Once sales module is fixed

## Testing Strategy

### Unit Tests

```typescript
describe("SaleReopenedHandler", () => {
  it("should use lines from event when available", async () => {
    const event = {
      type: "sales.sale_reopened",
      lines: [{ menuItemId: "menu-1", qty: 2 }],
      // ... other fields
    };

    await handler.handle(event);

    // Assert pool.query NOT called
    // Assert recordReopenUseCase called with correct lines
  });

  it("should fallback to database when lines missing", async () => {
    const event = {
      type: "sales.sale_reopened",
      // lines NOT included
      // ... other fields
    };

    await handler.handle(event);

    // Assert pool.query WAS called
    // Assert recordReopenUseCase called with fetched lines
  });
});
```

### Integration Tests

```typescript
describe("Sale Reopen Integration", () => {
  it("should process new event format with lines", async () => {
    // Publish event with lines
    await publishToOutbox({
      type: "sales.sale_reopened",
      lines: [{ menuItemId: "menu-pizza", qty: 1 }],
      // ... other fields
    });

    await waitForEventProcessing();

    // Assert inventory journal entries created
    // Assert correct quantities deducted
  });
});
```

## Timeline

**Week 1:** Steps 1-3 (Backwards compatible changes)  
**Week 2:** Step 4 (Deploy and monitor)  
**Week 3:** Verify all old events processed  
**Week 4:** Steps 5-6 (Make required, remove fallback)

## Questions?

See:

- `app/event-handlers/README.md` - Event handler documentation
- `API_DOCUMENTATION.md` - Complete API reference
- Sales module documentation - Event publishing guide
