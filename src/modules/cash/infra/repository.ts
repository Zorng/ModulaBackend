// Cash repository implementations

import type { Pool, PoolClient } from "pg";
import type {
  CashRegisterRepository as ICashRegisterRepository,
  CashSessionRepository as ICashSessionRepository,
  CashMovementRepository as ICashMovementRepository,
} from "../domain/repositories.js";
import {
  CashRegister,
  CashSession,
  CashMovement,
  CashRegisterStatus,
  CashSessionStatus,
  CashMovementType,
  CashMovementStatus,
} from "../domain/entities.js";

type Queryable = {
  query: (text: string, params?: any[]) => Promise<any>;
};

export class CashRegisterRepository implements ICashRegisterRepository {
  private pool: Pool;

  constructor(pool: Pool) {
    this.pool = pool;
  }

  async findById(id: string, client?: PoolClient): Promise<CashRegister | null> {
    const db: Queryable = client ?? this.pool;
    const res = await db.query(
      "SELECT * FROM cash_registers WHERE id = $1",
      [id]
    );
    if (res.rows.length === 0) return null;
    return this.toEntity(res.rows[0]);
  }

  async findByTenant(tenantId: string, client?: PoolClient): Promise<CashRegister[]> {
    const db: Queryable = client ?? this.pool;
    const res = await db.query(
      "SELECT * FROM cash_registers WHERE tenant_id = $1 ORDER BY name ASC",
      [tenantId]
    );
    return res.rows.map(this.toEntity);
  }

  async findByBranch(branchId: string, client?: PoolClient): Promise<CashRegister[]> {
    const db: Queryable = client ?? this.pool;
    const res = await db.query(
      "SELECT * FROM cash_registers WHERE branch_id = $1 ORDER BY name ASC",
      [branchId]
    );
    return res.rows.map(this.toEntity);
  }

  async findByBranchAndName(
    branchId: string,
    name: string,
    client?: PoolClient
  ): Promise<CashRegister | null> {
    const db: Queryable = client ?? this.pool;
    const res = await db.query(
      "SELECT * FROM cash_registers WHERE branch_id = $1 AND LOWER(name) = LOWER($2)",
      [branchId, name]
    );
    if (res.rows.length === 0) return null;
    return this.toEntity(res.rows[0]);
  }

  async findByTenantAndBranch(
    tenantId: string,
    branchId: string,
    client?: PoolClient
  ): Promise<CashRegister[]> {
    const db: Queryable = client ?? this.pool;
    const res = await db.query(
      "SELECT * FROM cash_registers WHERE tenant_id = $1 AND branch_id = $2 ORDER BY name ASC",
      [tenantId, branchId]
    );
    return res.rows.map(this.toEntity);
  }

  async findByTenantAndStatus(
    tenantId: string,
    status: CashRegisterStatus,
    client?: PoolClient
  ): Promise<CashRegister[]> {
    const db: Queryable = client ?? this.pool;
    const res = await db.query(
      "SELECT * FROM cash_registers WHERE tenant_id = $1 AND status = $2 ORDER BY name ASC",
      [tenantId, status]
    );
    return res.rows.map(this.toEntity);
  }

  async save(
    register: Omit<CashRegister, "id" | "createdAt" | "updatedAt">,
    client?: PoolClient
  ): Promise<CashRegister> {
    const db: Queryable = client ?? this.pool;
    const res = await db.query(
      `INSERT INTO cash_registers (
        tenant_id, branch_id, name, status
      ) VALUES ($1, $2, $3, $4) RETURNING *`,
      [register.tenantId, register.branchId, register.name, register.status]
    );
    return this.toEntity(res.rows[0]);
  }

