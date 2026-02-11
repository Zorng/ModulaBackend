import type { Pool } from "pg";

export type ShiftScheduleEntry = {
  dayOfWeek: number;
  startTime: string | null;
  endTime: string | null;
  isOff: boolean;
};

export class AttendanceShiftRepository {
  constructor(private pool: Pool) {}

  async listShiftSchedule(params: {
    tenantId: string;
    employeeId: string;
    branchId: string;
  }): Promise<ShiftScheduleEntry[]> {
    const result = await this.pool.query(
      `SELECT day_of_week, start_time, end_time, is_off
       FROM staff_shift_assignments
       WHERE tenant_id = $1 AND employee_id = $2 AND branch_id = $3
       ORDER BY day_of_week ASC`,
      [params.tenantId, params.employeeId, params.branchId]
    );

    return result.rows.map((row) => ({
      dayOfWeek: Number(row.day_of_week),
      startTime: row.start_time ? String(row.start_time) : null,
      endTime: row.end_time ? String(row.end_time) : null,
      isOff: row.is_off,
    }));
  }
}
