import { Response } from "express";
import { AuthRequest } from "../../../../auth/api/middleware/auth.middleware.js";
import type {
  CreateRegisterUseCase,
  UpdateRegisterUseCase,
  ListRegistersUseCase,
  DeleteRegisterUseCase,
  CreateRegisterInput,
  UpdateRegisterInput,
  ListRegistersInput,
  DeleteRegisterInput,
} from "../../../app/register-usecase/index.js";

export class RegisterController {
  constructor(
    private createRegisterUseCase: CreateRegisterUseCase,
    private updateRegisterUseCase: UpdateRegisterUseCase,
    private listRegistersUseCase: ListRegistersUseCase,
    private deleteRegisterUseCase: DeleteRegisterUseCase
  ) {}

  async createRegister(req: AuthRequest, res: Response) {
    try {
      // Authorization check: Only managers and admins can create registers
      if (!["MANAGER", "ADMIN"].includes(req.user!.role)) {
        return res.status(403).json({
          success: false,
          error: "Only managers and admins can create registers",
        });
      }

      const { branchId, name } = req.body;

      if (!name) {
        return res.status(400).json({
          success: false,
          error: "Register name is required",
        });
      }

      const input: CreateRegisterInput = {
        tenantId: req.user!.tenantId,
        branchId: branchId || req.user!.branchId,
        name,
        createdBy: req.user!.employeeId,
      };

      const result = await this.createRegisterUseCase.execute(input);

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

  async listRegisters(req: AuthRequest, res: Response) {
    try {
      const includeInactive = req.query.includeInactive === "true";

      const input: ListRegistersInput = {
        tenantId: req.user!.tenantId,
        branchId: req.user!.branchId,
        includeInactive,
      };

      const registers = await this.listRegistersUseCase.execute(input);

      res.json({
        success: true,
        data: registers,
      });
    } catch (error) {
      this.handleError(res, error);
    }
  }

  async updateRegister(req: AuthRequest, res: Response) {
    try {
      // Authorization check: Only managers and admins can update registers
      if (!["MANAGER", "ADMIN"].includes(req.user!.role)) {
        return res.status(403).json({
          success: false,
          error: "Only managers and admins can update registers",
        });
      }

      const { registerId } = req.params;
      const { name, status } = req.body;

      const input: UpdateRegisterInput = {
        registerId,
        tenantId: req.user!.tenantId,
        name,
        status,
      };

      const result = await this.updateRegisterUseCase.execute(input);

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

  async deleteRegister(req: AuthRequest, res: Response) {
    try {
      // Authorization check: Only managers and admins can delete registers
      if (!["MANAGER", "ADMIN"].includes(req.user!.role)) {
        return res.status(403).json({
          success: false,
          error: "Only managers and admins can delete registers",
        });
      }

      const { registerId } = req.params;

      const input: DeleteRegisterInput = {
        registerId,
        tenantId: req.user!.tenantId,
      };

      const result = await this.deleteRegisterUseCase.execute(input);

      if (!result.ok) {
        return res.status(400).json({
          success: false,
          error: result.error,
        });
      }

      res.status(204).send();
    } catch (error) {
      this.handleError(res, error);
    }
  }

  private handleError(res: Response, error: unknown) {
    console.error("Register Controller Error:", error);

    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : "Internal server error",
    });
  }
}
