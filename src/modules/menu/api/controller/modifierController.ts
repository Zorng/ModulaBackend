import type { Request, Response, NextFunction } from "express";
import type { AuthRequest } from "../../../../platform/security/auth.js";
import { ModifierFactory } from "../../domain/factories/modifier.factory.js";
import type {
  CreateModifierGroupInput,
  AddModifierOptionInput,
  AttachModifierInput,
  UpdateModifierGroupInput,
  UpdateModifierOptionInput,
} from "../schemas/schemas.js";

export class ModifierController {
  static async createGroup(
    req: AuthRequest,
    res: Response,
    next: NextFunction
  ) {
    try {
      const { tenantId, employeeId } = req.user!;
      const input = req.body as CreateModifierGroupInput;

      const { createModifierGroupUseCase } = ModifierFactory.build();

      const result = await createModifierGroupUseCase.execute({
        tenantId,
        userId: employeeId,
        name: input.name,
        selectionType: input.selectionType,
      });

      // Handle result
      if (!result.ok) {
        return res.status(400).json({
          error: "Bad Request",
          message: result.error,
        });
      }

      const group = result.value;

      // Return success response
      return res.status(201).json({
        id: group.id,
        name: group.name,
        selectionType: group.selectionType,
        createdAt: group.createdAt,
        updatedAt: group.updatedAt,
      });
    } catch (error) {
      next(error);
    }
  }

