// TODO: Define Inventory entities
// Example: StockItem, BranchStock, InventoryJournal, RestockBatch

export interface StockItem {
  id: string;
  tenantId: string;
  name: string;
  uomBase: string; // Unit of measure (kg, liter, piece)
  isTrackable: boolean;
  isIngredient: boolean;
  isSellable: boolean;
  createdAt: Date;
}

export interface BranchStock {
  id: string;
  tenantId: string;
  branchId: string;
  stockItemId: string;
  onHand: number; // Current quantity
  reserved: number;
  updatedAt: Date;
}

export interface InventoryJournal {
  id: string;
  tenantId: string;
  branchId: string;
  stockItemId: string;
  quantityDeltaBase: number; // +/- change in base UOM
  reason: "SALE" | "RESTOCK" | "ADJUSTMENT" | "WASTAGE";
  referenceId?: string; // Sale ID, Restock ID, etc.
  createdAt: Date;
}

export interface RestockBatch {
  id: string;
  tenantId: string;
  branchId: string;
  batchNumber: string;
  supplierId?: string;
  receivedAt: Date;
}
