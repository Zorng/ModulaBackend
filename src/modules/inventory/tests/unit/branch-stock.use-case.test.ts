import { describe, it, expect, jest, beforeEach } from "@jest/globals";
import { AssignStockItemToBranchUseCase } from "../../app/branchstock-usecase/assign-stock-item-to-branch.use-case.js";
import { GetBranchStockItemsUseCase } from "../../app/branchstock-usecase/get-branch-stock-items.use-case.js";
import type { BranchStock } from "../../domain/entities.js";

describe("Branch Stock Use Cases", () => {
  let mockBranchStockRepository: any;
  let mockStockItemRepository: any;

  beforeEach(() => {
    mockBranchStockRepository = {
      findByBranchAndItem: jest.fn(),
      save: jest.fn(),
      findByBranch: jest.fn(),
    };

    mockStockItemRepository = {
      findById: jest.fn(),
      findByTenant: jest.fn(),
    };
  });

  describe("AssignStockItemToBranchUseCase", () => {
    it("should assign stock item to branch successfully", async () => {
      const useCase = new AssignStockItemToBranchUseCase(
        mockBranchStockRepository,
        mockStockItemRepository
      );

      // Mock stock item exists
      mockStockItemRepository.findById.mockResolvedValue({
        id: "stock-1",
        tenantId: "tenant-1",
        name: "Flour",
        unitText: "kg",
        isActive: true,
        createdAt: new Date(),
      });

      const assignedStock: BranchStock = {
        id: "branch-stock-1",
        tenantId: "tenant-1",
        branchId: "branch-1",
        stockItemId: "stock-1",
        minThreshold: 10,
        createdBy: "user-1",
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockBranchStockRepository.save.mockResolvedValue(assignedStock);

      const result = await useCase.execute({
        tenantId: "tenant-1",
        branchId: "branch-1",
        stockItemId: "stock-1",
        minThreshold: 10,
        userId: "user-1",
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toEqual(assignedStock);
      }
      expect(mockStockItemRepository.findById).toHaveBeenCalledWith("stock-1");
      expect(mockBranchStockRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: "tenant-1",
          branchId: "branch-1",
          stockItemId: "stock-1",
          minThreshold: 10,
        })
      );
    });

    it("should fail if stock item does not exist", async () => {
      const useCase = new AssignStockItemToBranchUseCase(
        mockBranchStockRepository,
        mockStockItemRepository
      );

      // Mock stock item not found
      mockStockItemRepository.findById.mockResolvedValue(null);

      const result = await useCase.execute({
        tenantId: "tenant-1",
        branchId: "branch-1",
        stockItemId: "stock-nonexistent",
        minThreshold: 10,
        userId: "user-1",
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toContain("not found");
      }
    });

    it("should fail if stock item belongs to different tenant", async () => {
      const useCase = new AssignStockItemToBranchUseCase(
        mockBranchStockRepository,
        mockStockItemRepository
      );

      // Mock stock item from different tenant
      mockStockItemRepository.findById.mockResolvedValue({
        id: "stock-1",
        tenantId: "different-tenant",
        name: "Flour",
        unitText: "kg",
        isActive: true,
        createdAt: new Date(),
      });

      const result = await useCase.execute({
        tenantId: "tenant-1",
        branchId: "branch-1",
        stockItemId: "stock-1",
        minThreshold: 10,
        userId: "user-1",
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toContain("tenant");
      }
    });

    it("should update minThreshold if already assigned", async () => {
      const useCase = new AssignStockItemToBranchUseCase(
        mockBranchStockRepository,
        mockStockItemRepository
      );

      mockStockItemRepository.findById.mockResolvedValue({
        id: "stock-1",
        tenantId: "tenant-1",
        name: "Flour",
        unitText: "kg",
        isActive: true,
        createdAt: new Date(),
      });

      // Repository's save method handles upsert, so it will update existing
      const updatedStock: BranchStock = {
        id: "branch-stock-1",
        tenantId: "tenant-1",
        branchId: "branch-1",
        stockItemId: "stock-1",
        minThreshold: 15,
        createdBy: "user-1",
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockBranchStockRepository.save.mockResolvedValue(updatedStock);

      const result = await useCase.execute({
        tenantId: "tenant-1",
        branchId: "branch-1",
        stockItemId: "stock-1",
        minThreshold: 15,
        userId: "user-1",
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.minThreshold).toBe(15);
      }
    });
  });

  describe("GetBranchStockItemsUseCase", () => {
    it("should retrieve all branch stock items", async () => {
      const useCase = new GetBranchStockItemsUseCase(
        mockBranchStockRepository,
        mockStockItemRepository
      );

      const branchStocks: BranchStock[] = [
        {
          id: "branch-stock-1",
          tenantId: "tenant-1",
          branchId: "branch-1",
          stockItemId: "stock-1",
          minThreshold: 10,
          createdBy: "user-1",
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: "branch-stock-2",
          tenantId: "tenant-1",
          branchId: "branch-1",
          stockItemId: "stock-2",
          minThreshold: 5,
          createdBy: "user-1",
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      const stockItems = [
        {
          id: "stock-1",
          tenantId: "tenant-1",
          name: "Flour",
          unitText: "kg",
          isActive: true,
          createdAt: new Date(),
        },
        {
          id: "stock-2",
          tenantId: "tenant-1",
          name: "Sugar",
          unitText: "kg",
          isActive: true,
          createdAt: new Date(),
        },
      ];

      mockBranchStockRepository.findByBranch.mockResolvedValue(branchStocks);
      mockStockItemRepository.findByTenant.mockResolvedValue(stockItems);

      const result = await useCase.execute({
        tenantId: "tenant-1",
        branchId: "branch-1",
      });

      expect(result.length).toBe(2);
      expect(result[0].stockItemId).toBe("stock-1");
      expect(result[0].name).toBe("Flour");
      expect(result[0].minThreshold).toBe(10);
      expect(mockBranchStockRepository.findByBranch).toHaveBeenCalledWith(
        "branch-1"
      );
      expect(mockStockItemRepository.findByTenant).toHaveBeenCalledWith(
        "tenant-1"
      );
    });

    it("should return empty array when no stock items assigned", async () => {
      const useCase = new GetBranchStockItemsUseCase(
        mockBranchStockRepository,
        mockStockItemRepository
      );

      mockBranchStockRepository.findByBranch.mockResolvedValue([]);
      mockStockItemRepository.findByTenant.mockResolvedValue([]);

      const result = await useCase.execute({
        tenantId: "tenant-1",
        branchId: "branch-nonexistent",
      });

      expect(result).toEqual([]);
    });

    it("should handle stock items with no matching branch stock", async () => {
      const useCase = new GetBranchStockItemsUseCase(
        mockBranchStockRepository,
        mockStockItemRepository
      );

      const branchStocks: BranchStock[] = [
        {
          id: "branch-stock-1",
          tenantId: "tenant-1",
          branchId: "branch-1",
          stockItemId: "stock-999", // Non-existent stock item
          minThreshold: 10,
          createdBy: "user-1",
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      mockBranchStockRepository.findByBranch.mockResolvedValue(branchStocks);
      mockStockItemRepository.findByTenant.mockResolvedValue([]);

      const result = await useCase.execute({
        tenantId: "tenant-1",
        branchId: "branch-1",
      });

      // Should skip items not found in stockItemMap
      expect(result).toEqual([]);
    });
  });
});
