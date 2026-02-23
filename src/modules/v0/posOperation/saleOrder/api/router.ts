import { Router, type Response } from "express";
import type { Pool, PoolClient } from "pg";
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
import { V0KhqrPaymentService } from "../../../platformSystem/khqrPayment/app/service.js";
import { V0KhqrPaymentRepository } from "../../../platformSystem/khqrPayment/infra/repository.js";
import type { V0KhqrPaymentProvider } from "../../../platformSystem/khqrPayment/app/payment-provider.js";
import { buildSaleReceiptPreview } from "../../receipt/app/preview.js";
import {
  buildSaleOrderCommandDedupeKey,
  V0_SALE_ORDER_ACTION_KEYS,
  V0_SALE_ORDER_EVENT_TYPES,
} from "../app/command-contract.js";
import { V0SaleOrderError, V0SaleOrderService } from "../app/service.js";
import { V0SaleOrderRepository } from "../infra/repository.js";

type SaleOrderResponseBody =
  | {
      success: true;
      data: unknown;
    }
  | {
      success: false;
      error: string;
      code?: string;
    };

export function createV0SaleOrderRouter(input: {
  service: V0SaleOrderService;
  idempotencyService: V0IdempotencyService;
  khqrProvider: V0KhqrPaymentProvider;
  db: Pool;
}): Router {
  const router = Router();
  const transactionManager = new TransactionManager(input.db);

  router.post(
    "/checkout/cash/finalize",
    requireV0Auth,
    async (req: V0AuthRequest, res: Response) => {
      await executeWrite({
        req,
        res,
        actionKey: V0_SALE_ORDER_ACTION_KEYS.checkoutCashFinalize,
        eventType: V0_SALE_ORDER_EVENT_TYPES.checkoutCashFinalized,
        endpoint: "/v0/checkout/cash/finalize",
        entityType: "sale",
        idempotencyService: input.idempotencyService,
        transactionManager,
        khqrProvider: input.khqrProvider,
        handler: async (service) =>
          service.cashFinalizeFromLocalCart({
            actor: req.v0Auth!,
            body: req.body,
          }),
        commandParts: [],
      });
    }
  );

  router.post(
    "/checkout/khqr/initiate",
    requireV0Auth,
    async (req: V0AuthRequest, res: Response) => {
      await executeWrite({
        req,
        res,
        actionKey: V0_SALE_ORDER_ACTION_KEYS.checkoutKhqrInitiate,
        eventType: V0_SALE_ORDER_EVENT_TYPES.checkoutKhqrInitiated,
        endpoint: "/v0/checkout/khqr/initiate",
        entityType: "payment_intent",
        idempotencyService: input.idempotencyService,
        transactionManager,
        khqrProvider: input.khqrProvider,
        handler: async (service, _idempotencyKey, khqrService) => {
          const prepared = await service.prepareKhqrCheckoutIntent({
            actor: req.v0Auth!,
            body: req.body,
          });
          const initiated = await khqrService.initiateCheckoutIntent({
            actor: req.v0Auth!,
            tenderAmount: prepared.tenderAmount,
            tenderCurrency: prepared.tenderCurrency,
            expiresInSeconds: prepared.expiresInSeconds,
            checkoutLinesSnapshot: prepared.checkoutLinesSnapshot,
            checkoutTotalsSnapshot: prepared.checkoutTotalsSnapshot,
            pricingSnapshot: prepared.pricingSnapshot,
            metadataSnapshot: prepared.metadataSnapshot,
          });
          return {
            id: initiated.intent.paymentIntentId,
            intent: initiated.intent,
            attempt: initiated.attempt,
            paymentRequest: initiated.paymentRequest,
            preview: prepared.preview,
          };
        },
        commandParts: [],
      });
    }
  );

  router.get(
    "/checkout/khqr/intents/:intentId",
    requireV0Auth,
    async (req: V0AuthRequest, res: Response) => {
      try {
        const actor = req.v0Auth;
        if (!actor) {
          res.status(401).json({ success: false, error: "authentication required" });
          return;
        }
        const intentId = req.params.intentId;
        const service = new V0KhqrPaymentService(
          new V0KhqrPaymentRepository(input.db),
          input.khqrProvider
        );
        const data = await service.getPaymentIntentById({
          actor,
          paymentIntentId: intentId,
        });
        res.status(200).json({ success: true, data });
      } catch (error) {
        handleError(res, error);
      }
    }
  );

  router.post(
    "/checkout/khqr/intents/:intentId/cancel",
    requireV0Auth,
    async (req: V0AuthRequest, res: Response) => {
      await executeWrite({
        req,
        res,
        actionKey: V0_SALE_ORDER_ACTION_KEYS.checkoutKhqrIntentCancel,
        eventType: V0_SALE_ORDER_EVENT_TYPES.checkoutKhqrIntentCancelled,
        endpoint: "/v0/checkout/khqr/intents/:intentId/cancel",
        entityType: "payment_intent",
        idempotencyService: input.idempotencyService,
        transactionManager,
        khqrProvider: input.khqrProvider,
        handler: async (_service, _idempotencyKey, khqrService) => {
          const body = toRecord(req.body);
          const reasonCode = asString(body.reasonCode) ?? null;
          const cancelled = await khqrService.cancelPaymentIntent({
            actor: req.v0Auth!,
            paymentIntentId: req.params.intentId,
            reasonCode,
          });
          return {
            id: cancelled.paymentIntentId,
            ...cancelled,
          };
        },
        commandParts: [req.params.intentId],
      });
    }
  );

  router.get(
    "/orders",
    requireV0Auth,
    async (req: V0AuthRequest, res: Response) => {
      try {
        const actor = req.v0Auth;
        if (!actor) {
          res.status(401).json({ success: false, error: "authentication required" });
          return;
        }
        const data = await input.service.listOrders({
          actor,
          status: asString(req.query?.status),
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
    "/orders/:orderId",
    requireV0Auth,
    async (req: V0AuthRequest, res: Response) => {
      try {
        const actor = req.v0Auth;
        if (!actor) {
          res.status(401).json({ success: false, error: "authentication required" });
          return;
        }
        const data = await input.service.getOrder({
          actor,
          orderId: req.params.orderId,
        });
        res.status(200).json({ success: true, data });
      } catch (error) {
        handleError(res, error);
      }
    }
  );

  router.post(
    "/orders",
    requireV0Auth,
    async (req: V0AuthRequest, res: Response) => {
      await executeWrite({
        req,
        res,
        actionKey: V0_SALE_ORDER_ACTION_KEYS.orderPlace,
        eventType: V0_SALE_ORDER_EVENT_TYPES.orderTicketPlaced,
        endpoint: "/v0/orders",
        entityType: "order_ticket",
        idempotencyService: input.idempotencyService,
        transactionManager,
        khqrProvider: input.khqrProvider,
        handler: async (service) =>
          service.placeOrder({
            actor: req.v0Auth!,
            body: req.body,
          }),
        commandParts: [],
      });
    }
  );

  router.post(
    "/orders/:orderId/cancel",
    requireV0Auth,
    async (req: V0AuthRequest, res: Response) => {
      await executeWrite({
        req,
        res,
        actionKey: V0_SALE_ORDER_ACTION_KEYS.orderCancel,
        eventType: V0_SALE_ORDER_EVENT_TYPES.orderTicketCancelled,
        endpoint: "/v0/orders/:orderId/cancel",
        entityType: "order_ticket",
        idempotencyService: input.idempotencyService,
        transactionManager,
        khqrProvider: input.khqrProvider,
        handler: async (service) =>
          service.cancelOrder({
            actor: req.v0Auth!,
            orderId: req.params.orderId,
            body: req.body,
          }),
        commandParts: [req.params.orderId],
      });
    }
  );

  router.post(
    "/orders/:orderId/items",
    requireV0Auth,
    async (req: V0AuthRequest, res: Response) => {
      await executeWrite({
        req,
        res,
        actionKey: V0_SALE_ORDER_ACTION_KEYS.orderItemsAdd,
        eventType: V0_SALE_ORDER_EVENT_TYPES.orderItemsAdded,
        endpoint: "/v0/orders/:orderId/items",
        entityType: "order_ticket",
        idempotencyService: input.idempotencyService,
        transactionManager,
        khqrProvider: input.khqrProvider,
        handler: async (service) =>
          service.addOrderItems({
            actor: req.v0Auth!,
            orderId: req.params.orderId,
            body: req.body,
          }),
        commandParts: [req.params.orderId],
      });
    }
  );

  router.post(
    "/orders/:orderId/checkout",
    requireV0Auth,
    async (req: V0AuthRequest, res: Response) => {
      await executeWrite({
        req,
        res,
        actionKey: V0_SALE_ORDER_ACTION_KEYS.orderCheckout,
        eventType: V0_SALE_ORDER_EVENT_TYPES.orderCheckoutCompleted,
        endpoint: "/v0/orders/:orderId/checkout",
        entityType: "sale",
        idempotencyService: input.idempotencyService,
        transactionManager,
        khqrProvider: input.khqrProvider,
        handler: async (service) =>
          service.checkoutOrder({
            actor: req.v0Auth!,
            orderId: req.params.orderId,
            body: req.body,
          }),
        commandParts: [req.params.orderId],
      });
    }
  );

  router.patch(
    "/orders/:orderId/fulfillment",
    requireV0Auth,
    async (req: V0AuthRequest, res: Response) => {
      await executeWrite({
        req,
        res,
        actionKey: V0_SALE_ORDER_ACTION_KEYS.orderFulfillmentStatusUpdate,
        eventType: V0_SALE_ORDER_EVENT_TYPES.orderFulfillmentStatusUpdated,
        endpoint: "/v0/orders/:orderId/fulfillment",
        entityType: "order_fulfillment_batch",
        idempotencyService: input.idempotencyService,
        transactionManager,
        khqrProvider: input.khqrProvider,
        handler: async (service) =>
          service.updateFulfillmentStatus({
            actor: req.v0Auth!,
            orderId: req.params.orderId,
            body: req.body,
          }),
        commandParts: [req.params.orderId],
      });
    }
  );

  router.get("/sales", requireV0Auth, async (req: V0AuthRequest, res: Response) => {
    try {
      const actor = req.v0Auth;
      if (!actor) {
        res.status(401).json({ success: false, error: "authentication required" });
        return;
      }
      const data = await input.service.listSales({
        actor,
        status: asString(req.query?.status),
        limit: asNumber(req.query?.limit),
        offset: asNumber(req.query?.offset),
      });
      res.status(200).json({ success: true, data });
    } catch (error) {
      handleError(res, error);
    }
  });

  router.get("/sales/:saleId", requireV0Auth, async (req: V0AuthRequest, res: Response) => {
    try {
      const actor = req.v0Auth;
      if (!actor) {
        res.status(401).json({ success: false, error: "authentication required" });
        return;
      }
      const data = await input.service.getSale({
        actor,
        saleId: req.params.saleId,
      });
      res.status(200).json({ success: true, data });
    } catch (error) {
      handleError(res, error);
    }
  });

  router.post(
    "/sales/:saleId/finalize",
    requireV0Auth,
    async (req: V0AuthRequest, res: Response) => {
      await executeWrite({
        req,
        res,
        actionKey: V0_SALE_ORDER_ACTION_KEYS.saleFinalize,
        eventType: V0_SALE_ORDER_EVENT_TYPES.saleFinalized,
        endpoint: "/v0/sales/:saleId/finalize",
        entityType: "sale",
        idempotencyService: input.idempotencyService,
        transactionManager,
        khqrProvider: input.khqrProvider,
        handler: async (service, _idempotencyKey, khqrService) => {
          const actor = req.v0Auth!;
          const body = toRecord(req.body);
          const currentSale = await service.getSale({
            actor,
            saleId: req.params.saleId,
          });
          const paymentMethod = asString((currentSale as Record<string, unknown>).paymentMethod);
          if (paymentMethod?.toUpperCase() === "KHQR") {
            const md5 =
              asString(body.khqrMd5)
              ?? asString(body.md5)
              ?? asString((currentSale as Record<string, unknown>).khqrMd5);
            if (!md5) {
              throw new V0SaleOrderError(
                422,
                "khqr confirmation required before finalize",
                "SALE_FINALIZE_KHQR_CONFIRMATION_REQUIRED"
              );
            }
            await khqrService.assertFinalizeEligibility({
              actor,
              saleId: req.params.saleId,
              md5,
            });
          }
          return service.finalizeSale({
            actor,
            saleId: req.params.saleId,
            body: req.body,
          });
        },
        commandParts: [req.params.saleId],
      });
    }
  );

  router.post(
    "/sales/:saleId/void/request",
    requireV0Auth,
    async (req: V0AuthRequest, res: Response) => {
      await executeWrite({
        req,
        res,
        actionKey: V0_SALE_ORDER_ACTION_KEYS.saleVoidRequest,
        eventType: V0_SALE_ORDER_EVENT_TYPES.saleVoidRequested,
        endpoint: "/v0/sales/:saleId/void/request",
        entityType: "void_request",
        idempotencyService: input.idempotencyService,
        transactionManager,
        khqrProvider: input.khqrProvider,
        handler: async (service) =>
          service.requestVoid({
            actor: req.v0Auth!,
            saleId: req.params.saleId,
            body: req.body,
          }),
        commandParts: [req.params.saleId],
      });
    }
  );

  router.post(
    "/sales/:saleId/void/approve",
    requireV0Auth,
    async (req: V0AuthRequest, res: Response) => {
      await executeWrite({
        req,
        res,
        actionKey: V0_SALE_ORDER_ACTION_KEYS.saleVoidApprove,
        eventType: V0_SALE_ORDER_EVENT_TYPES.saleVoidApproved,
        endpoint: "/v0/sales/:saleId/void/approve",
        entityType: "void_request",
        idempotencyService: input.idempotencyService,
        transactionManager,
        khqrProvider: input.khqrProvider,
        handler: async (service) =>
          service.approveVoid({
            actor: req.v0Auth!,
            saleId: req.params.saleId,
            body: req.body,
          }),
        commandParts: [req.params.saleId],
      });
    }
  );

  router.post(
    "/sales/:saleId/void/reject",
    requireV0Auth,
    async (req: V0AuthRequest, res: Response) => {
      await executeWrite({
        req,
        res,
        actionKey: V0_SALE_ORDER_ACTION_KEYS.saleVoidReject,
        eventType: V0_SALE_ORDER_EVENT_TYPES.saleVoidRejected,
        endpoint: "/v0/sales/:saleId/void/reject",
        entityType: "void_request",
        idempotencyService: input.idempotencyService,
        transactionManager,
        khqrProvider: input.khqrProvider,
        handler: async (service) =>
          service.rejectVoid({
            actor: req.v0Auth!,
            saleId: req.params.saleId,
            body: req.body,
          }),
        commandParts: [req.params.saleId],
      });
    }
  );

  router.post(
    "/sales/:saleId/void/execute",
    requireV0Auth,
    async (req: V0AuthRequest, res: Response) => {
      await executeWrite({
        req,
        res,
        actionKey: V0_SALE_ORDER_ACTION_KEYS.saleVoidExecute,
        eventType: V0_SALE_ORDER_EVENT_TYPES.saleVoidExecuted,
        endpoint: "/v0/sales/:saleId/void/execute",
        entityType: "sale",
        idempotencyService: input.idempotencyService,
        transactionManager,
        khqrProvider: input.khqrProvider,
        handler: async (service) =>
          service.executeVoid({
            actor: req.v0Auth!,
            saleId: req.params.saleId,
            body: req.body,
          }),
        commandParts: [req.params.saleId],
      });
    }
  );

  router.get(
    "/sales/:saleId/void-request",
    requireV0Auth,
    async (req: V0AuthRequest, res: Response) => {
      try {
        const actor = req.v0Auth;
        if (!actor) {
          res.status(401).json({ success: false, error: "authentication required" });
          return;
        }
        const data = await input.service.getVoidRequest({
          actor,
          saleId: req.params.saleId,
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
    actionKey: string;
    eventType: string;
    endpoint: string;
    entityType: string;
    idempotencyService: V0IdempotencyService;
    transactionManager: TransactionManager;
    khqrProvider: V0KhqrPaymentProvider;
    handler: (
      service: V0SaleOrderService,
      idempotencyKey: string,
      khqrService: V0KhqrPaymentService
    ) => Promise<unknown>;
    commandParts: ReadonlyArray<unknown>;
  }): Promise<void> {
    const actor = inputWrite.req.v0Auth;
    const idempotencyKey = getIdempotencyKeyFromHeader(inputWrite.req.headers);
    const commandIdempotencyKey = idempotencyKey ?? "";

    try {
      if (!actor) {
        inputWrite.res.status(401).json({ success: false, error: "authentication required" });
        return;
      }

      const tenantId = String(actor.tenantId ?? "").trim();
      const branchId = String(actor.branchId ?? "").trim();

      const result = await inputWrite.idempotencyService.execute<SaleOrderResponseBody>({
        idempotencyKey,
        actionKey: inputWrite.actionKey,
        scope: "BRANCH",
        tenantId,
        branchId,
        payload: {
          params: inputWrite.req.params,
          body: inputWrite.req.body,
        },
        handler: async () => {
          const data = await inputWrite.transactionManager.withTransaction(async (client) => {
            const txService = new V0SaleOrderService(new V0SaleOrderRepository(client));
            const txAuditService = new V0AuditService(new V0AuditRepository(client));
            const txOutboxRepository = new V0CommandOutboxRepository(client);
            const txSyncRepository = new V0PullSyncRepository(client);
            const txKhqrService = new V0KhqrPaymentService(
              new V0KhqrPaymentRepository(client),
              inputWrite.khqrProvider
            );

            const commandData = await inputWrite.handler(
              txService,
              commandIdempotencyKey,
              txKhqrService
            );
            const entityId = String((commandData as { id?: string })?.id ?? tenantId);
            const dedupeKey = buildSaleOrderCommandDedupeKey(
              inputWrite.actionKey,
              commandIdempotencyKey,
              "SUCCESS",
              inputWrite.commandParts
            );

            await txAuditService.recordEvent({
              tenantId,
              branchId,
              actorAccountId: actor.accountId,
              actionKey: inputWrite.actionKey,
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
              branchId,
              actionKey: inputWrite.actionKey,
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
              await txSyncRepository.appendChange({
                tenantId,
                branchId,
                moduleKey: "saleOrder",
                entityType: inputWrite.entityType,
                entityId,
                operation: "UPSERT",
                revision: `saleOrder:${outbox.row.id}`,
                data: toSyncData(commandData),
                changedAt: outbox.row.occurred_at,
                sourceOutboxId: outbox.row.id,
              });

              const extraChanges = collectExtraSyncChanges(commandData);
              for (const extra of extraChanges) {
                await txSyncRepository.appendChange({
                  tenantId,
                  branchId,
                  moduleKey: "saleOrder",
                  entityType: extra.entityType,
                  entityId: extra.entityId,
                  operation: "UPSERT",
                  revision: `saleOrder:${outbox.row.id}:${extra.entityType}`,
                  data: extra.data,
                  changedAt: outbox.row.occurred_at,
                  sourceOutboxId: outbox.row.id,
                });
              }
            }

            const responseData = await maybeAttachReceiptPreviewToResponse({
              client,
              tenantId,
              branchId,
              actionKey: inputWrite.actionKey,
              commandData,
            });

            return responseData;
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

function toRecord(input: unknown): Record<string, unknown> {
  if (input && typeof input === "object" && !Array.isArray(input)) {
    return input as Record<string, unknown>;
  }
  return {};
}

function toSyncData(data: unknown): Record<string, unknown> {
  if (data && typeof data === "object" && !Array.isArray(data)) {
    return data as Record<string, unknown>;
  }
  return { value: data };
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

function collectExtraSyncChanges(
  commandData: unknown
): Array<{ entityType: string; entityId: string; data: Record<string, unknown> }> {
  if (!commandData || typeof commandData !== "object" || Array.isArray(commandData)) {
    return [];
  }
  const record = commandData as Record<string, unknown>;
  const extra: Array<{ entityType: string; entityId: string; data: Record<string, unknown> }> = [];

  collectArrayEntity(record.lines, "sale_line", extra);
  collectArrayEntity(record.addedLines, "order_ticket_line", extra);
  collectArrayEntity(record.fulfillmentBatches, "order_fulfillment_batch", extra);
  collectEntity(record.order, "order_ticket", extra);
  collectEntity(record.voidRequest, "void_request", extra);
  collectEntity(record.batch, "order_fulfillment_batch", extra);

  return extra;
}

function collectArrayEntity(
  value: unknown,
  entityType: string,
  extra: Array<{ entityType: string; entityId: string; data: Record<string, unknown> }>
): void {
  if (!Array.isArray(value)) {
    return;
  }
  for (const item of value) {
    collectEntity(item, entityType, extra);
  }
}

function collectEntity(
  value: unknown,
  entityType: string,
  extra: Array<{ entityType: string; entityId: string; data: Record<string, unknown> }>
): void {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return;
  }
  const record = value as Record<string, unknown>;
  const id = typeof record.id === "string" ? record.id : null;
  if (!id) {
    return;
  }
  extra.push({ entityType, entityId: id, data: record });
}

async function maybeAttachReceiptPreviewToResponse(input: {
  client: PoolClient;
  tenantId: string;
  branchId: string;
  actionKey: string;
  commandData: unknown;
}): Promise<unknown> {
  if (
    input.actionKey !== V0_SALE_ORDER_ACTION_KEYS.checkoutCashFinalize &&
    input.actionKey !== V0_SALE_ORDER_ACTION_KEYS.orderCheckout &&
    input.actionKey !== V0_SALE_ORDER_ACTION_KEYS.saleFinalize
  ) {
    return input.commandData;
  }

  if (!input.commandData || typeof input.commandData !== "object" || Array.isArray(input.commandData)) {
    return input.commandData;
  }

  const record = input.commandData as Record<string, unknown>;
  const status = typeof record.status === "string" ? record.status.toUpperCase() : "";
  if (status !== "FINALIZED") {
    return input.commandData;
  }

  const saleId = typeof record.id === "string" ? record.id.trim() : "";
  if (!saleId) {
    return input.commandData;
  }

  const saleRepo = new V0SaleOrderRepository(input.client);
  const sale = await saleRepo.getSaleById({
    tenantId: input.tenantId,
    branchId: input.branchId,
    saleId,
  });
  if (!sale) {
    return input.commandData;
  }
  const lines = await saleRepo.listSaleLines({
    tenantId: input.tenantId,
    saleId: sale.id,
  });
  return {
    ...record,
    receipt: buildSaleReceiptPreview({
      sale,
      lines,
    }),
  };
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

  if (error instanceof V0SaleOrderError) {
    res.status(error.statusCode).json({
      success: false,
      error: error.message,
      code: error.code,
    });
    return;
  }

  if (isUniqueViolation(error)) {
    res.status(409).json({
      success: false,
      error: "sale-order uniqueness conflict",
      code: "SALE_ORDER_UNIQUE_CONSTRAINT",
    });
    return;
  }

  res.status(500).json({
    success: false,
    error: error instanceof Error ? error.message : "internal server error",
  });
}

function isUniqueViolation(error: unknown): error is { code: string; constraint?: string } {
  return Boolean(
    error &&
      typeof error === "object" &&
      "code" in error &&
      (error as { code?: string }).code === "23505"
  );
}
