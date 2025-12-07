import type { Pool } from "pg";

/**
 * InventorySyncAdapter
 * 
 * Syncs the policy module's simple inventory_policies table
 * with the inventory module's rich store_policy_inventory table
 * 
 * Strategy:
 * - Policy module owns the "master" auto_subtract_on_sale setting
 * - When updated, it syncs to store_policy_inventory as the default
 * - Inventory module's branch overrides and exclusions are preserved
 */
export class InventorySyncAdapter {
  constructor(private pool: Pool) {}

  /**
   * Sync auto_subtract_on_sale setting from inventory_policies to store_policy_inventory
   * This maintains the tenant-level default while preserving branch overrides
   * 
   * @param tenantId - The tenant ID
   * @param autoSubtractOnSale - The new auto-subtract setting
   */
  async syncAutoSubtractSetting(
    tenantId: string,
    autoSubtractOnSale: boolean
  ): Promise<void> {
    try {
      // Update store_policy_inventory, preserving branch overrides and exclusions
      await this.pool.query(
        `INSERT INTO store_policy_inventory (
          tenant_id, 
          inventory_subtract_on_finalize
        )
        VALUES ($1, $2)
        ON CONFLICT (tenant_id) 
        DO UPDATE SET 
          inventory_subtract_on_finalize = EXCLUDED.inventory_subtract_on_finalize,
          updated_at = NOW()`,
        [tenantId, autoSubtractOnSale]
      );

      console.log(
        `[InventorySyncAdapter] Synced auto_subtract_on_sale=${autoSubtractOnSale} to store_policy_inventory for tenant ${tenantId}`
      );
    } catch (error) {
      console.error(
        `[InventorySyncAdapter] Error syncing auto-subtract setting:`,
        error
      );
      // Don't throw - sync failure shouldn't break policy updates
    }
  }

  /**
   * Ensure both policy tables are initialized for a tenant
   * Called when creating default policies
   * 
   * @param tenantId - The tenant ID
   */
  async ensureBothTablesInitialized(tenantId: string): Promise<void> {
    try {
      await Promise.all([
        // Ensure inventory_policies exists
        this.pool.query(
          `INSERT INTO inventory_policies (tenant_id)
           VALUES ($1)
           ON CONFLICT (tenant_id) DO NOTHING`,
          [tenantId]
        ),
        // Ensure store_policy_inventory exists
        this.pool.query(
          `INSERT INTO store_policy_inventory (tenant_id)
           VALUES ($1)
           ON CONFLICT (tenant_id) DO NOTHING`,
          [tenantId]
        ),
      ]);

      console.log(
        `[InventorySyncAdapter] Ensured both policy tables initialized for tenant ${tenantId}`
      );
    } catch (error) {
      console.error(
        `[InventorySyncAdapter] Error initializing policy tables:`,
        error
      );
    }
  }

  /**
   * Read the current auto-subtract setting from store_policy_inventory
   * Useful for reading back the effective policy
   * 
   * @param tenantId - The tenant ID
   * @returns The current auto-subtract setting, or null if not found
   */
  async getCurrentAutoSubtractSetting(
    tenantId: string
  ): Promise<boolean | null> {
    try {
      const result = await this.pool.query(
        `SELECT inventory_subtract_on_finalize 
         FROM store_policy_inventory 
         WHERE tenant_id = $1`,
        [tenantId]
      );

      if (result.rows.length === 0) {
        return null;
      }

      return result.rows[0].inventory_subtract_on_finalize;
    } catch (error) {
      console.error(
        `[InventorySyncAdapter] Error reading auto-subtract setting:`,
        error
      );
      return null;
    }
  }
}

