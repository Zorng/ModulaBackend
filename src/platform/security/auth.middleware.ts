import { Request, Response, NextFunction } from 'express';

export interface AuthRequest extends Request {
  user: {
    id: string;
    employeeId: string;
    tenantId: string;
    branchId: string;
    role: string;
  };
}

// Default stub middleware (should be replaced by actual auth middleware during bootstrap)
export let authMiddleware = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  // This is a stub - should be replaced with actual auth middleware
  // For now, just continue without authentication
  console.warn('Auth middleware not initialized - using stub');
  next();
};

export function setAuthMiddleware(middleware: (req: Request, res: Response, next: NextFunction) => void | Promise<void>) {
  authMiddleware = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    await middleware(req, res, next);
  };
}
