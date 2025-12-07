// Policy domain entities
// Represents tenant-level configuration matching frontend UI

/**
 * Complete tenant policy configuration
 * Includes only the settings displayed in the frontend
 */
export interface TenantPolicies {
  tenantId: string;

  // ==================== TAX & CURRENCY ====================
  saleVatEnabled: boolean;
  saleVatRatePercent: number;
  saleFxRateKhrPerUsd: number;
  saleKhrRoundingEnabled: boolean;
  saleKhrRoundingMode: "NEAREST" | "UP" | "DOWN";
  saleKhrRoundingGranularity: "100" | "1000";

  // ==================== INVENTORY BEHAVIOR ====================
  inventoryAutoSubtractOnSale: boolean;
  inventoryExpiryTrackingEnabled: boolean;

  // ==================== CASH SESSIONS CONTROL ====================
  cashRequireSessionForSales: boolean;
  cashAllowPaidOut: boolean;
  cashRequireRefundApproval: boolean;
  cashAllowManualAdjustment: boolean;

  // ==================== ATTENDANCE & SHIFTS ====================
  attendanceAutoFromCashSession: boolean;
  attendanceRequireOutOfShiftApproval: boolean;
  attendanceEarlyCheckinBufferEnabled: boolean;
  attendanceCheckinBufferMinutes: number;
  attendanceAllowManagerEdits: boolean;

  // Timestamps
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Sales policies - tax, currency, and rounding settings
 */
export interface SalesPolicies {
  tenantId: string;
  vatEnabled: boolean;
  vatRatePercent: number;
  fxRateKhrPerUsd: number;
  khrRoundingEnabled: boolean;
  khrRoundingMode: "NEAREST" | "UP" | "DOWN";
  khrRoundingGranularity: "100" | "1000";
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Inventory policies - stock management settings
 */
export interface InventoryPolicies {
  tenantId: string;
  autoSubtractOnSale: boolean;
  expiryTrackingEnabled: boolean;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Cash session policies - cash handling settings
 */
export interface CashSessionPolicies {
  tenantId: string;
  requireSessionForSales: boolean;
  allowPaidOut: boolean;
  requireRefundApproval: boolean;
  allowManualAdjustment: boolean;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Attendance policies - shift management settings
 */
export interface AttendancePolicies {
  tenantId: string;
  autoFromCashSession: boolean;
  requireOutOfShiftApproval: boolean;
  earlyCheckinBufferEnabled: boolean;
  checkinBufferMinutes: number;
  allowManagerEdits: boolean;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Input for updating tenant policies
 * All fields are optional for partial updates
 */
export interface UpdateTenantPoliciesInput {
  // Tax & Currency
  saleVatEnabled?: boolean;
  saleVatRatePercent?: number;
  saleFxRateKhrPerUsd?: number;
  saleKhrRoundingEnabled?: boolean;
  saleKhrRoundingMode?: "NEAREST" | "UP" | "DOWN";
  saleKhrRoundingGranularity?: "100" | "1000";

  // Inventory
  inventoryAutoSubtractOnSale?: boolean;
  inventoryExpiryTrackingEnabled?: boolean;

  // Cash Sessions
  cashRequireSessionForSales?: boolean;
  cashAllowPaidOut?: boolean;
  cashRequireRefundApproval?: boolean;
  cashAllowManualAdjustment?: boolean;

  // Attendance
  attendanceAutoFromCashSession?: boolean;
  attendanceRequireOutOfShiftApproval?: boolean;
  attendanceEarlyCheckinBufferEnabled?: boolean;
  attendanceCheckinBufferMinutes?: number;
  attendanceAllowManagerEdits?: boolean;
}
