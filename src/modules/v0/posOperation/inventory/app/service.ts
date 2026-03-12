import { normalizeOptionalString } from "../../../../../shared/utils/string.js";
import {
  V0InventoryRepository,
  type InventoryDirection,
  type InventoryJournalEntryRow,
  type InventoryReasonCode,
  type InventoryRestockBatchRow,
  type InventoryStatus,
  type InventoryStockCategoryRow,
  type InventoryStockItemRow,
} from "../infra/repository.js";

type ActorContext = {
  accountId: string;
  tenantId: string | null;
  branchId: string | null;
};

type InventoryStatusFilter = "active" | "archived" | "all";
type AdjustmentStyle = "DELTA" | "SET_TO_COUNT";
type AdjustmentReasonCode = "COUNT_CORRECTION" | "WASTE" | "DAMAGE" | "OTHER";

export class V0InventoryError extends Error {
  constructor(
    readonly statusCode: number,
    message: string,
    readonly code?: string,
    readonly details?: Record<string, unknown>
  ) {
    super(message);
    this.name = "V0InventoryError";
  }
}

export class V0InventoryService {
  constructor(private readonly repo: V0InventoryRepository) {}

  async listCategories(input: {
    actor: ActorContext;
    status?: string;
  }): Promise<Array<Record<string, unknown>>> {
    const scope = assertTenantContext(input.actor);
    const status = parseStatusFilter(input.status);
    const rows = await this.repo.listCategories({
      tenantId: scope.tenantId,
      includeArchived: status === "all" || status === "archived",
    });

    return rows
      .filter((row) => (status === "archived" ? row.status === "ARCHIVED" : true))
      .map(mapCategoryRow);
  }

  async createCategory(input: {
    actor: ActorContext;
    body: unknown;
  }): Promise<Record<string, unknown>> {
    const scope = assertTenantContext(input.actor);
    const body = toObject(input.body);
    const name = requireNonEmptyString(body.name, "name");

    const row = await this.repo.createCategory({
      tenantId: scope.tenantId,
      name,
    });

    return mapCategoryRow(row);
  }

  async updateCategory(input: {
    actor: ActorContext;
    categoryId: string;
    body: unknown;
  }): Promise<Record<string, unknown>> {
    const scope = assertTenantContext(input.actor);
    const categoryId = requireUuid(input.categoryId, "categoryId");
    const body = toObject(input.body);
    const name = requireNonEmptyString(body.name, "name");

    const updated = await this.repo.updateCategoryName({
      tenantId: scope.tenantId,
      categoryId,
      name,
    });
    if (!updated) {
      throw new V0InventoryError(
        404,
        "stock category not found",
        "INVENTORY_STOCK_CATEGORY_NOT_FOUND"
      );
    }

    return mapCategoryRow(updated);
  }

  async archiveCategory(input: {
    actor: ActorContext;
    categoryId: string;
  }): Promise<Record<string, unknown>> {
    const scope = assertTenantContext(input.actor);
    const categoryId = requireUuid(input.categoryId, "categoryId");

    const archived = await this.repo.archiveCategoryAndDetachItems({
      tenantId: scope.tenantId,
      categoryId,
    });
    if (!archived) {
      throw new V0InventoryError(
        404,
        "stock category not found",
        "INVENTORY_STOCK_CATEGORY_NOT_FOUND"
      );
    }

    return mapCategoryRow(archived);
  }

  async listStockItems(input: {
    actor: ActorContext;
    status?: string;
    categoryId?: string;
    search?: string;
    limit?: number;
    offset?: number;
  }): Promise<Array<Record<string, unknown>>> {
    const scope = assertTenantContext(input.actor);
    const status = parseStatusFilter(input.status);
    const categoryId = parseOptionalUuid(input.categoryId, "categoryId");
    const search = normalizeOptionalString(input.search)?.toLowerCase() ?? null;
    const limit = normalizeLimit(input.limit);
    const offset = normalizeOffset(input.offset);

    const rows = await this.repo.listStockItems({
      tenantId: scope.tenantId,
      categoryId,
      includeArchived: status === "all" || status === "archived",
    });

    const filtered = rows.filter((row) => {
      if (status === "archived" && row.status !== "ARCHIVED") {
        return false;
      }
      if (search && !row.name.toLowerCase().includes(search)) {
        return false;
      }
      return true;
    });

    return filtered.slice(offset, offset + limit).map(mapStockItemRow);
  }

