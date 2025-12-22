import { describe, it, expect, jest, beforeEach } from "@jest/globals";
import { CreateStockItemUseCase } from "../../app/stockitem-usecase/create-stock-item.use-case.js";
import { UpdateStockItemUseCase } from "../../app/stockitem-usecase/update-stock-item.use-case.js";
import { GetStockItemsUseCase } from "../../app/stockitem-usecase/get-stock-items.use-case.js";
import type { StockItemRepository } from "../../domain/repositories.js";
import type { StockItem } from "../../domain/entities.js";

describe("Stock Item Use Cases", () => {
  let mockRepo: jest.Mocked<StockItemRepository>;
  let mockTenantLimits: any;
  let mockEventBus: any;
  let mockTxManager: any;
  let mockImageStorage: any;
  let mockAuditWriter: any;

  beforeEach(() => {
    mockRepo = {
      save: jest.fn(),
      update: jest.fn(),
      findById: jest.fn(),
      findByTenant: jest.fn(),
      findByTenantAndActive: jest.fn(),
      countByTenant: jest.fn(),
    } as any;

    mockTenantLimits = {
      getStockItemLimits: jest.fn().mockResolvedValue({
        maxStockItemsSoft: 50,
        maxStockItemsHard: 75,
      }),
    };

    mockEventBus = {
      publishViaOutbox: jest.fn(),
    };

    mockTxManager = {
      withTransaction: jest.fn((fn: (tx: any) => any) => fn({})),
    };

    mockImageStorage = {
      uploadImage: jest.fn(),
      isValidImageUrl: jest.fn(() => true),
    };

    mockAuditWriter = {
      write: jest.fn(),
    };
  });

  describe("CreateStockItemUseCase", () => {
    it("should create a stock item successfully", async () => {
      const useCase = new CreateStockItemUseCase(
        mockRepo,
        mockTenantLimits,
        mockEventBus,
        mockTxManager,
        mockImageStorage,
        mockAuditWriter
      );

      const mockStockItem: StockItem = {
        id: "stock-item-123",
        tenantId: "tenant-1",
        name: "Premium Flour",
        unitText: "kg",
        barcode: "FLOUR001",
        isIngredient: true,
        isSellable: false,
        isActive: true,
        createdBy: "user-1",
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockRepo.save.mockResolvedValue(mockStockItem);
      mockRepo.countByTenant.mockResolvedValue(0);

      const result = await useCase.execute({
        tenantId: "tenant-1",
        userId: "user-1",
        name: "Premium Flour",
        unitText: "kg",
        barcode: "FLOUR001",
        isIngredient: true,
        isSellable: false,
        isActive: true,
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.name).toBe("Premium Flour");
        expect(result.value.unitText).toBe("kg");
      }
      expect(mockRepo.save).toHaveBeenCalledTimes(1);
      expect(mockEventBus.publishViaOutbox).toHaveBeenCalledTimes(1);
    });

    it("should fail if name is empty", async () => {
      const useCase = new CreateStockItemUseCase(
        mockRepo,
        mockTenantLimits,
        mockEventBus,
        mockTxManager,
        mockImageStorage,
        mockAuditWriter
      );

      const result = await useCase.execute({
        tenantId: "tenant-1",
        userId: "user-1",
        name: "",
        unitText: "kg",
        isIngredient: true,
        isSellable: false,
        isActive: true,
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toContain("Stock item name is required");
      }
      expect(mockRepo.save).not.toHaveBeenCalled();
    });

    it("should fail if unitText is empty", async () => {
      const useCase = new CreateStockItemUseCase(
        mockRepo,
        mockTenantLimits,
        mockEventBus,
        mockTxManager,
        mockImageStorage,
        mockAuditWriter
      );

      const result = await useCase.execute({
        tenantId: "tenant-1",
        userId: "user-1",
        name: "Flour",
        unitText: "",
        isIngredient: true,
        isSellable: false,
        isActive: true,
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toContain("Unit text is required");
      }
    });
  });

  describe("UpdateStockItemUseCase", () => {
    it("should update a stock item successfully", async () => {
      const useCase = new UpdateStockItemUseCase(
        mockRepo,
        mockTenantLimits,
        mockEventBus,
        mockTxManager,
        mockImageStorage,
        mockAuditWriter
      );

      const existingItem: StockItem = {
        id: "stock-item-123",
        tenantId: "tenant-1",
        name: "Premium Flour",
        unitText: "kg",
        isIngredient: true,
        isSellable: false,
        isActive: true,
        createdBy: "user-1",
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const updatedItem = { ...existingItem, name: "Super Premium Flour" };

      mockRepo.findById.mockResolvedValue(existingItem);
      mockRepo.update.mockResolvedValue(updatedItem);

      const result = await useCase.execute("stock-item-123", "user-1", {
        name: "Super Premium Flour",
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.name).toBe("Super Premium Flour");
      }
      expect(mockEventBus.publishViaOutbox).toHaveBeenCalled();
    });

    it("should fail if stock item not found", async () => {
      const useCase = new UpdateStockItemUseCase(
        mockRepo,
        mockTenantLimits,
        mockEventBus,
        mockTxManager,
        mockImageStorage,
        mockAuditWriter
      );

      mockRepo.findById.mockResolvedValue(null);

      const result = await useCase.execute("nonexistent-id", "user-1", {
        name: "New Name",
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBe("Stock item not found");
      }
    });
  });

  describe("GetStockItemsUseCase", () => {
    it("should return all stock items for tenant", async () => {
      const useCase = new GetStockItemsUseCase(mockRepo);

      const mockItems: StockItem[] = [
        {
          id: "item-1",
          tenantId: "tenant-1",
          name: "Flour",
          unitText: "kg",
          isIngredient: true,
          isSellable: false,
          isActive: true,
          createdBy: "user-1",
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: "item-2",
          tenantId: "tenant-1",
          name: "Sugar",
          unitText: "kg",
          isIngredient: true,
          isSellable: false,
          isActive: true,
          createdBy: "user-1",
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      mockRepo.findByTenantAndActive.mockResolvedValue(mockItems);

      const result = await useCase.execute({ tenantId: "tenant-1" });

      expect(result.items.length).toBe(2);
      expect(result.items[0].name).toBe("Flour");
    });

    it("should filter by search query", async () => {
      const useCase = new GetStockItemsUseCase(mockRepo);

      mockRepo.findByTenantAndActive.mockResolvedValue([]);

      const result = await useCase.execute({
        tenantId: "tenant-1",
        q: "flour",
      });

      expect(mockRepo.findByTenantAndActive).toHaveBeenCalledWith(
        "tenant-1",
        undefined
      );
      expect(result.items.length).toBe(0);
    });

    it("should filter by isActive status", async () => {
      const useCase = new GetStockItemsUseCase(mockRepo);

      mockRepo.findByTenantAndActive.mockResolvedValue([]);

      const result = await useCase.execute({
        tenantId: "tenant-1",
        isActive: true,
      });

      expect(mockRepo.findByTenantAndActive).toHaveBeenCalledWith(
        "tenant-1",
        true
      );
      expect(result.items.length).toBe(0);
    });
  });
});
