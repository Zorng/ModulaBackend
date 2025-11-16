import type { Pool } from "pg";
import type { IBranchMenuRepository } from "../../app/ports.js";

export class BranchMenuRepository implements IBranchMenuRepository {
  constructor(private pool: Pool) {}

  async setAvailability(
    menuItemId: string,
    branchId: string,
    tenantId: string,
    isAvailable: boolean
  ): Promise<void> {
    const sql = `
      INSERT INTO menu_branch_items (menu_item_id, branch_id, is_available, updated_by)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (branch_id, menu_item_id) DO UPDATE SET
        is_available = EXCLUDED.is_available,
        updated_at = NOW(),
        updated_by = EXCLUDED.updated_by
    `;
    await this.pool.query(sql, [menuItemId, branchId, tenantId, isAvailable]);
  }

  async setPriceOverride(
    menuItemId: string,
    branchId: string,
    tenantId: string,
    priceUsd: number
  ): Promise<void> {
    const sql = `
      INSERT INTO menu_branch_items (menu_item_id, branch_id, custom_price_usd, updated_by)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (branch_id, menu_item_id) DO UPDATE SET
        custom_price_usd = EXCLUDED.custom_price_usd,
        updated_at = NOW(),
        updated_by = EXCLUDED.updated_by
    `;
    await this.pool.query(sql, [menuItemId, branchId, priceUsd, tenantId]);
  }

  async findByMenuItemId(
    menuItemId: string,
    tenantId: string
  ): Promise<
    Array<{
      branchId: string;
      isAvailable: boolean;
      priceOverrideUsd: number | null;
    }>
  > {
    const sql = `
      SELECT branch_id, is_available, custom_price_usd
      FROM menu_branch_items
      WHERE menu_item_id = $1
    `;
    const result = await this.pool.query(sql, [menuItemId]);
    return result.rows.map((row) => ({
      branchId: row.branch_id,
      isAvailable: row.is_available,
      priceOverrideUsd:
        row.custom_price_usd === null ? null : Number(row.custom_price_usd),
    }));
  }

  async findAvailableByBranchId(
    branchId: string,
    tenantId: string
  ): Promise<any[]> {
    const sql = `
      SELECT mi.*
      FROM menu_items mi
      JOIN menu_branch_items mbi ON mi.id = mbi.menu_item_id
      WHERE mbi.branch_id = $1 AND mbi.is_available = true
    `;
    const result = await this.pool.query(sql, [branchId]);
    return result.rows; // Should map to MenuItem entity if needed
  }

  async removeOverride(
    menuItemId: string,
    branchId: string,
    tenantId: string
  ): Promise<void> {
    const sql = `
      DELETE FROM menu_branch_items WHERE menu_item_id = $1 AND branch_id = $2
    `;
    await this.pool.query(sql, [menuItemId, branchId]);
  }
}
