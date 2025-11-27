// src/modules/menu/api/controllers/query.controller.ts
import type { Request, Response, NextFunction } from "express";
import type { AuthRequest } from "../../../auth/api/middleware/auth.middleware.js";
import { QueryFactory } from "../../domain/factories/query.factory.js";

/**
 * Query Controller
 * Handles read-only queries for menu data (optimized for POS)
 */
export class QueryController {
  /**
   * GET /v1/menu/snapshot
   * Gets complete menu snapshot for a branch (for POS offline operation)
   *
   * Query params:
   * - branchId: UUID of the branch
   *
   * Returns:
   * - Complete menu with categories, items, modifiers, branch overrides
   * - Optimized for caching in IndexedDB on POS terminals
   */
  static async getMenuSnapshot(
    req: AuthRequest,
    res: Response,
    next: NextFunction
  ) {
    try {
      const { tenantId } = req.user!;
      const { branchId } = req.query as { branchId: string };

      // Validate branchId is provided
      if (!branchId) {
        return res.status(400).json({
          error: "Bad Request",
          message: "branchId query parameter is required",
        });
      }

      // Get use case from factory
      const { getMenuForBranchUseCase } = QueryFactory.build();

      // Execute use case
      const result = await getMenuForBranchUseCase.execute({
        tenantId,
        branchId,
      });

      // Handle result
      if (!result.ok) {
        return res.status(400).json({
          error: "Bad Request",
          message: result.error,
        });
      }

      const snapshot = result.value;

      // Return success response with cache headers
      return res
        .status(200)
        .set({
          "Cache-Control": "private, max-age=300",
          "X-Menu-Version": new Date().toISOString(),
        })
        .json(snapshot);
    } catch (error) {
      next(error);
    }
  }
}
