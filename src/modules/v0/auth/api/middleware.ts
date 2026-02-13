import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";

type V0AuthClaims = {
  accountId: string;
  tenantId?: string | null;
  branchId?: string | null;
  scope?: string;
};

export interface V0AuthRequest extends Request {
  v0Auth?: {
    accountId: string;
    tenantId: string | null;
    branchId: string | null;
  };
}

export function requireV0Auth(
  req: V0AuthRequest,
  res: Response,
  next: NextFunction
): void {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    res.status(401).json({ success: false, error: "missing bearer token" });
    return;
  }

  const token = authHeader.slice("Bearer ".length).trim();
  const jwtSecret = process.env.JWT_SECRET ?? "dev-v0-jwt-secret";

  try {
    const claims = jwt.verify(token, jwtSecret) as V0AuthClaims;
    if (!claims || claims.scope !== "v0" || typeof claims.accountId !== "string") {
      res.status(401).json({ success: false, error: "invalid access token" });
      return;
    }

    req.v0Auth = {
      accountId: claims.accountId,
      tenantId: claims.tenantId ?? null,
      branchId: claims.branchId ?? null,
    };
    next();
  } catch {
    res.status(401).json({ success: false, error: "invalid access token" });
  }
}
