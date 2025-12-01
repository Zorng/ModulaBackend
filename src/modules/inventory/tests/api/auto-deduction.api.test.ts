import { describe, test, expect, beforeAll, afterAll } from "@jest/globals";
import {
  setupTestContext,
  cleanupTestContext,
  authRequest,
  TestContext,
} from "./test-helpers.js";

describe("Inventory Auto-Deduction API (Sales Integration)", () => {
  let ctx: TestContext;
  let stockItemId: string;
  let menuItemId: string;
  let categoryId: string;

  beforeAll(async () => {
    ctx = await setupTestContext();

    // Create stock item
    const stockResponse = await authRequest(ctx.app, ctx.token)
      .post("/v1/inventory/stock-items")
      .send({
        name: "Burger Patty",
        unitText: "pcs",
        defaultCostUsd: 2.5,
      });
    stockItemId = stockResponse.body.data.id;

    // Assign stock to branch with initial quantity
    await authRequest(ctx.app, ctx.token)
      .post("/v1/inventory/branch/stock-items")
      .send({
        stockItemId,
        minThreshold: 10,
      });

    // Add initial stock
    await authRequest(ctx.app, ctx.token)
      .post("/v1/inventory/journal/receive")
      .send({
        stockItemId,
        qty: 100,
        note: "Initial stock",
      });

    // Create test category
    categoryId = "11111111-2222-3333-4444-666666666666";
    await ctx.pool.query(
      `INSERT INTO menu_categories (id, tenant_id, name, created_by, created_at, updated_at)
       VALUES ($1, $2, $3, $4, NOW(), NOW())
       ON CONFLICT (id) DO NOTHING`,
      [categoryId, ctx.tenantId, "Test Category", ctx.userId]
    );

    // Create menu item
    menuItemId = "11111111-2222-3333-4444-555555555555";
    await ctx.pool.query(
      `INSERT INTO menu_items (id, tenant_id, category_id, name, price_usd, is_active, created_by, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
       ON CONFLICT (id) DO NOTHING`,
      [menuItemId, ctx.tenantId, categoryId, "Burger", 10.0, true, ctx.userId]
    );

    // Map menu item to stock item (1 burger = 2 patties)
    await authRequest(ctx.app, ctx.token)
      .post("/v1/inventory/menu-stock-map")
      .send({
        menuItemId,
        stockItemId,
        qtyPerSale: 2.0,
      });

    // Enable inventory auto-deduction in policy
    await authRequest(ctx.app, ctx.token).put("/v1/inventory/policy").send({
      inventorySubtractOnFinalize: true,
    });
  });

  afterAll(async () => {
    await ctx.pool.query(`DELETE FROM menu_items WHERE id = $1`, [menuItemId]);
    await ctx.pool.query(`DELETE FROM menu_categories WHERE id = $1`, [
      categoryId,
    ]);
    await cleanupTestContext(ctx);
  });

  describe("POST /_internal/journal/sale", () => {
    test("should automatically deduct inventory when sale is finalized", async () => {
      const saleId = "00000001-0001-0001-0001-000000000001";

      // Get initial on-hand quantity
      const beforeResponse = await authRequest(ctx.app, ctx.token).get(
        "/v1/inventory/journal/on-hand"
      );
      const beforeItem = beforeResponse.body.data.items.find(
        (i: any) => i.stockItemId === stockItemId
      );
      const initialQty = beforeItem?.onHand || 0;

      // Simulate sale finalized (internal endpoint)
      const response = await authRequest(ctx.app, ctx.token)
        .post("/v1/inventory/_internal/journal/sale")
        .send({
          refSaleId: saleId,
          lines: [
            {
              stockItemId,
              qtyDeducted: 4.0, // 2 burgers sold = 4 patties (2 patties per burger)
            },
          ],
        });

      expect(response.status).toBe(201);

      // Verify on-hand quantity decreased
      const afterResponse = await authRequest(ctx.app, ctx.token).get(
        "/v1/inventory/journal/on-hand"
      );
      const afterItem = afterResponse.body.data.items.find(
        (i: any) => i.stockItemId === stockItemId
      );
      const finalQty = afterItem?.onHand || 0;

      expect(finalQty).toBe(initialQty - 4);

      // Verify journal entry was created
      const journalResponse = await authRequest(ctx.app, ctx.token).get(
        `/v1/inventory/journal?stockItemId=${stockItemId}&reason=sale`
      );

      expect(journalResponse.status).toBe(200);
      const saleEntry = journalResponse.body.data.entries.find(
        (e: any) => e.refSaleId === saleId
      );
      expect(saleEntry).toBeDefined();
      expect(saleEntry.reason).toBe("sale");
      expect(saleEntry.delta).toBe(-4);
    });

    test("should handle multiple stock items in one sale", async () => {
      // Create second stock item (lettuce)
      const lettucResponse = await authRequest(ctx.app, ctx.token)
        .post("/v1/inventory/stock-items")
        .send({
          name: "Lettuce",
          unitText: "kg",
        });
      const lettuceId = lettucResponse.body.data.id;

      await authRequest(ctx.app, ctx.token)
        .post("/v1/inventory/branch/stock-items")
        .send({
          stockItemId: lettuceId,
          minThreshold: 5,
        });

      await authRequest(ctx.app, ctx.token)
        .post("/v1/inventory/journal/receive")
        .send({
          stockItemId: lettuceId,
          qty: 50,
        });

      // Map lettuce to burger (1 burger = 0.1kg lettuce)
      await authRequest(ctx.app, ctx.token)
        .post("/v1/inventory/menu-stock-map")
        .send({
          menuItemId,
          stockItemId: lettuceId,
          qtyPerSale: 0.1,
        });

      const saleId = "00000002-0002-0002-0002-000000000002";

      // Record sale with multiple deductions
      const response = await authRequest(ctx.app, ctx.token)
        .post("/v1/inventory/_internal/journal/sale")
        .send({
          refSaleId: saleId,
          lines: [
            { stockItemId, qtyDeducted: 2.0 }, // 1 burger = 2 patties
            { stockItemId: lettuceId, qtyDeducted: 0.1 }, // 1 burger = 0.1kg lettuce
          ],
        });

      expect(response.status).toBe(201);

      // Verify both items were deducted
      const journalResponse = await authRequest(ctx.app, ctx.token).get(
        `/v1/inventory/journal?reason=sale`
      );

      const saleEntries = journalResponse.body.data.entries.filter(
        (e: any) => e.refSaleId === saleId
      );
      expect(saleEntries.length).toBe(2);
    });

    test("should handle duplicate sale ID (idempotent)", async () => {
      const saleId = "00000003-0003-0003-0003-000000000003";

      // Record first time
      const firstResponse = await authRequest(ctx.app, ctx.token)
        .post("/v1/inventory/_internal/journal/sale")
        .send({
          refSaleId: saleId,
          lines: [{ stockItemId, qtyDeducted: 2.0 }],
        });

      expect(firstResponse.status).toBe(201);

      // Try to record again with same sale ID - should either succeed (idempotent) or fail
      const response = await authRequest(ctx.app, ctx.token)
        .post("/v1/inventory/_internal/journal/sale")
        .send({
          refSaleId: saleId,
          lines: [{ stockItemId, qtyDeducted: 2.0 }],
        });

      // Accept either 201 (idempotent) or 400+ (duplicate rejection)
      expect([201, 400, 409]).toContain(response.status);
    });
  });

  describe("POST /_internal/journal/void", () => {
    test("should restore inventory when sale is voided", async () => {
      const saleId = "00000004-0004-0004-0004-000000000004";

      // Get initial quantity
      const beforeResponse = await authRequest(ctx.app, ctx.token).get(
        "/v1/inventory/journal/on-hand"
      );
      const beforeItem = beforeResponse.body.data.items.find(
        (i: any) => i.stockItemId === stockItemId
      );
      const initialQty = beforeItem?.onHand || 0;

      // Record sale
      await authRequest(ctx.app, ctx.token)
        .post("/v1/inventory/_internal/journal/sale")
        .send({
          refSaleId: saleId,
          lines: [{ stockItemId, qtyDeducted: 6.0 }],
        });

      // Void the sale
      const voidResponse = await authRequest(ctx.app, ctx.token)
        .post("/v1/inventory/_internal/journal/void")
        .send({
          refSaleId: saleId,
          originalLines: [{ stockItemId, qtyOriginallyDeducted: 6.0 }],
        });

      expect(voidResponse.status).toBe(201);

      // Verify inventory was restored
      const afterResponse = await authRequest(ctx.app, ctx.token).get(
        "/v1/inventory/journal/on-hand"
      );
      const afterItem = afterResponse.body.data.items.find(
        (i: any) => i.stockItemId === stockItemId
      );
      const finalQty = afterItem?.onHand || 0;

      expect(finalQty).toBe(initialQty); // Should be back to initial

      // Verify void journal entries
      const journalResponse = await authRequest(ctx.app, ctx.token).get(
        `/v1/inventory/journal?stockItemId=${stockItemId}&reason=void`
      );

      const voidEntry = journalResponse.body.data.entries.find(
        (e: any) => e.refSaleId === saleId
      );
      expect(voidEntry).toBeDefined();
      expect(voidEntry.reason).toBe("void");
      expect(voidEntry.delta).toBe(6); // Positive (restoration)
    });
  });

  describe("POST /_internal/journal/reopen", () => {
    test("should re-deduct inventory when sale is reopened", async () => {
      const originalSaleId = "00000005-0005-0005-0005-000000000005";
      const newSaleId = "00000006-0006-0006-0006-000000000006";

      // Get initial quantity
      const beforeResponse = await authRequest(ctx.app, ctx.token).get(
        "/v1/inventory/journal/on-hand"
      );
      const beforeItem = beforeResponse.body.data.items.find(
        (i: any) => i.stockItemId === stockItemId
      );
      const initialQty = beforeItem?.onHand || 0;

      // Record original sale
      await authRequest(ctx.app, ctx.token)
        .post("/v1/inventory/_internal/journal/sale")
        .send({
          refSaleId: originalSaleId,
          lines: [{ stockItemId, qtyDeducted: 4.0 }],
        });

      // Void the sale
      await authRequest(ctx.app, ctx.token)
        .post("/v1/inventory/_internal/journal/void")
        .send({
          refSaleId: originalSaleId,
          originalLines: [{ stockItemId, qtyOriginallyDeducted: 4.0 }],
        });

      // Reopen the sale (creates new sale ID and re-deducts)
      const reopenResponse = await authRequest(ctx.app, ctx.token)
        .post("/v1/inventory/_internal/journal/reopen")
        .send({
          originalSaleId,
          newSaleId,
          lines: [{ stockItemId, qtyToRededuct: 4.0 }],
        });

      expect(reopenResponse.status).toBe(201);

      // Verify inventory was re-deducted
      const afterResponse = await authRequest(ctx.app, ctx.token).get(
        "/v1/inventory/journal/on-hand"
      );
      const afterItem = afterResponse.body.data.items.find(
        (i: any) => i.stockItemId === stockItemId
      );
      const finalQty = afterItem?.onHand || 0;

      expect(finalQty).toBe(initialQty - 4); // Back to deducted state

      // Verify reopen journal entry
      const journalResponse = await authRequest(ctx.app, ctx.token).get(
        `/v1/inventory/journal?stockItemId=${stockItemId}&reason=reopen`
      );

      const reopenEntry = journalResponse.body.data.entries.find(
        (e: any) => e.refSaleId === newSaleId
      );
      expect(reopenEntry).toBeDefined();
      expect(reopenEntry.reason).toBe("reopen");
      expect(reopenEntry.delta).toBe(-4); // Negative (deduction)
    });
  });

  describe("Store Policy Integration", () => {
    test("should respect policy when inventory auto-deduction is disabled", async () => {
      // Disable auto-deduction
      await authRequest(ctx.app, ctx.token).put("/v1/inventory/policy").send({
        inventorySubtractOnFinalize: false,
      });

      const policyResponse = await authRequest(ctx.app, ctx.token).get(
        "/v1/inventory/policy"
      );

      expect(policyResponse.status).toBe(200);
      expect(policyResponse.body.data.inventorySubtractOnFinalize).toBe(false);

      // Re-enable for other tests
      await authRequest(ctx.app, ctx.token).put("/v1/inventory/policy").send({
        inventorySubtractOnFinalize: true,
      });
    });

    test("should handle branch-specific overrides", async () => {
      const branchOverrides = {
        [ctx.branchId]: {
          inventorySubtractOnFinalize: false,
        },
      };

      const response = await authRequest(ctx.app, ctx.token)
        .put("/v1/inventory/policy")
        .send({
          inventorySubtractOnFinalize: true,
          branchOverrides,
        });

      expect(response.status).toBe(200);
      expect(response.body.data.branchOverrides[ctx.branchId]).toBeDefined();
      expect(
        response.body.data.branchOverrides[ctx.branchId]
          .inventorySubtractOnFinalize
      ).toBe(false);
    });

    test("should exclude specific menu items from deduction", async () => {
      const response = await authRequest(ctx.app, ctx.token)
        .put("/v1/inventory/policy")
        .send({
          inventorySubtractOnFinalize: true,
          excludeMenuItemIds: [menuItemId],
        });

      expect(response.status).toBe(200);
      expect(response.body.data.excludeMenuItemIds).toContain(menuItemId);

      // Clear exclusions
      await authRequest(ctx.app, ctx.token).put("/v1/inventory/policy").send({
        excludeMenuItemIds: [],
      });
    });
  });

  describe("Low Stock Alerts", () => {
    test("should trigger low stock alert when quantity drops below threshold", async () => {
      // Create new stock item with low threshold
      const lowStockResponse = await authRequest(ctx.app, ctx.token)
        .post("/v1/inventory/stock-items")
        .send({
          name: "Low Stock Item",
          unitText: "pcs",
        });
      const lowStockId = lowStockResponse.body.data.id;

      // Assign with threshold of 20
      await authRequest(ctx.app, ctx.token)
        .post("/v1/inventory/branch/stock-items")
        .send({
          stockItemId: lowStockId,
          minThreshold: 20,
        });

      // Add only 25 items
      await authRequest(ctx.app, ctx.token)
        .post("/v1/inventory/journal/receive")
        .send({
          stockItemId: lowStockId,
          qty: 25,
        });

      // Deduct 10 items (leaving 15, below threshold of 20)
      await authRequest(ctx.app, ctx.token)
        .post("/v1/inventory/_internal/journal/sale")
        .send({
          refSaleId: "10000000-0000-0000-0000-000000000001",
          lines: [{ stockItemId: lowStockId, qtyDeducted: 10 }],
        });

      // Check low stock alerts
      const alertResponse = await authRequest(ctx.app, ctx.token).get(
        "/v1/inventory/journal/alerts/low-stock"
      );

      expect(alertResponse.status).toBe(200);
      const lowStockAlert = alertResponse.body.data.items.find(
        (a: any) => a.stockItemId === lowStockId
      );
      expect(lowStockAlert).toBeDefined();
      expect(lowStockAlert.onHand).toBe(15);
      expect(lowStockAlert.minThreshold).toBe(20);
      // Items in the low stock alerts list are by definition low stock
      expect(lowStockAlert.onHand).toBeLessThanOrEqual(
        lowStockAlert.minThreshold
      );
    });
  });
});
