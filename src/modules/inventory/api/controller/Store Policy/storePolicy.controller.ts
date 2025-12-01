import { Response } from "express";
import { AuthRequest } from "#modules/auth/api/middleware/auth.middleware.js";
import {
  GetStorePolicyInventoryUseCase,
  UpdateStorePolicyInventoryUseCase,
} from "../../../app/storepolicyinventory-usecase/index.js";

export class StorePolicyController {
  constructor(
    private getStorePolicyInventoryUseCase: GetStorePolicyInventoryUseCase,
    private updateStorePolicyInventoryUseCase: UpdateStorePolicyInventoryUseCase
  ) {}

  async getStorePolicy(req: AuthRequest, res: Response) {
    try {
      const result =
        await this.getStorePolicyInventoryUseCase.executeWithDefault(
          req.user!.tenantId,
          req.user!.employeeId
        );

      if (!result.ok) {
        return res.status(400).json({ success: false, error: result.error });
      }

      res.json({ success: true, data: result.value });
    } catch (error) {
      this.handleError(res, error);
    }
  }

  async updateStorePolicy(req: AuthRequest, res: Response) {
    try {
      const {
        inventorySubtractOnFinalize,
        branchOverrides,
        excludeMenuItemIds,
      } = req.body;

      const result = await this.updateStorePolicyInventoryUseCase.execute(
        req.user!.tenantId,
        {
          inventorySubtractOnFinalize,
          branchOverrides,
          excludeMenuItemIds,
          updatedBy: req.user!.employeeId,
        }
      );

      if (!result.ok) {
        return res.status(400).json({ success: false, error: result.error });
      }

      res.json({ success: true, data: result.value });
    } catch (error) {
      this.handleError(res, error);
    }
  }

  private handleError(res: Response, error: unknown) {
    console.error("StorePolicy controller error:", error);
    const message =
      error instanceof Error ? error.message : "Internal server error";
    res.status(500).json({ success: false, error: message });
  }
}