  async getStockItem(input: {
    actor: ActorContext;
    stockItemId: string;
  }): Promise<Record<string, unknown>> {
    const scope = assertTenantContext(input.actor);
    const stockItemId = requireUuid(input.stockItemId, "stockItemId");

    const row = await this.repo.getStockItem({
      tenantId: scope.tenantId,
      stockItemId,
    });
    if (!row) {
      throw new V0InventoryError(404, "stock item not found", "INVENTORY_STOCK_ITEM_NOT_FOUND");
    }

    return mapStockItemRow(row);
  }

  async createStockItem(input: {
    actor: ActorContext;
    body: unknown;
  }): Promise<Record<string, unknown>> {
    const scope = assertTenantContext(input.actor);
    const body = toObject(input.body);

    const categoryId = parseNullableUuid(body.categoryId, "categoryId");
    if (categoryId) {
      await this.assertCategoryActive(scope.tenantId, categoryId);
    }

    const row = await this.repo.createStockItem({
      tenantId: scope.tenantId,
      categoryId,
      name: requireNonEmptyString(body.name, "name"),
      baseUnit: requireNonEmptyString(body.baseUnit, "baseUnit"),
      imageUrl: parseOptionalNullableString(body.imageUrl),
      lowStockThreshold: parseOptionalNullableNonNegativeNumber(
        body.lowStockThreshold,
        "lowStockThreshold"
      ),
    });

    return mapStockItemRow(row);
  }

  async updateStockItem(input: {
    actor: ActorContext;
    stockItemId: string;
    body: unknown;
  }): Promise<Record<string, unknown>> {
    const scope = assertTenantContext(input.actor);
    const stockItemId = requireUuid(input.stockItemId, "stockItemId");
    const body = toObject(input.body);

    const current = await this.repo.getStockItem({
      tenantId: scope.tenantId,
      stockItemId,
    });
    if (!current) {
      throw new V0InventoryError(404, "stock item not found", "INVENTORY_STOCK_ITEM_NOT_FOUND");
    }

    const patch: {
      name?: string;
      categoryIdProvided: boolean;
      categoryId?: string | null;
      imageUrlProvided: boolean;
      imageUrl?: string | null;
      lowStockThresholdProvided: boolean;
      lowStockThreshold?: number | null;
    } = {
      categoryIdProvided: hasOwn(body, "categoryId"),
      imageUrlProvided: hasOwn(body, "imageUrl"),
      lowStockThresholdProvided: hasOwn(body, "lowStockThreshold"),
    };

    if (hasOwn(body, "name")) {
      patch.name = requireNonEmptyString(body.name, "name");
    }

    if (hasOwn(body, "baseUnit")) {
      const nextBaseUnit = requireNonEmptyString(body.baseUnit, "baseUnit");
      if (nextBaseUnit !== current.base_unit) {
        throw new V0InventoryError(
          409,
          "baseUnit is immutable once stock item is created",
          "INVENTORY_BASE_UNIT_IMMUTABLE"
        );
      }
    }

    if (patch.categoryIdProvided) {
      patch.categoryId = parseNullableUuid(body.categoryId, "categoryId");
      if (patch.categoryId) {
        await this.assertCategoryActive(scope.tenantId, patch.categoryId);
      }
    }

    if (patch.imageUrlProvided) {
      patch.imageUrl = parseOptionalNullableString(body.imageUrl);
    }

    if (patch.lowStockThresholdProvided) {
      patch.lowStockThreshold = parseOptionalNullableNonNegativeNumber(
        body.lowStockThreshold,
        "lowStockThreshold"
      );
    }

    if (
      !patch.name &&
      !patch.categoryIdProvided &&
      !patch.imageUrlProvided &&
      !patch.lowStockThresholdProvided
    ) {
      throw new V0InventoryError(422, "at least one field is required", "INVENTORY_ITEM_INVALID");
    }

    const updated = await this.repo.updateStockItem({
      tenantId: scope.tenantId,
      stockItemId,
      categoryId: patch.categoryIdProvided ? patch.categoryId ?? null : current.category_id,
      name: patch.name ?? current.name,
      imageUrl: patch.imageUrlProvided ? patch.imageUrl ?? null : current.image_url,
      lowStockThreshold: patch.lowStockThresholdProvided
        ? patch.lowStockThreshold ?? null
        : current.low_stock_threshold,
    });

    if (!updated) {
      throw new V0InventoryError(404, "stock item not found", "INVENTORY_STOCK_ITEM_NOT_FOUND");
    }

    return mapStockItemRow(updated);
  }

