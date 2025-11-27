import { Pool } from 'pg';
import { MenuPort } from '../../app/ports/sales.ports.js';

export class MenuAdapter implements MenuPort {
  constructor(private pool: Pool) {}

  async getMenuItem(params: {
    menuItemId: string;
    branchId: string;
    tenantId: string;
  }): Promise<{
    id: string;
    name: string;
    priceUsd: number;
    isAvailable: boolean;
  } | null> {
    const { menuItemId, branchId, tenantId } = params;

    // Query menu item with branch-specific overrides
    const result = await this.pool.query(
      `SELECT 
        mi.id,
        mi.name,
        mi.price_usd as base_price_usd,
        mi.is_active,
        mbi.is_available as branch_is_available,
        mbi.custom_price_usd as branch_custom_price_usd
       FROM menu_items mi
       LEFT JOIN menu_branch_items mbi 
         ON mi.id = mbi.menu_item_id 
         AND mbi.branch_id = $2 
         AND mbi.tenant_id = $3
       WHERE mi.id = $1 
         AND mi.tenant_id = $3
         AND mi.is_active = true`,
      [menuItemId, branchId, tenantId]
    );

    if (result.rows.length === 0) {
      return null;
    }

    const row = result.rows[0];

    // If branch override exists, check availability
    const isAvailable = row.branch_is_available !== null 
      ? row.branch_is_available 
      : true; // Default to available if no override

    // If not available for this branch, return null
    if (!isAvailable) {
      return null;
    }

    // Use branch custom price if exists, else use base price
    const priceUsd = row.branch_custom_price_usd !== null
      ? parseFloat(row.branch_custom_price_usd)
      : parseFloat(row.base_price_usd);

    return {
      id: row.id,
      name: row.name,
      priceUsd,
      isAvailable
    };
  }

  async getAvailableMenuItems(params: {
    branchId: string;
    tenantId: string;
  }): Promise<Array<{
    id: string;
    name: string;
    priceUsd: number;
    categoryId: string;
  }>> {
    const { branchId, tenantId } = params;

    const result = await this.pool.query(
      `SELECT 
        mi.id,
        mi.name,
        mi.category_id,
        mi.price_usd as base_price_usd,
        mbi.custom_price_usd as branch_custom_price_usd
       FROM menu_items mi
       LEFT JOIN menu_branch_items mbi 
         ON mi.id = mbi.menu_item_id 
         AND mbi.branch_id = $1 
         AND mbi.tenant_id = $2
       WHERE mi.tenant_id = $2
         AND mi.is_active = true
         AND (mbi.is_available IS NULL OR mbi.is_available = true)
       ORDER BY mi.name`,
      [branchId, tenantId]
    );

    return result.rows.map(row => ({
      id: row.id,
      name: row.name,
      categoryId: row.category_id,
      priceUsd: row.branch_custom_price_usd !== null
        ? parseFloat(row.branch_custom_price_usd)
        : parseFloat(row.base_price_usd)
    }));
  }
}

