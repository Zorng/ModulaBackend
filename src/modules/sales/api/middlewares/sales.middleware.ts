import { Request, Response, NextFunction } from 'express';
import type { AuthRequest } from "../../../../platform/security/auth.js";

export function salesMiddleware(req: Request, res: Response, next: NextFunction) {
  // Add sales-specific middleware logic here
  // For example: check if user has permission to access sales in this branch
  const authReq = req as AuthRequest;
  
  if (!authReq.user || !authReq.user.branchId) {
    return res.status(403).json({
      success: false,
      error: 'User must be assigned to a branch to access sales'
    });
  }
  
  next();
}