  async archiveStockItem(input: {
    actor: ActorContext;
    stockItemId: string;
  }): Promise<Record<string, unknown>> {
    return this.setStockItemStatus({
      actor: input.actor,
      stockItemId: input.stockItemId,
      status: "ARCHIVED",
    });
  }

  async restoreStockItem(input: {
    actor: ActorContext;
    stockItemId: string;
  }): Promise<Record<string, unknown>> {
    return this.setStockItemStatus({
      actor: input.actor,
      stockItemId: input.stockItemId,
      status: "ACTIVE",
    });
  }

  async listRestockBatches(input: {
    actor: ActorContext;
    branchId?: string;
    status?: string;
    stockItemId?: string;
    limit?: number;
    offset?: number;
  }): Promise<Array<Record<string, unknown>>> {
    const scope = assertTenantContext(input.actor);
    const status = parseStatusFilter(input.status);
    const branchId = await this.requireOptionalBranchIdInTenant(scope.tenantId, input.branchId);
    const stockItemId = parseOptionalUuid(input.stockItemId, "stockItemId");
    const limit = normalizeLimit(input.limit);
    const offset = normalizeOffset(input.offset);

    const rows = await this.repo.listRestockBatches({
      tenantId: scope.tenantId,
      branchId,
      stockItemId,
      includeArchived: status === "all" || status === "archived",
      limit,
      offset,
    });

    return rows
      .filter((row) => (status === "archived" ? row.status === "ARCHIVED" : true))
      .map(mapRestockBatchRow);
  }

  async createRestockBatch(input: {
    actor: ActorContext;
    idempotencyKey: string;
    body: unknown;
  }): Promise<Record<string, unknown>> {
    const scope = assertTenantContext(input.actor);
    const body = toObject(input.body);
    const branchId = await this.requireBranchIdInTenant(scope.tenantId, body.branchId);

    const stockItemId = requireUuid(body.stockItemId, "stockItemId");
    const stockItem = await this.repo.getStockItem({
      tenantId: scope.tenantId,
      stockItemId,
    });
    if (!stockItem) {
      throw new V0InventoryError(404, "stock item not found", "INVENTORY_STOCK_ITEM_NOT_FOUND");
    }
    if (stockItem.status !== "ACTIVE") {
      throw new V0InventoryError(
        409,
        "stock item is archived",
        "INVENTORY_STOCK_ITEM_INACTIVE"
      );
    }

    const quantityInBaseUnit = requirePositiveNumber(
      body.quantityInBaseUnit,
      "quantityInBaseUnit",
      "INVENTORY_QUANTITY_INVALID"
    );

    const receivedAt = parseOptionalDate(body.receivedAt, "receivedAt") ?? new Date();
    const row = await this.repo.createRestockBatch({
      tenantId: scope.tenantId,
      branchId,
      stockItemId,
      quantityInBaseUnit,
      receivedAt,
      expiryDate: parseOptionalDateOnly(body.expiryDate, "expiryDate"),
      supplierName: parseOptionalNullableString(body.supplierName),
      purchaseCostUsd: parseOptionalNullableNonNegativeNumber(body.purchaseCostUsd, "purchaseCostUsd"),
      note: parseOptionalNullableString(body.note),
      createdByAccountId: scope.accountId,
    });

    const journal = await this.repo.appendJournalEntry({
      tenantId: scope.tenantId,
      branchId,
      stockItemId,
      direction: "IN",
      quantityInBaseUnit,
      reasonCode: "RESTOCK",
      sourceType: "RESTOCK_BATCH",
      sourceId: row.id,
      idempotencyKey: input.idempotencyKey,
      occurredAt: receivedAt,
      actorAccountId: scope.accountId,
      note: row.note,
    });

    const stock = await this.repo.applyBranchStockDelta({
      tenantId: scope.tenantId,
      branchId,
      stockItemId,
      signedDeltaInBaseUnit: quantityInBaseUnit,
      movementAt: receivedAt,
    });

    return {
      ...mapRestockBatchRow(row),
      journalEntry: mapJournalRow(journal),
      branchStockProjection: mapBranchStockProjection(scope.tenantId, branchId, stock),
    };
  }

