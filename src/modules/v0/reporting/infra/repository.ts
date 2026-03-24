import type { Pool, PoolClient } from "pg";

type Queryable = Pick<Pool, "query"> | Pick<PoolClient, "query">;

export type V0ReportingSaleStatus = "PENDING" | "FINALIZED" | "VOID_PENDING" | "VOIDED";
export type V0ReportingSaleStatusFilter = "ALL" | "FINALIZED" | "VOID_PENDING" | "VOIDED";
export type V0ReportingPaymentMethod = "CASH" | "KHQR";
export type V0ReportingTenderCurrency = "USD" | "KHR";
export type V0ReportingSaleType = "DINE_IN" | "TAKEAWAY" | "DELIVERY";
export type V0ReportingRestockCostFilter = "ALL" | "KNOWN" | "UNKNOWN";

type ReportingWindowInput = {
  tenantId: string;
  fromInclusive: Date;
  toExclusive: Date;
  branchIds?: ReadonlyArray<string> | null;
};

export type V0ReportingSalesSummaryCoreRow = {
  confirmed_transaction_count: number;
  confirmed_total_grand_usd: number;
  confirmed_total_grand_khr: number;
  confirmed_total_vat_usd: number;
  confirmed_total_vat_khr: number;
  confirmed_total_discount_usd: number;
  confirmed_total_discount_khr: number;
  confirmed_total_items_sold: number;
  void_pending_count: number;
  void_pending_total_usd: number;
  void_pending_total_khr: number;
  voided_count: number;
  voided_total_usd: number;
  voided_total_khr: number;
};

export type V0ReportingSalesPaymentBreakdownRow = {
  payment_method: V0ReportingPaymentMethod;
  transaction_count: number;
  total_usd: number;
  total_khr: number;
};

export type V0ReportingSalesCashTenderBreakdownRow = {
  tender_currency: V0ReportingTenderCurrency;
  transaction_count: number;
  total_tender_amount: number;
};

export type V0ReportingSalesTypeBreakdownRow = {
  sale_type: V0ReportingSaleType;
  transaction_count: number;
  total_usd: number;
  total_khr: number;
  total_items_sold: number;
};

export type V0ReportingSalesTopItemRow = {
  menu_item_id: string;
  item_name_snapshot: string;
  quantity: number;
  revenue_usd: number;
  revenue_khr: number;
};

export type V0ReportingSalesCategoryBreakdownRow = {
  category_name_snapshot: string;
  quantity: number;
  revenue_usd: number;
  revenue_khr: number;
};

export type V0ReportingSalesDrillDownRow = {
  sale_id: string;
  branch_id: string;
  status: V0ReportingSaleStatus;
  payment_method: V0ReportingPaymentMethod;
  sale_type: V0ReportingSaleType;
  finalized_at: Date | null;
  total_items: number;
  grand_total_usd: number;
  grand_total_khr: number;
  vat_usd: number;
  vat_khr: number;
  discount_usd: number;
  discount_khr: number;
};

export type V0ReportingRestockSpendSummaryRow = {
  known_cost_spend_usd: number;
  known_cost_batch_count: number;
  unknown_cost_batch_count: number;
};

export type V0ReportingRestockSpendMonthlyRow = {
  month: string;
  known_cost_spend_usd: number;
  known_cost_batch_count: number;
  unknown_cost_batch_count: number;
};

export type V0ReportingRestockSpendDrillDownRow = {
  restock_batch_id: string;
  branch_id: string;
  stock_item_id: string;
  stock_item_name: string;
  quantity_in_base_unit: number;
  purchase_cost_usd: number | null;
  received_at: Date;
};

export type V0ReportingTenantMembershipRow = {
  membership_id: string;
  role_key: string;
};

export type V0ReportingBranchAccessRow = {
  branch_id: string;
  branch_name: string;
  branch_status: string;
};

export class V0ReportingRepository {
  constructor(private readonly db: Queryable) {}

