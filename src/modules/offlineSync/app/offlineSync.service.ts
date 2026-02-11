import type { PoolClient } from "pg";
import { z } from "zod";
import type { BranchGuardPort } from "../../../shared/ports/branch.js";
import type {
  AuditDenialReason,
  AuditOutcome,
  AuditWriterPort,
} from "../../../shared/ports/audit.js";
import { publishToOutbox } from "../../../platform/events/outbox.js";
import type {
  CashSessionClosedV1,
  CashSessionOpenedV1,
  SaleFinalizedV1,
} from "../../../shared/events.js";
import {
  addItemToSale,
  applyLineDiscount,
  applyOrderDiscount,
  applyVAT,
  createDraftSale,
  finalizeSale,
  recalculateSaleTotals,
  setPaymentMethod,
  setTenderCurrency,
} from "../../sales/domain/entities/sale.entity.js";
import type { Sale } from "../../sales/domain/entities/sale.entity.js";
import type { MenuPort, PolicyPort, SalesRepository } from "../../sales/app/ports/sales.ports.js";
import type {
  OfflineSyncAppliedResult,
  OfflineSyncApplyResponse,
  OfflineSyncApplyResult,
  OfflineSyncErrorCode,
  OfflineSyncOperationInput,
  OfflineSyncOperationRecord,
  OfflineSyncOperationType,
} from "../domain/entities.js";
import { OFFLINE_SYNC_OPERATION_TYPES } from "../domain/entities.js";
import { PgOfflineSyncOperationsRepository } from "../infra/repository.js";

export interface ITransactionManager {
  withTransaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T>;
}

class OfflineSyncApplyError extends Error {
  readonly code: OfflineSyncErrorCode;
  readonly outcome: AuditOutcome;
  readonly denialReason?: AuditDenialReason;

  constructor(params: {
    code: OfflineSyncErrorCode;
    message: string;
    outcome?: AuditOutcome;
    denialReason?: AuditDenialReason;
  }) {
    super(params.message);
    this.code = params.code;
    this.outcome = params.outcome ?? "REJECTED";
    this.denialReason = params.denialReason;
  }
}

function isBranchFrozenError(err: unknown): boolean {
  if (!err) return false;
  if (typeof err === "object" && "code" in err && (err as any).code === "BRANCH_FROZEN") {
    return true;
  }
  if (err instanceof Error && err.message === "Branch is frozen") {
    return true;
  }
  return false;
}

function recordToApplyResult(
  record: OfflineSyncOperationRecord,
  deduped: boolean
): OfflineSyncApplyResult {
  return {
    clientOpId: record.clientOpId,
    type: record.type,
    status: record.status === "PROCESSING" ? "FAILED" : record.status,
    deduped,
    result: (record.result ?? undefined) as any,
    errorCode: (record.errorCode ?? undefined) as any,
    errorMessage: record.errorMessage ?? undefined,
  };
}

const saleFinalizedPayloadSchema = z
  .object({
    client_sale_uuid: z.string().uuid(),
    sale_type: z.enum(["dine_in", "take_away", "delivery"]),
    items: z
      .array(
        z.object({
          menu_item_id: z.string().uuid(),
          quantity: z.number().int().min(1),
          modifiers: z.array(z.any()).optional().default([]),
        })
      )
      .min(1),
    tender_currency: z.enum(["KHR", "USD"]),
    payment_method: z.enum(["cash", "qr"]),
    cash_received: z
      .object({
        khr: z.number().nonnegative().optional(),
        usd: z.number().nonnegative().optional(),
      })
      .optional(),
  })
  .strict();

const cashSessionOpenedPayloadSchema = z
  .object({
    register_id: z.string().uuid().optional(),
    opening_float_usd: z.number().nonnegative(),
    opening_float_khr: z.number().nonnegative(),
    note: z.string().max(500).optional(),
  })
  .strict();

const cashSessionClosedPayloadSchema = z
  .object({
    session_id: z.string().uuid(),
    counted_cash_usd: z.number().nonnegative(),
    counted_cash_khr: z.number().nonnegative(),
    note: z.string().max(500).optional(),
  })
  .strict();