  async updateRestockBatchMetadata(input: {
    actor: ActorContext;
    batchId: string;
    body: unknown;
  }): Promise<Record<string, unknown>> {
    const scope = assertTenantContext(input.actor);
    const batchId = requireUuid(input.batchId, "batchId");
    const body = toObject(input.body);
    const branchId = await this.requireBranchIdInTenant(scope.tenantId, body.branchId);

    const current = await this.repo.getRestockBatchById({
      tenantId: scope.tenantId,
      batchId,
    });
    if (!current || current.branch_id !== branchId) {
      throw new V0InventoryError(
        404,
        "restock batch not found",
        "INVENTORY_RESTOCK_BATCH_NOT_FOUND"
      );
    }
    if (current.status === "ARCHIVED") {
      throw new V0InventoryError(
        409,
        "restock batch already archived",
        "INVENTORY_RESTOCK_BATCH_ARCHIVED"
      );
    }

    const expiryDateProvided = hasOwn(body, "expiryDate");
    const supplierNameProvided = hasOwn(body, "supplierName");
    const purchaseCostProvided = hasOwn(body, "purchaseCostUsd");
    const noteProvided = hasOwn(body, "note");

    if (!expiryDateProvided && !supplierNameProvided && !purchaseCostProvided && !noteProvided) {
      throw new V0InventoryError(
        422,
        "at least one metadata field is required",
        "INVENTORY_RESTOCK_BATCH_INVALID"
      );
    }

    const updated = await this.repo.updateRestockBatchMetadata({
      tenantId: scope.tenantId,
      batchId,
      expiryDate: expiryDateProvided
        ? parseOptionalDateOnly(body.expiryDate, "expiryDate")
        : current.expiry_date,
      supplierName: supplierNameProvided
        ? parseOptionalNullableString(body.supplierName)
        : current.supplier_name,
      purchaseCostUsd: purchaseCostProvided
        ? parseOptionalNullableNonNegativeNumber(body.purchaseCostUsd, "purchaseCostUsd")
        : current.purchase_cost_usd,
      note: noteProvided ? parseOptionalNullableString(body.note) : current.note,
    });

    if (!updated) {
      throw new V0InventoryError(
        404,
        "restock batch not found",
        "INVENTORY_RESTOCK_BATCH_NOT_FOUND"
      );
    }

    return mapRestockBatchRow(updated);
  }

  async archiveRestockBatch(input: {
    actor: ActorContext;
    batchId: string;
    branchId: string;
  }): Promise<Record<string, unknown>> {
    const scope = assertTenantContext(input.actor);
    const batchId = requireUuid(input.batchId, "batchId");
    const branchId = await this.requireBranchIdInTenant(scope.tenantId, input.branchId);

    const current = await this.repo.getRestockBatchById({
      tenantId: scope.tenantId,
      batchId,
    });
    if (!current || current.branch_id !== branchId) {
      throw new V0InventoryError(
        404,
        "restock batch not found",
        "INVENTORY_RESTOCK_BATCH_NOT_FOUND"
      );
    }

    const archived = await this.repo.setRestockBatchStatus({
      tenantId: scope.tenantId,
      batchId,
      status: "ARCHIVED",
    });

    if (!archived) {
      throw new V0InventoryError(
        404,
        "restock batch not found",
        "INVENTORY_RESTOCK_BATCH_NOT_FOUND"
      );
    }

    return mapRestockBatchRow(archived);
  }

