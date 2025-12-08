export type CashRegisterStatus = "ACTIVE" | "INACTIVE";
export type CashSessionStatus =
  | "OPEN"
  | "CLOSED"
  | "PENDING_REVIEW"
  | "APPROVED";
export type CashMovementType =
  | "SALE_CASH"
  | "REFUND_CASH"
  | "PAID_IN"
  | "PAID_OUT"
  | "ADJUSTMENT";
export type CashMovementStatus = "APPROVED" | "PENDING" | "DECLINED";

export interface CashRegister {
  id: string;
  tenantId: string;
  branchId: string;
  name: string;
  status: CashRegisterStatus;
  createdAt: Date;
  updatedAt: Date;
}

export interface CashSession {
  id: string;
  tenantId: string;
  branchId: string;
  registerId?: string; // Optional for device-agnostic sessions
  openedBy: string;
  openedAt: Date;
  openingFloatUsd: number;
  openingFloatKhr: number;
  status: CashSessionStatus;
  closedBy?: string;
  closedAt?: Date;
  expectedCashUsd: number;
  expectedCashKhr: number;
  countedCashUsd: number;
  countedCashKhr: number;
  varianceUsd: number;
  varianceKhr: number;
  note?: string;
  createdAt: Date;
  updatedAt: Date;

  // Relations
  register?: CashRegister;
  movements?: CashMovement[];
}

export interface CashMovement {
  id: string;
  tenantId: string;
  branchId: string;
  registerId?: string; // Optional for device-agnostic sessions
  sessionId: string;
  actorId: string;
  type: CashMovementType;
  status: CashMovementStatus;
  amountUsd: number;
  amountKhr: number;
  refSaleId?: string;
  reason?: string;
  createdAt: Date;
}
