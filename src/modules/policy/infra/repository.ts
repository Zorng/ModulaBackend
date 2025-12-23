import type { Pool } from "pg";
import type {
  TenantPolicies,
  SalesPolicies,
  InventoryPolicies,
  CashSessionPolicies,
  AttendancePolicies,
  UpdateTenantPoliciesInput,
} from "../domain/entities.js";

/**
 * Repository interface for policy operations
 */
export interface IPolicyRepository {
  getTenantPolicies(
    tenantId: string,
    branchId: string
  ): Promise<TenantPolicies | null>;
  getSalesPolicies(
    tenantId: string,
    branchId: string
  ): Promise<SalesPolicies | null>;
  getInventoryPolicies(
    tenantId: string,
    branchId: string
  ): Promise<InventoryPolicies | null>;
  getCashSessionPolicies(
    tenantId: string,
    branchId: string
  ): Promise<CashSessionPolicies | null>;
  getAttendancePolicies(
    tenantId: string,
    branchId: string
  ): Promise<AttendancePolicies | null>;
  updateTenantPolicies(
    tenantId: string,
    branchId: string,
    updates: UpdateTenantPoliciesInput
  ): Promise<TenantPolicies>;
  ensureDefaultPolicies(
    tenantId: string,
    branchId: string
  ): Promise<TenantPolicies>;
}

/**
 * PostgreSQL implementation of the policy repository
 */
export class PgPolicyRepository implements IPolicyRepository {
  constructor(private pool: Pool) {
  }

  /**
   * Get all policies for a tenant (combines all policy types)
   */
  async getTenantPolicies(
    tenantId: string,
    branchId: string
  ): Promise<TenantPolicies | null> {
    const [sales, inventory, cashSession, attendance] = await Promise.all([
      this.getSalesPolicies(tenantId, branchId),
      this.getInventoryPolicies(tenantId, branchId),
      this.getCashSessionPolicies(tenantId, branchId),
      this.getAttendancePolicies(tenantId, branchId),
    ]);

    if (!sales || !inventory || !cashSession || !attendance) {
      return null;
    }

    return {
      tenantId,
      branchId,
      // Sales
      saleVatEnabled: sales.vatEnabled,
      saleVatRatePercent: sales.vatRatePercent,
      saleFxRateKhrPerUsd: sales.fxRateKhrPerUsd,
      saleKhrRoundingEnabled: sales.khrRoundingEnabled,
      saleKhrRoundingMode: sales.khrRoundingMode,
      saleKhrRoundingGranularity: sales.khrRoundingGranularity,
      // Inventory
      inventoryAutoSubtractOnSale: inventory.autoSubtractOnSale,
      inventoryExpiryTrackingEnabled: inventory.expiryTrackingEnabled,
      // Cash Session
      cashRequireSessionForSales: cashSession.requireSessionForSales,
      cashAllowPaidOut: cashSession.allowPaidOut,
      cashRequireRefundApproval: cashSession.requireRefundApproval,
      cashAllowManualAdjustment: cashSession.allowManualAdjustment,
      // Attendance
      attendanceAutoFromCashSession: attendance.autoFromCashSession,
      attendanceRequireOutOfShiftApproval: attendance.requireOutOfShiftApproval,
      attendanceEarlyCheckinBufferEnabled: attendance.earlyCheckinBufferEnabled,
      attendanceCheckinBufferMinutes: attendance.checkinBufferMinutes,
      attendanceAllowManagerEdits: attendance.allowManagerEdits,
      // Timestamps (use most recent)
      createdAt: sales.createdAt,
      updatedAt: new Date(
        Math.max(
          sales.updatedAt.getTime(),
          inventory.updatedAt.getTime(),
          cashSession.updatedAt.getTime(),
          attendance.updatedAt.getTime()
        )
      ),
    };
  }

