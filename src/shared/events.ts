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

// Union type of all events
export type DomainEvent =
  | SaleFinalizedV1
  | CashSessionOpenedV1
  | CashSessionClosedV1
  | StockAdjustedV1;
