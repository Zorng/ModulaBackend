// Domain event contracts (versioned)

// Sales events
export type SaleFinalizedV1 = {
  type: "sales.sale_finalized";
  v: 1;
  tenantId: string;
  branchId: string;
  saleId: string;
  lines: Array<{ menuItemId: string; qty: number }>;
  tenders: Array<{
    method: "CASH" | "QR";
    amountUsd: number;
    amountKhr: number;
  }>;
  finalizedAt: string; // ISO
};

// Cash events
export type CashSessionOpenedV1 = {
  type: "cash.session_opened";
  v: 1;
  tenantId: string;
  branchId: string;
  sessionId: string;
  openedBy: string;
  openingFloat: number;
  openedAt: string;
};

export type CashSessionClosedV1 = {
  type: "cash.session_closed";
  v: 1;
  tenantId: string;
  branchId: string;
  sessionId: string;
  closedBy: string;
  closedAt: string;
  expectedCash: number;
  actualCash: number;
  variance: number;
};

// Inventory events
export type StockAdjustedV1 = {
  type: "inventory.stock_adjusted";
  v: 1;
  tenantId: string;
  branchId: string;
  stockItemId: string;
  quantityDelta: number;
  reason: "SALE" | "RESTOCK" | "ADJUSTMENT" | "WASTAGE";
  adjustedAt: string;
};

// Menu events
export type MenuCategoryCreatedV1 = {
  type: "menu.category_created";
  v: 1;
  tenantId: string;
  categoryId: string;
  name: string;
  displayOrder: number;
  createdBy: string;
  createdAt: string;
};

export type MenuItemCreatedV1 = {
  type: "menu.item_created";
  v: 1;
  tenantId: string;
  categoryId: string;
  menuItemId: string;
  name: string;
  priceUsd: number;
  isActive: boolean;
  createdBy: string;
  createdAt: string;
};

export type MenuItemUpdatedV1 = {
  type: "menu.item_updated";
  v: 1;
  tenantId: string;
  menuItemId: string;
  changes: {
    name?: string;
    priceUsd?: number;
    isActive?: boolean;
    categoryId?: string;
  };
  updatedBy: string;
  updatedAt: string;
};

export type MenuModifierAttachedV1 = {
  type: "menu.modifier_attached";
  v: 1;
  tenantId: string;
  menuItemId: string;
  modifierId: string;
  attachedBy: string;
  attachedAt: string;
};

export type MenuBranchAvailabilityChangedV1 = {
  type: "menu.branch_availability_changed";
  v: 1;
  tenantId: string;
  branchId: string;
  menuItemId: string;
  isAvailable: boolean;
  customPriceUsd?: number;
  changedBy: string;
  changedAt: string;
};

export type MenuSnapshotUpdatedV1 = {
  type: "menu.snapshot_updated";
  v: 1;
  tenantId: string;
  branchId?: string; // null = all branches
  version: string; // timestamp or sequence
  updatedAt: string;
};


export type CategoryUpdatedV1 = {
  type: "menu.category_updated";
  v: 1;
  tenantId: string;
  categoryId: string;
  changes: {
    name?: string;
    displayOrder?: number;
  };
  updatedBy: string;
  updatedAt: string;
};

export type MenuItemDeletedV1 = {
  type: "menu.item_deleted";
  v: 1;
  tenantId: string;
  menuItemId: string;
  categoryId: string;
  name: string;
  deletedBy: string;
  deletedAt: string;
};

export type ModifierGroupCreatedV1 = {
  type: "menu.modifier_group_created";
  v: 1;
  tenantId: string;
  modifierGroupId: string;
  name: string;
  selectionType: "SINGLE" | "MULTI";
  createdBy: string;
  createdAt: string;
};

export type ModifierOptionAddedV1 = {
  type: "menu.modifier_option_added";
  v: 1;
  tenantId: string;
  modifierGroupId: string;
  modifierOptionId: string;
  label: string;
  priceAdjustmentUsd: number;
  createdAt: string;
};

// Union type of all events
export type DomainEvent =
  | SaleFinalizedV1
  | CashSessionOpenedV1
  | CashSessionClosedV1
  | StockAdjustedV1
  | MenuCategoryCreatedV1
  | MenuItemCreatedV1
  | MenuItemUpdatedV1
  | MenuModifierAttachedV1
  | MenuBranchAvailabilityChangedV1
  | MenuSnapshotUpdatedV1
  | CategoryUpdatedV1
  | MenuItemDeletedV1
  | ModifierGroupCreatedV1
  | ModifierOptionAddedV1;
  