export class OfflineSyncService {
  constructor(
    private repo: PgOfflineSyncOperationsRepository,
    private txManager: ITransactionManager,
    private branchGuardPort: BranchGuardPort,
    private auditWriter: AuditWriterPort,
    private salesRepo: SalesRepository,
    private policyPort: PolicyPort,
    private menuPort: MenuPort
  ) {}

  async applyOperations(params: {
    tenantId: string;
    branchId: string;
    employeeId: string;
    actorRole?: string | null;
    operations: OfflineSyncOperationInput[];
  }): Promise<OfflineSyncApplyResponse> {
    const results: OfflineSyncApplyResult[] = [];

    for (let i = 0; i < params.operations.length; i++) {
      const op = params.operations[i];

      const existing = await this.repo.findByClientOpId({
        tenantId: params.tenantId,
        clientOpId: op.clientOpId,
      });
      if (existing) {
        results.push(recordToApplyResult(existing, true));
        if (existing.status === "FAILED") {
          return { results, stoppedAt: i };
        }
        continue;
      }

      const applied = await this.applySingleOperation({
        tenantId: params.tenantId,
        branchId: params.branchId,
        employeeId: params.employeeId,
        actorRole: params.actorRole ?? null,
        operation: op,
      });

      results.push(applied);
      if (applied.status === "FAILED") {
        return { results, stoppedAt: i };
      }
    }

    return { results };
  }

  private async applySingleOperation(params: {
    tenantId: string;
    branchId: string;
    employeeId: string;
    actorRole: string | null;
    operation: OfflineSyncOperationInput;
  }): Promise<OfflineSyncApplyResult> {
    return await this.txManager.withTransaction(async (trx) => {
      const inserted = await this.repo.insertProcessing(
        {
          tenantId: params.tenantId,
          branchId: params.branchId,
          clientOpId: params.operation.clientOpId,
          type: params.operation.type,
          payload: params.operation.payload,
          occurredAt: params.operation.occurredAt,
        },
        trx
      );

      if (!inserted) {
        const existing = await this.repo.findByClientOpId(
          { tenantId: params.tenantId, clientOpId: params.operation.clientOpId },
          trx
        );
        if (!existing) {
          throw new Error(
            "offline sync operation conflict but existing record missing"
          );
        }
        return recordToApplyResult(existing, true);
      }

      // Optional per-op branch guard: reject ops targeting other branches
      if (
        params.operation.branchId &&
        params.operation.branchId !== params.branchId
      ) {
        const err = new OfflineSyncApplyError({
          code: "VALIDATION_FAILED",
          message: "branch_id does not match authenticated branch",
          denialReason: "VALIDATION_FAILED",
        });
        await this.failOperation({
          trx,
          tenantId: params.tenantId,
          branchId: params.branchId,
          employeeId: params.employeeId,
          actorRole: params.actorRole,
          operation: params.operation,
          error: err,
        });
        return {
          clientOpId: params.operation.clientOpId,
          type: params.operation.type,
          status: "FAILED",
          deduped: false,
          errorCode: err.code,
          errorMessage: err.message,
        };
      }

      // Frozen branch enforcement (deterministic)
      try {
        await this.branchGuardPort.assertBranchActive({
          tenantId: params.tenantId,
          branchId: params.branchId,
        });
      } catch (err) {
        if (isBranchFrozenError(err)) {
          const frozen = new OfflineSyncApplyError({
            code: "BRANCH_FROZEN",
            message: "Branch is frozen",
            denialReason: "BRANCH_FROZEN",
          });

          await this.failOperation({
            trx,
            tenantId: params.tenantId,
            branchId: params.branchId,
            employeeId: params.employeeId,
            actorRole: params.actorRole,
            operation: params.operation,
            error: frozen,
          });

          return {
            clientOpId: params.operation.clientOpId,
            type: params.operation.type,
            status: "FAILED",
            deduped: false,
            errorCode: frozen.code,
            errorMessage: frozen.message,
          };
        }
        throw err;
      }

      // Keep idempotency row even if business write fails (savepoint rollback)
      await trx.query("SAVEPOINT offline_sync_apply");

      try {
        const result = await this.applyOperationInTransaction({
          trx,
          tenantId: params.tenantId,
          branchId: params.branchId,
          employeeId: params.employeeId,
          actorRole: params.actorRole,
          operation: params.operation,
        });

        await this.repo.markApplied(
          {
            tenantId: params.tenantId,
            clientOpId: params.operation.clientOpId,
            result,
          },
          trx
        );

        await this.auditWriter.write(
          {
            tenantId: params.tenantId,
            branchId: params.branchId,
            employeeId: params.employeeId,
            actorRole: params.actorRole,
            actionType: "SYNC_OPERATION_APPLIED",
            resourceType: "offline_sync_operation",
            resourceId: params.operation.clientOpId,
            outcome: "SUCCESS",
            occurredAt: params.operation.occurredAt,
            details: {
              type: params.operation.type,
              client_op_id: params.operation.clientOpId,
              result,
            },
          },
          trx
        );

        return {
          clientOpId: params.operation.clientOpId,
          type: params.operation.type,
          status: "APPLIED",
          deduped: false,
          result,
        };
      } catch (err) {
        if (err instanceof OfflineSyncApplyError) {
          await trx.query("ROLLBACK TO SAVEPOINT offline_sync_apply");

          await this.failOperation({
            trx,
            tenantId: params.tenantId,
            branchId: params.branchId,
            employeeId: params.employeeId,
            actorRole: params.actorRole,
            operation: params.operation,
            error: err,
          });

          return {
            clientOpId: params.operation.clientOpId,
            type: params.operation.type,
            status: "FAILED",
            deduped: false,
            errorCode: err.code,
            errorMessage: err.message,
          };
        }
        throw err;
      }
    });
  }

