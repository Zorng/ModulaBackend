import { describe, it, expect, jest, beforeEach } from "@jest/globals";
import {
  GetTenantPoliciesUseCase,
  GetSalesPoliciesUseCase,
  GetInventoryPoliciesUseCase,
  GetCashSessionPoliciesUseCase,
  GetAttendancePoliciesUseCase,
  UpdateTenantPoliciesUseCase,
} from "../app/use-cases.js";
import { IPolicyRepository } from "../infra/repository.js";
import { Ok, Err } from "../../../shared/result.js";
import {
  SalesPolicies,
  InventoryPolicies,
  CashSessionPolicies,
  AttendancePolicies,
  TenantPolicies,
} from "../domain/entities.js";
import { UpdateTenantPoliciesInput } from "../api/schemas.js";

describe("Policy Use Cases", () => {
  let mockPolicyRepository: jest.Mocked<IPolicyRepository>;

  beforeEach(() => {
    mockPolicyRepository = {
      getTenantPolicies: jest.fn(),
      getSalesPolicies: jest.fn(),
      getInventoryPolicies: jest.fn(),
      getCashSessionPolicies: jest.fn(),
      getAttendancePolicies: jest.fn(),
      updateTenantPolicies: jest.fn(),
      ensureDefaultPolicies: jest.fn(),
    };
  });

  describe("GetTenantPoliciesUseCase", () => {
    it("should return tenant policies when they exist", async () => {
      const useCase = new GetTenantPoliciesUseCase(mockPolicyRepository);
      const tenantId = "test-tenant-id";

      const mockPolicies: TenantPolicies = {
        tenantId,
        // Sales
        saleVatEnabled: false,
        saleVatRatePercent: 10.0,
        saleFxRateKhrPerUsd: 4100,
        saleKhrRoundingMode: "NEAREST",
        // Inventory
        inventoryAutoSubtractOnSale: true,
        inventoryExpiryTrackingEnabled: false,
        // Cash
        cashRequireSessionForSales: true,
        cashAllowPaidOut: true,
        cashRequireRefundApproval: false,
        cashAllowManualAdjustment: false,
        // Attendance
        attendanceAutoFromCashSession: false,
        attendanceRequireOutOfShiftApproval: false,
        attendanceEarlyCheckinBufferEnabled: false,
        attendanceCheckinBufferMinutes: 15,
        attendanceAllowManagerEdits: false,
        // Timestamps
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockPolicyRepository.getTenantPolicies.mockResolvedValue(mockPolicies);

      const result = await useCase.execute({ tenantId });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toEqual(mockPolicies);
      }
      expect(mockPolicyRepository.getTenantPolicies).toHaveBeenCalledWith(tenantId);
    });

    it("should ensure default policies when they don't exist", async () => {
      const useCase = new GetTenantPoliciesUseCase(mockPolicyRepository);
      const tenantId = "test-tenant-id";

      const defaultPolicies: TenantPolicies = {
        tenantId,
        saleVatEnabled: false,
        saleVatRatePercent: 10.0,
        saleFxRateKhrPerUsd: 4100,
        saleKhrRoundingMode: "NEAREST",
        inventoryAutoSubtractOnSale: true,
        inventoryExpiryTrackingEnabled: false,
        cashRequireSessionForSales: true,
        cashAllowPaidOut: true,
        cashRequireRefundApproval: false,
        cashAllowManualAdjustment: false,
        attendanceAutoFromCashSession: false,
        attendanceRequireOutOfShiftApproval: false,
        attendanceEarlyCheckinBufferEnabled: false,
        attendanceCheckinBufferMinutes: 15,
        attendanceAllowManagerEdits: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockPolicyRepository.getTenantPolicies.mockResolvedValue(null);
      mockPolicyRepository.ensureDefaultPolicies.mockResolvedValue(defaultPolicies);

      const result = await useCase.execute({ tenantId });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toEqual(defaultPolicies);
      }
      expect(mockPolicyRepository.ensureDefaultPolicies).toHaveBeenCalledWith(tenantId);
    });
  });

  describe("GetSalesPoliciesUseCase", () => {
    it("should return sales policies when they exist", async () => {
      const useCase = new GetSalesPoliciesUseCase(mockPolicyRepository);
      const tenantId = "test-tenant-id";

      const mockSalesPolicies: SalesPolicies = {
        tenantId,
        vatEnabled: true,
        vatRatePercent: 10,
        fxRateKhrPerUsd: 4100,
        khrRoundingMode: "NEAREST",
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockPolicyRepository.getSalesPolicies.mockResolvedValue(mockSalesPolicies);

      const result = await useCase.execute({ tenantId });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toEqual(mockSalesPolicies);
      }
    });
  });

  describe("GetInventoryPoliciesUseCase", () => {
    it("should return inventory policies when they exist", async () => {
      const useCase = new GetInventoryPoliciesUseCase(mockPolicyRepository);
      const tenantId = "test-tenant-id";

      const mockInventoryPolicies: InventoryPolicies = {
        tenantId,
        autoSubtractOnSale: true,
        expiryTrackingEnabled: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockPolicyRepository.getInventoryPolicies.mockResolvedValue(
        mockInventoryPolicies
      );

      const result = await useCase.execute({ tenantId });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toEqual(mockInventoryPolicies);
      }
    });
  });

  describe("UpdateTenantPoliciesUseCase", () => {
    it("should update policies successfully", async () => {
      const useCase = new UpdateTenantPoliciesUseCase(mockPolicyRepository);
      const tenantId = "test-tenant-id";
      const updates: UpdateTenantPoliciesInput = {
        saleVatEnabled: true,
        saleVatRatePercent: 15.0,
      };

      const existingPolicies: TenantPolicies = {
        tenantId,
        saleVatEnabled: false,
        saleVatRatePercent: 10.0,
        saleFxRateKhrPerUsd: 4100,
        saleKhrRoundingMode: "NEAREST",
        inventoryAutoSubtractOnSale: true,
        inventoryExpiryTrackingEnabled: false,
        cashRequireSessionForSales: true,
        cashAllowPaidOut: true,
        cashRequireRefundApproval: false,
        cashAllowManualAdjustment: false,
        attendanceAutoFromCashSession: false,
        attendanceRequireOutOfShiftApproval: false,
        attendanceEarlyCheckinBufferEnabled: false,
        attendanceCheckinBufferMinutes: 15,
        attendanceAllowManagerEdits: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const updatedPolicies: TenantPolicies = {
        ...existingPolicies,
        saleVatEnabled: true,
        saleVatRatePercent: 15.0,
      };

      mockPolicyRepository.getTenantPolicies.mockResolvedValue(existingPolicies);
      mockPolicyRepository.updateTenantPolicies.mockResolvedValue(updatedPolicies);

      const result = await useCase.execute(tenantId, updates);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toEqual(updatedPolicies);
      }
      expect(mockPolicyRepository.updateTenantPolicies).toHaveBeenCalledWith(
        tenantId,
        updates
      );
    });

    it("should ensure default policies before updating if they don't exist", async () => {
      const useCase = new UpdateTenantPoliciesUseCase(mockPolicyRepository);
      const tenantId = "test-tenant-id";
      const updates: UpdateTenantPoliciesInput = {
        saleVatEnabled: true,
      };

      const defaultPolicies: TenantPolicies = {
        tenantId,
        saleVatEnabled: false,
        saleVatRatePercent: 10.0,
        saleFxRateKhrPerUsd: 4100,
        saleKhrRoundingMode: "NEAREST",
        inventoryAutoSubtractOnSale: true,
        inventoryExpiryTrackingEnabled: false,
        cashRequireSessionForSales: true,
        cashAllowPaidOut: true,
        cashRequireRefundApproval: false,
        cashAllowManualAdjustment: false,
        attendanceAutoFromCashSession: false,
        attendanceRequireOutOfShiftApproval: false,
        attendanceEarlyCheckinBufferEnabled: false,
        attendanceCheckinBufferMinutes: 15,
        attendanceAllowManagerEdits: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const updatedPolicies: TenantPolicies = {
        ...defaultPolicies,
        saleVatEnabled: true,
      };

      mockPolicyRepository.getTenantPolicies.mockResolvedValue(null);
      mockPolicyRepository.ensureDefaultPolicies.mockResolvedValue(defaultPolicies);
      mockPolicyRepository.updateTenantPolicies.mockResolvedValue(updatedPolicies);

      const result = await useCase.execute(tenantId, updates);

      expect(result.ok).toBe(true);
      expect(mockPolicyRepository.ensureDefaultPolicies).toHaveBeenCalledWith(tenantId);
      expect(mockPolicyRepository.updateTenantPolicies).toHaveBeenCalledWith(
        tenantId,
        updates
      );
    });
  });
});
