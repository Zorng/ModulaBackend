import type { Pool, PoolClient } from "pg";

type Queryable = Pick<Pool, "query"> | Pick<PoolClient, "query">;

export type InventoryStatus = "ACTIVE" | "ARCHIVED";
export type InventoryDirection = "IN" | "OUT";
export type InventoryReasonCode =
  | "RESTOCK"
  | "SALE_DEDUCTION"
  | "VOID_REVERSAL"
  | "ADJUSTMENT"
  | "OTHER";
export type InventorySourceType =
  | "RESTOCK_BATCH"
  | "SALE_ORDER"
  | "ADJUSTMENT"
  | "SYSTEM";

export type InventoryStockCategoryRow = {
  id: string;
  tenant_id: string;
  name: string;
  status: InventoryStatus;
  created_at: Date;
  updated_at: Date;
};

export type InventoryStockItemRow = {
  id: string;
  tenant_id: string;
  category_id: string | null;
  name: string;
  base_unit: string;
  image_url: string | null;
  low_stock_threshold: number | null;
  status: InventoryStatus;
  created_at: Date;
  updated_at: Date;
};

export type InventoryRestockBatchRow = {
  id: string;
  tenant_id: string;
  branch_id: string;
  stock_item_id: string;
  quantity_in_base_unit: number;
  status: InventoryStatus;
  received_at: Date;
  expiry_date: string | null;
  supplier_name: string | null;
  purchase_cost_usd: number | null;
  note: string | null;
  created_by_account_id: string;
  created_at: Date;
  updated_at: Date;
};

export type InventoryJournalEntryRow = {
  id: string;
  tenant_id: string;
  branch_id: string;
  stock_item_id: string;
  direction: InventoryDirection;
  quantity_in_base_unit: number;
  reason_code: InventoryReasonCode;
  source_type: InventorySourceType;
  source_id: string;
  idempotency_key: string;
  occurred_at: Date;
  actor_account_id: string | null;
  note: string | null;
  created_at: Date;
};

export type InventoryBranchStockRow = {
  tenant_id: string;
  branch_id: string;
  stock_item_id: string;
  on_hand_in_base_unit: number;
  last_movement_at: Date;
  created_at: Date;
  updated_at: Date;
};

export type InventoryBranchStockViewRow = {
  stock_item_id: string;
  stock_item_name: string;
  base_unit: string;
  low_stock_threshold: number | null;
  on_hand_in_base_unit: number;
  is_low_stock: boolean;
  updated_at: Date;
};

export type InventoryAggregateStockViewRow = {
  stock_item_id: string;
  stock_item_name: string;
  base_unit: string;
  total_on_hand_in_base_unit: number;
  branch_count: number;
};

export type InventoryBranchRow = {
  id: string;
  tenant_id: string;
  status: "ACTIVE" | "ARCHIVED";
};

export class V0InventoryRepository {
  constructor(private readonly db: Queryable) {}

  async getBranchById(input: {
    tenantId: string;
    branchId: string;
  }): Promise<InventoryBranchRow | null> {
    const result = await this.db.query<InventoryBranchRow>(
      `SELECT id, tenant_id, status
       FROM branches
       WHERE tenant_id = $1
         AND id = $2
       LIMIT 1`,
      [input.tenantId, input.branchId]
    );
    return result.rows[0] ?? null;
  }

  async getCategoryById(input: {
    tenantId: string;
    categoryId: string;
  }): Promise<InventoryStockCategoryRow | null> {
    const result = await this.db.query<InventoryStockCategoryRow>(
      `SELECT
         id,
         tenant_id,
         name,
         status,
         created_at,
         updated_at
       FROM v0_inventory_stock_categories
       WHERE tenant_id = $1
         AND id = $2
       LIMIT 1`,
      [input.tenantId, input.categoryId]
    );
    return result.rows[0] ?? null;
  }

