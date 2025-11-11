// TODO: Define Policy entities
// Example: SalePolicy, InventoryPolicy, Capabilities

export interface SalePolicy {
  tenantId: string;
  vatRate: number;
  defaultDiscountRate: number;
  allowRefunds: boolean;
  allowVoid: boolean;
}

export interface InventoryPolicy {
  tenantId: string;
  allowNegativeStock: boolean;
  lowStockThreshold: number;
  autoReorderEnabled: boolean;
}

export interface Capabilities {
  tenantId: string;
  features: {
    basePOS: boolean;
    multiBranch: boolean;
    attendance: boolean;
    inventory: boolean;
    reporting: boolean;
  };
  limits: {
    maxBranches: number;
    maxStaff: number;
  };
}
