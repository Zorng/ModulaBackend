import jwt from "jsonwebtoken";
import type { Request } from "express";
import type { V0Claims } from "./types.js";

export function getClaimsFromRequest(
  req: Request,
  jwtSecret: string
): V0Claims | null {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return null;
  }
  const token = authHeader.slice("Bearer ".length).trim();
  if (!token) {
    return null;
  }
  try {
    const decoded = jwt.verify(token, jwtSecret) as V0Claims;
    if (!decoded || decoded.scope !== "v0" || typeof decoded.accountId !== "string") {
      return null;
    }
    return decoded;
  } catch {
    return null;
  }
}
