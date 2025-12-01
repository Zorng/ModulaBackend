import { describe, it, expect, jest, beforeEach } from "@jest/globals";
import { SetMenuStockMapUseCase } from "../../app/menustockmap-usecase/set-menu-stock-map.use-case.js";
import { GetMenuStockMapUseCase } from "../../app/menustockmap-usecase/get-menu-stock-map.use-case.js";
import { DeleteMenuStockMapUseCase } from "../../app/menustockmap-usecase/delete-menu-stock-map.use-case.js";
import type { MenuStockMap } from "../../domain/entities.js";

describe("Menu Stock Map Use Cases", () => {
  let mockMenuStockMapRepository: any;
  let mockStockItemRepository: any;
  let mockEventBus: any;
  let mockTxMgr: any;

  beforeEach(() => {
    mockMenuStockMapRepository = {
      deleteForMenuItem: jest.fn(),
      bulkInsert: jest.fn(),
      save: jest.fn(),
      findByMenuItemId: jest.fn(),
      findByMenuItem: jest.fn(),
      deleteByTenantAndId: jest.fn(),
      findByTenantAndId: jest.fn(),
      findById: jest.fn(),
      delete: jest.fn(),
    };

    mockStockItemRepository = {
      findById: jest.fn(),
    };

    mockEventBus = {
      publishViaOutbox: jest.fn(),
    };

    mockTxMgr = {
      withTransaction: jest.fn(async (fn: Function) => await fn(null)), // Pass-through transaction
    };
  });

  describe("SetMenuStockMapUseCase", () => {
    it("should create menu stock mappings successfully", async () => {
      const useCase = new SetMenuStockMapUseCase(
        mockMenuStockMapRepository,
        mockStockItemRepository,
        mockEventBus,
        mockTxMgr
      );

      // Mock stock item validation
      mockStockItemRepository.findById.mockResolvedValue({
        id: "stock-1",
        tenantId: "tenant-1",
        createdBy: "user-1",
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const mapping: MenuStockMap = {
        id: "map-1",
        tenantId: "tenant-1",
        menuItemId: "menu-1",
        stockItemId: "stock-1",
        qtyPerSale: 0.5,
        createdBy: "user-1",
        createdAt: new Date(),
      };

      mockMenuStockMapRepository.save.mockResolvedValue(mapping);

      const result = await useCase.execute({
        tenantId: "tenant-1",
        menuItemId: "menu-1",
        stockItemId: "stock-1",
        qtyPerSale: 0.5,
        updatedBy: "user-1",
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toEqual(mapping);
      }
      expect(mockMenuStockMapRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: "tenant-1",
          menuItemId: "menu-1",
          stockItemId: "stock-1",
          qtyPerSale: 0.5,
          createdBy: "user-1",
        })
      );
    });

    it("should fail if qtyPerSale is zero or negative", async () => {
      const useCase = new SetMenuStockMapUseCase(
        mockMenuStockMapRepository,
        mockStockItemRepository,
        mockEventBus,
        mockTxMgr
      );

      const result = await useCase.execute({
        tenantId: "tenant-1",
        menuItemId: "menu-1",
        stockItemId: "stock-1",
        qtyPerSale: 0,
        updatedBy: "user-1",
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toContain("Quantity per sale must be positive");
      }
    });

    it("should fail if stock item not found", async () => {
      const useCase = new SetMenuStockMapUseCase(
        mockMenuStockMapRepository,
        mockStockItemRepository,
        mockEventBus,
        mockTxMgr
      );

      // Mock stock item not found
      mockStockItemRepository.findById.mockResolvedValue(null);

      const result = await useCase.execute({
        tenantId: "tenant-1",
        menuItemId: "menu-1",
        stockItemId: "stock-999",
        qtyPerSale: 0.5,
        updatedBy: "user-1",
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toContain("Stock item not found");
      }
    });

    it("should fail if stock item belongs to different tenant", async () => {
      const useCase = new SetMenuStockMapUseCase(
        mockMenuStockMapRepository,
        mockStockItemRepository,
        mockEventBus,
        mockTxMgr
      );

      // Mock stock item from different tenant
      mockStockItemRepository.findById.mockResolvedValue({
        id: "stock-1",
        tenantId: "different-tenant",
      });

      const result = await useCase.execute({
        tenantId: "tenant-1",
        menuItemId: "menu-1",
        stockItemId: "stock-1",
        qtyPerSale: 0.5,
        updatedBy: "user-1",
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toContain("tenant");
      }
    });
  });

  describe("GetMenuStockMapUseCase", () => {
    it("should retrieve menu stock mappings successfully", async () => {
      const useCase = new GetMenuStockMapUseCase(mockMenuStockMapRepository);

      const mappings: MenuStockMap[] = [
        {
          id: "map-1",
          tenantId: "tenant-1",
          menuItemId: "menu-1",
          stockItemId: "stock-1",
          qtyPerSale: 0.5,
          createdBy: "user-1",
          createdAt: new Date(),
        },
        {
          id: "map-2",
          tenantId: "tenant-1",
          menuItemId: "menu-1",
          stockItemId: "stock-2",
          qtyPerSale: 0.3,
          createdBy: "user-1",
          createdAt: new Date(),
        },
      ];

      mockMenuStockMapRepository.findByMenuItem.mockResolvedValue(mappings);

      const result = await useCase.execute("menu-1");

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toEqual(mappings);
      }
      expect(mockMenuStockMapRepository.findByMenuItem).toHaveBeenCalledWith(
        "menu-1"
      );
    });

    it("should return empty array when no mappings found", async () => {
      const useCase = new GetMenuStockMapUseCase(mockMenuStockMapRepository);

      mockMenuStockMapRepository.findByMenuItem.mockResolvedValue([]);

      const result = await useCase.execute("menu-nonexistent");

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toEqual([]);
      }
    });
  });

  describe("DeleteMenuStockMapUseCase", () => {
    it("should delete menu stock mapping successfully", async () => {
      const useCase = new DeleteMenuStockMapUseCase(mockMenuStockMapRepository);

      const existingMapping: MenuStockMap = {
        id: "map-1",
        tenantId: "tenant-1",
        menuItemId: "menu-1",
        stockItemId: "stock-1",
        qtyPerSale: 0.5,
        createdBy: "user-1",
        createdAt: new Date(),
      };

      mockMenuStockMapRepository.findById.mockResolvedValue(existingMapping);
      mockMenuStockMapRepository.delete.mockResolvedValue(undefined);

      const result = await useCase.execute({
        id: "map-1",
      });

      expect(result.ok).toBe(true);
      expect(mockMenuStockMapRepository.delete).toHaveBeenCalledWith("map-1");
    });

    it("should fail if mapping not found", async () => {
      const useCase = new DeleteMenuStockMapUseCase(mockMenuStockMapRepository);

      mockMenuStockMapRepository.findById.mockResolvedValue(null);

      const result = await useCase.execute({
        id: "map-nonexistent",
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBe("Menu stock mapping not found");
      }
    });
  });
});
