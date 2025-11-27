import { Pool } from 'pg';
import { PolicyPort } from '../../app/ports/sales.ports.js';

/**
 * PolicyAdapter - Stub implementation
 * 
 * TODO: Implement proper policy tables and queries when policy module is ready
 * For now, returns sensible defaults to allow sales operations to work
 */
export class PolicyAdapter implements PolicyPort {
  constructor(private pool: Pool) {}

  async getCurrentFxRate(tenantId: string): Promise<number> {
    // TODO: Query policy.fx_rates table when implemented
    // For now, return default USD/KHR rate
    return 4100;
  }

  async getVatPolicy(tenantId: string): Promise<{ enabled: boolean; rate: number }> {
    // TODO: Query policy.vat_settings table when implemented
    // For now, VAT is disabled
    return { enabled: false, rate: 0.1 };
  }

  async getRoundingPolicy(tenantId: string): Promise<{ enabled: boolean; method: string }> {
    // TODO: Query policy.rounding_settings table when implemented
    // For now, enable rounding to nearest 100 KHR
    return { enabled: true, method: 'nearest_100' };
  }

  async getItemDiscountPolicies(tenantId: string, branchId: string, menuItemId: string): Promise<Array<{
    id: string;
    type: 'percentage' | 'fixed';
    value: number;
  }>> {
    // TODO: Query policy.discount_policies table when implemented
    // For now, no item-level discounts
    return [];
  }

  async getOrderDiscountPolicies(tenantId: string, branchId: string): Promise<Array<{
    id: string;
    type: 'percentage' | 'fixed';
    value: number;
  }>> {
    // TODO: Query policy.discount_policies table when implemented
    // For now, no order-level discounts
    return [];
  }
}