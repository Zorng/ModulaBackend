import { Router, type Response } from "express";
import { requireV0Auth, type V0AuthRequest } from "../../auth/api/middleware.js";
import { V0OrgAccountError, V0OrgAccountService } from "../app/service.js";

export function createV0OrgAccountRouter(service: V0OrgAccountService): Router {
  const router = Router();

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

  router.get(
    "/branches/accessible",
    requireV0Auth,
    async (req: V0AuthRequest, res: Response) => {
      try {
        const actor = req.v0Auth;
        if (!actor) {
          res.status(401).json({ success: false, error: "authentication required" });
          return;
        }

        const data = await service.listAccessibleBranches({ actor });
        res.status(200).json({ success: true, data });
      } catch (error) {
        handleError(res, error);
      }
    }
  );

  router.get("/branch/current", requireV0Auth, async (req: V0AuthRequest, res: Response) => {
    try {
      const actor = req.v0Auth;
      if (!actor) {
        res.status(401).json({ success: false, error: "authentication required" });
        return;
      }

      const data = await service.getCurrentBranchProfile({ actor });
      res.status(200).json({ success: true, data });
    } catch (error) {
      handleError(res, error);
    }
  });

  return router;
}

function handleError(res: Response, error: unknown): void {
  if (error instanceof V0OrgAccountError) {
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
