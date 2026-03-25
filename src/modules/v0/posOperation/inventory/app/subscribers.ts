import type { Pool } from "pg";
import { log } from "#logger";
import { eventBus } from "../../../../../platform/events/index.js";
import { TransactionManager } from "../../../../../platform/db/transactionManager.js";
import { V0PullSyncRepository } from "../../../platformSystem/pullSync/infra/repository.js";
import {
  V0_INVENTORY_ACTION_KEYS,
  buildInventoryExternalMovementSourceIdentity,
} from "./command-contract.js";
import {
  V0InventoryRepository,
  type InventoryJournalEntryRow,
} from "../infra/repository.js";
import {
  V0MenuRepository,
  type MenuItemBaseComponentRow,
  type MenuModifierOptionDeltaRow,
} from "../../menu/infra/repository.js";
import {
  V0SaleOrderRepository,
  type V0SaleLineRow,
  type V0SaleRow,
} from "../../saleOrder/infra/repository.js";

type V0OutboxBusEvent = {
  type: string;
  outboxId: string;
  tenantId: string;
  branchId: string;
  entityId: string;
  occurredAt: Date;
};

type InventoryExternalMovement = {
  reasonCode: "SALE_DEDUCTION" | "VOID_REVERSAL";
  direction: "IN" | "OUT";
  expectedSaleStatus: "FINALIZED" | "VOIDED";
  actionKey:
    | typeof V0_INVENTORY_ACTION_KEYS.externalSaleDeductionApply
    | typeof V0_INVENTORY_ACTION_KEYS.externalVoidReversalApply;
};

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const SALE_DEDUCTION_EVENT_TYPES = new Set([
  "SALE_FINALIZED",
  "CHECKOUT_CASH_FINALIZED",
  "ORDER_CHECKOUT_COMPLETED",
]);

const SALE_VOID_REVERSAL_EVENT_TYPES = new Set(["SALE_VOID_EXECUTED"]);

let registered = false;

export function registerInventorySubscribers(pool: Pool): void {
  if (registered) {
    return;
  }
  registered = true;

  for (const eventType of SALE_DEDUCTION_EVENT_TYPES) {
    eventBus.subscribe(eventType, async (event: unknown) => {
      const mapped = asOutboxBusEvent(event);
      if (!mapped) {
        return;
      }
      await applySaleExternalMovement({
        pool,
        event: mapped,
        movement: {
          reasonCode: "SALE_DEDUCTION",
          direction: "OUT",
          expectedSaleStatus: "FINALIZED",
          actionKey: V0_INVENTORY_ACTION_KEYS.externalSaleDeductionApply,
        },
      });
    });
  }

  for (const eventType of SALE_VOID_REVERSAL_EVENT_TYPES) {
    eventBus.subscribe(eventType, async (event: unknown) => {
      const mapped = asOutboxBusEvent(event);
      if (!mapped) {
        return;
      }
      await applySaleExternalMovement({
        pool,
        event: mapped,
        movement: {
          reasonCode: "VOID_REVERSAL",
          direction: "IN",
          expectedSaleStatus: "VOIDED",
          actionKey: V0_INVENTORY_ACTION_KEYS.externalVoidReversalApply,
        },
      });
    });
  }
}

