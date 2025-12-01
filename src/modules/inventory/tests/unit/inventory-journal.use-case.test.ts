import { describe, it, expect, jest, beforeEach } from "@jest/globals";
import { ReceiveStockUseCase } from "../../app/inventoryjournal-usecase/receive-stock.use-case.js";
import { WasteStockUseCase } from "../../app/inventoryjournal-usecase/waste-stock.use-case.js";
import { CorrectStockUseCase } from "../../app/inventoryjournal-usecase/correct-stock.use-case.js";
import { RecordSaleDeductionsUseCase } from "../../app/inventoryjournal-usecase/record-sale-deductions.use-case.js";
import type {
  InventoryJournalRepository,
  StockItemRepository,
  BranchStockRepository,
} from "../../domain/repositories.js";

describe("Inventory Journal Use Cases", () => {
  let mockJournalRepo: jest.Mocked<InventoryJournalRepository>;
  let mockStockItemRepo: jest.Mocked<StockItemRepository>;
  let mockBranchStockRepo: jest.Mocked<BranchStockRepository>;
  let mockEventBus: any;
  let mockTxManager: any;

  beforeEach(() => {
    mockJournalRepo = {
      save: jest.fn(),
      findByBranch: jest.fn(),
      getOnHandByBranch: jest.fn(),
    } as any;

    mockStockItemRepo = {
      findById: jest.fn(),
    } as any;

    mockBranchStockRepo = {
      findByBranchAndItem: jest.fn(),
    } as any;

    mockEventBus = {
      publishViaOutbox: jest.fn(),
    };

    mockTxManager = {
      withTransaction: jest.fn((fn: (tx: any) => any) => fn({})),
    };
  });

  describe("ReceiveStockUseCase", () => {
    it("should record stock receipt successfully", async () => {
      const useCase = new ReceiveStockUseCase(
        mockJournalRepo,
        mockStockItemRepo,
        mockBranchStockRepo,
        mockEventBus,
        mockTxManager
      );

      mockStockItemRepo.findById.mockResolvedValue({
        id: "stock-item-1",
        tenantId: "tenant-1",
        name: "Flour",
        unitText: "kg",
        isActive: true,
        createdBy: "user-1",
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      mockBranchStockRepo.findByBranchAndItem.mockResolvedValue({
        id: "branch-stock-1",
        tenantId: "tenant-1",
        branchId: "branch-1",
        stockItemId: "stock-item-1",
        minThreshold: 10,
        createdBy: "user-1",
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      mockJournalRepo.save.mockResolvedValue({
        id: "journal-1",
        tenantId: "tenant-1",
        branchId: "branch-1",
        stockItemId: "stock-item-1",
        delta: 50,
        reason: "receive",
        note: "Weekly delivery",
        refSaleId: undefined,
        actorId: "user-1",
        createdBy: "user-1",
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const result = await useCase.execute({
        tenantId: "tenant-1",
        branchId: "branch-1",
        stockItemId: "stock-item-1",
        qty: 50,
        note: "Weekly delivery",
        actorId: "user-1",
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.delta).toBe(50);
        expect(result.value.reason).toBe("receive");
      }
      expect(mockEventBus.publishViaOutbox).toHaveBeenCalled();
    });

    it("should fail if quantity is not positive", async () => {
      const useCase = new ReceiveStockUseCase(
        mockJournalRepo,
        mockStockItemRepo,
        mockBranchStockRepo,
        mockEventBus,
        mockTxManager
      );

      const result = await useCase.execute({
        tenantId: "tenant-1",
        branchId: "branch-1",
        stockItemId: "stock-item-1",
        qty: -10,
        note: "Test",
        actorId: "user-1",
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toContain("must be positive");
      }
    });

    it("should fail if stock item not assigned to branch", async () => {
      const useCase = new ReceiveStockUseCase(
        mockJournalRepo,
        mockStockItemRepo,
        mockBranchStockRepo,
        mockEventBus,
        mockTxManager
      );

      mockStockItemRepo.findById.mockResolvedValue({
        id: "stock-item-1",
        tenantId: "tenant-1",
        name: "Flour",
        unitText: "kg",
        isActive: true,
        createdBy: "user-1",
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      mockBranchStockRepo.findByBranchAndItem.mockResolvedValue(null);

      const result = await useCase.execute({
        tenantId: "tenant-1",
        branchId: "branch-1",
        stockItemId: "stock-item-1",
        qty: 50,
        note: "Test",
        actorId: "user-1",
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toContain("not assigned to this branch");
      }
    });
  });

  describe("WasteStockUseCase", () => {
    it("should record stock waste successfully", async () => {
      const useCase = new WasteStockUseCase(
        mockJournalRepo,
        mockBranchStockRepo,
        mockEventBus,
        mockTxManager
      );

      mockBranchStockRepo.findByBranchAndItem.mockResolvedValue({
        id: "branch-stock-1",
        tenantId: "tenant-1",
        branchId: "branch-1",
        stockItemId: "stock-item-1",
        minThreshold: 10,
        createdBy: "user-1",
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      mockJournalRepo.save.mockResolvedValue({
        id: "journal-2",
        tenantId: "tenant-1",
        branchId: "branch-1",
        stockItemId: "stock-item-1",
        delta: -5,
        reason: "waste",
        note: "Expired batch",
        refSaleId: undefined,
        actorId: "user-1",
        createdBy: "user-1",
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const result = await useCase.execute({
        tenantId: "tenant-1",
        branchId: "branch-1",
        stockItemId: "stock-item-1",
        qty: 5,
        note: "Expired batch",
        actorId: "user-1",
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.delta).toBe(-5);
        expect(result.value.reason).toBe("waste");
      }
    });

    it("should fail if note is empty", async () => {
      const useCase = new WasteStockUseCase(
        mockJournalRepo,
        mockBranchStockRepo,
        mockEventBus,
        mockTxManager
      );

      const result = await useCase.execute({
        tenantId: "tenant-1",
        branchId: "branch-1",
        stockItemId: "stock-item-1",
        qty: 5,
        note: "",
        actorId: "user-1",
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toContain("Note is required for waste");
      }
    });
  });

  describe("CorrectStockUseCase", () => {
    it("should record positive correction successfully", async () => {
      const useCase = new CorrectStockUseCase(
        mockJournalRepo,
        mockBranchStockRepo,
        mockEventBus,
        mockTxManager
      );

      mockBranchStockRepo.findByBranchAndItem.mockResolvedValue({
        id: "branch-stock-1",
        tenantId: "tenant-1",
        branchId: "branch-1",
        stockItemId: "stock-item-1",
        minThreshold: 10,
        createdBy: "user-1",
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      mockJournalRepo.save.mockResolvedValue({
        id: "journal-3",
        tenantId: "tenant-1",
        branchId: "branch-1",
        stockItemId: "stock-item-1",
        delta: 3,
        reason: "correction",
        note: "Physical count adjustment",
        refSaleId: undefined,
        actorId: "user-1",
        createdBy: "user-1",
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const result = await useCase.execute({
        tenantId: "tenant-1",
        branchId: "branch-1",
        stockItemId: "stock-item-1",
        delta: 3,
        note: "Physical count adjustment",
        actorId: "user-1",
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.delta).toBe(3);
        expect(result.value.reason).toBe("correction");
      }
    });

    it("should record negative correction successfully", async () => {
      const useCase = new CorrectStockUseCase(
        mockJournalRepo,
        mockBranchStockRepo,
        mockEventBus,
        mockTxManager
      );

      mockBranchStockRepo.findByBranchAndItem.mockResolvedValue({
        id: "branch-stock-1",
        tenantId: "tenant-1",
        branchId: "branch-1",
        stockItemId: "stock-item-1",
        minThreshold: 10,
        createdBy: "user-1",
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      mockJournalRepo.save.mockResolvedValue({
        id: "journal-4",
        tenantId: "tenant-1",
        branchId: "branch-1",
        stockItemId: "stock-item-1",
        delta: -2,
        reason: "correction",
        note: "Count discrepancy",
        refSaleId: undefined,
        actorId: "user-1",
        createdBy: "user-1",
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const result = await useCase.execute({
        tenantId: "tenant-1",
        branchId: "branch-1",
        stockItemId: "stock-item-1",
        delta: -2,
        note: "Count discrepancy",
        actorId: "user-1",
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.delta).toBe(-2);
      }
    });
  });

  describe("RecordSaleDeductionsUseCase", () => {
    it("should record sale deductions successfully", async () => {
      const useCase = new RecordSaleDeductionsUseCase(
        mockJournalRepo,
        mockEventBus,
        mockTxManager
      );

      mockJournalRepo.save.mockResolvedValue({
        id: "journal-5",
        tenantId: "tenant-1",
        branchId: "branch-1",
        stockItemId: "stock-item-1",
        delta: -0.5,
        reason: "sale",
        note: undefined,
        refSaleId: "sale-123",
        actorId: undefined,
        createdBy: undefined,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const result = await useCase.execute({
        tenantId: "tenant-1",
        branchId: "branch-1",
        refSaleId: "sale-123",
        lines: [{ stockItemId: "stock-item-1", qtyDeducted: 0.5 }],
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.length).toBe(1);
        expect(result.value[0].delta).toBe(-0.5);
        expect(result.value[0].refSaleId).toBe("sale-123");
      }
    });

    it("should fail if no lines provided", async () => {
      const useCase = new RecordSaleDeductionsUseCase(
        mockJournalRepo,
        mockEventBus,
        mockTxManager
      );

      const result = await useCase.execute({
        tenantId: "tenant-1",
        branchId: "branch-1",
        refSaleId: "sale-123",
        lines: [],
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toContain("at least one line");
      }
    });

    it("should fail if quantity is not positive", async () => {
      const useCase = new RecordSaleDeductionsUseCase(
        mockJournalRepo,
        mockEventBus,
        mockTxManager
      );

      const result = await useCase.execute({
        tenantId: "tenant-1",
        branchId: "branch-1",
        refSaleId: "sale-123",
        lines: [{ stockItemId: "stock-item-1", qtyDeducted: -1 }],
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toContain("must be positive");
      }
    });
  });
});