  /**
   * Get sales policies
   */
  async getSalesPolicies(
    tenantId: string,
    branchId: string
  ): Promise<SalesPolicies | null> {
    const result = await this.pool.query(
      `SELECT * FROM branch_sales_policies WHERE tenant_id = $1 AND branch_id = $2`,
      [tenantId, branchId]
    );

    if (result.rows.length === 0) {
      return null;
    }

    const row = result.rows[0];
    return {
      tenantId,
      branchId,
      vatEnabled: row.vat_enabled,
      vatRatePercent: parseFloat(row.vat_rate_percent),
      fxRateKhrPerUsd: parseFloat(row.fx_rate_khr_per_usd),
      khrRoundingEnabled: row.khr_rounding_enabled,
      khrRoundingMode: row.khr_rounding_mode,
      khrRoundingGranularity: row.khr_rounding_granularity,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    };
  }

  /**
   * Get inventory policies
   */
  async getInventoryPolicies(
    tenantId: string,
    branchId: string
  ): Promise<InventoryPolicies | null> {
    const result = await this.pool.query(
      `SELECT * FROM branch_inventory_policies WHERE tenant_id = $1 AND branch_id = $2`,
      [tenantId, branchId]
    );

    if (result.rows.length === 0) {
      return null;
    }

    const row = result.rows[0];
    return {
      tenantId,
      branchId,
      autoSubtractOnSale: row.auto_subtract_on_sale,
      expiryTrackingEnabled: row.expiry_tracking_enabled,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    };
  }

  /**
   * Get cash session policies
   */
  async getCashSessionPolicies(
    tenantId: string,
    branchId: string
  ): Promise<CashSessionPolicies | null> {
    const result = await this.pool.query(
      `SELECT * FROM branch_cash_session_policies WHERE tenant_id = $1 AND branch_id = $2`,
      [tenantId, branchId]
    );

    if (result.rows.length === 0) {
      return null;
    }

    const row = result.rows[0];
    return {
      tenantId,
      branchId,
      requireSessionForSales: row.require_session_for_sales,
      allowPaidOut: row.allow_paid_out,
      requireRefundApproval: row.require_refund_approval,
      allowManualAdjustment: row.allow_manual_adjustment,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    };
  }

  /**
   * Get attendance policies
   */
  async getAttendancePolicies(
    tenantId: string,
    branchId: string
  ): Promise<AttendancePolicies | null> {
    const result = await this.pool.query(
      `SELECT * FROM branch_attendance_policies WHERE tenant_id = $1 AND branch_id = $2`,
      [tenantId, branchId]
    );

    if (result.rows.length === 0) {
      return null;
    }

    const row = result.rows[0];
    return {
      tenantId,
      branchId,
      autoFromCashSession: row.auto_from_cash_session,
      requireOutOfShiftApproval: row.require_out_of_shift_approval,
      earlyCheckinBufferEnabled: row.early_checkin_buffer_enabled,
      checkinBufferMinutes: row.checkin_buffer_minutes,
      allowManagerEdits: row.allow_manager_edits,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    };
  }

