import type { Pool, PoolClient } from "pg";

type Queryable = Pick<Pool, "query"> | Pick<PoolClient, "query">;

export type CashSessionStatus = "OPEN" | "CLOSED" | "FORCE_CLOSED";
export type CashCloseReason = "NORMAL_CLOSE" | "FORCE_CLOSE";

export type CashMovementType =
  | "SALE_IN"
  | "REFUND_CASH"
  | "MANUAL_IN"
  | "MANUAL_OUT"
  | "ADJUSTMENT";

export type CashMovementSourceRefType = "SALE" | "MANUAL" | "SYSTEM";

export type CashSessionRow = {
  id: string;
  tenant_id: string;
  branch_id: string;
  opened_by_account_id: string;
  opened_at: Date;
  status: CashSessionStatus;
  opening_float_usd: number;
  opening_float_khr: number;
  opening_note: string | null;
  closed_by_account_id: string | null;
  closed_at: Date | null;
  close_reason: CashCloseReason | null;
  close_note: string | null;
  created_at: Date;
  updated_at: Date;
};

export type CashMovementRow = {
  id: string;
  tenant_id: string;
  branch_id: string;
  cash_session_id: string;
  movement_type: CashMovementType;
  amount_usd_delta: number;
  amount_khr_delta: number;
  reason: string | null;
  source_ref_type: CashMovementSourceRefType;
  source_ref_id: string | null;
  idempotency_key: string;
  recorded_by_account_id: string;
  occurred_at: Date;
  created_at: Date;
};

export type CashReconciliationSnapshotRow = {
  id: string;
  tenant_id: string;
  branch_id: string;
  cash_session_id: string;
  status: Exclude<CashSessionStatus, "OPEN">;
  opening_float_usd: number;
  opening_float_khr: number;
  total_sales_non_cash_usd: number;
  total_sales_non_cash_khr: number;
  total_sales_khqr_usd: number;
  total_sales_khqr_khr: number;
  total_sale_in_usd: number;
  total_sale_in_khr: number;
  total_refund_out_usd: number;
  total_refund_out_khr: number;
  total_manual_in_usd: number;
  total_manual_in_khr: number;
  total_manual_out_usd: number;
  total_manual_out_khr: number;
  total_adjustment_usd: number;
  total_adjustment_khr: number;
  expected_cash_usd: number;
  expected_cash_khr: number;
  counted_cash_usd: number;
  counted_cash_khr: number;
  variance_usd: number;
  variance_khr: number;
  close_reason: CashCloseReason;
  closed_by_account_id: string;
  closed_at: Date;
  created_at: Date;
  updated_at: Date;
};

export type CashMovementTotalsRow = {
  total_sales_non_cash_usd: number;
  total_sales_non_cash_khr: number;
  total_sales_khqr_usd: number;
  total_sales_khqr_khr: number;
  total_sale_in_usd: number;
  total_sale_in_khr: number;
  total_refund_out_usd: number;
  total_refund_out_khr: number;
  total_manual_in_usd: number;
  total_manual_in_khr: number;
  total_manual_out_usd: number;
  total_manual_out_khr: number;
  total_adjustment_usd: number;
  total_adjustment_khr: number;
  total_cash_delta_usd: number;
  total_cash_delta_khr: number;
};

export type CashSessionSaleRow = {
  sale_id: string;
  status: "FINALIZED" | "VOID_PENDING" | "VOIDED";
  payment_method: "CASH" | "KHQR";
  sale_type: "DINE_IN" | "TAKEAWAY" | "DELIVERY";
  finalized_at: Date;
  finalized_by_account_id: string | null;
  voided_at: Date | null;
  grand_total_usd: number;
  grand_total_khr: number;
  total_items: number;
};

export class V0CashSessionRepository {
  constructor(private readonly db: Queryable) {}