async function applySaleExternalMovement(input: {
  pool: Pool;
  event: V0OutboxBusEvent;
  movement: InventoryExternalMovement;
}): Promise<void> {
  const transactionManager = new TransactionManager(input.pool);

  await transactionManager.withTransaction(
    async (client) => {
      const saleRepo = new V0SaleOrderRepository(client);
      const menuRepo = new V0MenuRepository(client);
      const inventoryRepo = new V0InventoryRepository(client);
      const syncRepo = new V0PullSyncRepository(client);

      const sale = await saleRepo.getSaleById({
        tenantId: input.event.tenantId,
        branchId: input.event.branchId,
        saleId: input.event.entityId,
      });
      if (!sale || sale.status !== input.movement.expectedSaleStatus) {
        return;
      }

      const lines = await saleRepo.listSaleLines({
        tenantId: input.event.tenantId,
        saleId: sale.id,
      });
      if (lines.length === 0) {
        return;
      }

      const movementQuantities = await resolveTrackedMovementQuantities({
        tenantId: input.event.tenantId,
        lines,
        menuRepo,
      });
      if (movementQuantities.size === 0) {
        return;
      }

      const occurredAt = resolveOccurredAt({
        sale,
        expectedSaleStatus: input.movement.expectedSaleStatus,
        fallback: input.event.occurredAt,
      });
      const actorAccountId =
        input.movement.expectedSaleStatus === "FINALIZED"
          ? sale.finalized_by_account_id
          : sale.voided_by_account_id;

      for (const [stockItemId, quantityInBaseUnit] of movementQuantities.entries()) {
        if (!Number.isFinite(quantityInBaseUnit) || quantityInBaseUnit <= 0) {
          continue;
        }

        const sourceIdentity = buildInventoryExternalMovementSourceIdentity({
          sourceType: "SALE_ORDER",
          sourceId: sale.id,
          stockItemId,
          reasonCode: input.movement.reasonCode,
        });

        const journalInsert = await inventoryRepo.appendJournalEntryIfAbsent({
          tenantId: input.event.tenantId,
          branchId: input.event.branchId,
          stockItemId,
          direction: input.movement.direction,
          quantityInBaseUnit,
          reasonCode: input.movement.reasonCode,
          sourceType: "SALE_ORDER",
          sourceId: sale.id,
          idempotencyKey: sourceIdentity,
          occurredAt,
          actorAccountId,
          note: null,
        });

        if (!journalInsert.inserted || !journalInsert.row) {
          continue;
        }

        const signedDeltaInBaseUnit =
          input.movement.direction === "OUT" ? -quantityInBaseUnit : quantityInBaseUnit;
        const stock = await inventoryRepo.applyBranchStockDelta({
          tenantId: input.event.tenantId,
          branchId: input.event.branchId,
          stockItemId,
          signedDeltaInBaseUnit,
          movementAt: occurredAt,
        });

        await syncRepo.appendChange({
          tenantId: input.event.tenantId,
          branchId: input.event.branchId,
          moduleKey: "inventory",
          entityType: "inventory_journal_entry",
          entityId: journalInsert.row.id,
          operation: "UPSERT",
          revision: `inventory:${input.event.outboxId}:${journalInsert.row.id}`,
          data: mapJournalForSync(journalInsert.row),
          changedAt: journalInsert.row.occurred_at,
          sourceOutboxId: null,
        });

        await syncRepo.appendChange({
          tenantId: input.event.tenantId,
          branchId: input.event.branchId,
          moduleKey: "inventory",
          entityType: "inventory_branch_stock_projection",
          entityId: `${input.event.branchId}:${stock.stock_item_id}`,
          operation: "UPSERT",
          revision: `inventory:${input.event.outboxId}:${stock.stock_item_id}:projection`,
          data: mapBranchStockProjectionForSync({
            tenantId: input.event.tenantId,
            branchId: input.event.branchId,
            stock,
          }),
          changedAt: stock.updated_at,
          sourceOutboxId: null,
        });
      }
    },
    {
      actionKey: input.movement.actionKey,
      tenantId: input.event.tenantId,
      branchId: input.event.branchId,
    }
  );
}

async function resolveTrackedMovementQuantities(input: {
  tenantId: string;
  lines: readonly V0SaleLineRow[];
  menuRepo: V0MenuRepository;
}): Promise<Map<string, number>> {
  const baseComponentsCache = new Map<string, MenuItemBaseComponentRow[]>();
  const modifierDeltasCache = new Map<string, MenuModifierOptionDeltaRow[]>();
  const totals = new Map<string, number>();

  for (const line of input.lines) {
    const lineQuantity = Number(line.quantity);
    if (!Number.isFinite(lineQuantity) || lineQuantity <= 0) {
      continue;
    }

    const baseComponents = await getBaseComponentsForMenuItem({
      tenantId: input.tenantId,
      menuItemId: line.menu_item_id,
      menuRepo: input.menuRepo,
      cache: baseComponentsCache,
    });

    const selectedModifierOptionIds = extractModifierOptionIds(line.modifier_snapshot);
    const optionDeltas = await getModifierOptionDeltas({
      tenantId: input.tenantId,
      menuItemId: line.menu_item_id,
      modifierOptionIds: selectedModifierOptionIds,
      menuRepo: input.menuRepo,
      cache: modifierDeltasCache,
    });

    const perUnitTracked = aggregateTrackedComponentsPerUnit({
      baseComponents,
      optionDeltas,
    });
    for (const [stockItemId, perUnitQuantity] of perUnitTracked.entries()) {
      if (!Number.isFinite(perUnitQuantity) || perUnitQuantity <= 0) {
        continue;
      }
      const existing = totals.get(stockItemId) ?? 0;
      totals.set(stockItemId, existing + perUnitQuantity * lineQuantity);
    }
  }

  return totals;
}

