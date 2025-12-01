import { describe, test, expect, beforeAll, afterAll } from "@jest/globals";
import {
  setupTestContext,
  cleanupTestContext,
  authRequest,
  TestContext,
} from "./test-helpers.js";

describe("Menu Stock Map API", () => {
  let ctx: TestContext;
  let stockItemId: string;
  let menuItemId: string;
  let categoryId: string;

  beforeAll(async () => {
    ctx = await setupTestContext();

    // Create test stock item
    const itemResponse = await authRequest(ctx.app, ctx.token)
      .post("/v1/inventory/stock-items")
      .send({
        name: "Menu Map Test Item",
        unitText: "kg",
      });
    stockItemId = itemResponse.body.data.id;

    // Create test category first
    categoryId = "00000000-1111-2222-3333-555555555555";
    await ctx.pool.query(
      `INSERT INTO menu_categories (id, tenant_id, name, created_by, created_at, updated_at)
       VALUES ($1, $2, $3, $4, NOW(), NOW())
       ON CONFLICT (id) DO NOTHING`,
      [categoryId, ctx.tenantId, "Test Category", ctx.userId]
    );

    // Create test menu item
    menuItemId = "00000000-1111-2222-3333-444444444444";
    await ctx.pool.query(
      `INSERT INTO menu_items (id, tenant_id, category_id, name, price_usd, created_by, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
       ON CONFLICT (id) DO NOTHING`,
      [menuItemId, ctx.tenantId, categoryId, "Test Burger", 10.0, ctx.userId]
    );
  });

  afterAll(async () => {
    // Clean up menu item and category
    await ctx.pool.query(`DELETE FROM menu_items WHERE id = $1`, [menuItemId]);
    await ctx.pool.query(`DELETE FROM menu_categories WHERE id = $1`, [
      categoryId,
    ]);
    await cleanupTestContext(ctx);
  });

  describe("POST /v1/inventory/menu-stock-map", () => {
    test("should create menu stock mapping", async () => {
      const response = await authRequest(ctx.app, ctx.token)
        .post("/v1/inventory/menu-stock-map")
        .send({
          menuItemId,
          stockItemId,
          qtyPerSale: 0.25,
        });

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data.menuItemId).toBe(menuItemId);
      expect(response.body.data.stockItemId).toBe(stockItemId);
      expect(response.body.data.qtyPerSale).toBe(0.25);
    });

    test("should update existing mapping (upsert)", async () => {
      // Create first
      await authRequest(ctx.app, ctx.token)
        .post("/v1/inventory/menu-stock-map")
        .send({
          menuItemId,
          stockItemId,
          qtyPerSale: 0.5,
        });

      // Update
      const response = await authRequest(ctx.app, ctx.token)
        .post("/v1/inventory/menu-stock-map")
        .send({
          menuItemId,
          stockItemId,
          qtyPerSale: 0.75,
        });

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data.qtyPerSale).toBe(0.75);
    });

    test("should fail with zero quantity", async () => {
      const response = await authRequest(ctx.app, ctx.token)
        .post("/v1/inventory/menu-stock-map")
        .send({
          menuItemId,
          stockItemId,
          qtyPerSale: 0,
        });

      expect(response.status).toBe(400);
    });

    test("should fail with negative quantity", async () => {
      const response = await authRequest(ctx.app, ctx.token)
        .post("/v1/inventory/menu-stock-map")
        .send({
          menuItemId,
          stockItemId,
          qtyPerSale: -0.5,
        });

      expect(response.status).toBe(400);
    });
  });

  describe("GET /v1/inventory/menu-stock-map/:menuItemId", () => {
    test("should get mappings for menu item", async () => {
      // Create mapping
      await authRequest(ctx.app, ctx.token)
        .post("/v1/inventory/menu-stock-map")
        .send({
          menuItemId,
          stockItemId,
          qtyPerSale: 0.3,
        });

      const response = await authRequest(ctx.app, ctx.token).get(
        `/v1/inventory/menu-stock-map/${menuItemId}`
      );

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(Array.isArray(response.body.data)).toBe(true);
      expect(response.body.data.length).toBeGreaterThan(0);

      const mapping = response.body.data.find(
        (m: any) => m.stockItemId === stockItemId
      );
      expect(mapping).toBeDefined();
      expect(mapping.qtyPerSale).toBe(0.3);
    });

    test("should return empty array for unmapped menu item", async () => {
      const fakeMenuId = "99999999-0000-0000-0000-000000000000";
      const response = await authRequest(ctx.app, ctx.token).get(
        `/v1/inventory/menu-stock-map/${fakeMenuId}`
      );

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toEqual([]);
    });
  });

  describe("GET /v1/inventory/menu-stock-map", () => {
    test("should get all mappings", async () => {
      // Create mapping
      await authRequest(ctx.app, ctx.token)
        .post("/v1/inventory/menu-stock-map")
        .send({
          menuItemId,
          stockItemId,
          qtyPerSale: 0.4,
        });

      const response = await authRequest(ctx.app, ctx.token).get(
        "/v1/inventory/menu-stock-map"
      );

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(Array.isArray(response.body.data)).toBe(true);
      expect(response.body.data.length).toBeGreaterThan(0);
    });
  });

  describe("DELETE /v1/inventory/menu-stock-map/:id", () => {
    test("should delete mapping", async () => {
      // Create mapping
      const createResponse = await authRequest(ctx.app, ctx.token)
        .post("/v1/inventory/menu-stock-map")
        .send({
          menuItemId,
          stockItemId,
          qtyPerSale: 0.5,
        });

      const mappingId = createResponse.body.data.id;

      // Delete
      const deleteResponse = await authRequest(ctx.app, ctx.token).delete(
        `/v1/inventory/menu-stock-map/${mappingId}`
      );

      expect(deleteResponse.status).toBe(204);

      // Verify deleted
      const getResponse = await authRequest(ctx.app, ctx.token).get(
        `/v1/inventory/menu-stock-map/${menuItemId}`
      );
      const mapping = getResponse.body.data.find(
        (m: any) => m.id === mappingId
      );
      expect(mapping).toBeUndefined();
    });

    test("should fail to delete non-existent mapping", async () => {
      const fakeId = "00000000-0000-0000-0000-000000000000";
      const response = await authRequest(ctx.app, ctx.token).delete(
        `/v1/inventory/menu-stock-map/${fakeId}`
      );

      expect(response.status).toBeGreaterThanOrEqual(400);
    });
  });
});
