import type { Pool, PoolClient } from "pg";

type Queryable = Pick<Pool, "query"> | Pick<PoolClient, "query">;

export type V0ShiftPatternStatus = "ACTIVE" | "INACTIVE";
export type V0ShiftInstanceStatus = "PLANNED" | "UPDATED" | "CANCELLED";

export type V0TenantMembershipRow = {
  id: string;
  tenant_id: string;
  account_id: string;
  role_key: string;
  status: "INVITED" | "ACTIVE" | "REVOKED";
};

export type V0BranchRow = {
  id: string;
  tenant_id: string;
  status: string;
};

export type V0ShiftPatternRow = {
  id: string;
  tenant_id: string;
  membership_id: string;
  branch_id: string;
  days_of_week: number[];
  planned_start_time: string;
  planned_end_time: string;
  effective_from: Date | null;
  effective_to: Date | null;
  status: V0ShiftPatternStatus;
  note: string | null;
  created_by_account_id: string | null;
  updated_by_account_id: string | null;
  deactivated_at: Date | null;
  created_at: Date;
  updated_at: Date;
};

export type V0ShiftInstanceRow = {
  id: string;
  tenant_id: string;
  membership_id: string;
  branch_id: string;
  pattern_id: string | null;
  shift_date: Date;
  planned_start_time: string;
  planned_end_time: string;
  status: V0ShiftInstanceStatus;
  note: string | null;
  cancelled_reason: string | null;
  created_by_account_id: string | null;
  updated_by_account_id: string | null;
  cancelled_at: Date | null;
  created_at: Date;
  updated_at: Date;
};

export class V0ShiftRepository {
  constructor(private readonly db: Queryable) {}

  async findActiveMembershipForAccountInTenant(input: {
    accountId: string;
    tenantId: string;
  }): Promise<V0TenantMembershipRow | null> {
    const result = await this.db.query<V0TenantMembershipRow>(
      `SELECT id, tenant_id, account_id, role_key, status
       FROM v0_tenant_memberships
       WHERE account_id = $1
         AND tenant_id = $2
         AND status = 'ACTIVE'`,
      [input.accountId, input.tenantId]
    );
    return result.rows[0] ?? null;
  }

  async findMembershipByIdInTenant(input: {
    membershipId: string;
    tenantId: string;
  }): Promise<V0TenantMembershipRow | null> {
    const result = await this.db.query<V0TenantMembershipRow>(
      `SELECT id, tenant_id, account_id, role_key, status
       FROM v0_tenant_memberships
       WHERE id = $1
         AND tenant_id = $2`,
      [input.membershipId, input.tenantId]
    );
    return result.rows[0] ?? null;
  }

  async hasActiveBranchAssignmentForMembership(input: {
    membershipId: string;
    branchId: string;
  }): Promise<boolean> {
    const result = await this.db.query<{ exists: boolean }>(
      `SELECT EXISTS (
         SELECT 1
         FROM v0_branch_assignments
         WHERE membership_id = $1
           AND branch_id = $2
           AND status = 'ACTIVE'
       ) AS exists`,
      [input.membershipId, input.branchId]
    );
    return result.rows[0]?.exists ?? false;
  }

  async findBranchByIdInTenant(input: {
    branchId: string;
    tenantId: string;
  }): Promise<V0BranchRow | null> {
    const result = await this.db.query<V0BranchRow>(
      `SELECT id, tenant_id, status
       FROM branches
       WHERE id = $1
         AND tenant_id = $2`,
      [input.branchId, input.tenantId]
    );
    return result.rows[0] ?? null;
  }

  async findActiveBranchByIdInTenant(input: {
    branchId: string;
    tenantId: string;
  }): Promise<V0BranchRow | null> {
    const result = await this.db.query<V0BranchRow>(
      `SELECT id, tenant_id, status
       FROM branches
       WHERE id = $1
         AND tenant_id = $2
         AND status = 'ACTIVE'`,
      [input.branchId, input.tenantId]
    );
    return result.rows[0] ?? null;
  }

