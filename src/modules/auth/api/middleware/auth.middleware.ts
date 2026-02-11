import { Request, Response, NextFunction } from "express";
import { TokenService } from "../../app/token.service.js";
import { AuthRepository } from "../../infra/repository.js";

export interface AuthRequest extends Request {
  user?: {
    tenantId: string;
    employeeId: string;
    branchId: string;
    role: string;
  };
}

export class AuthMiddleware {
  constructor(
    private tokenService: TokenService,
    private authRepo: AuthRepository
  ) {}

  authenticate = async (
    req: AuthRequest,
    res: Response,
    next: NextFunction
  ) => {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return res
          .status(401)
          .json({ error: "Missing or invalid authorization header" });
      }

      const token = authHeader.substring(7);
      const claims = this.tokenService.verifyAccessToken(token);

      if (
        !claims ||
        typeof claims.employeeId !== "string" ||
        typeof claims.tenantId !== "string" ||
        typeof claims.branchId !== "string" ||
        claims.branchId.length === 0 ||
        typeof claims.role !== "string"
      ) {
        return res.status(401).json({ error: "Invalid or expired token" });
      }

      const employee = await this.authRepo.findEmployeeById(claims.employeeId);
      if (!employee || employee.status !== "ACTIVE") {
        return res
          .status(401)
          .json({ error: "Employee not found or inactive" });
      }

      if (employee.tenant_id !== claims.tenantId) {
        return res.status(401).json({ error: "Invalid tenant context" });
      }

      const assignment = await this.authRepo.findEmployeeBranchAssignment(
        employee.id,
        claims.branchId
      );
      if (!assignment) {
        return res.status(401).json({ error: "Invalid branch context" });
      }

      req.user = {
        employeeId: claims.employeeId,
        tenantId: claims.tenantId,
        branchId: assignment.branch_id,
        role: assignment.role,
      };
      next();
    } catch (error) {
      res.status(401).json({ error: "Authentication failed" });
    }
  };

  requireRole = (allowedRoles: string[]) => {
    return (req: AuthRequest, res: Response, next: NextFunction) => {
      if (!req.user) {
        return res.status(401).json({ error: "Authentication required" });
      }

      if (!allowedRoles.includes(req.user.role)) {
        return res
          .status(403)
          .json({ error: "Insufficient permissions for this action" });
      }

      next();
    };
  };
}
