import { Router } from "express";
import type { Response, NextFunction } from "express";
import { z } from "zod";
import type { AuthRequest, AuthMiddlewarePort } from "../../../platform/security/auth.js";
import type { OfflineSyncService } from "../app/offlineSync.service.js";
import { OFFLINE_SYNC_OPERATION_TYPES } from "../domain/entities.js";
import type { OfflineSyncAppliedResult, OfflineSyncApplyResponse } from "../domain/entities.js";

const operationSchema = z
  .object({
    client_op_id: z.string().uuid(),
    type: z.enum(OFFLINE_SYNC_OPERATION_TYPES),
    payload: z.unknown(),
    occurred_at: z.string().datetime().optional(),
    branch_id: z.string().uuid().optional(),
  })
  .strict();

const applyRequestSchema = z
  .object({
    operations: z.array(operationSchema).min(1).max(100),
  })
  .strict();

export function createOfflineSyncRouter(
  service: OfflineSyncService,
  authMiddleware: AuthMiddlewarePort
): Router {
  const router = Router();

  router.use(authMiddleware.authenticate);

  /**
   * @openapi
   * /v1/sync/apply:
   *   post:
   *     tags:
   *       - Offline Sync
   *     summary: Apply queued offline operations (authenticated)
   *     description: |
   *       Applies queued offline operations in FIFO order with server-side idempotency using `client_op_id`.
   *       Demo scope: `SALE_FINALIZED`, `CASH_SESSION_OPENED`, `CASH_SESSION_CLOSED`.
   *     security:
   *       - BearerAuth: []
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               operations:
   *                 type: array
   *                 minItems: 1
   *                 maxItems: 100
   *     responses:
   *       200:
   *         description: Apply results (may stop at first failure)
   *       401:
   *         description: Authentication required
   *       422:
   *         description: Validation error
   *       500:
   *         description: Internal error
   */
  router.post(
    "/apply",
    async (req: AuthRequest, res: Response, next: NextFunction) => {
      try {
        const tenantId = req.user?.tenantId;
        const branchId = req.user?.branchId;
        const employeeId = req.user?.employeeId;
        const actorRole = req.user?.role;
        if (!tenantId || !branchId || !employeeId || !actorRole) {
          return res.status(401).json({ error: "Authentication required" });
        }

        const parsed = applyRequestSchema.parse(req.body);
        const operations = parsed.operations.map((op) => ({
          clientOpId: op.client_op_id,
          type: op.type,
          payload: op.payload,
          occurredAt: op.occurred_at ? new Date(op.occurred_at) : undefined,
          branchId: op.branch_id,
        }));

        const result = await service.applyOperations({
          tenantId,
          branchId,
          employeeId,
          actorRole,
          operations,
        });

        return res.json(toHttpApplyResponse(result));
      } catch (err) {
        if (err instanceof z.ZodError) {
          return res.status(422).json({ error: err.message });
        }
        next(err);
      }
    }
  );

  return router;
}

function toHttpApplyResponse(result: OfflineSyncApplyResponse) {
  return {
    results: result.results.map((r) => ({
      client_op_id: r.clientOpId,
      type: r.type,
      status: r.status,
      deduped: r.deduped,
      result: r.result ? toHttpAppliedResult(r.result) : undefined,
      error_code: r.errorCode,
      error_message: r.errorMessage,
    })),
    stopped_at: result.stoppedAt,
  };
}

function toHttpAppliedResult(result: OfflineSyncAppliedResult) {
  switch (result.type) {
    case "SALE_FINALIZED":
      return { type: result.type, sale_id: result.saleId };
    case "CASH_SESSION_OPENED":
      return { type: result.type, session_id: result.sessionId };
    case "CASH_SESSION_CLOSED":
      return {
        type: result.type,
        session_id: result.sessionId,
        status: result.status,
      };
    default: {
      const _exhaustive: never = result;
      return _exhaustive;
    }
  }
}