  async listCategories(input: {
    tenantId: string;
    includeArchived?: boolean;
  }): Promise<InventoryStockCategoryRow[]> {
    const result = await this.db.query<InventoryStockCategoryRow>(
      `SELECT
         id,
         tenant_id,
         name,
         status,
         created_at,
         updated_at
       FROM v0_inventory_stock_categories
       WHERE tenant_id = $1
         AND ($2::BOOLEAN = TRUE OR status = 'ACTIVE')
       ORDER BY name ASC`,
      [input.tenantId, input.includeArchived ?? false]
    );
    return result.rows;
  }

  async createCategory(input: {
    tenantId: string;
    name: string;
  }): Promise<InventoryStockCategoryRow> {
    const result = await this.db.query<InventoryStockCategoryRow>(
      `INSERT INTO v0_inventory_stock_categories (
         tenant_id,
         name
       )
       VALUES ($1, $2)
       RETURNING
         id,
         tenant_id,
         name,
         status,
         created_at,
         updated_at`,
      [input.tenantId, input.name]
    );
    return result.rows[0];
  }

  async updateCategoryName(input: {
    tenantId: string;
    categoryId: string;
    name: string;
  }): Promise<InventoryStockCategoryRow | null> {
    const result = await this.db.query<InventoryStockCategoryRow>(
      `UPDATE v0_inventory_stock_categories
       SET name = $3,
           updated_at = NOW()
       WHERE tenant_id = $1
         AND id = $2
       RETURNING
         id,
         tenant_id,
         name,
         status,
         created_at,
         updated_at`,
      [input.tenantId, input.categoryId, input.name]
    );
    return result.rows[0] ?? null;
  }

  async archiveCategoryAndDetachItems(input: {
    tenantId: string;
    categoryId: string;
  }): Promise<InventoryStockCategoryRow | null> {
    const result = await this.db.query<InventoryStockCategoryRow>(
      `WITH archived AS (
         UPDATE v0_inventory_stock_categories
         SET status = 'ARCHIVED',
             updated_at = NOW()
         WHERE tenant_id = $1
           AND id = $2
         RETURNING
           id,
           tenant_id,
           name,
           status,
           created_at,
           updated_at
       ),
       detached AS (
         UPDATE v0_inventory_stock_items
         SET category_id = NULL,
             updated_at = NOW()
         WHERE tenant_id = $1
           AND category_id = $2
       )
       SELECT
         id,
         tenant_id,
         name,
         status,
         created_at,
         updated_at
       FROM archived`,
      [input.tenantId, input.categoryId]
    );
    return result.rows[0] ?? null;
  }

  async listStockItems(input: {
    tenantId: string;
    categoryId?: string | null;
    includeArchived?: boolean;
  }): Promise<InventoryStockItemRow[]> {
    const result = await this.db.query<InventoryStockItemRow>(
      `SELECT
         id,
         tenant_id,
         category_id,
         name,
         base_unit,
         image_url,
         low_stock_threshold::FLOAT8 AS low_stock_threshold,
         status,
         created_at,
         updated_at
       FROM v0_inventory_stock_items
       WHERE tenant_id = $1
         AND ($2::BOOLEAN = TRUE OR status = 'ACTIVE')
         AND ($3::UUID IS NULL OR category_id = $3::UUID)
       ORDER BY name ASC`,
      [
        input.tenantId,
        input.includeArchived ?? false,
        input.categoryId ?? null,
      ]
    );
    return result.rows;
  }

  async getStockItem(input: {
    tenantId: string;
    stockItemId: string;
  }): Promise<InventoryStockItemRow | null> {
    const result = await this.db.query<InventoryStockItemRow>(
      `SELECT
         id,
         tenant_id,
         category_id,
         name,
         base_unit,
         image_url,
         low_stock_threshold::FLOAT8 AS low_stock_threshold,
         status,
         created_at,
         updated_at
       FROM v0_inventory_stock_items
       WHERE tenant_id = $1
         AND id = $2
       LIMIT 1`,
      [input.tenantId, input.stockItemId]
    );
    return result.rows[0] ?? null;
  }

