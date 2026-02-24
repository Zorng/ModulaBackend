import type { Pool } from "pg";
import { Router, type Response } from "express";
import { requireV0Auth, type V0AuthRequest } from "../../../auth/api/middleware.js";
import { V0AuthError } from "../../../auth/app/service.js";
import { V0OrgAccountError } from "../../common/error.js";
import { V0BranchService } from "../app/service.js";
import {
  getIdempotencyKeyFromHeader,
  V0IdempotencyError,
  V0IdempotencyService,
} from "../../../../../platform/idempotency/service.js";
import {
  executeConfirmFirstBranchActivationCommand,
  executeInitiateFirstBranchActivationCommand,
} from "./first-branch-activation.command.js";
import { readOptionalHeaderString } from "../../../../../shared/utils/http.js";

export function createV0BranchRouter(input: {
  service: V0BranchService;
  db: Pool;
  idempotencyService: V0IdempotencyService;
}): Router {
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

        const data = await input.service.listAccessibleBranches({ actor });
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

      const data = await input.service.getCurrentBranchProfile({ actor });
      res.status(200).json({ success: true, data });
    } catch (error) {
      handleError(res, error);
    }
  });

  router.patch(
    "/branch/current/khqr-receiver",
    requireV0Auth,
    async (req: V0AuthRequest, res: Response) => {
      try {
        const actor = req.v0Auth;
        if (!actor) {
          res.status(401).json({ success: false, error: "authentication required" });
          return;
        }
        const body = asRecord(req.body);
        const data = await input.service.setCurrentBranchKhqrReceiver({
          actor,
          khqrReceiverAccountId: body.khqrReceiverAccountId,
          khqrReceiverName: body.khqrReceiverName,
        });
        res.status(200).json({ success: true, data });
      } catch (error) {
        handleError(res, error);
      }
    }
  );

  router.patch(
    "/branch/current/attendance-location",
    requireV0Auth,
    async (req: V0AuthRequest, res: Response) => {
      try {
        const actor = req.v0Auth;
        if (!actor) {
          res.status(401).json({ success: false, error: "authentication required" });
          return;
        }
        const body = asRecord(req.body);
        const data = await input.service.setCurrentBranchAttendanceLocationSettings({
          actor,
          attendanceLocationVerificationMode: body.attendanceLocationVerificationMode,
          workplaceLocation: body.workplaceLocation,
        });
        res.status(200).json({ success: true, data });
      } catch (error) {
        handleError(res, error);
      }
    }
  );

  router.post(
    "/branches/activation/initiate",
    requireV0Auth,
    async (req: V0AuthRequest, res: Response) => {
      const actor = req.v0Auth;
      const idempotencyKey = readIdempotencyKey(req.headers);
      try {
        if (!actor) {
          res.status(401).json({ success: false, error: "authentication required" });
          return;
        }

        const executeCommand = () =>
          executeInitiateFirstBranchActivationCommand({
            db: input.db,
            actor,
            branchName: req.body?.branchName,
            idempotencyKey,
            actionKey: "org.branch.activation.initiate",
            eventType: "ORG_BRANCH_ACTIVATION_INITIATED",
            endpoint: "/v0/org/branches/activation/initiate",
          });

        if (!idempotencyKey) {
          const data = await executeCommand();
          res.status(data.created ? 201 : 200).json({ success: true, data });
          return;
        }

        const result = await input.idempotencyService.execute({
          idempotencyKey,
          actionKey: "org.branch.activation.initiate",
          scope: "TENANT",
          tenantId: actor.tenantId ?? null,
          branchId: null,
          payload: {
            branchName: req.body?.branchName ?? null,
          },
          handler: async () => {
            const data = await executeCommand();
            return {
              statusCode: data.created ? 201 : 200,
              body: { success: true, data },
            };
          },
        });
        if (result.replayed) {
          res.setHeader("Idempotency-Replayed", "true");
        }
        res.status(result.statusCode).json(result.body);
      } catch (error) {
        handleError(res, error);
      }
    }
  );

  router.post(
    "/branches/activation/confirm",
    requireV0Auth,
    async (req: V0AuthRequest, res: Response) => {
      const actor = req.v0Auth;
      const idempotencyKey = readIdempotencyKey(req.headers);
      try {
        if (!actor) {
          res.status(401).json({ success: false, error: "authentication required" });
          return;
        }

        const executeCommand = () =>
          executeConfirmFirstBranchActivationCommand({
            db: input.db,
            actor,
            draftId: req.body?.draftId,
            paymentToken: req.body?.paymentToken,
            idempotencyKey,
            actionKey: "org.branch.activation.confirm",
            eventType: "ORG_BRANCH_ACTIVATED",
            endpoint: "/v0/org/branches/activation/confirm",
          });

        if (!idempotencyKey) {
          const data = await executeCommand();
          res.status(data.created ? 201 : 200).json({ success: true, data });
          return;
        }

        const result = await input.idempotencyService.execute({
          idempotencyKey,
          actionKey: "org.branch.activation.confirm",
          scope: "TENANT",
          tenantId: actor.tenantId ?? null,
          branchId: null,
          payload: {
            draftId: req.body?.draftId ?? null,
            paymentToken: req.body?.paymentToken ?? null,
          },
          handler: async () => {
            const data = await executeCommand();
            return {
              statusCode: data.created ? 201 : 200,
              body: { success: true, data },
            };
          },
        });
        if (result.replayed) {
          res.setHeader("Idempotency-Replayed", "true");
        }
        res.status(result.statusCode).json(result.body);
      } catch (error) {
        handleError(res, error);
      }
    }
  );

  return router;
}

function readIdempotencyKey(headers: Record<string, string | string[] | undefined>): string | null {
  return getIdempotencyKeyFromHeader(headers) ?? readOptionalHeaderString(headers, "idempotency-key");
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return value as Record<string, unknown>;
}

function handleError(res: Response, error: unknown): void {
  if (error instanceof V0IdempotencyError) {
    res.status(error.statusCode).json({
      success: false,
      error: error.message,
      code: error.code,
    });
    return;
  }

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
