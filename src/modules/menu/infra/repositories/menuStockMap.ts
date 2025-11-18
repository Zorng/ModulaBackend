import type { Pool, PoolClient } from "pg";
import type { IMenuStockMapRepository } from "../../app/ports.js";
import { MenuStockMap } from "../../domain/entities.js";

export class MenuStockMapRepository implements IMenuStockMapRepository {
  constructor(private pool: Pool) {}

  async save(mapping: MenuStockMap, client?: PoolClient): Promise<void> {
    const queryClient = client || this.pool;
    const sql = `
      INSERT INTO menu_stock_map (
        id, menu_item_id, stock_item_id, qty_per_sale, tenant_id
      ) VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (id) DO UPDATE
      SET menu_item_id = EXCLUDED.menu_item_id,
          stock_item_id = EXCLUDED.stock_item_id,
          qty_per_sale = EXCLUDED.qty_per_sale,
          tenant_id = EXCLUDED.tenant_id
    `;
    await queryClient.query(sql, [
      mapping.menuItemId,
      mapping.stockItemId,
      mapping.qtyPerSale,
    ]);
  }

  async findByMenuItemId(
    menuItemId: string,
    tenantId: string,
    client?: PoolClient
  ): Promise<MenuStockMap[]> {
    const queryClient = client || this.pool;
    const sql = `
      SELECT * FROM menu_stock_map
      WHERE menu_item_id = $1 AND tenant_id = $2
    `;
    const result = await queryClient.query(sql, [menuItemId, tenantId]);
    return result.rows.map((row) =>
      MenuStockMap.fromPersistence({
        menuItemId: row.menu_item_id,
        stockItemId: row.stock_item_id,
        tenantId: row.tenant_id,
        qtyPerSale: row.qty_per_sale,
        createdBy: row.created_by,
        createdAt: row.created_at,
        updatedAt: row.created_by,
      })
    );
  }

  async findByStockItemId(
    stockItemId: string,
    tenantId: string,
    client?: PoolClient
  ): Promise<MenuStockMap[]> {
    const queryClient = client || this.pool;
    const sql = `
      SELECT * FROM menu_stock_map
      WHERE stock_item_id = $1 AND tenant_id = $2
    `;
    const result = await queryClient.query(sql, [stockItemId, tenantId]);
    return result.rows.map((row) => this.mapRowToEntity(row));
  }

  async delete(
    id: string,
    tenantId: string,
    client?: PoolClient
  ): Promise<void> {
    const queryClient = client || this.pool;
    const sql = `
      DELETE FROM menu_stock_map
      WHERE id = $1 AND tenant_id = $2
    `;
    await queryClient.query(sql, [id, tenantId]);
  }

  async exists(
    menuItemId: string,
    stockItemId: string,
    tenantId: string,
    client?: PoolClient
  ): Promise<boolean> {
    const queryClient = client || this.pool;
    const sql = `
      SELECT COUNT(*) as count
      FROM menu_stock_map
      WHERE menu_item_id = $1 AND stock_item_id = $2 AND tenant_id = $3
    `;
    const result = await queryClient.query(sql, [
      menuItemId,
      stockItemId,
      tenantId,
    ]);
    return parseInt(result.rows[0].count, 10) > 0;
  }

  private mapRowToEntity(row: any): MenuStockMap {
    return MenuStockMap.fromPersistence({
      menuItemId: row.menu_item_id,
      stockItemId: row.stock_item_id,
      tenantId: row.tenant_id,
      qtyPerSale: row.qty_per_sale,
      createdBy: row.created_by,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    });
  }
}
