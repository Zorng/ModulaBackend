import { Pool } from 'pg';

/**
 * PolicyAdapter - Connects inventory module to policy module
 * 
 * Reads from inventory_policies table to apply:
 * - Auto subtract on sale (enabled/disabled)
 * - Expiry tracking (enabled/disabled)
 */
export class InventoryPolicyAdapter {
  constructor(private pool: Pool) {}

  /**
   * Get inventory policy for automatic stock subtraction on sale
   * @param tenantId - The tenant ID
   * @returns Policy settings for inventory behavior
   */
  async getInventoryPolicy(tenantId: string): Promise<{
    autoSubtractOnSale: boolean;
    expiryTrackingEnabled: boolean;
  }> {
    try {
      const result = await this.pool.query(
        `SELECT auto_subtract_on_sale, expiry_tracking_enabled
         FROM inventory_policies 
         WHERE tenant_id = $1`,
        [tenantId]
      );

      if (result.rows.length === 0) {
        // No policy found - return defaults
        return {
          autoSubtractOnSale: true, // Default: enabled
          expiryTrackingEnabled: false, // Default: disabled
        };
      }

      const row = result.rows[0];
      return {
        autoSubtractOnSale: row.auto_subtract_on_sale,
        expiryTrackingEnabled: row.expiry_tracking_enabled,
      };
    } catch (error) {
      console.error('[InventoryPolicyAdapter] Error fetching inventory policy:', error);
      // Fail safe - return defaults
      return {
        autoSubtractOnSale: true,
        expiryTrackingEnabled: false,
      };
    }
  }

  /**
   * Check if stock should be automatically subtracted on sale for a specific branch
   * @param tenantId - The tenant ID
   * @param branchId - The branch ID (currently unused, for future branch-specific overrides)
   * @returns true if auto-subtract is enabled
   */
  async shouldSubtractOnSale(tenantId: string, branchId?: string): Promise<boolean> {
    const policy = await this.getInventoryPolicy(tenantId);
    
    // TODO: In the future, we can add branch-specific overrides here
    // For now, just use the tenant-level policy
    
    return policy.autoSubtractOnSale;
  }
}

