import type { Pool, PoolClient } from "pg";
import type { StockItemRepository as IStockItemRepository } from "../domain/repositories.js";
import { StockItem } from "../domain/entities.js";

export class StockItemRepository implements IStockItemRepository {
    private pool: Pool;

    constructor(pool: Pool) {
        this.pool = pool;
    }

    async findById(id: string): Promise<StockItem | null> {
        const res = await this.pool.query(
            "SELECT * FROM stock_items WHERE id = $1",
            [id]
        );
        if (res.rows.length === 0) return null;
        return this.toEntity(res.rows[0]);
    }

    async findByTenant(tenantId: string): Promise<StockItem[]> {
        const res = await this.pool.query(
            "SELECT * FROM stock_items WHERE tenant_id = $1",
            [tenantId]
        );
        return res.rows.map(this.toEntity);
    }

    async findByTenantAndActive(tenantId: string, isActive?: boolean): Promise<StockItem[]> {
        let query = "SELECT * FROM stock_items WHERE tenant_id = $1";
        const params: any[] = [tenantId];
        if (typeof isActive === "boolean") {
            query += " AND is_active = $2";
            params.push(isActive);
        }
        const res = await this.pool.query(query, params);
        return res.rows.map(this.toEntity);
    }

    async save(item: Omit<StockItem, "id" | "createdAt">): Promise<StockItem> {
        const res = await this.pool.query(
            `INSERT INTO stock_items (tenant_id, name, quantity, is_active)
             VALUES ($1, $2, $3, $4)
             RETURNING *`,
            [item.tenantId, item.name, item.quantity, item.isActive]
        );
        return this.toEntity(res.rows[0]);
    }

    async update(
        id: string,
        updates: Partial<Omit<StockItem, "id" | "tenantId" | "createdAt">>
    ): Promise<StockItem | null> {
        const fields = Object.keys(updates);
        if (fields.length === 0) return this.findById(id);

        const setClause = fields.map((f, i) => `${f} = $${i + 2}`).join(", ");
        const values = fields.map(f => (updates as any)[f]);
        const query = `UPDATE stock_items SET ${setClause} WHERE id = $1 RETURNING *`;

        const res = await this.pool.query(query, [id, ...values]);
        if (res.rows.length === 0) return null;
        return this.toEntity(res.rows[0]);
    }

    private toEntity(row: any): StockItem {
        return {
            id: row.id,
            tenantId: row.tenant_id,
            name: row.name,
            quantity: row.quantity,
            isActive: row.is_active,
            createdAt: row.created_at,
        };
    }
}