  async update(
    id: string,
    updates: Partial<Omit<CashRegister, "id" | "tenantId" | "createdAt">>,
    client?: PoolClient
  ): Promise<CashRegister | null> {
    const fields = Object.keys(updates);
    if (fields.length === 0) return this.findById(id, client);

    const fieldMap: Record<string, string> = {
      branchId: "branch_id",
      name: "name",
      status: "status",
    };

    const setClauses: string[] = [];
    const values: any[] = [];
    let paramIndex = 2;

    for (const field of fields) {
      const dbColumn = fieldMap[field];
      if (dbColumn) {
        setClauses.push(`${dbColumn} = $${paramIndex}`);
        values.push((updates as any)[field]);
        paramIndex++;
      }
    }

    if (setClauses.length === 0) return this.findById(id, client);

    const query = `UPDATE cash_registers SET ${setClauses.join(
      ", "
    )}, updated_at = NOW() WHERE id = $1 RETURNING *`;
    const db: Queryable = client ?? this.pool;
    const res = await db.query(query, [id, ...values]);
    if (res.rows.length === 0) return null;
    return this.toEntity(res.rows[0]);
  }

  async delete(id: string, client?: PoolClient): Promise<void> {
    const db: Queryable = client ?? this.pool;
    await db.query("DELETE FROM cash_registers WHERE id = $1", [id]);
  }

  private toEntity(row: any): CashRegister {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      branchId: row.branch_id,
      name: row.name,
      status: row.status as CashRegisterStatus,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    };
  }
}

export class CashSessionRepository implements ICashSessionRepository {
  private pool: Pool;

  constructor(pool: Pool) {
    this.pool = pool;
  }

  async findById(id: string, client?: PoolClient): Promise<CashSession | null> {
    const db: Queryable = client ?? this.pool;
    const res = await db.query(
      "SELECT * FROM cash_sessions WHERE id = $1",
      [id]
    );
    if (res.rows.length === 0) return null;
    return this.toEntity(res.rows[0]);
  }

  async findByTenant(tenantId: string, client?: PoolClient): Promise<CashSession[]> {
    const db: Queryable = client ?? this.pool;
    const res = await db.query(
      "SELECT * FROM cash_sessions WHERE tenant_id = $1 ORDER BY opened_at DESC",
      [tenantId]
    );
    return res.rows.map(this.toEntity);
  }

  async findByBranch(branchId: string, client?: PoolClient): Promise<CashSession[]> {
    const db: Queryable = client ?? this.pool;
    const res = await db.query(
      "SELECT * FROM cash_sessions WHERE branch_id = $1 ORDER BY opened_at DESC",
      [branchId]
    );
    return res.rows.map(this.toEntity);
  }

  async findByRegister(registerId: string, client?: PoolClient): Promise<CashSession[]> {
    const db: Queryable = client ?? this.pool;
    const res = await db.query(
      "SELECT * FROM cash_sessions WHERE register_id = $1 ORDER BY opened_at DESC",
      [registerId]
    );
    return res.rows.map(this.toEntity);
  }

  async findOpenByRegister(registerId: string, client?: PoolClient): Promise<CashSession | null> {
    const db: Queryable = client ?? this.pool;
    const res = await db.query(
      "SELECT * FROM cash_sessions WHERE register_id = $1 AND status = 'OPEN'",
      [registerId]
    );
    if (res.rows.length === 0) return null;
    return this.toEntity(res.rows[0]);
  }

  async findOpenByUserRegister(
    tenantId: string,
    registerId: string,
    openedBy: string,
    client?: PoolClient
  ): Promise<CashSession | null> {
    const db: Queryable = client ?? this.pool;
    const res = await db.query(
      "SELECT * FROM cash_sessions WHERE tenant_id = $1 AND register_id = $2 AND opened_by = $3 AND status = 'OPEN' ORDER BY opened_at DESC LIMIT 1",
      [tenantId, registerId, openedBy]
    );
    if (res.rows.length === 0) return null;
    return this.toEntity(res.rows[0]);
  }

