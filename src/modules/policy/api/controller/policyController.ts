import type { Response, NextFunction } from "express";
import type { AuthenticatedRequest } from "../../../../platform/security/auth.js";
import { PolicyFactory } from "../../domain/factory.js";
import type {
  UpdateTaxPoliciesInput,
  UpdateCurrencyPoliciesInput,
  UpdateRoundingPoliciesInput,
  UpdateInventoryPoliciesInput,
  // TODO: Import UpdateCashSessionPoliciesInput when cash module is ready
  // TODO: Import UpdateAttendancePoliciesInput when attendance module is ready
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

      return res.status(200).json(result.value);
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

      return res.status(200).json(result.value);
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

  // TODO: Add getCashSessionPolicies when cash module is ready
  // TODO: Add getAttendancePolicies when attendance module is ready

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

      const { updateTenantPoliciesUseCase } = PolicyFactory.build();
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

      const { updateTenantPoliciesUseCase } = PolicyFactory.build();
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

      const { updateTenantPoliciesUseCase } = PolicyFactory.build();
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
      const { saleKhrRoundingEnabled, saleKhrRoundingMode, saleKhrRoundingGranularity, updatedAt } = result.value;
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

      const { updateTenantPoliciesUseCase } = PolicyFactory.build();
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
      const { inventoryAutoSubtractOnSale, inventoryExpiryTrackingEnabled, updatedAt } = result.value;
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

  // TODO: Add updateCashSessionPolicies when cash module is ready
  // TODO: Add updateAttendancePolicies when attendance module is ready
}
