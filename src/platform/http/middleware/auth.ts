// src/platform/http/middleware/auth.ts

import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

declare module "express" {
  interface Request {
    user?: {
      employeeId: string;
      tenantId: string;
      branchId?: string;
      role: string;
    };
  }
}

const JWT_SECRET = process.env.JWT_SECRET || "dev-secret";

export function authenticate(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers["authorization"];
  if (
    !authHeader ||
    !(authHeader.startsWith("Bearer ") || authHeader.startsWith("bearer "))
  ) {
    return res.status(401).json({
      error: "Unauthorized",
      message: "Missing or invalid authorization header",
    });
  }
  let token = authHeader.substring(7).replace(/^['"]|['"]$/g, "");
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as {
      employeeId: string;
      tenantId: string;
      branchId?: string;
      role: string;
    };
    // Optionally, you can fetch employee status from DB here if needed
    req.user = decoded;
    next();
  } catch (err) {
    return res
      .status(401)
      .json({ error: "Unauthorized", message: "Invalid or expired token" });
  }
}

export function requireRole(allowedRoles: string[] | string) {
  return (req: Request, res: Response, next: NextFunction) => {
    const user = req.user;
    if (!user) {
      return res
        .status(401)
        .json({ error: "Unauthorized", message: "Not authenticated" });
    }
    const rolesToCheck = Array.isArray(allowedRoles)
      ? allowedRoles
      : [allowedRoles];
    // Check user.role
    if (user.role && rolesToCheck.includes(user.role)) {
      return next();
    }
    return res.status(403).json({
      error: "Forbidden",
      message: `Requires role: ${rolesToCheck.join(", ")}`,
    });
  };
}