  /**
   * Update tenant policies
   */
  async updateTenantPolicies(
    tenantId: string,
    branchId: string,
    updates: UpdateTenantPoliciesInput
  ): Promise<TenantPolicies> {
    // Categorize updates by policy type
    const salesUpdates: Partial<SalesPolicies> = {};
    const inventoryUpdates: Partial<InventoryPolicies> = {};
    const cashSessionUpdates: Partial<CashSessionPolicies> = {};
    const attendanceUpdates: Partial<AttendancePolicies> = {};

    for (const [key, value] of Object.entries(updates)) {
      // Sales policies
      if (key === "saleVatEnabled") salesUpdates.vatEnabled = value as boolean;
      else if (key === "saleVatRatePercent")
        salesUpdates.vatRatePercent = value as number;
      else if (key === "saleFxRateKhrPerUsd")
        salesUpdates.fxRateKhrPerUsd = value as number;
      else if (key === "saleKhrRoundingEnabled")
        salesUpdates.khrRoundingEnabled = value as boolean;
      else if (key === "saleKhrRoundingMode")
        salesUpdates.khrRoundingMode = value as "NEAREST" | "UP" | "DOWN";
      else if (key === "saleKhrRoundingGranularity")
        salesUpdates.khrRoundingGranularity = value as "100" | "1000";
      // Inventory policies
      else if (key === "inventoryAutoSubtractOnSale")
        inventoryUpdates.autoSubtractOnSale = value as boolean;
      else if (key === "inventoryExpiryTrackingEnabled")
        inventoryUpdates.expiryTrackingEnabled = value as boolean;
      // Cash session policies
      else if (key === "cashRequireSessionForSales")
        cashSessionUpdates.requireSessionForSales = value as boolean;
      else if (key === "cashAllowPaidOut")
        cashSessionUpdates.allowPaidOut = value as boolean;
      else if (key === "cashRequireRefundApproval")
        cashSessionUpdates.requireRefundApproval = value as boolean;
      else if (key === "cashAllowManualAdjustment")
        cashSessionUpdates.allowManualAdjustment = value as boolean;
      // Attendance policies
      else if (key === "attendanceAutoFromCashSession")
        attendanceUpdates.autoFromCashSession = value as boolean;
      else if (key === "attendanceRequireOutOfShiftApproval")
        attendanceUpdates.requireOutOfShiftApproval = value as boolean;
      else if (key === "attendanceEarlyCheckinBufferEnabled")
        attendanceUpdates.earlyCheckinBufferEnabled = value as boolean;
      else if (key === "attendanceCheckinBufferMinutes")
        attendanceUpdates.checkinBufferMinutes = value as number;
      else if (key === "attendanceAllowManagerEdits")
        attendanceUpdates.allowManagerEdits = value as boolean;
    }

    // Execute updates in parallel
    await Promise.all([
      Object.keys(salesUpdates).length > 0
        ? this.updateSalesPolicies(tenantId, branchId, salesUpdates)
        : Promise.resolve(),
      Object.keys(inventoryUpdates).length > 0
        ? this.updateInventoryPolicies(tenantId, branchId, inventoryUpdates)
        : Promise.resolve(),
      Object.keys(cashSessionUpdates).length > 0
        ? this.updateCashSessionPolicies(tenantId, branchId, cashSessionUpdates)
        : Promise.resolve(),
      Object.keys(attendanceUpdates).length > 0
        ? this.updateAttendancePolicies(tenantId, branchId, attendanceUpdates)
        : Promise.resolve(),
    ]);

    // Return updated combined policies
    const result = await this.getTenantPolicies(tenantId, branchId);
    if (!result) {
      throw new Error("Failed to retrieve updated policies");
    }
    return result;
  }

  /**
   * Ensure default policies exist for a tenant
   */
  async ensureDefaultPolicies(
    tenantId: string,
    branchId: string
  ): Promise<TenantPolicies> {
    await Promise.all([
      this.pool.query(
        `INSERT INTO branch_sales_policies (tenant_id, branch_id)
         VALUES ($1, $2)
         ON CONFLICT (tenant_id, branch_id) DO NOTHING`,
        [tenantId, branchId]
      ),
      this.pool.query(
        `INSERT INTO branch_inventory_policies (tenant_id, branch_id)
         VALUES ($1, $2)
         ON CONFLICT (tenant_id, branch_id) DO NOTHING`,
        [tenantId, branchId]
      ),
      this.pool.query(
        `INSERT INTO branch_cash_session_policies (tenant_id, branch_id)
         VALUES ($1, $2)
         ON CONFLICT (tenant_id, branch_id) DO NOTHING`,
        [tenantId, branchId]
      ),
      this.pool.query(
        `INSERT INTO branch_attendance_policies (tenant_id, branch_id)
         VALUES ($1, $2)
         ON CONFLICT (tenant_id, branch_id) DO NOTHING`,
        [tenantId, branchId]
      ),
    ]);

    const result = await this.getTenantPolicies(tenantId, branchId);
    if (!result) {
      throw new Error("Failed to create default policies");
    }
    return result;
  }