  async findOpenByBranch(
    tenantId: string,
    branchId: string,
    client?: PoolClient
  ): Promise<CashSession | null> {
    const db: Queryable = client ?? this.pool;
    const res = await db.query(
      "SELECT * FROM cash_sessions WHERE tenant_id = $1 AND branch_id = $2 AND status = 'OPEN' AND register_id IS NULL ORDER BY opened_at DESC LIMIT 1",
      [tenantId, branchId]
    );
    if (res.rows.length === 0) return null;
    return this.toEntity(res.rows[0]);
  }

  async findOpenByUserBranch(
    tenantId: string,
    branchId: string,
    openedBy: string,
    client?: PoolClient
  ): Promise<CashSession | null> {
    const db: Queryable = client ?? this.pool;
    const res = await db.query(
      "SELECT * FROM cash_sessions WHERE tenant_id = $1 AND branch_id = $2 AND opened_by = $3 AND status = 'OPEN' ORDER BY opened_at DESC LIMIT 1",
      [tenantId, branchId, openedBy]
    );
    if (res.rows.length === 0) return null;
    return this.toEntity(res.rows[0]);
  }

  async findByTenantAndBranch(
    tenantId: string,
    branchId: string,
    client?: PoolClient
  ): Promise<CashSession[]> {
    const db: Queryable = client ?? this.pool;
    const res = await db.query(
      "SELECT * FROM cash_sessions WHERE tenant_id = $1 AND branch_id = $2 ORDER BY opened_at DESC",
      [tenantId, branchId]
    );
    return res.rows.map(this.toEntity);
  }

  async findByStatus(status: CashSessionStatus, client?: PoolClient): Promise<CashSession[]> {
    const db: Queryable = client ?? this.pool;
    const res = await db.query(
      "SELECT * FROM cash_sessions WHERE status = $1 ORDER BY opened_at DESC",
      [status]
    );
    return res.rows.map(this.toEntity);
  }

  async findByDateRange(fromDate: Date, toDate: Date, client?: PoolClient): Promise<CashSession[]> {
    const db: Queryable = client ?? this.pool;
    const res = await db.query(
      "SELECT * FROM cash_sessions WHERE opened_at >= $1 AND opened_at <= $2 ORDER BY opened_at DESC",
      [fromDate, toDate]
    );
    return res.rows.map(this.toEntity);
  }

  async save(
    session: Omit<CashSession, "id" | "createdAt" | "updatedAt">,
    client?: PoolClient
  ): Promise<CashSession> {
    const db: Queryable = client ?? this.pool;
    const res = await db.query(
      `INSERT INTO cash_sessions (
        tenant_id, branch_id, register_id, opened_by, opened_at,
        opening_float_usd, opening_float_khr, status, closed_by, closed_at,
        expected_cash_usd, expected_cash_khr, counted_cash_usd, counted_cash_khr,
        variance_usd, variance_khr, note
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17) RETURNING *`,
      [
        session.tenantId,
        session.branchId,
        session.registerId,
        session.openedBy,
        session.openedAt,
        session.openingFloatUsd,
        session.openingFloatKhr,
        session.status,
        session.closedBy || null,
        session.closedAt || null,
        session.expectedCashUsd,
        session.expectedCashKhr,
        session.countedCashUsd,
        session.countedCashKhr,
        session.varianceUsd,
        session.varianceKhr,
        session.note || null,
      ]
    );
    return this.toEntity(res.rows[0]);
  }

