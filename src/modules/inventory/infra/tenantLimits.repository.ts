import type { Pool } from "pg";
import type {
  InventoryStockItemLimits,
  InventoryTenantLimitsPort,
} from "../app/tenant-limits.port.js";

export class PgInventoryTenantLimitsRepository
  implements InventoryTenantLimitsPort
{
  constructor(private pool: Pool) {}

  async getStockItemLimits(tenantId: string): Promise<InventoryStockItemLimits | null> {
    const res = await this.pool.query(
      `SELECT max_stock_items_soft, max_stock_items_hard
       FROM tenant_limits
       WHERE tenant_id = $1`,
      [tenantId]
    );
    if (res.rows.length === 0) return null;
    return {
      maxStockItemsSoft: Number(res.rows[0].max_stock_items_soft),
      maxStockItemsHard: Number(res.rows[0].max_stock_items_hard),
    };
  }
}

