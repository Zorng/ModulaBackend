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
import {
  buildReceiptCommandDedupeKey,
  V0_RECEIPT_ACTION_KEYS,
  V0_RECEIPT_EVENT_TYPES,
} from "../app/command-contract.js";
import { V0ReceiptError, V0ReceiptService } from "../app/service.js";
import { V0ReceiptRepository } from "../infra/repository.js";

type ReceiptResponseBody =
  | {
      success: true;
      data: unknown;
    }
  | {
      success: false;
      error: string;
      code?: string;
    };

export function createV0ReceiptRouter(input: {
  service: V0ReceiptService;
  idempotencyService: V0IdempotencyService;
  db: Pool;
}): Router {
  const router = Router();
  const transactionManager = new TransactionManager(input.db);

  router.get("/sales/:saleId", requireV0Auth, async (req: V0AuthRequest, res: Response) => {
    try {
      const actor = req.v0Auth;
      if (!actor) {
        res.status(401).json({ success: false, error: "authentication required" });
        return;
      }
      const data = await input.service.getReceiptBySaleId({
        actor,
        saleId: req.params.saleId,
      });
      res.status(200).json({ success: true, data });
    } catch (error) {
      handleError(res, error);
    }
  });

  router.get("/:receiptId", requireV0Auth, async (req: V0AuthRequest, res: Response) => {
    try {
      const actor = req.v0Auth;
      if (!actor) {
        res.status(401).json({ success: false, error: "authentication required" });
        return;
      }
      const data = await input.service.getReceiptById({
        actor,
        receiptId: req.params.receiptId,
      });
      res.status(200).json({ success: true, data });
    } catch (error) {
      handleError(res, error);
    }
  });

  router.post("/:receiptId/print", requireV0Auth, async (req: V0AuthRequest, res: Response) => {
    await executeWrite({
      req,
      res,
      idempotencyService: input.idempotencyService,
      actionKey: V0_RECEIPT_ACTION_KEYS.print,
      scope: "BRANCH",
      eventType: V0_RECEIPT_EVENT_TYPES.printRequested,
      entityType: "receipt",
      endpoint: "/v0/receipts/:receiptId/print",
      transactionManager,
      entityIdResolver: (data) => String((data as { receiptId: string }).receiptId),
      handler: async (service) =>
        service.requestPrint({
          actor: req.v0Auth!,
          receiptId: req.params.receiptId,
          body: req.body,
        }),
    });
  });

  router.post(
    "/:receiptId/reprint",
    requireV0Auth,
    async (req: V0AuthRequest, res: Response) => {
      await executeWrite({
        req,
        res,
        idempotencyService: input.idempotencyService,
        actionKey: V0_RECEIPT_ACTION_KEYS.reprint,
        scope: "BRANCH",
        eventType: V0_RECEIPT_EVENT_TYPES.reprintRequested,
        entityType: "receipt",
        endpoint: "/v0/receipts/:receiptId/reprint",
        transactionManager,
        entityIdResolver: (data) => String((data as { receiptId: string }).receiptId),
        handler: async (service) =>
          service.requestReprint({
            actor: req.v0Auth!,
            receiptId: req.params.receiptId,
            body: req.body,
          }),
      });
    }
  );

  return router;

  async function executeWrite(inputWrite: {
    req: V0AuthRequest;
    res: Response;
    idempotencyService: V0IdempotencyService;
    actionKey: string;
    scope: "TENANT" | "BRANCH";
    eventType: string;
    entityType: string;
    endpoint: string;
    transactionManager: TransactionManager;
    entityIdResolver?: (data: unknown) => string;
    handler: (service: V0ReceiptService) => Promise<unknown>;
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

      const result = await inputWrite.idempotencyService.execute<ReceiptResponseBody>({
        idempotencyKey,
        actionKey,
        scope: inputWrite.scope,
        tenantId,
        branchId,
        payload: {
          params: inputWrite.req.params,
          body: inputWrite.req.body,
        },
        handler: async () => {
          const data = await inputWrite.transactionManager.withTransaction(async (client) => {
            const txService = new V0ReceiptService(new V0ReceiptRepository(client));
            const txAuditService = new V0AuditService(new V0AuditRepository(client));
            const txOutboxRepository = new V0CommandOutboxRepository(client);

            const commandData = await inputWrite.handler(txService);
            const entityId =
              inputWrite.entityIdResolver?.(commandData) ??
              String((commandData as { id?: string })?.id ?? branchId ?? tenantId);
            const dedupeKey = buildReceiptCommandDedupeKey(actionKey, idempotencyKey, "SUCCESS", [
              entityId,
            ]);

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

            await txOutboxRepository.insertEvent({
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

function handleError(res: Response, error: unknown): void {
  if (error instanceof V0IdempotencyError) {
    res.status(error.statusCode).json({
      success: false,
      error: error.code,
      code: error.code,
    });
    return;
  }

  if (error instanceof V0ReceiptError) {
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
