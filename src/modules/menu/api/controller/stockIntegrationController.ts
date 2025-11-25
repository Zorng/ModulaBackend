import type { Request, Response, NextFunction } from "express";
import { StockIntegrationFactory } from "../../domain/factories/index.js";
import type { LinkStockInput } from "../schemas/schemas.js";

export class StockIntegrationController {

  static async linkStock(req: Request, res: Response, next: NextFunction) {
    try {
      const { tenantId, id } = req.user!;
      const { menuItemId } = req.params;
      const input = req.body as LinkStockInput;

      // Get use case from factory
      const { linkMenuItemToStockUseCase } = StockIntegrationFactory.build();

      // Execute use case
      const result = await linkMenuItemToStockUseCase.execute({
        tenantId,
        userId: id,
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

  static async unlinkStock(req: Request, res: Response, next: NextFunction) {
    try {
      const { tenantId, id } = req.user!;
      const { mappingId } = req.params;

      // Get use case from factory
      const { unlinkMenuItemFromStockUseCase } =
        StockIntegrationFactory.build();

      // Execute use case
      const result = await unlinkMenuItemFromStockUseCase.execute({
        tenantId,
        userId:id,
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
