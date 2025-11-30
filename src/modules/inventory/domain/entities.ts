// Inventory domain entities based on Capstone 1 spec

export type InventoryReason =
  | "receive"
  | "sale"
  | "waste"
  | "correction"
  | "void"
  | "reopen";

export interface StockItem {
  id: string;
  tenantId: string;
  name: string;
  unitText: string; // Unit of measure (e.g., "pcs", "kg", "liter")
  barcode?: string;
  defaultCostUsd?: number;
  isActive: boolean;
  createdAt: Date;
}

export interface BranchStock {
  id: string;
  tenantId: string;
  branchId: string;
  stockItemId: string;
  minThreshold: number;
  createdAt: Date;
}

export interface InventoryJournal {
  id: string;
  tenantId: string;
  branchId: string;
  stockItemId: string;
  delta: number; // +/- change
  reason: InventoryReason;
  refSaleId?: string; // For sale/void/reopen linking
  note?: string;
  actorId?: string; // Employee who performed action
  batchId?: string; // Future hook for batches/FEFO
  unitCostUsd?: number; // Future hook for COGS
  createdAt: Date;
}

export interface MenuStockMap {
  menuItemId: string; // Primary key
  stockItemId: string;
  qtyPerSale: number; // Quantity deducted per sale (negative for deduction)
  createdAt: Date;
}

export interface StorePolicyInventory {
  tenantId: string; // Primary key
  inventorySubtractOnFinalize: boolean;
  branchOverrides: Record<string, any>; // JSONB for branch-specific overrides
  excludeMenuItemIds: string[]; // JSONB array of excluded menu item IDs
  updatedBy: string;
  updatedAt: Date;
}

// Note: On-hand quantities are computed from InventoryJournal, not stored.
// AuditLog is defined in shared/events.ts or similar shared module.
