import type { Pool } from "pg";
import { eventBus } from "../../../../../platform/events/index.js";
import { TransactionManager } from "../../../../../platform/db/transactionManager.js";
import { V0PullSyncRepository } from "../../../platformSystem/pullSync/infra/repository.js";
import { buildSaleCashMovementAnchor } from "./command-contract.js";
import { V0CashSessionRepository, type CashMovementRow } from "../infra/repository.js";
import { V0SaleOrderRepository } from "../../saleOrder/infra/repository.js";

type V0OutboxBusEvent = {
  type: string;
  outboxId: string;
  tenantId: string;
  branchId: string;
  entityId: string;
};

const CASH_SALE_EVENT_TYPES = new Set([
  "CHECKOUT_CASH_FINALIZED",
  "SALE_FINALIZED",
  "ORDER_CHECKOUT_COMPLETED",
]);

let registered = false;

export function registerCashSessionSubscribers(pool: Pool): void {
  if (registered) {
    return;
  }
  registered = true;

  for (const eventType of CASH_SALE_EVENT_TYPES) {
    eventBus.subscribe(eventType, async (event: unknown) => {
      const mapped = asOutboxBusEvent(event);
      if (!mapped) {
        return;
      }
      await appendCashSaleMovement({
        pool,
        event: mapped,
      });
    });
  }
}

async function appendCashSaleMovement(input: {
  pool: Pool;
  event: V0OutboxBusEvent;
}): Promise<void> {
  const transactionManager = new TransactionManager(input.pool);

  await transactionManager.withTransaction(async (client) => {
    const saleRepo = new V0SaleOrderRepository(client);
    const cashRepo = new V0CashSessionRepository(client);
    const syncRepo = new V0PullSyncRepository(client);

    const sale = await saleRepo.getSaleById({
      tenantId: input.event.tenantId,
      branchId: input.event.branchId,
      saleId: input.event.entityId,
    });
    if (!sale || sale.status !== "FINALIZED" || sale.payment_method !== "CASH" || !sale.finalized_at) {
      return;
    }

    const session = await cashRepo.findSessionByOccurredAt({
      tenantId: input.event.tenantId,
      branchId: input.event.branchId,
      occurredAt: sale.finalized_at,
    });
    if (!session) {
      return;
    }

    let movement: CashMovementRow;
    try {
      movement = await cashRepo.appendMovement({
        tenantId: input.event.tenantId,
        branchId: input.event.branchId,
        cashSessionId: session.id,
        movementType: "SALE_IN",
        amountUsdDelta: sale.tender_currency === "USD" ? sale.tender_amount : 0,
        amountKhrDelta: sale.tender_currency === "KHR" ? sale.tender_amount : 0,
        reason: `Sale ${sale.id}`,
        sourceRefType: "SALE",
        sourceRefId: sale.id,
        idempotencyKey: buildSaleCashMovementAnchor(sale.id),
        recordedByAccountId: sale.finalized_by_account_id ?? session.opened_by_account_id,
        occurredAt: sale.finalized_at,
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        return;
      }
      throw error;
    }

    await syncRepo.appendChange({
      tenantId: input.event.tenantId,
      branchId: input.event.branchId,
      moduleKey: "cashSession",
      entityType: "cash_movement",
      entityId: movement.id,
      operation: "UPSERT",
      revision: `cashSession:${input.event.outboxId}:cash_movement`,
      data: {
        id: movement.id,
        tenantId: movement.tenant_id,
        branchId: movement.branch_id,
        sessionId: movement.cash_session_id,
        movementType: movement.movement_type,
        amountUsdDelta: movement.amount_usd_delta,
        amountKhrDelta: movement.amount_khr_delta,
        reason: movement.reason,
        sourceRefType: movement.source_ref_type,
        sourceRefId: movement.source_ref_id,
        idempotencyKey: movement.idempotency_key,
        recordedByAccountId: movement.recorded_by_account_id,
        occurredAt: movement.occurred_at.toISOString(),
        createdAt: movement.created_at.toISOString(),
      },
      changedAt: movement.occurred_at,
      sourceOutboxId: null,
    });
  });
}

function isUniqueViolation(error: unknown): boolean {
  return (error as { code?: string } | undefined)?.code === "23505";
}

function normalize(value: unknown): string | null {
  const normalized = String(value ?? "").trim();
  return normalized.length > 0 ? normalized : null;
}

function asOutboxBusEvent(value: unknown): V0OutboxBusEvent | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const raw = value as Record<string, unknown>;
  const type = normalize(raw.type);
  const outboxId = normalize(raw.outboxId);
  const tenantId = normalize(raw.tenantId);
  const branchId = normalize(raw.branchId);
  const entityId = normalize(raw.entityId);
  if (!type || !outboxId || !tenantId || !branchId || !entityId) {
    return null;
  }
  return {
    type,
    outboxId,
    tenantId,
    branchId,
    entityId,
  };
}
