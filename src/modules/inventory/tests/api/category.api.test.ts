import { describe, test, expect, beforeAll, afterAll } from "@jest/globals";
import {
  setupTestContext,
  cleanupTestContext,
  authRequest,
  TestContext,
} from "./test-helpers.js";

describe("Category API", () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await setupTestContext();
  });

  afterAll(async () => {
    await cleanupTestContext(ctx);
  });

  describe("POST /v1/inventory/categories", () => {
    test("should create a new category", async () => {
      const response = await authRequest(ctx.app, ctx.token)
        .post("/v1/inventory/categories")
        .send({
          name: "Dairy Products",
          displayOrder: 10,
          isActive: true,
        });

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty("id");
      expect(response.body.data.name).toBe("Dairy Products");
      expect(response.body.data.displayOrder).toBe(10);
      expect(response.body.data.isActive).toBe(true);
      expect(response.body.data.tenantId).toBe(ctx.tenantId);
    });

    test("should create category with default values", async () => {
      const response = await authRequest(ctx.app, ctx.token)
        .post("/v1/inventory/categories")
        .send({
          name: "Beverages",
        });

      expect(response.status).toBe(201);
      expect(response.body.data.displayOrder).toBe(0);
      expect(response.body.data.isActive).toBe(true);
    });

    test("should fail without authentication", async () => {
      const response = await authRequest(ctx.app, "invalid-token")
        .post("/v1/inventory/categories")
        .send({
          name: "Test Category",
        });

      expect(response.status).toBe(401);
    });

    test("should fail with name too short", async () => {
      const response = await authRequest(ctx.app, ctx.token)
        .post("/v1/inventory/categories")
        .send({
          name: "A", // Too short (< 2 chars)
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain("2 and 40 characters");
    });

    test("should fail with name too long", async () => {
      const response = await authRequest(ctx.app, ctx.token)
        .post("/v1/inventory/categories")
        .send({
          name: "A".repeat(41), // Too long (> 40 chars)
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });

    test("should fail with duplicate category name", async () => {
      const categoryName = "Unique Category Name";

      // Create first category
      await authRequest(ctx.app, ctx.token)
        .post("/v1/inventory/categories")
        .send({
          name: categoryName,
        });

      // Try to create duplicate
      const response = await authRequest(ctx.app, ctx.token)
        .post("/v1/inventory/categories")
        .send({
          name: categoryName,
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain("already exists");
    });

    test("should fail with case-insensitive duplicate", async () => {
      await authRequest(ctx.app, ctx.token)
        .post("/v1/inventory/categories")
        .send({
          name: "Fresh Produce",
        });

      const response = await authRequest(ctx.app, ctx.token)
        .post("/v1/inventory/categories")
        .send({
          name: "FRESH PRODUCE", // Different case
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain("already exists");
    });
  });

  describe("GET /v1/inventory/categories", () => {
    test("should get all categories", async () => {
      // Create test categories
      await authRequest(ctx.app, ctx.token)
        .post("/v1/inventory/categories")
        .send({ name: "Category 1", displayOrder: 1 });

      await authRequest(ctx.app, ctx.token)
        .post("/v1/inventory/categories")
        .send({ name: "Category 2", displayOrder: 2 });

      const response = await authRequest(ctx.app, ctx.token).get(
        "/v1/inventory/categories"
      );

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(Array.isArray(response.body.data)).toBe(true);
      expect(response.body.data.length).toBeGreaterThanOrEqual(2);
    });

    test("should return categories sorted by display order", async () => {
      await authRequest(ctx.app, ctx.token)
        .post("/v1/inventory/categories")
        .send({ name: "Third", displayOrder: 30 });

      await authRequest(ctx.app, ctx.token)
        .post("/v1/inventory/categories")
        .send({ name: "First", displayOrder: 10 });

      await authRequest(ctx.app, ctx.token)
        .post("/v1/inventory/categories")
        .send({ name: "Second", displayOrder: 20 });

      const response = await authRequest(ctx.app, ctx.token).get(
        "/v1/inventory/categories"
      );

      const categories = response.body.data;
      const firstIdx = categories.findIndex((c: any) => c.name === "First");
      const secondIdx = categories.findIndex((c: any) => c.name === "Second");
      const thirdIdx = categories.findIndex((c: any) => c.name === "Third");

      expect(firstIdx).toBeLessThan(secondIdx);
      expect(secondIdx).toBeLessThan(thirdIdx);
    });

    test("should filter by isActive", async () => {
      // Create active category
      const activeResp = await authRequest(ctx.app, ctx.token)
        .post("/v1/inventory/categories")
        .send({ name: "Active Category", isActive: true });

      // Create inactive category
      const inactiveResp = await authRequest(ctx.app, ctx.token)
        .post("/v1/inventory/categories")
        .send({ name: "Inactive Category", isActive: false });

      // Get only active categories
      const response = await authRequest(ctx.app, ctx.token).get(
        "/v1/inventory/categories?isActive=true"
      );

      expect(response.status).toBe(200);
      const activeCategories = response.body.data.filter(
        (c: any) => c.isActive
      );
      const inactiveCategories = response.body.data.filter(
        (c: any) => !c.isActive
      );

      expect(activeCategories.length).toBeGreaterThan(0);
      expect(inactiveCategories.length).toBe(0);
    });

    test("should fail without authentication", async () => {
      const response = await authRequest(ctx.app, "invalid-token").get(
        "/v1/inventory/categories"
      );

      expect(response.status).toBe(401);
    });
  });

  describe("PATCH /v1/inventory/categories/:id", () => {
    test("should update category name", async () => {
      // Create category
      const createResp = await authRequest(ctx.app, ctx.token)
        .post("/v1/inventory/categories")
        .send({ name: "Original Name" });

      const categoryId = createResp.body.data.id;

      // Update category
      const response = await authRequest(ctx.app, ctx.token)
        .patch(`/v1/inventory/categories/${categoryId}`)
        .send({ name: "Updated Name" });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.name).toBe("Updated Name");
    });

    test("should update display order", async () => {
      const createResp = await authRequest(ctx.app, ctx.token)
        .post("/v1/inventory/categories")
        .send({ name: "Test Category", displayOrder: 10 });

      const categoryId = createResp.body.data.id;

      const response = await authRequest(ctx.app, ctx.token)
        .patch(`/v1/inventory/categories/${categoryId}`)
        .send({ displayOrder: 99 });

      expect(response.status).toBe(200);
      expect(response.body.data.displayOrder).toBe(99);
    });

    test("should deactivate category", async () => {
      const createResp = await authRequest(ctx.app, ctx.token)
        .post("/v1/inventory/categories")
        .send({ name: "Category To Deactivate", isActive: true });

      const categoryId = createResp.body.data.id;

      const response = await authRequest(ctx.app, ctx.token)
        .patch(`/v1/inventory/categories/${categoryId}`)
        .send({ isActive: false });

      expect(response.status).toBe(200);
      expect(response.body.data.isActive).toBe(false);
    });

    test("should update multiple fields at once", async () => {
      const createResp = await authRequest(ctx.app, ctx.token)
        .post("/v1/inventory/categories")
        .send({ name: "Old", displayOrder: 5 });

      const categoryId = createResp.body.data.id;

      const response = await authRequest(ctx.app, ctx.token)
        .patch(`/v1/inventory/categories/${categoryId}`)
        .send({
          name: "New",
          displayOrder: 15,
          isActive: false,
        });

      expect(response.status).toBe(200);
      expect(response.body.data.name).toBe("New");
      expect(response.body.data.displayOrder).toBe(15);
      expect(response.body.data.isActive).toBe(false);
    });

    test("should fail to update non-existent category", async () => {
      const response = await authRequest(ctx.app, ctx.token)
        .patch("/v1/inventory/categories/999999")
        .send({ name: "Updated" });

      expect(response.status).toBe(404);
      expect(response.body.success).toBe(false);
    });

    test("should fail with invalid name length", async () => {
      const createResp = await authRequest(ctx.app, ctx.token)
        .post("/v1/inventory/categories")
        .send({ name: "Valid Name" });

      const categoryId = createResp.body.data.id;

      const response = await authRequest(ctx.app, ctx.token)
        .patch(`/v1/inventory/categories/${categoryId}`)
        .send({ name: "X" }); // Too short

      expect(response.status).toBe(400);
    });

    test("should fail with duplicate name", async () => {
      await authRequest(ctx.app, ctx.token)
        .post("/v1/inventory/categories")
        .send({ name: "Existing Category" });

      const createResp = await authRequest(ctx.app, ctx.token)
        .post("/v1/inventory/categories")
        .send({ name: "Category to Update" });

      const categoryId = createResp.body.data.id;

      const response = await authRequest(ctx.app, ctx.token)
        .patch(`/v1/inventory/categories/${categoryId}`)
        .send({ name: "Existing Category" });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain("already exists");
    });
  });

  describe("DELETE /v1/inventory/categories/:id", () => {
    test("should delete category with no items assigned", async () => {
      const createResp = await authRequest(ctx.app, ctx.token)
        .post("/v1/inventory/categories")
        .send({ name: "Category to Delete" });

      const categoryId = createResp.body.data.id;

      const response = await authRequest(ctx.app, ctx.token).delete(
        `/v1/inventory/categories/${categoryId}`
      );

      expect(response.status).toBe(204);

      // Verify deletion
      const getResp = await authRequest(ctx.app, ctx.token).get(
        "/v1/inventory/categories"
      );
      const exists = getResp.body.data.some((c: any) => c.id === categoryId);
      expect(exists).toBe(false);
    });

    test("should fail to delete category with items assigned (strict mode)", async () => {
      // Create category
      const categoryResp = await authRequest(ctx.app, ctx.token)
        .post("/v1/inventory/categories")
        .send({ name: "Category with Items" });

      const categoryId = categoryResp.body.data.id;

      // Create stock item assigned to this category
      await authRequest(ctx.app, ctx.token)
        .post("/v1/inventory/stock-items")
        .send({
          name: "Item in Category",
          unitText: "pcs",
          categoryId: categoryId,
        });

      // Try to delete without safe mode
      const response = await authRequest(ctx.app, ctx.token).delete(
        `/v1/inventory/categories/${categoryId}`
      );

      expect(response.status).toBe(400);
      expect(response.body.error).toContain("assigned");
    });

    test("should delete category with items using safe mode", async () => {
      // Create category
      const categoryResp = await authRequest(ctx.app, ctx.token)
        .post("/v1/inventory/categories")
        .send({ name: "Safe Delete Category" });

      const categoryId = categoryResp.body.data.id;

      // Create stock item assigned to this category
      const itemResp = await authRequest(ctx.app, ctx.token)
        .post("/v1/inventory/stock-items")
        .send({
          name: "Item for Safe Delete",
          unitText: "kg",
          categoryId: categoryId,
        });

      const itemId = itemResp.body.data.id;

      // Delete with safe mode
      const response = await authRequest(ctx.app, ctx.token).delete(
        `/v1/inventory/categories/${categoryId}?safeMode=true`
      );

      expect(response.status).toBe(204);

      // Verify category is deleted
      const getCategoriesResp = await authRequest(ctx.app, ctx.token).get(
        "/v1/inventory/categories"
      );
      const categoryExists = getCategoriesResp.body.data.some(
        (c: any) => c.id === categoryId
      );
      expect(categoryExists).toBe(false);

      // Verify item's categoryId is null
      const getItemsResp = await authRequest(ctx.app, ctx.token).get(
        "/v1/inventory/stock-items"
      );
      const item = getItemsResp.body.data.items.find(
        (i: any) => i.id === itemId
      );
      // categoryId should be null or undefined after safe delete
      expect(item.categoryId == null).toBe(true);
    });

    test("should fail to delete non-existent category", async () => {
      const response = await authRequest(ctx.app, ctx.token).delete(
        "/v1/inventory/categories/999999"
      );

      expect(response.status).toBe(404);
    });

    test("should fail without authentication", async () => {
      const createResp = await authRequest(ctx.app, ctx.token)
        .post("/v1/inventory/categories")
        .send({ name: "Test" });

      const categoryId = createResp.body.data.id;

      const response = await authRequest(ctx.app, "invalid-token").delete(
        `/v1/inventory/categories/${categoryId}`
      );

      expect(response.status).toBe(401);
    });
  });

  describe("Integration with Stock Items", () => {
    test("should assign category to stock item", async () => {
      // Create category
      const categoryResp = await authRequest(ctx.app, ctx.token)
        .post("/v1/inventory/categories")
        .send({ name: "Packaging" });

      const categoryId = categoryResp.body.data.id;

      // Create stock item with category
      const itemResp = await authRequest(ctx.app, ctx.token)
        .post("/v1/inventory/stock-items")
        .send({
          name: "Plastic Cups",
          unitText: "pcs",
          categoryId: categoryId,
        });

      expect(itemResp.status).toBe(201);
      expect(itemResp.body.data.categoryId).toBe(categoryId);
    });

    test("should filter stock items by category", async () => {
      // Create categories
      const cat1Resp = await authRequest(ctx.app, ctx.token)
        .post("/v1/inventory/categories")
        .send({ name: "Category A" });

      const cat2Resp = await authRequest(ctx.app, ctx.token)
        .post("/v1/inventory/categories")
        .send({ name: "Category B" });

      const cat1Id = cat1Resp.body.data.id;
      const cat2Id = cat2Resp.body.data.id;

      // Create items in different categories
      await authRequest(ctx.app, ctx.token)
        .post("/v1/inventory/stock-items")
        .send({ name: "Item A1", unitText: "pcs", categoryId: cat1Id });

      await authRequest(ctx.app, ctx.token)
        .post("/v1/inventory/stock-items")
        .send({ name: "Item A2", unitText: "pcs", categoryId: cat1Id });

      await authRequest(ctx.app, ctx.token)
        .post("/v1/inventory/stock-items")
        .send({ name: "Item B1", unitText: "pcs", categoryId: cat2Id });

      // Filter by category A
      const response = await authRequest(ctx.app, ctx.token).get(
        `/v1/inventory/stock-items?categoryId=${cat1Id}`
      );

      expect(response.status).toBe(200);
      const categoryAItems = response.body.data.items.filter(
        (i: any) => i.categoryId === cat1Id
      );
      expect(categoryAItems.length).toBeGreaterThanOrEqual(2);
    });

    test("should update item category", async () => {
      const cat1Resp = await authRequest(ctx.app, ctx.token)
        .post("/v1/inventory/categories")
        .send({ name: "Old Category" });

      const cat2Resp = await authRequest(ctx.app, ctx.token)
        .post("/v1/inventory/categories")
        .send({ name: "New Category" });

      const itemResp = await authRequest(ctx.app, ctx.token)
        .post("/v1/inventory/stock-items")
        .send({
          name: "Movable Item",
          unitText: "pcs",
          categoryId: cat1Resp.body.data.id,
        });

      const itemId = itemResp.body.data.id;

      // Move to new category
      const updateResp = await authRequest(ctx.app, ctx.token)
        .put(`/v1/inventory/stock-items/${itemId}`)
        .send({ categoryId: cat2Resp.body.data.id });

      expect(updateResp.status).toBe(200);
      expect(updateResp.body.data.categoryId).toBe(cat2Resp.body.data.id);
    });
  });
});
