import { Response } from "express";
import { AuthRequest } from "../../../auth/api/middleware/auth.middleware.js";
import type {
  OpenCashSessionUseCase,
  TakeOverSessionUseCase,
  CloseCashSessionUseCase,
  RecordCashMovementUseCase,
  GetActiveSessionUseCase,
  GenerateZReportUseCase,
  GenerateXReportUseCase,
  OpenCashSessionInput,
  TakeOverSessionInput,
  CloseCashSessionInput,
  RecordCashMovementInput,
  GetActiveSessionInput,
  GenerateZReportInput,
  GenerateXReportInput,
} from "../../app/index.js";
import {
  openSessionBodySchema,
  takeOverSessionBodySchema,
  closeSessionBodySchema,
  recordMovementBodySchema,
  getActiveSessionQuerySchema,
  getZReportParamsSchema,
  getXReportQuerySchema,
} from "../dto/index.js";

export class CashController {
  constructor(
    private openSessionUseCase: OpenCashSessionUseCase,
    private takeOverSessionUseCase: TakeOverSessionUseCase,
    private closeSessionUseCase: CloseCashSessionUseCase,
    private recordMovementUseCase: RecordCashMovementUseCase,
    private getActiveSessionUseCase: GetActiveSessionUseCase,
    private generateZReportUseCase: GenerateZReportUseCase,
    private generateXReportUseCase: GenerateXReportUseCase
  ) {}

  // ==================== Session Management ====================

  async openSession(req: AuthRequest, res: Response) {
    try {
      const validatedData = openSessionBodySchema.parse(req.body);

      const input: OpenCashSessionInput = {
        tenantId: req.user!.tenantId,
        branchId: req.user!.branchId,
        registerId: validatedData.registerId,
        openedBy: req.user!.employeeId,
        openingFloatUsd: validatedData.openingFloatUsd,
        openingFloatKhr: validatedData.openingFloatKhr,
        note: validatedData.note,
      };

      const result = await this.openSessionUseCase.execute(input);

      if (!result.ok) {
        return res.status(400).json({
          success: false,
          error: result.error,
        });
      }

      res.status(201).json({
        success: true,
        data: result.value,
      });
    } catch (error) {
      this.handleError(res, error);
    }
  }

  async takeOverSession(req: AuthRequest, res: Response) {
    try {
      const validatedData = takeOverSessionBodySchema.parse(req.body);

      const input: TakeOverSessionInput = {
        tenantId: req.user!.tenantId,
        branchId: req.user!.branchId,
        registerId: validatedData.registerId,
        newOpenedBy: req.user!.employeeId,
        reason: validatedData.reason,
        openingFloatUsd: validatedData.openingFloatUsd,
        openingFloatKhr: validatedData.openingFloatKhr,
      };

      const result = await this.takeOverSessionUseCase.execute(input);

      if (!result.ok) {
        return res.status(400).json({
          success: false,
          error: result.error,
        });
      }

      res.status(201).json({
        success: true,
        data: result.value,
      });
    } catch (error) {
      this.handleError(res, error);
    }
  }

  async closeSession(req: AuthRequest, res: Response) {
    try {
      const { sessionId } = req.params;
      const validatedData = closeSessionBodySchema.parse(req.body);

      const input: CloseCashSessionInput = {
        sessionId,
        closedBy: req.user!.employeeId,
        countedCashUsd: validatedData.countedCashUsd,
        countedCashKhr: validatedData.countedCashKhr,
        note: validatedData.note,
      };

      const result = await this.closeSessionUseCase.execute(input);

      if (!result.ok) {
        return res.status(400).json({
          success: false,
          error: result.error,
        });
      }

      res.json({
        success: true,
        data: result.value,
      });
    } catch (error) {
      this.handleError(res, error);
    }
  }

  async getActiveSession(req: AuthRequest, res: Response) {
    try {
      const { registerId } = req.query;

      if (!registerId || typeof registerId !== "string") {
        return res.status(400).json({
          success: false,
          error: "registerId query parameter is required",
        });
      }

      const input: GetActiveSessionInput = { registerId };

      const result = await this.getActiveSessionUseCase.execute(input);

      if (!result.ok) {
        return res.status(400).json({
          success: false,
          error: result.error,
        });
      }

      if (!result.value) {
        return res.status(404).json({
          success: false,
          error: "No active session found for this register",
        });
      }

      res.json({
        success: true,
        data: result.value,
      });
    } catch (error) {
      this.handleError(res, error);
    }
  }

  // ==================== Cash Movements ====================

  async recordMovement(req: AuthRequest, res: Response) {
    try {
      const { sessionId } = req.params;
      const validatedData = recordMovementBodySchema.parse(req.body);

      // Get session to extract registerId (alternatively, pass it in body/query)
      const activeSessionResult = await this.getActiveSessionUseCase.execute({
        registerId: req.body.registerId, // Assuming registerId is passed
      });

      if (!activeSessionResult.ok || !activeSessionResult.value) {
        return res.status(400).json({
          success: false,
          error: "No active session found",
        });
      }

      const input: RecordCashMovementInput = {
        tenantId: req.user!.tenantId,
        branchId: req.user!.branchId,
        registerId: activeSessionResult.value.registerId,
        sessionId,
        actorId: req.user!.employeeId,
        type: validatedData.type,
        amountUsd: validatedData.amountUsd,
        amountKhr: validatedData.amountKhr,
        reason: validatedData.reason,
        requiresApproval: false, // TODO: Add policy check
      };

      const result = await this.recordMovementUseCase.execute(input);

      if (!result.ok) {
        return res.status(400).json({
          success: false,
          error: result.error,
        });
      }

      res.status(201).json({
        success: true,
        data: result.value,
      });
    } catch (error) {
      this.handleError(res, error);
    }
  }

  // ==================== Reports ====================

  async getZReport(req: AuthRequest, res: Response) {
    try {
      const { sessionId } = req.params;

      const input: GenerateZReportInput = { sessionId };

      const result = await this.generateZReportUseCase.execute(input);

      if (!result.ok) {
        return res.status(400).json({
          success: false,
          error: result.error,
        });
      }

      res.json({
        success: true,
        data: result.value,
      });
    } catch (error) {
      this.handleError(res, error);
    }
  }

  async getXReport(req: AuthRequest, res: Response) {
    try {
      const { registerId } = req.query;

      if (!registerId || typeof registerId !== "string") {
        return res.status(400).json({
          success: false,
          error: "registerId query parameter is required",
        });
      }

      const input: GenerateXReportInput = { registerId };

      const result = await this.generateXReportUseCase.execute(input);

      if (!result.ok) {
        return res.status(400).json({
          success: false,
          error: result.error,
        });
      }

      if (!result.value) {
        return res.status(404).json({
          success: false,
          error: "No active session found for X report",
        });
      }

      res.json({
        success: true,
        data: result.value,
      });
    } catch (error) {
      this.handleError(res, error);
    }
  }

  // ==================== Error Handling ====================

  private handleError(res: Response, error: unknown) {
    console.error("Cash Controller Error:", error);

    if (error instanceof Error && error.name === "ZodError") {
      return res.status(422).json({
        success: false,
        error: "Validation error",
        details: error,
      });
    }

    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : "Internal server error",
    });
  }
}