async function getBaseComponentsForMenuItem(input: {
  tenantId: string;
  menuItemId: string;
  menuRepo: V0MenuRepository;
  cache: Map<string, MenuItemBaseComponentRow[]>;
}): Promise<MenuItemBaseComponentRow[]> {
  const cached = input.cache.get(input.menuItemId);
  if (cached) {
    return cached;
  }
  const rows = await input.menuRepo.listBaseComponentsForMenuItem({
    tenantId: input.tenantId,
    menuItemId: input.menuItemId,
  });
  input.cache.set(input.menuItemId, rows);
  return rows;
}

async function getModifierOptionDeltas(input: {
  tenantId: string;
  menuItemId: string;
  modifierOptionIds: readonly string[];
  menuRepo: V0MenuRepository;
  cache: Map<string, MenuModifierOptionDeltaRow[]>;
}): Promise<MenuModifierOptionDeltaRow[]> {
  if (input.modifierOptionIds.length === 0) {
    return [];
  }
  const normalized = [...new Set(input.modifierOptionIds)].sort();
  const cacheKey = `${input.menuItemId}:${normalized.join(",")}`;
  const cached = input.cache.get(cacheKey);
  if (cached) {
    return cached;
  }
  const globalRows = await input.menuRepo.listComponentDeltasByModifierOptionIds({
    tenantId: input.tenantId,
    modifierOptionIds: normalized,
  });
  const itemEffects = await input.menuRepo.listModifierOptionEffectsForMenuItem({
    tenantId: input.tenantId,
    menuItemId: input.menuItemId,
    modifierOptionIds: normalized,
  });
  if (itemEffects.length === 0) {
    input.cache.set(cacheKey, globalRows);
    return globalRows;
  }

  const itemRows = await input.menuRepo.listComponentDeltasByMenuItemModifierOptionIds({
    tenantId: input.tenantId,
    menuItemId: input.menuItemId,
    modifierOptionIds: normalized,
  });
  const globalRowsByOptionId = groupModifierDeltasByOptionId(globalRows);
  const itemRowsByOptionId = groupModifierDeltasByOptionId(itemRows);
  const itemEffectOptionIds = new Set(itemEffects.map((effect) => effect.modifier_option_id));
  const rows = normalized.flatMap((modifierOptionId) =>
    itemEffectOptionIds.has(modifierOptionId)
      ? itemRowsByOptionId.get(modifierOptionId) ?? []
      : globalRowsByOptionId.get(modifierOptionId) ?? []
  );
  input.cache.set(cacheKey, rows);
  return rows;
}

function groupModifierDeltasByOptionId(
  rows: readonly MenuModifierOptionDeltaRow[]
): Map<string, MenuModifierOptionDeltaRow[]> {
  const grouped = new Map<string, MenuModifierOptionDeltaRow[]>();
  for (const row of rows) {
    const existing = grouped.get(row.modifier_option_id) ?? [];
    existing.push(row);
    grouped.set(row.modifier_option_id, existing);
  }
  return grouped;
}

function aggregateTrackedComponentsPerUnit(input: {
  baseComponents: readonly MenuItemBaseComponentRow[];
  optionDeltas: readonly MenuModifierOptionDeltaRow[];
}): Map<string, number> {
  const totals = new Map<string, number>();

  for (const component of input.baseComponents) {
    if (component.tracking_mode !== "TRACKED") {
      continue;
    }
    const existing = totals.get(component.stock_item_id) ?? 0;
    totals.set(component.stock_item_id, existing + component.quantity_in_base_unit);
  }

  for (const delta of input.optionDeltas) {
    if (delta.tracking_mode !== "TRACKED") {
      continue;
    }
    const existing = totals.get(delta.stock_item_id) ?? 0;
    totals.set(delta.stock_item_id, existing + delta.quantity_delta_in_base_unit);
  }

  for (const [stockItemId, value] of totals.entries()) {
    if (!Number.isFinite(value) || value <= 0) {
      totals.delete(stockItemId);
    }
  }

  return totals;
}

