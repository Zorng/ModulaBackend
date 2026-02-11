// Domain event contracts (versioned)

// Sales events
export type SaleDraftCreatedV1 = {
  type: "sales.draft_created";
  v: 1;
  tenantId: string;
  branchId: string;
  saleId: string;
  clientUuid: string;
  actorId: string;
  timestamp: string;
};

export type SaleFinalizedV1 = {
  type: "sales.sale_finalized";
  v: 1;
  tenantId: string;
  branchId: string;
  saleId: string;
  lines: Array<{ menuItemId: string; qty: number }>;
  totals: {
    subtotalUsd: number;
    totalUsd: number;
    totalKhr: number;
    vatAmountUsd: number;
  };
  tenders: Array<{
    method: "CASH" | "QR";
    amountUsd: number;
    amountKhr: number;
  }>;
  finalizedAt: string; // ISO
  actorId: string;
};

export type SaleFulfillmentUpdatedV1 = {
  type: "sales.fulfillment_updated";
  v: 1;
  tenantId: string;
  branchId: string;
  saleId: string;
  actorId: string;
  fulfillmentStatus: string;
  timestamp: string;
};

export type SaleVoidedV1 = {
  type: "sales.sale_voided";
  v: 1;
  tenantId: string;
  branchId: string;
  saleId: string;
  lines: Array<{ menuItemId: string; qty: number }>;
  actorId: string;
  reason: string;
  timestamp: string;
};

export type SaleReopenedV1 = {
  type: "sales.sale_reopened";
  v: 1;
  tenantId: string;
  branchId: string;
  originalSaleId: string;
  newSaleId: string;
  actorId: string;
  reason: string;
  timestamp: string;
};

