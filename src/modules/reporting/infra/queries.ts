import type { Pool } from "pg";
import type {
  CashSessionReportDetail,
  CashSessionReportListItem,
  CashSessionStatusFilter,
  ZReportSummary,
} from "../domain/read-models.js";

export interface ReportingRepository {
  listCashSessionReports(params: {
    tenantId: string;
    branchId: string;
    openedById?: string;
    status: CashSessionStatusFilter;
    from?: Date;
    to?: Date;
  }): Promise<CashSessionReportListItem[]>;
  getCashSessionReportDetail(params: {
    tenantId: string;
    branchId: string;
    sessionId: string;
  }): Promise<CashSessionReportDetail | null>;
  getZReportSummary(params: {
    tenantId: string;
    branchId: string;
    date: string;
  }): Promise<ZReportSummary>;
}

export class PgReportingRepository implements ReportingRepository {
  constructor(private pool: Pool) {}

  async listCashSessionReports(params: {
    tenantId: string;
    branchId: string;
    openedById?: string;
    status: CashSessionStatusFilter;
    from?: Date;
    to?: Date;
  }): Promise<CashSessionReportListItem[]> {
    const values: Array<string | Date> = [params.tenantId, params.branchId];
    const whereClauses = ["cs.tenant_id = $1", "cs.branch_id = $2"];
    let paramIndex = 3;

    if (params.openedById) {
      whereClauses.push(`cs.opened_by = $${paramIndex}`);
      values.push(params.openedById);
      paramIndex += 1;
    }

    if (params.from) {
      whereClauses.push(`cs.opened_at >= $${paramIndex}`);
      values.push(params.from);
      paramIndex += 1;
    }

    if (params.to) {
      whereClauses.push(`cs.opened_at <= $${paramIndex}`);
      values.push(params.to);
      paramIndex += 1;
    }

    if (params.status === "OPEN") {
      whereClauses.push("cs.status = 'OPEN'");
    } else if (params.status === "CLOSED") {
      whereClauses.push("cs.status <> 'OPEN'");
    }

    const query = `
      SELECT
        cs.id,
        cs.status,
        cs.opened_at,
        cs.closed_at,
        cs.opened_by,
        COALESCE(e.display_name, CONCAT(e.first_name, ' ', e.last_name)) AS opened_by_name
      FROM cash_sessions cs
      JOIN employees e ON e.id = cs.opened_by
      WHERE ${whereClauses.join(" AND ")}
      ORDER BY cs.opened_at DESC
    `;

    const result = await this.pool.query(query, values);
    return result.rows.map((row) => ({
      id: row.id,
      status: row.status,
      openedAt: new Date(row.opened_at),
      closedAt: row.closed_at ? new Date(row.closed_at) : null,
      openedById: row.opened_by,
      openedByName: row.opened_by_name,
    }));
  }

  async getCashSessionReportDetail(params: {
    tenantId: string;
    branchId: string;
    sessionId: string;
  }): Promise<CashSessionReportDetail | null> {
    const query = `
      SELECT
        cs.id,
        cs.status,
        cs.opened_at,
        cs.closed_at,
        cs.opened_by,
        COALESCE(e.display_name, CONCAT(e.first_name, ' ', e.last_name)) AS opened_by_name,
        cs.opening_float_usd,
        cs.opening_float_khr,
        cs.expected_cash_usd,
        cs.expected_cash_khr,
        cs.counted_cash_usd,
        cs.counted_cash_khr,
        cs.variance_usd,
        cs.variance_khr,
        COALESCE(SUM(CASE WHEN cm.status = 'APPROVED' AND cm.type = 'SALE_CASH' THEN cm.amount_usd ELSE 0 END), 0) AS total_sales_cash_usd,
        COALESCE(SUM(CASE WHEN cm.status = 'APPROVED' AND cm.type = 'SALE_CASH' THEN cm.amount_khr ELSE 0 END), 0) AS total_sales_cash_khr,
        COALESCE(SUM(CASE WHEN cm.status = 'APPROVED' AND cm.type = 'PAID_IN' THEN cm.amount_usd ELSE 0 END), 0) AS total_paid_in_usd,
        COALESCE(SUM(CASE WHEN cm.status = 'APPROVED' AND cm.type = 'PAID_IN' THEN cm.amount_khr ELSE 0 END), 0) AS total_paid_in_khr,
        COALESCE(SUM(CASE WHEN cm.status = 'APPROVED' AND cm.type = 'PAID_OUT' THEN cm.amount_usd ELSE 0 END), 0) AS total_paid_out_usd,
        COALESCE(SUM(CASE WHEN cm.status = 'APPROVED' AND cm.type = 'PAID_OUT' THEN cm.amount_khr ELSE 0 END), 0) AS total_paid_out_khr
      FROM cash_sessions cs
      JOIN employees e ON e.id = cs.opened_by
      LEFT JOIN cash_movements cm ON cm.session_id = cs.id
      WHERE cs.id = $1 AND cs.tenant_id = $2 AND cs.branch_id = $3
      GROUP BY cs.id, e.display_name, e.first_name, e.last_name
    `;

    const result = await this.pool.query(query, [
      params.sessionId,
      params.tenantId,
      params.branchId,
    ]);

    if (result.rows.length === 0) {
      return null;
    }

    const row = result.rows[0];
    return {
      id: row.id,
      status: row.status,
      openedAt: new Date(row.opened_at),
      closedAt: row.closed_at ? new Date(row.closed_at) : null,
      openedById: row.opened_by,
      openedByName: row.opened_by_name,
      openingFloatUsd: Number(row.opening_float_usd),
      openingFloatKhr: Number(row.opening_float_khr),
      totalSalesCashUsd: Number(row.total_sales_cash_usd),
      totalSalesCashKhr: Number(row.total_sales_cash_khr),
      totalPaidInUsd: Number(row.total_paid_in_usd),
      totalPaidInKhr: Number(row.total_paid_in_khr),
      totalPaidOutUsd: Number(row.total_paid_out_usd),
      totalPaidOutKhr: Number(row.total_paid_out_khr),
      expectedCashUsd: Number(row.expected_cash_usd),
      expectedCashKhr: Number(row.expected_cash_khr),
      countedCashUsd: Number(row.counted_cash_usd),
      countedCashKhr: Number(row.counted_cash_khr),
      varianceUsd: Number(row.variance_usd),
      varianceKhr: Number(row.variance_khr),
    };
  }