  async findShiftPatternByIdInTenant(input: {
    patternId: string;
    tenantId: string;
  }): Promise<V0ShiftPatternRow | null> {
    const result = await this.db.query<V0ShiftPatternRow>(
      `SELECT
         id,
         tenant_id,
         membership_id,
         branch_id,
         days_of_week,
         planned_start_time::TEXT AS planned_start_time,
         planned_end_time::TEXT AS planned_end_time,
         effective_from,
         effective_to,
         status,
         note,
         created_by_account_id,
         updated_by_account_id,
         deactivated_at,
         created_at,
         updated_at
       FROM v0_shift_patterns
       WHERE id = $1
         AND tenant_id = $2`,
      [input.patternId, input.tenantId]
    );
    return result.rows[0] ?? null;
  }

  async insertShiftPattern(input: {
    tenantId: string;
    membershipId: string;
    branchId: string;
    daysOfWeek: readonly number[];
    plannedStartTime: string;
    plannedEndTime: string;
    effectiveFrom: string | null;
    effectiveTo: string | null;
    note: string | null;
    actorAccountId: string | null;
  }): Promise<V0ShiftPatternRow> {
    const result = await this.db.query<V0ShiftPatternRow>(
      `INSERT INTO v0_shift_patterns (
         tenant_id,
         membership_id,
         branch_id,
         days_of_week,
         planned_start_time,
         planned_end_time,
         effective_from,
         effective_to,
         note,
         created_by_account_id,
         updated_by_account_id
       )
       VALUES ($1, $2, $3, $4::SMALLINT[], $5::TIME, $6::TIME, $7::DATE, $8::DATE, $9, $10, $10)
       RETURNING
         id,
         tenant_id,
         membership_id,
         branch_id,
         days_of_week,
         planned_start_time::TEXT AS planned_start_time,
         planned_end_time::TEXT AS planned_end_time,
         effective_from,
         effective_to,
         status,
         note,
         created_by_account_id,
         updated_by_account_id,
         deactivated_at,
         created_at,
         updated_at`,
      [
        input.tenantId,
        input.membershipId,
        input.branchId,
        input.daysOfWeek,
        input.plannedStartTime,
        input.plannedEndTime,
        input.effectiveFrom,
        input.effectiveTo,
        input.note,
        input.actorAccountId,
      ]
    );
    return result.rows[0];
  }

  async updateShiftPattern(input: {
    patternId: string;
    tenantId: string;
    membershipId: string;
    branchId: string;
    daysOfWeek: readonly number[];
    plannedStartTime: string;
    plannedEndTime: string;
    effectiveFrom: string | null;
    effectiveTo: string | null;
    note: string | null;
    actorAccountId: string | null;
  }): Promise<V0ShiftPatternRow | null> {
    const result = await this.db.query<V0ShiftPatternRow>(
      `UPDATE v0_shift_patterns
       SET membership_id = $3,
           branch_id = $4,
           days_of_week = $5::SMALLINT[],
           planned_start_time = $6::TIME,
           planned_end_time = $7::TIME,
           effective_from = $8::DATE,
           effective_to = $9::DATE,
           note = $10,
           updated_by_account_id = $11,
           updated_at = NOW()
       WHERE id = $1
         AND tenant_id = $2
       RETURNING
         id,
         tenant_id,
         membership_id,
         branch_id,
         days_of_week,
         planned_start_time::TEXT AS planned_start_time,
         planned_end_time::TEXT AS planned_end_time,
         effective_from,
         effective_to,
         status,
         note,
         created_by_account_id,
         updated_by_account_id,
         deactivated_at,
         created_at,
         updated_at`,
      [
        input.patternId,
        input.tenantId,
        input.membershipId,
        input.branchId,
        input.daysOfWeek,
        input.plannedStartTime,
        input.plannedEndTime,
        input.effectiveFrom,
        input.effectiveTo,
        input.note,
        input.actorAccountId,
      ]
    );
    return result.rows[0] ?? null;
  }

