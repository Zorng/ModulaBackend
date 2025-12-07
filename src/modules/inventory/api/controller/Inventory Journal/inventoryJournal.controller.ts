import { Response } from "express";
import { AuthRequest } from "#modules/auth/api/middleware/auth.middleware.js";
import {
  ReceiveStockUseCase,
  WasteStockUseCase,
  CorrectStockUseCase,
  RecordSaleDeductionsUseCase,
  RecordVoidUseCase,
  RecordReopenUseCase,
  GetOnHandUseCase,
  GetInventoryJournalUseCase,
  GetLowStockAlertsUseCase,
  GetInventoryExceptionsUseCase,
} from "../../../app/inventoryjournal-usecase/index.js";

export class InventoryJournalController {
  constructor(
    private receiveStockUseCase: ReceiveStockUseCase,
    private wasteStockUseCase: WasteStockUseCase,
    private correctStockUseCase: CorrectStockUseCase,
    private recordSaleDeductionsUseCase: RecordSaleDeductionsUseCase,
    private recordVoidUseCase: RecordVoidUseCase,
    private recordReopenUseCase: RecordReopenUseCase,
    private getOnHandUseCase: GetOnHandUseCase,
    private getInventoryJournalUseCase: GetInventoryJournalUseCase,
    private getLowStockAlertsUseCase: GetLowStockAlertsUseCase,
    private getInventoryExceptionsUseCase: GetInventoryExceptionsUseCase
  ) {}

  async receiveStock(req: AuthRequest, res: Response) {
    try {
      const { branchId, stockItemId, qty, note } = req.body;

      const result = await this.receiveStockUseCase.execute({
        tenantId: req.user!.tenantId,
        branchId: branchId || req.user!.branchId,
        stockItemId,
        qty,
        note,
        actorId: req.user!.employeeId,
      });

      if (!result.ok) {
        return res.status(400).json({ success: false, error: result.error });
      }

      res.status(201).json({ success: true, data: result.value });
    } catch (error) {
      this.handleError(res, error);
    }
  }

  async wasteStock(req: AuthRequest, res: Response) {
    try {
      const { branchId, stockItemId, qty, note } = req.body;

      const result = await this.wasteStockUseCase.execute({
        tenantId: req.user!.tenantId,
        branchId: branchId || req.user!.branchId,
        stockItemId,
        qty,
        note,
        actorId: req.user!.employeeId,
      });

      if (!result.ok) {
        return res.status(400).json({ success: false, error: result.error });
      }

      res.status(201).json({ success: true, data: result.value });
    } catch (error) {
      this.handleError(res, error);
    }
  }

  async correctStock(req: AuthRequest, res: Response) {
    try {
      const { branchId, stockItemId, delta, note } = req.body;

      const result = await this.correctStockUseCase.execute({
        tenantId: req.user!.tenantId,
        branchId: branchId || req.user!.branchId,
        stockItemId,
        delta,
        note,
        actorId: req.user!.employeeId,
      });

      if (!result.ok) {
        return res.status(400).json({ success: false, error: result.error });
      }

      res.status(201).json({ success: true, data: result.value });
    } catch (error) {
      this.handleError(res, error);
    }
  }

  async recordSaleDeductions(req: AuthRequest, res: Response) {
    try {
      const { refSaleId, lines } = req.body;

      const result = await this.recordSaleDeductionsUseCase.execute({
        tenantId: req.user!.tenantId,
        branchId: req.user!.branchId,
        refSaleId,
        lines,
      });

      if (!result.ok) {
        return res.status(400).json({ success: false, error: result.error });
      }

      res.status(201).json({ success: true, data: result.value });
    } catch (error) {
      this.handleError(res, error);
    }
  }

  async recordVoid(req: AuthRequest, res: Response) {
    try {
      const { refSaleId, originalLines } = req.body;

      const result = await this.recordVoidUseCase.execute({
        tenantId: req.user!.tenantId,
        branchId: req.user!.branchId,
        refSaleId,
        originalLines,
      });

      if (!result.ok) {
        return res.status(400).json({ success: false, error: result.error });
      }

      res.status(201).json({ success: true, data: result.value });
    } catch (error) {
      this.handleError(res, error);
    }
  }

  async recordReopen(req: AuthRequest, res: Response) {
    try {
      const { originalSaleId, newSaleId, lines } = req.body;

      const result = await this.recordReopenUseCase.execute({
        tenantId: req.user!.tenantId,
        branchId: req.user!.branchId,
        originalSaleId,
        newSaleId,
        lines,
      });

      if (!result.ok) {
        return res.status(400).json({ success: false, error: result.error });
      }

      res.status(201).json({ success: true, data: result.value });
    } catch (error) {
      this.handleError(res, error);
    }
  }

  async getOnHand(req: AuthRequest, res: Response) {
    try {
      const result = await this.getOnHandUseCase.execute({
        tenantId: req.user!.tenantId,
        branchId: req.user!.branchId,
      });

      res.json({ success: true, data: result });
    } catch (error) {
      this.handleError(res, error);
    }
  }

  async getInventoryJournal(req: AuthRequest, res: Response) {
    try {
      const { stockItemId, reason, fromDate, toDate, page, pageSize } =
        req.query;

      const result = await this.getInventoryJournalUseCase.execute({
        branchId: req.user!.branchId,
        stockItemId: stockItemId as string,
        reason: reason as any,
        fromDate: fromDate ? new Date(fromDate as string) : undefined,
        toDate: toDate ? new Date(toDate as string) : undefined,
        page: page ? parseInt(page as string) : undefined,
        pageSize: pageSize ? parseInt(pageSize as string) : undefined,
      });

      if (!result.ok) {
        return res.status(400).json({ success: false, error: result.error });
      }

      res.json({ success: true, data: result.value });
    } catch (error) {
      this.handleError(res, error);
    }
  }

  async getLowStockAlerts(req: AuthRequest, res: Response) {
    try {
      const result = await this.getLowStockAlertsUseCase.execute(
        req.user!.branchId
      );

      if (!result.ok) {
        return res.status(400).json({ success: false, error: result.error });
      }

      res.json({ success: true, data: result.value });
    } catch (error) {
      this.handleError(res, error);
    }
  }

  async getInventoryExceptions(req: AuthRequest, res: Response) {
    try {
      const result = await this.getInventoryExceptionsUseCase.execute(
        req.user!.branchId
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
    console.error("InventoryJournal controller error:", error);
    const message =
      error instanceof Error ? error.message : "Internal server error";
    res.status(500).json({ success: false, error: message });
  }
}
