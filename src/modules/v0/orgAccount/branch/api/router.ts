import type { Pool } from "pg";
import { Router, type Response } from "express";
import { requireV0Auth, type V0AuthRequest } from "../../../auth/api/middleware.js";
import { V0AuthError } from "../../../auth/app/service.js";
import { V0OrgAccountError } from "../../common/error.js";
import { V0BranchService } from "../app/service.js";
import {
  executeConfirmFirstBranchActivationCommand,
  executeInitiateFirstBranchActivationCommand,
} from "./first-branch-activation.command.js";

export function createV0BranchRouter(service: V0BranchService, db: Pool): Router {
  const router = Router();

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

  router.post(
    "/branch/first-activation/initiate",
    requireV0Auth,
    async (req: V0AuthRequest, res: Response) => {
      const actor = req.v0Auth;
      const idempotencyKey = readIdempotencyKey(req.headers);
      try {
        if (!actor) {
          res.status(401).json({ success: false, error: "authentication required" });
          return;
        }

        const data = await executeInitiateFirstBranchActivationCommand({
          db,
          actor,
          branchName: req.body?.branchName,
          idempotencyKey,
          actionKey: "org.branch.firstActivation.initiate",
          eventType: "ORG_BRANCH_FIRST_ACTIVATION_INITIATED",
          endpoint: "/v0/org/branch/first-activation/initiate",
        });
        res.status(data.created ? 201 : 200).json({ success: true, data });
      } catch (error) {
        handleError(res, error);
      }
    }
  );

  router.post(
    "/branch/first-activation/confirm",
    requireV0Auth,
    async (req: V0AuthRequest, res: Response) => {
      const actor = req.v0Auth;
      const idempotencyKey = readIdempotencyKey(req.headers);
      try {
        if (!actor) {
          res.status(401).json({ success: false, error: "authentication required" });
          return;
        }

        const data = await executeConfirmFirstBranchActivationCommand({
          db,
          actor,
          draftId: req.body?.draftId,
          paymentToken: req.body?.paymentToken,
          idempotencyKey,
          actionKey: "org.branch.firstActivation.confirm",
          eventType: "ORG_BRANCH_FIRST_ACTIVATED",
          endpoint: "/v0/org/branch/first-activation/confirm",
        });
        res.status(data.created ? 201 : 200).json({ success: true, data });
      } catch (error) {
        handleError(res, error);
      }
    }
  );

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
