import type { Request, Response, NextFunction } from "express";
import type { AuthRequest } from "../../../../platform/security/auth.js";
import { MenuItemFactory } from "../../domain/factories/menuitem.factory.js";
import {
  CreateMenuItemInput,
  UpdateMenuItemInput,
} from "../schemas/schemas.js";

export class MenuItemController {
  static async listByBranch(
    req: AuthRequest,
    res: Response,
    next: NextFunction
  ) {
    try {
      const { tenantId } = req.user!;
      const { branchId } = req.query;

      if (!branchId || typeof branchId !== "string") {
        return res.status(400).json({
          error: "Bad Request",
          message: "branchId query parameter is required and must be a string",
        });
      }

      const { getMenuItemsByBranchUseCase } = MenuItemFactory.build();
      const result = await getMenuItemsByBranchUseCase.execute({
        tenantId,
        branchId,
      });

      if (!result.ok) {
        return res.status(400).json({
          error: "Bad Request",
          message: result.error,
        });
      }

      const items = result.value;
      return res.status(200).json({
        items: items.map((item) => ({
          id: item.id,
          categoryId: item.categoryId,
          name: item.name,
          description: item.description,
          priceUsd: item.priceUsd,
          imageUrl: item.imageUrl,
          isActive: item.isActive,
          createdAt: item.createdAt,
          updatedAt: item.updatedAt,
        })),
        total: items.length,
      });
    } catch (error) {
      next(error);
    }
  }

  static async list(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { tenantId } = req.user!;

      const { listMenuItemsUseCase } = MenuItemFactory.build();
      const result = await listMenuItemsUseCase.execute({
        tenantId,
      });

      if (!result.ok) {
        return res.status(400).json({
          error: "Bad Request",
          message: result.error,
        });
      }

      const items = result.value;
      return res.status(200).json({
        items: items.map((item) => ({
          id: item.id,
          categoryId: item.categoryId,
          name: item.name,
          description: item.description,
          priceUsd: item.priceUsd,
          imageUrl: item.imageUrl,
          isActive: item.isActive,
          createdAt: item.createdAt,
          updatedAt: item.updatedAt,
        })),
        total: items.length,
      });
    } catch (error) {
      next(error);
    }
  }

  static async create(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { tenantId, employeeId } = req.user!;
      const input = req.body as CreateMenuItemInput;

      let ImageUrl = undefined;

      const { createMenuItemUseCase } = MenuItemFactory.build();
      const result = await createMenuItemUseCase.execute({
        tenantId,
        userId: employeeId,
        categoryId: input.categoryId,
        name: input.name,
        description: input.description,
        priceUsd: input.priceUsd,
        imageUrl: ImageUrl,
        imageFile: req.file ? req.file.buffer : undefined,
        imageFilename: req.file ? req.file.originalname : undefined,
      });

      // Handle result
      if (!result.ok) {
        return res.status(400).json({
          error: "Bad Request",
          message: result.error,
        });
      }

      const item = result.value;

      // Return success response
      return res.status(201).json({
        id: item.id,
        categoryId: item.categoryId,
        name: item.name,
        description: item.description,
        priceUsd: item.priceUsd,
        imageUrl: item.imageUrl,
        isActive: item.isActive,
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
      });
    } catch (error) {
      next(error);
    }
  }

  static async get(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { tenantId } = req.user!;
      const { menuItemId } = req.params;

      // Get use case from factory
      const { getMenuItemUseCase } = MenuItemFactory.build();

      // Execute use case
      const result = await getMenuItemUseCase.execute({
        tenantId,
        menuItemId,
      });

      // Handle result
      if (!result.ok) {
        return res.status(404).json({
          error: "Not Found",
          message: result.error,
        });
      }

      const item = result.value;

      // Return success response
      return res.status(200).json({
        id: item.id,
        categoryId: item.categoryId,
        name: item.name,
        description: item.description,
        priceUsd: item.priceUsd,
        imageUrl: item.imageUrl,
        isActive: item.isActive,
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
      });
    } catch (error) {
      next(error);
    }
  }

  static async getWithModifiers(
    req: AuthRequest,
    res: Response,
    next: NextFunction
  ) {
    try {
      const { tenantId } = req.user!;
      const { menuItemId } = req.params;

      // Get use case from factory
      const { getMenuItemWithModifiersUseCase } = MenuItemFactory.build();

      // Execute use case
      const result = await getMenuItemWithModifiersUseCase.execute({
        tenantId,
        menuItemId,
      });

      // Handle result
      if (!result.ok) {
        return res.status(404).json({
          error: "Not Found",
          message: result.error,
        });
      }

      const itemWithModifiers = result.value;

      // Return success response
      return res.status(200).json(itemWithModifiers);
    } catch (error) {
      next(error);
    }
  }

  static async update(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { tenantId, employeeId } = req.user!;
      const { menuItemId } = req.params;
      const input = req.body as UpdateMenuItemInput;

      const { updateMenuItemUseCase } = MenuItemFactory.build();

      const imageUrl = req.file
        ? await req.app.locals.imageStorage.uploadImage(
            req.file.buffer,
            req.file.originalname,
            tenantId
          )
        : undefined;

      const result = await updateMenuItemUseCase.execute({
        tenantId,
        userId: employeeId,
        menuItemId,
        name: input.name,
        description: input.description,
        priceUsd: input.priceUsd,
        categoryId: input.categoryId,
        imageUrl,
      });
      // Handle result
      if (!result.ok) {
        return res.status(400).json({
          error: "Bad Request",
          message: result.error,
        });
      }
      const item = result.value;
      // Return success response
      return res.status(200).json({
        id: item.id,
        categoryId: item.categoryId,
        name: item.name,
        description: item.description,
        priceUsd: item.priceUsd,
        imageUrl: item.imageUrl,
        isActive: item.isActive,
        updatedAt: item.updatedAt,
      });
    } catch (error) {
      next(error);
    }
  }

  static async delete(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { tenantId, employeeId } = req.user!;
      const { menuItemId } = req.params;

      // Get use case from factory
      const { deleteMenuItemUseCase } = MenuItemFactory.build();

      const result = await deleteMenuItemUseCase.execute({
        tenantId,
        userId: employeeId,
        menuItemId,
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
        message: "Menu item deleted successfully",
      });
    } catch (error) {
      next(error);
    }
  }
}