  async createSession(input: {
    tenantId: string;
    branchId: string;
    openedByAccountId: string;
    openingFloatUsd: number;
    openingFloatKhr: number;
    openingNote?: string | null;
  }): Promise<CashSessionRow> {
    const result = await this.db.query<CashSessionRow>(
      `INSERT INTO v0_cash_sessions (
         tenant_id,
         branch_id,
         opened_by_account_id,
         opening_float_usd,
         opening_float_khr,
         opening_note
       )
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING
         id,
         tenant_id,
         branch_id,
         opened_by_account_id,
         opened_at,
         status,
         opening_float_usd::FLOAT8 AS opening_float_usd,
         opening_float_khr::FLOAT8 AS opening_float_khr,
         opening_note,
         closed_by_account_id,
         closed_at,
         close_reason,
         close_note,
         created_at,
         updated_at`,
      [
        input.tenantId,
        input.branchId,
        input.openedByAccountId,
        input.openingFloatUsd,
        input.openingFloatKhr,
        input.openingNote ?? null,
      ]
    );
    return result.rows[0];
  }

  async getSessionById(input: {
    tenantId: string;
    sessionId: string;
  }): Promise<CashSessionRow | null> {
    const result = await this.db.query<CashSessionRow>(
      `${cashSessionSelectSql}
       FROM v0_cash_sessions s
       WHERE s.tenant_id = $1
         AND s.id = $2
       LIMIT 1`,
      [input.tenantId, input.sessionId]
    );
    return result.rows[0] ?? null;
  }

  async getActiveSessionByBranch(input: {
    tenantId: string;
    branchId: string;
  }): Promise<CashSessionRow | null> {
    const result = await this.db.query<CashSessionRow>(
      `${cashSessionSelectSql}
       FROM v0_cash_sessions s
       WHERE s.tenant_id = $1
         AND s.branch_id = $2
         AND s.status = 'OPEN'
       ORDER BY s.opened_at DESC
       LIMIT 1`,
      [input.tenantId, input.branchId]
    );
    return result.rows[0] ?? null;
  }

  async listSessions(input: {
    tenantId: string;
    branchId: string;
    status?: CashSessionStatus | null;
    from?: Date | null;
    to?: Date | null;
    openedByAccountId?: string | null;
    limit: number;
    offset: number;
  }): Promise<CashSessionRow[]> {
    const result = await this.db.query<CashSessionRow>(
      `${cashSessionSelectSql}
       FROM v0_cash_sessions s
       WHERE s.tenant_id = $1
         AND s.branch_id = $2
         AND ($3::VARCHAR IS NULL OR s.status = $3)
         AND ($4::TIMESTAMPTZ IS NULL OR s.opened_at >= $4)
         AND ($5::TIMESTAMPTZ IS NULL OR s.opened_at <= $5)
         AND ($6::UUID IS NULL OR s.opened_by_account_id = $6)
       ORDER BY s.opened_at DESC
       LIMIT $7 OFFSET $8`,
      [
        input.tenantId,
        input.branchId,
        input.status ?? null,
        input.from ?? null,
        input.to ?? null,
        input.openedByAccountId ?? null,
        input.limit,
        input.offset,
      ]
    );
    return result.rows;
  }

  async closeSession(input: {
    tenantId: string;
    sessionId: string;
    status: Exclude<CashSessionStatus, "OPEN">;
    closeReason: CashCloseReason;
    closedByAccountId: string;
    closeNote?: string | null;
    closedAt?: Date | null;
  }): Promise<CashSessionRow | null> {
    const result = await this.db.query<CashSessionRow>(
      `UPDATE v0_cash_sessions
       SET status = $3,
           close_reason = $4,
           closed_by_account_id = $5,
           closed_at = COALESCE($6, NOW()),
           close_note = $7,
           updated_at = NOW()
       WHERE tenant_id = $1
         AND id = $2
         AND status = 'OPEN'
       RETURNING
         id,
         tenant_id,
         branch_id,
         opened_by_account_id,
         opened_at,
         status,
         opening_float_usd::FLOAT8 AS opening_float_usd,
         opening_float_khr::FLOAT8 AS opening_float_khr,
         opening_note,
         closed_by_account_id,
         closed_at,
         close_reason,
         close_note,
         created_at,
         updated_at`,
      [
        input.tenantId,
        input.sessionId,
        input.status,
        input.closeReason,
        input.closedByAccountId,
        input.closedAt ?? null,
        input.closeNote ?? null,
      ]
    );
    return result.rows[0] ?? null;
  }

