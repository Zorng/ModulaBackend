import { Request, Response, NextFunction } from "express";
import type { AuthRequest } from "../../../../platform/security/auth.js";
import { CategoryFactory } from "../../domain/factories/category.factory.js";
import { UpdateCategoryInput } from "../schemas/schemas.js";
import type { AuditWriterPort } from "../../../../shared/ports/audit.js";

export class CategoryController {
  static async create(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { tenantId, employeeId, branchId, role } = req.user!;
      const { name, description, displayOrder } = req.body;

      const { createCategoryUseCase } = CategoryFactory.build();

      const result = await createCategoryUseCase.execute({
        tenantId,
        userId: employeeId,
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

      const auditWriter: AuditWriterPort | undefined = (req as any).app?.locals
        ?.auditWriterPort;
      if (auditWriter?.write) {
        void auditWriter
          .write({
            tenantId,
            branchId,
            employeeId,
            actorRole: role ?? null,
            actionType: "MENU_CATEGORY_CREATED",
            resourceType: "menu_category",
            resourceId: category.id,
            details: {
              name: category.name,
              description: category.description ?? null,
              displayOrder: category.displayOrder,
              isActive: category.isActive,
            },
          })
          .catch(() => {});
      }

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

  static async list(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { tenantId } = req.user!;
      const { isActive } = (req as any).validatedQuery as {
        isActive?: boolean;
      };

      const { listCategoriesUseCase } = CategoryFactory.build();

      const result = await listCategoriesUseCase.execute({
        tenantId,
        isActive: isActive ?? true,
      });

      if (!result.ok) {
        return res.status(400).json({
          error: "Bad Request",
          message: result.error,
        });
      }

      const categories = result.value;

      return res.status(200).json({
        categories: categories.map((cat) => ({
          id: cat.id,
          name: cat.name,
          description: cat.description,
          displayOrder: cat.displayOrder,
          isActive: cat.isActive,
          createdAt: cat.createdAt,
          updatedAt: cat.updatedAt,
        })),
        total: categories.length,
      });
    } catch (error) {
      next(error);
    }
  }

  static async get(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { tenantId } = req.user!;
      const { categoryId } = req.params;

      const { getCategoryUseCase } = CategoryFactory.build();

      const result = await getCategoryUseCase.execute({
        tenantId,
        categoryId,
      });

      if (!result.ok) {
        return res.status(404).json({
          error: "Not Found",
          message: result.error,
        });
      }

      const category = result.value;

      return res.status(200).json({
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

  static async update(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { tenantId, employeeId, branchId, role } = req.user!;
      const { categoryId } = req.params;
      const input = req.body as UpdateCategoryInput;

      const { updateCategoryUseCase } = CategoryFactory.build();

      const result = await updateCategoryUseCase.execute({
        tenantId,
        userId: employeeId,
        categoryId,
        name: input.name,
        displayOrder: input.displayOrder,
      });

      if (!result.ok) {
        return res.status(400).json({
          error: "Bad Request",
          message: result.error,
        });
      }

      const category = result.value;

      const auditWriter: AuditWriterPort | undefined = (req as any).app?.locals
        ?.auditWriterPort;
      if (auditWriter?.write) {
        void auditWriter
          .write({
            tenantId,
            branchId,
            employeeId,
            actorRole: role ?? null,
            actionType: "MENU_CATEGORY_UPDATED",
            resourceType: "menu_category",
            resourceId: categoryId,
            details: {
              changes: {
                name: input.name,
                displayOrder: input.displayOrder,
              },
            },
          })
          .catch(() => {});
      }

      return res.status(200).json({
        id: category.id,
        name: category.name,
        description: category.description,
        displayOrder: category.displayOrder,
        isActive: category.isActive,
        updatedAt: category.updatedAt,
      });
    } catch (error) {
      next(error);
    }
  }

  static async delete(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { tenantId, employeeId, branchId, role } = req.user!;
      const { categoryId } = req.params;

      const { deleteCategoryUseCase } = CategoryFactory.build();

      const result = await deleteCategoryUseCase.execute({
        tenantId,
        userId: employeeId,
        categoryId,
      });
      if (!result.ok) {
        return res.status(400).json({
          error: "Bad Request",
          message: result.error,
        });
      }

      const auditWriter: AuditWriterPort | undefined = (req as any).app?.locals
        ?.auditWriterPort;
      if (auditWriter?.write) {
        void auditWriter
          .write({
            tenantId,
            branchId,
            employeeId,
            actorRole: role ?? null,
            actionType: "MENU_CATEGORY_UPDATED",
            resourceType: "menu_category",
            resourceId: categoryId,
            details: { changes: { isActive: false } },
          })
          .catch(() => {});
      }

      return res.status(200).json({
        message: "Category deleted successfully",
      });
    } catch (error) {
      next(error);
    }
  }
}