  static async addOption(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { tenantId, employeeId } = req.user!;
      const input = req.body as AddModifierOptionInput;

      const { addModifierOptionUseCase } = ModifierFactory.build();

      const result = await addModifierOptionUseCase.execute({
        tenantId,
        userId: employeeId,
        modifierGroupId: input.modifierGroupId,
        label: input.label,
        priceAdjustmentUsd: input.priceAdjustmentUsd,
        isDefault: input.isDefault,
      });

      if (!result.ok) {
        return res.status(400).json({
          error: "Bad Request",
          message: result.error,
        });
      }

      const option = result.value;

      return res.status(201).json({
        id: option.id,
        modifierGroupId: option.modifierGroupId,
        label: option.label,
        priceAdjustmentUsd: option.priceAdjustmentUsd,
        isDefault: option.isDefault,
        createdAt: option.createdAt,
      });
    } catch (error) {
      next(error);
    }
  }

  static async attatchToItem(
    req: AuthRequest,
    res: Response,
    next: NextFunction
  ) {
    try {
      const { tenantId, employeeId } = req.user!;
      const { menuItemId } = req.params;
      const input = req.body as AttachModifierInput;

      const { attachModifierToItemUseCase } = ModifierFactory.build();

      const result = await attachModifierToItemUseCase.execute({
        tenantId,
        userId: employeeId,
        menuItemId,
        modifierGroupId: input.modifierGroupId,
        isRequired: input.isRequired,
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
        message: "Modifier attached successfully",
        menuItemId,
        modifierGroupId: input.modifierGroupId,
        isRequired: input.isRequired,
      });
    } catch (error) {
      next(error);
    }
  }

  static async detachFromItem(
    req: AuthRequest,
    res: Response,
    next: NextFunction
  ) {
    try {
      const { tenantId, employeeId } = req.user!;
      const { menuItemId, modifierGroupId } = req.params;

      const { detachModifierFromItemUseCase } = ModifierFactory.build();

      const result = await detachModifierFromItemUseCase.execute({
        tenantId,
        userId: employeeId,
        menuItemId,
        modifierGroupId,
      });

      if (!result.ok) {
        return res.status(400).json({
          error: "Bad Request",
          message: result.error,
        });
      }

      return res.status(200).json({
        message: "Modifier detached successfully",
        menuItemId,
        modifierGroupId,
      });
    } catch (error) {
      next(error);
    }
  }

  static async listGroups(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { tenantId } = req.user!;
      const { listModifierGroupUseCase } = ModifierFactory.build();

      const result = await listModifierGroupUseCase.execute({ tenantId });

      if (!result.ok) {
        return res.status(400).json({
          error: "Bad Request",
          message: result.error,
        });
      }

      return res.status(200).json(result.value);
    } catch (error) {
      next(error);
    }
  }

  static async getGroup(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { tenantId } = req.user!;
      const { modifierGroupId } = req.params;

      const { getModifierGroupUseCase } = ModifierFactory.build();

      const result = await getModifierGroupUseCase.execute({
        tenantId,
        groupId: modifierGroupId,
      });

      if (!result.ok) {
        return res.status(400).json({
          error: "Bad Request",
          message: result.error,
        });
      }

      const group = result.value;
      if (!group) {
        return res.status(404).json({
          error: "Not Found",
          message: "Modifier group not found",
        });
      }

      return res.status(200).json(group);
    } catch (error) {
      next(error);
    }
  }

  static async updateGroup(
    req: AuthRequest,
    res: Response,
    next: NextFunction
  ) {
    try {
      const { tenantId, employeeId } = req.user!;
      const { modifierGroupId } = req.params;
      const input = req.body as UpdateModifierGroupInput;

      const { updateModifierGroupUseCase } = ModifierFactory.build();

      const result = await updateModifierGroupUseCase.execute({
        tenantId,
        userId: employeeId,
        groupId: modifierGroupId,
        name: input.name,
        selectionType: input.selectionType,
      });

      if (!result.ok) {
        return res.status(400).json({
          error: "Bad Request",
          message: result.error,
        });
      }

      const group = result.value;

      return res.status(200).json({
        id: group.id,
        name: group.name,
        selectionType: group.selectionType,
        createdAt: group.createdAt,
        updatedAt: group.updatedAt,
      });
    } catch (error) {
      next(error);
    }
  }

  static async softDeleteGroup(
    req: AuthRequest,
    res: Response,
    next: NextFunction
  ) {
    try {
      const { tenantId, employeeId } = req.user!;
      const { modifierGroupId } = req.params;

      const { deleteModifierGroupUseCase } = ModifierFactory.build();

      const result = await deleteModifierGroupUseCase.execute({
        tenantId,
        userId: employeeId,
        groupId: modifierGroupId,
      });

      if (!result.ok) {
        return res.status(400).json({
          error: "Bad Request",
          message: result.error,
        });
      }

      return res.status(200).json({
        message: "Modifier group soft-deleted successfully",
        modifierGroupId,
      });
    } catch (error) {
      next(error);
    }
  }

  static async hardDeleteGroup(
    req: AuthRequest,
    res: Response,
    next: NextFunction
  ) {
    try {
      const { tenantId, employeeId } = req.user!;
      const { modifierGroupId } = req.params;

      const { hardDeleteModifierGroupUseCase } = ModifierFactory.build();

      const result = await hardDeleteModifierGroupUseCase.execute({
        tenantId,
        userId: employeeId,
        groupId: modifierGroupId,
      });

      if (!result.ok) {
        return res.status(400).json({
          error: "Bad Request",
          message: result.error,
        });
      }

      return res.status(200).json({
        message: "Modifier group hard-deleted successfully",
        modifierGroupId,
      });
    } catch (error) {
      next(error);
    }
  }

  static async listOptionsForGroup(
    req: AuthRequest,
    res: Response,
    next: NextFunction
  ) {
    try {
      const { tenantId } = req.user!;
      const { modifierGroupId } = req.params;

      const { listModifierOptionsForGroupUseCase } = ModifierFactory.build();

      const result = await listModifierOptionsForGroupUseCase.execute({
        tenantId,
        groupId: modifierGroupId,
      });

      if (!result.ok) {
        return res.status(400).json({
          error: "Bad Request",
          message: result.error,
        });
      }

      return res.status(200).json(result.value);
    } catch (error) {
      next(error);
    }
  }

  static async getOption(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { tenantId } = req.user!;
      const { optionId } = req.params;

      const { listModifierOptionUseCase } = ModifierFactory.build();

      const result = await listModifierOptionUseCase.execute({
        id: optionId,
        tenantId,
      });

      if (!result.ok) {
        return res.status(400).json({
          error: "Bad Request",
          message: result.error,
        });
      }

      const option = result.value;
      if (!option) {
        return res.status(404).json({
          error: "Not Found",
          message: "Modifier option not found",
        });
      }

      return res.status(200).json(option);
    } catch (error) {
      next(error);
    }
  }

  static async updateOption(
    req: AuthRequest,
    res: Response,
    next: NextFunction
  ) {
    try {
      const { tenantId, employeeId } = req.user!;
      const { optionId } = req.params;
      const input = req.body as UpdateModifierOptionInput;

      const { updateModifierOptionUseCase } = ModifierFactory.build();

      const result = await updateModifierOptionUseCase.execute({
        tenantId,
        userId: employeeId,
        optionId,
        label: input.label,
        priceAdjustmentUsd: input.priceAdjustmentUsd,
        isDefault: input.isDefault,
      });

      if (!result.ok) {
        return res.status(400).json({
          error: "Bad Request",
          message: result.error,
        });
      }

      const option = result.value;

      return res.status(200).json({
        id: option.id,
        modifierGroupId: option.modifierGroupId,
        label: option.label,
        priceAdjustmentUsd: option.priceAdjustmentUsd,
        isDefault: option.isDefault,
        createdAt: option.createdAt,
        updatedAt: option.updatedAt,
      });
    } catch (error) {
      next(error);
    }
  }

  static async deleteOption(
    req: AuthRequest,
    res: Response,
    next: NextFunction
  ) {
    try {
      const { tenantId, employeeId } = req.user!;
      const { optionId } = req.params;

      const { deleteModifierOptionUseCase } = ModifierFactory.build();

      const result = await deleteModifierOptionUseCase.execute({
        tenantId,
        userId: employeeId,
        optionId,
      });

      if (!result.ok) {
        return res.status(400).json({
          error: "Bad Request",
          message: result.error,
        });
      }

      return res.status(200).json({
        message: "Modifier option deleted successfully",
        optionId,
      });
    } catch (error) {
      next(error);
    }
  }
}
