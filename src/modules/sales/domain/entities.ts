// TODO: Define Sales entities
// Example: Sale, SaleLine, Tender

export interface Sale {
  id: string;
  tenantId: string;
  branchId: string;
  status: "DRAFT" | "FINALIZED" | "VOID";
  subtotal: number;
  tax: number;
  discount: number;
  total: number;
  finalizedAt?: Date;
  finalizedBy?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface SaleLine {
  id: string;
  saleId: string;
  menuItemId: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
}

export interface Tender {
  id: string;
  saleId: string;
  method: "CASH" | "QR" | "CARD";
  amountUsd: number;
  amountKhr: number;
  createdAt: Date;
}