  async appendMovement(input: {
    tenantId: string;
    branchId: string;
    cashSessionId: string;
    movementType: CashMovementType;
    amountUsdDelta: number;
    amountKhrDelta: number;
    reason?: string | null;
    sourceRefType: CashMovementSourceRefType;
    sourceRefId?: string | null;
    idempotencyKey: string;
    recordedByAccountId: string;
    occurredAt?: Date | null;
  }): Promise<CashMovementRow> {
    const result = await this.db.query<CashMovementRow>(
      `INSERT INTO v0_cash_movements (
         tenant_id,
         branch_id,
         cash_session_id,
         movement_type,
         amount_usd_delta,
         amount_khr_delta,
         reason,
         source_ref_type,
         source_ref_id,
         idempotency_key,
         recorded_by_account_id,
         occurred_at
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, COALESCE($12, NOW()))
       RETURNING
         id,
         tenant_id,
         branch_id,
         cash_session_id,
         movement_type,
         amount_usd_delta::FLOAT8 AS amount_usd_delta,
         amount_khr_delta::FLOAT8 AS amount_khr_delta,
         reason,
         source_ref_type,
         source_ref_id,
         idempotency_key,
         recorded_by_account_id,
         occurred_at,
         created_at`,
      [
        input.tenantId,
        input.branchId,
        input.cashSessionId,
        input.movementType,
        input.amountUsdDelta,
        input.amountKhrDelta,
        input.reason ?? null,
        input.sourceRefType,
        input.sourceRefId ?? null,
        input.idempotencyKey,
        input.recordedByAccountId,
        input.occurredAt ?? null,
      ]
    );
    return result.rows[0];
  }

  async listMovementsBySession(input: {
    tenantId: string;
    sessionId: string;
    limit: number;
    offset: number;
  }): Promise<CashMovementRow[]> {
    const result = await this.db.query<CashMovementRow>(
      `${cashMovementSelectSql}
       FROM v0_cash_movements m
       WHERE m.tenant_id = $1
         AND m.cash_session_id = $2
       ORDER BY m.occurred_at DESC, m.created_at DESC
       LIMIT $3 OFFSET $4`,
      [input.tenantId, input.sessionId, input.limit, input.offset]
    );
    return result.rows;
  }

  async listSalesBySession(input: {
    tenantId: string;
    sessionId: string;
    limit: number;
    offset: number;
  }): Promise<CashSessionSaleRow[]> {
    const result = await this.db.query<CashSessionSaleRow>(
      `WITH session_window AS (
         SELECT tenant_id, branch_id, opened_at, closed_at
         FROM v0_cash_sessions
         WHERE tenant_id = $1
           AND id = $2
         LIMIT 1
       ),
       sale_line_totals AS (
         SELECT tenant_id, sale_id, COALESCE(SUM(quantity), 0)::FLOAT8 AS total_items
         FROM v0_sale_lines
         WHERE tenant_id = $1
         GROUP BY tenant_id, sale_id
       )
       SELECT
         s.id AS sale_id,
         s.status,
         s.payment_method,
         s.sale_type,
         s.finalized_at,
         s.finalized_by_account_id,
         s.voided_at,
         s.grand_total_usd::FLOAT8 AS grand_total_usd,
         s.grand_total_khr::FLOAT8 AS grand_total_khr,
         COALESCE(t.total_items, 0)::FLOAT8 AS total_items
       FROM v0_sales s
       JOIN session_window w
         ON w.tenant_id = s.tenant_id
        AND w.branch_id = s.branch_id
       LEFT JOIN sale_line_totals t
         ON t.tenant_id = s.tenant_id
        AND t.sale_id = s.id
       WHERE s.status IN ('FINALIZED', 'VOID_PENDING', 'VOIDED')
         AND s.finalized_at IS NOT NULL
         AND s.finalized_at >= w.opened_at
         AND (w.closed_at IS NULL OR s.finalized_at <= w.closed_at)
       ORDER BY s.finalized_at DESC, s.id DESC
       LIMIT $3 OFFSET $4`,
      [input.tenantId, input.sessionId, input.limit, input.offset]
    );
    return result.rows;
  }