function extractModifierOptionIds(snapshot: unknown): string[] {
  if (!Array.isArray(snapshot)) {
    return [];
  }
  const optionIds: string[] = [];

  for (const groupEntry of snapshot) {
    if (!groupEntry || typeof groupEntry !== "object" || Array.isArray(groupEntry)) {
      continue;
    }
    const group = groupEntry as Record<string, unknown>;

    if (Array.isArray(group.optionIds)) {
      for (const optionIdValue of group.optionIds) {
        if (typeof optionIdValue === "string" && UUID_REGEX.test(optionIdValue)) {
          optionIds.push(optionIdValue);
        }
      }
    }

    if (!Array.isArray(group.selectedOptions)) {
      continue;
    }
    for (const selectedOptionEntry of group.selectedOptions) {
      if (
        selectedOptionEntry &&
        typeof selectedOptionEntry === "object" &&
        !Array.isArray(selectedOptionEntry)
      ) {
        const selectedOption = selectedOptionEntry as Record<string, unknown>;
        const optionIdValue = selectedOption.optionId;
        if (typeof optionIdValue === "string" && UUID_REGEX.test(optionIdValue)) {
          optionIds.push(optionIdValue);
        }
      }
    }
  }

  return [...new Set(optionIds)];
}

function mapJournalForSync(row: InventoryJournalEntryRow): Record<string, unknown> {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    branchId: row.branch_id,
    stockItemId: row.stock_item_id,
    direction: row.direction,
    quantityInBaseUnit: row.quantity_in_base_unit,
    reasonCode: row.reason_code,
    sourceType: row.source_type,
    sourceId: row.source_id,
    idempotencyKey: row.idempotency_key,
    occurredAt: row.occurred_at.toISOString(),
    actorAccountId: row.actor_account_id,
    note: row.note,
    createdAt: row.created_at.toISOString(),
  };
}

function mapBranchStockProjectionForSync(input: {
  tenantId: string;
  branchId: string;
  stock: {
    stock_item_id: string;
    on_hand_in_base_unit: number;
    last_movement_at: Date;
    updated_at: Date;
  };
}): Record<string, unknown> {
  return {
    id: `${input.branchId}:${input.stock.stock_item_id}`,
    tenantId: input.tenantId,
    branchId: input.branchId,
    stockItemId: input.stock.stock_item_id,
    onHandInBaseUnit: input.stock.on_hand_in_base_unit,
    lastMovementAt: input.stock.last_movement_at.toISOString(),
    updatedAt: input.stock.updated_at.toISOString(),
  };
}

function resolveOccurredAt(input: {
  sale: V0SaleRow;
  expectedSaleStatus: "FINALIZED" | "VOIDED";
  fallback: Date;
}): Date {
  if (input.expectedSaleStatus === "FINALIZED" && input.sale.finalized_at) {
    return input.sale.finalized_at;
  }
  if (input.expectedSaleStatus === "VOIDED" && input.sale.voided_at) {
    return input.sale.voided_at;
  }
  return input.fallback;
}

function asOutboxBusEvent(input: unknown): V0OutboxBusEvent | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return null;
  }
  const record = input as Record<string, unknown>;
  const type = normalize(record.type);
  const outboxId = normalize(record.outboxId);
  const tenantId = normalize(record.tenantId);
  const branchId = normalize(record.branchId);
  const entityId = normalize(record.entityId);
  if (!type || !outboxId || !tenantId || !branchId || !entityId) {
    return null;
  }
  const occurredAtRaw = normalize(record.occurredAt);
  const occurredAt = occurredAtRaw ? new Date(occurredAtRaw) : new Date();
  if (Number.isNaN(occurredAt.getTime())) {
    log.warn("inventory.externalMovement.invalidOccurredAt", {
      event: "inventory.externalMovement.invalidOccurredAt",
      outboxId,
      occurredAt: occurredAtRaw,
    });
    return null;
  }
  return {
    type,
    outboxId,
    tenantId,
    branchId,
    entityId,
    occurredAt,
  };
}

function normalize(value: unknown): string | null {
  const normalized = String(value ?? "").trim();
  return normalized.length > 0 ? normalized : null;
}
