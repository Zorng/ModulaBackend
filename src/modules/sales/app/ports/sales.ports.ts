import { PoolClient } from 'pg';
import { Sale, SaleItem } from '../../domain/entities/sale.entity.js';

export interface SalesRepository {
  findById(id: string, trx?: PoolClient): Promise<Sale | null>;
  findByClientUuid(clientUuid: string, trx?: PoolClient): Promise<Sale | null>;
  save(sale: Sale, trx?: PoolClient): Promise<void>;
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
  writeAuditLog(entry: {
    tenantId: string;
    branchId: string;
    saleId: string;
    actorId: string;
    action: string;
    reason?: string;
    oldValues?: any;
    newValues?: any;
  }, trx?: PoolClient): Promise<void>;
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