  async createStockItem(input: {
    tenantId: string;
    categoryId: string | null;
    name: string;
    baseUnit: string;
    imageUrl: string | null;
    lowStockThreshold: number | null;
  }): Promise<InventoryStockItemRow> {
    const result = await this.db.query<InventoryStockItemRow>(
      `INSERT INTO v0_inventory_stock_items (
         tenant_id,
         category_id,
         name,
         base_unit,
         image_url,
         low_stock_threshold
       )
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING
         id,
         tenant_id,
         category_id,
         name,
         base_unit,
         image_url,
         low_stock_threshold::FLOAT8 AS low_stock_threshold,
         status,
         created_at,
         updated_at`,
      [
        input.tenantId,
        input.categoryId,
        input.name,
        input.baseUnit,
        input.imageUrl,
        input.lowStockThreshold,
      ]
    );
    return result.rows[0];
  }

  async updateStockItem(input: {
    tenantId: string;
    stockItemId: string;
    categoryId: string | null;
    name: string;
    imageUrl: string | null;
    lowStockThreshold: number | null;
  }): Promise<InventoryStockItemRow | null> {
    const result = await this.db.query<InventoryStockItemRow>(
      `UPDATE v0_inventory_stock_items
       SET category_id = $3,
           name = $4,
           image_url = $5,
           low_stock_threshold = $6,
           updated_at = NOW()
       WHERE tenant_id = $1
         AND id = $2
       RETURNING
         id,
         tenant_id,
         category_id,
         name,
         base_unit,
         image_url,
         low_stock_threshold::FLOAT8 AS low_stock_threshold,
         status,
         created_at,
         updated_at`,
      [
        input.tenantId,
        input.stockItemId,
        input.categoryId,
        input.name,
        input.imageUrl,
        input.lowStockThreshold,
      ]
    );
    return result.rows[0] ?? null;
  }

  async setStockItemStatus(input: {
    tenantId: string;
    stockItemId: string;
    status: InventoryStatus;
  }): Promise<InventoryStockItemRow | null> {
    const result = await this.db.query<InventoryStockItemRow>(
      `UPDATE v0_inventory_stock_items
       SET status = $3,
           updated_at = NOW()
       WHERE tenant_id = $1
         AND id = $2
       RETURNING
         id,
         tenant_id,
         category_id,
         name,
         base_unit,
         image_url,
         low_stock_threshold::FLOAT8 AS low_stock_threshold,
         status,
         created_at,
         updated_at`,
      [input.tenantId, input.stockItemId, input.status]
    );
    return result.rows[0] ?? null;
  }

  async listRestockBatches(input: {
    tenantId: string;
    branchId?: string | null;
    stockItemId?: string | null;
    includeArchived?: boolean;
    limit: number;
    offset: number;
  }): Promise<InventoryRestockBatchRow[]> {
    const result = await this.db.query<InventoryRestockBatchRow>(
      `SELECT
         id,
         tenant_id,
         branch_id,
         stock_item_id,
         quantity_in_base_unit::FLOAT8 AS quantity_in_base_unit,
         status,
         received_at,
         expiry_date::TEXT AS expiry_date,
         supplier_name,
         purchase_cost_usd::FLOAT8 AS purchase_cost_usd,
         note,
         created_by_account_id,
         created_at,
         updated_at
       FROM v0_inventory_restock_batches
       WHERE tenant_id = $1
         AND ($2::UUID IS NULL OR branch_id = $2::UUID)
         AND ($3::UUID IS NULL OR stock_item_id = $3::UUID)
         AND ($4::BOOLEAN = TRUE OR status = 'ACTIVE')
       ORDER BY received_at DESC, id DESC
       LIMIT $5
       OFFSET $6`,
      [
        input.tenantId,
        input.branchId ?? null,
        input.stockItemId ?? null,
        input.includeArchived ?? false,
        input.limit,
        input.offset,
      ]
    );
    return result.rows;
  }

