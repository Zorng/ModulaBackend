export type InventoryStockItemLimits = {
  maxStockItemsSoft: number;
  maxStockItemsHard: number;
};

export interface InventoryTenantLimitsPort {
  getStockItemLimits(tenantId: string): Promise<InventoryStockItemLimits | null>;
}

