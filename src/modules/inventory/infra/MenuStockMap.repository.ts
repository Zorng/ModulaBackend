import type { Pool, PoolClient } from "pg";
import type { MenuStockMapRepository as IMenuStockMapRepository } from "../domain/repositories.js";
import { MenuStockMap } from "../domain/entities.js";

export class MenuStockMapRepository implements IMenuStockMapRepository {
    private pool: Pool;

    constructor(pool: Pool) {
        this.pool = pool;
    }

    async findByMenuItem(menuItemId: string): Promise<MenuStockMap | null> {
        const client = await this.pool.connect();
        try {
            const res = await client.query(
                `SELECT * FROM menu_stock_map WHERE menu_item_id = $1 LIMIT 1`,
                [menuItemId]
            );
            if (res.rows.length === 0) return null;
            return new MenuStockMap(res.rows[0]);
        } finally {
            client.release();
        }
    }

    async findAll(): Promise<MenuStockMap[]> {
        const client = await this.pool.connect();
        try {
            const res = await client.query(`SELECT * FROM menu_stock_map`);
            return res.rows.map(row => new MenuStockMap(row));
        } finally {
            client.release();
        }
    }

    async save(mapping: Omit<MenuStockMap, "createdAt">): Promise<MenuStockMap> {
        const client = await this.pool.connect();
        try {
            const res = await client.query(
                `INSERT INTO menu_stock_map (menu_item_id, stock_item_id, quantity)
                 VALUES ($1, $2, $3)
                 RETURNING *`,
                [mapping.menuItemId, mapping.stockItemId, mapping.quantity]
            );
            return new MenuStockMap(res.rows[0]);
        } finally {
            client.release();
        }
    }

    async delete(menuItemId: string): Promise<void> {
        const client = await this.pool.connect();
        try {
            await client.query(
                `DELETE FROM menu_stock_map WHERE menu_item_id = $1`,
                [menuItemId]
            );
        } finally {
            client.release();
        }
    }
}