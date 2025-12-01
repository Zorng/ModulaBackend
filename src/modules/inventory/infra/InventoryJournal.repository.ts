import type { Pool, PoolClient } from "pg";
import type { InventoryJournalRepository as IInventoryJournalRepository } from "../domain/repositories.js";
import { InventoryJournal } from "../domain/entities.js";

export class InventoryJournalRepository implements IInventoryJournalRepository {
    private pool: Pool;

    constructor(pool: Pool) {
        this.pool = pool;
    }

    async findById(id: string): Promise<InventoryJournal | null> {
        const res = await this.pool.query(
            `SELECT * FROM inventory_journals WHERE id = $1`,
            [id]
        );
        if (res.rows.length === 0) return null;
        return this.mapRowToEntity(res.rows[0]);
    }

    async findByBranch(
        branchId: string,
        filters?: { stockItemId?: string; fromDate?: Date; toDate?: Date; }
    ): Promise<InventoryJournal[]> {
        const params: any[] = [branchId];
        let query = `SELECT * FROM inventory_journals WHERE branch_id = $1`;
        if (filters?.stockItemId) {
            params.push(filters.stockItemId);
            query += ` AND stock_item_id = $${params.length}`;
        }
        if (filters?.fromDate) {
            params.push(filters.fromDate);
            query += ` AND created_at >= $${params.length}`;
        }
        if (filters?.toDate) {
            params.push(filters.toDate);
            query += ` AND created_at <= $${params.length}`;
        }
        const res = await this.pool.query(query, params);
        return res.rows.map(this.mapRowToEntity);
    }

    async save(entry: Omit<InventoryJournal, "id" | "createdAt">): Promise<InventoryJournal> {
        const res = await this.pool.query(
            `INSERT INTO inventory_journals 
                (tenant_id, branch_id, stock_item_id, quantity, type, reference)
             VALUES ($1, $2, $3, $4, $5, $6)
             RETURNING *`,
            [
                entry.tenantId,
                entry.branchId,
                entry.stockItemId,
                entry.quantity,
                entry.type,
                entry.reference
            ]
        );
        return this.mapRowToEntity(res.rows[0]);
    }

    async getOnHand(tenantId: string, branchId: string, stockItemId: string): Promise<number> {
        const res = await this.pool.query(
            `SELECT COALESCE(SUM(quantity), 0) AS on_hand
             FROM inventory_journals
             WHERE tenant_id = $1 AND branch_id = $2 AND stock_item_id = $3`,
            [tenantId, branchId, stockItemId]
        );
        return Number(res.rows[0].on_hand);
    }

    async getLowStockAlerts(branchId: string): Promise<Array<{ stockItemId: string; onHand: number; minThreshold: number; }>> {
        const res = await this.pool.query(
            `SELECT si.id AS stock_item_id,
                    COALESCE(SUM(ij.quantity), 0) AS on_hand,
                    si.min_threshold
             FROM stock_items si
             LEFT JOIN inventory_journals ij
                ON si.id = ij.stock_item_id AND ij.branch_id = $1
             WHERE si.branch_id = $1
             GROUP BY si.id, si.min_threshold
             HAVING COALESCE(SUM(ij.quantity), 0) < si.min_threshold`,
            [branchId]
        );
        return res.rows.map(row => ({
            stockItemId: row.stock_item_id,
            onHand: Number(row.on_hand),
            minThreshold: Number(row.min_threshold)
        }));
    }

    private mapRowToEntity(row: any): InventoryJournal {
        return {
            id: row.id,
            tenantId: row.tenant_id,
            branchId: row.branch_id,
            stockItemId: row.stock_item_id,
            quantity: Number(row.quantity),
            type: row.type,
            reference: row.reference,
            createdAt: row.created_at
        };
    }
}