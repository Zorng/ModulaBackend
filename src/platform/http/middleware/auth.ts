import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import "express";

declare module "express-serve-static-core" {
  interface Request {
    user?: {
      id: string;
      tenantId: string;
      roles: string[];
    };
  }
}

export type AuthenticatedUser = {
  id: string;
  tenantId: string;
  roles: string[];
};

const JWT_SECRET = process.env.JWT_SECRET || "dev-secret"; // CHANGE IN PROD

// ------------------------------
// 1. Require Authentication
// ------------------------------
export function authenticate(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers["authorization"];
  if (!authHeader) {
    return res.status(401).json({
      error: "Unauthorized",
      message: "Missing Authorization header",
    });
  }

  const token = authHeader.replace("Bearer ", "");

  // Debug logging for troubleshooting
  if (process.env.NODE_ENV !== "production") {
    console.log("[AUTH] JWT_SECRET:", JWT_SECRET);
    console.log("[AUTH] Token received:", token);
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as AuthenticatedUser;
    req.user = decoded; // attach the user
    next();
  } catch (err) {
    if (process.env.NODE_ENV !== "production") {
      console.error("[AUTH] JWT verification error:", err);
    }
    return res.status(401).json({
      error: "Unauthorized",
      message: "Invalid or expired token",
      details: process.env.NODE_ENV !== "production" ? String(err) : undefined,
    });
  }
}

// ------------------------------
// 2. Optional authentication
// ------------------------------
export function optionalAuth(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers["authorization"];
  if (!authHeader) {
    return next(); // no user attached
  }

  const token = authHeader.replace("Bearer ", "");

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as AuthenticatedUser;
    req.user = decoded;
  } catch {
    // ignore invalid token — NOT blocking
  }

  next();
}

// ------------------------------
// 3. Require specific role
// ------------------------------
export function requireRole(role: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    const user = req.user;

    if (!user) {
      return res.status(401).json({
        error: "Unauthorized",
        message: "Not authenticated",
      });
    }

    if (!user.roles.includes(role)) {
      return res.status(403).json({
        error: "Forbidden",
        message: `Requires role: ${role}`,
      });
    }

    next();
  };
}