  async applyAdjustment(input: {
    actor: ActorContext;
    idempotencyKey: string;
    body: unknown;
  }): Promise<Record<string, unknown>> {
    const scope = assertTenantContext(input.actor);
    const body = toObject(input.body);
    const branchId = await this.requireBranchIdInTenant(scope.tenantId, body.branchId);

    const stockItemId = requireUuid(body.stockItemId, "stockItemId");
    const stockItem = await this.repo.getStockItem({
      tenantId: scope.tenantId,
      stockItemId,
    });
    if (!stockItem) {
      throw new V0InventoryError(404, "stock item not found", "INVENTORY_STOCK_ITEM_NOT_FOUND");
    }
    if (stockItem.status !== "ACTIVE") {
      throw new V0InventoryError(
        409,
        "stock item is archived",
        "INVENTORY_STOCK_ITEM_INACTIVE"
      );
    }

    const style = parseAdjustmentStyle(body.style ?? body.adjustmentStyle ?? body.mode);
    const adjustmentReasonCode = parseAdjustmentReasonCode(body.reasonCode);
    const occurredAt = parseOptionalDate(body.occurredAt, "occurredAt") ?? new Date();

    let signedDelta = 0;
    let countedOnHandInBaseUnit: number | null = null;

    if (style === "DELTA") {
      signedDelta = requireNonZeroFiniteNumber(
        body.deltaInBaseUnit,
        "deltaInBaseUnit",
        "INVENTORY_ADJUSTMENT_INVALID"
      );
    } else {
      countedOnHandInBaseUnit = requireNonNegativeFiniteNumber(
        body.countedOnHandInBaseUnit,
        "countedOnHandInBaseUnit",
        "INVENTORY_ADJUSTMENT_INVALID"
      );
      const currentOnHandInBaseUnit = await this.repo.getBranchStockOnHand({
        tenantId: scope.tenantId,
        branchId,
        stockItemId,
      });
      signedDelta = countedOnHandInBaseUnit - currentOnHandInBaseUnit;
    }

    if (Math.abs(signedDelta) < 0.0001) {
      throw new V0InventoryError(
        422,
        "adjustment delta resolves to zero",
        "INVENTORY_ADJUSTMENT_INVALID"
      );
    }

    const direction: InventoryDirection = signedDelta > 0 ? "IN" : "OUT";
    const quantityInBaseUnit = Math.abs(signedDelta);

    const sourceId = `${adjustmentReasonCode}:${input.idempotencyKey}`;
    const journal = await this.repo.appendJournalEntry({
      tenantId: scope.tenantId,
      branchId,
      stockItemId,
      direction,
      quantityInBaseUnit,
      reasonCode: "ADJUSTMENT",
      sourceType: "ADJUSTMENT",
      sourceId,
      idempotencyKey: input.idempotencyKey,
      occurredAt,
      actorAccountId: scope.accountId,
      note: parseOptionalNullableString(body.note),
    });

    const stock = await this.repo.applyBranchStockDelta({
      tenantId: scope.tenantId,
      branchId,
      stockItemId,
      signedDeltaInBaseUnit: signedDelta,
      movementAt: occurredAt,
    });

    return {
      id: journal.id,
      tenantId: journal.tenant_id,
      branchId: journal.branch_id,
      stockItemId: journal.stock_item_id,
      direction: journal.direction,
      quantityInBaseUnit: journal.quantity_in_base_unit,
      reasonCode: adjustmentReasonCode,
      journalReasonCode: journal.reason_code,
      sourceType: journal.source_type,
      sourceId: journal.source_id,
      occurredAt: journal.occurred_at.toISOString(),
      note: journal.note,
      adjustmentStyle: style,
      countedOnHandInBaseUnit,
      resultingOnHandInBaseUnit: stock.on_hand_in_base_unit,
      branchStockProjection: mapBranchStockProjection(scope.tenantId, branchId, stock),
      createdAt: journal.created_at.toISOString(),
    };
  }

  async listJournal(input: {
    actor: ActorContext;
    branchId?: string;
    stockItemId?: string;
    reasonCode?: string;
    limit?: number;
    offset?: number;
  }): Promise<Array<Record<string, unknown>>> {
    const scope = assertTenantContext(input.actor);
    const branchId = await this.requireBranchIdInTenant(scope.tenantId, input.branchId);
    const stockItemId = parseOptionalUuid(input.stockItemId, "stockItemId");
    const reasonCode = parseOptionalInventoryReasonCode(input.reasonCode);
    const limit = normalizeLimit(input.limit);
    const offset = normalizeOffset(input.offset);

    const rows = await this.repo.listJournal({
      tenantId: scope.tenantId,
      branchId,
      stockItemId,
      reasonCode,
      limit,
      offset,
    });

    return rows.map(mapJournalRow);
  }

