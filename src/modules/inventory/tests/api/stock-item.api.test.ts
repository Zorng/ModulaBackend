import { describe, test, expect, beforeAll, afterAll } from "@jest/globals";
import {
  setupTestContext,
  cleanupTestContext,
  authRequest,
  TestContext,
} from "./test-helpers.js";

describe("Stock Item API", () => {
  let ctx: TestContext;
  let categoryId: string;

  beforeAll(async () => {
    ctx = await setupTestContext();

    // Create a test category for categoryId tests
    const categoryResponse = await authRequest(ctx.app, ctx.token)
      .post("/v1/inventory/categories")
      .send({
        name: "Test Stock Category",
        displayOrder: 1,
      });
    categoryId = categoryResponse.body.data.id;
  });

  afterAll(async () => {
    await cleanupTestContext(ctx);
  });

  describe("POST /v1/inventory/stock-items", () => {
    test("should create a new stock item", async () => {
      const response = await authRequest(ctx.app, ctx.token)
        .post("/v1/inventory/stock-items")
        .send({
          name: "Rice Bag",
          unitText: "kg",
          barcode: "123456",
          defaultCostUsd: 25.0,
        });

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty("id");
      expect(response.body.data.name).toBe("Rice Bag");
      expect(response.body.data.unitText).toBe("kg");
      expect(response.body.data.barcode).toBe("123456");
      expect(response.body.data.defaultCostUsd).toBe(25.0);
      expect(response.body.data.isActive).toBe(true);
    });

    test("should fail without authentication", async () => {
      const response = await authRequest(ctx.app, "invalid-token")
        .post("/v1/inventory/stock-items")
        .send({
          name: "Rice Bag",
          unitText: "kg",
        });

      expect(response.status).toBe(401);
    });

    test("should fail with invalid data", async () => {
      const response = await authRequest(ctx.app, ctx.token)
        .post("/v1/inventory/stock-items")
        .send({
          // missing required fields
          barcode: "123456",
        });

      expect(response.status).toBe(400);
    });

    test("should create stock item with categoryId", async () => {
      const response = await authRequest(ctx.app, ctx.token)
        .post("/v1/inventory/stock-items")
        .send({
          name: "Categorized Item",
          unitText: "pcs",
          categoryId: categoryId,
        });

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data.name).toBe("Categorized Item");
      expect(response.body.data.categoryId).toBe(categoryId);
    });

    test("should create stock item without categoryId (optional)", async () => {
      const response = await authRequest(ctx.app, ctx.token)
        .post("/v1/inventory/stock-items")
        .send({
          name: "Uncategorized Item",
          unitText: "kg",
        });

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data.name).toBe("Uncategorized Item");
      // categoryId should be null or undefined
      expect(response.body.data.categoryId == null).toBe(true);
    });
  });

  describe("GET /v1/inventory/stock-items", () => {
    test("should get all stock items", async () => {
      // Create a test item first
      const createResponse = await authRequest(ctx.app, ctx.token)
        .post("/v1/inventory/stock-items")
        .send({
          name: "Test Item 1",
          unitText: "pcs",
        });

      const response = await authRequest(ctx.app, ctx.token).get(
        "/v1/inventory/stock-items"
      );

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(Array.isArray(response.body.data.items)).toBe(true);
      expect(response.body.data.items.length).toBeGreaterThan(0);
    });

    test("should filter by search query", async () => {
      await authRequest(ctx.app, ctx.token)
        .post("/v1/inventory/stock-items")
        .send({
          name: "Unique Item Name",
          unitText: "liter",
        });

      const response = await authRequest(ctx.app, ctx.token).get(
        "/v1/inventory/stock-items?search=Unique"
      );

      expect(response.status).toBe(200);
      const uniqueItem = response.body.data.items.find((i: any) =>
        i.name.includes("Unique")
      );
      expect(uniqueItem).toBeDefined();
      expect(uniqueItem.name).toContain("Unique");
    });

    test("should filter by categoryId", async () => {
      // Create item with category
      await authRequest(ctx.app, ctx.token)
        .post("/v1/inventory/stock-items")
        .send({
          name: "Filtered Item",
          unitText: "pcs",
          categoryId: categoryId,
        });

      const response = await authRequest(ctx.app, ctx.token).get(
        `/v1/inventory/stock-items?categoryId=${categoryId}`
      );

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);

      // All returned items should have the specified categoryId
      const itemsWithCategory = response.body.data.items.filter(
        (i: any) => i.categoryId === categoryId
      );
      expect(itemsWithCategory.length).toBeGreaterThan(0);
    });
  });

  describe("PUT /v1/inventory/stock-items/:id", () => {
    test("should update an existing stock item", async () => {
      // Create item
      const createResponse = await authRequest(ctx.app, ctx.token)
        .post("/v1/inventory/stock-items")
        .send({
          name: "Original Name",
          unitText: "pcs",
        });

      const itemId = createResponse.body.data.id;

      // Update item
      const updateResponse = await authRequest(ctx.app, ctx.token)
        .put(`/v1/inventory/stock-items/${itemId}`)
        .send({
          name: "Updated Name",
          unitText: "kg",
          defaultCostUsd: 50.0,
        });

      expect(updateResponse.status).toBe(200);
      expect(updateResponse.body.data.name).toBe("Updated Name");
      expect(updateResponse.body.data.unitText).toBe("kg");
      expect(updateResponse.body.data.defaultCostUsd).toBe(50.0);
    });

    test("should fail to update non-existent item", async () => {
      const fakeId = "00000000-0000-0000-0000-000000000000";
      const response = await authRequest(ctx.app, ctx.token)
        .put(`/v1/inventory/stock-items/${fakeId}`)
        .send({
          name: "Updated Name",
        });

      expect(response.status).toBeGreaterThanOrEqual(400);
    });

    test("should update stock item categoryId", async () => {
      // Create item without category
      const createResponse = await authRequest(ctx.app, ctx.token)
        .post("/v1/inventory/stock-items")
        .send({
          name: "Item to Categorize",
          unitText: "pcs",
        });

      const itemId = createResponse.body.data.id;

      // Update to add category
      const updateResponse = await authRequest(ctx.app, ctx.token)
        .put(`/v1/inventory/stock-items/${itemId}`)
        .send({
          categoryId: categoryId,
        });

      expect(updateResponse.status).toBe(200);
      expect(updateResponse.body.data.categoryId).toBe(categoryId);
    });

    test("should remove categoryId by setting to null", async () => {
      // Create item with category
      const createResponse = await authRequest(ctx.app, ctx.token)
        .post("/v1/inventory/stock-items")
        .send({
          name: "Item to Uncategorize",
          unitText: "kg",
          categoryId: categoryId,
        });

      const itemId = createResponse.body.data.id;
      expect(createResponse.body.data.categoryId).toBe(categoryId);

      // Update to remove category by explicitly sending null
      const updateResponse = await authRequest(ctx.app, ctx.token)
        .put(`/v1/inventory/stock-items/${itemId}`)
        .send({
          categoryId: null,
        });

      expect(updateResponse.status).toBe(200);
      // categoryId should be null or undefined after removal
      expect(updateResponse.body.data.categoryId == null).toBe(true);
    });

    test("should update both name and categoryId together", async () => {
      // Create item
      const createResponse = await authRequest(ctx.app, ctx.token)
        .post("/v1/inventory/stock-items")
        .send({
          name: "Multi Update Item",
          unitText: "pcs",
        });

      const itemId = createResponse.body.data.id;

      // Update both fields
      const updateResponse = await authRequest(ctx.app, ctx.token)
        .put(`/v1/inventory/stock-items/${itemId}`)
        .send({
          name: "Updated Multi Item",
          categoryId: categoryId,
        });

      expect(updateResponse.status).toBe(200);
      expect(updateResponse.body.data.name).toBe("Updated Multi Item");
      expect(updateResponse.body.data.categoryId).toBe(categoryId);
    });
  });
});