  async getSalesSummaryCore(input: ReportingWindowInput): Promise<V0ReportingSalesSummaryCoreRow> {
    const branchIds = normalizeBranchIds(input.branchIds);
    const result = await this.db.query<V0ReportingSalesSummaryCoreRow>(
      `WITH scoped_sales AS (
         SELECT
           s.id,
           s.status,
           s.grand_total_usd,
           s.grand_total_khr,
           s.vat_usd,
           s.vat_khr,
           s.discount_usd,
           s.discount_khr
         FROM v0_sales s
         WHERE s.tenant_id = $1
           AND s.finalized_at IS NOT NULL
           AND s.finalized_at >= $2
           AND s.finalized_at < $3
           AND ($4::uuid[] IS NULL OR s.branch_id = ANY($4::uuid[]))
       ),
       line_totals AS (
         SELECT
           sl.sale_id,
           COALESCE(SUM(sl.quantity), 0)::FLOAT8 AS total_items
         FROM v0_sale_lines sl
         JOIN scoped_sales ss ON ss.id = sl.sale_id
         WHERE sl.tenant_id = $1
         GROUP BY sl.sale_id
       )
       SELECT
         COALESCE(COUNT(*) FILTER (WHERE ss.status = 'FINALIZED'), 0)::INT AS confirmed_transaction_count,
         COALESCE(SUM(ss.grand_total_usd) FILTER (WHERE ss.status = 'FINALIZED'), 0)::FLOAT8 AS confirmed_total_grand_usd,
         COALESCE(SUM(ss.grand_total_khr) FILTER (WHERE ss.status = 'FINALIZED'), 0)::FLOAT8 AS confirmed_total_grand_khr,
         COALESCE(SUM(ss.vat_usd) FILTER (WHERE ss.status = 'FINALIZED'), 0)::FLOAT8 AS confirmed_total_vat_usd,
         COALESCE(SUM(ss.vat_khr) FILTER (WHERE ss.status = 'FINALIZED'), 0)::FLOAT8 AS confirmed_total_vat_khr,
         COALESCE(SUM(ss.discount_usd) FILTER (WHERE ss.status = 'FINALIZED'), 0)::FLOAT8 AS confirmed_total_discount_usd,
         COALESCE(SUM(ss.discount_khr) FILTER (WHERE ss.status = 'FINALIZED'), 0)::FLOAT8 AS confirmed_total_discount_khr,
         COALESCE(SUM(lt.total_items) FILTER (WHERE ss.status = 'FINALIZED'), 0)::FLOAT8 AS confirmed_total_items_sold,
         COALESCE(COUNT(*) FILTER (WHERE ss.status = 'VOID_PENDING'), 0)::INT AS void_pending_count,
         COALESCE(SUM(ss.grand_total_usd) FILTER (WHERE ss.status = 'VOID_PENDING'), 0)::FLOAT8 AS void_pending_total_usd,
         COALESCE(SUM(ss.grand_total_khr) FILTER (WHERE ss.status = 'VOID_PENDING'), 0)::FLOAT8 AS void_pending_total_khr,
         COALESCE(COUNT(*) FILTER (WHERE ss.status = 'VOIDED'), 0)::INT AS voided_count,
         COALESCE(SUM(ss.grand_total_usd) FILTER (WHERE ss.status = 'VOIDED'), 0)::FLOAT8 AS voided_total_usd,
         COALESCE(SUM(ss.grand_total_khr) FILTER (WHERE ss.status = 'VOIDED'), 0)::FLOAT8 AS voided_total_khr
       FROM scoped_sales ss
       LEFT JOIN line_totals lt ON lt.sale_id = ss.id`,
      [input.tenantId, input.fromInclusive, input.toExclusive, branchIds]
    );
    return result.rows[0] ?? defaultSalesSummaryCoreRow();
  }