  private getTenderAmountsForSale(sale: Sale): { amountUsd: number; amountKhr: number } {
    if (sale.tenderCurrency === "KHR") {
      return {
        amountUsd: 0,
        amountKhr: sale.totalKhrRounded ?? sale.totalKhrExact,
      };
    }
    return { amountUsd: sale.totalUsdExact, amountKhr: 0 };
  }

  private async failOperation(params: {
    trx: PoolClient;
    tenantId: string;
    branchId: string;
    employeeId: string;
    actorRole: string | null;
    operation: OfflineSyncOperationInput;
    error: OfflineSyncApplyError;
  }): Promise<void> {
    await this.repo.markFailed(
      {
        tenantId: params.tenantId,
        clientOpId: params.operation.clientOpId,
        errorCode: params.error.code,
        errorMessage: params.error.message,
      },
      params.trx
    );

    const actionType =
      params.error.code === "BRANCH_FROZEN"
        ? "SYNC_REJECTED_BRANCH_FROZEN"
        : "SYNC_OPERATION_FAILED";

    await this.auditWriter.write(
      {
        tenantId: params.tenantId,
        branchId: params.branchId,
        employeeId: params.employeeId,
        actorRole: params.actorRole,
        actionType,
        resourceType: "offline_sync_operation",
        resourceId: params.operation.clientOpId,
        outcome: params.error.outcome,
        denialReason: params.error.denialReason,
        occurredAt: params.operation.occurredAt,
        details: {
          type: params.operation.type,
          client_op_id: params.operation.clientOpId,
          error_code: params.error.code,
          error_message: params.error.message,
        },
      },
      params.trx
    );
  }