export type SaleDraftDeletedV1 = {
  type: "sales.draft_deleted";
  v: 1;
  tenantId: string;
  branchId: string;
  saleId: string;
  actorId: string;
  timestamp: string;
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

export type CashSessionTakenOverV1 = {
  type: "cash.session_taken_over";
  v: 1;
  tenantId: string;
  branchId: string;
  oldSessionId: string;
  newSessionId: string;
  takenOverBy: string;
  reason: string;
  timestamp: string;
};

export type CashMovementRecordedV1 = {
  type: "cash.paid_in" | "cash.paid_out" | "cash.adjustment";
  v: 1;
  tenantId: string;
  branchId: string;
  sessionId: string;
  movementId: string;
  movementType: string;
  amountUsd: number;
  amountKhr: number;
  reason: string;
  actorId: string;
  status: string;
  timestamp: string;
};

export type CashSaleRecordedV1 = {
  type: "cash.sale_cash_recorded";
  v: 1;
  tenantId: string;
  branchId: string;
  sessionId: string;
  registerId?: string;
  saleId: string;
  amountUsd: number;
  amountKhr: number;
  timestamp: string;
};

export type CashRefundRecordedV1 = {
  type: "cash.refund_cash_recorded";
  v: 1;
  tenantId: string;
  branchId: string;
  sessionId: string;
  registerId?: string;
  saleId: string;
  amountUsd: number;
  amountKhr: number;
  reason: string;
  timestamp: string;
};

// Inventory events
export type StockItemCreatedV1 = {
  type: "inventory.stock_item_created";
  v: 1;
  tenantId: string;
  stockItemId: string;
  name: string;
  unitText: string;
  barcode?: string;
  pieceSize?: number;
  isIngredient: boolean;
  isSellable: boolean;
  categoryId?: string;
  imageUrl?: string;
  isActive: boolean;
  createdBy: string;
  createdAt: string;
};

export type StockItemUpdatedV1 = {
  type: "inventory.stock_item_updated";
  v: 1;
  tenantId: string;
  stockItemId: string;
  changes: {
    name?: string;
    unitText?: string;
    barcode?: string;
    pieceSize?: number;
    isIngredient?: boolean;
    isSellable?: boolean;
    categoryId?: string;
    imageUrl?: string;
    isActive?: boolean;
  };
  updatedBy: string;
  updatedAt: string;
};

export type StockReceivedV1 = {
  type: "inventory.stock_received";
  v: 1;
  tenantId: string;
  branchId: string;
  stockItemId: string;
  journalId: string;
  delta: number;
  note?: string;
  actorId?: string;
  createdAt: string;
};

export type StockWastedV1 = {
  type: "inventory.stock_wasted";
  v: 1;
  tenantId: string;
  branchId: string;
  stockItemId: string;
  journalId: string;
  delta: number;
  note?: string;
  actorId?: string;
  createdAt: string;
};

export type StockCorrectedV1 = {
  type: "inventory.stock_corrected";
  v: 1;
  tenantId: string;
  branchId: string;
  stockItemId: string;
  journalId: string;
  delta: number;
  note?: string;
  actorId?: string;
  createdAt: string;
};

export type StockSaleDeductedV1 = {
  type: "inventory.stock_sale_deducted";
  v: 1;
  tenantId: string;
  branchId: string;
  refSaleId: string;
  deductions: Array<{
    stockItemId: string;
    journalId: string;
    delta: number;
  }>;
  createdAt: string;
};

export type StockVoidedV1 = {
  type: "inventory.stock_voided";
  v: 1;
  tenantId: string;
  branchId: string;
  refSaleId: string;
  reversals: Array<{
    stockItemId: string;
    journalId: string;
    delta: number;
  }>;
  createdAt: string;
};

export type StockReopenedV1 = {
  type: "inventory.stock_reopened";
  v: 1;
  tenantId: string;
  branchId: string;
  originalSaleId: string;
  newSaleId: string;
  redeductions: Array<{
    stockItemId: string;
    journalId: string;
    delta: number;
  }>;
  createdAt: string;
};

export type MenuStockMapSetV1 = {
  type: "inventory.menu_stock_map_set";
  v: 1;
  tenantId: string;
  menuItemId: string;
  stockItemId: string;
  qtyPerSale: number;
  updatedBy: string;
  updatedAt: string;
};

export type StorePolicyInventoryUpdatedV1 = {
  type: "inventory.store_policy_updated";
  v: 1;
  tenantId: string;
  changes: {
    inventorySubtractOnFinalize?: boolean;
    branchOverrides?: Record<string, any>;
    excludeMenuItemIds?: string[];
  };
  updatedBy: string;
  updatedAt: string;
};

export type InventoryCategoryCreatedV1 = {
  type: "inventory.category_created";
  v: 1;
  tenantId: string;
  categoryId: string;
  name: string;
  displayOrder: number;
  isActive: boolean;
  createdBy: string;
  createdAt: string;
};

export type InventoryCategoryUpdatedV1 = {
  type: "inventory.category_updated";
  v: 1;
  tenantId: string;
  categoryId: string;
  changes: {
    name?: string;
    displayOrder?: number;
    isActive?: boolean;
  };
  updatedBy: string;
  updatedAt: string;
};

export type InventoryCategoryDeactivatedV1 = {
  type: "inventory.category_deactivated";
  v: 1;
  tenantId: string;
  categoryId: string;
  categoryName: string;
  deactivatedBy: string;
  deactivatedAt: string;
};

export type InventoryCategoryDeletedV1 = {
  type: "inventory.category_deleted";
  v: 1;
  tenantId: string;
  categoryId: string;
  categoryName: string;
  itemsAffected: number;
  safeMode: boolean;
  deletedBy: string;
  deletedAt: string;
};

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
  branchId?: string;
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
  branchId?: string;
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
  branchId?: string;
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

export type ModifierGroupUpdatedV1 = {
  type: "menu.modifier_group_updated";
  v: 1;
  tenantId: string;
  modifierGroupId: string;
  changes: {
    name?: string;
    selectionType?: "SINGLE" | "MULTI";
  };
  updatedBy: string;
  updatedAt: string;
};

export type ModifierOptionUpdatedV1 = {
  type: "menu.modifier_option_updated";
  v: 1;
  tenantId: string;
  modifierGroupId: string;
  modifierOptionId: string;
  changes: {
    label?: string;
    priceAdjustmentUsd?: number;
    isDefault?: boolean;
    isActive?: boolean;
  };
  updatedBy: string;
  updatedAt: string;
};

export type MenuCategoryDeletedV1 = {
  type: "menu.category_deleted";
  v: 1;
  tenantId: string;
  categoryId: string;
  name: string;
  deletedBy: string;
  deletedAt: string;
};

export type ModifierGroupDeletedV1 = {
  type: "menu.modifier_group_deleted";
  v: 1;
  tenantId: string;
  modifierGroupId: string;
  name: string;
  deletedBy: string;
  deletedAt: string;
};

export type ModifierOptionDeletedV1 = {
  type: "menu.modifier_option_deleted";
  v: 1;
  tenantId: string;
  modifierGroupId: string;
  modifierOptionId: string;
  label: string;
  deletedBy: string;
  deletedAt: string;
};

// Union type of all events
export type DomainEvent =
  | SaleDraftCreatedV1
  | SaleFinalizedV1
  | SaleFulfillmentUpdatedV1
  | SaleVoidedV1
  | SaleReopenedV1
  | SaleDraftDeletedV1
  | CashSessionOpenedV1
  | CashSessionClosedV1
  | CashSessionTakenOverV1
  | CashMovementRecordedV1
  | CashSaleRecordedV1
  | CashRefundRecordedV1
  | StockItemCreatedV1
  | StockItemUpdatedV1
  | StockReceivedV1
  | StockWastedV1
  | StockCorrectedV1
  | StockSaleDeductedV1
  | StockVoidedV1
  | StockReopenedV1
  | MenuStockMapSetV1
  | StorePolicyInventoryUpdatedV1
  | InventoryCategoryCreatedV1
  | InventoryCategoryUpdatedV1
  | InventoryCategoryDeactivatedV1
  | InventoryCategoryDeletedV1
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
  | ModifierOptionAddedV1
  | MenuCategoryDeletedV1
  | ModifierGroupUpdatedV1
  | ModifierOptionUpdatedV1
  | ModifierGroupDeletedV1
  | ModifierOptionDeletedV1;
