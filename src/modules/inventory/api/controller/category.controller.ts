import { Response } from "express";
import type { AuthRequest } from "../../../../platform/security/auth.js";
import {
  CreateCategoryUseCase,
  GetCategoriesUseCase,
  UpdateCategoryUseCase,
  DeleteCategoryUseCase,
} from "../../app/category-usecase/index.js";

export class CategoryController {
  constructor(
    private createCategoryUseCase: CreateCategoryUseCase,
    private getCategoriesUseCase: GetCategoriesUseCase,
    private updateCategoryUseCase: UpdateCategoryUseCase,
    private deleteCategoryUseCase: DeleteCategoryUseCase
  ) {}

  async createCategory(req: AuthRequest, res: Response) {
    try {
      const { name, displayOrder, isActive } = req.body;

      const result = await this.createCategoryUseCase.execute({
        tenantId: req.user!.tenantId,
        name,
        displayOrder,
        isActive: isActive ?? true,
        userId: req.user!.employeeId,
      });

      if (!result.ok) {
        return res.status(400).json({ success: false, error: result.error });
      }

      return res.status(201).json({ success: true, data: result.value });
    } catch (error) {
      this.handleError(res, error);
    }
  }

  async getCategories(req: AuthRequest, res: Response) {
    try {
      const { isActive } = req.query;

      const result = await this.getCategoriesUseCase.execute({
        tenantId: req.user!.tenantId,
        isActive: isActive !== undefined ? isActive === "true" : undefined,
      });

      if (!result.ok) {
        return res.status(400).json({ success: false, error: result.error });
      }

      return res.status(200).json({ success: true, data: result.value });
    } catch (error) {
      this.handleError(res, error);
    }
  }

  async updateCategory(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;
      const { name, displayOrder, isActive } = req.body;

      const result = await this.updateCategoryUseCase.execute({
        categoryId: id,
        tenantId: req.user!.tenantId,
        name,
        displayOrder,
        isActive,
        userId: req.user!.employeeId,
      });

      if (!result.ok) {
        const statusCode = result.error.includes("not found") ? 404 : 400;
        return res
          .status(statusCode)
          .json({ success: false, error: result.error });
      }

      return res.status(200).json({ success: true, data: result.value });
    } catch (error) {
      this.handleError(res, error);
    }
  }

  async deleteCategory(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;
      const { safeMode } = req.query;

      const result = await this.deleteCategoryUseCase.execute({
        categoryId: id,
        tenantId: req.user!.tenantId,
        userId: req.user!.employeeId,
        safeMode: safeMode === "true",
      });

      if (!result.ok) {
        const statusCode = result.error.includes("not found") ? 404 : 400;
        return res
          .status(statusCode)
          .json({ success: false, error: result.error });
      }

      return res.status(204).send();
    } catch (error) {
      this.handleError(res, error);
    }
  }

  private handleError(res: Response, error: unknown) {
    console.error("Category controller error:", error);
    const message =
      error instanceof Error ? error.message : "Internal server error";
    res.status(500).json({ success: false, error: message });
  }
}