  async countRestockBatches(input: {
    tenantId: string;
    branchId?: string | null;
    stockItemId?: string | null;
    includeArchived?: boolean;
    archivedOnly?: boolean;
  }): Promise<number> {
    const result = await this.db.query<{ count: string }>(
      `SELECT COUNT(*)::TEXT AS count
       FROM v0_inventory_restock_batches
       WHERE tenant_id = $1
         AND ($2::UUID IS NULL OR branch_id = $2::UUID)
         AND ($3::UUID IS NULL OR stock_item_id = $3::UUID)
         AND (
           CASE
             WHEN $5::BOOLEAN = TRUE THEN status = 'ARCHIVED'
             WHEN $4::BOOLEAN = TRUE THEN TRUE
             ELSE status = 'ACTIVE'
           END
         )`,
      [
        input.tenantId,
        input.branchId ?? null,
        input.stockItemId ?? null,
        input.includeArchived ?? false,
        input.archivedOnly ?? false,
      ]
    );
    return Number(result.rows[0]?.count ?? "0");
  }

  async getRestockBatchById(input: {
    tenantId: string;
    batchId: string;
  }): Promise<InventoryRestockBatchRow | null> {
    const result = await this.db.query<InventoryRestockBatchRow>(
      `SELECT
         id,
         tenant_id,
         branch_id,
         stock_item_id,
         quantity_in_base_unit::FLOAT8 AS quantity_in_base_unit,
         status,
         received_at,
         expiry_date::TEXT AS expiry_date,
         supplier_name,
         purchase_cost_usd::FLOAT8 AS purchase_cost_usd,
         note,
         created_by_account_id,
         created_at,
         updated_at
       FROM v0_inventory_restock_batches
       WHERE tenant_id = $1
         AND id = $2
       LIMIT 1`,
      [input.tenantId, input.batchId]
    );
    return result.rows[0] ?? null;
  }

  async createRestockBatch(input: {
    tenantId: string;
    branchId: string;
    stockItemId: string;
    quantityInBaseUnit: number;
    receivedAt: Date;
    expiryDate: string | null;
    supplierName: string | null;
    purchaseCostUsd: number | null;
    note: string | null;
    createdByAccountId: string;
  }): Promise<InventoryRestockBatchRow> {
    const result = await this.db.query<InventoryRestockBatchRow>(
      `INSERT INTO v0_inventory_restock_batches (
         tenant_id,
         branch_id,
         stock_item_id,
         quantity_in_base_unit,
         received_at,
         expiry_date,
         supplier_name,
         purchase_cost_usd,
         note,
         created_by_account_id
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING
         id,
         tenant_id,
         branch_id,
         stock_item_id,
         quantity_in_base_unit::FLOAT8 AS quantity_in_base_unit,
         status,
         received_at,
         expiry_date::TEXT AS expiry_date,
         supplier_name,
         purchase_cost_usd::FLOAT8 AS purchase_cost_usd,
         note,
         created_by_account_id,
         created_at,
         updated_at`,
      [
        input.tenantId,
        input.branchId,
        input.stockItemId,
        input.quantityInBaseUnit,
        input.receivedAt,
        input.expiryDate,
        input.supplierName,
        input.purchaseCostUsd,
        input.note,
        input.createdByAccountId,
      ]
    );
    return result.rows[0];
  }

  async updateRestockBatchMetadata(input: {
    tenantId: string;
    batchId: string;
    expiryDate: string | null;
    supplierName: string | null;
    purchaseCostUsd: number | null;
    note: string | null;
  }): Promise<InventoryRestockBatchRow | null> {
    const result = await this.db.query<InventoryRestockBatchRow>(
      `UPDATE v0_inventory_restock_batches
       SET expiry_date = $3,
           supplier_name = $4,
           purchase_cost_usd = $5,
           note = $6,
           updated_at = NOW()
       WHERE tenant_id = $1
         AND id = $2
       RETURNING
         id,
         tenant_id,
         branch_id,
         stock_item_id,
         quantity_in_base_unit::FLOAT8 AS quantity_in_base_unit,
         status,
         received_at,
         expiry_date::TEXT AS expiry_date,
         supplier_name,
         purchase_cost_usd::FLOAT8 AS purchase_cost_usd,
         note,
         created_by_account_id,
         created_at,
         updated_at`,
      [
        input.tenantId,
        input.batchId,
        input.expiryDate,
        input.supplierName,
        input.purchaseCostUsd,
        input.note,
      ]
    );
    return result.rows[0] ?? null;
  }

