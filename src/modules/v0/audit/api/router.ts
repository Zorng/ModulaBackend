import { Router, type Response } from "express";
import { requireV0Auth, type V0AuthRequest } from "../../auth/api/middleware.js";
import { V0AuditError, V0AuditService } from "../app/service.js";

export function createV0AuditRouter(service: V0AuditService): Router {
  const router = Router();

  router.get("/events", requireV0Auth, async (req: V0AuthRequest, res: Response) => {
    try {
      const actor = req.v0Auth;
      if (!actor) {
        res.status(401).json({ success: false, error: "authentication required" });
        return;
      }

      const data = await service.listTenantEvents({
        actor,
        branchId: queryAsString(req.query?.branchId),
        actionKey: queryAsString(req.query?.actionKey),
        outcome: queryAsString(req.query?.outcome),
        limit: queryAsNumber(req.query?.limit),
        offset: queryAsNumber(req.query?.offset),
      });
      res.status(200).json({ success: true, data });
    } catch (error) {
      handleError(res, error);
    }
  });

  return router;
}

function queryAsString(value: unknown): string | undefined {
  if (typeof value === "string") {
    return value;
  }
  if (Array.isArray(value) && typeof value[0] === "string") {
    return value[0];
  }
  return undefined;
}

function queryAsNumber(value: unknown): number | undefined {
  const raw = queryAsString(value);
  if (!raw) {
    return undefined;
  }
  return Number(raw);
}

function handleError(res: Response, error: unknown): void {
  if (error instanceof V0AuditError) {
    res.status(error.statusCode).json({
      success: false,
      error: error.message,
    });
    return;
  }

  res.status(500).json({
    success: false,
    error: error instanceof Error ? error.message : "internal server error",
  });
}
