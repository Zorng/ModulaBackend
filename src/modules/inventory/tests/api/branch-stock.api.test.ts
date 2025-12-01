import { describe, test, expect, beforeAll, afterAll } from "@jest/globals";
import {
  setupTestContext,
  cleanupTestContext,
  authRequest,
  TestContext,
} from "./test-helpers.js";

describe("Branch Stock API", () => {
  let ctx: TestContext;
  let stockItemId: string;

  beforeAll(async () => {
    ctx = await setupTestContext();

    // Create a test stock item
    const response = await authRequest(ctx.app, ctx.token)
      .post("/v1/inventory/stock-items")
      .send({
        name: "Branch Test Item",
        unitText: "pcs",
      });
    stockItemId = response.body.data.id;
  });

  afterAll(async () => {
    await cleanupTestContext(ctx);
  });

  describe("POST /v1/inventory/branch/stock-items", () => {
    test("should assign stock item to branch", async () => {
      const response = await authRequest(ctx.app, ctx.token)
        .post("/v1/inventory/branch/stock-items")
        .send({
          stockItemId,
          minThreshold: 10,
        });

      if (response.status !== 201) {
        console.log("Error response:", response.body);
      }
      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data.stockItemId).toBe(stockItemId);
      expect(response.body.data.minThreshold).toBe(10);
    });

    test("should update threshold if already assigned", async () => {
      // Assign first time
      await authRequest(ctx.app, ctx.token)
        .post("/v1/inventory/branch/stock-items")
        .send({
          stockItemId,
          minThreshold: 5,
        });

      // Update
      const response = await authRequest(ctx.app, ctx.token)
        .post("/v1/inventory/branch/stock-items")
        .send({
          stockItemId,
          minThreshold: 20,
        });

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data.minThreshold).toBe(20);
    });

    test("should fail with invalid stock item ID", async () => {
      const fakeId = "00000000-0000-0000-0000-000000000000";
      const response = await authRequest(ctx.app, ctx.token)
        .post("/v1/inventory/branch/stock-items")
        .send({
          stockItemId: fakeId,
          minThreshold: 10,
        });

      expect(response.status).toBeGreaterThanOrEqual(400);
    });

    test("should fail with negative threshold", async () => {
      const response = await authRequest(ctx.app, ctx.token)
        .post("/v1/inventory/branch/stock-items")
        .send({
          stockItemId,
          minThreshold: -5,
        });

      expect(response.status).toBe(400);
    });
  });

  describe("GET /v1/inventory/branch/stock-items", () => {
    test("should get all branch stock items", async () => {
      // Assign stock item to branch
      await authRequest(ctx.app, ctx.token)
        .post("/v1/inventory/branch/stock-items")
        .send({
          stockItemId,
          minThreshold: 15,
        });

      const response = await authRequest(ctx.app, ctx.token).get(
        "/v1/inventory/branch/stock-items"
      );

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(Array.isArray(response.body.data)).toBe(true);
      expect(response.body.data.length).toBeGreaterThan(0);

      const item = response.body.data.find(
        (i: any) => i.stockItemId === stockItemId
      );
      expect(item).toBeDefined();
      expect(item.minThreshold).toBe(15);
    });
  });
});