  /**
   * Update sales policies
   */
  private async updateSalesPolicies(
    tenantId: string,
    branchId: string,
    updates: Partial<SalesPolicies>
  ): Promise<void> {
    const setClauses: string[] = [];
    const values: any[] = [tenantId, branchId];
    let paramIndex = 3;

    const fieldMap: Record<string, string> = {
      vatEnabled: "vat_enabled",
      vatRatePercent: "vat_rate_percent",
      fxRateKhrPerUsd: "fx_rate_khr_per_usd",
      khrRoundingEnabled: "khr_rounding_enabled",
      khrRoundingMode: "khr_rounding_mode",
      khrRoundingGranularity: "khr_rounding_granularity",
    };

    for (const [key, value] of Object.entries(updates)) {
      const dbColumn = fieldMap[key];
      if (dbColumn && value !== undefined) {
        setClauses.push(`${dbColumn} = $${paramIndex}`);
        values.push(value);
        paramIndex++;
      }
    }

    if (setClauses.length === 0) return;

    await this.pool.query(
      `UPDATE branch_sales_policies
       SET ${setClauses.join(", ")}
       WHERE tenant_id = $1 AND branch_id = $2`,
      values
    );
  }

  /**
   * Update inventory policies
   */
  private async updateInventoryPolicies(
    tenantId: string,
    branchId: string,
    updates: Partial<InventoryPolicies>
  ): Promise<void> {
    const setClauses: string[] = [];
    const values: any[] = [tenantId, branchId];
    let paramIndex = 3;

    const fieldMap: Record<string, string> = {
      autoSubtractOnSale: "auto_subtract_on_sale",
      expiryTrackingEnabled: "expiry_tracking_enabled",
    };

    for (const [key, value] of Object.entries(updates)) {
      const dbColumn = fieldMap[key];
      if (dbColumn && value !== undefined) {
        setClauses.push(`${dbColumn} = $${paramIndex}`);
        values.push(value);
        paramIndex++;
      }
    }

    if (setClauses.length === 0) return;

    await this.pool.query(
      `UPDATE branch_inventory_policies
       SET ${setClauses.join(", ")}
       WHERE tenant_id = $1 AND branch_id = $2`,
      values
    );
  }

  /**
   * Update cash session policies
   */
  private async updateCashSessionPolicies(
    tenantId: string,
    branchId: string,
    updates: Partial<CashSessionPolicies>
  ): Promise<void> {
    const setClauses: string[] = [];
    const values: any[] = [tenantId, branchId];
    let paramIndex = 3;

    const fieldMap: Record<string, string> = {
      requireSessionForSales: "require_session_for_sales",
      allowPaidOut: "allow_paid_out",
      requireRefundApproval: "require_refund_approval",
      allowManualAdjustment: "allow_manual_adjustment",
    };

    for (const [key, value] of Object.entries(updates)) {
      const dbColumn = fieldMap[key];
      if (dbColumn && value !== undefined) {
        setClauses.push(`${dbColumn} = $${paramIndex}`);
        values.push(value);
        paramIndex++;
      }
    }

    if (setClauses.length === 0) return;

    await this.pool.query(
      `UPDATE branch_cash_session_policies
       SET ${setClauses.join(", ")}
       WHERE tenant_id = $1 AND branch_id = $2`,
      values
    );
  }

  /**
   * Update attendance policies
   */
  private async updateAttendancePolicies(
    tenantId: string,
    branchId: string,
    updates: Partial<AttendancePolicies>
  ): Promise<void> {
    const setClauses: string[] = [];
    const values: any[] = [tenantId, branchId];
    let paramIndex = 3;

    const fieldMap: Record<string, string> = {
      autoFromCashSession: "auto_from_cash_session",
      requireOutOfShiftApproval: "require_out_of_shift_approval",
      earlyCheckinBufferEnabled: "early_checkin_buffer_enabled",
      checkinBufferMinutes: "checkin_buffer_minutes",
      allowManagerEdits: "allow_manager_edits",
    };

    for (const [key, value] of Object.entries(updates)) {
      const dbColumn = fieldMap[key];
      if (dbColumn && value !== undefined) {
        setClauses.push(`${dbColumn} = $${paramIndex}`);
        values.push(value);
        paramIndex++;
      }
    }

    if (setClauses.length === 0) return;

    await this.pool.query(
      `UPDATE branch_attendance_policies
       SET ${setClauses.join(", ")}
       WHERE tenant_id = $1 AND branch_id = $2`,
      values
    );
  }
}
