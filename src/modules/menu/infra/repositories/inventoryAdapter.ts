import type { Pool } from "pg";
import type { IInventoryPort } from "../../app/ports.js";

export class InventoryAdapter implements IInventoryPort {
  constructor(private pool: Pool) {}

  async stockItemExists(
    stockItemId: string,
    tenantId: string
  ): Promise<boolean> {
    const sql = `
      SELECT 1 FROM inventory_stock_items
      WHERE id = $1 AND tenant_id = $2 AND is_active = true
      LIMIT 1
    `;
    const result = await this.pool.query(sql, [stockItemId, tenantId]);
    return result.rows.length > 0;
  }

  async getStockItem(
    stockItemId: string,
    tenantId: string
  ): Promise<{
    id: string;
    name: string;
    unit: string;
    currentQty: number;
  } | null> {
    // Get stock item details
    const sql = `
      SELECT id, name, uom, 
        (SELECT COALESCE(SUM(on_hand), 0) FROM inventory_branch_stock WHERE stock_item_id = s.id AND tenant_id = $2) AS current_qty
      FROM inventory_stock_items s
      WHERE id = $1 AND tenant_id = $2 AND is_active = true
    `;
    const result = await this.pool.query(sql, [stockItemId, tenantId]);
    if (result.rows.length === 0) return null;
    const row = result.rows[0];
    return {
      id: row.id,
      name: row.name,
      unit: row.uom,
      currentQty: Number(row.current_qty),
    };
  }
}
