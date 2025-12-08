import type { Pool } from "pg";
import type { InventoryJournalRepository as IInventoryJournalRepository } from "../domain/repositories.js";
import { InventoryJournal } from "../domain/entities.js";

export class InventoryJournalRepository implements IInventoryJournalRepository {
  private pool: Pool;

  constructor(pool: Pool) {
    this.pool = pool;
  }

  async findById(id: string): Promise<InventoryJournal | null> {
    const res = await this.pool.query(
      "SELECT * FROM inventory_journal WHERE id = $1",
      [id]
    );
    if (res.rows.length === 0) return null;
    return this.toEntity(res.rows[0]);
  }

  async findByBranch(
    branchId: string,
    filters?: { stockItemId?: string; fromDate?: Date; toDate?: Date }
  ): Promise<InventoryJournal[]> {
    let query = "SELECT * FROM inventory_journal WHERE branch_id = $1";
    const params: any[] = [branchId];
    let paramIndex = 2;

    if (filters?.stockItemId) {
      query += ` AND stock_item_id = $${paramIndex}`;
      params.push(filters.stockItemId);
      paramIndex++;
    }

    if (filters?.fromDate) {
      query += ` AND occurred_at >= $${paramIndex}`;
      params.push(filters.fromDate);
      paramIndex++;
    }

    if (filters?.toDate) {
      query += ` AND occurred_at <= $${paramIndex}`;
      params.push(filters.toDate);
      paramIndex++;
    }

    query += " ORDER BY occurred_at DESC, created_at DESC";

    const res = await this.pool.query(query, params);
    return res.rows.map(this.toEntity);
  }

  async save(
    entry: Omit<InventoryJournal, "id" | "createdAt" | "updatedAt">
  ): Promise<InventoryJournal> {
    const res = await this.pool.query(
      `INSERT INTO inventory_journal (
        tenant_id,
        branch_id,
        stock_item_id,
        delta,
        reason,
        ref_sale_id,
        note,
        actor_id,
        batch_id,
        unit_cost_usd,
        occurred_at,
        created_by
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      RETURNING *`,
      [
        entry.tenantId,
        entry.branchId,
        entry.stockItemId,
        entry.delta,
        entry.reason,
        entry.refSaleId || null,
        entry.note || null,
        entry.actorId || null,
        entry.batchId || null,
        entry.unitCostUsd || null,
        entry.occurredAt,
        entry.createdBy || null,
      ]
    );
    return this.toEntity(res.rows[0]);
  }

  async getOnHand(
    tenantId: string,
    branchId: string,
    stockItemId: string
  ): Promise<number> {
    const res = await this.pool.query(
      `SELECT COALESCE(SUM(delta), 0) as on_hand
       FROM inventory_journal
       WHERE tenant_id = $1 
         AND branch_id = $2 
         AND stock_item_id = $3`,
      [tenantId, branchId, stockItemId]
    );
    return parseFloat(res.rows[0].on_hand);
  }

  async getLowStockAlerts(
    branchId: string
  ): Promise<
    Array<{ stockItemId: string; onHand: number; minThreshold: number }>
  > {
    const res = await this.pool.query(
      `SELECT 
        bs.stock_item_id,
        COALESCE(SUM(ij.delta), 0) as on_hand,
        bs.min_threshold
       FROM branch_stock bs
       LEFT JOIN inventory_journal ij 
         ON ij.branch_id = bs.branch_id 
         AND ij.stock_item_id = bs.stock_item_id
       WHERE bs.branch_id = $1
       GROUP BY bs.stock_item_id, bs.min_threshold
       HAVING COALESCE(SUM(ij.delta), 0) <= bs.min_threshold
       ORDER BY on_hand ASC`,
      [branchId]
    );

    return res.rows.map((row) => ({
      stockItemId: row.stock_item_id,
      onHand: parseFloat(row.on_hand),
      minThreshold: parseFloat(row.min_threshold),
    }));
  }

  private toEntity(row: any): InventoryJournal {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      branchId: row.branch_id,
      stockItemId: row.stock_item_id,
      delta: parseFloat(row.delta),
      reason: row.reason,
      refSaleId: row.ref_sale_id,
      note: row.note,
      actorId: row.actor_id,
      batchId: row.batch_id,
      unitCostUsd: row.unit_cost_usd
        ? parseFloat(row.unit_cost_usd)
        : undefined,
      occurredAt: new Date(row.occurred_at),
      createdBy: row.created_by,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    };
  }
}