  async setRestockBatchStatus(input: {
    tenantId: string;
    batchId: string;
    status: InventoryStatus;
  }): Promise<InventoryRestockBatchRow | null> {
    const result = await this.db.query<InventoryRestockBatchRow>(
      `UPDATE v0_inventory_restock_batches
       SET status = $3,
           updated_at = NOW()
       WHERE tenant_id = $1
         AND id = $2
       RETURNING
         id,
         tenant_id,
         branch_id,
         stock_item_id,
         quantity_in_base_unit::FLOAT8 AS quantity_in_base_unit,
         status,
         received_at,
         expiry_date::TEXT AS expiry_date,
         supplier_name,
         purchase_cost_usd::FLOAT8 AS purchase_cost_usd,
         note,
         created_by_account_id,
         created_at,
         updated_at`,
      [input.tenantId, input.batchId, input.status]
    );
    return result.rows[0] ?? null;
  }

  async appendJournalEntry(input: {
    tenantId: string;
    branchId: string;
    stockItemId: string;
    direction: InventoryDirection;
    quantityInBaseUnit: number;
    reasonCode: InventoryReasonCode;
    sourceType: InventorySourceType;
    sourceId: string;
    idempotencyKey: string;
    occurredAt: Date;
    actorAccountId: string | null;
    note: string | null;
  }): Promise<InventoryJournalEntryRow> {
    const result = await this.db.query<InventoryJournalEntryRow>(
      `INSERT INTO v0_inventory_journal_entries (
         tenant_id,
         branch_id,
         stock_item_id,
         direction,
         quantity_in_base_unit,
         reason_code,
         source_type,
         source_id,
         idempotency_key,
         occurred_at,
         actor_account_id,
         note
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       RETURNING
         id,
         tenant_id,
         branch_id,
         stock_item_id,
         direction,
         quantity_in_base_unit::FLOAT8 AS quantity_in_base_unit,
         reason_code,
         source_type,
         source_id,
         idempotency_key,
         occurred_at,
         actor_account_id,
         note,
         created_at`,
      [
        input.tenantId,
        input.branchId,
        input.stockItemId,
        input.direction,
        input.quantityInBaseUnit,
        input.reasonCode,
        input.sourceType,
        input.sourceId,
        input.idempotencyKey,
        input.occurredAt,
        input.actorAccountId,
        input.note,
      ]
    );
    return result.rows[0];
  }

  async appendJournalEntryIfAbsent(input: {
    tenantId: string;
    branchId: string;
    stockItemId: string;
    direction: InventoryDirection;
    quantityInBaseUnit: number;
    reasonCode: InventoryReasonCode;
    sourceType: InventorySourceType;
    sourceId: string;
    idempotencyKey: string;
    occurredAt: Date;
    actorAccountId: string | null;
    note: string | null;
  }): Promise<{ inserted: boolean; row: InventoryJournalEntryRow | null }> {
    const result = await this.db.query<InventoryJournalEntryRow>(
      `INSERT INTO v0_inventory_journal_entries (
         tenant_id,
         branch_id,
         stock_item_id,
         direction,
         quantity_in_base_unit,
         reason_code,
         source_type,
         source_id,
         idempotency_key,
         occurred_at,
         actor_account_id,
         note
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       ON CONFLICT (tenant_id, branch_id, idempotency_key)
       DO NOTHING
       RETURNING
         id,
         tenant_id,
         branch_id,
         stock_item_id,
         direction,
         quantity_in_base_unit::FLOAT8 AS quantity_in_base_unit,
         reason_code,
         source_type,
         source_id,
         idempotency_key,
         occurred_at,
         actor_account_id,
         note,
         created_at`,
      [
        input.tenantId,
        input.branchId,
        input.stockItemId,
        input.direction,
        input.quantityInBaseUnit,
        input.reasonCode,
        input.sourceType,
        input.sourceId,
        input.idempotencyKey,
        input.occurredAt,
        input.actorAccountId,
        input.note,
      ]
    );
    if (result.rows[0]) {
      return { inserted: true, row: result.rows[0] };
    }
    return { inserted: false, row: null };
  }

