import type { Request, Response, NextFunction } from "express";
import type { AuthRequest } from "../../../auth/api/middleware/auth.middleware.js";
import { StockIntegrationFactory } from "../../domain/factories/index.js";
import type { LinkStockInput } from "../schemas/schemas.js";

export class StockIntegrationController {
  static async linkStock(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { tenantId, employeeId } = req.user!;
      const { menuItemId } = req.params;
      const input = req.body as LinkStockInput;

      // Get use case from factory
      const { linkMenuItemToStockUseCase } = StockIntegrationFactory.build();

      // Execute use case
      const result = await linkMenuItemToStockUseCase.execute({
        tenantId,
        userId: employeeId,
        menuItemId,
        stockItemId: input.stockItemId,
        qtyPerSale: input.qtyPerSale,
      });

      // Handle result
      if (!result.ok) {
        return res.status(400).json({
          error: "Bad Request",
          message: result.error,
        });
      }

      const mapping = result.value;

      // Return success response
      return res.status(201).json({
        message: "Menu item linked to stock successfully",
        menuItemId: mapping.menuItemId,
        stockItemId: mapping.stockItemId,
        qtyPerSale: mapping.qtyPerSale,
        createdAt: mapping.createdAt,
      });
    } catch (error) {
      next(error);
    }
  }

  static async unlinkStock(
    req: AuthRequest,
    res: Response,
    next: NextFunction
  ) {
    try {
      const { tenantId, employeeId } = req.user!;
      const { mappingId } = req.params;

      // Get use case from factory
      const { unlinkMenuItemFromStockUseCase } =
        StockIntegrationFactory.build();

      // Execute use case
      const result = await unlinkMenuItemFromStockUseCase.execute({
        tenantId,
        userId: employeeId,
        mappingId,
      });

      // Handle result
      if (!result.ok) {
        return res.status(400).json({
          error: "Bad Request",
          message: result.error,
        });
      }

      // Return success response
      return res.status(200).json({
        message: "Stock mapping removed successfully",
      });
    } catch (error) {
      next(error);
    }
  }
}