  async deactivateShiftPattern(input: {
    patternId: string;
    tenantId: string;
    actorAccountId: string | null;
  }): Promise<V0ShiftPatternRow | null> {
    const result = await this.db.query<V0ShiftPatternRow>(
      `UPDATE v0_shift_patterns
       SET status = 'INACTIVE',
           deactivated_at = COALESCE(deactivated_at, NOW()),
           updated_by_account_id = $3,
           updated_at = NOW()
       WHERE id = $1
         AND tenant_id = $2
       RETURNING
         id,
         tenant_id,
         membership_id,
         branch_id,
         days_of_week,
         planned_start_time::TEXT AS planned_start_time,
         planned_end_time::TEXT AS planned_end_time,
         effective_from,
         effective_to,
         status,
         note,
         created_by_account_id,
         updated_by_account_id,
         deactivated_at,
         created_at,
         updated_at`,
      [input.patternId, input.tenantId, input.actorAccountId]
    );
    return result.rows[0] ?? null;
  }

  async listShiftPatterns(input: {
    tenantId: string;
    branchId: string | null;
    membershipId: string | null;
    fromDate: string | null;
    toDate: string | null;
    status: V0ShiftPatternStatus | null;
    limit: number;
    offset: number;
  }): Promise<V0ShiftPatternRow[]> {
    const result = await this.db.query<V0ShiftPatternRow>(
      `SELECT
         id,
         tenant_id,
         membership_id,
         branch_id,
         days_of_week,
         planned_start_time::TEXT AS planned_start_time,
         planned_end_time::TEXT AS planned_end_time,
         effective_from,
         effective_to,
         status,
         note,
         created_by_account_id,
         updated_by_account_id,
         deactivated_at,
         created_at,
         updated_at
       FROM v0_shift_patterns
       WHERE tenant_id = $1
         AND ($2::UUID IS NULL OR branch_id = $2)
         AND ($3::UUID IS NULL OR membership_id = $3)
         AND ($4::DATE IS NULL OR COALESCE(effective_to, DATE '9999-12-31') >= $4::DATE)
         AND ($5::DATE IS NULL OR COALESCE(effective_from, DATE '0001-01-01') <= $5::DATE)
         AND ($6::VARCHAR IS NULL OR status = $6)
       ORDER BY updated_at DESC, id DESC
       LIMIT $7
       OFFSET $8`,
      [
        input.tenantId,
        input.branchId,
        input.membershipId,
        input.fromDate,
        input.toDate,
        input.status,
        input.limit,
        input.offset,
      ]
    );
    return result.rows;
  }

  async findShiftInstanceByIdInTenant(input: {
    instanceId: string;
    tenantId: string;
  }): Promise<V0ShiftInstanceRow | null> {
    const result = await this.db.query<V0ShiftInstanceRow>(
      `SELECT
         id,
         tenant_id,
         membership_id,
         branch_id,
         pattern_id,
         shift_date,
         planned_start_time::TEXT AS planned_start_time,
         planned_end_time::TEXT AS planned_end_time,
         status,
         note,
         cancelled_reason,
         created_by_account_id,
         updated_by_account_id,
         cancelled_at,
         created_at,
         updated_at
       FROM v0_shift_instances
       WHERE id = $1
         AND tenant_id = $2`,
      [input.instanceId, input.tenantId]
    );
    return result.rows[0] ?? null;
  }

  async insertShiftInstance(input: {
    tenantId: string;
    membershipId: string;
    branchId: string;
    patternId: string | null;
    shiftDate: string;
    plannedStartTime: string;
    plannedEndTime: string;
    note: string | null;
    actorAccountId: string | null;
  }): Promise<V0ShiftInstanceRow> {
    const result = await this.db.query<V0ShiftInstanceRow>(
      `INSERT INTO v0_shift_instances (
         tenant_id,
         membership_id,
         branch_id,
         pattern_id,
         shift_date,
         planned_start_time,
         planned_end_time,
         status,
         note,
         created_by_account_id,
         updated_by_account_id
       )
       VALUES ($1, $2, $3, $4, $5::DATE, $6::TIME, $7::TIME, 'PLANNED', $8, $9, $9)
       RETURNING
         id,
         tenant_id,
         membership_id,
         branch_id,
         pattern_id,
         shift_date,
         planned_start_time::TEXT AS planned_start_time,
         planned_end_time::TEXT AS planned_end_time,
         status,
         note,
         cancelled_reason,
         created_by_account_id,
         updated_by_account_id,
         cancelled_at,
         created_at,
         updated_at`,
      [
        input.tenantId,
        input.membershipId,
        input.branchId,
        input.patternId,
        input.shiftDate,
        input.plannedStartTime,
        input.plannedEndTime,
        input.note,
        input.actorAccountId,
      ]
    );
    return result.rows[0];
  }

