import type { Pool } from "pg";

export interface AccountProfile {
  id: string;
  display_name: string | null;
  first_name: string;
  last_name: string;
  phone: string;
  status: string;
}

export class AccountSettingsRepository {
  constructor(private pool: Pool) {}

  async updateDisplayName(
    employeeId: string,
    displayName: string
  ): Promise<AccountProfile> {
    const result = await this.pool.query(
      `UPDATE employees
       SET display_name = $1, updated_at = NOW()
       WHERE id = $2
       RETURNING id, display_name, first_name, last_name, phone, status`,
      [displayName, employeeId]
    );

    if (result.rows.length === 0) {
      throw new Error("Employee not found");
    }

    return result.rows[0] as AccountProfile;
  }
}

