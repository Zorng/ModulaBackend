import { Pool } from 'pg';

/**
 * PolicyAdapter - Connects inventory module to policy module
 * 
 * Reads from branch_inventory_policies table to apply:
 * - Auto subtract on sale (enabled/disabled)
 * - Branch-specific overrides
 * - Menu item exclusions
 */
export class InventoryPolicyAdapter {
  constructor(private pool: Pool) {}

  /**
   * Get inventory policy for automatic stock subtraction on sale
   * Reads from branch-scoped inventory policies
   * @param tenantId - The tenant ID
   * @returns Policy settings for inventory behavior
   */
  async getInventoryPolicy(
    tenantId: string,
    branchId: string
  ): Promise<{
    autoSubtractOnSale: boolean;
    expiryTrackingEnabled: boolean;
    excludeMenuItemIds: string[];
  }> {
    try {
      // Read from branch-scoped policy table
      const result = await this.pool.query(
        `SELECT 
          auto_subtract_on_sale,
          expiry_tracking_enabled,
          exclude_menu_item_ids
         FROM branch_inventory_policies 
         WHERE tenant_id = $1 AND branch_id = $2`,
        [tenantId, branchId]
      );

      if (result.rows.length === 0) {
        // No policy found - create default policy
        await this.ensureDefaultPolicy(tenantId, branchId);
        
        // Return defaults
        return {
          autoSubtractOnSale: true, // Default: enabled
          expiryTrackingEnabled: false, // Default: disabled
          excludeMenuItemIds: [],
        };
      }

      const row = result.rows[0];
      return {
        autoSubtractOnSale: row.auto_subtract_on_sale,
        expiryTrackingEnabled: row.expiry_tracking_enabled,
        excludeMenuItemIds: typeof row.exclude_menu_item_ids === 'string'
          ? JSON.parse(row.exclude_menu_item_ids)
          : row.exclude_menu_item_ids || [],
      };
    } catch (error) {
      console.error('[InventoryPolicyAdapter] Error fetching inventory policy:', error);
      // Fail safe - return defaults
      return {
        autoSubtractOnSale: true,
        expiryTrackingEnabled: false,
        excludeMenuItemIds: [],
      };
    }
  }

  /**
   * Check if stock should be automatically subtracted on sale
   * Respects branch overrides and menu item exclusions
   * 
   * @param tenantId - The tenant ID
   * @param branchId - The branch ID
   * @param menuItemIds - Optional array of menu item IDs in the sale
   * @returns true if auto-subtract is enabled for this sale
   */
  async shouldSubtractOnSale(
    tenantId: string, 
    branchId?: string,
    menuItemIds?: string[]
  ): Promise<boolean> {
    if (!branchId) {
      return true;
    }

    const policy = await this.getInventoryPolicy(tenantId, branchId);
    
    // Check if any menu items are excluded
    if (menuItemIds && menuItemIds.length > 0 && policy.excludeMenuItemIds.length > 0) {
      const hasExcludedItems = menuItemIds.some(id => 
        policy.excludeMenuItemIds.includes(id)
      );
      
      if (hasExcludedItems) {
        console.log(`[InventoryPolicyAdapter] Sale contains excluded menu items, skipping deduction`);
        return false;
      }
    }
    
    return policy.autoSubtractOnSale;
  }

  /**
   * Ensure default policy exists for tenant
   * @param tenantId - The tenant ID
   */
  private async ensureDefaultPolicy(
    tenantId: string,
    branchId: string
  ): Promise<void> {
    try {
      await this.pool.query(
        `INSERT INTO branch_inventory_policies (tenant_id, branch_id, auto_subtract_on_sale)
         VALUES ($1, $2, true)
         ON CONFLICT (tenant_id, branch_id) DO NOTHING`,
        [tenantId, branchId]
      );
    } catch (error) {
      console.error('[InventoryPolicyAdapter] Error creating default policy:', error);
    }
  }
}