  async getMovementById(input: {
    tenantId: string;
    movementId: string;
  }): Promise<CashMovementRow | null> {
    const result = await this.db.query<CashMovementRow>(
      `${cashMovementSelectSql}
       FROM v0_cash_movements m
       WHERE m.tenant_id = $1
         AND m.id = $2
       LIMIT 1`,
      [input.tenantId, input.movementId]
    );
    return result.rows[0] ?? null;
  }

  async summarizeMovementTotals(input: {
    tenantId: string;
    sessionId: string;
  }): Promise<CashMovementTotalsRow> {
    const result = await this.db.query<CashMovementTotalsRow>(
      `WITH session_window AS (
         SELECT tenant_id, branch_id, opened_at, closed_at
         FROM v0_cash_sessions
         WHERE tenant_id = $1
           AND id = $2
         LIMIT 1
       )
       SELECT
         COALESCE((
           SELECT SUM(
             CASE
               WHEN s.payment_method <> 'CASH' AND s.tender_currency = 'USD'
                 THEN s.tender_amount
               ELSE 0
             END
           )
           FROM v0_sales s
           JOIN session_window w
             ON w.tenant_id = s.tenant_id
            AND w.branch_id = s.branch_id
           WHERE s.status = 'FINALIZED'
             AND s.finalized_at IS NOT NULL
             AND s.finalized_at >= w.opened_at
             AND (w.closed_at IS NULL OR s.finalized_at <= w.closed_at)
         ), 0)::FLOAT8 AS total_sales_non_cash_usd,
         COALESCE((
           SELECT SUM(
             CASE
               WHEN s.payment_method <> 'CASH' AND s.tender_currency = 'KHR'
                 THEN s.tender_amount
               ELSE 0
             END
           )
           FROM v0_sales s
           JOIN session_window w
             ON w.tenant_id = s.tenant_id
            AND w.branch_id = s.branch_id
           WHERE s.status = 'FINALIZED'
             AND s.finalized_at IS NOT NULL
             AND s.finalized_at >= w.opened_at
             AND (w.closed_at IS NULL OR s.finalized_at <= w.closed_at)
         ), 0)::FLOAT8 AS total_sales_non_cash_khr,
         COALESCE((
           SELECT SUM(
             CASE
               WHEN s.payment_method = 'KHQR' AND s.tender_currency = 'USD'
                 THEN s.tender_amount
               ELSE 0
             END
           )
           FROM v0_sales s
           JOIN session_window w
             ON w.tenant_id = s.tenant_id
            AND w.branch_id = s.branch_id
           WHERE s.status = 'FINALIZED'
             AND s.finalized_at IS NOT NULL
             AND s.finalized_at >= w.opened_at
             AND (w.closed_at IS NULL OR s.finalized_at <= w.closed_at)
         ), 0)::FLOAT8 AS total_sales_khqr_usd,
         COALESCE((
           SELECT SUM(
             CASE
               WHEN s.payment_method = 'KHQR' AND s.tender_currency = 'KHR'
                 THEN s.tender_amount
               ELSE 0
             END
           )
           FROM v0_sales s
           JOIN session_window w
             ON w.tenant_id = s.tenant_id
            AND w.branch_id = s.branch_id
           WHERE s.status = 'FINALIZED'
             AND s.finalized_at IS NOT NULL
             AND s.finalized_at >= w.opened_at
             AND (w.closed_at IS NULL OR s.finalized_at <= w.closed_at)
         ), 0)::FLOAT8 AS total_sales_khqr_khr,
         COALESCE((
           SELECT SUM(CASE WHEN movement_type = 'SALE_IN' THEN amount_usd_delta ELSE 0 END)
           FROM v0_cash_movements
           WHERE tenant_id = $1
             AND cash_session_id = $2
         ), 0)::FLOAT8 AS total_sale_in_usd,
         COALESCE((
           SELECT SUM(CASE WHEN movement_type = 'SALE_IN' THEN amount_khr_delta ELSE 0 END)
           FROM v0_cash_movements
           WHERE tenant_id = $1
             AND cash_session_id = $2
         ), 0)::FLOAT8 AS total_sale_in_khr,
         COALESCE((
           SELECT SUM(CASE WHEN movement_type = 'REFUND_CASH' THEN ABS(amount_usd_delta) ELSE 0 END)
           FROM v0_cash_movements
           WHERE tenant_id = $1
             AND cash_session_id = $2
         ), 0)::FLOAT8 AS total_refund_out_usd,
         COALESCE((
           SELECT SUM(CASE WHEN movement_type = 'REFUND_CASH' THEN ABS(amount_khr_delta) ELSE 0 END)
           FROM v0_cash_movements
           WHERE tenant_id = $1
             AND cash_session_id = $2
         ), 0)::FLOAT8 AS total_refund_out_khr,
         COALESCE((
           SELECT SUM(CASE WHEN movement_type = 'MANUAL_IN' THEN amount_usd_delta ELSE 0 END)
           FROM v0_cash_movements
           WHERE tenant_id = $1
             AND cash_session_id = $2
         ), 0)::FLOAT8 AS total_manual_in_usd,
         COALESCE((
           SELECT SUM(CASE WHEN movement_type = 'MANUAL_IN' THEN amount_khr_delta ELSE 0 END)
           FROM v0_cash_movements
           WHERE tenant_id = $1
             AND cash_session_id = $2
         ), 0)::FLOAT8 AS total_manual_in_khr,
         COALESCE((
           SELECT SUM(CASE WHEN movement_type = 'MANUAL_OUT' THEN ABS(amount_usd_delta) ELSE 0 END)
           FROM v0_cash_movements
           WHERE tenant_id = $1
             AND cash_session_id = $2
         ), 0)::FLOAT8 AS total_manual_out_usd,
         COALESCE((
           SELECT SUM(CASE WHEN movement_type = 'MANUAL_OUT' THEN ABS(amount_khr_delta) ELSE 0 END)
           FROM v0_cash_movements
           WHERE tenant_id = $1
             AND cash_session_id = $2
         ), 0)::FLOAT8 AS total_manual_out_khr,
         COALESCE((
           SELECT SUM(CASE WHEN movement_type = 'ADJUSTMENT' THEN amount_usd_delta ELSE 0 END)
           FROM v0_cash_movements
           WHERE tenant_id = $1
             AND cash_session_id = $2
         ), 0)::FLOAT8 AS total_adjustment_usd,
         COALESCE((
           SELECT SUM(CASE WHEN movement_type = 'ADJUSTMENT' THEN amount_khr_delta ELSE 0 END)
           FROM v0_cash_movements
           WHERE tenant_id = $1
             AND cash_session_id = $2
         ), 0)::FLOAT8 AS total_adjustment_khr,
         COALESCE((
           SELECT SUM(amount_usd_delta)
           FROM v0_cash_movements
           WHERE tenant_id = $1
             AND cash_session_id = $2
         ), 0)::FLOAT8 AS total_cash_delta_usd,
         COALESCE((
           SELECT SUM(amount_khr_delta)
           FROM v0_cash_movements
           WHERE tenant_id = $1
             AND cash_session_id = $2
         ), 0)::FLOAT8 AS total_cash_delta_khr`,
      [input.tenantId, input.sessionId]
    );
    return result.rows[0];
  }

