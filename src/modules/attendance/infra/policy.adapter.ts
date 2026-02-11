import type { Pool } from "pg";
import type {
  AttendancePolicyPort,
  AttendancePolicySnapshot,
} from "../app/use-cases.js";

export class AttendancePolicyAdapter implements AttendancePolicyPort {
  constructor(private pool: Pool) {}

  async getAttendancePolicies(params: {
    tenantId: string;
    branchId: string;
  }): Promise<AttendancePolicySnapshot | null> {
    const result = await this.pool.query(
      `SELECT
        auto_from_cash_session,
        require_out_of_shift_approval,
        early_checkin_buffer_enabled,
        checkin_buffer_minutes,
        allow_manager_edits
       FROM branch_attendance_policies
       WHERE tenant_id = $1 AND branch_id = $2`,
      [params.tenantId, params.branchId]
    );

    if (result.rows.length === 0) {
      return {
        autoFromCashSession: false,
        requireOutOfShiftApproval: false,
        earlyCheckinBufferEnabled: false,
        checkinBufferMinutes: 15,
        allowManagerEdits: false,
      };
    }

    const row = result.rows[0];
    return {
      autoFromCashSession: row.auto_from_cash_session,
      requireOutOfShiftApproval: row.require_out_of_shift_approval,
      earlyCheckinBufferEnabled: row.early_checkin_buffer_enabled,
      checkinBufferMinutes: Number(row.checkin_buffer_minutes),
      allowManagerEdits: row.allow_manager_edits,
    };
  }
}
