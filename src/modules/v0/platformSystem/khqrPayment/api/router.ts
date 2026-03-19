import { Router, type Response } from "express";
import type { Pool, PoolClient } from "pg";
import { requireV0Auth, type V0AuthRequest } from "../../../auth/api/middleware.js";
import { TransactionManager } from "../../../../../platform/db/transactionManager.js";
import { V0CommandOutboxRepository } from "../../../../../platform/outbox/repository.js";
import { V0PullSyncRepository } from "../../pullSync/infra/repository.js";
import { log } from "#logger";
import { recordKhqrWebhookEvent } from "../../../../../platform/observability/metrics.js";
import {
  getIdempotencyKeyFromHeader,
  V0IdempotencyError,
  V0IdempotencyService,
} from "../../../../../platform/idempotency/service.js";
import { V0_KHQR_PAYMENT_ACTION_KEYS } from "../app/command-contract.js";
import {
  V0KhqrPaymentError,
  V0KhqrPaymentService,
  type V0KhqrFinalizedSaleView,
} from "../app/service.js";
import { V0KhqrProviderError } from "../app/payment-provider.js";
import { V0KhqrPaymentRepository } from "../infra/repository.js";
import type { V0KhqrPaymentProvider } from "../app/payment-provider.js";
import { V0AuditRepository } from "../../../audit/infra/repository.js";
import { V0AuditService } from "../../../audit/app/service.js";
import {
  V0SaleOrderRepository,
  type V0OrderFulfillmentBatchRow,
  type V0OrderTicketLineRow,
  type V0OrderTicketRow,
  type V0SaleLineRow,
  type V0SaleRow,
} from "../../../posOperation/saleOrder/infra/repository.js";
import { buildSaleReceiptPreview } from "../../../posOperation/receipt/app/preview.js";

type KhqrResponseBody =
  | {
      success: true;
      data: unknown;
    }
  | {
      success: false;
      error: string;
      code?: string;
    };

