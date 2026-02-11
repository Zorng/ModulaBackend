// src/modules/menu/api/controllers/branch-menu.controller.ts
import type { Request, Response, NextFunction } from "express";
import type { AuthRequest } from "../../../../platform/security/auth.js";
import { BranchMenuFactory } from "../../domain/factories/index.js";
import type { AuditWriterPort } from "../../../../shared/ports/audit.js";
import type {
  SetBranchAvailabilityInput,
  SetBranchPriceInput,
} from "../schemas/schemas.js";

export class BranchMenuController {
  static async setAvailability(
    req: AuthRequest,
    res: Response,
    next: NextFunction
  ) {
    try {
      const { tenantId, employeeId, role } = req.user!;
      const { menuItemId } = req.params;
      const input = req.body as SetBranchAvailabilityInput;

      // Get use case from factory
      const { setBranchAvailabilityUseCase } = BranchMenuFactory.build();

      // Execute use case
      const result = await setBranchAvailabilityUseCase.execute({
        tenantId,
        userId: employeeId,
        menuItemId,
        branchId: input.branchId,
        isAvailable: input.isAvailable,
      });

      // Handle result
      if (!result.ok) {
        return res.status(400).json({
          error: "Bad Request",
          message: result.error,
        });
      }

      const auditWriter: AuditWriterPort | undefined = (req as any).app?.locals
        ?.auditWriterPort;
      if (auditWriter?.write) {
        const actionType = input.isAvailable
          ? "MENU_ITEM_BRANCH_ASSIGNED"
          : "MENU_ITEM_BRANCH_UNASSIGNED";
        void auditWriter
          .write({
            tenantId,
            branchId: input.branchId,
            employeeId,
            actorRole: role ?? null,
            actionType,
            resourceType: "menu_item",
            resourceId: menuItemId,
            details: {
              isAvailable: input.isAvailable,
            },
          })
          .catch(() => {});
      }

      // Return success response
      return res.status(200).json({
        message: "Branch availability updated successfully",
        menuItemId,
        branchId: input.branchId,
        isAvailable: input.isAvailable,
      });
    } catch (error) {
      next(error);
    }
  }

  static async setPriceOverride(
    req: AuthRequest,
    res: Response,
    next: NextFunction
  ) {
    try {
      const { tenantId, employeeId } = req.user!;
      const { menuItemId } = req.params;
      const input = req.body as SetBranchPriceInput;

      // Get use case from factory
      const { setBranchPriceOverrideUseCase } = BranchMenuFactory.build();

      // Execute use case
      const result = await setBranchPriceOverrideUseCase.execute({
        tenantId,
        userId: employeeId,
        menuItemId,
        branchId: input.branchId,
        priceUsd: input.priceUsd,
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
        message: "Branch price override set successfully",
        menuItemId,
        branchId: input.branchId,
        priceUsd: input.priceUsd,
      });
    } catch (error) {
      next(error);
    }
  }
}
