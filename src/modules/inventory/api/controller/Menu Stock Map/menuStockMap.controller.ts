import { Response } from "express";
import type { AuthRequest } from "../../../../../platform/security/auth.js";
import {
  SetMenuStockMapUseCase,
  GetMenuStockMapUseCase,
  DeleteMenuStockMapUseCase,
} from "../../../app/menustockmap-usecase/index.js";

export class MenuStockMapController {
  constructor(
    private setMenuStockMapUseCase: SetMenuStockMapUseCase,
    private getMenuStockMapUseCase: GetMenuStockMapUseCase,
    private deleteMenuStockMapUseCase: DeleteMenuStockMapUseCase
  ) {}

  async setMenuStockMap(req: AuthRequest, res: Response) {
    try {
      const { menuItemId, stockItemId, qtyPerSale } = req.body;

      const result = await this.setMenuStockMapUseCase.execute({
        tenantId: req.user!.tenantId,
        menuItemId,
        stockItemId,
        qtyPerSale,
        updatedBy: req.user!.employeeId,
      });

      if (!result.ok) {
        return res.status(400).json({ success: false, error: result.error });
      }

      res.status(201).json({ success: true, data: result.value });
    } catch (error) {
      this.handleError(res, error);
    }
  }

  async getMenuStockMap(req: AuthRequest, res: Response) {
    try {
      const { menuItemId } = req.params;

      const result = await this.getMenuStockMapUseCase.execute(menuItemId);

      if (!result.ok) {
        return res.status(400).json({ success: false, error: result.error });
      }

      res.json({ success: true, data: result.value });
    } catch (error) {
      this.handleError(res, error);
    }
  }

  async getAllMenuStockMaps(req: AuthRequest, res: Response) {
    try {
      const result = await this.getMenuStockMapUseCase.executeGetAll();

      if (!result.ok) {
        return res.status(400).json({ success: false, error: result.error });
      }

      res.json({ success: true, data: result.value });
    } catch (error) {
      this.handleError(res, error);
    }
  }

  async deleteMenuStockMap(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;

      const result = await this.deleteMenuStockMapUseCase.execute({ id });

      if (!result.ok) {
        return res.status(400).json({ success: false, error: result.error });
      }

      res.status(204).send();
    } catch (error) {
      this.handleError(res, error);
    }
  }

  private handleError(res: Response, error: unknown) {
    console.error("MenuStockMap controller error:", error);
    const message =
      error instanceof Error ? error.message : "Internal server error";
    res.status(500).json({ success: false, error: message });
  }
}