  async listJournalAll(input: {
    actor: ActorContext;
    branchId?: string;
    stockItemId?: string;
    reasonCode?: string;
    limit?: number;
    offset?: number;
  }): Promise<Array<Record<string, unknown>>> {
    const scope = assertTenantContext(input.actor);
    const branchId = parseOptionalUuid(input.branchId, "branchId");
    const stockItemId = parseOptionalUuid(input.stockItemId, "stockItemId");
    const reasonCode = parseOptionalInventoryReasonCode(input.reasonCode);
    const limit = normalizeLimit(input.limit);
    const offset = normalizeOffset(input.offset);

    const rows = await this.repo.listJournalByTenant({
      tenantId: scope.tenantId,
      branchId,
      stockItemId,
      reasonCode,
      limit,
      offset,
    });

    return rows.map(mapJournalRow);
  }

  async readBranchStock(input: {
    actor: ActorContext;
    branchId?: string;
    includeArchivedItems?: boolean;
  }): Promise<Array<Record<string, unknown>>> {
    const scope = assertTenantContext(input.actor);
    const branchId = await this.requireBranchIdInTenant(scope.tenantId, input.branchId);
    const rows = await this.repo.listBranchStock({
      tenantId: scope.tenantId,
      branchId,
      includeArchivedItems: input.includeArchivedItems ?? false,
    });

    return rows.map((row) => ({
      stockItemId: row.stock_item_id,
      stockItemName: row.stock_item_name,
      baseUnit: row.base_unit,
      onHandInBaseUnit: row.on_hand_in_base_unit,
      lowStockThreshold: row.low_stock_threshold,
      isLowStock: row.is_low_stock,
      updatedAt: row.updated_at.toISOString(),
    }));
  }

  async readAggregateStock(input: {
    actor: ActorContext;
    includeArchivedItems?: boolean;
  }): Promise<Array<Record<string, unknown>>> {
    const scope = assertTenantContext(input.actor);
    const rows = await this.repo.listAggregateStock({
      tenantId: scope.tenantId,
      includeArchivedItems: input.includeArchivedItems ?? false,
    });

    return rows.map((row) => ({
      stockItemId: row.stock_item_id,
      stockItemName: row.stock_item_name,
      baseUnit: row.base_unit,
      totalOnHandInBaseUnit: row.total_on_hand_in_base_unit,
      branchCount: row.branch_count,
    }));
  }

  private async setStockItemStatus(input: {
    actor: ActorContext;
    stockItemId: string;
    status: InventoryStatus;
  }): Promise<Record<string, unknown>> {
    const scope = assertTenantContext(input.actor);
    const stockItemId = requireUuid(input.stockItemId, "stockItemId");

    const updated = await this.repo.setStockItemStatus({
      tenantId: scope.tenantId,
      stockItemId,
      status: input.status,
    });
    if (!updated) {
      throw new V0InventoryError(404, "stock item not found", "INVENTORY_STOCK_ITEM_NOT_FOUND");
    }

    return mapStockItemRow(updated);
  }

  private async assertCategoryActive(tenantId: string, categoryId: string): Promise<void> {
    const category = await this.repo.getCategoryById({ tenantId, categoryId });
    if (!category || category.status !== "ACTIVE") {
      throw new V0InventoryError(
        404,
        "stock category not found",
        "INVENTORY_STOCK_CATEGORY_NOT_FOUND"
      );
    }
  }

  private async requireBranchIdInTenant(tenantId: string, raw: unknown): Promise<string> {
    const branchId = requireUuid(raw, "branchId");
    await this.assertActiveBranchInTenant(tenantId, branchId);
    return branchId;
  }

  private async requireOptionalBranchIdInTenant(
    tenantId: string,
    raw: unknown
  ): Promise<string | null> {
    const branchId = parseOptionalUuid(raw, "branchId");
    if (!branchId) {
      return null;
    }
    await this.assertActiveBranchInTenant(tenantId, branchId);
    return branchId;
  }

