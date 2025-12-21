import type { Request } from "express";
import type { RequestHandler } from "express";

export interface AuthContext {
  tenantId: string;
  employeeId: string;
  branchId: string;
  role: string;
}

export interface AuthenticatedRequest extends Request {
  user?: AuthContext;
}

export type AuthRequest = AuthenticatedRequest;

export interface AuthMiddlewarePort {
  authenticate: RequestHandler;
  requireRole?: (allowedRoles: string[]) => RequestHandler;
}

export type AuthMiddleware = AuthMiddlewarePort;
