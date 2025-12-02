import { Response } from "express";
import { AuthRequest } from "#modules/auth/api/middleware/auth.middleware.js";
import {
  CreateStockItemUseCase,
  UpdateStockItemUseCase,
  GetStockItemsUseCase,
} from "../../../app/stockitem-usecase/index.js";

export class StockItemController {
  constructor(
    private createStockItemUseCase: CreateStockItemUseCase,
    private updateStockItemUseCase: UpdateStockItemUseCase,
    private getStockItemsUseCase: GetStockItemsUseCase
  ) {}

  async createStockItem(req: AuthRequest, res: Response) {
    try {
      const { name, unitText, barcode, defaultCostUsd, categoryId, isActive } =
        req.body;

      let imageUrl = undefined;

      const result = await this.createStockItemUseCase.execute({
        tenantId: req.user!.tenantId,
        userId: req.user!.employeeId,
        name,
        unitText,
        barcode,
        defaultCostUsd,
        categoryId,
        imageUrl,
        imageFile: req.file ? req.file.buffer : undefined,
        imageFilename: req.file ? req.file.originalname : undefined,
        isActive: isActive ?? true,
      });

      if (!result.ok) {
        return res.status(400).json({ success: false, error: result.error });
      }

      res.status(201).json({ success: true, data: result.value });
    } catch (error) {
      this.handleError(res, error);
    }
  }

  async updateStockItem(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;
      const { name, unitText, barcode, defaultCostUsd, categoryId, isActive } =
        req.body;

      const imageUrl = req.file
        ? await req.app.locals.imageStorage.uploadImage(
            req.file.buffer,
            req.file.originalname,
            req.user!.tenantId
          )
        : undefined;

      const result = await this.updateStockItemUseCase.execute(
        id,
        req.user!.employeeId,
        {
          name,
          unitText,
          barcode,
          defaultCostUsd,
          categoryId,
          imageUrl,
          isActive,
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

  async getStockItems(req: AuthRequest, res: Response) {
    try {
      const { q, isActive, categoryId, page, pageSize } = req.query;

      const result = await this.getStockItemsUseCase.execute({
        tenantId: req.user!.tenantId,
        q: q as string,
        isActive:
          isActive === "true" ? true : isActive === "false" ? false : undefined,
        categoryId: categoryId as string,
        page: page ? parseInt(page as string) : undefined,
        pageSize: pageSize ? parseInt(pageSize as string) : undefined,
      });

      res.json({ success: true, data: result });
    } catch (error) {
      this.handleError(res, error);
    }
  }

  private handleError(res: Response, error: unknown) {
    console.error("StockItem controller error:", error);
    const message =
      error instanceof Error ? error.message : "Internal server error";
    res.status(500).json({ success: false, error: message });
  }
}