  async listSalesPaymentBreakdown(
    input: ReportingWindowInput
  ): Promise<V0ReportingSalesPaymentBreakdownRow[]> {
    const branchIds = normalizeBranchIds(input.branchIds);
    const result = await this.db.query<V0ReportingSalesPaymentBreakdownRow>(
      `SELECT
         s.payment_method,
         COUNT(*)::INT AS transaction_count,
         COALESCE(SUM(s.grand_total_usd), 0)::FLOAT8 AS total_usd,
         COALESCE(SUM(s.grand_total_khr), 0)::FLOAT8 AS total_khr
       FROM v0_sales s
       WHERE s.tenant_id = $1
         AND s.status = 'FINALIZED'
         AND s.finalized_at IS NOT NULL
         AND s.finalized_at >= $2
         AND s.finalized_at < $3
         AND ($4::uuid[] IS NULL OR s.branch_id = ANY($4::uuid[]))
       GROUP BY s.payment_method
       ORDER BY s.payment_method ASC`,
      [input.tenantId, input.fromInclusive, input.toExclusive, branchIds]
    );
    return result.rows;
  }

  async listSalesCashTenderBreakdown(
    input: ReportingWindowInput
  ): Promise<V0ReportingSalesCashTenderBreakdownRow[]> {
    const branchIds = normalizeBranchIds(input.branchIds);
    const result = await this.db.query<V0ReportingSalesCashTenderBreakdownRow>(
      `SELECT
         s.tender_currency,
         COUNT(*)::INT AS transaction_count,
         COALESCE(SUM(s.tender_amount), 0)::FLOAT8 AS total_tender_amount
       FROM v0_sales s
       WHERE s.tenant_id = $1
         AND s.status = 'FINALIZED'
         AND s.payment_method = 'CASH'
         AND s.finalized_at IS NOT NULL
         AND s.finalized_at >= $2
         AND s.finalized_at < $3
         AND ($4::uuid[] IS NULL OR s.branch_id = ANY($4::uuid[]))
       GROUP BY s.tender_currency
       ORDER BY s.tender_currency ASC`,
      [input.tenantId, input.fromInclusive, input.toExclusive, branchIds]
    );
    return result.rows;
  }

  async listSalesTypeBreakdown(
    input: ReportingWindowInput
  ): Promise<V0ReportingSalesTypeBreakdownRow[]> {
    const branchIds = normalizeBranchIds(input.branchIds);
    const result = await this.db.query<V0ReportingSalesTypeBreakdownRow>(
      `WITH scoped_sales AS (
         SELECT
           s.id,
           s.sale_type,
           s.grand_total_usd,
           s.grand_total_khr
         FROM v0_sales s
         WHERE s.tenant_id = $1
           AND s.status = 'FINALIZED'
           AND s.finalized_at IS NOT NULL
           AND s.finalized_at >= $2
           AND s.finalized_at < $3
           AND ($4::uuid[] IS NULL OR s.branch_id = ANY($4::uuid[]))
       ),
       line_totals AS (
         SELECT
           sl.sale_id,
           COALESCE(SUM(sl.quantity), 0)::FLOAT8 AS total_items
         FROM v0_sale_lines sl
         JOIN scoped_sales ss ON ss.id = sl.sale_id
         WHERE sl.tenant_id = $1
         GROUP BY sl.sale_id
       )
       SELECT
         ss.sale_type,
         COUNT(*)::INT AS transaction_count,
         COALESCE(SUM(ss.grand_total_usd), 0)::FLOAT8 AS total_usd,
         COALESCE(SUM(ss.grand_total_khr), 0)::FLOAT8 AS total_khr,
         COALESCE(SUM(lt.total_items), 0)::FLOAT8 AS total_items_sold
       FROM scoped_sales ss
       LEFT JOIN line_totals lt ON lt.sale_id = ss.id
       GROUP BY ss.sale_type
       ORDER BY ss.sale_type ASC`,
      [input.tenantId, input.fromInclusive, input.toExclusive, branchIds]
    );
    return result.rows;
  }