  async update(
    id: string,
    updates: Partial<Omit<CashSession, "id" | "tenantId" | "createdAt">>,
    client?: PoolClient
  ): Promise<CashSession | null> {
    const fields = Object.keys(updates);
    if (fields.length === 0) return this.findById(id, client);

    const fieldMap: Record<string, string> = {
      branchId: "branch_id",
      registerId: "register_id",
      openedBy: "opened_by",
      openedAt: "opened_at",
      openingFloatUsd: "opening_float_usd",
      openingFloatKhr: "opening_float_khr",
      status: "status",
      closedBy: "closed_by",
      closedAt: "closed_at",
      expectedCashUsd: "expected_cash_usd",
      expectedCashKhr: "expected_cash_khr",
      countedCashUsd: "counted_cash_usd",
      countedCashKhr: "counted_cash_khr",
      varianceUsd: "variance_usd",
      varianceKhr: "variance_khr",
      note: "note",
    };

    const setClauses: string[] = [];
    const values: any[] = [];
    let paramIndex = 2;

    for (const field of fields) {
      const dbColumn = fieldMap[field];
      if (dbColumn) {
        setClauses.push(`${dbColumn} = $${paramIndex}`);
        values.push((updates as any)[field]);
        paramIndex++;
      }
    }

    if (setClauses.length === 0) return this.findById(id, client);

    const query = `UPDATE cash_sessions SET ${setClauses.join(
      ", "
    )}, updated_at = NOW() WHERE id = $1 RETURNING *`;
    const db: Queryable = client ?? this.pool;
    const res = await db.query(query, [id, ...values]);
    if (res.rows.length === 0) return null;
    return this.toEntity(res.rows[0]);
  }

  async getSessionSummary(sessionId: string, client?: PoolClient): Promise<{
    session: CashSession;
    totalMovements: number;
    totalCashIn: number;
    totalCashOut: number;
  } | null> {
    const db: Queryable = client ?? this.pool;
    const session = await this.findById(sessionId, client);
    if (!session) return null;

    const res = await db.query(
      `SELECT
        COUNT(*) as total_movements,
        COALESCE(SUM(CASE WHEN type IN ('SALE_CASH', 'PAID_IN') THEN amount_usd ELSE 0 END), 0) as total_cash_in_usd,
        COALESCE(SUM(CASE WHEN type IN ('REFUND_CASH', 'PAID_OUT') THEN amount_usd ELSE 0 END), 0) as total_cash_out_usd
      FROM cash_movements WHERE session_id = $1`,
      [sessionId]
    );

    const row = res.rows[0];
    return {
      session,
      totalMovements: parseInt(row.total_movements),
      totalCashIn: parseFloat(row.total_cash_in_usd),
      totalCashOut: parseFloat(row.total_cash_out_usd),
    };
  }

  private toEntity(row: any): CashSession {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      branchId: row.branch_id,
      registerId: row.register_id,
      openedBy: row.opened_by,
      openedAt: new Date(row.opened_at),
      openingFloatUsd: parseFloat(row.opening_float_usd),
      openingFloatKhr: parseFloat(row.opening_float_khr),
      status: row.status as CashSessionStatus,
      closedBy: row.closed_by,
      closedAt: row.closed_at ? new Date(row.closed_at) : undefined,
      expectedCashUsd: parseFloat(row.expected_cash_usd),
      expectedCashKhr: parseFloat(row.expected_cash_khr),
      countedCashUsd: parseFloat(row.counted_cash_usd),
      countedCashKhr: parseFloat(row.counted_cash_khr),
      varianceUsd: parseFloat(row.variance_usd),
      varianceKhr: parseFloat(row.variance_khr),
      note: row.note,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    };
  }
}

export class CashMovementRepository implements ICashMovementRepository {
  private pool: Pool;

  constructor(pool: Pool) {
    this.pool = pool;
  }

  async findById(id: string, client?: PoolClient): Promise<CashMovement | null> {
    const db: Queryable = client ?? this.pool;
    const res = await db.query(
      "SELECT * FROM cash_movements WHERE id = $1",
      [id]
    );
    if (res.rows.length === 0) return null;
    return this.toEntity(res.rows[0]);
  }

  async findBySession(sessionId: string, client?: PoolClient): Promise<CashMovement[]> {
    const db: Queryable = client ?? this.pool;
    const res = await db.query(
      "SELECT * FROM cash_movements WHERE session_id = $1 ORDER BY created_at ASC",
      [sessionId]
    );
    return res.rows.map(this.toEntity);
  }

