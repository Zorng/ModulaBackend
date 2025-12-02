import type { Response, NextFunction } from "express";
import type { AuthRequest } from "../../../auth/api/middleware/auth.middleware.js";
import { PolicyFactory } from "../../domain/factory.js";
import type {
  UpdateTaxPoliciesInput,
  UpdateCurrencyPoliciesInput,
  UpdateRoundingPoliciesInput,
  UpdateInventoryPoliciesInput,
  // TODO: Import UpdateCashSessionPoliciesInput when cash module is ready
  // TODO: Import UpdateAttendancePoliciesInput when attendance module is ready
} from "../schemas.js";

/**
 * Controller for policy-related operations
 */
export class PolicyController {
  /**
   * Get all tenant policies (combined view)
   */
  static async getTenantPolicies(
    req: AuthRequest,
    res: Response,
    next: NextFunction
  ) {
    try {
      const { tenantId } = req.user!;

      const { getTenantPoliciesUseCase } = PolicyFactory.build();
      const result = await getTenantPoliciesUseCase.execute({ tenantId });

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
    req: AuthRequest,
    res: Response,
    next: NextFunction
  ) {
    try {
      const { tenantId } = req.user!;

      const { getSalesPoliciesUseCase } = PolicyFactory.build();
      const result = await getSalesPoliciesUseCase.execute({ tenantId });

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
    req: AuthRequest,
    res: Response,
    next: NextFunction
  ) {
    try {
      const { tenantId } = req.user!;

      const { getInventoryPoliciesUseCase } = PolicyFactory.build();
      const result = await getInventoryPoliciesUseCase.execute({ tenantId });

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
    req: AuthRequest,
    res: Response,
    next: NextFunction
  ) {
    try {
      const { tenantId } = req.user!;
      const updates = req.body as UpdateTaxPoliciesInput;

      const { updateTenantPoliciesUseCase } = PolicyFactory.build();
      const result = await updateTenantPoliciesUseCase.execute(
        tenantId,
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
    req: AuthRequest,
    res: Response,
    next: NextFunction
  ) {
    try {
      const { tenantId } = req.user!;
      const updates = req.body as UpdateCurrencyPoliciesInput;

      const { updateTenantPoliciesUseCase } = PolicyFactory.build();
      const result = await updateTenantPoliciesUseCase.execute(
        tenantId,
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
    req: AuthRequest,
    res: Response,
    next: NextFunction
  ) {
    try {
      const { tenantId } = req.user!;
      const updates = req.body as UpdateRoundingPoliciesInput;

      const { updateTenantPoliciesUseCase } = PolicyFactory.build();
      const result = await updateTenantPoliciesUseCase.execute(
        tenantId,
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
    req: AuthRequest,
    res: Response,
    next: NextFunction
  ) {
    try {
      const { tenantId } = req.user!;
      const updates = req.body as UpdateInventoryPoliciesInput;

      const { updateTenantPoliciesUseCase } = PolicyFactory.build();
      const result = await updateTenantPoliciesUseCase.execute(
        tenantId,
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