  private async assertActiveBranchInTenant(tenantId: string, branchId: string): Promise<void> {
    const branch = await this.repo.getBranchById({ tenantId, branchId });
    if (!branch || branch.status !== "ACTIVE") {
      throw new V0InventoryError(404, "branch not found", "BRANCH_NOT_FOUND");
    }
  }
}

function mapCategoryRow(row: InventoryStockCategoryRow): Record<string, unknown> {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    name: row.name,
    status: row.status,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

function mapStockItemRow(row: InventoryStockItemRow): Record<string, unknown> {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    categoryId: row.category_id,
    name: row.name,
    baseUnit: row.base_unit,
    imageUrl: row.image_url,
    lowStockThreshold: row.low_stock_threshold,
    status: row.status,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

function mapRestockBatchRow(row: InventoryRestockBatchRow): Record<string, unknown> {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    branchId: row.branch_id,
    stockItemId: row.stock_item_id,
    quantityInBaseUnit: row.quantity_in_base_unit,
    status: row.status,
    receivedAt: row.received_at.toISOString(),
    expiryDate: row.expiry_date,
    supplierName: row.supplier_name,
    purchaseCostUsd: row.purchase_cost_usd,
    note: row.note,
    createdByAccountId: row.created_by_account_id,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

function mapJournalRow(row: InventoryJournalEntryRow): Record<string, unknown> {
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

function mapBranchStockProjection(
  tenantId: string,
  branchId: string,
  row: { stock_item_id: string; on_hand_in_base_unit: number; last_movement_at: Date; updated_at: Date }
): Record<string, unknown> {
  return {
    id: `${branchId}:${row.stock_item_id}`,
    tenantId,
    branchId,
    stockItemId: row.stock_item_id,
    onHandInBaseUnit: row.on_hand_in_base_unit,
    lastMovementAt: row.last_movement_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

function parseStatusFilter(raw: string | undefined): InventoryStatusFilter {
  const normalized = String(raw ?? "active").trim().toLowerCase();
  if (normalized === "active" || normalized === "archived" || normalized === "all") {
    return normalized;
  }
  throw new V0InventoryError(422, "status must be active|archived|all", "INVENTORY_INVALID_FILTER");
}

function parseAdjustmentStyle(raw: unknown): AdjustmentStyle {
  const normalized = String(raw ?? "").trim().toUpperCase();
  if (normalized === "DELTA" || normalized === "SET_TO_COUNT") {
    return normalized;
  }
  throw new V0InventoryError(
    422,
    "adjustment style must be DELTA or SET_TO_COUNT",
    "INVENTORY_ADJUSTMENT_INVALID"
  );
}

function parseAdjustmentReasonCode(raw: unknown): AdjustmentReasonCode {
  const normalized = String(raw ?? "").trim().toUpperCase();
  if (
    normalized === "COUNT_CORRECTION" ||
    normalized === "WASTE" ||
    normalized === "DAMAGE" ||
    normalized === "OTHER"
  ) {
    return normalized;
  }
  throw new V0InventoryError(
    422,
    "reasonCode must be COUNT_CORRECTION|WASTE|DAMAGE|OTHER",
    "INVENTORY_ADJUSTMENT_INVALID"
  );
}

function parseOptionalInventoryReasonCode(raw: string | undefined): InventoryReasonCode | null {
  if (!raw) {
    return null;
  }
  const normalized = raw.trim().toUpperCase();
  if (
    normalized === "RESTOCK" ||
    normalized === "SALE_DEDUCTION" ||
    normalized === "VOID_REVERSAL" ||
    normalized === "ADJUSTMENT" ||
    normalized === "OTHER"
  ) {
    return normalized;
  }
  throw new V0InventoryError(
    422,
    "reasonCode must be RESTOCK|SALE_DEDUCTION|VOID_REVERSAL|ADJUSTMENT|OTHER",
    "INVENTORY_INVALID_FILTER"
  );
}

function assertTenantContext(actor: ActorContext): { accountId: string; tenantId: string } {
  const tenantId = normalizeOptionalString(actor.tenantId);
  if (!tenantId) {
    throw new V0InventoryError(403, "tenant context required", "TENANT_CONTEXT_REQUIRED");
  }
  return {
    accountId: actor.accountId,
    tenantId,
  };
}

function requireUuid(raw: unknown, field: string): string {
  const value = normalizeOptionalString(raw);
  if (!value || !UUID_REGEX.test(value)) {
    throw new V0InventoryError(422, `${field} must be a valid UUID`, "INVENTORY_INVALID_INPUT");
  }
  return value;
}

function parseOptionalUuid(raw: unknown, field: string): string | null {
  if (raw === undefined) {
    return null;
  }
  const value = normalizeOptionalString(raw);
  if (!value) {
    return null;
  }
  if (!UUID_REGEX.test(value)) {
    throw new V0InventoryError(422, `${field} must be a valid UUID`, "INVENTORY_INVALID_INPUT");
  }
  return value;
}

function parseNullableUuid(raw: unknown, field: string): string | null {
  if (raw === undefined || raw === null || raw === "") {
    return null;
  }
  return requireUuid(raw, field);
}

function requireNonEmptyString(raw: unknown, field: string): string {
  const value = normalizeOptionalString(raw);
  if (!value) {
    throw new V0InventoryError(422, `${field} is required`, "INVENTORY_INVALID_INPUT");
  }
  return value;
}

function parseOptionalNullableString(raw: unknown): string | null {
  if (raw === undefined || raw === null) {
    return null;
  }
  const value = normalizeOptionalString(raw);
  return value ?? null;
}

function parseOptionalNullableNonNegativeNumber(raw: unknown, field: string): number | null {
  if (raw === undefined || raw === null || raw === "") {
    return null;
  }
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0) {
    throw new V0InventoryError(
      422,
      `${field} must be a non-negative number`,
      "INVENTORY_INVALID_INPUT"
    );
  }
  return value;
}

function requirePositiveNumber(
  raw: unknown,
  field: string,
  code: string
): number {
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) {
    throw new V0InventoryError(422, `${field} must be greater than zero`, code);
  }
  return value;
}

function requireNonNegativeFiniteNumber(
  raw: unknown,
  field: string,
  code: string
): number {
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0) {
    throw new V0InventoryError(422, `${field} must be a non-negative number`, code);
  }
  return value;
}

function requireNonZeroFiniteNumber(
  raw: unknown,
  field: string,
  code: string
): number {
  const value = Number(raw);
  if (!Number.isFinite(value) || Math.abs(value) < 0.0001) {
    throw new V0InventoryError(422, `${field} must be non-zero`, code);
  }
  return value;
}

function parseOptionalDate(raw: unknown, field: string): Date | null {
  if (raw === undefined || raw === null || raw === "") {
    return null;
  }
  const value = new Date(String(raw));
  if (Number.isNaN(value.getTime())) {
    throw new V0InventoryError(422, `${field} must be a valid ISO datetime`, "INVENTORY_INVALID_INPUT");
  }
  return value;
}

function parseOptionalDateOnly(raw: unknown, field: string): string | null {
  if (raw === undefined || raw === null || raw === "") {
    return null;
  }
  const value = String(raw).trim();
  if (!DATE_ONLY_REGEX.test(value)) {
    throw new V0InventoryError(422, `${field} must be YYYY-MM-DD`, "INVENTORY_INVALID_INPUT");
  }
  return value;
}

function normalizeLimit(value: number | undefined): number {
  if (value === undefined) {
    return 100;
  }
  if (!Number.isFinite(value) || value <= 0) {
    throw new V0InventoryError(422, "limit must be > 0", "INVENTORY_INVALID_FILTER");
  }
  return Math.min(Math.floor(value), 500);
}

function normalizeOffset(value: number | undefined): number {
  if (value === undefined) {
    return 0;
  }
  if (!Number.isFinite(value) || value < 0) {
    throw new V0InventoryError(422, "offset must be >= 0", "INVENTORY_INVALID_FILTER");
  }
  return Math.floor(value);
}

function hasOwn(obj: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(obj, key);
}

function toObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new V0InventoryError(422, "request body must be an object", "INVENTORY_INVALID_INPUT");
  }
  return value as Record<string, unknown>;
}

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DATE_ONLY_REGEX = /^\d{4}-\d{2}-\d{2}$/;