  async findByRegister(registerId: string, client?: PoolClient): Promise<CashMovement[]> {
    const db: Queryable = client ?? this.pool;
    const res = await db.query(
      "SELECT * FROM cash_movements WHERE register_id = $1 ORDER BY created_at DESC",
      [registerId]
    );
    return res.rows.map(this.toEntity);
  }

  async findByTenant(tenantId: string, client?: PoolClient): Promise<CashMovement[]> {
    const db: Queryable = client ?? this.pool;
    const res = await db.query(
      "SELECT * FROM cash_movements WHERE tenant_id = $1 ORDER BY created_at DESC",
      [tenantId]
    );
    return res.rows.map(this.toEntity);
  }

  async findByBranch(branchId: string, client?: PoolClient): Promise<CashMovement[]> {
    const db: Queryable = client ?? this.pool;
    const res = await db.query(
      "SELECT * FROM cash_movements WHERE branch_id = $1 ORDER BY created_at DESC",
      [branchId]
    );
    return res.rows.map(this.toEntity);
  }

  async findByType(type: CashMovementType, client?: PoolClient): Promise<CashMovement[]> {
    const db: Queryable = client ?? this.pool;
    const res = await db.query(
      "SELECT * FROM cash_movements WHERE type = $1 ORDER BY created_at DESC",
      [type]
    );
    return res.rows.map(this.toEntity);
  }

  async findByStatus(status: CashMovementStatus, client?: PoolClient): Promise<CashMovement[]> {
    const db: Queryable = client ?? this.pool;
    const res = await db.query(
      "SELECT * FROM cash_movements WHERE status = $1 ORDER BY created_at DESC",
      [status]
    );
    return res.rows.map(this.toEntity);
  }

  async findByActor(actorId: string, client?: PoolClient): Promise<CashMovement[]> {
    const db: Queryable = client ?? this.pool;
    const res = await db.query(
      "SELECT * FROM cash_movements WHERE actor_id = $1 ORDER BY created_at DESC",
      [actorId]
    );
    return res.rows.map(this.toEntity);
  }

  async findBySale(refSaleId: string, client?: PoolClient): Promise<CashMovement[]> {
    const db: Queryable = client ?? this.pool;
    const res = await db.query(
      "SELECT * FROM cash_movements WHERE ref_sale_id = $1 ORDER BY created_at DESC",
      [refSaleId]
    );
    return res.rows.map(this.toEntity);
  }

  async findByDateRange(fromDate: Date, toDate: Date, client?: PoolClient): Promise<CashMovement[]> {
    const db: Queryable = client ?? this.pool;
    const res = await db.query(
      "SELECT * FROM cash_movements WHERE created_at >= $1 AND created_at <= $2 ORDER BY created_at DESC",
      [fromDate, toDate]
    );
    return res.rows.map(this.toEntity);
  }

  async findPendingApprovals(client?: PoolClient): Promise<CashMovement[]> {
    const db: Queryable = client ?? this.pool;
    const res = await db.query(
      "SELECT * FROM cash_movements WHERE status = 'PENDING' ORDER BY created_at ASC",
      []
    );
    return res.rows.map(this.toEntity);
  }

  async save(
    movement: Omit<CashMovement, "id" | "createdAt">,
    client?: PoolClient
  ): Promise<CashMovement> {
    const db: Queryable = client ?? this.pool;
    const res = await db.query(
      `INSERT INTO cash_movements (
        tenant_id, branch_id, register_id, session_id, actor_id,
        type, status, amount_usd, amount_khr, ref_sale_id, reason
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING *`,
      [
        movement.tenantId,
        movement.branchId,
        movement.registerId,
        movement.sessionId,
        movement.actorId,
        movement.type,
        movement.status,
        movement.amountUsd,
        movement.amountKhr,
        movement.refSaleId || null,
        movement.reason || null,
      ]
    );
    return this.toEntity(res.rows[0]);
  }