  private async applyOperationInTransaction(params: {
    trx: PoolClient;
    tenantId: string;
    branchId: string;
    employeeId: string;
    actorRole: string | null;
    operation: OfflineSyncOperationInput;
  }): Promise<OfflineSyncAppliedResult> {
    if (!OFFLINE_SYNC_OPERATION_TYPES.includes(params.operation.type)) {
      throw new OfflineSyncApplyError({
        code: "NOT_IMPLEMENTED",
        message: `Unsupported offline operation type: ${params.operation.type}`,
        denialReason: "VALIDATION_FAILED",
      });
    }

    switch (params.operation.type) {
      case "SALE_FINALIZED":
        return await this.applySaleFinalized(params);
      case "CASH_SESSION_OPENED":
        return await this.applyCashSessionOpened(params);
      case "CASH_SESSION_CLOSED":
        return await this.applyCashSessionClosed(params);
      default: {
        const _exhaustive: never = params.operation.type;
        throw new OfflineSyncApplyError({
          code: "NOT_IMPLEMENTED",
          message: `Unsupported offline operation type: ${_exhaustive}`,
        });
      }
    }
  }

  private async applySaleFinalized(params: {
    trx: PoolClient;
    tenantId: string;
    branchId: string;
    employeeId: string;
    actorRole: string | null;
    operation: OfflineSyncOperationInput;
  }): Promise<OfflineSyncAppliedResult> {
    const parsed = saleFinalizedPayloadSchema.safeParse(params.operation.payload);
    if (!parsed.success) {
      throw new OfflineSyncApplyError({
        code: "VALIDATION_FAILED",
        message: "Invalid SALE_FINALIZED payload",
        denialReason: "VALIDATION_FAILED",
      });
    }

    const payload = parsed.data;

    const fxRate = await this.policyPort.getCurrentFxRate(
      params.tenantId,
      params.branchId
    );

    const sale = createDraftSale({
      clientUuid: payload.client_sale_uuid,
      tenantId: params.tenantId,
      branchId: params.branchId,
      employeeId: params.employeeId,
      saleType: payload.sale_type,
      fxRateUsed: fxRate,
    });

    const vatPolicy = await this.policyPort.getVatPolicy(
      params.tenantId,
      params.branchId
    );
    applyVAT(sale, vatPolicy.rate, vatPolicy.enabled);

    // Add items (server-authoritative pricing)
    for (const line of payload.items) {
      const menuItem = await this.menuPort.getMenuItem({
        menuItemId: line.menu_item_id,
        branchId: params.branchId,
        tenantId: params.tenantId,
      });
      if (!menuItem) {
        throw new OfflineSyncApplyError({
          code: "DEPENDENCY_MISSING",
          message: `Menu item not found or unavailable: ${line.menu_item_id}`,
          denialReason: "DEPENDENCY_MISSING",
          outcome: "FAILED",
        });
      }

      const item = addItemToSale(sale, {
        menuItemId: line.menu_item_id,
        menuItemName: menuItem.name,
        unitPriceUsd: menuItem.priceUsd,
        quantity: line.quantity,
        modifiers: line.modifiers ?? [],
      });

      // Apply item-level discount policies (currently empty in PolicyAdapter)
      const itemPolicies = await this.policyPort.getItemDiscountPolicies(
        params.tenantId,
        params.branchId,
        line.menu_item_id
      );
      if (itemPolicies.length > 0) {
        const best = findBestPolicy(itemPolicies, menuItem.priceUsd * line.quantity);
        applyLineDiscount(item, best.type, best.value, best.id);
        recalculateSaleTotals(sale);
      }
    }

    // Pre-checkout (tender + order discounts + VAT)
    const roundingPolicy = await this.policyPort.getRoundingPolicy(
      params.tenantId,
      params.branchId
    );
    setTenderCurrency(sale, payload.tender_currency, roundingPolicy);
    setPaymentMethod(sale, payload.payment_method, payload.cash_received);

    const orderPolicies = await this.policyPort.getOrderDiscountPolicies(
      params.tenantId,
      params.branchId
    );
    if (orderPolicies.length > 0) {
      const subtotalUsd = sale.items.reduce(
        (sum, item) => sum + item.lineTotalUsdExact,
        0
      );
      const best = findBestPolicy(orderPolicies, subtotalUsd);
      applyOrderDiscount(sale, best.type, best.value, [best.id]);
    }

    const vatPolicy2 = await this.policyPort.getVatPolicy(
      params.tenantId,
      params.branchId
    );
    applyVAT(sale, vatPolicy2.rate, vatPolicy2.enabled);

    // Finalize
    try {
      finalizeSale(sale, params.employeeId);
    } catch (err) {
      throw new OfflineSyncApplyError({
        code: "VALIDATION_FAILED",
        message: err instanceof Error ? err.message : "Failed to finalize sale",
        denialReason: "VALIDATION_FAILED",
      });
    }

    await this.salesRepo.save(sale, params.trx);

    await this.auditWriter.write(
      {
        tenantId: params.tenantId,
        branchId: params.branchId,
        employeeId: params.employeeId,
        actorRole: params.actorRole,
        actionType: "SALE_FINALIZED",
        resourceType: "SALE",
        resourceId: sale.id,
        outcome: "SUCCESS",
        occurredAt: params.operation.occurredAt,
        details: {
          source: "OFFLINE_SYNC",
          client_op_id: params.operation.clientOpId,
          client_sale_uuid: payload.client_sale_uuid,
          totals: {
            subtotalUsd: sale.subtotalUsdExact,
            totalUsd: sale.totalUsdExact,
            totalKhr: sale.totalKhrExact,
          },
        },
      },
      params.trx
    );

    const tenderMethod: "CASH" | "QR" =
      payload.payment_method === "cash" ? "CASH" : "QR";
    const tenderAmounts = this.getTenderAmountsForSale(sale);

    const event: SaleFinalizedV1 = {
      type: "sales.sale_finalized",
      v: 1,
      tenantId: params.tenantId,
      branchId: params.branchId,
      saleId: sale.id,
      lines: sale.items.map((item) => ({
        menuItemId: item.menuItemId,
        qty: item.quantity,
      })),
      totals: {
        subtotalUsd: sale.subtotalUsdExact,
        totalUsd: sale.totalUsdExact,
        totalKhr: sale.totalKhrExact,
        vatAmountUsd: sale.vatAmountUsd,
      },
      tenders: [
        {
          method: tenderMethod,
          amountUsd: tenderAmounts.amountUsd,
          amountKhr: tenderAmounts.amountKhr,
        },
      ],
      finalizedAt: sale.finalizedAt!.toISOString(),
      actorId: params.employeeId,
    };

    await publishToOutbox(event, params.trx);

    return { type: "SALE_FINALIZED", saleId: sale.id };
  }

