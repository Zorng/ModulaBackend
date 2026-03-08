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
import { V0AuditService } from "../../../audit/app/service.js";
import { V0AuditRepository } from "../../../audit/infra/repository.js";
import { V0PullSyncRepository } from "../../../platformSystem/pullSync/infra/repository.js";
import {
  buildCashSessionCommandDedupeKey,
  V0_CASH_SESSION_ACTION_KEYS,
  V0_CASH_SESSION_EVENT_TYPES,
} from "../app/command-contract.js";
import { V0CashSessionError, V0CashSessionService } from "../app/service.js";
import { V0CashSessionRepository } from "../infra/repository.js";

type CashResponseBody =
  | {
      success: true;
      data: unknown;
    }
  | {
      success: false;
      error: string;
      code?: string;
    };

export function createV0CashSessionRouter(input: {
  service: V0CashSessionService;
  idempotencyService: V0IdempotencyService;
  db: Pool;
}): Router {
  const router = Router();
  const transactionManager = new TransactionManager(input.db);

  router.get("/sessions/active", requireV0Auth, async (req: V0AuthRequest, res: Response) => {
    try {
      const actor = req.v0Auth;
      if (!actor) {
        res.status(401).json({ success: false, error: "authentication required" });
        return;
      }
      const data = await input.service.readActiveSession({ actor });
      res.status(200).json({ success: true, data });
    } catch (error) {
      handleError(res, error);
    }
  });

  router.get("/sessions", requireV0Auth, async (req: V0AuthRequest, res: Response) => {
    try {
      const actor = req.v0Auth;
      if (!actor) {
        res.status(401).json({ success: false, error: "authentication required" });
        return;
      }
      const data = await input.service.listSessions({
        actor,
        status: asString(req.query?.status),
        from: asString(req.query?.from),
        to: asString(req.query?.to),
        limit: asNumber(req.query?.limit),
        offset: asNumber(req.query?.offset),
      });
      res.status(200).json({ success: true, data });
    } catch (error) {
      handleError(res, error);
    }
  });

  router.get("/sessions/:sessionId", requireV0Auth, async (req: V0AuthRequest, res: Response) => {
    try {
      const actor = req.v0Auth;
      if (!actor) {
        res.status(401).json({ success: false, error: "authentication required" });
        return;
      }
      const data = await input.service.getSession({
        actor,
        sessionId: req.params.sessionId,
      });
      res.status(200).json({ success: true, data });
    } catch (error) {
      handleError(res, error);
    }
  });

  router.get(
    "/sessions/:sessionId/sales",
    requireV0Auth,
    async (req: V0AuthRequest, res: Response) => {
      try {
        const actor = req.v0Auth;
        if (!actor) {
          res.status(401).json({ success: false, error: "authentication required" });
          return;
        }
        const data = await input.service.listSessionSales({
          actor,
          sessionId: req.params.sessionId,
          limit: asNumber(req.query?.limit),
          offset: asNumber(req.query?.offset),
        });
        res.status(200).json({ success: true, data });
      } catch (error) {
        handleError(res, error);
      }
    }
  );

  router.get(
    "/sessions/:sessionId/movements",
    requireV0Auth,
    async (req: V0AuthRequest, res: Response) => {
      try {
        const actor = req.v0Auth;
        if (!actor) {
          res.status(401).json({ success: false, error: "authentication required" });
          return;
        }
        const data = await input.service.listSessionMovements({
          actor,
          sessionId: req.params.sessionId,
          limit: asNumber(req.query?.limit),
          offset: asNumber(req.query?.offset),
        });
        res.status(200).json({ success: true, data });
      } catch (error) {
        handleError(res, error);
      }
    }
  );

  router.get("/sessions/:sessionId/x", requireV0Auth, async (req: V0AuthRequest, res: Response) => {
    try {
      const actor = req.v0Auth;
      if (!actor) {
        res.status(401).json({ success: false, error: "authentication required" });
        return;
      }
      const data = await input.service.getXReport({
        actor,
        sessionId: req.params.sessionId,
      });
      res.status(200).json({ success: true, data });
    } catch (error) {
      handleError(res, error);
    }
  });

  router.get("/sessions/:sessionId/z", requireV0Auth, async (req: V0AuthRequest, res: Response) => {
    try {
      const actor = req.v0Auth;
      if (!actor) {
        res.status(401).json({ success: false, error: "authentication required" });
        return;
      }
      const data = await input.service.getZReport({
        actor,
        sessionId: req.params.sessionId,
      });
      res.status(200).json({ success: true, data });
    } catch (error) {
      handleError(res, error);
    }
  });

  router.post("/sessions", requireV0Auth, async (req: V0AuthRequest, res: Response) => {
    await executeWrite({
      req,
      res,
      idempotencyService: input.idempotencyService,
      actionKey: V0_CASH_SESSION_ACTION_KEYS.open,
      eventType: V0_CASH_SESSION_EVENT_TYPES.opened,
      endpoint: "/v0/cash/sessions",
      entityType: "cash_session",
      transactionManager,
      handler: async (service, idempotencyKey) =>
        service.openSession({
          actor: req.v0Auth!,
          body: req.body,
        }),
      commandParts: [],
    });
  });

  router.post(
    "/sessions/:sessionId/close",
    requireV0Auth,
    async (req: V0AuthRequest, res: Response) => {
      await executeWrite({
        req,
        res,
        idempotencyService: input.idempotencyService,
        actionKey: V0_CASH_SESSION_ACTION_KEYS.close,
        eventType: V0_CASH_SESSION_EVENT_TYPES.closed,
        endpoint: "/v0/cash/sessions/:sessionId/close",
        entityType: "cash_session",
        transactionManager,
        handler: async (service) =>
          service.closeSession({
            actor: req.v0Auth!,
            sessionId: req.params.sessionId,
            body: req.body,
          }),
        commandParts: [req.params.sessionId],
      });
    }
  );

  router.post(
    "/sessions/:sessionId/force-close",
    requireV0Auth,
    async (req: V0AuthRequest, res: Response) => {
      await executeWrite({
        req,
        res,
        idempotencyService: input.idempotencyService,
        actionKey: V0_CASH_SESSION_ACTION_KEYS.forceClose,
        eventType: V0_CASH_SESSION_EVENT_TYPES.forceClosed,
        endpoint: "/v0/cash/sessions/:sessionId/force-close",
        entityType: "cash_session",
        transactionManager,
        handler: async (service) =>
          service.forceCloseSession({
            actor: req.v0Auth!,
            sessionId: req.params.sessionId,
            body: req.body,
          }),
        commandParts: [req.params.sessionId],
      });
    }
  );

  router.post(
    "/sessions/:sessionId/movements/paid-in",
    requireV0Auth,
    async (req: V0AuthRequest, res: Response) => {
      await executeWrite({
        req,
        res,
        idempotencyService: input.idempotencyService,
        actionKey: V0_CASH_SESSION_ACTION_KEYS.recordPaidIn,
        eventType: V0_CASH_SESSION_EVENT_TYPES.movementRecorded,
        endpoint: "/v0/cash/sessions/:sessionId/movements/paid-in",
        entityType: "cash_movement",
        transactionManager,
        handler: async (service, idempotencyKey) =>
          service.recordPaidIn({
            actor: req.v0Auth!,
            sessionId: req.params.sessionId,
            body: req.body,
            idempotencyKey,
          }),
        commandParts: [req.params.sessionId],
      });
    }
  );

  router.post(
    "/sessions/:sessionId/movements/paid-out",
    requireV0Auth,
    async (req: V0AuthRequest, res: Response) => {
      await executeWrite({
        req,
        res,
        idempotencyService: input.idempotencyService,
        actionKey: V0_CASH_SESSION_ACTION_KEYS.recordPaidOut,
        eventType: V0_CASH_SESSION_EVENT_TYPES.movementRecorded,
        endpoint: "/v0/cash/sessions/:sessionId/movements/paid-out",
        entityType: "cash_movement",
        transactionManager,
        handler: async (service, idempotencyKey) =>
          service.recordPaidOut({
            actor: req.v0Auth!,
            sessionId: req.params.sessionId,
            body: req.body,
            idempotencyKey,
          }),
        commandParts: [req.params.sessionId],
      });
    }
  );

  router.post(
    "/sessions/:sessionId/movements/adjustment",
    requireV0Auth,
    async (req: V0AuthRequest, res: Response) => {
      await executeWrite({
        req,
        res,
        idempotencyService: input.idempotencyService,
        actionKey: V0_CASH_SESSION_ACTION_KEYS.recordAdjustment,
        eventType: V0_CASH_SESSION_EVENT_TYPES.adjustmentRecorded,
        endpoint: "/v0/cash/sessions/:sessionId/movements/adjustment",
        entityType: "cash_movement",
        transactionManager,
        handler: async (service, idempotencyKey) =>
          service.recordAdjustment({
            actor: req.v0Auth!,
            sessionId: req.params.sessionId,
            body: req.body,
            idempotencyKey,
          }),
        commandParts: [req.params.sessionId],
      });
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
    handler: (service: V0CashSessionService, idempotencyKey: string) => Promise<unknown>;
    commandParts: ReadonlyArray<unknown>;
  }): Promise<void> {
    const actor = inputWrite.req.v0Auth;
    const idempotencyKey = getIdempotencyKeyFromHeader(inputWrite.req.headers);
    const commandIdempotencyKey = idempotencyKey ?? "";
    const actionKey = inputWrite.actionKey;

    try {
      if (!actor) {
        inputWrite.res.status(401).json({ success: false, error: "authentication required" });
        return;
      }

      const tenantId = String(actor.tenantId ?? "").trim();
      const branchId = String(actor.branchId ?? "").trim();
      const scope = branchId ? "BRANCH" : "TENANT";

      const result = await inputWrite.idempotencyService.execute<CashResponseBody>({
        idempotencyKey,
        actionKey,
        scope,
        tenantId,
        branchId,
        payload: {
          params: inputWrite.req.params,
          body: inputWrite.req.body,
        },
        handler: async () => {
          const data = await inputWrite.transactionManager.withTransaction(async (client) => {
            const txService = new V0CashSessionService(new V0CashSessionRepository(client));
            const txAuditService = new V0AuditService(new V0AuditRepository(client));
            const txOutboxRepository = new V0CommandOutboxRepository(client);
            const txSyncRepository = new V0PullSyncRepository(client);

            const commandData = await inputWrite.handler(txService, commandIdempotencyKey);
            const entityId = String((commandData as { id?: string })?.id ?? tenantId);
            const dedupeKey = buildCashSessionCommandDedupeKey(
              actionKey,
              commandIdempotencyKey,
              "SUCCESS",
              inputWrite.commandParts
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
            if (outbox.inserted && outbox.row && branchId) {
              await txSyncRepository.appendChange({
                tenantId,
                branchId,
                moduleKey: "cashSession",
                entityType: inputWrite.entityType,
                entityId,
                operation: "UPSERT",
                revision: `cashSession:${outbox.row.id}`,
                data: (commandData as Record<string, unknown>) ?? {},
                changedAt: outbox.row.occurred_at,
                sourceOutboxId: outbox.row.id,
              });
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

function handleError(res: Response, error: unknown): void {
  if (error instanceof V0IdempotencyError) {
    res.status(error.statusCode).json({
      success: false,
      error: error.code,
      code: error.code,
    });
    return;
  }

  if (error instanceof V0CashSessionError) {
    res.status(error.statusCode).json({
      success: false,
      error: error.message,
      code: error.code,
    });
    return;
  }

  res.status(500).json({
    success: false,
    error: error instanceof Error ? error.message : "internal server error",
  });
}