  async upsertReconciliationSnapshot(input: {
    tenantId: string;
    branchId: string;
    cashSessionId: string;
    status: Exclude<CashSessionStatus, "OPEN">;
    openingFloatUsd: number;
    openingFloatKhr: number;
    totalSalesNonCashUsd: number;
    totalSalesNonCashKhr: number;
    totalSalesKhqrUsd: number;
    totalSalesKhqrKhr: number;
    totalSaleInUsd: number;
    totalSaleInKhr: number;
    totalRefundOutUsd: number;
    totalRefundOutKhr: number;
    totalManualInUsd: number;
    totalManualInKhr: number;
    totalManualOutUsd: number;
    totalManualOutKhr: number;
    totalAdjustmentUsd: number;
    totalAdjustmentKhr: number;
    expectedCashUsd: number;
    expectedCashKhr: number;
    countedCashUsd: number;
    countedCashKhr: number;
    varianceUsd: number;
    varianceKhr: number;
    closeReason: CashCloseReason;
    closedByAccountId: string;
    closedAt: Date;
  }): Promise<CashReconciliationSnapshotRow> {
    const result = await this.db.query<CashReconciliationSnapshotRow>(
      `INSERT INTO v0_cash_reconciliation_snapshots (
         tenant_id,
         branch_id,
         cash_session_id,
         status,
         opening_float_usd,
         opening_float_khr,
         total_sales_non_cash_usd,
         total_sales_non_cash_khr,
         total_sales_khqr_usd,
         total_sales_khqr_khr,
         total_sale_in_usd,
         total_sale_in_khr,
         total_refund_out_usd,
         total_refund_out_khr,
         total_manual_in_usd,
         total_manual_in_khr,
         total_manual_out_usd,
         total_manual_out_khr,
         total_adjustment_usd,
         total_adjustment_khr,
         expected_cash_usd,
         expected_cash_khr,
         counted_cash_usd,
         counted_cash_khr,
         variance_usd,
         variance_khr,
         close_reason,
         closed_by_account_id,
         closed_at
       )
       VALUES (
         $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
         $11, $12, $13, $14, $15, $16, $17, $18, $19, $20,
         $21, $22, $23, $24, $25, $26, $27, $28, $29
       )
       ON CONFLICT (tenant_id, cash_session_id)
       DO UPDATE SET
         status = EXCLUDED.status,
         opening_float_usd = EXCLUDED.opening_float_usd,
         opening_float_khr = EXCLUDED.opening_float_khr,
         total_sales_non_cash_usd = EXCLUDED.total_sales_non_cash_usd,
         total_sales_non_cash_khr = EXCLUDED.total_sales_non_cash_khr,
         total_sales_khqr_usd = EXCLUDED.total_sales_khqr_usd,
         total_sales_khqr_khr = EXCLUDED.total_sales_khqr_khr,
         total_sale_in_usd = EXCLUDED.total_sale_in_usd,
         total_sale_in_khr = EXCLUDED.total_sale_in_khr,
         total_refund_out_usd = EXCLUDED.total_refund_out_usd,
         total_refund_out_khr = EXCLUDED.total_refund_out_khr,
         total_manual_in_usd = EXCLUDED.total_manual_in_usd,
         total_manual_in_khr = EXCLUDED.total_manual_in_khr,
         total_manual_out_usd = EXCLUDED.total_manual_out_usd,
         total_manual_out_khr = EXCLUDED.total_manual_out_khr,
         total_adjustment_usd = EXCLUDED.total_adjustment_usd,
         total_adjustment_khr = EXCLUDED.total_adjustment_khr,
         expected_cash_usd = EXCLUDED.expected_cash_usd,
         expected_cash_khr = EXCLUDED.expected_cash_khr,
         counted_cash_usd = EXCLUDED.counted_cash_usd,
         counted_cash_khr = EXCLUDED.counted_cash_khr,
         variance_usd = EXCLUDED.variance_usd,
         variance_khr = EXCLUDED.variance_khr,
         close_reason = EXCLUDED.close_reason,
         closed_by_account_id = EXCLUDED.closed_by_account_id,
         closed_at = EXCLUDED.closed_at,
         updated_at = NOW()
       RETURNING
         id,
         tenant_id,
         branch_id,
         cash_session_id,
         status,
         opening_float_usd::FLOAT8 AS opening_float_usd,
         opening_float_khr::FLOAT8 AS opening_float_khr,
         total_sales_non_cash_usd::FLOAT8 AS total_sales_non_cash_usd,
         total_sales_non_cash_khr::FLOAT8 AS total_sales_non_cash_khr,
         total_sales_khqr_usd::FLOAT8 AS total_sales_khqr_usd,
         total_sales_khqr_khr::FLOAT8 AS total_sales_khqr_khr,
         total_sale_in_usd::FLOAT8 AS total_sale_in_usd,
         total_sale_in_khr::FLOAT8 AS total_sale_in_khr,
         total_refund_out_usd::FLOAT8 AS total_refund_out_usd,
         total_refund_out_khr::FLOAT8 AS total_refund_out_khr,
         total_manual_in_usd::FLOAT8 AS total_manual_in_usd,
         total_manual_in_khr::FLOAT8 AS total_manual_in_khr,
         total_manual_out_usd::FLOAT8 AS total_manual_out_usd,
         total_manual_out_khr::FLOAT8 AS total_manual_out_khr,
         total_adjustment_usd::FLOAT8 AS total_adjustment_usd,
         total_adjustment_khr::FLOAT8 AS total_adjustment_khr,
         expected_cash_usd::FLOAT8 AS expected_cash_usd,
         expected_cash_khr::FLOAT8 AS expected_cash_khr,
         counted_cash_usd::FLOAT8 AS counted_cash_usd,
         counted_cash_khr::FLOAT8 AS counted_cash_khr,
         variance_usd::FLOAT8 AS variance_usd,
         variance_khr::FLOAT8 AS variance_khr,
         close_reason,
         closed_by_account_id,
         closed_at,
         created_at,
         updated_at`,
      [
        input.tenantId,
        input.branchId,
        input.cashSessionId,
        input.status,
        input.openingFloatUsd,
        input.openingFloatKhr,
        input.totalSalesNonCashUsd,
        input.totalSalesNonCashKhr,
        input.totalSalesKhqrUsd,
        input.totalSalesKhqrKhr,
        input.totalSaleInUsd,
        input.totalSaleInKhr,
        input.totalRefundOutUsd,
        input.totalRefundOutKhr,
        input.totalManualInUsd,
        input.totalManualInKhr,
        input.totalManualOutUsd,
        input.totalManualOutKhr,
        input.totalAdjustmentUsd,
        input.totalAdjustmentKhr,
        input.expectedCashUsd,
        input.expectedCashKhr,
        input.countedCashUsd,
        input.countedCashKhr,
        input.varianceUsd,
        input.varianceKhr,
        input.closeReason,
        input.closedByAccountId,
        input.closedAt,
      ]
    );
    return result.rows[0];
  }

