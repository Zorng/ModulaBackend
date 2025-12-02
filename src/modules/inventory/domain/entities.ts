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
  pieceSize?: number; // Size per piece/unit
  isIngredient: boolean; // Can be used as ingredient in recipes
  isSellable: boolean; // Can be sold directly
  categoryId?: string; // Optional category for organization
  imageUrl?: string; // Optional image URL
  isActive: boolean;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface BranchStock {
  id: string;
  tenantId: string;
  branchId: string;
  stockItemId: string;
  minThreshold: number;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
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
  createdBy?: string; // User who created this entry (nullable for system-generated)
  createdAt: Date;
  updatedAt: Date;
}

export interface MenuStockMap {
  id: string; // Primary key
  menuItemId: string; // Foreign key to menu_items (one menu item can have many stock items)
  tenantId: string;
  stockItemId: string;
  qtyPerSale: number; // Quantity deducted per sale (positive value, will be negated on deduction)
  createdBy: string;
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

export interface InventoryCategory {
  id: string;
  tenantId: string;
  name: string;
  displayOrder: number;
  isActive: boolean;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

// Note: On-hand quantities are computed from InventoryJournal, not stored.
// AuditLog is defined in shared/events.ts or similar shared module.
