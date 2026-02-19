import { Router, type Response } from "express";
import type { Pool } from "pg";
import { requireV0Auth, type V0AuthRequest } from "../../../auth/api/middleware.js";
import { TransactionManager } from "../../../../../platform/db/transactionManager.js";
import {
  getIdempotencyKeyFromHeader,
  V0IdempotencyError,
  V0IdempotencyService,
} from "../../../../../platform/idempotency/service.js";
import { V0CommandOutboxRepository } from "../../../../../platform/outbox/repository.js";
import { V0PullSyncRepository } from "../../../platformSystem/pullSync/infra/repository.js";
import { V0AuditService } from "../../../audit/app/service.js";
import { V0AuditRepository } from "../../../audit/infra/repository.js";
import {
  buildDiscountCommandDedupeKey,
  V0_DISCOUNT_ACTION_KEYS,
  V0_DISCOUNT_EVENT_TYPES,
} from "../app/command-contract.js";
import { V0DiscountError, V0DiscountService } from "../app/service.js";
import { V0DiscountRepository } from "../infra/repository.js";

type DiscountResponseBody =
  | {
      success: true;
      data: unknown;
    }
  | {
      success: false;
      error: string;
      code?: string;
    };

export function createV0DiscountRouter(input: {
  service: V0DiscountService;
  idempotencyService: V0IdempotencyService;
  db: Pool;
}): Router {
  const router = Router();
  const transactionManager = new TransactionManager(input.db);

  router.get("/rules", requireV0Auth, async (req: V0AuthRequest, res: Response) => {
    try {
      const actor = req.v0Auth;
      if (!actor) {
        res.status(401).json({ success: false, error: "authentication required" });
        return;
      }

      const data = await input.service.listRules({
        actor,
        status: asString(req.query?.status),
        scope: asString(req.query?.scope),
        branchId: asString(req.query?.branchId),
        search: asString(req.query?.search),
        limit: asNumber(req.query?.limit),
        offset: asNumber(req.query?.offset),
      });
      res.status(200).json({ success: true, data });
    } catch (error) {
      handleError(res, error);
    }
  });

  router.get("/rules/:ruleId", requireV0Auth, async (req: V0AuthRequest, res: Response) => {
    try {
      const actor = req.v0Auth;
      if (!actor) {
        res.status(401).json({ success: false, error: "authentication required" });
        return;
      }

      const data = await input.service.getRule({
        actor,
        ruleId: req.params.ruleId,
      });
      res.status(200).json({ success: true, data });
    } catch (error) {
      handleError(res, error);
    }
  });

  router.post("/rules", requireV0Auth, async (req: V0AuthRequest, res: Response) => {
    await executeWrite({
      req,
      res,
      idempotencyService: input.idempotencyService,
      actionKey: V0_DISCOUNT_ACTION_KEYS.createRule,
      eventType: V0_DISCOUNT_EVENT_TYPES.ruleCreated,
      endpoint: "/v0/discount/rules",
      entityType: "discount_rule",
      transactionManager,
      handler: async (service) =>
        service.createRule({
          actor: req.v0Auth!,
          body: req.body,
        }),
    });
  });

  router.patch("/rules/:ruleId", requireV0Auth, async (req: V0AuthRequest, res: Response) => {
    await executeWrite({
      req,
      res,
      idempotencyService: input.idempotencyService,
      actionKey: V0_DISCOUNT_ACTION_KEYS.updateRule,
      eventType: V0_DISCOUNT_EVENT_TYPES.ruleUpdated,
      endpoint: "/v0/discount/rules/:ruleId",
      entityType: "discount_rule",
      transactionManager,
      handler: async (service) =>
        service.updateRule({
          actor: req.v0Auth!,
          ruleId: req.params.ruleId,
          body: req.body,
        }),
    });
  });

  router.post(
    "/rules/:ruleId/activate",
    requireV0Auth,
    async (req: V0AuthRequest, res: Response) => {
      await executeWrite({
        req,
        res,
        idempotencyService: input.idempotencyService,
        actionKey: V0_DISCOUNT_ACTION_KEYS.activateRule,
        eventType: V0_DISCOUNT_EVENT_TYPES.ruleActivated,
        endpoint: "/v0/discount/rules/:ruleId/activate",
        entityType: "discount_rule",
        transactionManager,
        handler: async (service) =>
          service.activateRule({
            actor: req.v0Auth!,
            ruleId: req.params.ruleId,
          }),
      });
    }
  );

  router.post(
    "/rules/:ruleId/deactivate",
    requireV0Auth,
    async (req: V0AuthRequest, res: Response) => {
      await executeWrite({
        req,
        res,
        idempotencyService: input.idempotencyService,
        actionKey: V0_DISCOUNT_ACTION_KEYS.deactivateRule,
        eventType: V0_DISCOUNT_EVENT_TYPES.ruleDeactivated,
        endpoint: "/v0/discount/rules/:ruleId/deactivate",
        entityType: "discount_rule",
        transactionManager,
        handler: async (service) =>
          service.deactivateRule({
            actor: req.v0Auth!,
            ruleId: req.params.ruleId,
          }),
      });
    }
  );

  router.post(
    "/rules/:ruleId/archive",
    requireV0Auth,
    async (req: V0AuthRequest, res: Response) => {
      await executeWrite({
        req,
        res,
        idempotencyService: input.idempotencyService,
        actionKey: V0_DISCOUNT_ACTION_KEYS.archiveRule,
        eventType: V0_DISCOUNT_EVENT_TYPES.ruleArchived,
        endpoint: "/v0/discount/rules/:ruleId/archive",
        entityType: "discount_rule",
        transactionManager,
        handler: async (service) =>
          service.archiveRule({
            actor: req.v0Auth!,
            ruleId: req.params.ruleId,
          }),
      });
    }
  );

  router.post(
    "/preflight/eligible-items",
    requireV0Auth,
    async (req: V0AuthRequest, res: Response) => {
      try {
        const actor = req.v0Auth;
        if (!actor) {
          res.status(401).json({ success: false, error: "authentication required" });
          return;
        }

        const data = await input.service.resolveEligibleItemsForBranch({
          actor,
          body: req.body,
        });
        res.status(200).json({ success: true, data });
      } catch (error) {
        handleError(res, error);
      }
    }
  );

  router.post(
    "/eligibility/resolve",
    requireV0Auth,
    async (req: V0AuthRequest, res: Response) => {
      try {
        const actor = req.v0Auth;
        if (!actor) {
          res.status(401).json({ success: false, error: "authentication required" });
          return;
        }

        const data = await input.service.resolveEligibility({
          actor,
          body: req.body,
        });
        res.status(200).json({ success: true, data });
      } catch (error) {
        handleError(res, error);
      }
    }
  );

  return router;

  async function executeWrite(inputWrite: {
    req: V0AuthRequest;
    res: Response;
    idempotencyService: V0IdempotencyService;
    actionKey: string;
    eventType: string;
    entityType: string;
    endpoint: string;
    transactionManager: TransactionManager;
    handler: (service: V0DiscountService) => Promise<unknown>;
  }): Promise<void> {
    const actor = inputWrite.req.v0Auth;
    const idempotencyKey = getIdempotencyKeyFromHeader(inputWrite.req.headers);
    const actionKey = inputWrite.actionKey;

    try {
      if (!actor) {
        inputWrite.res.status(401).json({ success: false, error: "authentication required" });
        return;
      }

      const tenantId = String(actor.tenantId ?? "").trim();
      const branchId = String(actor.branchId ?? "").trim();

      const result = await inputWrite.idempotencyService.execute<DiscountResponseBody>({
        idempotencyKey,
        actionKey,
        scope: "TENANT",
        tenantId,
        branchId,
        payload: {
          params: inputWrite.req.params,
          body: inputWrite.req.body,
        },
        handler: async () => {
          const data = await inputWrite.transactionManager.withTransaction(async (client) => {
            const txService = new V0DiscountService(new V0DiscountRepository(client));
            const txAuditService = new V0AuditService(new V0AuditRepository(client));
            const txOutboxRepository = new V0CommandOutboxRepository(client);
            const txSyncRepository = new V0PullSyncRepository(client);

            const commandData = await inputWrite.handler(txService);
            const entityId = String((commandData as { id?: string })?.id ?? tenantId);
            const dedupeKey = buildDiscountCommandDedupeKey(
              actionKey,
              idempotencyKey,
              "SUCCESS"
            );

            await txAuditService.recordEvent({
              tenantId,
              branchId: branchId || null,
              actorAccountId: actor.accountId,
              actionKey,
              outcome: "SUCCESS",
              reasonCode: null,
              entityType: inputWrite.entityType,
              entityId,
              dedupeKey,
              metadata: {
                endpoint: inputWrite.endpoint,
                replayed: false,
              },
            });

            const outbox = await txOutboxRepository.insertEvent({
              tenantId,
              branchId: branchId || null,
              actionKey,
              eventType: inputWrite.eventType,
              actorType: "ACCOUNT",
              actorId: actor.accountId,
              entityType: inputWrite.entityType,
              entityId,
              outcome: "SUCCESS",
              dedupeKey,
              payload: {
                endpoint: inputWrite.endpoint,
                replayed: false,
              },
            });

            if (outbox.inserted && outbox.row) {
              const targetBranchId = normalizeOptionalString(
                (commandData as { branchId?: unknown })?.branchId
              ) ?? branchId;

              if (targetBranchId) {
                await txSyncRepository.appendChange({
                  tenantId,
                  branchId: targetBranchId,
                  moduleKey: "discount",
                  entityType: inputWrite.entityType,
                  entityId,
                  operation: "UPSERT",
                  revision: `discount:${outbox.row.id}`,
                  data: toSyncData(commandData),
                  changedAt: outbox.row.occurred_at,
                  sourceOutboxId: outbox.row.id,
                });
              }
            }

            return commandData;
          });

          return {
            statusCode: 200,
            body: {
              success: true,
              data,
            },
          };
        },
      });

      if (result.replayed) {
        inputWrite.res.setHeader("Idempotency-Replayed", "true");
      }
      inputWrite.res.status(result.statusCode).json(result.body);
    } catch (error) {
      handleError(inputWrite.res, error);
    }
  }
}

function asString(value: unknown): string | undefined {
  if (Array.isArray(value)) {
    return typeof value[0] === "string" ? value[0] : undefined;
  }
  return typeof value === "string" ? value : undefined;
}

function asNumber(value: unknown): number | undefined {
  const str = asString(value);
  if (!str) {
    return undefined;
  }
  const parsed = Number(str);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function normalizeOptionalString(value: unknown): string | null {
  const normalized = String(value ?? "").trim();
  return normalized.length > 0 ? normalized : null;
}

function toSyncData(data: unknown): Record<string, unknown> {
  if (data && typeof data === "object" && !Array.isArray(data)) {
    return data as Record<string, unknown>;
  }
  return { value: data };
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
  if (error instanceof V0DiscountError) {
    res.status(error.statusCode).json({
      success: false,
      error: error.message,
      code: error.code,
      details: error.details,
    });
    return;
  }

  res.status(500).json({
    success: false,
    error: error instanceof Error ? error.message : "internal server error",
  });
}
