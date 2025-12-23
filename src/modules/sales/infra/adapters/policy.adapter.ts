import { Pool } from 'pg';
import { PolicyPort } from '../../app/ports/sales.ports.js';

/**
 * PolicyAdapter - Connects sales module to policy module
 * 
 * Reads from branch_sales_policies table to apply:
 * - VAT settings (enabled, rate)
 * - KHR rounding mode
 * - Discount scope rules
 * 
 * FX Rate is hardcoded for now (can be moved to policy later)
 */
export class PolicyAdapter implements PolicyPort {
  constructor(private pool: Pool) {}

  async getCurrentFxRate(tenantId: string, branchId: string): Promise<number> {
    try {
      const result = await this.pool.query(
        `SELECT fx_rate_khr_per_usd 
         FROM branch_sales_policies 
         WHERE tenant_id = $1 AND branch_id = $2`,
        [tenantId, branchId]
      );

      if (result.rows.length === 0) {
        // No policy found - return default
        return 4100;
      }

      return parseFloat(result.rows[0].fx_rate_khr_per_usd);
    } catch (error) {
      console.error('[PolicyAdapter] Error fetching FX rate:', error);
      // Fail safe - return default rate
      return 4100;
    }
  }

  async getVatPolicy(
    tenantId: string,
    branchId: string
  ): Promise<{ enabled: boolean; rate: number }> {
    try {
      const result = await this.pool.query(
        `SELECT vat_enabled, vat_rate_percent 
         FROM branch_sales_policies 
         WHERE tenant_id = $1 AND branch_id = $2`,
        [tenantId, branchId]
      );

      if (result.rows.length === 0) {
        // No policy found - return defaults
        return { enabled: false, rate: 0 };
      }

      const row = result.rows[0];
      return {
        enabled: row.vat_enabled,
        rate: parseFloat(row.vat_rate_percent) / 100, // Convert percentage to decimal (10% -> 0.10)
      };
    } catch (error) {
      console.error('[PolicyAdapter] Error fetching VAT policy:', error);
      // Fail safe - return disabled VAT
      return { enabled: false, rate: 0 };
    }
  }

  async getRoundingPolicy(
    tenantId: string,
    branchId: string
  ): Promise<{ enabled: boolean; method: string }> {
    try {
      const result = await this.pool.query(
        `SELECT khr_rounding_enabled, khr_rounding_mode, khr_rounding_granularity 
         FROM branch_sales_policies 
         WHERE tenant_id = $1 AND branch_id = $2`,
        [tenantId, branchId]
      );

      if (result.rows.length === 0) {
        // No policy found - return defaults
        return { enabled: true, method: 'nearest_100' };
      }

      const row = result.rows[0];
      
      // Check if rounding is disabled
      if (!row.khr_rounding_enabled) {
        return { enabled: false, method: 'none' };
      }
      
      // Map policy values to internal format
      const granularity = row.khr_rounding_granularity || '100';
      let method = `nearest_${granularity}`;
      
      switch (row.khr_rounding_mode) {
        case 'NEAREST':
          method = `nearest_${granularity}`;
          break;
        case 'UP':
          method = `up_${granularity}`;
          break;
        case 'DOWN':
          method = `down_${granularity}`;
          break;
      }

      return {
        enabled: true,
        method,
      };
    } catch (error) {
      console.error('[PolicyAdapter] Error fetching rounding policy:', error);
      // Fail safe - return default rounding
      return { enabled: true, method: 'nearest_100' };
    }
  }

  async getItemDiscountPolicies(tenantId: string, branchId: string, menuItemId: string): Promise<Array<{
    id: string;
    type: 'percentage' | 'fixed';
    value: number;
  }>> {
    // TODO: Implement discount policies when needed
    // For now, no predefined item-level discounts (manual discounts still allowed)
    return [];
  }

  async getOrderDiscountPolicies(tenantId: string, branchId: string): Promise<Array<{
    id: string;
    type: 'percentage' | 'fixed';
    value: number;
  }>> {
    // TODO: Implement discount policies when needed
    // For now, no predefined order-level discounts (manual discounts still allowed)
    return [];
  }
}
