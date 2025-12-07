import { Response } from "express";
import { AuthRequest } from "#modules/auth/api/middleware/auth.middleware.js";
import type {
  GenerateZReportUseCase,
  GenerateXReportUseCase,
  GenerateZReportInput,
  GenerateXReportInput,
} from "../../../app/index.js";
import { getZReportParamsSchema, getXReportQuerySchema } from "../../dto/index.js";

export class ReportController {
  constructor(
    private generateZReportUseCase: GenerateZReportUseCase,
    private generateXReportUseCase: GenerateXReportUseCase
  ) {}

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

  private handleError(res: Response, error: unknown) {
    console.error("Report Controller Error:", error);

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