  async listJournal(input: {
    tenantId: string;
    branchId: string;
    stockItemId?: string | null;
    reasonCode?: InventoryReasonCode | null;
    fromInclusive?: Date | null;
    toExclusive?: Date | null;
    limit: number;
    offset: number;
  }): Promise<InventoryJournalEntryRow[]> {
    const result = await this.db.query<InventoryJournalEntryRow>(
      `SELECT
         id,
         tenant_id,
         branch_id,
         stock_item_id,
         direction,
         quantity_in_base_unit::FLOAT8 AS quantity_in_base_unit,
         reason_code,
         source_type,
         source_id,
         idempotency_key,
         occurred_at,
         actor_account_id,
         note,
         created_at
       FROM v0_inventory_journal_entries
       WHERE tenant_id = $1
         AND branch_id = $2
         AND ($3::UUID IS NULL OR stock_item_id = $3::UUID)
         AND ($4::VARCHAR IS NULL OR reason_code = $4::VARCHAR)
         AND ($5::TIMESTAMPTZ IS NULL OR occurred_at >= $5::TIMESTAMPTZ)
         AND ($6::TIMESTAMPTZ IS NULL OR occurred_at < $6::TIMESTAMPTZ)
       ORDER BY occurred_at DESC, id DESC
       LIMIT $7
       OFFSET $8`,
      [
        input.tenantId,
        input.branchId,
        input.stockItemId ?? null,
        input.reasonCode ?? null,
        input.fromInclusive ?? null,
        input.toExclusive ?? null,
        input.limit,
        input.offset,
      ]
    );
    return result.rows;
  }

  async countJournal(input: {
    tenantId: string;
    branchId: string;
    stockItemId?: string | null;
    reasonCode?: InventoryReasonCode | null;
    fromInclusive?: Date | null;
    toExclusive?: Date | null;
  }): Promise<number> {
    const result = await this.db.query<{ count: string }>(
      `SELECT COUNT(*)::TEXT AS count
       FROM v0_inventory_journal_entries
       WHERE tenant_id = $1
         AND branch_id = $2
         AND ($3::UUID IS NULL OR stock_item_id = $3::UUID)
         AND ($4::VARCHAR IS NULL OR reason_code = $4::VARCHAR)
         AND ($5::TIMESTAMPTZ IS NULL OR occurred_at >= $5::TIMESTAMPTZ)
         AND ($6::TIMESTAMPTZ IS NULL OR occurred_at < $6::TIMESTAMPTZ)`,
      [
        input.tenantId,
        input.branchId,
        input.stockItemId ?? null,
        input.reasonCode ?? null,
        input.fromInclusive ?? null,
        input.toExclusive ?? null,
      ]
    );
    return Number(result.rows[0]?.count ?? "0");
  }

  async listJournalByTenant(input: {
    tenantId: string;
    branchId?: string | null;
    stockItemId?: string | null;
    reasonCode?: InventoryReasonCode | null;
    fromInclusive?: Date | null;
    toExclusive?: Date | null;
    limit: number;
    offset: number;
  }): Promise<InventoryJournalEntryRow[]> {
    const result = await this.db.query<InventoryJournalEntryRow>(
      `SELECT
         id,
         tenant_id,
         branch_id,
         stock_item_id,
         direction,
         quantity_in_base_unit::FLOAT8 AS quantity_in_base_unit,
         reason_code,
         source_type,
         source_id,
         idempotency_key,
         occurred_at,
         actor_account_id,
         note,
         created_at
       FROM v0_inventory_journal_entries
       WHERE tenant_id = $1
         AND ($2::UUID IS NULL OR branch_id = $2::UUID)
         AND ($3::UUID IS NULL OR stock_item_id = $3::UUID)
         AND ($4::VARCHAR IS NULL OR reason_code = $4::VARCHAR)
         AND ($5::TIMESTAMPTZ IS NULL OR occurred_at >= $5::TIMESTAMPTZ)
         AND ($6::TIMESTAMPTZ IS NULL OR occurred_at < $6::TIMESTAMPTZ)
       ORDER BY occurred_at DESC, id DESC
       LIMIT $7
       OFFSET $8`,
      [
        input.tenantId,
        input.branchId ?? null,
        input.stockItemId ?? null,
        input.reasonCode ?? null,
        input.fromInclusive ?? null,
        input.toExclusive ?? null,
        input.limit,
        input.offset,
      ]
    );
    return result.rows;
  }