  async getReconciliationSnapshotBySession(input: {
    tenantId: string;
    cashSessionId: string;
  }): Promise<CashReconciliationSnapshotRow | null> {
    const result = await this.db.query<CashReconciliationSnapshotRow>(
      `${cashReconciliationSnapshotSelectSql}
       FROM v0_cash_reconciliation_snapshots s
       WHERE s.tenant_id = $1
         AND s.cash_session_id = $2
       LIMIT 1`,
      [input.tenantId, input.cashSessionId]
    );
    return result.rows[0] ?? null;
  }

  async branchExistsAndActive(input: {
    tenantId: string;
    branchId: string;
  }): Promise<boolean> {
    const result = await this.db.query<{ exists: boolean }>(
      `SELECT EXISTS(
         SELECT 1
         FROM branches
         WHERE tenant_id = $1
           AND id = $2
           AND status = 'ACTIVE'
       ) AS exists`,
      [input.tenantId, input.branchId]
    );
    return result.rows[0]?.exists ?? false;
  }

  async getActorRoleInTenant(input: {
    tenantId: string;
    accountId: string;
  }): Promise<string | null> {
    const result = await this.db.query<{ role_key: string }>(
      `SELECT role_key
       FROM v0_tenant_memberships
       WHERE tenant_id = $1
         AND account_id = $2
         AND status = 'ACTIVE'
       LIMIT 1`,
      [input.tenantId, input.accountId]
    );
    return result.rows[0]?.role_key ?? null;
  }

