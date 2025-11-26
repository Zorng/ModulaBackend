// src/platform/http/middleware/auth.ts
import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import "express";

declare module "express" {
  interface Request {
    user?: {
      tenantId: string;
      roles: string[];
    };
  }
}

export type AuthenticatedUser = {
  tenantId: string;
  roles: string[];
};

const JWT_SECRET = process.env.JWT_SECRET || "dev-secret";

export function authenticate(req: Request, res: Response, next: NextFunction) {
  // Get authorization header
  const authHeader = req.headers["authorization"];

  // Debug: Log what we received
  console.log("🔍 [Auth Debug] Raw Authorization header:", authHeader);
  console.log("🔍 [Auth Debug] Type of header:", typeof authHeader);

  if (!authHeader) {
    console.log("❌ [Auth Debug] No authorization header");
    return res.status(401).json({
      error: "Unauthorized",
      message: "Missing Authorization header",
    });
  }

  // Extract token - handle both "Bearer token" and just "token"
  let token: string;

  if (authHeader.startsWith("Bearer ")) {
    token = authHeader.substring(7); // Remove "Bearer " (7 characters)
  } else if (authHeader.startsWith("bearer ")) {
    token = authHeader.substring(7); // Handle lowercase
  } else {
    token = authHeader; // Assume it's just the token
  }

  // Remove any quotes that might have been added
  token = token.replace(/^["']|["']$/g, "");

  // Debug: Log extracted token
  console.log(
    "🔍 [Auth Debug] Extracted token:",
    token.substring(0, 20) + "..."
  );
  console.log("🔍 [Auth Debug] Token length:", token.length);
  console.log("🔍 [Auth Debug] Token parts:", token.split(".").length);
  console.log("🔍 [Auth Debug] Using secret:", JWT_SECRET);

  try {
    // Verify token
    const decoded = jwt.verify(token, JWT_SECRET) as AuthenticatedUser;

    console.log("✅ [Auth Debug] Token verified successfully");
    console.log("✅ [Auth Debug] Decoded payload:", decoded);

    req.user = decoded;
    next();
  } catch (err) {
    console.error("❌ [Auth Debug] Token verification failed:", err);

    if (err instanceof jwt.JsonWebTokenError) {
      console.error("❌ [Auth Debug] JWT Error name:", err.name);
      console.error("❌ [Auth Debug] JWT Error message:", err.message);
    }

    return res.status(401).json({
      error: "Unauthorized",
      message: "Invalid or expired token",
      debug:
        process.env.NODE_ENV === "development"
          ? {
              error: err instanceof Error ? err.message : "Unknown error",
              tokenPreview: token.substring(0, 20) + "...",
            }
          : undefined,
    });
  }
}

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
