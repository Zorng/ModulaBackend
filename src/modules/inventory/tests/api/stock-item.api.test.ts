import { describe, test, expect, beforeAll, afterAll } from "@jest/globals";
import {
  setupTestContext,
  cleanupTestContext,
  authRequest,
  TestContext,
} from "./test-helpers.js";

describe("Stock Item API", () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await setupTestContext();
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
  });
});