export function createV0KhqrPaymentRouter(input: {
  service: V0KhqrPaymentService;
  provider: V0KhqrPaymentProvider;
  idempotencyService: V0IdempotencyService;
  db: Pool;
}): Router {
  const router = Router();
  const transactionManager = new TransactionManager(input.db);

  router.post("/webhooks/provider", async (req, res) => {
    const requestId = req.v0Context?.requestId ?? null;
    recordKhqrWebhookEvent({ outcome: "received" });
    log.info("khqr.webhook.received", {
      event: "khqr.webhook.received",
      requestId,
      route: "/v0/payments/khqr/webhooks/provider",
    });

    try {
      const body = asRecord(req.body);
      const event = input.provider.parseWebhookEvent({
        headers: req.headers as unknown as Record<string, unknown>,
        body,
      });

      const result = await transactionManager.withTransaction(async (client) => {
        const txService = new V0KhqrPaymentService(
          new V0KhqrPaymentRepository(client),
          input.provider
        );
        const ingest = await txService.ingestWebhookEvent({ event });
        if (ingest.saleFinalized && ingest.sale) {
          await appendSaleFinalizedSideEffects({
            client,
            tenantId: event.tenantId,
            branchId: event.branchId,
            actorAccountId: null,
            actorType: "SYSTEM",
            sale: ingest.sale,
            metadata: {
              source: "khqr.webhook",
              providerEventId: ingest.providerEventId,
              verificationStatus: ingest.verificationStatus,
            },
          });
        }
        return ingest;
      });

      const webhookOutcome =
        result.status === "APPLIED"
          ? "applied"
          : result.status === "DUPLICATE"
            ? "duplicate"
            : "ignored";
      recordKhqrWebhookEvent({
        outcome: webhookOutcome,
        ignoredReason: result.status === "IGNORED" ? result.ignoredReason : null,
      });
      log.info("khqr.webhook.processed", {
        event: "khqr.webhook.processed",
        requestId,
        resultStatus: result.status,
        ignoredReason: result.ignoredReason,
        verificationStatus: result.verificationStatus,
        saleFinalized: result.saleFinalized,
        tenantId: event.tenantId,
        branchId: event.branchId,
        providerEventId: result.providerEventId,
      });

      res.status(result.status === "IGNORED" ? 202 : 200).json({
        success: true,
        data: result,
      });
    } catch (error) {
      const classified = classifyWebhookError(error);
      recordKhqrWebhookEvent({
        outcome: classified.outcome,
        errorCode: classified.errorCode,
      });
      log[classified.logLevel]("khqr.webhook.failed", {
        event: "khqr.webhook.failed",
        requestId,
        outcome: classified.outcome,
        errorCode: classified.errorCode,
        error: error instanceof Error ? error.message : String(error),
      });
      handleError(res, error);
    }
  });

  router.post("/sales/:saleId/generate", requireV0Auth, async (req: V0AuthRequest, res: Response) => {
    const actor = req.v0Auth;
    const idempotencyKey = getIdempotencyKeyFromHeader(req.headers);
    const actionKey = V0_KHQR_PAYMENT_ACTION_KEYS.generate;

    try {
      if (!actor) {
        res.status(401).json({ success: false, error: "authentication required" });
        return;
      }
      const saleId = assertUuid(req.params.saleId, "saleId");
      const body = parseGenerateBody(req.body);
      const tenantId = normalizeOptionalString(actor.tenantId);
      const branchId = normalizeOptionalString(actor.branchId);

      const result = await input.idempotencyService.execute<KhqrResponseBody>({
        idempotencyKey,
        actionKey,
        scope: "BRANCH",
        tenantId,
        branchId,
        payload: {
          saleId,
          body,
        },
        handler: async () => {
          const data = await transactionManager.withTransaction(async (client) => {
            const txService = new V0KhqrPaymentService(
              new V0KhqrPaymentRepository(client),
              input.provider
            );
            return txService.generateForSale({
              actor,
              saleId,
              expiresInSeconds: body.expiresInSeconds,
            });
          });

          return {
            statusCode: 201,
            body: {
              success: true,
              data,
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
  });

  router.post("/attempts", requireV0Auth, async (req: V0AuthRequest, res: Response) => {
    const actor = req.v0Auth;
    const idempotencyKey = getIdempotencyKeyFromHeader(req.headers);
    const actionKey = V0_KHQR_PAYMENT_ACTION_KEYS.attemptRegister;

    try {
      if (!actor) {
        res.status(401).json({ success: false, error: "authentication required" });
        return;
      }
      const body = parseRegisterBody(req.body);
      const tenantId = normalizeOptionalString(actor.tenantId);
      const branchId = normalizeOptionalString(actor.branchId);

      const result = await input.idempotencyService.execute<KhqrResponseBody>({
        idempotencyKey,
        actionKey,
        scope: "BRANCH",
        tenantId,
        branchId,
        payload: {
          body,
        },
        handler: async () => {
          const writeResult = await transactionManager.withTransaction(async (client) => {
            const txService = new V0KhqrPaymentService(
              new V0KhqrPaymentRepository(client),
              input.provider
            );
            return txService.registerAttempt({
              actor,
              saleId: body.saleId,
              md5: body.md5,
              amount: body.amount,
              currency: body.currency,
              expiresAt: body.expiresAt,
            });
          });
          return {
            statusCode: writeResult.created ? 201 : 200,
            body: {
              success: true,
              data: writeResult.attempt,
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
  });

  router.post(
    "/attempts/:attemptId/cancel",
    requireV0Auth,
    async (req: V0AuthRequest, res: Response) => {
      const actor = req.v0Auth;
      const idempotencyKey = getIdempotencyKeyFromHeader(req.headers);
      const actionKey = V0_KHQR_PAYMENT_ACTION_KEYS.attemptCancel;

      try {
        if (!actor) {
          res.status(401).json({ success: false, error: "authentication required" });
          return;
        }

        const attemptId = assertUuid(req.params.attemptId, "attemptId");
        const body = parseCancelBody(req.body);
        const tenantId = normalizeOptionalString(actor.tenantId);
        const branchId = normalizeOptionalString(actor.branchId);

        const result = await input.idempotencyService.execute<KhqrResponseBody>({
          idempotencyKey,
          actionKey,
          scope: "BRANCH",
          tenantId,
          branchId,
          payload: { attemptId, body },
          handler: async () => {
            const data = await transactionManager.withTransaction(async (client) => {
              const txService = new V0KhqrPaymentService(
                new V0KhqrPaymentRepository(client),
                input.provider
              );
              return txService.cancelAttempt({
                actor,
                attemptId,
                reasonCode: body.reasonCode,
              });
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
          res.setHeader("Idempotency-Replayed", "true");
        }
        res.status(result.statusCode).json(result.body);
      } catch (error) {
        handleError(res, error);
      }
    }
  );

  router.get("/attempts/:attemptId", requireV0Auth, async (req: V0AuthRequest, res: Response) => {
    try {
      const actor = req.v0Auth;
      if (!actor) {
        res.status(401).json({ success: false, error: "authentication required" });
        return;
      }
      const attemptId = assertUuid(req.params.attemptId, "attemptId");
      const data = await input.service.getAttemptById({
        actor,
        attemptId,
      });
      res.status(200).json({ success: true, data });
    } catch (error) {
      handleError(res, error);
    }
  });

  router.get(
    "/attempts/by-md5/:md5",
    requireV0Auth,
    async (req: V0AuthRequest, res: Response) => {
      try {
        const actor = req.v0Auth;
        if (!actor) {
          res.status(401).json({ success: false, error: "authentication required" });
          return;
        }
        const md5 = assertMd5(req.params.md5, "md5");
        const data = await input.service.getAttemptByMd5({
          actor,
          md5,
        });
        res.status(200).json({ success: true, data });
      } catch (error) {
        handleError(res, error);
      }
    }
  );

  router.post("/confirm", requireV0Auth, async (req: V0AuthRequest, res: Response) => {
    const actor = req.v0Auth;
    const idempotencyKey = getIdempotencyKeyFromHeader(req.headers);
    const actionKey = V0_KHQR_PAYMENT_ACTION_KEYS.confirm;

    try {
      if (!actor) {
        res.status(401).json({ success: false, error: "authentication required" });
        return;
      }
      const body = parseConfirmBody(req.body);
      const tenantId = normalizeOptionalString(actor.tenantId);
      const branchId = normalizeOptionalString(actor.branchId);

      const result = await input.idempotencyService.execute<KhqrResponseBody>({
        idempotencyKey,
        actionKey,
        scope: "BRANCH",
        tenantId,
        branchId,
        payload: {
          body,
        },
        handler: async () => {
          const data = await transactionManager.withTransaction(async (client) => {
            const txService = new V0KhqrPaymentService(
              new V0KhqrPaymentRepository(client),
              input.provider
            );
            const confirmed = await txService.confirmByMd5({
              actor,
              md5: body.md5,
            });
            let receipt: ReturnType<typeof buildSaleReceiptPreview> | null = null;
            if (confirmed.saleFinalized && confirmed.sale) {
              await appendSaleFinalizedSideEffects({
                client,
                tenantId: actor.tenantId ?? "",
                branchId: actor.branchId ?? "",
                actorAccountId: actor.accountId,
                actorType: "ACCOUNT",
                sale: confirmed.sale,
                metadata: {
                  source: "khqr.manual_confirm",
                  verificationStatus: confirmed.verificationStatus,
                },
              });

              const txSaleRepo = new V0SaleOrderRepository(client);
              const saleRow = await txSaleRepo.getSaleById({
                tenantId: actor.tenantId ?? "",
                branchId: actor.branchId ?? "",
                saleId: confirmed.sale.saleId,
              });
              if (saleRow) {
                const saleLines = await txSaleRepo.listSaleLines({
                  tenantId: actor.tenantId ?? "",
                  saleId: saleRow.id,
                });
                receipt = buildSaleReceiptPreview({
                  sale: saleRow,
                  lines: saleLines,
                });
              }
            }
            return {
              ...confirmed,
              receipt,
            };
          });

          return {
            statusCode: 200,
            body: {
              success: true,
              data: {
                verificationStatus: data.verificationStatus,
                attempt: data.attempt,
                sale: data.sale,
                saleFinalized: data.saleFinalized,
                ...(data.receipt ? { receipt: data.receipt } : {}),
                ...(data.mismatchReasonCode
                  ? { mismatchReasonCode: data.mismatchReasonCode }
                  : {}),
              },
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
  });

  return router;
}

async function appendSaleFinalizedSideEffects(input: {
  client: PoolClient;
  tenantId: string;
  branchId: string;
  actorAccountId: string | null;
  actorType: "ACCOUNT" | "SYSTEM";
  sale: V0KhqrFinalizedSaleView;
  metadata: Record<string, unknown>;
}): Promise<void> {
  const tenantId = normalizeOptionalString(input.tenantId);
  const branchId = normalizeOptionalString(input.branchId);
  if (!tenantId || !branchId) {
    return;
  }

  const occurredAt = new Date();
  const actionKey = "sale.finalize";
  const eventType = "SALE_FINALIZED";
  const dedupeKey = `sale.finalize:khqr:${input.sale.saleId}`;

  const auditService = new V0AuditService(new V0AuditRepository(input.client));
  const outboxRepo = new V0CommandOutboxRepository(input.client);
  const syncRepo = new V0PullSyncRepository(input.client);
  const saleOrderRepo = new V0SaleOrderRepository(input.client);

  const saleRow = await saleOrderRepo.getSaleById({
    tenantId,
    branchId,
    saleId: input.sale.saleId,
  });
  const saleLines = saleRow
    ? await saleOrderRepo.listSaleLines({
        tenantId,
        saleId: saleRow.id,
      })
    : [];
  const orderRow =
    saleRow?.order_ticket_id
      ? await saleOrderRepo.getOrderTicketById({
          tenantId,
          branchId,
          orderTicketId: saleRow.order_ticket_id,
        })
      : null;
  const orderLines = orderRow
    ? await saleOrderRepo.listOrderTicketLines({
        tenantId,
        orderTicketId: orderRow.id,
      })
    : [];
  const fulfillmentBatches = orderRow
    ? await saleOrderRepo.listFulfillmentBatchesByOrder({
        tenantId,
        orderTicketId: orderRow.id,
      })
    : [];

  await auditService.recordEvent({
    tenantId,
    branchId,
    actorAccountId: input.actorAccountId,
    actionKey,
    outcome: "SUCCESS",
    reasonCode: null,
    entityType: "sale",
    entityId: input.sale.saleId,
    dedupeKey,
    metadata: input.metadata,
  });

  const outbox = await outboxRepo.insertEvent({
    tenantId,
    branchId,
    actionKey,
    eventType,
    actorType: input.actorType,
    actorId: input.actorAccountId,
    entityType: "sale",
    entityId: input.sale.saleId,
    outcome: "SUCCESS",
    dedupeKey,
    payload: input.metadata,
    occurredAt,
  });

  if (outbox.inserted && outbox.row) {
    await syncRepo.appendChange({
      tenantId,
      branchId,
      moduleKey: "saleOrder",
      entityType: "sale",
      entityId: input.sale.saleId,
      operation: "UPSERT",
      revision: `saleOrder:${outbox.row.id}`,
      data: saleRow ? mapSaleSyncData(saleRow) : mapFinalizedSaleSyncData(input.sale),
      changedAt: outbox.row.occurred_at,
      sourceOutboxId: outbox.row.id,
    });

    for (const saleLine of saleLines) {
      await syncRepo.appendChange({
        tenantId,
        branchId,
        moduleKey: "saleOrder",
        entityType: "sale_line",
        entityId: saleLine.id,
        operation: "UPSERT",
        revision: `saleOrder:${outbox.row.id}`,
        data: mapSaleLineSyncData(saleLine),
        changedAt: outbox.row.occurred_at,
        sourceOutboxId: outbox.row.id,
      });
    }

    if (orderRow) {
      await syncRepo.appendChange({
        tenantId,
        branchId,
        moduleKey: "saleOrder",
        entityType: "order_ticket",
        entityId: orderRow.id,
        operation: "UPSERT",
        revision: `saleOrder:${outbox.row.id}`,
        data: mapOrderSyncData(orderRow),
        changedAt: outbox.row.occurred_at,
        sourceOutboxId: outbox.row.id,
      });

      for (const orderLine of orderLines) {
        await syncRepo.appendChange({
          tenantId,
          branchId,
          moduleKey: "saleOrder",
          entityType: "order_ticket_line",
          entityId: orderLine.id,
          operation: "UPSERT",
          revision: `saleOrder:${outbox.row.id}`,
          data: mapOrderLineSyncData(orderLine),
          changedAt: outbox.row.occurred_at,
          sourceOutboxId: outbox.row.id,
        });
      }

      for (const fulfillmentBatch of fulfillmentBatches) {
        await syncRepo.appendChange({
          tenantId,
          branchId,
          moduleKey: "saleOrder",
          entityType: "order_fulfillment_batch",
          entityId: fulfillmentBatch.id,
          operation: "UPSERT",
          revision: `saleOrder:${outbox.row.id}`,
          data: mapFulfillmentBatchSyncData(fulfillmentBatch),
          changedAt: outbox.row.occurred_at,
          sourceOutboxId: outbox.row.id,
        });
      }
    }
  }
}

function mapFinalizedSaleSyncData(sale: V0KhqrFinalizedSaleView): Record<string, unknown> {
  return {
    id: sale.saleId,
    orderId: sale.orderId,
    status: sale.status,
    saleType: sale.saleType,
    paymentMethod: sale.paymentMethod,
    tenderCurrency: sale.tenderCurrency,
    tenderAmount: sale.tenderAmount,
    paidAmount: sale.paidAmount,
    grandTotalUsd: sale.grandTotalUsd,
    grandTotalKhr: sale.grandTotalKhr,
    khqrMd5: sale.khqrMd5,
    khqrToAccountId: sale.khqrToAccountId,
    khqrHash: sale.khqrHash,
    khqrConfirmedAt: sale.khqrConfirmedAt,
    finalizedAt: sale.finalizedAt,
    finalizedByAccountId: sale.finalizedByAccountId,
  };
}

function mapSaleSyncData(row: V0SaleRow): Record<string, unknown> {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    branchId: row.branch_id,
    orderId: row.order_ticket_id,
    status: row.status,
    saleType: row.sale_type,
    paymentMethod: row.payment_method,
    tenderCurrency: row.tender_currency,
    tenderAmount: row.tender_amount,
    cashReceivedTenderAmount: row.cash_received_tender_amount,
    cashChangeTenderAmount: row.cash_change_tender_amount,
    khqrMd5: row.khqr_md5,
    khqrToAccountId: row.khqr_to_account_id,
    khqrHash: row.khqr_hash,
    khqrConfirmedAt: row.khqr_confirmed_at ? row.khqr_confirmed_at.toISOString() : null,
    subtotalUsd: row.subtotal_usd,
    subtotalKhr: row.subtotal_khr,
    discountUsd: row.discount_usd,
    discountKhr: row.discount_khr,
    vatUsd: row.vat_usd,
    vatKhr: row.vat_khr,
    grandTotalUsd: row.grand_total_usd,
    grandTotalKhr: row.grand_total_khr,
    saleFxRateKhrPerUsd: row.sale_fx_rate_khr_per_usd,
    saleKhrRoundingEnabled: row.sale_khr_rounding_enabled,
    saleKhrRoundingMode: row.sale_khr_rounding_mode,
    saleKhrRoundingGranularity: row.sale_khr_rounding_granularity,
    finalizedAt: row.finalized_at ? row.finalized_at.toISOString() : null,
    finalizedByAccountId: row.finalized_by_account_id,
    voidedAt: row.voided_at ? row.voided_at.toISOString() : null,
    voidReason: row.void_reason,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

function mapSaleLineSyncData(row: V0SaleLineRow): Record<string, unknown> {
  return {
    id: row.id,
    saleId: row.sale_id,
    orderLineId: row.order_ticket_line_id,
    menuItemId: row.menu_item_id,
    menuItemNameSnapshot: row.menu_item_name_snapshot,
    unitPrice: row.unit_price,
    quantity: row.quantity,
    lineDiscountAmount: row.line_discount_amount,
    lineTotalAmount: row.line_total_amount,
    modifierSnapshot: row.modifier_snapshot,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

function mapOrderSyncData(row: V0OrderTicketRow): Record<string, unknown> {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    branchId: row.branch_id,
    openedByAccountId: row.opened_by_account_id,
    status: row.status,
    sourceMode: row.source_mode,
    checkedOutAt: row.checked_out_at ? row.checked_out_at.toISOString() : null,
    checkedOutByAccountId: row.checked_out_by_account_id,
    cancelledAt: row.cancelled_at ? row.cancelled_at.toISOString() : null,
    cancelledByAccountId: row.cancelled_by_account_id,
    cancelReason: row.cancel_reason,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

function mapOrderLineSyncData(row: V0OrderTicketLineRow): Record<string, unknown> {
  return {
    id: row.id,
    orderId: row.order_ticket_id,
    menuItemId: row.menu_item_id,
    menuItemNameSnapshot: row.menu_item_name_snapshot,
    unitPrice: row.unit_price,
    quantity: row.quantity,
    lineSubtotal: row.line_subtotal,
    modifierSnapshot: row.modifier_snapshot,
    note: row.note,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

function mapFulfillmentBatchSyncData(row: V0OrderFulfillmentBatchRow): Record<string, unknown> {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    branchId: row.branch_id,
    orderId: row.order_ticket_id,
    status: row.status,
    note: row.note,
    createdByAccountId: row.created_by_account_id,
    completedAt: row.completed_at?.toISOString() ?? null,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

function parseRegisterBody(body: unknown): {
  saleId: string;
  md5: string;
  amount: number;
  currency: "USD" | "KHR";
  expiresAt: Date | null;
} {
  const record = asRecord(body);
  const saleId = assertUuid(record.saleId, "saleId");
  const md5 = assertMd5(record.md5, "md5");
  const amount = assertPositiveNumber(record.amount, "amount");
  const currency = assertCurrency(record.currency);
  const expiresAt = parseOptionalIsoDate(record.expiresAt, "expiresAt");
  return {
    saleId,
    md5,
    amount,
    currency,
    expiresAt,
  };
}

function parseConfirmBody(body: unknown): { md5: string } {
  const record = asRecord(body);
  return {
    md5: assertMd5(record.md5, "md5"),
  };
}

function parseCancelBody(body: unknown): { reasonCode: string | null } {
  const record = asRecord(body ?? {});
  return {
    reasonCode: normalizeOptionalString(record.reasonCode),
  };
}

function parseGenerateBody(body: unknown): { expiresInSeconds: number | null } {
  const record = asRecord(body ?? {});
  const raw = record.expiresInSeconds;
  if (raw === undefined || raw === null || String(raw).trim().length === 0) {
    return { expiresInSeconds: null };
  }
  const numeric = Number(raw);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    throw new V0KhqrPaymentError(
      422,
      "KHQR_ATTEMPT_PAYLOAD_INVALID",
      "expiresInSeconds must be a positive number"
    );
  }
  return { expiresInSeconds: Math.floor(numeric) };
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new V0KhqrPaymentError(
      422,
      "KHQR_ATTEMPT_PAYLOAD_INVALID",
      "body must be an object"
    );
  }
  return value as Record<string, unknown>;
}

function assertUuid(value: unknown, fieldName: string): string {
  const normalized = normalizeOptionalString(value);
  if (!normalized || !UUID_PATTERN.test(normalized)) {
    throw new V0KhqrPaymentError(
      422,
      "KHQR_ATTEMPT_PAYLOAD_INVALID",
      `${fieldName} must be a valid UUID`
    );
  }
  return normalized;
}

function assertMd5(value: unknown, fieldName: string): string {
  const normalized = normalizeOptionalString(value);
  if (!normalized || !MD5_PATTERN.test(normalized)) {
    throw new V0KhqrPaymentError(
      422,
      "KHQR_ATTEMPT_PAYLOAD_INVALID",
      `${fieldName} must be a valid md5 hash`
    );
  }
  return normalized.toLowerCase();
}

function assertPositiveNumber(value: unknown, fieldName: string): number {
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue) || numberValue <= 0) {
    throw new V0KhqrPaymentError(
      422,
      "KHQR_ATTEMPT_PAYLOAD_INVALID",
      `${fieldName} must be greater than 0`
    );
  }
  return Number(numberValue.toFixed(2));
}

function assertCurrency(value: unknown): "USD" | "KHR" {
  const normalized = String(value ?? "").trim().toUpperCase();
  if (normalized !== "USD" && normalized !== "KHR") {
    throw new V0KhqrPaymentError(
      422,
      "KHQR_ATTEMPT_PAYLOAD_INVALID",
      "currency must be USD or KHR"
    );
  }
  return normalized;
}

function parseOptionalIsoDate(value: unknown, fieldName: string): Date | null {
  if (value === undefined || value === null || String(value).trim().length === 0) {
    return null;
  }
  const parsed = new Date(String(value));
  if (Number.isNaN(parsed.getTime())) {
    throw new V0KhqrPaymentError(
      422,
      "KHQR_ATTEMPT_PAYLOAD_INVALID",
      `${fieldName} must be a valid ISO datetime`
    );
  }
  return parsed;
}

function normalizeOptionalString(value: unknown): string | null {
  const normalized = String(value ?? "").trim();
  return normalized.length > 0 ? normalized : null;
}

function classifyWebhookError(error: unknown): {
  outcome: "unauthorized" | "invalid_payload" | "failed";
  errorCode: string;
  logLevel: "warn" | "error";
} {
  if (
    error instanceof V0KhqrProviderError ||
    error instanceof V0KhqrPaymentError
  ) {
    const errorCode = error.code ?? "KHQR_WEBHOOK_INGEST_FAILED";
    if (errorCode === "KHQR_WEBHOOK_UNAUTHORIZED") {
      return {
        outcome: "unauthorized",
        errorCode,
        logLevel: "warn",
      };
    }
    if (
      errorCode === "KHQR_WEBHOOK_PAYLOAD_INVALID"
      || errorCode === "KHQR_ATTEMPT_PAYLOAD_INVALID"
    ) {
      return {
        outcome: "invalid_payload",
        errorCode,
        logLevel: "warn",
      };
    }
    return {
      outcome: "failed",
      errorCode,
      logLevel: "error",
    };
  }
  return {
    outcome: "failed",
    errorCode: "KHQR_WEBHOOK_INGEST_FAILED",
    logLevel: "error",
  };
}

function handleError(res: Response, error: unknown): void {
  if (
    error instanceof V0KhqrPaymentError ||
    error instanceof V0IdempotencyError ||
    error instanceof V0KhqrProviderError
  ) {
    res.status(error.statusCode).json({
      success: false,
      error: error.message,
      code: error.code,
    });
    return;
  }

  if (error instanceof Error && isPostgresUniqueViolation(error)) {
    res.status(409).json({
      success: false,
      error: "khqr attempt already exists",
      code: "KHQR_ATTEMPT_ALREADY_EXISTS",
    });
    return;
  }

  res.status(500).json({
    success: false,
    error: error instanceof Error ? error.message : "internal server error",
  });
}

function isPostgresUniqueViolation(error: Error): boolean {
  const code = (error as Error & { code?: string }).code;
  return code === "23505";
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MD5_PATTERN = /^[0-9a-f]{32}$/i;