  async listAccountDisplayNames(input: {
    accountIds: readonly string[];
  }): Promise<Map<string, string>> {
    if (input.accountIds.length === 0) {
      return new Map();
    }
    const result = await this.db.query<{
      id: string;
      first_name: string | null;
      last_name: string | null;
    }>(
      `SELECT id, first_name, last_name
       FROM accounts
       WHERE id = ANY($1::UUID[])`,
      [input.accountIds]
    );
    const map = new Map<string, string>();
    for (const row of result.rows) {
      const first = String(row.first_name ?? "").trim();
      const last = String(row.last_name ?? "").trim();
      const display = [first, last].filter(Boolean).join(" ").trim();
      map.set(row.id, display || row.id);
    }
    return map;
  }
}

const cashSessionSelectSql = `
SELECT
  s.id,
  s.tenant_id,
  s.branch_id,
  s.opened_by_account_id,
  s.opened_at,
  s.status,
  s.opening_float_usd::FLOAT8 AS opening_float_usd,
  s.opening_float_khr::FLOAT8 AS opening_float_khr,
  s.opening_note,
  s.closed_by_account_id,
  s.closed_at,
  s.close_reason,
  s.close_note,
  s.created_at,
  s.updated_at
`;

const cashMovementSelectSql = `
SELECT
  m.id,
  m.tenant_id,
  m.branch_id,
  m.cash_session_id,
  m.movement_type,
  m.amount_usd_delta::FLOAT8 AS amount_usd_delta,
  m.amount_khr_delta::FLOAT8 AS amount_khr_delta,
  m.reason,
  m.source_ref_type,
  m.source_ref_id,
  m.idempotency_key,
  m.recorded_by_account_id,
  m.occurred_at,
  m.created_at
`;

