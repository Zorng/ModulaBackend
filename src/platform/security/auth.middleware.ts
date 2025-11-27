import { Request, Response, NextFunction } from 'express';

export interface AuthRequest extends Request {
  user: {
    employeeId: string;
    tenantId: string;
    branchId?: string;
    role: string;
  };
}

// Default stub middleware (should be replaced by actual auth middleware during bootstrap)
export let authMiddleware = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  // This is a stub - will be replaced by actual auth middleware when auth module initializes
  // For functional testing, use the auth endpoints to get a Bearer token first
  return res.status(401).json({ 
    error: 'Authentication required',
    message: 'Please login via /v1/auth/login to get a token, then include it in the Authorization header'
  });
};

export function setAuthMiddleware(middleware: (req: Request, res: Response, next: NextFunction) => void | Promise<void>) {
  authMiddleware = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    await middleware(req, res, next);
  };
}
