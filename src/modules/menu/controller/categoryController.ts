import { Request, Response, NextFunction } from "express";
import {
  CreateCategoryUseCase,
  UpdateCategoryUseCase,
  DeleteCategoryUseCase,
  ListCategoriesUseCase,
} from "../app/use-cases/category/index.js";
import { CategoryFactory } from "../domain/factories/category.factory.js";

export class CategoryController {
  static async create(req: Request, res: Response, next: NextFunction) {
    try {
      const { tenantId, id } = req.user!;
      const { name, description, displayOrder } = req.body;

      const { createCategoryUseCase } = CategoryFactory.build();

      const result = await createCategoryUseCase.execute({
        tenantId,
        userId: id,
        name,
        description,
        displayOrder,
      });

      if (!result.ok) {
        return res.status(400).json({
          error: result.error,
        });
      }

      const category = result.value;
      return res.status(201).json({
        id: category.id,
        name: category.name,
        description: category.description,
        displayOrder: category.displayOrder,
        isActive: category.isActive,
        createdAt: category.createdAt,
        updatedAt: category.updatedAt,
      });
    } catch (error) {
      next(error);
    }
  }

  static async list(req: Request, res: Response, next: NextFunction) {
    try {
      const { tenantId } = req.user!;

      const useCase = new ListCategoriesUseCase(tenantId);
      const result = await useCase.execute({
        tenantId,
        isActive: true,
      });
    } catch (error) {
      next(error);
    }
  }

  static async update(req);
}
