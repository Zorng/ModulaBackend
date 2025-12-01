import { describe, it, expect, jest, beforeEach } from "@jest/globals";
import { SaleFinalizedHandler } from "../../app/event-handlers/sale-finalized.handler.js";
import { SaleVoidedHandler } from "../../app/event-handlers/sale-voided.handler.js";
import type {
  SaleFinalizedV1,
  SaleVoidedV1,
} from "../../../../shared/events.js";

describe("Inventory Event Handlers", () => {
  let mockGetPolicyUseCase: any;
  let mockGetMenuStockMapUseCase: any;
  let mockRecordSaleDeductionsUseCase: any;
  let mockRecordVoidUseCase: any;

  beforeEach(() => {
    mockGetPolicyUseCase = {
      executeWithDefault: jest.fn(),
    };

    mockGetMenuStockMapUseCase = {
      execute: jest.fn(),
    };

    mockRecordSaleDeductionsUseCase = {
      execute: jest.fn(),
    };

    mockRecordVoidUseCase = {
      execute: jest.fn(),
    };
  });

  describe("SaleFinalizedHandler", () => {
    it("should deduct inventory when policy allows", async () => {
      const handler = new SaleFinalizedHandler(
        mockGetPolicyUseCase,
        mockGetMenuStockMapUseCase,
        mockRecordSaleDeductionsUseCase
      );

      // Mock policy that allows deduction
      mockGetPolicyUseCase.executeWithDefault.mockResolvedValue({
        ok: true,
        value: {
          inventorySubtractOnFinalize: true,
          branchOverrides: {},
          excludeMenuItemIds: [],
        },
      });

      // Mock menu stock mapping
      mockGetMenuStockMapUseCase.execute.mockResolvedValue({
        ok: true,
        value: [
          {
            id: "map-1",
            tenantId: "tenant-1",
            menuItemId: "menu-pizza",
            stockItemId: "stock-flour",
            qtyPerSale: 0.5,
            createdBy: "user-1",
            createdAt: new Date(),
          },
        ],
      });

      // Mock successful deduction
      mockRecordSaleDeductionsUseCase.execute.mockResolvedValue({
        ok: true,
        value: [
          {
            id: "journal-1",
            tenantId: "tenant-1",
            branchId: "branch-1",
            stockItemId: "stock-flour",
            delta: -0.5,
            balanceAfter: 99.5,
            reason: "sale",
            refSaleId: "sale-123",
            actorId: null,
            occurredAt: new Date(),
          },
        ],
      });

      const event: SaleFinalizedV1 = {
        type: "sales.sale_finalized",
        v: 1,
        tenantId: "tenant-1",
        branchId: "branch-1",
        saleId: "sale-123",
        lines: [{ menuItemId: "menu-pizza", qty: 1 }],
        totals: {
          subtotalUsd: 10,
          totalUsd: 10,
          totalKhr: 41000,
          vatAmountUsd: 0,
        },
        tenders: [{ method: "CASH", amountUsd: 10, amountKhr: 41000 }],
        finalizedAt: new Date().toISOString(),
        actorId: "user-1",
      };

      await handler.handle(event);

      expect(mockGetPolicyUseCase.executeWithDefault).toHaveBeenCalledWith(
        "tenant-1",
        "system"
      );
      expect(mockGetMenuStockMapUseCase.execute).toHaveBeenCalledWith(
        "menu-pizza"
      );
      expect(mockRecordSaleDeductionsUseCase.execute).toHaveBeenCalledWith({
        tenantId: "tenant-1",
        branchId: "branch-1",
        refSaleId: "sale-123",
        lines: [{ stockItemId: "stock-flour", qtyDeducted: 0.5 }],
      });
    });

    it("should skip deduction when policy blocks", async () => {
      const handler = new SaleFinalizedHandler(
        mockGetPolicyUseCase,
        mockGetMenuStockMapUseCase,
        mockRecordSaleDeductionsUseCase
      );

      // Mock policy that blocks deduction
      mockGetPolicyUseCase.executeWithDefault.mockResolvedValue({
        ok: true,
        value: {
          inventorySubtractOnFinalize: false,
          branchOverrides: {},
          excludeMenuItemIds: [],
        },
      });

      const event: SaleFinalizedV1 = {
        type: "sales.sale_finalized",
        v: 1,
        tenantId: "tenant-1",
        branchId: "branch-1",
        saleId: "sale-123",
        lines: [{ menuItemId: "menu-pizza", qty: 1 }],
        totals: {
          subtotalUsd: 10,
          totalUsd: 10,
          totalKhr: 41000,
          vatAmountUsd: 0,
        },
        tenders: [{ method: "CASH", amountUsd: 10, amountKhr: 41000 }],
        finalizedAt: new Date().toISOString(),
        actorId: "user-1",
      };

      await handler.handle(event);

      expect(mockGetPolicyUseCase.executeWithDefault).toHaveBeenCalled();
      expect(mockGetMenuStockMapUseCase.execute).not.toHaveBeenCalled();
      expect(mockRecordSaleDeductionsUseCase.execute).not.toHaveBeenCalled();
    });

    it("should skip excluded menu items", async () => {
      const handler = new SaleFinalizedHandler(
        mockGetPolicyUseCase,
        mockGetMenuStockMapUseCase,
        mockRecordSaleDeductionsUseCase
      );

      // Mock policy with excluded items
      mockGetPolicyUseCase.executeWithDefault.mockResolvedValue({
        ok: true,
        value: {
          inventorySubtractOnFinalize: true,
          branchOverrides: {},
          excludeMenuItemIds: ["menu-service-fee"],
        },
      });

      const event: SaleFinalizedV1 = {
        type: "sales.sale_finalized",
        v: 1,
        tenantId: "tenant-1",
        branchId: "branch-1",
        saleId: "sale-123",
        lines: [{ menuItemId: "menu-service-fee", qty: 1 }],
        totals: {
          subtotalUsd: 2,
          totalUsd: 2,
          totalKhr: 8200,
          vatAmountUsd: 0,
        },
        tenders: [{ method: "CASH", amountUsd: 2, amountKhr: 8200 }],
        finalizedAt: new Date().toISOString(),
        actorId: "user-1",
      };

      await handler.handle(event);

      expect(mockGetMenuStockMapUseCase.execute).not.toHaveBeenCalled();
      expect(mockRecordSaleDeductionsUseCase.execute).not.toHaveBeenCalled();
    });

    it("should use branch override when configured", async () => {
      const handler = new SaleFinalizedHandler(
        mockGetPolicyUseCase,
        mockGetMenuStockMapUseCase,
        mockRecordSaleDeductionsUseCase
      );

      // Mock policy with branch override
      mockGetPolicyUseCase.executeWithDefault.mockResolvedValue({
        ok: true,
        value: {
          inventorySubtractOnFinalize: true, // Default is true
          branchOverrides: {
            "branch-1": { inventorySubtractOnFinalize: false }, // Override for this branch
          },
          excludeMenuItemIds: [],
        },
      });

      const event: SaleFinalizedV1 = {
        type: "sales.sale_finalized",
        v: 1,
        tenantId: "tenant-1",
        branchId: "branch-1",
        saleId: "sale-123",
        lines: [{ menuItemId: "menu-pizza", qty: 1 }],
        totals: {
          subtotalUsd: 10,
          totalUsd: 10,
          totalKhr: 41000,
          vatAmountUsd: 0,
        },
        tenders: [{ method: "CASH", amountUsd: 10, amountKhr: 41000 }],
        finalizedAt: new Date().toISOString(),
        actorId: "user-1",
      };

      await handler.handle(event);

      expect(mockGetMenuStockMapUseCase.execute).not.toHaveBeenCalled();
      expect(mockRecordSaleDeductionsUseCase.execute).not.toHaveBeenCalled();
    });

    it("should handle missing stock mappings gracefully", async () => {
      const handler = new SaleFinalizedHandler(
        mockGetPolicyUseCase,
        mockGetMenuStockMapUseCase,
        mockRecordSaleDeductionsUseCase
      );

      mockGetPolicyUseCase.executeWithDefault.mockResolvedValue({
        ok: true,
        value: {
          inventorySubtractOnFinalize: true,
          branchOverrides: {},
          excludeMenuItemIds: [],
        },
      });

      // Mock no stock mappings found
      mockGetMenuStockMapUseCase.execute.mockResolvedValue({
        ok: true,
        value: [],
      });

      const event: SaleFinalizedV1 = {
        type: "sales.sale_finalized",
        v: 1,
        tenantId: "tenant-1",
        branchId: "branch-1",
        saleId: "sale-123",
        lines: [{ menuItemId: "menu-pizza", qty: 1 }],
        totals: {
          subtotalUsd: 10,
          totalUsd: 10,
          totalKhr: 41000,
          vatAmountUsd: 0,
        },
        tenders: [{ method: "CASH", amountUsd: 10, amountKhr: 41000 }],
        finalizedAt: new Date().toISOString(),
        actorId: "user-1",
      };

      await handler.handle(event);

      expect(mockGetMenuStockMapUseCase.execute).toHaveBeenCalled();
      expect(mockRecordSaleDeductionsUseCase.execute).not.toHaveBeenCalled();
    });
  });

  describe("SaleVoidedHandler", () => {
    it("should restore inventory when sale voided", async () => {
      const handler = new SaleVoidedHandler(
        mockGetMenuStockMapUseCase,
        mockRecordVoidUseCase
      );

      // Mock menu stock mapping
      mockGetMenuStockMapUseCase.execute.mockResolvedValue({
        ok: true,
        value: [
          {
            id: "map-1",
            tenantId: "tenant-1",
            menuItemId: "menu-pizza",
            stockItemId: "stock-flour",
            qtyPerSale: 0.5,
            createdBy: "user-1",
            createdAt: new Date(),
          },
        ],
      });

      // Mock successful reversal
      mockRecordVoidUseCase.execute.mockResolvedValue({
        ok: true,
        value: [
          {
            id: "journal-2",
            tenantId: "tenant-1",
            branchId: "branch-1",
            stockItemId: "stock-flour",
            delta: 0.5,
            balanceAfter: 100,
            reason: "void",
            refSaleId: "sale-123",
            actorId: null,
            occurredAt: new Date(),
          },
        ],
      });

      const event: SaleVoidedV1 = {
        type: "sales.sale_voided",
        v: 1,
        tenantId: "tenant-1",
        branchId: "branch-1",
        saleId: "sale-123",
        lines: [{ menuItemId: "menu-pizza", qty: 1 }],
        actorId: "user-1",
        reason: "Customer cancelled",
        timestamp: new Date().toISOString(),
      };

      await handler.handle(event);

      expect(mockGetMenuStockMapUseCase.execute).toHaveBeenCalledWith(
        "menu-pizza"
      );
      expect(mockRecordVoidUseCase.execute).toHaveBeenCalledWith({
        tenantId: "tenant-1",
        branchId: "branch-1",
        refSaleId: "sale-123",
        originalLines: [
          { stockItemId: "stock-flour", qtyOriginallyDeducted: 0.5 },
        ],
      });
    });

    it("should handle multiple line items", async () => {
      const handler = new SaleVoidedHandler(
        mockGetMenuStockMapUseCase,
        mockRecordVoidUseCase
      );

      // Mock different mappings for different items
      mockGetMenuStockMapUseCase.execute
        .mockResolvedValueOnce({
          ok: true,
          value: [
            {
              id: "map-1",
              tenantId: "tenant-1",
              menuItemId: "menu-pizza",
              stockItemId: "stock-flour",
              qtyPerSale: 0.5,
              createdBy: "user-1",
              createdAt: new Date(),
            },
          ],
        })
        .mockResolvedValueOnce({
          ok: true,
          value: [
            {
              id: "map-2",
              tenantId: "tenant-1",
              menuItemId: "menu-burger",
              stockItemId: "stock-beef",
              qtyPerSale: 0.3,
              createdBy: "user-1",
              createdAt: new Date(),
            },
          ],
        });

      mockRecordVoidUseCase.execute.mockResolvedValue({
        ok: true,
        value: [],
      });

      const event: SaleVoidedV1 = {
        type: "sales.sale_voided",
        v: 1,
        tenantId: "tenant-1",
        branchId: "branch-1",
        saleId: "sale-123",
        lines: [
          { menuItemId: "menu-pizza", qty: 2 },
          { menuItemId: "menu-burger", qty: 1 },
        ],
        actorId: "user-1",
        reason: "Customer cancelled",
        timestamp: new Date().toISOString(),
      };

      await handler.handle(event);

      expect(mockRecordVoidUseCase.execute).toHaveBeenCalledWith({
        tenantId: "tenant-1",
        branchId: "branch-1",
        refSaleId: "sale-123",
        originalLines: [
          { stockItemId: "stock-flour", qtyOriginallyDeducted: 1.0 }, // 0.5 * 2
          { stockItemId: "stock-beef", qtyOriginallyDeducted: 0.3 }, // 0.3 * 1
        ],
      });
    });
  });
});