  async update(
    id: string,
    updates: Partial<Omit<CashMovement, "id" | "tenantId" | "createdAt">>,
    client?: PoolClient
  ): Promise<CashMovement | null> {
    const fields = Object.keys(updates);
    if (fields.length === 0) return this.findById(id, client);

    const fieldMap: Record<string, string> = {
      branchId: "branch_id",
      registerId: "register_id",
      sessionId: "session_id",
      actorId: "actor_id",
      type: "type",
      status: "status",
      amountUsd: "amount_usd",
      amountKhr: "amount_khr",
      refSaleId: "ref_sale_id",
      reason: "reason",
    };

    const setClauses: string[] = [];
    const values: any[] = [];
    let paramIndex = 2;

    for (const field of fields) {
      const dbColumn = fieldMap[field];
      if (dbColumn) {
        setClauses.push(`${dbColumn} = $${paramIndex}`);
        values.push((updates as any)[field]);
        paramIndex++;
      }
    }

    if (setClauses.length === 0) return this.findById(id, client);

    const query = `UPDATE cash_movements SET ${setClauses.join(
      ", "
    )} WHERE id = $1 RETURNING *`;
    const db: Queryable = client ?? this.pool;
    const res = await db.query(query, [id, ...values]);
    if (res.rows.length === 0) return null;
    return this.toEntity(res.rows[0]);
  }

  async getDailyMovements(
    tenantId: string,
    branchId: string,
    date: Date,
    client?: PoolClient
  ): Promise<CashMovement[]> {
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);

    const db: Queryable = client ?? this.pool;
    const res = await db.query(
      "SELECT * FROM cash_movements WHERE tenant_id = $1 AND branch_id = $2 AND created_at >= $3 AND created_at <= $4 ORDER BY created_at ASC",
      [tenantId, branchId, startOfDay, endOfDay]
    );
    return res.rows.map(this.toEntity);
  }

  async getMovementSummary(sessionId: string, client?: PoolClient): Promise<{
    totalPaidIn: number;
    totalPaidOut: number;
    totalRefunds: number;
    totalAdjustments: number;
    netCashFlow: number;
  }> {
    const db: Queryable = client ?? this.pool;
    const res = await db.query(
      `SELECT
        COALESCE(SUM(CASE WHEN type = 'PAID_IN' THEN amount_usd ELSE 0 END), 0) as total_paid_in,
        COALESCE(SUM(CASE WHEN type = 'PAID_OUT' THEN amount_usd ELSE 0 END), 0) as total_paid_out,
        COALESCE(SUM(CASE WHEN type = 'REFUND_CASH' THEN amount_usd ELSE 0 END), 0) as total_refunds,
        COALESCE(SUM(CASE WHEN type = 'ADJUSTMENT' THEN amount_usd ELSE 0 END), 0) as total_adjustments
      FROM cash_movements WHERE session_id = $1`,
      [sessionId]
    );

    const row = res.rows[0];
    const totalPaidIn = parseFloat(row.total_paid_in);
    const totalPaidOut = parseFloat(row.total_paid_out);
    const totalRefunds = parseFloat(row.total_refunds);
    const totalAdjustments = parseFloat(row.total_adjustments);

    return {
      totalPaidIn,
      totalPaidOut,
      totalRefunds,
      totalAdjustments,
      netCashFlow: totalPaidIn - totalPaidOut - totalRefunds + totalAdjustments,
    };
  }

  private toEntity(row: any): CashMovement {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      branchId: row.branch_id,
      registerId: row.register_id,
      sessionId: row.session_id,
      actorId: row.actor_id,
      type: row.type as CashMovementType,
      status: row.status as CashMovementStatus,
      amountUsd: parseFloat(row.amount_usd),
      amountKhr: parseFloat(row.amount_khr),
      refSaleId: row.ref_sale_id,
      reason: row.reason,
      createdAt: new Date(row.created_at),
    };
  }
}