  async listSalesTopItems(
    input: ReportingWindowInput & { topN: number }
  ): Promise<V0ReportingSalesTopItemRow[]> {
    const branchIds = normalizeBranchIds(input.branchIds);
    const limit = normalizeTopN(input.topN);
    const result = await this.db.query<V0ReportingSalesTopItemRow>(
      `SELECT
         sl.menu_item_id,
         sl.menu_item_name_snapshot AS item_name_snapshot,
         COALESCE(SUM(sl.quantity), 0)::FLOAT8 AS quantity,
         COALESCE(SUM(sl.line_total_amount), 0)::FLOAT8 AS revenue_usd,
         COALESCE(
           SUM(
             COALESCE(
               sl.line_total_khr_snapshot,
               sl.line_total_amount * s.sale_fx_rate_khr_per_usd
             )
           ),
           0
         )::FLOAT8 AS revenue_khr
       FROM v0_sale_lines sl
       JOIN v0_sales s
         ON s.tenant_id = sl.tenant_id
        AND s.id = sl.sale_id
       WHERE sl.tenant_id = $1
         AND s.status = 'FINALIZED'
         AND s.finalized_at IS NOT NULL
         AND s.finalized_at >= $2
         AND s.finalized_at < $3
         AND ($4::uuid[] IS NULL OR s.branch_id = ANY($4::uuid[]))
       GROUP BY sl.menu_item_id, sl.menu_item_name_snapshot
       ORDER BY quantity DESC, sl.menu_item_name_snapshot ASC
       LIMIT $5`,
      [input.tenantId, input.fromInclusive, input.toExclusive, branchIds, limit]
    );
    return result.rows;
  }

  async listSalesCategoryBreakdown(
    input: ReportingWindowInput
  ): Promise<V0ReportingSalesCategoryBreakdownRow[]> {
    const branchIds = normalizeBranchIds(input.branchIds);
    const result = await this.db.query<V0ReportingSalesCategoryBreakdownRow>(
      `SELECT
         COALESCE(NULLIF(TRIM(sl.menu_category_name_snapshot), ''), 'Uncategorized') AS category_name_snapshot,
         COALESCE(SUM(sl.quantity), 0)::FLOAT8 AS quantity,
         COALESCE(SUM(sl.line_total_amount), 0)::FLOAT8 AS revenue_usd,
         COALESCE(
           SUM(
             COALESCE(
               sl.line_total_khr_snapshot,
               sl.line_total_amount * s.sale_fx_rate_khr_per_usd
             )
           ),
           0
         )::FLOAT8 AS revenue_khr
       FROM v0_sale_lines sl
       JOIN v0_sales s
         ON s.tenant_id = sl.tenant_id
        AND s.id = sl.sale_id
       WHERE sl.tenant_id = $1
         AND s.status = 'FINALIZED'
         AND s.finalized_at IS NOT NULL
         AND s.finalized_at >= $2
         AND s.finalized_at < $3
         AND ($4::uuid[] IS NULL OR s.branch_id = ANY($4::uuid[]))
       GROUP BY COALESCE(NULLIF(TRIM(sl.menu_category_name_snapshot), ''), 'Uncategorized')
       ORDER BY revenue_usd DESC, category_name_snapshot ASC`,
      [input.tenantId, input.fromInclusive, input.toExclusive, branchIds]
    );
    return result.rows;
  }

  async listSalesDrillDown(
    input: ReportingWindowInput & {
      statusFilter: V0ReportingSaleStatusFilter;
      limit: number;
      offset: number;
    }
  ): Promise<V0ReportingSalesDrillDownRow[]> {
    const branchIds = normalizeBranchIds(input.branchIds);
    const limit = normalizeLimit(input.limit);
    const offset = normalizeOffset(input.offset);
    const result = await this.db.query<V0ReportingSalesDrillDownRow>(
      `WITH scoped_sales AS (
         SELECT
           s.id,
           s.branch_id,
           s.status,
           s.payment_method,
           s.sale_type,
           s.finalized_at,
           s.grand_total_usd,
           s.grand_total_khr,
           s.vat_usd,
           s.vat_khr,
           s.discount_usd,
           s.discount_khr
         FROM v0_sales s
         WHERE s.tenant_id = $1
           AND s.finalized_at IS NOT NULL
           AND s.finalized_at >= $2
           AND s.finalized_at < $3
           AND ($4::uuid[] IS NULL OR s.branch_id = ANY($4::uuid[]))
           AND ($5::text = 'ALL' OR s.status = $5::text)
       ),
       line_totals AS (
         SELECT
           sl.sale_id,
           COALESCE(SUM(sl.quantity), 0)::FLOAT8 AS total_items
         FROM v0_sale_lines sl
         JOIN scoped_sales ss ON ss.id = sl.sale_id
         WHERE sl.tenant_id = $1
         GROUP BY sl.sale_id
       )
       SELECT
         ss.id AS sale_id,
         ss.branch_id,
         ss.status,
         ss.payment_method,
         ss.sale_type,
         ss.finalized_at,
         COALESCE(lt.total_items, 0)::FLOAT8 AS total_items,
         ss.grand_total_usd::FLOAT8 AS grand_total_usd,
         ss.grand_total_khr::FLOAT8 AS grand_total_khr,
         ss.vat_usd::FLOAT8 AS vat_usd,
         ss.vat_khr::FLOAT8 AS vat_khr,
         ss.discount_usd::FLOAT8 AS discount_usd,
         ss.discount_khr::FLOAT8 AS discount_khr
       FROM scoped_sales ss
       LEFT JOIN line_totals lt ON lt.sale_id = ss.id
       ORDER BY ss.finalized_at DESC, ss.id DESC
       LIMIT $6 OFFSET $7`,
      [
        input.tenantId,
        input.fromInclusive,
        input.toExclusive,
        branchIds,
        normalizeSaleStatusFilter(input.statusFilter),
        limit,
        offset,
      ]
    );
    return result.rows;
  }

