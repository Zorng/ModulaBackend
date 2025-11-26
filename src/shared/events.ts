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

// Union type of all events
export type DomainEvent =
  | SaleDraftCreatedV1
  | SaleFinalizedV1
  | SaleFulfillmentUpdatedV1
  | SaleVoidedV1
  | SaleReopenedV1
  | CashSessionOpenedV1
  | CashSessionClosedV1
  | StockAdjustedV1;
