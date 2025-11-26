import type { Pool, PoolClient } from "pg";
import type { IBranchMenuRepository } from "../../app/ports.js";
import { MenuItem } from "../../domain/entities.js";

export class BranchMenuRepository implements IBranchMenuRepository {
  constructor(private pool: Pool) {}

  async setAvailability(
    menuItemId: string,
    branchId: string,
    tenantId: string,
    isAvailable: boolean,
    userId: string,
    client?: PoolClient
  ): Promise<void> {
    const queryClient = client || this.pool;
    const sql = `
      INSERT INTO menu_branch_items (menu_item_id, branch_id, tenant_id, is_available, updated_by)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (tenant_id, branch_id, menu_item_id) DO UPDATE SET
        is_available = EXCLUDED.is_available,
        updated_at = NOW(),
        updated_by = EXCLUDED.updated_by
    `;
    await queryClient.query(sql, [
      menuItemId,
      branchId,
      tenantId,
      isAvailable,
      userId,
    ]);
  }

  async setPriceOverride(
    menuItemId: string,
    branchId: string,
    tenantId: string,
    priceUsd: number,
    userId: string,
    client?: PoolClient
  ): Promise<void> {
    const queryClient = client || this.pool;
    const sql = `
      INSERT INTO menu_branch_items (menu_item_id, branch_id, tenant_id, custom_price_usd, updated_by)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (tenant_id, branch_id, menu_item_id) DO UPDATE SET
        custom_price_usd = EXCLUDED.custom_price_usd,
        updated_at = NOW(),
        updated_by = EXCLUDED.updated_by
    `;
    await queryClient.query(sql, [
      menuItemId,
      branchId,
      tenantId,
      priceUsd,
      userId,
    ]);
  }

  async findByMenuItemId(
    menuItemId: string,
    tenantId: string,
    client?: PoolClient
  ): Promise<
    Array<{
      branchId: string;
      isAvailable: boolean;
      priceOverrideUsd: number | null;
    }>
  > {
    const queryClient = client || this.pool;
    const sql = `
      SELECT branch_id, is_available, custom_price_usd
      FROM menu_branch_items
      WHERE menu_item_id = $1 AND tenant_id = $2
    `;
    const result = await queryClient.query(sql, [menuItemId, tenantId]);
    return result.rows.map((row) => ({
      branchId: row.branch_id,
      isAvailable: row.is_available,
      priceOverrideUsd:
        row.custom_price_usd === null ? null : Number(row.custom_price_usd),
    }));
  }

  async findAvailableByBranchId(
    branchId: string,
    tenantId: string,
    client?: PoolClient
  ): Promise<MenuItem[]> {
    const queryClient = client || this.pool;
    const sql = `
      SELECT mi.*
      FROM menu_items mi
      JOIN menu_branch_items mbi ON mi.id = mbi.menu_item_id
      WHERE mbi.branch_id = $1 AND mbi.tenant_id = $2 AND mbi.is_available = true
    `;
    const result = await queryClient.query(sql, [branchId, tenantId]);
    return result.rows.map((row) =>
      MenuItem.fromPersistence({
        id: row.id,
        tenantId: row.tenant_id,
        categoryId: row.category_id,
        name: row.name,
        description: row.description,
        priceUsd: Number(row.price_usd),
        imageUrl: row.image_url,
        isActive: row.is_active,
        createdBy: row.created_by,
        createdAt: new Date(row.created_at),
        updatedAt: new Date(row.updated_at),
      })
    );
  }

  async removeOverride(
    menuItemId: string,
    branchId: string,
    tenantId: string,
    client?: PoolClient
  ): Promise<void> {
    const queryClient = client || this.pool;
    const sql = `
      DELETE FROM menu_branch_items WHERE menu_item_id = $1 AND branch_id = $2 AND tenant_id = $3
    `;
    await queryClient.query(sql, [menuItemId, branchId, tenantId]);
  }
}
