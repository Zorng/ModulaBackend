import { Router, type Response } from "express";
import { requireV0Auth, type V0AuthRequest } from "../../auth/api/middleware.js";
import { V0AttendanceError, V0AttendanceService } from "../app/service.js";

export function createV0AttendanceRouter(service: V0AttendanceService): Router {
  const router = Router();

  router.post("/check-in", requireV0Auth, async (req: V0AuthRequest, res: Response) => {
    try {
      const actor = req.v0Auth;
      if (!actor) {
        res.status(401).json({ success: false, error: "authentication required" });
        return;
      }

      const data = await service.checkIn({
        actor,
        occurredAt: req.body?.occurredAt,
      });
      res.status(201).json({ success: true, data });
    } catch (error) {
      handleError(res, error);
    }
  });

  router.post("/check-out", requireV0Auth, async (req: V0AuthRequest, res: Response) => {
    try {
      const actor = req.v0Auth;
      if (!actor) {
        res.status(401).json({ success: false, error: "authentication required" });
        return;
      }

      const data = await service.checkOut({
        actor,
        occurredAt: req.body?.occurredAt,
      });
      res.status(201).json({ success: true, data });
    } catch (error) {
      handleError(res, error);
    }
  });

  router.get("/me", requireV0Auth, async (req: V0AuthRequest, res: Response) => {
    try {
      const actor = req.v0Auth;
      if (!actor) {
        res.status(401).json({ success: false, error: "authentication required" });
        return;
      }

      const data = await service.listMine({
        actor,
        limit: Number(req.query?.limit ?? 50),
      });
      res.status(200).json({ success: true, data });
    } catch (error) {
      handleError(res, error);
    }
  });

  return router;
}

function handleError(res: Response, error: unknown): void {
  if (error instanceof V0AttendanceError) {
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