  async countSalesDrillDown(
    input: ReportingWindowInput & {
      statusFilter: V0ReportingSaleStatusFilter;
    }
  ): Promise<number> {
    const branchIds = normalizeBranchIds(input.branchIds);
    const result = await this.db.query<{ count: string }>(
      `SELECT COUNT(*)::TEXT AS count
       FROM v0_sales s
       WHERE s.tenant_id = $1
         AND s.finalized_at IS NOT NULL
         AND s.finalized_at >= $2
         AND s.finalized_at < $3
         AND ($4::uuid[] IS NULL OR s.branch_id = ANY($4::uuid[]))
         AND ($5::text = 'ALL' OR s.status = $5::text)`,
      [
        input.tenantId,
        input.fromInclusive,
        input.toExclusive,
        branchIds,
        normalizeSaleStatusFilter(input.statusFilter),
      ]
    );
    return Number(result.rows[0]?.count ?? "0");
  }

  async getRestockSpendSummary(
    input: ReportingWindowInput
  ): Promise<V0ReportingRestockSpendSummaryRow> {
    const branchIds = normalizeBranchIds(input.branchIds);
    const result = await this.db.query<V0ReportingRestockSpendSummaryRow>(
      `SELECT
         COALESCE(SUM(rb.purchase_cost_usd) FILTER (WHERE rb.purchase_cost_usd IS NOT NULL), 0)::FLOAT8 AS known_cost_spend_usd,
         COALESCE(COUNT(*) FILTER (WHERE rb.purchase_cost_usd IS NOT NULL), 0)::INT AS known_cost_batch_count,
         COALESCE(COUNT(*) FILTER (WHERE rb.purchase_cost_usd IS NULL), 0)::INT AS unknown_cost_batch_count
       FROM v0_inventory_restock_batches rb
       WHERE rb.tenant_id = $1
         AND rb.received_at >= $2
         AND rb.received_at < $3
         AND ($4::uuid[] IS NULL OR rb.branch_id = ANY($4::uuid[]))`,
      [input.tenantId, input.fromInclusive, input.toExclusive, branchIds]
    );
    return (
      result.rows[0] ?? {
        known_cost_spend_usd: 0,
        known_cost_batch_count: 0,
        unknown_cost_batch_count: 0,
      }
    );
  }

