import { Pool } from 'pg';

/**
 * PolicyAdapter - Connects inventory module to policy module
 * 
 * Reads from policy module's inventory_policies table to apply:
 * - Auto subtract on sale (enabled/disabled)
 * - Branch-specific overrides
 * - Menu item exclusions
 */
export class InventoryPolicyAdapter {
  constructor(private pool: Pool) {}

  /**
   * Get inventory policy for automatic stock subtraction on sale
   * Reads from policy module's inventory_policies
   * @param tenantId - The tenant ID
   * @returns Policy settings for inventory behavior
   */
  async getInventoryPolicy(tenantId: string): Promise<{
    autoSubtractOnSale: boolean;
    expiryTrackingEnabled: boolean;
    branchOverrides: Record<string, any>;
    excludeMenuItemIds: string[];
  }> {
    try {
      // Read from policy module's inventory_policies
      const result = await this.pool.query(
        `SELECT 
          auto_subtract_on_sale,
          expiry_tracking_enabled,
          branch_overrides,
          exclude_menu_item_ids
         FROM inventory_policies 
         WHERE tenant_id = $1`,
        [tenantId]
      );

      if (result.rows.length === 0) {
        // No policy found - create default policy
        await this.ensureDefaultPolicy(tenantId);
        
        // Return defaults
        return {
          autoSubtractOnSale: true, // Default: enabled
          expiryTrackingEnabled: false, // Default: disabled
          branchOverrides: {},
          excludeMenuItemIds: [],
        };
      }

      const row = result.rows[0];
      return {
        autoSubtractOnSale: row.auto_subtract_on_sale,
        expiryTrackingEnabled: row.expiry_tracking_enabled,
        branchOverrides: typeof row.branch_overrides === 'string' 
          ? JSON.parse(row.branch_overrides) 
          : row.branch_overrides || {},
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
        branchOverrides: {},
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
    const policy = await this.getInventoryPolicy(tenantId);
    
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
    
    // Check branch-specific override
    if (branchId && policy.branchOverrides[branchId] !== undefined) {
      const branchPolicy = policy.branchOverrides[branchId];
      console.log(`[InventoryPolicyAdapter] Using branch override for ${branchId}: ${branchPolicy.inventorySubtractOnFinalize}`);
      return branchPolicy.inventorySubtractOnFinalize;
    }
    
    // Use tenant-level default
    return policy.autoSubtractOnSale;
  }

  /**
   * Ensure default policy exists for tenant
   * @param tenantId - The tenant ID
   */
  private async ensureDefaultPolicy(tenantId: string): Promise<void> {
    try {
      await this.pool.query(
        `INSERT INTO inventory_policies (tenant_id, auto_subtract_on_sale)
         VALUES ($1, true)
         ON CONFLICT (tenant_id) DO NOTHING`,
        [tenantId]
      );
    } catch (error) {
      console.error('[InventoryPolicyAdapter] Error creating default policy:', error);
    }
  }
}
