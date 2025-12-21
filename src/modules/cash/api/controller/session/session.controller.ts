import { Response } from "express";
import type { AuthRequest } from "../../../../../platform/security/auth.js";
import type {
  OpenCashSessionUseCase,
  TakeOverSessionUseCase,
  CloseCashSessionUseCase,
  GetActiveSessionUseCase,
  OpenCashSessionInput,
  TakeOverSessionInput,
  CloseCashSessionInput,
  GetActiveSessionInput,
} from "../../../app/index.js";
import {
  openSessionBodySchema,
  takeOverSessionBodySchema,
  closeSessionBodySchema,
  getActiveSessionQuerySchema,
} from "../../dto/index.js";

export class SessionController {
  constructor(
    private openSessionUseCase: OpenCashSessionUseCase,
    private takeOverSessionUseCase: TakeOverSessionUseCase,
    private closeSessionUseCase: CloseCashSessionUseCase,
    private getActiveSessionUseCase: GetActiveSessionUseCase
  ) {}

  async openSession(req: AuthRequest, res: Response) {
    try {
      const validatedData = openSessionBodySchema.parse(req.body);

      const input: OpenCashSessionInput = {
        tenantId: req.user!.tenantId,
        branchId: validatedData.branchId || req.user!.branchId,
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
      // Authorization check: Only managers and admins can take over sessions
      if (!["MANAGER", "ADMIN"].includes(req.user!.role)) {
        return res.status(403).json({
          success: false,
          error: "Only managers and admins can take over sessions",
        });
      }

      const validatedData = takeOverSessionBodySchema.parse(req.body);

      const input: TakeOverSessionInput = {
        tenantId: req.user!.tenantId,
        branchId: validatedData.branchId || req.user!.branchId,
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
      const { branchId, registerId } = req.query;

      // registerId is now optional - if not provided, search by branch
      const input: GetActiveSessionInput = {
        tenantId: req.user!.tenantId,
        branchId:
          (branchId && typeof branchId === "string" ? branchId : undefined) ||
          req.user!.branchId,
        registerId:
          registerId && typeof registerId === "string" ? registerId : undefined,
      };

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
          error: registerId
            ? "No active session found for this register"
            : "No active session found for this branch",
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

  private handleError(res: Response, error: unknown) {
    console.error("Session Controller Error:", error);

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