  async listRestockSpendMonthlyBreakdown(
    input: ReportingWindowInput
  ): Promise<V0ReportingRestockSpendMonthlyRow[]> {
    const branchIds = normalizeBranchIds(input.branchIds);
    const result = await this.db.query<V0ReportingRestockSpendMonthlyRow>(
      `SELECT
         TO_CHAR(DATE_TRUNC('month', rb.received_at AT TIME ZONE 'Asia/Phnom_Penh'), 'YYYY-MM') AS month,
         COALESCE(SUM(rb.purchase_cost_usd) FILTER (WHERE rb.purchase_cost_usd IS NOT NULL), 0)::FLOAT8 AS known_cost_spend_usd,
         COALESCE(COUNT(*) FILTER (WHERE rb.purchase_cost_usd IS NOT NULL), 0)::INT AS known_cost_batch_count,
         COALESCE(COUNT(*) FILTER (WHERE rb.purchase_cost_usd IS NULL), 0)::INT AS unknown_cost_batch_count
       FROM v0_inventory_restock_batches rb
       WHERE rb.tenant_id = $1
         AND rb.received_at >= $2
         AND rb.received_at < $3
         AND ($4::uuid[] IS NULL OR rb.branch_id = ANY($4::uuid[]))
       GROUP BY DATE_TRUNC('month', rb.received_at AT TIME ZONE 'Asia/Phnom_Penh')
       ORDER BY month ASC`,
      [input.tenantId, input.fromInclusive, input.toExclusive, branchIds]
    );
    return result.rows;
  }

  async listRestockSpendDrillDown(
    input: ReportingWindowInput & {
      costFilter: V0ReportingRestockCostFilter;
      limit: number;
      offset: number;
    }
  ): Promise<V0ReportingRestockSpendDrillDownRow[]> {
    const branchIds = normalizeBranchIds(input.branchIds);
    const limit = normalizeLimit(input.limit);
    const offset = normalizeOffset(input.offset);
    const result = await this.db.query<V0ReportingRestockSpendDrillDownRow>(
      `SELECT
         rb.id AS restock_batch_id,
         rb.branch_id,
         rb.stock_item_id,
         si.name AS stock_item_name,
         rb.quantity_in_base_unit::FLOAT8 AS quantity_in_base_unit,
         rb.purchase_cost_usd::FLOAT8 AS purchase_cost_usd,
         rb.received_at
       FROM v0_inventory_restock_batches rb
       JOIN v0_inventory_stock_items si
         ON si.tenant_id = rb.tenant_id
        AND si.id = rb.stock_item_id
       WHERE rb.tenant_id = $1
         AND rb.received_at >= $2
         AND rb.received_at < $3
         AND ($4::uuid[] IS NULL OR rb.branch_id = ANY($4::uuid[]))
         AND (
           $5::text = 'ALL'
           OR ($5::text = 'KNOWN' AND rb.purchase_cost_usd IS NOT NULL)
           OR ($5::text = 'UNKNOWN' AND rb.purchase_cost_usd IS NULL)
         )
       ORDER BY rb.received_at DESC, rb.id DESC
       LIMIT $6 OFFSET $7`,
      [
        input.tenantId,
        input.fromInclusive,
        input.toExclusive,
        branchIds,
        normalizeRestockCostFilter(input.costFilter),
        limit,
        offset,
      ]
    );
    return result.rows;
  }

  async countRestockSpendDrillDown(
    input: ReportingWindowInput & {
      costFilter: V0ReportingRestockCostFilter;
    }
  ): Promise<number> {
    const branchIds = normalizeBranchIds(input.branchIds);
    const result = await this.db.query<{ count: string }>(
      `SELECT COUNT(*)::TEXT AS count
       FROM v0_inventory_restock_batches rb
       WHERE rb.tenant_id = $1
         AND rb.received_at >= $2
         AND rb.received_at < $3
         AND ($4::uuid[] IS NULL OR rb.branch_id = ANY($4::uuid[]))
         AND (
           $5::text = 'ALL'
           OR ($5::text = 'KNOWN' AND rb.purchase_cost_usd IS NOT NULL)
           OR ($5::text = 'UNKNOWN' AND rb.purchase_cost_usd IS NULL)
         )`,
      [
        input.tenantId,
        input.fromInclusive,
        input.toExclusive,
        branchIds,
        normalizeRestockCostFilter(input.costFilter),
      ]
    );
    return Number(result.rows[0]?.count ?? "0");
  }

  async isWorkReviewReadModelAvailable(): Promise<boolean> {
    const result = await this.db.query<{ exists: boolean }>(
      `SELECT (
         to_regclass('public.v0_work_review_comparisons') IS NOT NULL
         OR to_regclass('public.v0_work_review_comparison') IS NOT NULL
         OR to_regclass('public.work_review_comparison') IS NOT NULL
       ) AS exists`
    );
    return result.rows[0]?.exists === true;
  }

