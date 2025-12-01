import type { Pool, PoolClient } from "pg";
import type { BranchStockRepository as IBranchMenuRepository } from "../domain/repositories.js";
import { BranchStock } from "../domain/entities.js";

export class BranchMenuRepository implements IBranchMenuRepository {
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
        return new BranchStock(res.rows[0]);
    }

    async findByBranch(branchId: string): Promise<BranchStock[]> {
        const res = await this.pool.query(
            "SELECT * FROM branch_stock WHERE branch_id = $1",
            [branchId]
        );
        return res.rows.map(row => new BranchStock(row));
    }

    async findByBranchAndItem(branchId: string, stockItemId: string): Promise<BranchStock | null> {
        const res = await this.pool.query(
            "SELECT * FROM branch_stock WHERE branch_id = $1 AND stock_item_id = $2",
            [branchId, stockItemId]
        );
        if (res.rows.length === 0) return null;
        return new BranchStock(res.rows[0]);
    }

    async save(link: Omit<BranchStock, "id" | "createdAt">): Promise<BranchStock> {
        const res = await this.pool.query(
            `INSERT INTO branch_stock (branch_id, stock_item_id, min_threshold, quantity)
             VALUES ($1, $2, $3, $4)
             RETURNING *`,
            [link.branchId, link.stockItemId, link.minThreshold, link.quantity]
        );
        return new BranchStock(res.rows[0]);
    }

    async update(id: string, updates: Partial<Pick<BranchStock, "minThreshold">>): Promise<BranchStock | null> {
        const fields: string[] = [];
        const values: any[] = [];
        let idx = 1;

        if (updates.minThreshold !== undefined) {
            fields.push(`min_threshold = $${idx++}`);
            values.push(updates.minThreshold);
        }

        if (fields.length === 0) return this.findById(id);

        values.push(id);

        const res = await this.pool.query(
            `UPDATE branch_stock SET ${fields.join(", ")} WHERE id = $${idx} RETURNING *`,
            values
        );
        if (res.rows.length === 0) return null;
        return new BranchStock(res.rows[0]);
    }
}