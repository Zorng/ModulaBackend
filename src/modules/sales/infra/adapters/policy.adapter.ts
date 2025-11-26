import { Pool } from 'pg';
import { PolicyPort } from '../../app/ports/sales.ports.js';

export class PolicyAdapter implements PolicyPort {
  constructor(private pool: Pool) {}

  async getCurrentFxRate(tenantId: string): Promise<number> {
    // In a real implementation, this would fetch from a rates table or external API
    const result = await this.pool.query(
      `SELECT value FROM policy.fx_rates WHERE tenant_id = $1 AND currency_pair = 'USD/KHR' ORDER BY effective_from DESC LIMIT 1`,
      [tenantId]
    );
    
    return result.rows.length > 0 ? parseFloat(result.rows[0].value) : 4100; // Default rate
  }

  async getVatPolicy(tenantId: string): Promise<{ enabled: boolean; rate: number }> {
    const result = await this.pool.query(
      `SELECT enabled, rate FROM policy.vat_settings WHERE tenant_id = $1`,
      [tenantId]
    );
    
    return result.rows.length > 0 
      ? { enabled: result.rows[0].enabled, rate: parseFloat(result.rows[0].rate) }
      : { enabled: false, rate: 0.1 }; // Default VAT
  }

  async getRoundingPolicy(tenantId: string): Promise<{ enabled: boolean; method: string }> {
    const result = await this.pool.query(
      `SELECT enabled, method FROM policy.rounding_settings WHERE tenant_id = $1`,
      [tenantId]
    );
    
    return result.rows.length > 0 
      ? { enabled: result.rows[0].enabled, method: result.rows[0].method }
      : { enabled: true, method: 'nearest_100' }; // Default rounding
  }

  async getItemDiscountPolicies(tenantId: string, branchId: string, menuItemId: string): Promise<Array<{
    id: string;
    type: 'percentage' | 'fixed';
    value: number;
  }>> {
    const result = await this.pool.query(
      `SELECT id, discount_type as type, discount_value as value 
       FROM policy.discount_policies 
       WHERE tenant_id = $1 
         AND (scope_branches IS NULL OR $2 = ANY(scope_branches))
         AND (target_item_ids IS NULL OR $3 = ANY(target_item_ids))
         AND status = 'active'
         AND (starts_at IS NULL OR starts_at <= NOW())
         AND (ends_at IS NULL OR ends_at >= NOW())`,
      [tenantId, branchId, menuItemId]
    );
    
    return result.rows.map(row => ({
      id: row.id,
      type: row.type,
      value: parseFloat(row.value)
    }));
  }

  async getOrderDiscountPolicies(tenantId: string, branchId: string): Promise<Array<{
    id: string;
    type: 'percentage' | 'fixed';
    value: number;
  }>> {
    const result = await this.pool.query(
      `SELECT id, discount_type as type, discount_value as value 
       FROM policy.discount_policies 
       WHERE tenant_id = $1 
         AND type = 'per_branch'
         AND (scope_branches IS NULL OR $2 = ANY(scope_branches))
         AND status = 'active'
         AND (starts_at IS NULL OR starts_at <= NOW())
         AND (ends_at IS NULL OR ends_at >= NOW())`,
      [tenantId, branchId]
    );
    
    return result.rows.map(row => ({
      id: row.id,
      type: row.type,
      value: parseFloat(row.value)
    }));
  }
}