  async getZReportSummary(params: {
    tenantId: string;
    branchId: string;
    date: string;
  }): Promise<ZReportSummary> {
    const query = `
      WITH sessions AS (
        SELECT
          id,
          opening_float_usd,
          opening_float_khr,
          expected_cash_usd,
          expected_cash_khr
        FROM cash_sessions
        WHERE tenant_id = $1
          AND branch_id = $2
          AND opened_at::date = $3::date
      )
      SELECT
        $3::text AS report_date,
        (SELECT COUNT(*) FROM sessions) AS session_count,
        (SELECT COALESCE(SUM(opening_float_usd), 0) FROM sessions) AS opening_float_usd,
        (SELECT COALESCE(SUM(opening_float_khr), 0) FROM sessions) AS opening_float_khr,
        (SELECT COALESCE(SUM(expected_cash_usd), 0) FROM sessions) AS expected_cash_usd,
        (SELECT COALESCE(SUM(expected_cash_khr), 0) FROM sessions) AS expected_cash_khr,
        (SELECT COALESCE(SUM(cm.amount_usd), 0)
           FROM cash_movements cm
           JOIN sessions s ON s.id = cm.session_id
           WHERE cm.status = 'APPROVED' AND cm.type = 'SALE_CASH') AS total_sales_cash_usd,
        (SELECT COALESCE(SUM(cm.amount_khr), 0)
           FROM cash_movements cm
           JOIN sessions s ON s.id = cm.session_id
           WHERE cm.status = 'APPROVED' AND cm.type = 'SALE_CASH') AS total_sales_cash_khr,
        (SELECT COALESCE(SUM(cm.amount_usd), 0)
           FROM cash_movements cm
           JOIN sessions s ON s.id = cm.session_id
           WHERE cm.status = 'APPROVED' AND cm.type = 'PAID_IN') AS total_paid_in_usd,
        (SELECT COALESCE(SUM(cm.amount_khr), 0)
           FROM cash_movements cm
           JOIN sessions s ON s.id = cm.session_id
           WHERE cm.status = 'APPROVED' AND cm.type = 'PAID_IN') AS total_paid_in_khr,
        (SELECT COALESCE(SUM(cm.amount_usd), 0)
           FROM cash_movements cm
           JOIN sessions s ON s.id = cm.session_id
           WHERE cm.status = 'APPROVED' AND cm.type = 'PAID_OUT') AS total_paid_out_usd,
        (SELECT COALESCE(SUM(cm.amount_khr), 0)
           FROM cash_movements cm
           JOIN sessions s ON s.id = cm.session_id
           WHERE cm.status = 'APPROVED' AND cm.type = 'PAID_OUT') AS total_paid_out_khr
    `;

    const result = await this.pool.query(query, [
      params.tenantId,
      params.branchId,
      params.date,
    ]);

    const row = result.rows[0];
    return {
      date: row.report_date,
      sessionCount: Number(row.session_count),
      openingFloatUsd: Number(row.opening_float_usd),
      openingFloatKhr: Number(row.opening_float_khr),
      totalSalesCashUsd: Number(row.total_sales_cash_usd),
      totalSalesCashKhr: Number(row.total_sales_cash_khr),
      totalPaidInUsd: Number(row.total_paid_in_usd),
      totalPaidInKhr: Number(row.total_paid_in_khr),
      totalPaidOutUsd: Number(row.total_paid_out_usd),
      totalPaidOutKhr: Number(row.total_paid_out_khr),
      expectedCashUsd: Number(row.expected_cash_usd),
      expectedCashKhr: Number(row.expected_cash_khr),
    };
  }
}
