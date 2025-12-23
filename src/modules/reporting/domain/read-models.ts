export type CashSessionStatus =
  | "OPEN"
  | "CLOSED"
  | "PENDING_REVIEW"
  | "APPROVED";

export type CashSessionStatusFilter = "ALL" | "OPEN" | "CLOSED";

export interface CashSessionReportListItem {
  id: string;
  status: CashSessionStatus;
  openedAt: Date;
  closedAt?: Date | null;
  openedById: string;
  openedByName: string;
}

export interface CashSessionReportDetail {
  id: string;
  status: CashSessionStatus;
  openedAt: Date;
  closedAt?: Date | null;
  openedById: string;
  openedByName: string;
  openingFloatUsd: number;
  openingFloatKhr: number;
  totalSalesCashUsd: number;
  totalSalesCashKhr: number;
  totalPaidInUsd: number;
  totalPaidInKhr: number;
  totalPaidOutUsd: number;
  totalPaidOutKhr: number;
  expectedCashUsd: number;
  expectedCashKhr: number;
  countedCashUsd: number;
  countedCashKhr: number;
  varianceUsd: number;
  varianceKhr: number;
}

export interface ZReportSummary {
  date: string;
  sessionCount: number;
  openingFloatUsd: number;
  openingFloatKhr: number;
  totalSalesCashUsd: number;
  totalSalesCashKhr: number;
  totalPaidInUsd: number;
  totalPaidInKhr: number;
  totalPaidOutUsd: number;
  totalPaidOutKhr: number;
  expectedCashUsd: number;
  expectedCashKhr: number;
}
// Example: SalesAggregate, InventorySnapshot

export interface SalesAggregate {
  tenantId: string;
  branchId: string;
  date: string;
  totalSales: number;
  totalTransactions: number;
  avgTransactionValue: number;
}

export interface InventorySnapshot {
  tenantId: string;
  branchId: string;
  stockItemId: string;
  currentStock: number;
  valueAtCost: number;
  lastRestockDate: Date;
}

export interface CashAggregate {
  tenantId: string;
  branchId: string;
  date: string;
  totalCashSales: number;
  totalPaidOuts: number;
  netCash: number;
}
