// TODO: Define Cash entities
// Example: CashSession, CashMovement

export interface CashSession {
  id: string;
  tenantId: string;
  branchId: string;
  openedBy: string;
  openedAt: Date;
  openingFloat: number;
  closedBy?: string;
  closedAt?: Date;
  expectedCash: number;
  actualCash: number;
  variance: number;
  status: "OPEN" | "CLOSED";
}

export interface CashMovement {
  id: string;
  sessionId: string;
  type: "PAID_IN" | "PAID_OUT" | "SALE";
  amount: number;
  reason?: string;
  createdBy: string;
  createdAt: Date;
}