  async updateShiftInstance(input: {
    instanceId: string;
    tenantId: string;
    membershipId: string;
    branchId: string;
    shiftDate: string;
    plannedStartTime: string;
    plannedEndTime: string;
    note: string | null;
    actorAccountId: string | null;
  }): Promise<V0ShiftInstanceRow | null> {
    const result = await this.db.query<V0ShiftInstanceRow>(
      `UPDATE v0_shift_instances
       SET membership_id = $3,
           branch_id = $4,
           shift_date = $5::DATE,
           planned_start_time = $6::TIME,
           planned_end_time = $7::TIME,
           status = 'UPDATED',
           note = $8,
           updated_by_account_id = $9,
           updated_at = NOW()
       WHERE id = $1
         AND tenant_id = $2
       RETURNING
         id,
         tenant_id,
         membership_id,
         branch_id,
         pattern_id,
         shift_date,
         planned_start_time::TEXT AS planned_start_time,
         planned_end_time::TEXT AS planned_end_time,
         status,
         note,
         cancelled_reason,
         created_by_account_id,
         updated_by_account_id,
         cancelled_at,
         created_at,
         updated_at`,
      [
        input.instanceId,
        input.tenantId,
        input.membershipId,
        input.branchId,
        input.shiftDate,
        input.plannedStartTime,
        input.plannedEndTime,
        input.note,
        input.actorAccountId,
      ]
    );
    return result.rows[0] ?? null;
  }

  async cancelShiftInstance(input: {
    instanceId: string;
    tenantId: string;
    reason: string | null;
    actorAccountId: string | null;
  }): Promise<V0ShiftInstanceRow | null> {
    const result = await this.db.query<V0ShiftInstanceRow>(
      `UPDATE v0_shift_instances
       SET status = 'CANCELLED',
           cancelled_reason = $3,
           cancelled_at = COALESCE(cancelled_at, NOW()),
           updated_by_account_id = $4,
           updated_at = NOW()
       WHERE id = $1
         AND tenant_id = $2
       RETURNING
         id,
         tenant_id,
         membership_id,
         branch_id,
         pattern_id,
         shift_date,
         planned_start_time::TEXT AS planned_start_time,
         planned_end_time::TEXT AS planned_end_time,
         status,
         note,
         cancelled_reason,
         created_by_account_id,
         updated_by_account_id,
         cancelled_at,
         created_at,
         updated_at`,
      [input.instanceId, input.tenantId, input.reason, input.actorAccountId]
    );
    return result.rows[0] ?? null;
  }

  async listShiftInstances(input: {
    tenantId: string;
    branchId: string | null;
    membershipId: string | null;
    fromDate: string | null;
    toDate: string | null;
    status: V0ShiftInstanceStatus | null;
    limit: number;
    offset: number;
  }): Promise<V0ShiftInstanceRow[]> {
    const result = await this.db.query<V0ShiftInstanceRow>(
      `SELECT
         id,
         tenant_id,
         membership_id,
         branch_id,
         pattern_id,
         shift_date,
         planned_start_time::TEXT AS planned_start_time,
         planned_end_time::TEXT AS planned_end_time,
         status,
         note,
         cancelled_reason,
         created_by_account_id,
         updated_by_account_id,
         cancelled_at,
         created_at,
         updated_at
       FROM v0_shift_instances
       WHERE tenant_id = $1
         AND ($2::UUID IS NULL OR branch_id = $2)
         AND ($3::UUID IS NULL OR membership_id = $3)
         AND ($4::DATE IS NULL OR shift_date >= $4::DATE)
         AND ($5::DATE IS NULL OR shift_date <= $5::DATE)
         AND ($6::VARCHAR IS NULL OR status = $6)
       ORDER BY shift_date ASC, planned_start_time ASC, id ASC
       LIMIT $7
       OFFSET $8`,
      [
        input.tenantId,
        input.branchId,
        input.membershipId,
        input.fromDate,
        input.toDate,
        input.status,
        input.limit,
        input.offset,
      ]
    );
    return result.rows;
  }
}
