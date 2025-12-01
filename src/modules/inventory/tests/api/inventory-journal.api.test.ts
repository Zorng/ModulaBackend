import { describe, test, expect, beforeAll, afterAll } from "@jest/globals";
import {
  setupTestContext,
  cleanupTestContext,
  authRequest,
  TestContext,
} from "./test-helpers.js";

describe("Inventory Journal API", () => {
  let ctx: TestContext;
  let stockItemId: string;

  beforeAll(async () => {
    ctx = await setupTestContext();

    // Create test stock item
    const itemResponse = await authRequest(ctx.app, ctx.token)
      .post("/v1/inventory/stock-items")
      .send({
        name: "Journal Test Item",
        unitText: "pcs",
      });
    stockItemId = itemResponse.body.data.id;

    // Assign to branch
    await authRequest(ctx.app, ctx.token)
      .post("/v1/inventory/branch/stock-items")
      .send({
        stockItemId,
        minThreshold: 10,
      });
  });

  afterAll(async () => {
    await cleanupTestContext(ctx);
  });

  describe("POST /v1/inventory/journal/receive", () => {
    test("should record stock receipt", async () => {
      const response = await authRequest(ctx.app, ctx.token)
        .post("/v1/inventory/journal/receive")
        .send({
          stockItemId,
          qty: 100,
          note: "Initial stock",
        });

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data.reason).toBe("receive");
      expect(response.body.data.delta).toBe(100);
    });

    test("should fail with negative quantity", async () => {
      const response = await authRequest(ctx.app, ctx.token)
        .post("/v1/inventory/journal/receive")
        .send({
          stockItemId,
          qty: -10,
        });

      expect(response.status).toBe(400);
    });
  });

  describe("POST /v1/inventory/journal/waste", () => {
    test("should record stock waste", async () => {
      const response = await authRequest(ctx.app, ctx.token)
        .post("/v1/inventory/journal/waste")
        .send({
          stockItemId,
          qty: 5,
          note: "Expired items",
        });

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data.reason).toBe("waste");
      expect(response.body.data.delta).toBe(-5); // Waste is recorded as negative
      expect(response.body.data.note).toBe("Expired items");
    });

    test("should fail without note", async () => {
      const response = await authRequest(ctx.app, ctx.token)
        .post("/v1/inventory/journal/waste")
        .send({
          stockItemId,
          qty: 5,
        });

      expect(response.status).toBe(400);
    });
  });

  describe("POST /v1/inventory/journal/correct", () => {
    test("should record stock correction (positive)", async () => {
      const response = await authRequest(ctx.app, ctx.token)
        .post("/v1/inventory/journal/correct")
        .send({
          stockItemId,
          delta: 10,
          note: "Found extra stock",
        });

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data.reason).toBe("correction");
      expect(response.body.data.delta).toBe(10);
    });

    test("should record stock correction (negative)", async () => {
      const response = await authRequest(ctx.app, ctx.token)
        .post("/v1/inventory/journal/correct")
        .send({
          stockItemId,
          delta: -8,
          note: "Stock count mismatch",
        });

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data.delta).toBe(-8);
    });

    test("should fail with zero delta", async () => {
      const response = await authRequest(ctx.app, ctx.token)
        .post("/v1/inventory/journal/correct")
        .send({
          stockItemId,
          delta: 0,
          note: "No change",
        });

      expect(response.status).toBe(400);
    });

    test("should fail without note", async () => {
      const response = await authRequest(ctx.app, ctx.token)
        .post("/v1/inventory/journal/correct")
        .send({
          stockItemId,
          delta: 5,
        });

      expect(response.status).toBe(400);
    });
  });

  describe("GET /v1/inventory/journal/on-hand", () => {
    test("should get on-hand quantities", async () => {
      // Add some stock
      await authRequest(ctx.app, ctx.token)
        .post("/v1/inventory/journal/receive")
        .send({
          stockItemId,
          qty: 50,
        });

      const response = await authRequest(ctx.app, ctx.token).get(
        "/v1/inventory/journal/on-hand"
      );

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty("items");
      expect(Array.isArray(response.body.data.items)).toBe(true);

      const item = response.body.data.items.find(
        (i: any) => i.stockItemId === stockItemId
      );
      expect(item).toBeDefined();
      expect(item.onHand).toBeGreaterThan(0);
    });
  });

  describe("GET /v1/inventory/journal", () => {
    test("should get journal entries", async () => {
      const response = await authRequest(ctx.app, ctx.token).get(
        "/v1/inventory/journal"
      );

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty("entries");
      expect(Array.isArray(response.body.data.entries)).toBe(true);
    });

    test("should filter by stock item", async () => {
      const response = await authRequest(ctx.app, ctx.token).get(
        `/v1/inventory/journal?stockItemId=${stockItemId}`
      );

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(
        response.body.data.entries.every(
          (e: any) => e.stockItemId === stockItemId
        )
      ).toBe(true);
    });

    test("should filter by reason", async () => {
      const response = await authRequest(ctx.app, ctx.token).get(
        "/v1/inventory/journal?reason=receive"
      );

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(
        response.body.data.entries.every((e: any) => e.reason === "receive")
      ).toBe(true);
    });
  });

  describe("GET /v1/inventory/journal/alerts/low-stock", () => {
    test("should get low stock alerts", async () => {
      const response = await authRequest(ctx.app, ctx.token).get(
        "/v1/inventory/journal/alerts/low-stock"
      );

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty("items");
      expect(Array.isArray(response.body.data.items)).toBe(true);
    });
  });
});
