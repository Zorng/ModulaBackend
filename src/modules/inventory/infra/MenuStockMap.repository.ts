import type { Pool } from "pg";
import type { MenuStockMapRepository as IMenuStockMapRepository } from "../domain/repositories.js";
import { MenuStockMap } from "../domain/entities.js";

export class MenuStockMapRepository implements IMenuStockMapRepository {
  private pool: Pool;

  constructor(pool: Pool) {
    this.pool = pool;
  }

  async findById(id: string): Promise<MenuStockMap | null> {
    const res = await this.pool.query(
      "SELECT * FROM menu_stock_map WHERE id = $1",
      [id]
    );
    if (res.rows.length === 0) return null;
    return this.toEntity(res.rows[0]);
  }

  async findByMenuItem(menuItemId: string): Promise<MenuStockMap[]> {
    const res = await this.pool.query(
      "SELECT * FROM menu_stock_map WHERE menu_item_id = $1 ORDER BY created_at ASC",
      [menuItemId]
    );
    return res.rows.map(this.toEntity);
  }

  async findByMenuItemAndStockItem(
    menuItemId: string,
    stockItemId: string
  ): Promise<MenuStockMap | null> {
    const res = await this.pool.query(
      "SELECT * FROM menu_stock_map WHERE menu_item_id = $1 AND stock_item_id = $2",
      [menuItemId, stockItemId]
    );
    if (res.rows.length === 0) return null;
    return this.toEntity(res.rows[0]);
  }

  async findAll(): Promise<MenuStockMap[]> {
    const res = await this.pool.query(
      "SELECT * FROM menu_stock_map ORDER BY created_at DESC"
    );
    return res.rows.map(this.toEntity);
  }

  async save(
    mapping: Omit<MenuStockMap, "id" | "createdAt">
  ): Promise<MenuStockMap> {
    const res = await this.pool.query(
      `INSERT INTO menu_stock_map (
        menu_item_id,
        stock_item_id,
        qty_per_sale,
        tenant_id,
        created_by
      )
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (menu_item_id, stock_item_id)
      DO UPDATE SET 
        qty_per_sale = EXCLUDED.qty_per_sale,
        updated_at = NOW()
      RETURNING *`,
      [
        mapping.menuItemId,
        mapping.stockItemId,
        mapping.qtyPerSale,
        mapping.tenantId,
        mapping.createdBy,
      ]
    );
    return this.toEntity(res.rows[0]);
  }

  async update(
    id: string,
    updates: Partial<Pick<MenuStockMap, "qtyPerSale">>
  ): Promise<MenuStockMap | null> {
    const setClauses: string[] = [];
    const values: any[] = [];
    let paramCount = 1;

    if (updates.qtyPerSale !== undefined) {
      setClauses.push(`qty_per_sale = $${paramCount++}`);
      values.push(updates.qtyPerSale);
    }

    if (setClauses.length === 0) return null;

    setClauses.push(`updated_at = NOW()`);
    values.push(id);

    const res = await this.pool.query(
      `UPDATE menu_stock_map SET ${setClauses.join(
        ", "
      )} WHERE id = $${paramCount} RETURNING *`,
      values
    );

    if (res.rows.length === 0) return null;
    return this.toEntity(res.rows[0]);
  }

  async delete(id: string): Promise<void> {
    await this.pool.query("DELETE FROM menu_stock_map WHERE id = $1", [id]);
  }

  async deleteByMenuItem(menuItemId: string): Promise<void> {
    await this.pool.query(
      "DELETE FROM menu_stock_map WHERE menu_item_id = $1",
      [menuItemId]
    );
  }

  private toEntity(row: any): MenuStockMap {
    return {
      id: row.id,
      menuItemId: row.menu_item_id,
      tenantId: row.tenant_id,
      stockItemId: row.stock_item_id,
      qtyPerSale: parseFloat(row.qty_per_sale),
      createdBy: row.created_by,
      createdAt: new Date(row.created_at),
    };
  }
}
