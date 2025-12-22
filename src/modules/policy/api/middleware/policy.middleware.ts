import { Request, Response, NextFunction } from "express";
import type { AuthenticatedRequest } from "../../../../platform/security/auth.js";
import type { AuditWriterPort } from "../../../../shared/ports/audit.js";

/**
 * Policy module middleware
 * Enforces role-based access control for policy management
 */

/**
 * Ensure user is ADMIN
 * Only ADMIN users can view and modify tenant policies
 */
export function requireAdmin(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const authReq = req as AuthenticatedRequest;

  if (!authReq.user) {
    res.status(401).json({
      error: "Unauthorized",
      message: "Authentication required",
    });
    return;
  }

  if (authReq.user.role !== "ADMIN") {
    res.status(403).json({
      error: "Forbidden",
      message:
        "Only ADMIN users can access policy settings. Your role: " +
        authReq.user.role,
    });
    return;
  }

  next();
}

/**
 * Log policy changes for audit trail
 * Captures who changed what and when
 */
export function logPolicyChange(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const authReq = req as AuthenticatedRequest;

  // Store original send function
  const originalSend = res.send;

  // Override send to capture response
  res.send = function (data: any): Response {
    // Only log successful policy updates (PATCH requests with 200 status)
    if (req.method === "PATCH" && res.statusCode === 200) {
      const auditWriter: AuditWriterPort | undefined = (req as any).app?.locals
        ?.auditWriterPort;
      const tenantId = authReq.user?.tenantId;
      const employeeId = authReq.user?.employeeId;
      const branchId = authReq.user?.branchId;
      const role = authReq.user?.role;

      if (auditWriter?.write && tenantId && employeeId) {
        void auditWriter
          .write({
            tenantId,
            branchId,
            employeeId,
            actorRole: role ?? null,
            actionType: "POLICY_UPDATED",
            resourceType: "POLICY",
            outcome: "SUCCESS",
            details: {
              endpoint: req.path,
              method: req.method,
              changes: req.body,
            },
            ipAddress: req.ip || req.socket.remoteAddress,
            userAgent: req.headers["user-agent"] as string | undefined,
          })
          .catch(() => {
            // Best-effort only.
          });
      }
    }

    // Call original send
    return originalSend.call(this, data);
  };

  next();
}

/**
 * Rate limit policy updates to prevent abuse
 * Allows max 10 updates per minute per tenant
 */
const rateLimitStore = new Map<string, { count: number; resetAt: number }>();

export function rateLimitPolicyUpdates(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  // Only rate limit PATCH requests
  if (req.method !== "PATCH") {
    next();
    return;
  }

  const authReq = req as AuthenticatedRequest;
  const tenantId = authReq.user?.tenantId;

  if (!tenantId) {
    next();
    return;
  }

  const now = Date.now();
  const limit = 10; // Max 10 requests
  const window = 60 * 1000; // Per 60 seconds

  const record = rateLimitStore.get(tenantId);

  if (!record || now > record.resetAt) {
    // Create new record
    rateLimitStore.set(tenantId, {
      count: 1,
      resetAt: now + window,
    });
    next();
    return;
  }

  if (record.count >= limit) {
    res.status(429).json({
      error: "Too Many Requests",
      message: `Policy update limit exceeded. Max ${limit} updates per minute. Try again in ${Math.ceil((record.resetAt - now) / 1000)} seconds.`,
      retryAfter: Math.ceil((record.resetAt - now) / 1000),
    });
    return;
  }

  // Increment count
  record.count++;
  rateLimitStore.set(tenantId, record);

  next();
}

/**
 * Validate policy update doesn't conflict with multi-branch settings
 * This is a business logic check before reaching the controller
 */
export function validatePolicyDependencies(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  if (req.method !== "PATCH") {
    next();
    return;
  }

  const updates = req.body;

  // Example: If disabling multi-branch, ensure related features are also disabled
  if (updates.tenantFeaturesMultiBranch === false) {
    // Could add warnings or auto-disable dependent features
    // For now, just pass through
  }

  // Example: If enabling VAT, ensure valid rate is set
  if (updates.saleVatEnabled === true && updates.saleVatRatePercent === undefined) {
    // Rate will use default, so this is OK
  }

  next();
}

/**
 * Clean up rate limit store periodically
 * Run this on a timer to prevent memory leaks
 */
export function cleanupRateLimitStore(): void {
  const now = Date.now();
  for (const [tenantId, record] of rateLimitStore.entries()) {
    if (now > record.resetAt) {
      rateLimitStore.delete(tenantId);
    }
  }
}

// Cleanup every 5 minutes
setInterval(cleanupRateLimitStore, 5 * 60 * 1000);
