import type { Request, Response, NextFunction } from "express";
import { MenuItemFactory } from "../../domain/factories/menuitem.factory.js";
import { CreateMenuItemInput, UpdateMenuItemInput } from "../schemas/schemas.js";

export class MenuItemController {
    static async create(req: Request, res: Response, next: NextFunction) {
        try {
            const { tenantId, id} = req.user!;
            const input = req.body as CreateMenuItemInput;

            const { createMenuItemUseCase } = MenuItemFactory.build();
            const result = await createMenuItemUseCase.execute({
                tenantId,
                userId: id,
                categoryId: input.categoryId,
                name: input.name,
                description: input.description,
                priceUsd: input.priceUsd,
                imageUrl: input.imageUrl,
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

    static async get(req: Request, res: Response, next: NextFunction) {
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

    static async update(req: Request, res:Response, next: NextFunction) {
        try {
            const {tenantId, id} = req.user!;
            const {menuItemId} = req.params;
            const input = req.body as UpdateMenuItemInput;

            const { updateMenuItemUseCase } = MenuItemFactory.build();

            const result = await updateMenuItemUseCase.execute({
            tenantId,
            userId:id,
            menuItemId,
            name: input.name,
            description: input.description,
            priceUsd: input.priceUsd,
            categoryId: input.categoryId,
            imageUrl: input.imageUrl,
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

    static async delete(req:Request, res:Response, next: NextFunction) {
        try {
          const { tenantId, id } = req.user!;
          const { menuItemId } = req.params;

          // Get use case from factory
          const { deleteMenuItemUseCase } = MenuItemFactory.build();

          const result = await deleteMenuItemUseCase.execute({
            tenantId,
            userId: id,
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
