// Repository ports (interfaces) for Inventory domain
// These define the contracts for data access, implemented in infra/

import {
  StockItem,
  BranchStock,
  InventoryJournal,
  MenuStockMap,
  StorePolicyInventory,
} from "./entities.js";

export interface StockItemRepository {
  findById(id: string): Promise<StockItem | null>;
  findByTenant(tenantId: string): Promise<StockItem[]>;
  findByTenantAndActive(
    tenantId: string,
    isActive?: boolean
  ): Promise<StockItem[]>;
  save(item: Omit<StockItem, "id" | "createdAt">): Promise<StockItem>;
  update(
    id: string,
    updates: Partial<Omit<StockItem, "id" | "tenantId" | "createdAt">>
  ): Promise<StockItem | null>;
}

export interface BranchStockRepository {
  findById(id: string): Promise<BranchStock | null>;
  findByBranch(branchId: string): Promise<BranchStock[]>;
  findByBranchAndItem(
    branchId: string,
    stockItemId: string
  ): Promise<BranchStock | null>;
  save(link: Omit<BranchStock, "id" | "createdAt">): Promise<BranchStock>;
  update(
    id: string,
    updates: Partial<Pick<BranchStock, "minThreshold">>
  ): Promise<BranchStock | null>;
}

export interface InventoryJournalRepository {
  findById(id: string): Promise<InventoryJournal | null>;
  findByBranch(
    branchId: string,
    filters?: { stockItemId?: string; fromDate?: Date; toDate?: Date }
  ): Promise<InventoryJournal[]>;
  save(
    entry: Omit<InventoryJournal, "id" | "createdAt">
  ): Promise<InventoryJournal>;
  // Computed on-hand: sum of deltas for a stock item at a branch
  getOnHand(
    tenantId: string,
    branchId: string,
    stockItemId: string
  ): Promise<number>;
  // For alerts: items below threshold
  getLowStockAlerts(
    branchId: string
  ): Promise<
    Array<{ stockItemId: string; onHand: number; minThreshold: number }>
  >;
}

export interface MenuStockMapRepository {
  findByMenuItem(menuItemId: string): Promise<MenuStockMap | null>;
  findAll(): Promise<MenuStockMap[]>;
  save(mapping: Omit<MenuStockMap, "createdAt">): Promise<MenuStockMap>;
  delete(menuItemId: string): Promise<void>;
}

export interface StorePolicyInventoryRepository {
  findByTenant(tenantId: string): Promise<StorePolicyInventory | null>;
  save(
    policy: Omit<StorePolicyInventory, "updatedAt">
  ): Promise<StorePolicyInventory>;
  update(
    tenantId: string,
    updates: Partial<Omit<StorePolicyInventory, "tenantId" | "updatedAt">>
  ): Promise<StorePolicyInventory | null>;
}