  async countJournalByTenant(input: {
    tenantId: string;
    branchId?: string | null;
    stockItemId?: string | null;
    reasonCode?: InventoryReasonCode | null;
    fromInclusive?: Date | null;
    toExclusive?: Date | null;
  }): Promise<number> {
    const result = await this.db.query<{ count: string }>(
      `SELECT COUNT(*)::TEXT AS count
       FROM v0_inventory_journal_entries
       WHERE tenant_id = $1
         AND ($2::UUID IS NULL OR branch_id = $2::UUID)
         AND ($3::UUID IS NULL OR stock_item_id = $3::UUID)
         AND ($4::VARCHAR IS NULL OR reason_code = $4::VARCHAR)
         AND ($5::TIMESTAMPTZ IS NULL OR occurred_at >= $5::TIMESTAMPTZ)
         AND ($6::TIMESTAMPTZ IS NULL OR occurred_at < $6::TIMESTAMPTZ)`,
      [
        input.tenantId,
        input.branchId ?? null,
        input.stockItemId ?? null,
        input.reasonCode ?? null,
        input.fromInclusive ?? null,
        input.toExclusive ?? null,
      ]
    );
    return Number(result.rows[0]?.count ?? "0");
  }

  async applyBranchStockDelta(input: {
    tenantId: string;
    branchId: string;
    stockItemId: string;
    signedDeltaInBaseUnit: number;
    movementAt: Date;
  }): Promise<InventoryBranchStockRow> {
    const result = await this.db.query<InventoryBranchStockRow>(
      `INSERT INTO v0_inventory_branch_stock (
         tenant_id,
         branch_id,
         stock_item_id,
         on_hand_in_base_unit,
         last_movement_at
       )
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (tenant_id, branch_id, stock_item_id)
       DO UPDATE SET
         on_hand_in_base_unit =
           v0_inventory_branch_stock.on_hand_in_base_unit + EXCLUDED.on_hand_in_base_unit,
         last_movement_at =
           GREATEST(v0_inventory_branch_stock.last_movement_at, EXCLUDED.last_movement_at),
         updated_at = NOW()
       RETURNING
         tenant_id,
         branch_id,
         stock_item_id,
         on_hand_in_base_unit::FLOAT8 AS on_hand_in_base_unit,
         last_movement_at,
         created_at,
         updated_at`,
      [
        input.tenantId,
        input.branchId,
        input.stockItemId,
        input.signedDeltaInBaseUnit,
        input.movementAt,
      ]
    );
    return result.rows[0];
  }

  async listBranchStock(input: {
    tenantId: string;
    branchId: string;
    includeArchivedItems?: boolean;
    limit: number;
    offset: number;
  }): Promise<InventoryBranchStockViewRow[]> {
    const result = await this.db.query<InventoryBranchStockViewRow>(
      `SELECT
         bs.stock_item_id,
         si.name AS stock_item_name,
         si.base_unit,
         si.low_stock_threshold::FLOAT8 AS low_stock_threshold,
         bs.on_hand_in_base_unit::FLOAT8 AS on_hand_in_base_unit,
         CASE
           WHEN si.low_stock_threshold IS NULL THEN FALSE
           ELSE bs.on_hand_in_base_unit <= si.low_stock_threshold
         END AS is_low_stock,
         bs.updated_at
       FROM v0_inventory_branch_stock bs
       JOIN v0_inventory_stock_items si
         ON si.tenant_id = bs.tenant_id
        AND si.id = bs.stock_item_id
       WHERE bs.tenant_id = $1
         AND bs.branch_id = $2
         AND ($3::BOOLEAN = TRUE OR si.status = 'ACTIVE')
       ORDER BY si.name ASC
       LIMIT $4::INTEGER
       OFFSET $5::INTEGER`,
      [
        input.tenantId,
        input.branchId,
        input.includeArchivedItems ?? false,
        input.limit,
        input.offset,
      ]
    );
    return result.rows;
  }

