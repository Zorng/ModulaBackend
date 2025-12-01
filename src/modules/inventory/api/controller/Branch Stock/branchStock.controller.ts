import { Response } from "express";
import { AuthRequest } from "#modules/auth/api/middleware/auth.middleware.js";
import {
  AssignStockItemToBranchUseCase,
  GetBranchStockItemsUseCase,
} from "../../../app/branchstock-usecase/index.js";

export class BranchStockController {
  constructor(
    private assignStockItemToBranchUseCase: AssignStockItemToBranchUseCase,
    private getBranchStockItemsUseCase: GetBranchStockItemsUseCase
  ) {}

  async assignStockItemToBranch(req: AuthRequest, res: Response) {
    try {
      const { stockItemId, minThreshold } = req.body;

      const result = await this.assignStockItemToBranchUseCase.execute({
        tenantId: req.user!.tenantId,
        branchId: req.user!.branchId,
        stockItemId,
        minThreshold,
        userId: req.user!.employeeId,
      });

      if (!result.ok) {
        return res.status(400).json({ success: false, error: result.error });
      }

      res.status(201).json({ success: true, data: result.value });
    } catch (error) {
      this.handleError(res, error);
    }
  }

  async getBranchStockItems(req: AuthRequest, res: Response) {
    try {
      const result = await this.getBranchStockItemsUseCase.execute({
        tenantId: req.user!.tenantId,
        branchId: req.user!.branchId,
      });

      res.json({ success: true, data: result });
    } catch (error) {
      this.handleError(res, error);
    }
  }

  private handleError(res: Response, error: unknown) {
    console.error("BranchStock controller error:", error);
    const message =
      error instanceof Error ? error.message : "Internal server error";
    res.status(500).json({ success: false, error: message });
  }
}
