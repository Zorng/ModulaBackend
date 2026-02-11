import { Response } from "express";
import type { AuthRequest } from "../../../../../platform/security/auth.js";
import type {
  RecordCashMovementUseCase,
  GetActiveSessionUseCase,
  RecordCashMovementInput,
  GetActiveSessionInput,
} from "../../../app/index.js";
import { recordMovementBodySchema } from "../../dto/index.js";

export class MovementController {
  constructor(
    private recordMovementUseCase: RecordCashMovementUseCase,
    private getActiveSessionUseCase: GetActiveSessionUseCase
  ) {}

  async recordMovement(req: AuthRequest, res: Response) {
    try {
      const { sessionId } = req.params;
      const validatedData = recordMovementBodySchema.parse(req.body);

      // Get active session to verify it exists and extract registerId (if any)
      const activeSessionResult = await this.getActiveSessionUseCase.execute({
        tenantId: req.body.tenantId || req.user!.tenantId,
        branchId: req.body.branchId || req.user!.branchId,
        registerId: req.body.registerId, // Optional - may be undefined
      });

      if (!activeSessionResult.ok || !activeSessionResult.value) {
        return res.status(400).json({
          success: false,
          error: "No active session found",
        });
      }

      const input: RecordCashMovementInput = {
        tenantId: req.body.tenantId || req.user!.tenantId,
        branchId: req.body.branchId || req.user!.branchId,
        registerId: activeSessionResult.value.registerId, // May be undefined for device-agnostic sessions
        sessionId,
        actorId: req.user!.employeeId,
        actorRole: req.user!.role,
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

  private handleError(res: Response, error: unknown) {
    console.error("Movement Controller Error:", error);

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
