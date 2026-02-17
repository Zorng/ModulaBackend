import type { Pool } from "pg";
import { Router, type Response } from "express";
import { requireV0Auth, type V0AuthRequest } from "../../../auth/api/middleware.js";
import { V0AuthError } from "../../../auth/app/service.js";
import { V0OrgAccountError } from "../../common/error.js";
import { V0TenantService } from "../app/service.js";
import { executeTenantProvisioningCommand } from "./tenant-provisioning.command.js";

export function createV0TenantRouter(service: V0TenantService, db: Pool): Router {
  const router = Router();

  router.post("/tenants", requireV0Auth, async (req: V0AuthRequest, res: Response) => {
    const requesterAccountId = req.v0Auth?.accountId;
    const idempotencyKey = readIdempotencyKey(req.headers);
    try {
      if (!requesterAccountId) {
        res.status(401).json({ success: false, error: "authentication required" });
        return;
      }

      const data = await executeTenantProvisioningCommand({
        db,
        requesterAccountId,
        tenantName: req.body?.tenantName,
        idempotencyKey,
        endpoint: "/v0/org/tenants",
      });

      res.status(201).json({ success: true, data });
    } catch (error) {
      handleError(res, error);
    }
  });

  router.get("/tenant/current", requireV0Auth, async (req: V0AuthRequest, res: Response) => {
    try {
      const actor = req.v0Auth;
      if (!actor) {
        res.status(401).json({ success: false, error: "authentication required" });
        return;
      }

      const data = await service.getCurrentTenantProfile({ actor });
      res.status(200).json({ success: true, data });
    } catch (error) {
      handleError(res, error);
    }
  });

  return router;
}

function readIdempotencyKey(headers: Record<string, string | string[] | undefined>): string | null {
  const raw = headers["idempotency-key"];
  if (Array.isArray(raw)) {
    return normalizeOptionalString(raw[0]);
  }
  return normalizeOptionalString(raw);
}

function normalizeOptionalString(input: unknown): string | null {
  const normalized = String(input ?? "").trim();
  return normalized ? normalized : null;
}

function handleError(res: Response, error: unknown): void {
  if (error instanceof V0AuthError || error instanceof V0OrgAccountError) {
    res.status(error.statusCode).json({
      success: false,
      error: error.message,
      code: error.code ?? undefined,
    });
    return;
  }

  res.status(500).json({
    success: false,
    error: error instanceof Error ? error.message : "internal server error",
  });
}
