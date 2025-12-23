import type { Response, NextFunction } from "express";
import type { AuthenticatedRequest } from "../../../../platform/security/auth.js";
import { PolicyFactory } from "../../domain/factory.js";
import type {
  UpdateTaxPoliciesInput,
  UpdateCurrencyPoliciesInput,
  UpdateRoundingPoliciesInput,
  UpdateInventoryPoliciesInput,
  UpdateCashSessionPoliciesInput,
  UpdateAttendancePoliciesInput,
} from "../schemas.js";

function resolveBranchIdFromQuery(req: AuthenticatedRequest): string | null {
  const queryBranchId =
    typeof req.query?.branchId === "string" ? req.query.branchId : undefined;
  return queryBranchId ?? req.user?.branchId ?? null;
}

function resolveBranchIdFromBody(req: AuthenticatedRequest): string | null {
  const bodyBranchId =
    typeof (req.body as any)?.branchId === "string"
      ? (req.body as any).branchId
      : undefined;
  return bodyBranchId ?? req.user?.branchId ?? null;
}

/**
 * Controller for policy-related operations
 */
export class PolicyController {
  /**
   * Get all tenant policies (combined view)
   */
  static async getTenantPolicies(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ) {
    try {
      const { tenantId } = req.user!;
      const branchId = resolveBranchIdFromQuery(req);

      if (!branchId) {
        return res.status(400).json({
          error: "Bad Request",
          message: "branchId is required",
        });
      }

      const { getTenantPoliciesUseCase } = PolicyFactory.build();
      const result = await getTenantPoliciesUseCase.execute({
        tenantId,
        branchId,
      });

      if (!result.ok) {
        return res.status(404).json({
          error: "Not Found",
          message: result.error,
        });
      }

      const { cashRequireSessionForSales: _cashGate, ...policies } =
        result.value;
      return res.status(200).json(policies);
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get sales policies (Tax & Currency)
   */
  static async getSalesPolicies(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ) {
    try {
      const { tenantId } = req.user!;
      const branchId = resolveBranchIdFromQuery(req);

      if (!branchId) {
        return res.status(400).json({
          error: "Bad Request",
          message: "branchId is required",
        });
      }

      const { getSalesPoliciesUseCase } = PolicyFactory.build();
      const result = await getSalesPoliciesUseCase.execute({
        tenantId,
        branchId,
      });

      if (!result.ok) {
        return res.status(404).json({
          error: "Not Found",
          message: result.error,
        });
      }

      const { requireSessionForSales: _cashGate, ...policies } = result.value;
      return res.status(200).json(policies);
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get inventory policies
   */
  static async getInventoryPolicies(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ) {
    try {
      const { tenantId } = req.user!;
      const branchId = resolveBranchIdFromQuery(req);

      if (!branchId) {
        return res.status(400).json({
          error: "Bad Request",
          message: "branchId is required",
        });
      }

      const { getInventoryPoliciesUseCase } = PolicyFactory.build();
      const result = await getInventoryPoliciesUseCase.execute({
        tenantId,
        branchId,
      });

      if (!result.ok) {
        return res.status(404).json({
          error: "Not Found",
          message: result.error,
        });
      }

      return res.status(200).json(result.value);
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get cash session policies
   */
  static async getCashSessionPolicies(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ) {
    try {
      const { tenantId } = req.user!;
      const branchId = resolveBranchIdFromQuery(req);

      if (!branchId) {
        return res.status(400).json({
          error: "Bad Request",
          message: "branchId is required",
        });
      }

      const { getCashSessionPoliciesUseCase } = PolicyFactory.build();
      const result = await getCashSessionPoliciesUseCase.execute({
        tenantId,
        branchId,
      });

      if (!result.ok) {
        return res.status(404).json({
          error: "Not Found",
          message: result.error,
        });
      }

      return res.status(200).json(result.value);
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get attendance policies
   */
  static async getAttendancePolicies(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ) {
    try {
      const { tenantId } = req.user!;
      const branchId = resolveBranchIdFromQuery(req);

      if (!branchId) {
        return res.status(400).json({
          error: "Bad Request",
          message: "branchId is required",
        });
      }

      const { getAttendancePoliciesUseCase } = PolicyFactory.build();
      const result = await getAttendancePoliciesUseCase.execute({
        tenantId,
        branchId,
      });

      if (!result.ok) {
        return res.status(404).json({
          error: "Not Found",
          message: result.error,
        });
      }

      return res.status(200).json(result.value);
    } catch (error) {
      next(error);
    }
  }

  /**
   * Update tax policies (VAT)
   */
  static async updateTaxPolicies(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ) {
    try {
      const { tenantId } = req.user!;
      const branchId = resolveBranchIdFromBody(req);
      const { branchId: _branchId, ...updates } =
        req.body as UpdateTaxPoliciesInput;

      if (!branchId) {
        return res.status(400).json({
          error: "Bad Request",
          message: "branchId is required",
        });
      }

      const { getSalesPoliciesUseCase, updateTenantPoliciesUseCase } =
        PolicyFactory.build();
      const existingResult = await getSalesPoliciesUseCase.execute({
        tenantId,
        branchId,
      });
      const before = existingResult.ok
        ? {
            vatEnabled: existingResult.value.vatEnabled,
            vatRatePercent: existingResult.value.vatRatePercent,
          }
        : null;
      const result = await updateTenantPoliciesUseCase.execute(
        tenantId,
        branchId,
        updates
      );

      if (!result.ok) {
        return res.status(400).json({
          error: "Bad Request",
          message: result.error,
        });
      }

      // Return only tax-related fields
      const { saleVatEnabled, saleVatRatePercent, updatedAt } = result.value;
      res.locals.policyAudit = {
        branchId,
        changes: updates,
        before,
        after: {
          vatEnabled: saleVatEnabled,
          vatRatePercent: saleVatRatePercent,
        },
      };
      return res.status(200).json({
        tenantId,
        branchId,
        vatEnabled: saleVatEnabled,
        vatRatePercent: saleVatRatePercent,
        updatedAt,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Update currency policies (FX rate)
   */
  static async updateCurrencyPolicies(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ) {
    try {
      const { tenantId } = req.user!;
      const branchId = resolveBranchIdFromBody(req);
      const { branchId: _branchId, ...updates } =
        req.body as UpdateCurrencyPoliciesInput;

      if (!branchId) {
        return res.status(400).json({
          error: "Bad Request",
          message: "branchId is required",
        });
      }

      const { getSalesPoliciesUseCase, updateTenantPoliciesUseCase } =
        PolicyFactory.build();
      const existingResult = await getSalesPoliciesUseCase.execute({
        tenantId,
        branchId,
      });
      const before = existingResult.ok
        ? {
            fxRateKhrPerUsd: existingResult.value.fxRateKhrPerUsd,
          }
        : null;
      const result = await updateTenantPoliciesUseCase.execute(
        tenantId,
        branchId,
        updates
      );

      if (!result.ok) {
        return res.status(400).json({
          error: "Bad Request",
          message: result.error,
        });
      }

      // Return only FX rate
      const { saleFxRateKhrPerUsd, updatedAt } = result.value;
      res.locals.policyAudit = {
        branchId,
        changes: updates,
        before,
        after: {
          fxRateKhrPerUsd: saleFxRateKhrPerUsd,
        },
      };
      return res.status(200).json({
        tenantId,
        branchId,
        fxRateKhrPerUsd: saleFxRateKhrPerUsd,
        updatedAt,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Update rounding policies
   */
  static async updateRoundingPolicies(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ) {
    try {
      const { tenantId } = req.user!;
      const branchId = resolveBranchIdFromBody(req);
      const { branchId: _branchId, ...updates } =
        req.body as UpdateRoundingPoliciesInput;

      if (!branchId) {
        return res.status(400).json({
          error: "Bad Request",
          message: "branchId is required",
        });
      }

      const { getSalesPoliciesUseCase, updateTenantPoliciesUseCase } =
        PolicyFactory.build();
      const existingResult = await getSalesPoliciesUseCase.execute({
        tenantId,
        branchId,
      });
      const before = existingResult.ok
        ? {
            khrRoundingEnabled: existingResult.value.khrRoundingEnabled,
            khrRoundingMode: existingResult.value.khrRoundingMode,
            khrRoundingGranularity: existingResult.value.khrRoundingGranularity,
          }
        : null;
      const result = await updateTenantPoliciesUseCase.execute(
        tenantId,
        branchId,
        updates
      );

      if (!result.ok) {
        return res.status(400).json({
          error: "Bad Request",
          message: result.error,
        });
      }

      // Return only rounding fields
      const {
        saleKhrRoundingEnabled,
        saleKhrRoundingMode,
        saleKhrRoundingGranularity,
        updatedAt,
      } = result.value;
      res.locals.policyAudit = {
        branchId,
        changes: updates,
        before,
        after: {
          khrRoundingEnabled: saleKhrRoundingEnabled,
          khrRoundingMode: saleKhrRoundingMode,
          khrRoundingGranularity: saleKhrRoundingGranularity,
        },
      };
      return res.status(200).json({
        tenantId,
        branchId,
        khrRoundingEnabled: saleKhrRoundingEnabled,
        khrRoundingMode: saleKhrRoundingMode,
        khrRoundingGranularity: saleKhrRoundingGranularity,
        updatedAt,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Update inventory policies
   */
  static async updateInventoryPolicies(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ) {
    try {
      const { tenantId } = req.user!;
      const branchId = resolveBranchIdFromBody(req);
      const { branchId: _branchId, ...updates } =
        req.body as UpdateInventoryPoliciesInput;

      if (!branchId) {
        return res.status(400).json({
          error: "Bad Request",
          message: "branchId is required",
        });
      }

      const { getInventoryPoliciesUseCase, updateTenantPoliciesUseCase } =
        PolicyFactory.build();
      const existingResult = await getInventoryPoliciesUseCase.execute({
        tenantId,
        branchId,
      });
      const before = existingResult.ok
        ? {
            autoSubtractOnSale: existingResult.value.autoSubtractOnSale,
            expiryTrackingEnabled: existingResult.value.expiryTrackingEnabled,
          }
        : null;
      const result = await updateTenantPoliciesUseCase.execute(
        tenantId,
        branchId,
        updates
      );

      if (!result.ok) {
        return res.status(400).json({
          error: "Bad Request",
          message: result.error,
        });
      }

      // Return only inventory fields
      const {
        inventoryAutoSubtractOnSale,
        inventoryExpiryTrackingEnabled,
        updatedAt,
      } = result.value;
      res.locals.policyAudit = {
        branchId,
        changes: updates,
        before,
        after: {
          autoSubtractOnSale: inventoryAutoSubtractOnSale,
          expiryTrackingEnabled: inventoryExpiryTrackingEnabled,
        },
      };
      return res.status(200).json({
        tenantId,
        branchId,
        autoSubtractOnSale: inventoryAutoSubtractOnSale,
        expiryTrackingEnabled: inventoryExpiryTrackingEnabled,
        updatedAt,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Update cash session policies
   */
  static async updateCashSessionPolicies(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ) {
    try {
      const { tenantId } = req.user!;
      const branchId = resolveBranchIdFromBody(req);
      const { branchId: _branchId, ...updates } =
        req.body as UpdateCashSessionPoliciesInput;

      if (!branchId) {
        return res.status(400).json({
          error: "Bad Request",
          message: "branchId is required",
        });
      }

      const { getCashSessionPoliciesUseCase, updateTenantPoliciesUseCase } =
        PolicyFactory.build();
      const existingResult = await getCashSessionPoliciesUseCase.execute({
        tenantId,
        branchId,
      });
      const before = existingResult.ok
        ? {
            requireSessionForSales:
              existingResult.value.requireSessionForSales,
            allowPaidOut: existingResult.value.allowPaidOut,
            requireRefundApproval: existingResult.value.requireRefundApproval,
            allowManualAdjustment: existingResult.value.allowManualAdjustment,
          }
        : null;
      const result = await updateTenantPoliciesUseCase.execute(
        tenantId,
        branchId,
        updates
      );

      if (!result.ok) {
        return res.status(400).json({
          error: "Bad Request",
          message: result.error,
        });
      }

      const {
        cashRequireSessionForSales,
        cashAllowPaidOut,
        cashRequireRefundApproval,
        cashAllowManualAdjustment,
        updatedAt,
      } = result.value;
      res.locals.policyAudit = {
        branchId,
        changes: updates,
        before,
        after: {
          requireSessionForSales: cashRequireSessionForSales,
          allowPaidOut: cashAllowPaidOut,
          requireRefundApproval: cashRequireRefundApproval,
          allowManualAdjustment: cashAllowManualAdjustment,
        },
      };
      return res.status(200).json({
        tenantId,
        branchId,
        allowPaidOut: cashAllowPaidOut,
        requireRefundApproval: cashRequireRefundApproval,
        allowManualAdjustment: cashAllowManualAdjustment,
        updatedAt,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Update attendance policies
   */
  static async updateAttendancePolicies(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ) {
    try {
      const { tenantId } = req.user!;
      const branchId = resolveBranchIdFromBody(req);
      const { branchId: _branchId, ...updates } =
        req.body as UpdateAttendancePoliciesInput;

      if (!branchId) {
        return res.status(400).json({
          error: "Bad Request",
          message: "branchId is required",
        });
      }

      const { getAttendancePoliciesUseCase, updateTenantPoliciesUseCase } =
        PolicyFactory.build();
      const existingResult = await getAttendancePoliciesUseCase.execute({
        tenantId,
        branchId,
      });
      const before = existingResult.ok
        ? {
            autoFromCashSession: existingResult.value.autoFromCashSession,
            requireOutOfShiftApproval:
              existingResult.value.requireOutOfShiftApproval,
            earlyCheckinBufferEnabled:
              existingResult.value.earlyCheckinBufferEnabled,
            checkinBufferMinutes: existingResult.value.checkinBufferMinutes,
            allowManagerEdits: existingResult.value.allowManagerEdits,
          }
        : null;
      const result = await updateTenantPoliciesUseCase.execute(
        tenantId,
        branchId,
        updates
      );

      if (!result.ok) {
        return res.status(400).json({
          error: "Bad Request",
          message: result.error,
        });
      }

      const {
        attendanceAutoFromCashSession,
        attendanceRequireOutOfShiftApproval,
        attendanceEarlyCheckinBufferEnabled,
        attendanceCheckinBufferMinutes,
        attendanceAllowManagerEdits,
        updatedAt,
      } = result.value;
      res.locals.policyAudit = {
        branchId,
        changes: updates,
        before,
        after: {
          autoFromCashSession: attendanceAutoFromCashSession,
          requireOutOfShiftApproval: attendanceRequireOutOfShiftApproval,
          earlyCheckinBufferEnabled: attendanceEarlyCheckinBufferEnabled,
          checkinBufferMinutes: attendanceCheckinBufferMinutes,
          allowManagerEdits: attendanceAllowManagerEdits,
        },
      };
      return res.status(200).json({
        tenantId,
        branchId,
        autoFromCashSession: attendanceAutoFromCashSession,
        requireOutOfShiftApproval: attendanceRequireOutOfShiftApproval,
        earlyCheckinBufferEnabled: attendanceEarlyCheckinBufferEnabled,
        checkinBufferMinutes: attendanceCheckinBufferMinutes,
        allowManagerEdits: attendanceAllowManagerEdits,
        updatedAt,
      });
    } catch (error) {
      next(error);
    }
  }
}
