import type { Pool } from "pg";
import { Router, type Response } from "express";
import { requireV0Auth, type V0AuthRequest } from "../../../auth/api/middleware.js";
import { TransactionManager } from "../../../../../platform/db/transactionManager.js";
import {
  getIdempotencyKeyFromHeader,
  V0IdempotencyError,
  V0IdempotencyService,
} from "../../../../../platform/idempotency/service.js";
import { V0CommandOutboxRepository } from "../../../../../platform/outbox/repository.js";
import { V0AuditService } from "../../../audit/app/service.js";
import { V0AuditRepository } from "../../../audit/infra/repository.js";
import { V0SyncRepository } from "../../../platformSystem/sync/infra/repository.js";
import {
  buildPolicyCommandDedupeKey,
  V0_POLICY_ACTION_KEYS,
  V0_POLICY_EVENT_TYPES,
} from "../app/command-contract.js";
import { V0PolicyError, V0PolicyService } from "../app/service.js";
import { V0PolicyRepository } from "../infra/repository.js";

type PolicyResponseBody =
  | {
      success: true;
      data: unknown;
    }
  | {
      success: false;
      error: string;
      code?: string;
    };

export function createV0PolicyRouter(input: {
  service: V0PolicyService;
  idempotencyService: V0IdempotencyService;
  db: Pool;
}): Router {
  const router = Router();
  const transactionManager = new TransactionManager(input.db);

  router.get("/current-branch", requireV0Auth, async (req: V0AuthRequest, res: Response) => {
    try {
      const actor = req.v0Auth;
      if (!actor) {
        res.status(401).json({ success: false, error: "authentication required" });
        return;
      }

      const data = await input.service.getCurrentBranchPolicy({ actor });
      res.status(200).json({ success: true, data });
    } catch (error) {
      handleError(res, error);
    }
  });

  router.patch(
    "/current-branch",
    requireV0Auth,
    async (req: V0AuthRequest, res: Response) => {
      const actor = req.v0Auth;
      const actionKey = V0_POLICY_ACTION_KEYS.updateCurrentBranch;
      const idempotencyKey = getIdempotencyKeyFromHeader(req.headers);

      try {
        if (!actor) {
          res.status(401).json({ success: false, error: "authentication required" });
          return;
        }

        const tenantId = String(actor.tenantId ?? "").trim();
        const branchId = String(actor.branchId ?? "").trim();

        const result = await input.idempotencyService.execute<PolicyResponseBody>({
          idempotencyKey,
          actionKey,
          scope: "BRANCH",
          tenantId,
          branchId,
          payload: req.body,
          handler: async () => {
            const policy = await transactionManager.withTransaction(async (client) => {
              const txPolicyService = new V0PolicyService(new V0PolicyRepository(client));
              const txAuditService = new V0AuditService(new V0AuditRepository(client));
              const txOutboxRepository = new V0CommandOutboxRepository(client);

              const commandData = await txPolicyService.updateCurrentBranchPolicy({
                actor,
                patch: req.body,
              });

              const dedupeKey = buildPolicyCommandDedupeKey(
                actionKey,
                idempotencyKey,
                "SUCCESS"
              );
              await txAuditService.recordEvent({
                tenantId,
                branchId,
                actorAccountId: actor.accountId,
                actionKey,
                outcome: "SUCCESS",
                reasonCode: null,
                entityType: "branch_policy",
                entityId: branchId,
                dedupeKey,
                metadata: {
                  endpoint: "/v0/policy/current-branch",
                  updatedFields: commandData.updatedFields,
                  oldValues: commandData.oldValues,
                  newValues: commandData.newValues,
                },
              });

              const outbox = await txOutboxRepository.insertEvent({
                tenantId,
                branchId,
                actionKey,
                eventType: V0_POLICY_EVENT_TYPES.updated,
                actorType: "ACCOUNT",
                actorId: actor.accountId,
                entityType: "branch_policy",
                entityId: branchId,
                outcome: "SUCCESS",
                dedupeKey,
                payload: {
                  endpoint: "/v0/policy/current-branch",
                  updatedFields: commandData.updatedFields,
                  oldValues: commandData.oldValues,
                  newValues: commandData.newValues,
                },
              });
              if (outbox.inserted && outbox.row) {
                const txSyncRepository = new V0SyncRepository(client);
                await txSyncRepository.appendChange({
                  tenantId,
                  branchId,
                  moduleKey: "policy",
                  entityType: "branch_policy",
                  entityId: branchId,
                  operation: "UPSERT",
                  revision: `policy:${outbox.row.id}`,
                  data: commandData.policy as Record<string, unknown>,
                  changedAt: outbox.row.occurred_at,
                  sourceOutboxId: outbox.row.id,
                });
              }

              return commandData.policy;
            });

            return {
              statusCode: 200,
              body: {
                success: true,
                data: policy,
              },
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

function handleError(res: Response, error: unknown): void {
  if (error instanceof V0IdempotencyError) {
    res.status(error.statusCode).json({
      success: false,
      error: error.code,
      code: error.code,
    });
    return;
  }

  if (error instanceof V0PolicyError) {
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
