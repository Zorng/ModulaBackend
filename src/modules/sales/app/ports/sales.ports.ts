import { PoolClient } from 'pg';
import { Sale, SaleItem } from '../../domain/entities/sale.entity.js';

export interface SalesRepository {
  findById(id: string, trx?: PoolClient): Promise<Sale | null>;
  findByClientUuid(clientUuid: string, trx?: PoolClient): Promise<Sale | null>;
  save(sale: Sale, trx?: PoolClient): Promise<void>;
  delete(id: string, trx?: PoolClient): Promise<void>;
  findSalesByBranch(params: {
    tenantId: string;
    branchId: string;
    status?: string;
    saleType?: string;
    startDate?: string;
    endDate?: string;
    page: number;
    limit: number;
  }, trx?: PoolClient): Promise<{ sales: Sale[]; total: number }>;
  findTodaySales(tenantId: string, branchId: string, trx?: PoolClient): Promise<Sale[]>;
}

export interface PolicyPort {
  getCurrentFxRate(tenantId: string): Promise<number>;
  getVatPolicy(tenantId: string): Promise<{ enabled: boolean; rate: number }>;
  getRoundingPolicy(tenantId: string): Promise<{ enabled: boolean; method: string }>;
  getItemDiscountPolicies(tenantId: string, branchId: string, menuItemId: string): Promise<Array<{
    id: string;
    type: 'percentage' | 'fixed';
    value: number;
  }>>;
  getOrderDiscountPolicies(tenantId: string, branchId: string): Promise<Array<{
    id: string;
    type: 'percentage' | 'fixed';
    value: number;
  }>>;
}

export interface MenuPort {
  /**
   * Get menu item details with branch-specific pricing
   * Returns null if item doesn't exist or is not available for the branch
   */
  getMenuItem(params: {
    menuItemId: string;
    branchId: string;
    tenantId: string;
  }): Promise<{
    id: string;
    name: string;
    priceUsd: number; // Branch override if exists, else base price
    isAvailable: boolean;
  } | null>;

  /**
   * Get all available menu items for a branch
   */
  getAvailableMenuItems(params: {
    branchId: string;
    tenantId: string;
  }): Promise<Array<{
    id: string;
    name: string;
    priceUsd: number;
    categoryId: string;
  }>>;
}