const cashReconciliationSnapshotSelectSql = `
SELECT
  s.id,
  s.tenant_id,
  s.branch_id,
  s.cash_session_id,
  s.status,
  s.opening_float_usd::FLOAT8 AS opening_float_usd,
  s.opening_float_khr::FLOAT8 AS opening_float_khr,
  s.total_sales_non_cash_usd::FLOAT8 AS total_sales_non_cash_usd,
  s.total_sales_non_cash_khr::FLOAT8 AS total_sales_non_cash_khr,
  s.total_sales_khqr_usd::FLOAT8 AS total_sales_khqr_usd,
  s.total_sales_khqr_khr::FLOAT8 AS total_sales_khqr_khr,
  s.total_sale_in_usd::FLOAT8 AS total_sale_in_usd,
  s.total_sale_in_khr::FLOAT8 AS total_sale_in_khr,
  s.total_refund_out_usd::FLOAT8 AS total_refund_out_usd,
  s.total_refund_out_khr::FLOAT8 AS total_refund_out_khr,
  s.total_manual_in_usd::FLOAT8 AS total_manual_in_usd,
  s.total_manual_in_khr::FLOAT8 AS total_manual_in_khr,
  s.total_manual_out_usd::FLOAT8 AS total_manual_out_usd,
  s.total_manual_out_khr::FLOAT8 AS total_manual_out_khr,
  s.total_adjustment_usd::FLOAT8 AS total_adjustment_usd,
  s.total_adjustment_khr::FLOAT8 AS total_adjustment_khr,
  s.expected_cash_usd::FLOAT8 AS expected_cash_usd,
  s.expected_cash_khr::FLOAT8 AS expected_cash_khr,
  s.counted_cash_usd::FLOAT8 AS counted_cash_usd,
  s.counted_cash_khr::FLOAT8 AS counted_cash_khr,
  s.variance_usd::FLOAT8 AS variance_usd,
  s.variance_khr::FLOAT8 AS variance_khr,
  s.close_reason,
  s.closed_by_account_id,
  s.closed_at,
  s.created_at,
  s.updated_at
`;
