import { describe, test, expect, beforeEach, jest } from "@jest/globals";
import { InventoryPolicyAdapter } from "../../infra/adapters/policy.adapter.js";

/**
 * Unit tests for InventoryPolicyAdapter
 * 
 * Tests policy evaluation logic including:
 * - Branch overrides
 * - Menu item exclusions
 * - Default fallbacks
 */

describe("InventoryPolicyAdapter", () => {
  let adapter: InventoryPolicyAdapter;
  let mockPool: any;

  beforeEach(() => {
    mockPool = {
      query: jest.fn(),
    } as any;

    adapter = new InventoryPolicyAdapter(mockPool);
  });

  describe("shouldSubtractOnSale", () => {
    test("should return true when policy is enabled and no overrides", async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [
          {
            auto_subtract_on_sale: true,
            expiry_tracking_enabled: false,
            branch_overrides: {},
            exclude_menu_item_ids: [],
          },
        ],
      } as any);

      const result = await adapter.shouldSubtractOnSale("tenant-1", "branch-1");
      expect(result).toBe(true);
    });

    test("should return false when policy is disabled", async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [
          {
            auto_subtract_on_sale: false,
            expiry_tracking_enabled: false,
            branch_overrides: {},
            exclude_menu_item_ids: [],
          },
        ],
      } as any);

      const result = await adapter.shouldSubtractOnSale("tenant-1", "branch-1");
      expect(result).toBe(false);
    });

    test("should use branch override when available", async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [
          {
            auto_subtract_on_sale: true, // Tenant default: enabled
            expiry_tracking_enabled: false,
            branch_overrides: {
              "branch-1": { inventorySubtractOnFinalize: false }, // Branch override: disabled
            },
            exclude_menu_item_ids: [],
          },
        ],
      } as any);

      const result = await adapter.shouldSubtractOnSale("tenant-1", "branch-1");
      expect(result).toBe(false); // Should use branch override
    });

    test("should return false when sale contains excluded menu items", async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [
          {
            auto_subtract_on_sale: true,
            expiry_tracking_enabled: false,
            branch_overrides: {},
            exclude_menu_item_ids: ["menu-service-fee", "menu-gift-card"],
          },
        ],
      } as any);

      const result = await adapter.shouldSubtractOnSale(
        "tenant-1",
        "branch-1",
        ["menu-pizza", "menu-service-fee"] // Contains excluded item
      );
      expect(result).toBe(false);
    });

    test("should return true when no menu items are excluded", async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [
          {
            auto_subtract_on_sale: true,
            expiry_tracking_enabled: false,
            branch_overrides: {},
            exclude_menu_item_ids: ["menu-service-fee"],
          },
        ],
      } as any);

      const result = await adapter.shouldSubtractOnSale(
        "tenant-1",
        "branch-1",
        ["menu-pizza", "menu-burger"] // No excluded items
      );
      expect(result).toBe(true);
    });

    test("should handle missing policy gracefully", async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [], // No policy found
      } as any);

      // Should create default policy
      mockPool.query.mockResolvedValueOnce({} as any);

      const result = await adapter.shouldSubtractOnSale("tenant-1", "branch-1");
      expect(result).toBe(true); // Default is enabled
    });

    test("should handle database errors gracefully", async () => {
      mockPool.query.mockRejectedValueOnce(new Error("Database error"));

      const result = await adapter.shouldSubtractOnSale("tenant-1", "branch-1");
      expect(result).toBe(true); // Fail-safe default
    });
  });

  describe("getInventoryPolicy", () => {
    test("should parse JSONB fields correctly", async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [
          {
            auto_subtract_on_sale: true,
            expiry_tracking_enabled: false,
            branch_overrides: JSON.stringify({
              "branch-1": { inventorySubtractOnFinalize: false },
            }),
            exclude_menu_item_ids: JSON.stringify(["menu-1", "menu-2"]),
          },
        ],
      } as any);

      const policy = await adapter.getInventoryPolicy("tenant-1");

      expect(policy.autoSubtractOnSale).toBe(true);
      expect(policy.branchOverrides).toEqual({
        "branch-1": { inventorySubtractOnFinalize: false },
      });
      expect(policy.excludeMenuItemIds).toEqual(["menu-1", "menu-2"]);
    });

    test("should handle already-parsed JSONB fields", async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [
          {
            auto_subtract_on_sale: true,
            expiry_tracking_enabled: false,
            branch_overrides: { "branch-1": { inventorySubtractOnFinalize: false } },
            exclude_menu_item_ids: ["menu-1", "menu-2"],
          },
        ],
      } as any);

      const policy = await adapter.getInventoryPolicy("tenant-1");

      expect(policy.branchOverrides).toEqual({
        "branch-1": { inventorySubtractOnFinalize: false },
      });
      expect(policy.excludeMenuItemIds).toEqual(["menu-1", "menu-2"]);
    });
  });
});