  private async applyCashSessionOpened(params: {
    trx: PoolClient;
    tenantId: string;
    branchId: string;
    employeeId: string;
    actorRole: string | null;
    operation: OfflineSyncOperationInput;
  }): Promise<OfflineSyncAppliedResult> {
    const parsed = cashSessionOpenedPayloadSchema.safeParse(params.operation.payload);
    if (!parsed.success) {
      throw new OfflineSyncApplyError({
        code: "VALIDATION_FAILED",
        message: "Invalid CASH_SESSION_OPENED payload",
        denialReason: "VALIDATION_FAILED",
      });
    }

    const payload = parsed.data;

    // Validate register (if provided)
    if (payload.register_id) {
      const reg = await params.trx.query(
        `SELECT id, tenant_id, branch_id, status
         FROM cash_registers
         WHERE id = $1`,
        [payload.register_id]
      );
      if (reg.rows.length === 0) {
        throw new OfflineSyncApplyError({
          code: "DEPENDENCY_MISSING",
          message: "Register not found",
          denialReason: "DEPENDENCY_MISSING",
          outcome: "FAILED",
        });
      }
      const row = reg.rows[0];
      if (row.tenant_id !== params.tenantId || row.branch_id !== params.branchId) {
        throw new OfflineSyncApplyError({
          code: "VALIDATION_FAILED",
          message: "Register does not belong to this tenant/branch",
          denialReason: "VALIDATION_FAILED",
        });
      }
      if (row.status !== "ACTIVE") {
        throw new OfflineSyncApplyError({
          code: "VALIDATION_FAILED",
          message: "Register is not active",
          denialReason: "VALIDATION_FAILED",
        });
      }

      const existing = await params.trx.query(
        `SELECT id FROM cash_sessions
         WHERE tenant_id = $1 AND register_id = $2 AND status = 'OPEN'
         LIMIT 1`,
        [params.tenantId, payload.register_id]
      );
      if (existing.rows.length > 0) {
        throw new OfflineSyncApplyError({
          code: "VALIDATION_FAILED",
          message:
            "A session is already open on this register. Close it or take over first.",
          denialReason: "VALIDATION_FAILED",
        });
      }
    } else {
      const existing = await params.trx.query(
        `SELECT id FROM cash_sessions
         WHERE tenant_id = $1 AND branch_id = $2 AND status = 'OPEN' AND register_id IS NULL
         LIMIT 1`,
        [params.tenantId, params.branchId]
      );
      if (existing.rows.length > 0) {
        throw new OfflineSyncApplyError({
          code: "VALIDATION_FAILED",
          message:
            "A session is already open for this branch. Close it or take over first.",
          denialReason: "VALIDATION_FAILED",
        });
      }
    }

    const openedAt = params.operation.occurredAt ?? new Date();

    const insert = await params.trx.query(
      `INSERT INTO cash_sessions (
        tenant_id,
        branch_id,
        register_id,
        opened_by,
        opened_at,
        opening_float_usd,
        opening_float_khr,
        status,
        expected_cash_usd,
        expected_cash_khr,
        counted_cash_usd,
        counted_cash_khr,
        variance_usd,
        variance_khr,
        note
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,'OPEN',$8,$9,0,0,0,0,$10)
      RETURNING id, opened_at`,
      [
        params.tenantId,
        params.branchId,
        payload.register_id ?? null,
        params.employeeId,
        openedAt,
        payload.opening_float_usd,
        payload.opening_float_khr,
        payload.opening_float_usd,
        payload.opening_float_khr,
        payload.note ?? null,
      ]
    );

    const sessionId = insert.rows[0].id as string;
    const openedAtIso = new Date(insert.rows[0].opened_at).toISOString();

    await this.auditWriter.write(
      {
        tenantId: params.tenantId,
        branchId: params.branchId,
        employeeId: params.employeeId,
        actorRole: params.actorRole,
        actionType: "CASH_SESSION_OPENED",
        resourceType: "cash_session",
        resourceId: sessionId,
        outcome: "SUCCESS",
        occurredAt: params.operation.occurredAt,
        details: {
          source: "OFFLINE_SYNC",
          client_op_id: params.operation.clientOpId,
          registerId: payload.register_id ?? null,
          openingFloatUsd: payload.opening_float_usd,
          openingFloatKhr: payload.opening_float_khr,
          note: payload.note ?? null,
        },
      },
      params.trx
    );

    const event: CashSessionOpenedV1 = {
      type: "cash.session_opened",
      v: 1,
      tenantId: params.tenantId,
      branchId: params.branchId,
      sessionId,
      openedBy: params.employeeId,
      openingFloat: payload.opening_float_usd,
      openedAt: openedAtIso,
    };
    await publishToOutbox(event, params.trx);

    return { type: "CASH_SESSION_OPENED", sessionId };
  }