  async countBranchStock(input: {
    tenantId: string;
    branchId: string;
    includeArchivedItems?: boolean;
  }): Promise<number> {
    const result = await this.db.query<{ count: string }>(
      `SELECT COUNT(*)::TEXT AS count
       FROM v0_inventory_branch_stock bs
       JOIN v0_inventory_stock_items si
         ON si.tenant_id = bs.tenant_id
        AND si.id = bs.stock_item_id
       WHERE bs.tenant_id = $1
         AND bs.branch_id = $2
         AND ($3::BOOLEAN = TRUE OR si.status = 'ACTIVE')`,
      [input.tenantId, input.branchId, input.includeArchivedItems ?? false]
    );
    return Number(result.rows[0]?.count ?? "0");
  }

  async getBranchStockOnHand(input: {
    tenantId: string;
    branchId: string;
    stockItemId: string;
  }): Promise<number> {
    const result = await this.db.query<{ on_hand_in_base_unit: number }>(
      `SELECT
         on_hand_in_base_unit::FLOAT8 AS on_hand_in_base_unit
       FROM v0_inventory_branch_stock
       WHERE tenant_id = $1
         AND branch_id = $2
         AND stock_item_id = $3
       LIMIT 1`,
      [input.tenantId, input.branchId, input.stockItemId]
    );
    return result.rows[0]?.on_hand_in_base_unit ?? 0;
  }

  async listAggregateStock(input: {
    tenantId: string;
    includeArchivedItems?: boolean;
    limit: number;
    offset: number;
  }): Promise<InventoryAggregateStockViewRow[]> {
    const result = await this.db.query<InventoryAggregateStockViewRow>(
      `SELECT
         bs.stock_item_id,
         si.name AS stock_item_name,
         si.base_unit,
         SUM(bs.on_hand_in_base_unit)::FLOAT8 AS total_on_hand_in_base_unit,
         COUNT(DISTINCT bs.branch_id)::INTEGER AS branch_count
       FROM v0_inventory_branch_stock bs
       JOIN branches b
         ON b.tenant_id = bs.tenant_id
        AND b.id = bs.branch_id
       JOIN v0_inventory_stock_items si
         ON si.tenant_id = bs.tenant_id
        AND si.id = bs.stock_item_id
       WHERE bs.tenant_id = $1
         AND b.status = 'ACTIVE'
         AND ($2::BOOLEAN = TRUE OR si.status = 'ACTIVE')
       GROUP BY bs.stock_item_id, si.name, si.base_unit
       ORDER BY si.name ASC
       LIMIT $3::INTEGER
       OFFSET $4::INTEGER`,
      [input.tenantId, input.includeArchivedItems ?? false, input.limit, input.offset]
    );
    return result.rows;
  }

  async countAggregateStock(input: {
    tenantId: string;
    includeArchivedItems?: boolean;
  }): Promise<number> {
    const result = await this.db.query<{ count: string }>(
      `SELECT COUNT(*)::TEXT AS count
       FROM (
         SELECT bs.stock_item_id
         FROM v0_inventory_branch_stock bs
         JOIN branches b
           ON b.tenant_id = bs.tenant_id
          AND b.id = bs.branch_id
         JOIN v0_inventory_stock_items si
           ON si.tenant_id = bs.tenant_id
          AND si.id = bs.stock_item_id
         WHERE bs.tenant_id = $1
           AND b.status = 'ACTIVE'
           AND ($2::BOOLEAN = TRUE OR si.status = 'ACTIVE')
         GROUP BY bs.stock_item_id
       ) aggregated`,
      [input.tenantId, input.includeArchivedItems ?? false]
    );
    return Number(result.rows[0]?.count ?? "0");
  }
}
