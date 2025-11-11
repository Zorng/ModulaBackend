// TODO: Define Reporting read models
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