  private async applyCashSessionClosed(params: {
    trx: PoolClient;
    tenantId: string;
    branchId: string;
    employeeId: string;
    actorRole: string | null;
    operation: OfflineSyncOperationInput;
  }): Promise<OfflineSyncAppliedResult> {
    const parsed = cashSessionClosedPayloadSchema.safeParse(params.operation.payload);
    if (!parsed.success) {
      throw new OfflineSyncApplyError({
        code: "VALIDATION_FAILED",
        message: "Invalid CASH_SESSION_CLOSED payload",
        denialReason: "VALIDATION_FAILED",
      });
    }

    const payload = parsed.data;

    const sessionRes = await params.trx.query(
      `SELECT id, tenant_id, branch_id, status, expected_cash_usd, expected_cash_khr
       FROM cash_sessions
       WHERE id = $1`,
      [payload.session_id]
    );
    if (sessionRes.rows.length === 0) {
      throw new OfflineSyncApplyError({
        code: "DEPENDENCY_MISSING",
        message: "Session not found",
        denialReason: "DEPENDENCY_MISSING",
        outcome: "FAILED",
      });
    }

    const session = sessionRes.rows[0];
    if (session.tenant_id !== params.tenantId || session.branch_id !== params.branchId) {
      throw new OfflineSyncApplyError({
        code: "VALIDATION_FAILED",
        message: "Session does not belong to this tenant/branch",
        denialReason: "VALIDATION_FAILED",
      });
    }

    if (session.status !== "OPEN") {
      throw new OfflineSyncApplyError({
        code: "VALIDATION_FAILED",
        message: "Session is not open",
        denialReason: "VALIDATION_FAILED",
      });
    }

    const expectedUsd = parseFloat(session.expected_cash_usd);
    const expectedKhr = parseFloat(session.expected_cash_khr);

    const varianceUsd = payload.counted_cash_usd - expectedUsd;
    const varianceKhr = payload.counted_cash_khr - expectedKhr;

    const varianceThreshold = 5;
    const hasSignificantVariance = Math.abs(varianceUsd) > varianceThreshold;
    const status = hasSignificantVariance ? "PENDING_REVIEW" : "CLOSED";
    const closedAt = params.operation.occurredAt ?? new Date();

    const updated = await params.trx.query(
      `UPDATE cash_sessions
       SET status = $2,
           closed_by = $3,
           closed_at = $4,
           counted_cash_usd = $5,
           counted_cash_khr = $6,
           variance_usd = $7,
           variance_khr = $8,
           note = $9,
           updated_at = NOW()
       WHERE id = $1
       RETURNING id, closed_at`,
      [
        payload.session_id,
        status,
        params.employeeId,
        closedAt,
        payload.counted_cash_usd,
        payload.counted_cash_khr,
        varianceUsd,
        varianceKhr,
        payload.note ?? null,
      ]
    );

    const closedAtIso = new Date(updated.rows[0].closed_at).toISOString();

    await this.auditWriter.write(
      {
        tenantId: params.tenantId,
        branchId: params.branchId,
        employeeId: params.employeeId,
        actorRole: params.actorRole,
        actionType: "CASH_SESSION_CLOSED",
        resourceType: "cash_session",
        resourceId: payload.session_id,
        outcome: "SUCCESS",
        occurredAt: params.operation.occurredAt,
        details: {
          source: "OFFLINE_SYNC",
          client_op_id: params.operation.clientOpId,
          status,
          expectedCashUsd: expectedUsd,
          expectedCashKhr: expectedKhr,
          countedCashUsd: payload.counted_cash_usd,
          countedCashKhr: payload.counted_cash_khr,
          varianceUsd,
          varianceKhr,
          note: payload.note ?? null,
        },
      },
      params.trx
    );

    const event: CashSessionClosedV1 = {
      type: "cash.session_closed",
      v: 1,
      tenantId: params.tenantId,
      branchId: params.branchId,
      sessionId: payload.session_id,
      closedBy: params.employeeId,
      closedAt: closedAtIso,
      expectedCash: expectedUsd,
      actualCash: payload.counted_cash_usd,
      variance: varianceUsd,
    };
    await publishToOutbox(event, params.trx);

    return { type: "CASH_SESSION_CLOSED", sessionId: payload.session_id, status };
  }
}

function findBestPolicy(
  policies: Array<{ id: string; type: "percentage" | "fixed"; value: number }>,
  baseAmountUsd: number
) {
  // Conservative: pick the policy that yields the largest discount amount.
  return policies.reduce(
    (best, current) => {
      const bestDiscount =
        best.type === "percentage" ? (baseAmountUsd * best.value) / 100 : best.value;
      const currentDiscount =
        current.type === "percentage"
          ? (baseAmountUsd * current.value) / 100
          : current.value;
      return currentDiscount > bestDiscount ? current : best;
    },
    policies[0]
  );
}