  async getActiveTenantMembership(input: {
    tenantId: string;
    accountId: string;
  }): Promise<V0ReportingTenantMembershipRow | null> {
    const result = await this.db.query<V0ReportingTenantMembershipRow>(
      `SELECT
         id AS membership_id,
         role_key
       FROM v0_tenant_memberships
       WHERE tenant_id = $1
         AND account_id = $2
         AND status = 'ACTIVE'
       LIMIT 1`,
      [input.tenantId, input.accountId]
    );
    return result.rows[0] ?? null;
  }

  async listTenantBranches(input: {
    tenantId: string;
  }): Promise<V0ReportingBranchAccessRow[]> {
    const result = await this.db.query<V0ReportingBranchAccessRow>(
      `SELECT
         b.id AS branch_id,
         b.name AS branch_name,
         b.status AS branch_status
       FROM branches b
       WHERE b.tenant_id = $1
       ORDER BY b.name ASC, b.id ASC`,
      [input.tenantId]
    );
    return result.rows;
  }

  async listAccessibleBranchesForAccount(input: {
    tenantId: string;
    accountId: string;
  }): Promise<V0ReportingBranchAccessRow[]> {
    const result = await this.db.query<V0ReportingBranchAccessRow>(
      `SELECT DISTINCT
         b.id AS branch_id,
         b.name AS branch_name,
         b.status AS branch_status
       FROM v0_branch_assignments ba
       JOIN v0_tenant_memberships m ON m.id = ba.membership_id
       JOIN branches b ON b.id = ba.branch_id
       WHERE ba.tenant_id = $1
         AND ba.account_id = $2
         AND ba.status = 'ACTIVE'
         AND m.tenant_id = $1
         AND m.account_id = $2
         AND m.status = 'ACTIVE'
         AND b.tenant_id = $1
       ORDER BY b.name ASC, b.id ASC`,
      [input.tenantId, input.accountId]
    );
    return result.rows;
  }
}

function normalizeBranchIds(branchIds: ReadonlyArray<string> | null | undefined): string[] | null {
  if (!branchIds) {
    return null;
  }
  const normalized = Array.from(
    new Set(
      branchIds
        .map((branchId) => String(branchId ?? "").trim())
        .filter((branchId) => branchId.length > 0)
    )
  );
  return normalized.length > 0 ? normalized : null;
}

function normalizeSaleStatusFilter(value: V0ReportingSaleStatusFilter): V0ReportingSaleStatusFilter {
  const normalized = String(value ?? "ALL").trim().toUpperCase() as V0ReportingSaleStatusFilter;
  if (normalized === "FINALIZED" || normalized === "VOID_PENDING" || normalized === "VOIDED") {
    return normalized;
  }
  return "ALL";
}

function normalizeRestockCostFilter(
  value: V0ReportingRestockCostFilter
): V0ReportingRestockCostFilter {
  const normalized = String(value ?? "ALL").trim().toUpperCase() as V0ReportingRestockCostFilter;
  if (normalized === "KNOWN" || normalized === "UNKNOWN") {
    return normalized;
  }
  return "ALL";
}

function normalizeTopN(value: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 10;
  }
  return Math.min(Math.floor(parsed), 100);
}

function normalizeLimit(value: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 50;
  }
  return Math.min(Math.floor(parsed), 200);
}

function normalizeOffset(value: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return 0;
  }
  return Math.floor(parsed);
}

function defaultSalesSummaryCoreRow(): V0ReportingSalesSummaryCoreRow {
  return {
    confirmed_transaction_count: 0,
    confirmed_total_grand_usd: 0,
    confirmed_total_grand_khr: 0,
    confirmed_total_vat_usd: 0,
    confirmed_total_vat_khr: 0,
    confirmed_total_discount_usd: 0,
    confirmed_total_discount_khr: 0,
    confirmed_total_items_sold: 0,
    void_pending_count: 0,
    void_pending_total_usd: 0,
    void_pending_total_khr: 0,
    voided_count: 0,
    voided_total_usd: 0,
    voided_total_khr: 0,
  };
}
