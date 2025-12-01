import type { Pool } from "pg";
import type { BranchStockRepository as IBranchStockRepository } from "../domain/repositories.js";
import { BranchStock } from "../domain/entities.js";

export class BranchStockRepository implements IBranchStockRepository {
  private pool: Pool;

  constructor(pool: Pool) {
    this.pool = pool;
  }

  async findById(id: string): Promise<BranchStock | null> {
    const res = await this.pool.query(
      "SELECT * FROM branch_stock WHERE id = $1",
      [id]
    );
    if (res.rows.length === 0) return null;
    return this.toEntity(res.rows[0]);
  }

  async findByBranch(branchId: string): Promise<BranchStock[]> {
    const res = await this.pool.query(
      `SELECT bs.* 
       FROM branch_stock bs
       WHERE bs.branch_id = $1
       ORDER BY bs.created_at DESC`,
      [branchId]
    );
    return res.rows.map(this.toEntity);
  }

  async findByBranchAndItem(
    branchId: string,
    stockItemId: string
  ): Promise<BranchStock | null> {
    const res = await this.pool.query(
      `SELECT * FROM branch_stock 
       WHERE branch_id = $1 AND stock_item_id = $2`,
      [branchId, stockItemId]
    );
    if (res.rows.length === 0) return null;
    return this.toEntity(res.rows[0]);
  }

  async save(
    link: Omit<BranchStock, "id" | "createdAt" | "updatedAt">
  ): Promise<BranchStock> {
    const res = await this.pool.query(
      `INSERT INTO branch_stock (
        tenant_id,
        branch_id,
        stock_item_id,
        min_threshold,
        created_by
      )
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (tenant_id, branch_id, stock_item_id)
      DO UPDATE SET min_threshold = EXCLUDED.min_threshold
      RETURNING *`,
      [
        link.tenantId,
        link.branchId,
        link.stockItemId,
        link.minThreshold,
        link.createdBy,
      ]
    );
    return this.toEntity(res.rows[0]);
  }

  async update(
    id: string,
    updates: Partial<Pick<BranchStock, "minThreshold">>
  ): Promise<BranchStock | null> {
    if (!updates.minThreshold && updates.minThreshold !== 0) {
      return this.findById(id);
    }

    const res = await this.pool.query(
      `UPDATE branch_stock 
       SET min_threshold = $2
       WHERE id = $1
       RETURNING *`,
      [id, updates.minThreshold]
    );

    if (res.rows.length === 0) return null;
    return this.toEntity(res.rows[0]);
  }

  private toEntity(row: any): BranchStock {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      branchId: row.branch_id,
      stockItemId: row.stock_item_id,
      minThreshold: parseFloat(row.min_threshold),
      createdBy: row.created_by,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    };
  }
}
