import { Router, type Response } from "express";
import { requireV0Auth, type V0AuthRequest } from "../../auth/api/middleware.js";
import { V0SubscriptionError, V0SubscriptionService } from "../app/service.js";

export function createV0SubscriptionRouter(service: V0SubscriptionService): Router {
  const router = Router();

  router.get("/state/current", requireV0Auth, async (req: V0AuthRequest, res: Response) => {
    try {
      const actor = req.v0Auth;
      if (!actor) {
        res.status(401).json({ success: false, error: "authentication required" });
        return;
      }
      const data = await service.getCurrentSubscriptionState({ actor });
      res.status(200).json({ success: true, data });
    } catch (error) {
      handleError(res, error);
    }
  });

  router.get(
    "/entitlements/current-branch",
    requireV0Auth,
    async (req: V0AuthRequest, res: Response) => {
      try {
        const actor = req.v0Auth;
        if (!actor) {
          res.status(401).json({ success: false, error: "authentication required" });
          return;
        }
        const data = await service.getCurrentBranchEntitlements({ actor });
        res.status(200).json({ success: true, data });
      } catch (error) {
        handleError(res, error);
      }
    }
  );

  return router;
}

function handleError(res: Response, error: unknown): void {
  if (error instanceof V0SubscriptionError) {
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
